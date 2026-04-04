# Apps Script 블로그 자동화 Phase 1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Apps Script 기반 블로그 글감 자동 생성 도구의 Phase 1(모듈 1) 구현 — 구글 시트에서 키워드 입력 → Gemini로 글 생성 → 선택적으로 이미지 생성 + WordPress 포스팅

**Architecture:** 모든 로직이 Google Sheets에 내장된 Apps Script로 동작. 외부 서버 없음. 설정/글감생성/프롬프트설정 3개 시트 탭 + 6개 .gs 파일로 구성. Gemini API (텍스트 + 이미지)와 WordPress REST API를 UrlFetchApp으로 호출.

**Tech Stack:** Google Apps Script, Google Sheets, Gemini 2.0 Flash API, Imagen 4.0 API, WordPress REST API

**Testing approach:** Apps Script는 로컬 실행이 불가하므로 각 .gs 파일에 대응하는 test 함수를 Tests.gs에 작성. Google Sheets Script Editor에서 수동 실행하여 Logger.log로 결과 확인.

---

## File Structure

```
blog-automation-tool/
├── archive/
│   └── n8n-prototype/           # 기존 n8n 코드 이동
│       ├── infrastructure/
│       ├── module-1-content/
│       ├── module-2-coupang/
│       ├── module-3-ali/
│       └── shared/
├── apps-script/
│   └── src/
│       ├── Config.gs            # 설정 시트에서 값 읽기
│       ├── Utils.gs             # 에러 핸들링, 로깅, 상태 업데이트
│       ├── Prompts.gs           # 프롬프트 템플릿 조합
│       ├── GeminiAPI.gs         # Gemini 텍스트 생성 + Imagen 이미지 생성
│       ├── WordPress.gs         # WP REST API 포스팅 + 미디어 업로드
│       ├── Main.gs              # onOpen 메뉴, 트리거, 메인 실행 루프
│       └── Tests.gs             # 각 모듈 테스트 함수
├── docs/
│   ├── user-manual.md           # Apps Script 버전 매뉴얼 (새로 작성)
│   ├── faq.md                   # 업데이트된 FAQ (새로 작성)
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── .gitignore
```

**각 파일의 역할:**

| 파일 | 역할 | 의존성 |
|------|------|--------|
| Config.gs | "설정" 시트에서 API 키, WP 정보 읽기 | 없음 |
| Utils.gs | 로깅, 상태 업데이트, 에러 래핑 | Config.gs |
| Prompts.gs | 키워드+설정으로 프롬프트 문자열 조합 | Config.gs |
| GeminiAPI.gs | Gemini 텍스트/이미지 API 호출 | Config.gs, Utils.gs |
| WordPress.gs | WP에 글+이미지 업로드 | Config.gs, Utils.gs |
| Main.gs | 메뉴, 트리거, 실행 루프 (모든 모듈 오케스트레이션) | 전체 |
| Tests.gs | 각 모듈별 테스트 함수 | 전체 |

---

### Task 1: 프로젝트 구조 변경 — 기존 n8n 코드 아카이브

**Files:**
- Move: `infrastructure/` → `archive/n8n-prototype/infrastructure/`
- Move: `module-1-content/` → `archive/n8n-prototype/module-1-content/`
- Move: `module-2-coupang/` → `archive/n8n-prototype/module-2-coupang/`
- Move: `module-3-ali/` → `archive/n8n-prototype/module-3-ali/`
- Move: `shared/` → `archive/n8n-prototype/shared/`
- Create: `apps-script/src/` (빈 디렉토리)

- [ ] **Step 1: archive 디렉토리 생성 및 기존 코드 이동**

```bash
mkdir -p archive/n8n-prototype
git mv infrastructure archive/n8n-prototype/
git mv module-1-content archive/n8n-prototype/
git mv module-2-coupang archive/n8n-prototype/
git mv module-3-ali archive/n8n-prototype/
git mv shared archive/n8n-prototype/
```

- [ ] **Step 2: Apps Script 소스 디렉토리 생성**

```bash
mkdir -p apps-script/src
```

- [ ] **Step 3: .gitignore 업데이트**

`.gitignore` 파일에 아래 내용 추가:

```
# Apps Script
.clasp.json
.clasprc.json
```

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "refactor: n8n 코드 archive로 이동, Apps Script 구조 준비"
```

---

### Task 2: Config.gs — 설정 시트 읽기

**Files:**
- Create: `apps-script/src/Config.gs`

이 파일은 "⚙️ 설정" 시트에서 Gemini API 키, WordPress 정보 등을 읽는 함수를 제공한다. 다른 모든 .gs 파일이 이 파일에 의존한다.

- [ ] **Step 1: Config.gs 작성**

```javascript
/**
 * Config.gs — "설정" 시트에서 설정값을 읽는 모듈
 *
 * "설정" 시트 구조 (A열: 항목명, B열: 값):
 *   Row 1: Gemini API 키     | AIzaSy...
 *   Row 2: WordPress 주소    | https://myblog.com
 *   Row 3: WordPress 아이디  | admin
 *   Row 4: WordPress App Password | xxxx xxxx xxxx
 */

var SETTINGS_SHEET_NAME = '설정';
var CONTENT_SHEET_NAME = '글감 생성';
var PROMPT_SHEET_NAME = '프롬프트 설정';

/**
 * "설정" 시트에서 모든 설정값을 읽어 객체로 반환한다.
 * @returns {{ geminiApiKey: string, wpUrl: string, wpUser: string, wpAppPassword: string }}
 */
function getConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    throw new Error('시트를 찾을 수 없습니다: ' + SETTINGS_SHEET_NAME);
  }

  var data = sheet.getRange('A1:B10').getValues();
  var config = {};

  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    var value = String(data[i][1]).trim();

    if (key === 'Gemini API 키') config.geminiApiKey = value;
    else if (key === 'WordPress 주소') config.wpUrl = value;
    else if (key === 'WordPress 아이디') config.wpUser = value;
    else if (key === 'WordPress App Password') config.wpAppPassword = value;
  }

  return config;
}

/**
 * Gemini API 키가 설정되어 있는지 확인한다.
 * @returns {boolean}
 */
function hasGeminiKey() {
  var config = getConfig();
  return config.geminiApiKey && config.geminiApiKey !== '' && config.geminiApiKey !== 'undefined';
}

/**
 * WordPress 설정이 완료되어 있는지 확인한다.
 * @returns {boolean}
 */
