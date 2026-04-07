# Phase 2: 쿠팡 파트너스 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블로그 글 생성 시 쿠팡 파트너스 API로 관련 상품을 검색하여 본문에 텍스트 링크 + 하단 상품 카드 + 다이나믹 배너를 자동 삽입한다.

**Architecture:** Config.gs에 쿠팡 인증 정보를 추가하고, CoupangAPI.gs가 HMAC 인증 + 상품 검색을 담당하며, CoupangBanner.gs가 HTML 생성 + 본문 삽입을 처리한다. Main.gs의 processRow()에 쿠팡 단계를 추가하여 기존 흐름에 통합한다. 쿠팡 모듈 실패 시 글 생성은 중단하지 않는다.

**Tech Stack:** Google Apps Script, 쿠팡 파트너스 Open API (HMAC-SHA256), UrlFetchApp

**Testing approach:** Apps Script는 로컬 실행이 불가하므로 Tests.gs에 테스트 함수를 작성하고 Google Sheets Script Editor에서 수동 실행하여 Logger.log로 결과 확인.

---

## File Structure

```
apps-script/src/
├── Config.gs          # 수정: 쿠팡 설정 읽기 추가 (Row 6-10)
├── CoupangAPI.gs      # 신규: HMAC 인증 + 상품 검색
├── CoupangBanner.gs   # 신규: HTML 생성 + 본문 삽입
├── Main.gs            # 수정: processRow에 쿠팡 단계 추가
├── Tests.gs           # 수정: 쿠팡 테스트 함수 추가
├── GeminiAPI.gs       # 변경 없음
├── ImageSearch.gs     # 변경 없음
├── Prompts.gs         # 변경 없음
├── Utils.gs           # 변경 없음
└── WordPress.gs       # 변경 없음
```

**각 파일의 역할:**

| 파일 | 역할 | 의존성 |
|------|------|--------|
| Config.gs | 설정 시트에서 쿠팡 인증 정보 읽기 | 없음 |
| CoupangAPI.gs | HMAC 서명 생성, 상품 검색 API 호출 | Config.gs, Utils.gs |
| CoupangBanner.gs | 텍스트 링크/상품 카드/배너 HTML 생성, 본문 삽입 | 없음 (순수 HTML 생성) |
| Main.gs | 쿠팡 단계를 processRow 흐름에 통합 | CoupangAPI.gs, CoupangBanner.gs |
| Tests.gs | 쿠팡 모듈 테스트 함수 | 전체 |

---

### Task 1: Config.gs — 쿠팡 설정 읽기 추가

**Files:**
- Modify: `apps-script/src/Config.gs`

- [ ] **Step 1: getConfig() 범위 확장 — A1:B5 → A1:B10**

`apps-script/src/Config.gs`의 `getConfig()` 함수를 수정한다. 기존 `A1:B5` 범위를 `A1:B10`으로 확장하고 쿠팡 설정 필드를 추가한다.

기존 코드:

```javascript
  // Get the range with all settings (A:B, rows 1-5)
  var data = sheet.getRange('A1:B5').getValues();

  // Parse the settings from rows
  var config = {
    geminiApiKey: data[0][1] || '',        // Row 1, Column B
    wpUrl: data[1][1] || '',               // Row 2, Column B
    wpUser: data[2][1] || '',              // Row 3, Column B
    wpAppPassword: data[3][1] || '',       // Row 4, Column B
    pexelsApiKey: data[4][1] || ''         // Row 5, Column B
  };
```

변경할 코드:

```javascript
  // Get the range with all settings (A:B, rows 1-10)
  var data = sheet.getRange('A1:B10').getValues();

  // Parse the settings from rows
  var config = {
    geminiApiKey: data[0][1] || '',        // Row 1, Column B
    wpUrl: data[1][1] || '',               // Row 2, Column B
    wpUser: data[2][1] || '',              // Row 3, Column B
    wpAppPassword: data[3][1] || '',       // Row 4, Column B
    pexelsApiKey: data[4][1] || '',        // Row 5, Column B
    coupangAccessKey: data[5][1] || '',    // Row 6, Column B
    coupangSecretKey: data[6][1] || '',    // Row 7, Column B
    coupangPartnerId: data[7][1] || '',    // Row 8, Column B
    coupangSubId: data[8][1] || '',        // Row 9, Column B
    coupangBannerCode: data[9][1] || ''    // Row 10, Column B
  };
```

- [ ] **Step 2: hasCoupangConfig() 함수 추가**

`apps-script/src/Config.gs` 파일 끝에 추가한다:

