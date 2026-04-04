/**
 * Tests.gs - Test functions for blog automation modules
 * Run these functions one by one from Google Apps Script editor
 * Check Logger output to verify each module works correctly
 */

/**
 * Test 1: Config module - verify all configuration values are readable
 * Logs: all config values (API key masked), hasGeminiKey(), hasWordPressConfig()
 */
function testConfig() {
  Logger.log('=== testConfig 테스트 ===');

  try {
    var config = getConfig();

    // Log config values (mask API key for security)
    Logger.log('Gemini API Key: ' + maskApiKey(config.geminiApiKey));
    Logger.log('WordPress URL: ' + config.wpUrl);
    Logger.log('WordPress User: ' + config.wpUser);
    Logger.log('WordPress App Password: ' + (config.wpAppPassword ? '***' : '[없음]'));

    // Log validation functions
    Logger.log('');
    Logger.log('hasGeminiKey(): ' + hasGeminiKey());
    Logger.log('hasWordPressConfig(): ' + hasWordPressConfig());

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testConfig 테스트 완료 ===');
}

/**
 * Test 2: Prompts module - verify prompt settings and builders work
 * Logs: prompt settings, sample content prompt, sample image prompt
 */
function testPrompts() {
  Logger.log('=== testPrompts 테스트 ===');

  try {
    var settings = getPromptSettings();

    Logger.log('Prompt Settings:');
    Logger.log('  - Tone: ' + settings.tone);
    Logger.log('  - Length: ' + settings.length);
    Logger.log('  - Custom Prompt: ' + (settings.customPrompt || '[없음]'));
    Logger.log('');

    // Test content prompt builder
    var keyword = '겨울 제주도 여행';
    var contentPrompt = buildContentPrompt(keyword, true);
    Logger.log('Content Prompt (first 200 chars):');
    Logger.log(contentPrompt.substring(0, 200));
    Logger.log('');

    // Test image prompt builder
    var imagePrompt = buildImagePrompt('겨울 제주도 여행', '일러스트', 'thumbnail');
    Logger.log('Image Prompt (first 200 chars):');
    Logger.log(imagePrompt.substring(0, 200));

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testPrompts 테스트 완료 ===');
}

/**
 * Test 3: Gemini Text API - real API call to generate blog content
 * Logs: title and content length, first 300 chars of content
 * ⚠️ WARNING: This makes a real API call to Gemini
 */
function testGeminiText() {
  Logger.log('=== testGeminiText 테스트 ===');

  // Check prerequisites
  if (!hasGeminiKey()) {
    Logger.log('스킵: Gemini API 키가 설정되지 않았습니다.');
    Logger.log('=== testGeminiText 테스트 완료 ===');
    return;
  }

  try {
    var config = getConfig();
    var keyword = '테스트 키워드: 아침 운동의 효과';

    Logger.log('API 호출 중... (키워드: ' + keyword + ')');

    var prompt = buildContentPrompt(keyword, false);
    var result = generateContent(prompt, config.geminiApiKey);

    Logger.log('제목: ' + result.title);
    Logger.log('내용 길이: ' + result.content.length + ' 문자');
    Logger.log('내용 (첫 300자):');
    Logger.log(result.content.substring(0, 300));

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testGeminiText 테스트 완료 ===');
}

/**
 * Test 4: Imagen API - real API call to generate image
 * Logs: success status, mimeType, base64 data length
 * ⚠️ WARNING: This makes a real API call to Imagen
 */
function testImagen() {
  Logger.log('=== testImagen 테스트 ===');

  // Check prerequisites
  if (!hasGeminiKey()) {
    Logger.log('스킵: Gemini API 키가 설정되지 않았습니다.');
    Logger.log('=== testImagen 테스트 완료 ===');
    return;
  }

  try {
    var config = getConfig();
    var keyword = '아침 운동';
    var style = '일러스트';
    var type = 'thumbnail';

    Logger.log('이미지 생성 중... (키워드: ' + keyword + ', 스타일: ' + style + ')');

    var imagePrompt = buildImagePrompt(keyword, style, type);
    var result = generateImage(imagePrompt, config.geminiApiKey, '16:9');

    Logger.log('성공: true');
    Logger.log('mimeType: ' + result.mimeType);
    Logger.log('base64 데이터 길이: ' + result.base64.length + ' 문자');

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testImagen 테스트 완료 ===');
}

/**
 * Test 5: WordPress Connection - test WordPress REST API connectivity
 * Logs: HTTP status, success/failure message
 * ⚠️ WARNING: This makes a real request to your WordPress site
 */
function testWordPressConnection() {
  Logger.log('=== testWordPressConnection 테스트 ===');

  // Check prerequisites
  if (!hasWordPressConfig()) {
    Logger.log('스킵: WordPress 설정이 완료되지 않았습니다.');
    Logger.log('=== testWordPressConnection 테스트 완료 ===');
    return;
  }

  try {
    var config = getConfig();
    var endpoint = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts?per_page=1';

    Logger.log('WordPress 연결 테스트 중... (' + config.wpUrl + ')');

    var authToken = Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);
    var options = {
      headers: {
        'Authorization': 'Basic ' + authToken
      },
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(endpoint, options);
    var statusCode = response.getResponseCode();

    Logger.log('HTTP 상태: ' + statusCode);

    if (statusCode === 200) {
      Logger.log('결과: WordPress 연결 성공');
      var data = JSON.parse(response.getContentText());
      Logger.log('응답 항목 수: ' + data.length);
    } else {
      Logger.log('결과: 연결 실패');
      Logger.log('응답: ' + response.getContentText());
    }

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testWordPressConnection 테스트 완료 ===');
}

/**
 * Test 6: Full Pipeline - complete flow from pending row to processing
 * Logs: start/end messages, processing results
 * ⚠️ WARNING: This makes real API calls and may modify your sheet
 */
function testFullPipeline() {
  Logger.log('=== testFullPipeline 테스트 ===');

  // Check prerequisites
  if (!hasGeminiKey()) {
    Logger.log('스킵: Gemini API 키가 설정되지 않았습니다.');
    Logger.log('=== testFullPipeline 테스트 완료 ===');
    return;
  }

  try {
    var config = getConfig();
    var pendingRows = getPendingRows();

    if (pendingRows.length === 0) {
      Logger.log('스킵: 대기 중인 행이 없습니다.');
      Logger.log('=== testFullPipeline 테스트 완료 ===');
      return;
    }

    var row = pendingRows[0];
    Logger.log('테스트 시작 - 행: ' + row.row + ', 키워드: ' + row.keyword);

    // In production, this would call processRow(row, config)
    // For now, just log the row data
    Logger.log('');
    Logger.log('행 데이터:');
    Logger.log('  - Row number: ' + row.row);
    Logger.log('  - Keyword: ' + row.keyword);
    Logger.log('  - Image Generate: ' + row.imageGen);
    Logger.log('  - Image Style: ' + row.imageStyle);
    Logger.log('  - Auto Post: ' + row.autoPost);

    Logger.log('');
    Logger.log('NOTE: processRow() 함수는 Main.gs에서 정의해야 합니다.');
    Logger.log('이 테스트는 행 데이터를 확인하고 있습니다.');

  } catch (e) {
    Logger.log('에러: ' + e.message);
  }

  Logger.log('=== testFullPipeline 테스트 완료 ===');
}

/**
 * Helper function: Mask API key to first 8 characters for security
 * @param {string} apiKey
 * @return {string}
 */
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length === 0) {
    return '[없음]';
  }
  if (apiKey.length <= 8) {
    return '****';
  }
  return apiKey.substring(0, 8) + '****';
}