function hasWordPressConfig() {
  var config = getConfig();
  return config.wpUrl && config.wpUrl !== '' && config.wpUrl !== 'undefined'
      && config.wpUser && config.wpUser !== '' && config.wpUser !== 'undefined'
      && config.wpAppPassword && config.wpAppPassword !== '' && config.wpAppPassword !== 'undefined';
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/Config.gs
git commit -m "feat: Config.gs — 설정 시트 읽기 모듈"
```

---

### Task 3: Utils.gs — 유틸리티 함수

**Files:**
- Create: `apps-script/src/Utils.gs`

에러 핸들링, 시트 상태 업데이트, 로깅 등 공통 유틸리티.

- [ ] **Step 1: Utils.gs 작성**

```javascript
/**
 * Utils.gs — 공통 유틸리티 (상태 업데이트, 에러 핸들링, 로깅)
 */

/**
 * "글감 생성" 시트의 특정 행 상태를 업데이트한다.
 * @param {number} row - 행 번호 (1-based, 헤더 제외하므로 데이터 첫 행은 2)
 * @param {string} status - 상태값 ("처리 중", "완료", "에러")
 * @param {object} [results] - 결과 데이터 { title, content, postingResult }
 */
function updateRowStatus(row, status, results) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);

  // E열: 상태
  sheet.getRange(row, 5).setValue(status);

  if (results) {
    // F열: 생성된 제목
    if (results.title) sheet.getRange(row, 6).setValue(results.title);
    // G열: 생성된 본문
    if (results.content) sheet.getRange(row, 7).setValue(results.content);
    // H열: 포스팅 결과
    if (results.postingResult) sheet.getRange(row, 8).setValue(results.postingResult);
  }

  SpreadsheetApp.flush();
}

/**
 * "글감 생성" 시트에서 상태가 "대기"인 행들을 찾아 반환한다.
 * @returns {Array<{row: number, keyword: string, imageGen: string, imageStyle: string, autoPost: string}>}
 */
function getPendingRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var pending = [];

  for (var i = 0; i < data.length; i++) {
    var status = String(data[i][4]).trim();
    if (status === '대기') {
      pending.push({
        row: i + 2,
        keyword: String(data[i][0]).trim(),
        imageGen: String(data[i][1]).trim(),
        imageStyle: String(data[i][2]).trim(),
        autoPost: String(data[i][3]).trim()
      });
    }
  }

  return pending;
}

/**
 * 에러를 잡아서 시트에 기록하는 래퍼.
 * @param {number} row - 에러가 발생한 행 번호
 * @param {Error} error - 에러 객체
 */
function handleRowError(row, error) {
  Logger.log('행 ' + row + ' 에러: ' + error.message);
  updateRowStatus(row, '에러', { postingResult: error.message });
}

/**
 * 실행 시간이 제한(5분)에 가까운지 확인한다.
 * 6분 제한 중 5분이 넘으면 true를 반환하여 안전하게 종료할 수 있게 한다.
 * @param {Date} startTime - 실행 시작 시각
 * @returns {boolean}
 */
function isNearTimeLimit(startTime) {
  var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
  return elapsed > 300; // 5분 = 300초
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/Utils.gs
git commit -m "feat: Utils.gs — 상태 업데이트, 에러 핸들링, 시간 제한 체크"
```

---

### Task 4: Prompts.gs — 프롬프트 조합

**Files:**
- Create: `apps-script/src/Prompts.gs`

"프롬프트 설정" 시트의 값과 키워드를 조합하여 Gemini API에 보낼 프롬프트 문자열을 만든다.

- [ ] **Step 1: Prompts.gs 작성**

```javascript
/**
 * Prompts.gs — 프롬프트 템플릿 조합
 *
 * "프롬프트 설정" 시트 구조 (A열: 항목명, B열: 값):
 *   Row 1: 글 톤         | 친근한
 *   Row 2: 글 길이       | 2000자
 *   Row 3: 커스텀 프롬프트 | (비워두면 기본값)
 */

/**
 * "프롬프트 설정" 시트에서 설정을 읽는다.
 * @returns {{ tone: string, length: string, customPrompt: string }}
 */
function getPromptSettings() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROMPT_SHEET_NAME);
  if (!sheet) {
    return { tone: '친근한', length: '2000자', customPrompt: '' };
  }

  var data = sheet.getRange('A1:B5').getValues();
  var settings = { tone: '친근한', length: '2000자', customPrompt: '' };

  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    var value = String(data[i][1]).trim();

    if (key === '글 톤') settings.tone = value || '친근한';
    else if (key === '글 길이') settings.length = value || '2000자';
    else if (key === '커스텀 프롬프트') settings.customPrompt = value;
  }

  return settings;
}

/**
 * 키워드와 설정을 조합하여 글 생성 프롬프트를 만든다.
 * @param {string} keyword - 글감 키워드
 * @param {boolean} includeImagePlaceholders - 이미지 플레이스홀더 포함 여부
 * @returns {string} 완성된 프롬프트
 */
function buildContentPrompt(keyword, includeImagePlaceholders) {
  var settings = getPromptSettings();

  if (settings.customPrompt) {
    return settings.customPrompt.replace(/\{\{keyword\}\}/g, keyword);
  }

  var toneMap = {
    '친근한': '독자에게 말하듯 친근하고 부드러운 톤',
    '전문적': '전문가가 설명하듯 신뢰감 있는 톤',
    '캐주얼': '친구에게 이야기하듯 가볍고 재미있는 톤'
  };
  var toneDesc = toneMap[settings.tone] || toneMap['친근한'];

  var lengthNum = settings.length.replace(/[^0-9]/g, '') || '2000';

  var prompt = '다음 키워드에 대해 SEO 최적화된 한국어 블로그 글을 작성해주세요.\n\n'
    + '키워드: ' + keyword + '\n\n'
    + '요구사항:\n'
    + '- 제목은 클릭을 유도하는 매력적인 형태로 (숫자, 질문형, 리스트형 활용)\n'
    + '- 본문은 ' + lengthNum + '자 이상\n'
    + '- H2, H3 소제목을 활용하여 구조화\n'
    + '- 핵심 키워드를 자연스럽게 반복 (키워드 밀도 1-2%)\n'
    + '- 서론, 본론, 결론 구조\n'
    + '- ' + toneDesc + '\n'
    + '- 실용적인 정보와 팁 포함\n'
    + '- 마지막에 요약 또는 핵심 정리 포함\n';

  if (includeImagePlaceholders) {
    prompt += '- 본문의 적절한 위치에 [IMAGE_1], [IMAGE_2] 플레이스홀더를 삽입\n';
  }

  prompt += '\n출력 형식:\n'
    + '제목: [제목]\n'
    + '---\n'
    + '[본문을 HTML 형식으로 작성 (h2, h3, p, ul, li 태그 활용)]';

  return prompt;
}

/**
 * 키워드와 이미지 스타일로 이미지 생성 프롬프트를 만든다.
 * @param {string} keyword - 글감 키워드
 * @param {string} style - 이미지 스타일 ("일러스트", "사진풍", "미니멀")
 * @param {string} type - 이미지 용도 ("thumbnail", "body")
 * @returns {string} 이미지 생성 프롬프트
 */