```javascript
/**
 * Checks if Coupang Partners API configuration is complete.
 * @return {boolean} true if Access Key and Secret Key are configured
 */
function hasCoupangConfig() {
  var config = getConfig();
  return (
    !!config.coupangAccessKey && config.coupangAccessKey.trim().length > 0 &&
    !!config.coupangSecretKey && config.coupangSecretKey.trim().length > 0
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add apps-script/src/Config.gs
git commit -m "feat: Config.gs에 쿠팡 파트너스 설정 읽기 추가"
```

---

### Task 2: CoupangAPI.gs — HMAC 인증 + 상품 검색

**Files:**
- Create: `apps-script/src/CoupangAPI.gs`

- [ ] **Step 1: CoupangAPI.gs 작성 — HMAC 서명 생성 함수**

`apps-script/src/CoupangAPI.gs` 파일을 생성한다:

```javascript
/**
 * CoupangAPI.gs — 쿠팡 파트너스 Open API 통신 모듈
 * HMAC-SHA256 인증 및 상품 검색 API 호출
 *
 * API 제약:
 * - 상품 검색: 시간당 10회 제한
 * - 3회 연속 403 시 24시간 정지
 * - HMAC 서명 유효시간: 5분
 */

var COUPANG_API_BASE_URL = 'https://api-gateway.coupang.com';
var COUPANG_SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

/**
 * 쿠팡 Open API용 HMAC-SHA256 인증 헤더를 생성한다.
 *
 * @param {string} method - HTTP 메서드 (GET, POST)
 * @param {string} path - URL 경로 (쿼리 스트링 제외)
 * @param {string} queryString - 쿼리 스트링 (? 제외, 없으면 빈 문자열)
 * @param {string} secretKey - 쿠팡 Secret Key
 * @param {string} accessKey - 쿠팡 Access Key
 * @return {string} Authorization 헤더 값
 */
function generateCoupangHmac(method, path, queryString, secretKey, accessKey) {
  var now = new Date();
  var pad = function(n) { return String(n).length < 2 ? '0' + n : String(n); };
  var yy = String(now.getUTCFullYear()).slice(2);
  var datetime = yy + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) +
                 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) +
                 pad(now.getUTCSeconds()) + 'Z';

  var message = datetime + method + path + queryString;

  var signatureBytes = Utilities.computeHmacSha256Signature(message, secretKey);
  var signature = signatureBytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');

  return 'CEA algorithm=HmacSHA256, access-key=' + accessKey +
         ', signed-date=' + datetime +
         ', signature=' + signature;
}
```

- [ ] **Step 2: 상품 검색 함수 추가**

`apps-script/src/CoupangAPI.gs` 파일 끝에 추가한다:

```javascript
/**
 * 쿠팡 파트너스 API로 키워드 관련 상품을 검색한다.
 *
 * @param {string} keyword - 검색 키워드
 * @param {Object} config - getConfig()에서 반환된 설정 객체
 * @return {Array<{productName: string, productPrice: number, productImage: string, productUrl: string, isRocket: boolean}>}
 *         상품 배열 (최대 5개). API 실패 시 빈 배열 반환.
 */
function searchCoupangProducts(keyword, config) {
  var queryString = 'keyword=' + encodeURIComponent(keyword) + '&limit=5';
  var fullUrl = COUPANG_API_BASE_URL + COUPANG_SEARCH_PATH + '?' + queryString;

  var authHeader = generateCoupangHmac(
    'GET',
    COUPANG_SEARCH_PATH,
    queryString,
    config.coupangSecretKey,
    config.coupangAccessKey
  );

  var options = {
    method: 'get',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json;charset=UTF-8'
    },
    muteHttpExceptions: true
  };

  var response;
  try {
    response = UrlFetchApp.fetch(fullUrl, options);
  } catch (e) {
    Logger.log('쿠팡 API 네트워크 오류: ' + e.message);
    return [];
  }

  var statusCode = response.getResponseCode();

  if (statusCode === 403) {
    Logger.log('⚠️ 쿠팡 API 호출 제한 (403). 이번 글은 쿠팡 없이 진행합니다.');
    return [];
  }

  if (statusCode !== 200) {
    Logger.log('쿠팡 API 오류 (HTTP ' + statusCode + '): ' + response.getContentText());
    return [];
  }

  var json;
  try {
    json = JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('쿠팡 API 응답 파싱 실패: ' + e.message);
    return [];
  }

  if (json.rCode !== '0' || !json.data || !json.data.productData) {
    Logger.log('쿠팡 API 응답 오류 (rCode: ' + json.rCode + ')');
    return [];
  }

  var products = [];
  var productData = json.data.productData;

  for (var i = 0; i < productData.length && i < 5; i++) {
    var p = productData[i];
    products.push({
      productName: p.productName || '',
      productPrice: p.productPrice || 0,
      productImage: p.productImage || '',
      productUrl: p.productUrl || '',
      isRocket: !!p.isRocket
    });
  }

  Logger.log('쿠팡 검색 완료: "' + keyword + '" → ' + products.length + '개 상품');
  return products;
}
```

