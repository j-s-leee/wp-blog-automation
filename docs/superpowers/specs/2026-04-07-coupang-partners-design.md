# Phase 2: 쿠팡 파트너스 모듈 설계서

## 목표

블로그 글 생성 시 키워드 관련 쿠팡 상품을 자동으로 검색하여 본문에 어필리에이트 링크를 삽입하고, 글 하단에 추천 상품 카드 + 다이나믹 배너를 추가한다.

## 핵심 제약 사항

- **API 호출 제한**: 상품 검색 API는 **시간당 10회**. 3회 연속 403 시 24시간 정지.
- **검색 결과**: 1회 호출당 최대 10개 상품 반환.
- **가격 필터링 미지원**: `minPrice`, `maxPrice` 파라미터는 무시됨.
- **HMAC 서명 유효시간**: 5분.

## 아키텍처

### 설정 시트 변경

기존 "설정" 시트에 Row 6~10 추가:

| Row | A열 (라벨) | B열 (값) |
|-----|-----------|---------|
| 6 | 쿠팡 Access Key | `<access_key>` |
| 7 | 쿠팡 Secret Key | `<secret_key>` |
| 8 | 쿠팡 파트너 ID | `af~` |
| 9 | 쿠팡 Sub ID | `<channel_id>` |
| 10 | 쿠팡 다이나믹 배너 코드 | `<script>...</script>` or `<iframe>...</iframe>` |

### 신규 파일

#### CoupangAPI.gs — API 통신 모듈

**역할**: HMAC 인증, 상품 검색 API 호출

**함수 목록**:

```
generateCoupangHmac(method, url, secretKey, accessKey)
  - UTC 시간을 yyMMddTHHmmssZ 형식으로 생성
  - message = datetime + method + path + queryString
  - Utilities.computeHmacSha256Signature()로 HMAC-SHA256 서명
  - "CEA algorithm=HmacSHA256, access-key=..., signed-date=..., signature=..." 반환

searchCoupangProducts(keyword, config)
  - GET /v2/providers/affiliate_open_api/apis/openapi/products/search?keyword={keyword}&limit=5
  - HMAC 인증 헤더 포함
  - 응답에서 productData 배열 추출
  - 각 상품: { productName, productPrice, productImage, productUrl, isRocket }
  - 에러 처리: 403 → 로그 남기고 빈 배열 반환 (글 생성은 계속 진행)
  - 반환: 상품 배열 (최대 5개)
```

**API 상세**:
- Base URL: `https://api-gateway.coupang.com`
- 검색 엔드포인트: `/v2/providers/affiliate_open_api/apis/openapi/products/search`
- 인증 헤더: `Authorization: CEA algorithm=HmacSHA256, access-key={accessKey}, signed-date={datetime}, signature={signature}`
- Content-Type: `application/json;charset=UTF-8`
- 응답의 `productUrl`은 이미 어필리에이트 링크 → 딥링크 API 별도 호출 불필요

#### CoupangBanner.gs — HTML 생성 + 본문 삽입 모듈

**역할**: 상품 데이터를 HTML로 변환, 본문에 삽입

**함수 목록**:

```
insertCoupangTextLinks(content, products)
  - 상위 1-2개 상품을 본문 중간에 텍스트 링크로 삽입
  - </p> 태그 기준으로 글 중반부(40-60% 지점)에 자연스럽게 배치
  - 형식: <p>👉 <a href="{productUrl}" target="_blank" rel="noopener">{productName}</a> — {formattedPrice}원</p>
  - 반환: 링크가 삽입된 content

buildProductCards(products)
  - 상위 3개 상품을 HTML 카드 섹션으로 생성
  - 각 카드: 상품 이미지 + 상품명 + 가격 + 로켓배송 뱃지 + 구매 링크 버튼
  - 반응형 CSS 인라인 스타일 (이메일/WP 호환)
  - 반환: <div class="coupang-products">...</div> HTML 문자열

buildDynamicBanner(bannerCode)
  - 설정 시트의 배너 코드를 래핑
  - 반환: <div class="coupang-banner">...</div> HTML 문자열

assembleCoupangSection(products, bannerCode)
  - 추천 상품 카드 + 다이나믹 배너를 합쳐서 하단 섹션 구성
  - 쿠팡 파트너스 활동 문구 포함: "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
  - 반환: 하단 전체 HTML

insertCoupangContent(content, products, bannerCode)
  - 메인 통합 함수
  - 1) insertCoupangTextLinks로 본문 중간에 텍스트 링크 삽입
  - 2) assembleCoupangSection으로 하단 섹션 생성
  - 3) content 끝에 하단 섹션 붙이기
  - 반환: 최종 content
```