function buildImagePrompt(keyword, style, type) {
  var styleMap = {
    '일러스트': 'flat illustration style, clean lines, modern design, vibrant colors, digital art',
    '사진풍': 'professional photography style, high quality, realistic, well-lit, sharp focus',
    '미니멀': 'minimal design, simple shapes, white background, clean aesthetic, modern'
  };

  var styleDesc = styleMap[style] || styleMap['일러스트'];

  if (type === 'thumbnail') {
    return keyword + ', blog thumbnail, eye-catching, ' + styleDesc + ', 16:9 aspect ratio';
  }
  return keyword + ', blog illustration, informative, ' + styleDesc;
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/Prompts.gs
git commit -m "feat: Prompts.gs — 프롬프트 설정 읽기 + 글/이미지 프롬프트 조합"
```

---

### Task 5: GeminiAPI.gs — 텍스트 생성

**Files:**
- Create: `apps-script/src/GeminiAPI.gs`

Gemini 2.0 Flash로 블로그 글을 생성하고, 응답에서 제목/본문을 파싱한다.

- [ ] **Step 1: GeminiAPI.gs 작성 — 텍스트 생성 부분**

```javascript
/**
 * GeminiAPI.gs — Gemini 텍스트 생성 + Imagen 이미지 생성
 */

var GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
var IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';

/**
 * Gemini API로 블로그 글을 생성한다.
 * @param {string} prompt - 글 생성 프롬프트
 * @param {string} apiKey - Gemini API 키
 * @returns {{ title: string, content: string }} 파싱된 제목과 본문
 */
function generateContent(prompt, apiKey) {
  var url = GEMINI_TEXT_URL + '?key=' + apiKey;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error('Gemini API 오류 (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());

  if (!json.candidates || json.candidates.length === 0) {
    throw new Error('Gemini API 응답에 결과가 없습니다.');
  }

  var text = json.candidates[0].content.parts[0].text;
  return parseGeneratedContent(text);
}

/**
 * Gemini 응답 텍스트에서 제목과 본문을 분리한다.
 * @param {string} text - Gemini가 생성한 전체 텍스트
 * @returns {{ title: string, content: string }}
 */
function parseGeneratedContent(text) {
  var lines = text.split('\n');
  var title = '';
  var content = '';
  var foundSeparator = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (!title && (line.indexOf('제목:') === 0 || line.indexOf('제목 :') === 0)) {
      title = line.replace(/^제목\s*:\s*/, '').trim();
    } else if (line.trim() === '---') {
      foundSeparator = true;
    } else if (foundSeparator) {
      content += line + '\n';
    }
  }

  // 제목을 못 찾은 경우 첫 줄을 제목으로 사용
  if (!title && lines.length > 0) {
    title = lines[0].replace(/^#+\s*/, '').trim();
    content = lines.slice(1).join('\n').trim();
  }

  // ```html 코드블록 제거
  content = content.replace(/```html\s*/g, '').replace(/```\s*/g, '');

  return { title: title, content: content.trim() };
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/GeminiAPI.gs
git commit -m "feat: GeminiAPI.gs — Gemini 텍스트 생성 + 응답 파싱"
```

---

### Task 6: GeminiAPI.gs — 이미지 생성 추가

**Files:**
- Modify: `apps-script/src/GeminiAPI.gs` (하단에 이미지 관련 함수 추가)

Imagen 4.0 API로 이미지를 생성하고, base64 데이터를 반환한다.

- [ ] **Step 1: GeminiAPI.gs에 이미지 생성 함수 추가**

`apps-script/src/GeminiAPI.gs` 파일 하단에 아래 코드를 추가:

```javascript
/**
 * Imagen API로 이미지를 생성한다.
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} apiKey - Gemini API 키
 * @param {string} aspectRatio - 이미지 비율 ("16:9", "4:3", "1:1")
 * @returns {{ base64: string, mimeType: string }} base64 인코딩된 이미지 데이터
 */
function generateImage(prompt, apiKey, aspectRatio) {
  var url = IMAGEN_URL + '?key=' + apiKey;

  var payload = {
    instances: [{ prompt: prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio || '16:9',
      outputMimeType: 'image/png'
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error('Imagen API 오류 (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());

  if (!json.predictions || json.predictions.length === 0) {
    throw new Error('Imagen API 응답에 이미지가 없습니다.');
  }

  return {
    base64: json.predictions[0].bytesBase64Encoded,
    mimeType: json.predictions[0].mimeType || 'image/png'
  };
}

/**
 * 블로그 글용 이미지 세트(썸네일 1장 + 본문 2장)를 생성한다.
 * @param {string} keyword - 글감 키워드
 * @param {string} style - 이미지 스타일
 * @param {string} apiKey - Gemini API 키
 * @returns {{ thumbnail: {base64, mimeType}, body1: {base64, mimeType}, body2: {base64, mimeType} }}
 */
function generateImageSet(keyword, style, apiKey) {
  var thumbnailPrompt = buildImagePrompt(keyword, style, 'thumbnail');
  var bodyPrompt1 = buildImagePrompt(keyword, style, 'body');
  var bodyPrompt2 = buildImagePrompt(keyword, style, 'body');

  var thumbnail = generateImage(thumbnailPrompt, apiKey, '16:9');

  // Imagen API rate limit 대응 — 요청 사이에 잠시 대기
  Utilities.sleep(3000);
  var body1 = generateImage(bodyPrompt1, apiKey, '4:3');

  Utilities.sleep(3000);
  var body2 = generateImage(bodyPrompt2, apiKey, '4:3');

  return { thumbnail: thumbnail, body1: body1, body2: body2 };
}

/**
 * 본문 HTML의 [IMAGE_1], [IMAGE_2] 플레이스홀더를 이미지 URL로 교체한다.
 * WordPress에 업로드한 경우 URL을, 아닌 경우 base64 data URI를 사용한다.
 * @param {string} content - 본문 HTML
 * @param {string[]} imageUrls - 이미지 URL 배열 (최대 2개)
 * @param {string} keyword - alt 텍스트에 사용할 키워드
 * @returns {string} 이미지가 삽입된 본문 HTML
 */
function insertImagesIntoContent(content, imageUrls, keyword) {
  if (imageUrls[0]) {
    content = content.replace('[IMAGE_1]',
      '<figure><img src="' + imageUrls[0] + '" alt="' + keyword + '" style="width:100%;height:auto;"/></figure>');
  }
  if (imageUrls[1]) {
    content = content.replace('[IMAGE_2]',
      '<figure><img src="' + imageUrls[1] + '" alt="' + keyword + '" style="width:100%;height:auto;"/></figure>');
  }
  // 남은 플레이스홀더 제거
  content = content.replace(/\[IMAGE_\d+\]/g, '');
  return content;
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/GeminiAPI.gs
git commit -m "feat: GeminiAPI.gs — Imagen 이미지 생성 + 본문 이미지 삽입"
```

---

### Task 7: WordPress.gs — 자동 포스팅

**Files:**
- Create: `apps-script/src/WordPress.gs`

WordPress REST API로 이미지 업로드 + 글 포스팅(초안).

- [ ] **Step 1: WordPress.gs 작성**

```javascript
/**
 * WordPress.gs — WordPress REST API 포스팅 + 미디어 업로드
 */

/**
 * WordPress에 이미지를 업로드하고 미디어 ID와 URL을 반환한다.
 * @param {string} base64Data - base64 인코딩된 이미지 데이터
 * @param {string} mimeType - 이미지 MIME 타입
 * @param {string} filename - 파일명
 * @param {object} config - { wpUrl, wpUser, wpAppPassword }
 * @returns {{ id: number, url: string }} 업로드된 미디어 정보
 */
function uploadImageToWordPress(base64Data, mimeType, filename, config) {
  var url = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/media';

  var imageBytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(imageBytes, mimeType, filename);

  var authHeader = 'Basic ' + Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);

  var options = {
    method: 'post',
    headers: {
      'Authorization': authHeader,
      'Content-Disposition': 'attachment; filename="' + filename + '"'
    },
    contentType: mimeType,
    payload: blob.getBytes(),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 201) {
    throw new Error('WordPress 이미지 업로드 실패 (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());
  return {
    id: json.id,
    url: json.source_url || json.guid.rendered
  };
}

/**
 * WordPress에 블로그 글을 초안(draft)으로 포스팅한다.
 * @param {string} title - 글 제목
 * @param {string} content - 글 본문 (HTML)
 * @param {number} [featuredMediaId] - 대표 이미지 미디어 ID (선택)
 * @param {object} config - { wpUrl, wpUser, wpAppPassword }
 * @returns {{ id: number, link: string }} 생성된 글 정보
 */
function postToWordPress(title, content, featuredMediaId, config) {
  var url = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts';

  var authHeader = 'Basic ' + Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);

  var postData = {
    title: title,
    content: content,
    status: 'draft'
  };

  if (featuredMediaId) {
    postData.featured_media = featuredMediaId;
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': authHeader },
    payload: JSON.stringify(postData),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 201) {
    throw new Error('WordPress 포스팅 실패 (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());
  return {
    id: json.id,
    link: json.link
  };
}

/**
 * 이미지 세트를 WordPress에 업로드하고, 본문에 이미지를 삽입한 후, 글을 포스팅한다.
 * @param {string} title - 글 제목
 * @param {string} content - 글 본문 (플레이스홀더 포함 가능)
 * @param {object} [imageSet] - { thumbnail, body1, body2 } (각각 { base64, mimeType })
 * @param {string} keyword - 키워드 (파일명, alt 텍스트용)
 * @param {object} config - WordPress 설정
 * @returns {string} 포스팅 결과 메시지
 */
function publishToWordPress(title, content, imageSet, keyword, config) {
  var featuredMediaId = null;
  var bodyImageUrls = [];
  var safeKeyword = keyword.replace(/[^a-zA-Z0-9가-힣]/g, '-');
  var timestamp = new Date().getTime();

  if (imageSet) {
    // 썸네일 업로드
    if (imageSet.thumbnail) {
      var thumbResult = uploadImageToWordPress(
        imageSet.thumbnail.base64,
        imageSet.thumbnail.mimeType,
        safeKeyword + '-thumb-' + timestamp + '.png',
        config
      );
      featuredMediaId = thumbResult.id;
    }

    // 본문 이미지 업로드
    if (imageSet.body1) {
      var body1Result = uploadImageToWordPress(
        imageSet.body1.base64,
        imageSet.body1.mimeType,
        safeKeyword + '-body1-' + timestamp + '.png',
        config
      );
      bodyImageUrls.push(body1Result.url);
    }

    if (imageSet.body2) {
      var body2Result = uploadImageToWordPress(
        imageSet.body2.base64,
        imageSet.body2.mimeType,
        safeKeyword + '-body2-' + timestamp + '.png',
        config
      );
      bodyImageUrls.push(body2Result.url);
    }

    // 본문에 이미지 삽입
    content = insertImagesIntoContent(content, bodyImageUrls, keyword);
  }

  // 글 포스팅
  var postResult = postToWordPress(title, content, featuredMediaId, config);
  return '포스팅 완료 (ID: ' + postResult.id + ')';
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/WordPress.gs
git commit -m "feat: WordPress.gs — WP REST API 이미지 업로드 + 글 포스팅"
```

---

### Task 8: Main.gs — 메인 실행 로직

**Files:**
- Create: `apps-script/src/Main.gs`

onOpen 메뉴, 수동/자동 실행 함수, 트리거 설정.

- [ ] **Step 1: Main.gs 작성**

```javascript
/**
 * Main.gs — 메인 실행 로직 (메뉴, 트리거, 오케스트레이션)
 */

/**
 * 시트가 열릴 때 커스텀 메뉴를 추가한다.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 블로그 자동화')
    .addItem('▶️ 글 생성 실행', 'runContentGeneration')
    .addSeparator()
    .addItem('⏰ 자동 실행 켜기 (10분 간격)', 'enableAutoTrigger')
    .addItem('⏹️ 자동 실행 끄기', 'disableAutoTrigger')
    .addSeparator()
    .addItem('🔑 설정 확인', 'checkSettings')
    .addToUi();
}

/**
 * 글 생성 메인 루프.
 * "대기" 상태인 행을 하나씩 처리한다.
 * 6분 제한 대응: 5분이 넘으면 안전하게 종료하고 남은 건 다음 실행에서 처리.
 */
function runContentGeneration() {
  var startTime = new Date();

  if (!hasGeminiKey()) {
    SpreadsheetApp.getUi().alert('⚠️ Gemini API 키가 설정되지 않았습니다.\n"설정" 시트에서 API 키를 입력해주세요.');
    return;
  }

  var config = getConfig();
  var pendingRows = getPendingRows();

  if (pendingRows.length === 0) {
    Logger.log('처리할 대기 항목이 없습니다.');
    return;
  }

  Logger.log('처리할 항목: ' + pendingRows.length + '개');

  for (var i = 0; i < pendingRows.length; i++) {
    // 시간 제한 체크
    if (isNearTimeLimit(startTime)) {
      Logger.log('시간 제한 임박 — 나머지 ' + (pendingRows.length - i) + '개는 다음 실행에서 처리');
      break;
    }

    var row = pendingRows[i];
    processRow(row, config);
  }
}

/**
 * 단일 행을 처리한다 (글 생성 → 이미지 생성 → 포스팅).
 * @param {object} row - { row, keyword, imageGen, imageStyle, autoPost }
 * @param {object} config - 설정값
 */
function processRow(row, config) {
  try {
    updateRowStatus(row.row, '처리 중');
    Logger.log('행 ' + row.row + ' 처리 시작: ' + row.keyword);

    var needsImages = row.imageGen === 'Y' || row.imageGen === 'y';
    var needsPosting = row.autoPost === 'Y' || row.autoPost === 'y';

    // 1. 글 생성
    var prompt = buildContentPrompt(row.keyword, needsImages);
    var generated = generateContent(prompt, config.geminiApiKey);

    // 2. 이미지 생성 (선택)
    var imageSet = null;
    if (needsImages) {
      imageSet = generateImageSet(row.keyword, row.imageStyle, config.geminiApiKey);
    }

    // 3. WordPress 포스팅 (선택)
    var postingResult = '';
    if (needsPosting && hasWordPressConfig()) {
      var content = generated.content;
      postingResult = publishToWordPress(generated.title, content, imageSet, row.keyword, config);
    } else if (needsPosting && !hasWordPressConfig()) {
      postingResult = 'WordPress 설정이 없어 포스팅을 건너뜁니다.';
    }

    // 4. 이미지가 있지만 포스팅하지 않는 경우, 본문에 base64 data URI로 삽입
    var finalContent = generated.content;
    if (imageSet && !needsPosting) {
      var dataUrls = [];
      if (imageSet.body1) {
        dataUrls.push('data:' + imageSet.body1.mimeType + ';base64,' + imageSet.body1.base64);
      }
      if (imageSet.body2) {
        dataUrls.push('data:' + imageSet.body2.mimeType + ';base64,' + imageSet.body2.base64);
      }
      finalContent = insertImagesIntoContent(finalContent, dataUrls, row.keyword);
    }

    // 5. 시트에 결과 기록
    updateRowStatus(row.row, '완료', {
      title: generated.title,
      content: needsPosting ? '(WordPress에 포스팅됨)' : finalContent,
      postingResult: postingResult || (needsPosting ? '' : '포스팅 안 함')
    });

    Logger.log('행 ' + row.row + ' 처리 완료: ' + generated.title);

  } catch (e) {
    handleRowError(row.row, e);
  }
}

/**
 * 10분 간격 자동 실행 트리거를 설정한다.
 */
function enableAutoTrigger() {
  // 기존 트리거 제거
  disableAutoTrigger();

  ScriptApp.newTrigger('runContentGeneration')
    .timeBased()
    .everyMinutes(10)
    .create();

  SpreadsheetApp.getUi().alert('✅ 자동 실행이 켜졌습니다.\n10분마다 "대기" 상태인 항목을 자동으로 처리합니다.');
}

/**
 * 자동 실행 트리거를 제거한다.
 */
function disableAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runContentGeneration') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 수동 호출 시에만 알림 표시
  try {
    SpreadsheetApp.getUi().alert('⏹️ 자동 실행이 꺼졌습니다.');
  } catch (e) {
    // 트리거에서 호출된 경우 UI가 없으므로 무시
  }
}

/**
 * 설정 상태를 확인하고 사용자에게 알려준다.
 */
function checkSettings() {
  var config = getConfig();
  var messages = [];

  if (hasGeminiKey()) {
    messages.push('✅ Gemini API 키: 설정됨');
  } else {
    messages.push('❌ Gemini API 키: 미설정');
  }

  if (hasWordPressConfig()) {
    messages.push('✅ WordPress: 설정됨 (' + config.wpUrl + ')');
  } else {
    messages.push('ℹ️ WordPress: 미설정 (자동 포스팅 사용 안 함)');
  }

  SpreadsheetApp.getUi().alert('설정 상태\n\n' + messages.join('\n'));
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/Main.gs
git commit -m "feat: Main.gs — 메뉴, 트리거, 메인 실행 루프"
```

---

### Task 9: Tests.gs — 테스트 함수

**Files:**
- Create: `apps-script/src/Tests.gs`

각 모듈을 개별적으로 테스트할 수 있는 함수 모음. Google Sheets Script Editor에서 수동 실행.

- [ ] **Step 1: Tests.gs 작성**

```javascript
/**
 * Tests.gs — 모듈별 테스트 함수
 *
 * 사용법: Google Sheets → 확장 프로그램 → Apps Script → 함수 선택 → 실행
 * 결과는 "실행 로그" 또는 Logger.log에서 확인
 */

/**
 * Config 모듈 테스트: 설정 시트에서 값을 읽을 수 있는지 확인
 */
function testConfig() {
  Logger.log('=== Config 테스트 ===');
  var config = getConfig();
  Logger.log('Gemini API 키: ' + (config.geminiApiKey ? '설정됨 (' + config.geminiApiKey.substring(0, 8) + '...)' : '미설정'));
  Logger.log('WordPress URL: ' + (config.wpUrl || '미설정'));
  Logger.log('hasGeminiKey: ' + hasGeminiKey());
  Logger.log('hasWordPressConfig: ' + hasWordPressConfig());
  Logger.log('=== Config 테스트 완료 ===');
}

/**
 * Prompts 모듈 테스트: 프롬프트가 올바르게 조합되는지 확인
 */
function testPrompts() {
  Logger.log('=== Prompts 테스트 ===');
  var settings = getPromptSettings();
  Logger.log('톤: ' + settings.tone);
  Logger.log('길이: ' + settings.length);

  var prompt = buildContentPrompt('겨울 제주도 여행', true);
  Logger.log('생성된 프롬프트 (처음 200자):\n' + prompt.substring(0, 200));

  var imagePrompt = buildImagePrompt('겨울 제주도 여행', '일러스트', 'thumbnail');
  Logger.log('이미지 프롬프트: ' + imagePrompt);
  Logger.log('=== Prompts 테스트 완료 ===');
}

/**
 * Gemini 텍스트 생성 테스트: 실제 API를 호출하여 글을 생성
 * ⚠️ 실제 API 호출이 발생합니다 (무료 한도 소비)
 */
function testGeminiText() {
  Logger.log('=== Gemini 텍스트 생성 테스트 ===');
  var config = getConfig();

  if (!config.geminiApiKey) {
    Logger.log('❌ API 키가 없어서 테스트를 건너뜁니다.');
    return;
  }

  var prompt = buildContentPrompt('테스트 키워드: 아침 운동의 효과', false);
  var result = generateContent(prompt, config.geminiApiKey);

  Logger.log('제목: ' + result.title);
  Logger.log('본문 길이: ' + result.content.length + '자');
  Logger.log('본문 (처음 300자):\n' + result.content.substring(0, 300));
  Logger.log('=== Gemini 텍스트 생성 테스트 완료 ===');
}

/**
 * Imagen 이미지 생성 테스트: 실제 API를 호출하여 이미지를 생성
 * ⚠️ 실제 API 호출이 발생합니다 (무료 한도 소비)
 */
function testImagen() {
  Logger.log('=== Imagen 이미지 생성 테스트 ===');
  var config = getConfig();

  if (!config.geminiApiKey) {
    Logger.log('❌ API 키가 없어서 테스트를 건너뜁니다.');
    return;
  }

  var prompt = buildImagePrompt('아침 운동', '일러스트', 'thumbnail');
  var result = generateImage(prompt, config.geminiApiKey, '16:9');

  Logger.log('이미지 생성 성공!');
  Logger.log('MIME 타입: ' + result.mimeType);
  Logger.log('Base64 데이터 길이: ' + result.base64.length);
  Logger.log('=== Imagen 이미지 생성 테스트 완료 ===');
}

/**
 * WordPress 연결 테스트: WP REST API에 접근 가능한지 확인
 * ⚠️ 실제 WordPress 서버에 요청을 보냅니다
 */
function testWordPressConnection() {
  Logger.log('=== WordPress 연결 테스트 ===');
  var config = getConfig();

  if (!hasWordPressConfig()) {
    Logger.log('ℹ️ WordPress 설정이 없어서 테스트를 건너뜁니다.');
    return;
  }

  var url = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts?per_page=1';
  var authHeader = 'Basic ' + Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': authHeader },
    muteHttpExceptions: true
  });

  Logger.log('HTTP 상태: ' + response.getResponseCode());
  if (response.getResponseCode() === 200) {
    Logger.log('✅ WordPress 연결 성공!');
  } else {
    Logger.log('❌ WordPress 연결 실패: ' + response.getContentText().substring(0, 200));
  }
  Logger.log('=== WordPress 연결 테스트 완료 ===');
}

/**
 * 전체 파이프라인 테스트: 글 생성 → 시트 기록 (포스팅 제외)
 * "글감 생성" 시트의 첫 번째 "대기" 항목을 처리합니다
 * ⚠️ 실제 API 호출이 발생합니다
 */
function testFullPipeline() {
  Logger.log('=== 전체 파이프라인 테스트 ===');

  if (!hasGeminiKey()) {
    Logger.log('❌ API 키가 없어서 테스트를 건너뜁니다.');
    return;
  }

  var pendingRows = getPendingRows();
  if (pendingRows.length === 0) {
    Logger.log('❌ "대기" 상태인 항목이 없습니다. 글감 생성 시트에 테스트 키워드를 입력해주세요.');
    return;
  }

  Logger.log('첫 번째 대기 항목 처리: ' + pendingRows[0].keyword);
  var config = getConfig();
  processRow(pendingRows[0], config);
  Logger.log('=== 전체 파이프라인 테스트 완료 ===');
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/src/Tests.gs
git commit -m "feat: Tests.gs — 모듈별 테스트 함수 (Config, Prompts, Gemini, WP, 파이프라인)"
```

---

### Task 10: 사용자 매뉴얼 + FAQ

**Files:**
- Create: `docs/user-manual.md` (Apps Script 버전, 새로 작성)
- Create: `docs/faq.md` (업데이트 버전, 새로 작성)

기존 n8n 매뉴얼에서 서버/Docker/SSH 관련 내용을 제거하고, Google Sheets 기반으로 대폭 간소화.

- [ ] **Step 1: user-manual.md 작성**

`docs/user-manual.md` 파일 생성:

```markdown
# 블로그 자동화 도구 - 사용자 매뉴얼

> 이 가이드를 따라하시면 5분 안에 설정을 완료하고, 구글 시트에 키워드만 입력하면 AI가 자동으로 블로그 글을 작성해줍니다.

---

## 목차

1. [시작하기 전에 준비할 것](#1-시작하기-전에-준비할-것)
2. [STEP 1: 구글 시트 복사하기](#step-1-구글-시트-복사하기)
3. [STEP 2: Gemini API 키 발급받기](#step-2-gemini-api-키-발급받기)
4. [STEP 3: API 키 입력하기](#step-3-api-키-입력하기)
5. [STEP 4: 스크립트 권한 허용하기](#step-4-스크립트-권한-허용하기)
6. [STEP 5: 첫 번째 글 생성 테스트](#step-5-첫-번째-글-생성-테스트)
7. [STEP 6: WordPress 자동 포스팅 설정 (선택)](#step-6-wordpress-자동-포스팅-설정-선택)
8. [일상적인 사용법](#일상적인-사용법)
9. [문제 해결](#문제-해결)

---

## 1. 시작하기 전에 준비할 것

| 준비물 | 설명 | 비용 |
|--------|------|------|
| 구글 계정 | 구글 시트와 Gemini API에 사용 | 무료 |
| 워드프레스 블로그 (선택) | 자동 포스팅을 원하시는 경우에만 | 선택 |

서버, 프로그램 설치 등은 **일체 필요 없습니다.**

---

## STEP 1: 구글 시트 복사하기

1. 아래 링크에 접속합니다:
   - (구매 시 안내드리는 링크)

2. **"파일"** → **"사본 만들기"** 를 클릭합니다.

> [📸 스크린샷: 구글 시트 - 사본 만들기 메뉴]

3. 내 구글 드라이브에 시트가 복사됩니다. 이 시트가 여러분의 자동화 도구입니다!

시트는 3개 탭으로 구성되어 있습니다:
- **⚙️ 설정**: API 키와 블로그 정보를 입력하는 곳
- **📝 글감 생성**: 키워드를 입력하고 결과를 확인하는 곳
- **🎨 프롬프트 설정**: 글 스타일을 조절하는 곳

---

## STEP 2: Gemini API 키 발급받기

Gemini는 구글이 만든 AI입니다. **무료**로 사용할 수 있습니다.

1. 아래 주소에 접속합니다:
   - https://aistudio.google.com/app/apikey

2. 구글 계정으로 로그인합니다.

3. **"Create API Key"** 버튼을 클릭합니다.

> [📸 스크린샷: Google AI Studio - Create API Key 버튼]

4. **"Create API key in new project"** 를 클릭합니다.

5. 생성된 API 키를 **복사**합니다.
   - ⚠️ 이 키는 비밀번호와 같습니다. 다른 사람에게 공유하지 마세요!

> [📸 스크린샷: API 키 생성 완료 화면]

---

## STEP 3: API 키 입력하기

1. 복사한 구글 시트를 엽니다.

2. **"⚙️ 설정"** 탭을 클릭합니다.

3. "Gemini API 키" 옆 칸에 복사한 API 키를 **붙여넣기**합니다.

> [📸 스크린샷: 설정 시트 - API 키 입력 화면]

이것으로 기본 설정이 끝났습니다! (워드프레스 설정은 선택사항입니다)

---

## STEP 4: 스크립트 권한 허용하기

처음 실행할 때 한 번만 권한을 허용하면 됩니다.

1. 시트 상단 메뉴에서 **"🤖 블로그 자동화"** → **"🔑 설정 확인"** 을 클릭합니다.

> [📸 스크린샷: 커스텀 메뉴 위치]

2. "승인 필요" 팝업이 나타나면 **"계속"** 을 클릭합니다.

> [📸 스크린샷: 승인 필요 팝업]

3. 구글 계정을 선택합니다.

4. "Google에서 확인하지 않은 앱입니다" 경고가 나오면:
   - 왼쪽 하단의 **"고급"** 을 클릭합니다.
   - **"(안전하지 않음)으로 이동"** 을 클릭합니다.

> [📸 스크린샷: 고급 → 안전하지 않음으로 이동]

5. **"허용"** 을 클릭합니다.

> ⚠️ 이 경고는 구글의 기본 보안 절차입니다. 우리가 제공하는 스크립트는 API 호출만 하며 개인 정보를 수집하지 않습니다.

6. 설정 상태 확인 팝업이 나타나면 성공입니다!

> [📸 스크린샷: 설정 상태 확인 결과 팝업]

---

## STEP 5: 첫 번째 글 생성 테스트

1. **"📝 글감 생성"** 탭을 클릭합니다.

2. 첫 번째 행에 아래와 같이 입력합니다:

| 키워드 | 이미지생성 | 이미지스타일 | 자동포스팅 |
|--------|-----------|------------|-----------|
| 겨울 제주도 여행 코스 | 없음 | | N |

> 💡 첫 테스트에서는 이미지 생성과 자동 포스팅을 꺼두세요. 글 생성이 잘 되는지 먼저 확인합니다.

3. **상태** 컬럼에 `대기`를 입력합니다.

> [📸 스크린샷: 글감 생성 시트에 테스트 키워드 입력]

4. 상단 메뉴에서 **"🤖 블로그 자동화"** → **"▶️ 글 생성 실행"** 을 클릭합니다.

5. 약 1~2분 후 결과를 확인합니다:
   - **상태**: `완료`
   - **생성된 제목**: AI가 만든 제목
   - **생성된 본문**: AI가 작성한 블로그 글

> [📸 스크린샷: 글 생성 완료된 시트 화면]

🎉 **축하합니다! 설정이 완료되었습니다!**

### 단계별 기능 테스트

기본 글 생성이 성공했다면, 기능을 하나씩 추가해서 테스트합니다:

**테스트 2: 이미지 포함 글 생성**

| 키워드 | 이미지생성 | 이미지스타일 | 자동포스팅 |
|--------|-----------|------------|-----------|
| 봄맞이 인테리어 꿀팁 | Y | 일러스트 | N |

**테스트 3: 자동 포스팅 (WordPress 설정 완료 시)**

| 키워드 | 이미지생성 | 이미지스타일 | 자동포스팅 |
|--------|-----------|------------|-----------|
| 초보자 주식 투자 방법 | Y | 사진풍 | Y |

---

## STEP 6: WordPress 자동 포스팅 설정 (선택)

> 자동 포스팅이 필요 없으시면 이 단계를 건너뛰세요.

### 6-1. WordPress Application Password 발급

1. 워드프레스 관리자 페이지에 접속합니다.
   - `https://내블로그주소/wp-admin`

2. **"사용자"** → **"프로필"** 을 클릭합니다.

3. 페이지 아래쪽 **"Application Passwords"** 섹션에서:
   - 이름: `blog-automation` 입력
   - **"Add New Application Password"** 클릭

4. 생성된 비밀번호를 **복사**합니다.
   - ⚠️ 한 번만 표시되므로 반드시 복사하세요!

> [📸 스크린샷: WordPress Application Password 생성 화면]

### 6-2. 시트에 WordPress 정보 입력

1. **"⚙️ 설정"** 탭으로 이동합니다.

2. 아래 항목을 입력합니다:
   - **WordPress 주소**: `https://내블로그주소` (뒤에 / 없이)
   - **WordPress 아이디**: 관리자 아이디
   - **WordPress App Password**: 방금 복사한 비밀번호

3. 상단 메뉴에서 **"🤖 블로그 자동화"** → **"🔑 설정 확인"** 으로 연결을 확인합니다.

---

## 일상적인 사용법

### 수동으로 글 생성하기
1. "📝 글감 생성" 탭에 키워드 입력
2. 상태에 `대기` 입력
3. 메뉴 → "🤖 블로그 자동화" → "▶️ 글 생성 실행" 클릭

### 자동 실행 설정하기
1. 메뉴 → "🤖 블로그 자동화" → "⏰ 자동 실행 켜기" 클릭
2. 이후 10분마다 "대기" 상태인 항목을 자동 처리
3. 끄려면: "⏹️ 자동 실행 끄기" 클릭

### 여러 글 한번에 생성하기
여러 행에 키워드를 입력하고 모두 상태를 `대기`로 설정하면 순서대로 처리됩니다.

### 글 스타일 변경하기
"🎨 프롬프트 설정" 탭에서:
- **글 톤**: 친근한 / 전문적 / 캐주얼
- **글 길이**: 1500자 / 2000자 / 3000자
- **커스텀 프롬프트**: 고급 사용자용 ({{keyword}}로 키워드 위치 지정)

### 이미지 스타일 가이드

| 스타일 | 특징 | 추천 주제 |
|--------|------|----------|
| 일러스트 | 깔끔한 디지털 아트 | 가이드, 리뷰, 방법론 |
| 사진풍 | 실제 사진처럼 사실적 | 여행, 음식, 인테리어 |
| 미니멀 | 심플하고 깔끔 | IT, 비즈니스, 자기계발 |

---

## 문제 해결

### "메뉴가 안 보여요"
시트를 새로고침(F5)하면 "🤖 블로그 자동화" 메뉴가 나타납니다.

### "권한 요청이 계속 나와요"
권한 허용 절차(STEP 4)를 다시 진행해주세요. "고급" → "안전하지 않음으로 이동"을 놓치는 경우가 많습니다.

### "글이 생성되지 않아요"
1. 설정 확인: 메뉴 → "🔑 설정 확인"
2. 상태 컬럼이 정확히 `대기`인지 확인 (앞뒤 공백 주의)
3. 확장 프로그램 → Apps Script → 실행 로그에서 에러 메시지 확인

### "에러 상태가 표시돼요"
포스팅 결과(H열)에 에러 메시지가 기록됩니다. 일반적인 원인:
- `Gemini API 오류`: API 키가 잘못되었거나 무료 한도 초과
- `WordPress 포스팅 실패`: 주소 또는 비밀번호 오류

### "자동 포스팅이 '초안'으로 올라가요"
정상입니다. 검토 없이 바로 공개되는 것을 방지하기 위해 초안(Draft)으로 올라갑니다.

---

> 📞 이 가이드로 해결되지 않는 문제는 크몽 메시지로 문의해주세요.
```

- [ ] **Step 2: faq.md 작성**

`docs/faq.md` 파일 생성:

```markdown
# 자주 묻는 질문 (FAQ)

---

## 비용 관련

### Q. 정말 무료로 사용할 수 있나요?
서버 비용은 없습니다. 구글 시트에서 돌아가기 때문에 별도 서버가 필요 없습니다. AI 글 생성에 사용하는 Gemini API는 무료 한도가 넉넉하여 (일 1,500회) 개인 블로그 운영에 충분합니다.

### Q. 무료 한도를 초과하면 어떻게 되나요?
요청이 거부되고 시트에 "에러" 상태가 표시됩니다. 자동 과금되지 않습니다. 다음 날 한도가 초기화되면 다시 사용 가능합니다.

---

## 설치 관련

### Q. 컴퓨터에 뭔가 설치해야 하나요?
아닙니다. 구글 시트만 있으면 됩니다. 서버, 프로그램 설치 등은 일체 필요 없습니다.

### Q. 스마트폰에서도 사용할 수 있나요?
구글 시트 앱에서 키워드를 입력할 수 있습니다. 다만 초기 설정(권한 허용 등)은 PC에서 하시는 것을 추천합니다.

### Q. 컴퓨터를 꺼도 작동하나요?
"자동 실행"을 켜두면 구글 서버에서 10분마다 자동으로 처리합니다. 컴퓨터와 무관하게 동작합니다.

### Q. 기존 워드프레스 블로그에 연결할 수 있나요?
네. Application Password만 발급받으면 바로 연결됩니다. (매뉴얼 STEP 6 참고)

### Q. 티스토리/네이버 블로그에도 올릴 수 있나요?
현재 자동 포스팅은 워드프레스만 지원합니다. 다만 구글 시트에서 글을 생성한 후 복사-붙여넣기로 어떤 블로그든 사용 가능합니다.

---

## 사용 관련

### Q. 한 번에 몇 개까지 생성할 수 있나요?
한 번에 여러 키워드를 입력할 수 있습니다. 6분 실행 제한이 있어 한 번에 약 5~6개가 처리되고, 자동 실행이 켜져 있으면 10분 후 나머지가 이어서 처리됩니다.

### Q. 자동 포스팅하면 바로 공개되나요?
아닙니다. "초안(Draft)" 상태로 올라갑니다. 워드프레스에서 확인 후 직접 "공개"를 눌러야 합니다.

### Q. 글의 품질은 어느 정도인가요?
Gemini AI가 작성한 초안입니다. SEO 구조는 자동으로 맞춰지지만, 전문적인 내용(의학, 법률 등)은 사실 확인이 필요합니다.

### Q. 프롬프트를 직접 바꿀 수 있나요?
"프롬프트 설정" 탭에서 톤, 길이를 변경하거나, "커스텀 프롬프트"에 직접 입력할 수 있습니다. {{keyword}} 자리에 키워드가 자동으로 들어갑니다.

### Q. 이미지 스타일 추천해주세요.
잘 모르겠으면 "일러스트"를 선택하세요. 가장 범용적으로 잘 어울립니다.

### Q. 글 생성에 시간이 얼마나 걸리나요?
- 글만 생성: 약 30초~1분
- 글 + 이미지: 약 1~2분
- 글 + 이미지 + 포스팅: 약 2~3분

---

## 트러블슈팅

### Q. "이 앱은 Google에서 확인하지 않은 앱입니다" 경고가 떠요.
정상입니다. "고급" → "(안전하지 않음)으로 이동"을 클릭하면 됩니다. 구글의 기본 보안 절차이며, 스크립트는 API 호출만 수행합니다.

### Q. 상태가 "대기"에서 변하지 않아요.
1. 메뉴 → "▶️ 글 생성 실행"을 직접 클릭해보세요.
2. "대기"가 정확히 입력되었는지 확인하세요 (앞뒤 공백 주의).
3. 확장 프로그램 → Apps Script → 실행 로그에서 에러를 확인하세요.

### Q. "에러" 상태가 표시돼요.
H열(포스팅 결과)에 에러 메시지가 기록됩니다. 일반적인 원인:
- API 키 오류 → 설정 탭에서 키 확인
- 한도 초과 → 다음 날 재시도
- WordPress 연결 실패 → 주소/비밀번호 확인

---

## 기타

### Q. 생성된 글의 저작권은 누구에게 있나요?
AI가 생성한 글의 저작권은 사용자(구매자)에게 있습니다. 자유롭게 수정, 공개, 상업적 활용이 가능합니다.

### Q. 여러 블로그에 동시에 사용할 수 있나요?
시트를 복사하여 각각 다른 WordPress 정보를 입력하면 됩니다.

### Q. 업데이트는 어떻게 하나요?
업데이트가 있을 경우 크몽을 통해 새 시트 링크를 안내드립니다. 기존 설정값만 새 시트로 옮기면 됩니다.

---

> 💬 이 FAQ에서 답을 찾지 못하셨다면, 크몽 메시지로 문의해주세요!
```

- [ ] **Step 3: 커밋**

```bash
git add docs/user-manual.md docs/faq.md
git commit -m "docs: Apps Script 버전 사용자 매뉴얼 + FAQ 작성"
```

---

### Task 11: 최종 정리 및 커밋

**Files:**
- Verify: 전체 파일 구조 확인

- [ ] **Step 1: 전체 파일 구조 확인**

```bash
find . -not -path './.git/*' -type f | sort
```

예상 결과:
```
./.gitignore
./apps-script/src/Config.gs
./apps-script/src/GeminiAPI.gs
./apps-script/src/Main.gs
./apps-script/src/Prompts.gs
./apps-script/src/Tests.gs
./apps-script/src/Utils.gs
./apps-script/src/WordPress.gs
./archive/n8n-prototype/infrastructure/Caddyfile
./archive/n8n-prototype/infrastructure/docker-compose.yml
./archive/n8n-prototype/infrastructure/.env.example
./archive/n8n-prototype/infrastructure/setup.sh
./archive/n8n-prototype/module-1-content/...
./docs/faq.md
./docs/superpowers/plans/2026-04-04-apps-script-phase1.md
./docs/superpowers/specs/2026-04-04-apps-script-pivot-design.md
./docs/user-manual.md
```

- [ ] **Step 2: git status로 커밋되지 않은 파일 없는지 확인**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: 전체 코드를 실제 Google Sheets에 복사하여 테스트**

Google Sheets에서:
1. 새 시트 생성
2. "⚙️ 설정", "📝 글감 생성", "🎨 프롬프트 설정" 탭 생성
3. 확장 프로그램 → Apps Script → 각 .gs 파일 내용 복사
4. `testConfig()` → `testPrompts()` → `testGeminiText()` 순으로 테스트 실행
5. 전체 파이프라인 테스트: `testFullPipeline()` 실행

---

## Summary

| Task | 내용 | 파일 |
|------|------|------|
| 1 | 프로젝트 구조 변경 | archive/, apps-script/ |
| 2 | Config.gs | 설정 시트 읽기 |
| 3 | Utils.gs | 상태 업데이트, 에러 핸들링 |
| 4 | Prompts.gs | 프롬프트 조합 |
| 5 | GeminiAPI.gs (텍스트) | Gemini 글 생성 + 파싱 |
| 6 | GeminiAPI.gs (이미지) | Imagen 이미지 생성 |
| 7 | WordPress.gs | WP 포스팅 + 미디어 업로드 |
| 8 | Main.gs | 메뉴, 트리거, 실행 루프 |
| 9 | Tests.gs | 모듈별 테스트 함수 |
| 10 | 매뉴얼 + FAQ | 사용자 문서 |
| 11 | 최종 정리 | 구조 확인 + 실제 테스트 |