- [ ] **Step 3: 커밋**

```bash
git add apps-script/src/CoupangAPI.gs
git commit -m "feat: CoupangAPI.gs — HMAC 인증 + 상품 검색 API"
```

---

### Task 3: CoupangBanner.gs — HTML 생성 + 본문 삽입

**Files:**
- Create: `apps-script/src/CoupangBanner.gs`

- [ ] **Step 1: CoupangBanner.gs 작성 — 가격 포맷팅 + 텍스트 링크 삽입**

`apps-script/src/CoupangBanner.gs` 파일을 생성한다:

```javascript
/**
 * CoupangBanner.gs — 쿠팡 상품 HTML 생성 + 본문 삽입 모듈
 * 텍스트 링크, 상품 카드, 다이나믹 배너를 생성하고 블로그 본문에 삽입한다.
 */

/**
 * 숫자를 한국식 가격 형식으로 포맷팅한다. (예: 29900 → "29,900")
 * @param {number} price - 상품 가격
 * @return {string} 포맷팅된 가격 문자열
 */
function formatCoupangPrice(price) {
  return String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 상위 1-2개 상품을 본문 중간(40-60% 지점)에 텍스트 링크로 삽입한다.
 *
 * </p> 태그를 기준으로 글의 중반부를 찾아 자연스럽게 배치한다.
 *
 * @param {string} content - 블로그 HTML 본문
 * @param {Array} products - searchCoupangProducts()가 반환한 상품 배열
 * @return {string} 텍스트 링크가 삽입된 content
 */
function insertCoupangTextLinks(content, products) {
  if (!products || products.length === 0) {
    return content;
  }

  // </p> 태그 위치를 모두 찾는다
  var closingTags = [];
  var searchStr = '</p>';
  var idx = 0;
  while ((idx = content.indexOf(searchStr, idx)) !== -1) {
    closingTags.push(idx + searchStr.length);
    idx += searchStr.length;
  }

  if (closingTags.length === 0) {
    return content;
  }

  // 40-60% 지점의 </p> 태그를 찾는다
  var targetIndex = Math.floor(closingTags.length * 0.5);
  var insertPos = closingTags[Math.min(targetIndex, closingTags.length - 1)];

  // 텍스트 링크 HTML 생성 (최대 2개)
  var linkCount = Math.min(products.length, 2);
  var linkHtml = '\n';

  for (var i = 0; i < linkCount; i++) {
    var p = products[i];
    var formattedPrice = formatCoupangPrice(p.productPrice);
    linkHtml += '<p style="background: #f8f9fa; padding: 12px 16px; border-left: 4px solid #00a0e0; margin: 15px 0;">';
    linkHtml += '👉 <a href="' + p.productUrl + '" target="_blank" rel="noopener noreferrer" ';
    linkHtml += 'style="color: #1a73e8; font-weight: bold; text-decoration: none;">';
    linkHtml += p.productName + '</a>';
    linkHtml += ' — <strong style="color: #e74c3c;">' + formattedPrice + '원</strong>';
    if (p.isRocket) {
      linkHtml += ' <span style="background: #00a0e0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 11px;">🚀 로켓배송</span>';
    }
    linkHtml += '</p>\n';
  }

  // 삽입
  return content.slice(0, insertPos) + linkHtml + content.slice(insertPos);
}
```

- [ ] **Step 2: 상품 카드 섹션 생성 함수 추가**

`apps-script/src/CoupangBanner.gs` 파일 끝에 추가한다:

```javascript
/**
 * 상위 3개 상품을 HTML 카드 섹션으로 생성한다.
 *
 * @param {Array} products - searchCoupangProducts()가 반환한 상품 배열
 * @return {string} 상품 카드 HTML. 상품이 없으면 빈 문자열.
 */
function buildProductCards(products) {
  if (!products || products.length === 0) {
    return '';
  }

  var cardCount = Math.min(products.length, 3);

  var html = '<div style="margin: 30px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa;">\n';
  html += '<h3 style="margin-top: 0; font-size: 18px; color: #333;">🛒 추천 상품</h3>\n';

  for (var i = 0; i < cardCount; i++) {
    var p = products[i];
    var formattedPrice = formatCoupangPrice(p.productPrice);
    var isLast = (i === cardCount - 1);

    html += '<div style="display: flex; align-items: center; padding: 15px 0;';
    if (!isLast) {
      html += ' border-bottom: 1px solid #eee;';
    }
    html += '">\n';

    // 상품 이미지
    html += '  <a href="' + p.productUrl + '" target="_blank" rel="noopener noreferrer" style="flex-shrink: 0;">';
    html += '<img src="' + p.productImage + '" alt="' + p.productName + '" ';
    html += 'style="width: 100px; height: 100px; object-fit: contain; border-radius: 4px;" />';
    html += '</a>\n';

    // 상품 정보
    html += '  <div style="margin-left: 15px; flex: 1;">\n';
    html += '    <a href="' + p.productUrl + '" target="_blank" rel="noopener noreferrer" ';
    html += 'style="font-weight: bold; color: #333; text-decoration: none; font-size: 14px; line-height: 1.4;">';
    html += p.productName + '</a>\n';
    html += '    <p style="color: #e74c3c; font-size: 18px; font-weight: bold; margin: 5px 0;">' + formattedPrice + '원</p>\n';

    if (p.isRocket) {
      html += '    <span style="background: #00a0e0; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">🚀 로켓배송</span>\n';
    }

    html += '  </div>\n';
    html += '</div>\n';
  }

  html += '</div>\n';

  return html;
}

/**
 * 다이나믹 배너 코드를 div로 래핑한다.
 *
 * @param {string} bannerCode - 쿠팡 파트너스에서 발급받은 배너 HTML 코드
 * @return {string} 래핑된 배너 HTML. 배너 코드가 없으면 빈 문자열.
 */
function buildDynamicBanner(bannerCode) {
  if (!bannerCode || bannerCode.trim().length === 0) {
    return '';
  }

  var html = '<div style="margin: 20px 0; text-align: center;">\n';
  html += bannerCode + '\n';
  html += '</div>\n';

  return html;
}
```

- [ ] **Step 3: 통합 조립 함수 추가**

`apps-script/src/CoupangBanner.gs` 파일 끝에 추가한다:

```javascript
/**
 * 추천 상품 카드 + 다이나믹 배너 + 파트너스 문구를 합쳐서 하단 섹션을 구성한다.
 *
 * @param {Array} products - searchCoupangProducts()가 반환한 상품 배열
 * @param {string} bannerCode - 다이나믹 배너 HTML 코드 (없으면 빈 문자열)
 * @return {string} 하단 전체 HTML
 */
function assembleCoupangSection(products, bannerCode) {
  var html = '\n<hr style="border: none; border-top: 1px solid #eee; margin: 40px 0 20px 0;" />\n';

  // 상품 카드
  var cards = buildProductCards(products);
  if (cards) {
    html += cards;
  }

  // 다이나믹 배너
  var banner = buildDynamicBanner(bannerCode);
  if (banner) {
    html += banner;
  }

  // 파트너스 활동 문구 (필수)
  html += '<p style="font-size: 12px; color: #999; text-align: center; margin-top: 20px;">';
  html += '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  html += '</p>\n';

  return html;
}

/**
 * 메인 통합 함수 — 본문에 쿠팡 텍스트 링크 + 하단 섹션을 모두 삽입한다.
 *
 * @param {string} content - 블로그 HTML 본문
 * @param {Array} products - searchCoupangProducts()가 반환한 상품 배열
 * @param {string} bannerCode - 다이나믹 배너 HTML 코드 (없으면 빈 문자열)
 * @return {string} 쿠팡 콘텐츠가 삽입된 최종 본문
 */
function insertCoupangContent(content, products, bannerCode) {
  if (!products || products.length === 0) {
    return content;
  }

  // 1) 본문 중간에 텍스트 링크 삽입
  var withLinks = insertCoupangTextLinks(content, products);

  // 2) 하단 섹션 생성 + 본문 끝에 추가
  var bottomSection = assembleCoupangSection(products, bannerCode);
  var finalContent = withLinks + bottomSection;

  return finalContent;
}
```

- [ ] **Step 4: 커밋**

```bash
git add apps-script/src/CoupangBanner.gs
git commit -m "feat: CoupangBanner.gs — 상품 카드/텍스트 링크/배너 HTML 생성"
```

---

### Task 4: Main.gs — processRow에 쿠팡 단계 추가

**Files:**
- Modify: `apps-script/src/Main.gs`

- [ ] **Step 1: processRow()에 쿠팡 상품 검색 + 삽입 단계 추가**