### 기존 파일 변경

#### Config.gs

```
getConfig() — 읽는 범위를 A1:B5 → A1:B10으로 확장
  - config.coupangAccessKey (Row 6)
  - config.coupangSecretKey (Row 7)
  - config.coupangPartnerId (Row 8)
  - config.coupangSubId (Row 9)
  - config.coupangBannerCode (Row 10)

hasCoupangConfig() — 신규 함수
  - Access Key + Secret Key 존재 여부 체크
```

#### Main.gs

`processRow()` 함수에 쿠팡 상품 삽입 단계 추가:

```
기존 흐름:
  1. 텍스트 생성
  2. 이미지 검색/삽입
  3. WordPress 포스팅

변경 흐름:
  1. 텍스트 생성
  2. 이미지 검색/삽입
  3. ★ 쿠팡 상품 검색 + 본문 삽입 (신규)
  4. WordPress 포스팅
```

쿠팡 단계 상세:
- `hasCoupangConfig()` 체크 → 미설정이면 건너뜀
- `searchCoupangProducts(keyword, config)` 호출
- 결과가 있으면 `insertCoupangContent(content, products, bannerCode)` 호출
- API 실패해도 글 생성은 중단하지 않음 (쿠팡 없이 포스팅)

`checkSettings()` 함수에 쿠팡 설정 상태 표시 추가.

#### Tests.gs

```
testCoupangHmac() — HMAC 서명 생성 테스트
testCoupangSearch() — 상품 검색 API 호출 테스트
testCoupangBanner() — HTML 카드/배너 생성 테스트
testCoupangIntegration() — 본문 삽입 통합 테스트
```

### 상품 카드 HTML 디자인

```html
<div style="margin: 30px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa;">
  <h3 style="margin-top: 0;">🛒 추천 상품</h3>
  
  <!-- 상품 카드 반복 -->
  <div style="display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee;">
    <img src="{productImage}" alt="{productName}" style="width: 100px; height: 100px; object-fit: contain; margin-right: 15px;" />
    <div>
      <a href="{productUrl}" target="_blank" rel="noopener" style="font-weight: bold; color: #333; text-decoration: none;">{productName}</a>
      <p style="color: #e74c3c; font-size: 18px; margin: 5px 0;">{formattedPrice}원</p>
      {isRocket ? '<span style="background: #00a0e0; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">🚀 로켓배송</span>' : ''}
    </div>
  </div>
  
  <p style="font-size: 12px; color: #999; margin-top: 15px;">이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
</div>
```

## 에러 처리 전략

| 상황 | 처리 |
|------|------|
| 쿠팡 설정 미입력 | 쿠팡 단계 건너뜀, 글은 정상 생성 |
| API 403 (Rate Limit) | 로그 남기고 쿠팡 없이 포스팅 |
| API 응답 파싱 실패 | 로그 남기고 쿠팡 없이 포스팅 |
| 검색 결과 0건 | 쿠팡 섹션 미삽입, 글은 정상 생성 |
| 배너 코드 미입력 | 상품 카드만 삽입, 배너 생략 |

핵심 원칙: **쿠팡 모듈 실패가 글 생성을 중단시키지 않는다.**

## Rate Limit 대응

- 시간당 10회 제한 → 10분 간격 자동 실행 기준 시간당 최대 6개 키워드 처리
- 각 키워드당 1회 API 호출이므로 제한 내에서 운영 가능
- 403 발생 시 해당 글은 쿠팡 없이 포스팅하고, 다음 글에서 재시도
- 연속 403 방지를 위해 403 발생 시 이후 키워드에서도 쿠팡 호출 스킵 (해당 실행 세션 한정)

## 파일 의존성

```
Config.gs ← CoupangAPI.gs (인증 정보)
Config.gs ← CoupangBanner.gs (배너 코드)
Utils.gs  ← CoupangAPI.gs (에러 핸들링)
CoupangAPI.gs ← CoupangBanner.gs (상품 데이터)
CoupangAPI.gs + CoupangBanner.gs ← Main.gs (오케스트레이션)
전체 ← Tests.gs
```