`apps-script/src/Main.gs`의 `processRow()` 함수에서, 이미지 검색 단계(주석 `--- 2.`) 이후, 포스팅 단계(주석 `--- 3.`) 이전에 쿠팡 단계를 삽입한다.

기존 코드 (Main.gs:83-93):

```javascript
    // --- 3. Publish ---
    var postingResult = '';

    if (needsPosting) {
      if (hasWordPressConfig()) {
        postingResult = publishToWordPress(title, content, null, row.keyword, config);
      } else {
        postingResult = '⚠️ WordPress 설정이 없어 포스팅을 건너뜀. "설정" 시트에서 WordPress 정보를 입력해 주세요.';
      }
    }
```

변경할 코드:

```javascript
    // --- 3. 쿠팡 파트너스 상품 삽입 ---
    if (hasCoupangConfig()) {
      try {
        var coupangProducts = searchCoupangProducts(row.keyword, config);
        if (coupangProducts.length > 0) {
          content = insertCoupangContent(content, coupangProducts, config.coupangBannerCode);
          Logger.log('쿠팡 상품 ' + coupangProducts.length + '개 삽입 완료');
        } else {
          Logger.log('쿠팡 검색 결과 없음 — 쿠팡 없이 진행');
        }
      } catch (e) {
        Logger.log('⚠️ 쿠팡 모듈 오류 (글 생성은 계속): ' + e.message);
      }
    }

    // --- 4. Publish ---
    var postingResult = '';

    if (needsPosting) {
      if (hasWordPressConfig()) {
        postingResult = publishToWordPress(title, content, null, row.keyword, config);
      } else {
        postingResult = '⚠️ WordPress 설정이 없어 포스팅을 건너뜀. "설정" 시트에서 WordPress 정보를 입력해 주세요.';
      }
    }
```

- [ ] **Step 2: checkSettings()에 쿠팡 설정 상태 추가**

`apps-script/src/Main.gs`의 `checkSettings()` 함수를 수정한다.

기존 코드 (Main.gs:147-158):

```javascript
function checkSettings() {
  var geminiOk  = hasGeminiKey();
  var pexelsOk  = hasPexelsKey();
  var wpOk      = hasWordPressConfig();

  var message =
    '=== 설정 상태 ===\n\n' +
    'Gemini API 키: ' + (geminiOk ? '✅ 설정됨' : '❌ 미설정') + '\n' +
    'Pexels API 키: ' + (pexelsOk ? '✅ 설정됨' : 'ℹ️ 미설정 (이미지 자동 삽입 불가)') + '\n' +
    'WordPress 연동: ' + (wpOk ? '✅ 설정됨' : 'ℹ️ 미설정 (자동 포스팅 불가)');

  SpreadsheetApp.getUi().alert(message);
}
```

변경할 코드:

```javascript
function checkSettings() {
  var geminiOk  = hasGeminiKey();
  var pexelsOk  = hasPexelsKey();
  var wpOk      = hasWordPressConfig();
  var coupangOk = hasCoupangConfig();

  var message =
    '=== 설정 상태 ===\n\n' +
    'Gemini API 키: ' + (geminiOk ? '✅ 설정됨' : '❌ 미설정') + '\n' +
    'Pexels API 키: ' + (pexelsOk ? '✅ 설정됨' : 'ℹ️ 미설정 (이미지 자동 삽입 불가)') + '\n' +
    'WordPress 연동: ' + (wpOk ? '✅ 설정됨' : 'ℹ️ 미설정 (자동 포스팅 불가)') + '\n' +
    '쿠팡 파트너스: ' + (coupangOk ? '✅ 설정됨' : 'ℹ️ 미설정 (상품 추천 불가)');

  SpreadsheetApp.getUi().alert(message);
}
```

- [ ] **Step 3: 커밋**

```bash
git add apps-script/src/Main.gs
git commit -m "feat: Main.gs — processRow에 쿠팡 상품 삽입 단계 추가"
```

---

### Task 5: Tests.gs — 쿠팡 모듈 테스트 함수 추가

**Files:**
- Modify: `apps-script/src/Tests.gs`

- [ ] **Step 1: 쿠팡 HMAC 서명 테스트 함수 추가**

`apps-script/src/Tests.gs` 파일 끝에 추가한다:

```javascript
// ==========================================
// 쿠팡 파트너스 모듈 테스트
// ==========================================

/**
 * HMAC 서명 생성 테스트.
 * Script Editor에서 실행 → View > Logs로 결과 확인.
 */
function testCoupangHmac() {
  Logger.log('=== 쿠팡 HMAC 서명 생성 테스트 ===');

  var testPath = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
  var testQuery = 'keyword=test&limit=5';
  var testSecret = 'test-secret-key';
  var testAccess = 'test-access-key';

  var authHeader = generateCoupangHmac('GET', testPath, testQuery, testSecret, testAccess);

  Logger.log('생성된 인증 헤더:');
  Logger.log(authHeader);

  // 형식 검증
  var hasAlgorithm = authHeader.indexOf('CEA algorithm=HmacSHA256') === 0;
  var hasAccessKey = authHeader.indexOf('access-key=test-access-key') !== -1;
  var hasSignedDate = authHeader.indexOf('signed-date=') !== -1;
  var hasSignature = authHeader.indexOf('signature=') !== -1;

  Logger.log('형식 검증:');
  Logger.log('  CEA algorithm 포함: ' + (hasAlgorithm ? '✅' : '❌'));
  Logger.log('  access-key 포함: ' + (hasAccessKey ? '✅' : '❌'));
  Logger.log('  signed-date 포함: ' + (hasSignedDate ? '✅' : '❌'));
  Logger.log('  signature 포함: ' + (hasSignature ? '✅' : '❌'));

  if (hasAlgorithm && hasAccessKey && hasSignedDate && hasSignature) {
    Logger.log('✅ HMAC 서명 생성 테스트 통과');
  } else {
    Logger.log('❌ HMAC 서명 생성 테스트 실패');
  }
}
```

- [ ] **Step 2: 쿠팡 상품 검색 API 테스트 함수 추가**

`apps-script/src/Tests.gs` 파일 끝에 추가한다:

```javascript
/**
 * 쿠팡 상품 검색 API 테스트.
 * ⚠️ 실제 API를 호출하므로 시간당 10회 제한에 주의.
 * Script Editor에서 실행 → View > Logs로 결과 확인.
 */
function testCoupangSearch() {
  Logger.log('=== 쿠팡 상품 검색 API 테스트 ===');

  if (!hasCoupangConfig()) {
    Logger.log('❌ 쿠팡 API 키가 설정되지 않았습니다. "설정" 시트에서 입력해 주세요.');
    return;
  }

  var config = getConfig();
  var keyword = '노트북';

  Logger.log('검색 키워드: ' + keyword);

  var products = searchCoupangProducts(keyword, config);

  Logger.log('검색 결과: ' + products.length + '개 상품');

  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    Logger.log('  [' + (i + 1) + '] ' + p.productName);
    Logger.log('      가격: ' + formatCoupangPrice(p.productPrice) + '원');
    Logger.log('      로켓배송: ' + (p.isRocket ? 'Y' : 'N'));
    Logger.log('      이미지: ' + p.productImage.substring(0, 50) + '...');
    Logger.log('      링크: ' + p.productUrl.substring(0, 50) + '...');
  }

  if (products.length > 0) {
    Logger.log('✅ 쿠팡 상품 검색 테스트 통과');
  } else {
    Logger.log('⚠️ 검색 결과 없음 — API 키 또는 네트워크 확인 필요');
  }
}
```

- [ ] **Step 3: 쿠팡 HTML 생성 테스트 함수 추가**

`apps-script/src/Tests.gs` 파일 끝에 추가한다:

```javascript
/**
 * 쿠팡 HTML 생성 테스트 (API 호출 없이 로컬 테스트).
 * Script Editor에서 실행 → View > Logs로 결과 확인.
 */
function testCoupangBanner() {
  Logger.log('=== 쿠팡 HTML 생성 테스트 ===');

  // 테스트용 더미 상품 데이터
  var testProducts = [
    { productName: '삼성 갤럭시 노트북', productPrice: 1290000, productImage: 'https://example.com/img1.jpg', productUrl: 'https://link.coupang.com/test1', isRocket: true },
    { productName: 'LG 그램 17인치', productPrice: 1590000, productImage: 'https://example.com/img2.jpg', productUrl: 'https://link.coupang.com/test2', isRocket: true },
    { productName: '레노버 씽크패드', productPrice: 890000, productImage: 'https://example.com/img3.jpg', productUrl: 'https://link.coupang.com/test3', isRocket: false }
  ];

  // 1) 가격 포맷팅 테스트
  var formatted = formatCoupangPrice(1290000);
  Logger.log('가격 포맷팅: 1290000 → ' + formatted + ' (' + (formatted === '1,290,000' ? '✅' : '❌') + ')');

  // 2) 텍스트 링크 삽입 테스트
  var testContent = '<p>첫 번째 문단입니다.</p><p>두 번째 문단입니다.</p><p>세 번째 문단입니다.</p><p>네 번째 문단입니다.</p>';
  var withLinks = insertCoupangTextLinks(testContent, testProducts);
  var hasTextLink = withLinks.indexOf('link.coupang.com') !== -1;
  Logger.log('텍스트 링크 삽입: ' + (hasTextLink ? '✅' : '❌'));

  // 3) 상품 카드 생성 테스트
  var cards = buildProductCards(testProducts);
  var hasCards = cards.indexOf('추천 상품') !== -1 && cards.indexOf('삼성 갤럭시') !== -1;
  Logger.log('상품 카드 생성: ' + (hasCards ? '✅' : '❌'));

  // 4) 다이나믹 배너 테스트
  var banner = buildDynamicBanner('<script>test</script>');
  var hasBanner = banner.indexOf('<script>test</script>') !== -1;
  Logger.log('다이나믹 배너: ' + (hasBanner ? '✅' : '❌'));

  // 5) 빈 배너 코드 테스트
  var emptyBanner = buildDynamicBanner('');
  Logger.log('빈 배너 코드 → 빈 문자열: ' + (emptyBanner === '' ? '✅' : '❌'));

  // 6) 통합 함수 테스트
  var finalContent = insertCoupangContent(testContent, testProducts, '<script>banner</script>');
  var hasAll = finalContent.indexOf('link.coupang.com') !== -1 &&
               finalContent.indexOf('추천 상품') !== -1 &&
               finalContent.indexOf('쿠팡 파트너스 활동') !== -1 &&
               finalContent.indexOf('<script>banner</script>') !== -1;
  Logger.log('통합 함수: ' + (hasAll ? '✅' : '❌'));

  // 7) 빈 상품 배열 테스트
  var noProducts = insertCoupangContent(testContent, [], '');
  Logger.log('빈 상품 배열 → 원본 유지: ' + (noProducts === testContent ? '✅' : '❌'));

  Logger.log('=== 쿠팡 HTML 생성 테스트 완료 ===');
}
```

- [ ] **Step 4: 쿠팡 통합 테스트 함수 추가**

`apps-script/src/Tests.gs` 파일 끝에 추가한다:

```javascript
/**
 * 쿠팡 파트너스 전체 통합 테스트.
 * 실제 API 호출 → HTML 생성 → 본문 삽입까지 E2E 테스트.
 * ⚠️ 실제 API를 호출하므로 시간당 10회 제한에 주의.
 */
function testCoupangIntegration() {
  Logger.log('=== 쿠팡 파트너스 통합 테스트 ===');

  if (!hasCoupangConfig()) {
    Logger.log('❌ 쿠팡 API 키가 설정되지 않았습니다.');
    return;
  }

  var config = getConfig();
  var keyword = '무선 이어폰';

  // 1) 상품 검색
  Logger.log('1) 상품 검색: "' + keyword + '"');
  var products = searchCoupangProducts(keyword, config);
  Logger.log('   결과: ' + products.length + '개');

  if (products.length === 0) {
    Logger.log('⚠️ 검색 결과 없음 — 통합 테스트 중단');
    return;
  }

  // 2) HTML 삽입
  var testContent = '<h1>무선 이어폰 추천</h1><p>요즘 무선 이어폰이 대세입니다.</p><p>다양한 제품을 비교해보겠습니다.</p><p>음질, 배터리, 착용감이 중요합니다.</p><p>가성비도 놓칠 수 없죠.</p>';

  Logger.log('2) HTML 삽입 테스트');
  var finalContent = insertCoupangContent(testContent, products, config.coupangBannerCode);

  // 3) 결과 검증
  var hasTextLinks = finalContent.indexOf('link.coupang.com') !== -1 || finalContent.indexOf('coupa.ng') !== -1;
  var hasProductCards = finalContent.indexOf('추천 상품') !== -1;
  var hasDisclosure = finalContent.indexOf('쿠팡 파트너스 활동') !== -1;

  Logger.log('   텍스트 링크: ' + (hasTextLinks ? '✅' : '❌'));
  Logger.log('   상품 카드: ' + (hasProductCards ? '✅' : '❌'));
  Logger.log('   파트너스 문구: ' + (hasDisclosure ? '✅' : '❌'));

  // 4) HTML 미리보기 (처음 500자)
  Logger.log('3) HTML 미리보기:');
  Logger.log(finalContent.substring(0, 500) + '...');

  if (hasTextLinks && hasProductCards && hasDisclosure) {
    Logger.log('✅ 쿠팡 파트너스 통합 테스트 통과');
  } else {
    Logger.log('❌ 쿠팡 파트너스 통합 테스트 실패');
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add apps-script/src/Tests.gs
git commit -m "feat: Tests.gs — 쿠팡 파트너스 모듈 테스트 함수 추가"
```

---

### Task 6: 문서 업데이트

**Files:**
- Modify: `docs/user-manual.md`
- Modify: `docs/faq.md`
- Modify: `docs/testing-guide.md`

- [ ] **Step 1: user-manual.md에 쿠팡 설정 안내 추가**

`docs/user-manual.md`의 설정 시트 설명 부분에 쿠팡 파트너스 설정 안내를 추가한다. 기존 Row 5 (Pexels API 키) 설명 다음에 추가:

```markdown
### 쿠팡 파트너스 설정 (선택)

쿠팡 파트너스 연동을 위해 아래 항목을 설정 시트에 입력합니다:

| 행 | A열 | B열 (입력) |
|----|-----|-----------|
| 6 | 쿠팡 Access Key | 쿠팡 파트너스 API Access Key |
| 7 | 쿠팡 Secret Key | 쿠팡 파트너스 API Secret Key |
| 8 | 쿠팡 파트너 ID | af로 시작하는 파트너 ID |
| 9 | 쿠팡 Sub ID | 블로그 구분용 채널 ID |
| 10 | 쿠팡 다이나믹 배너 코드 | 쿠팡 파트너스에서 생성한 배너 코드 |

**참고:**
- Access Key와 Secret Key만 입력하면 상품 추천 기능이 활성화됩니다.
- 다이나믹 배너 코드는 선택 사항입니다. 입력하면 글 하단에 배너가 추가됩니다.
- 쿠팡 API는 시간당 10회 호출 제한이 있습니다. 자동 실행(10분 간격) 기준 시간당 최대 6개 키워드를 처리할 수 있습니다.
```

- [ ] **Step 2: faq.md에 쿠팡 관련 FAQ 추가**

`docs/faq.md`에 쿠팡 파트너스 관련 FAQ를 추가한다:

```markdown
### 쿠팡 파트너스

**Q: 쿠팡 파트너스 API 키는 어디서 발급받나요?**
A: 쿠팡 파트너스 사이트(partners.coupang.com)에 가입하고, 누적 매출 15만 원 이상이 되면 API 키를 발급받을 수 있습니다.

**Q: 쿠팡 상품이 글에 안 넣어지는데요?**
A: 다음을 확인해주세요:
1. 설정 시트에 Access Key와 Secret Key가 올바르게 입력되어 있는지
2. 스크립트 실행 로그(View > Logs)에서 오류 메시지 확인
3. 시간당 10회 API 호출 제한을 초과하지 않았는지 (초과 시 다음 시간에 자동 재시도)

**Q: "쿠팡 API 호출 제한 (403)" 로그가 나와요.**
A: 시간당 10회 제한을 초과한 것입니다. 해당 글은 쿠팡 상품 없이 정상 발행되며, 다음 시간에 다시 정상 작동합니다. 3번 연속 403이 나면 24시간 정지될 수 있으니 주의하세요.

**Q: 쿠팡 설정 없이도 글이 생성되나요?**
A: 네. 쿠팡 설정은 선택 사항입니다. 미설정 시 Phase 1과 동일하게 쿠팡 상품 없이 글이 생성됩니다.
```

- [ ] **Step 3: testing-guide.md에 쿠팡 테스트 안내 추가**

`docs/testing-guide.md`에 쿠팡 테스트 함수 실행 안내를 추가한다:

```markdown
### 쿠팡 파트너스 모듈 테스트

| 함수명 | 설명 | API 호출 |
|--------|------|---------|
| `testCoupangHmac` | HMAC 서명 형식 검증 | X |
| `testCoupangSearch` | 실제 상품 검색 테스트 | O (1회) |
| `testCoupangBanner` | HTML 생성 로직 검증 | X |
| `testCoupangIntegration` | 검색→HTML→삽입 E2E | O (1회) |

**테스트 순서 권장:**
1. `testCoupangHmac` — API 키 없이도 실행 가능
2. `testCoupangBanner` — API 키 없이도 실행 가능
3. `testCoupangSearch` — API 키 필요, 시간당 호출 제한 주의
4. `testCoupangIntegration` — API 키 필요, 전체 흐름 확인

⚠️ `testCoupangSearch`와 `testCoupangIntegration`은 각각 실제 API를 1회 호출합니다. 시간당 10회 제한에 주의하세요.
```

- [ ] **Step 4: 커밋**

```bash
git add docs/user-manual.md docs/faq.md docs/testing-guide.md
git commit -m "docs: 쿠팡 파트너스 모듈 문서 업데이트"
```
