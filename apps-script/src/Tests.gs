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

/**
 * 쿠팡 상품 검색 API 테스트.
 * ⚠️ 실제 API를 호출하므로 시간당 10회 제한에 주의.
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

/**
 * 쿠팡 HTML 생성 테스트 (API 호출 없이 로컬 테스트).
 */
function testCoupangBanner() {
  Logger.log('=== 쿠팡 HTML 생성 테스트 ===');

  var testProducts = [
    { productName: '삼성 갤럭시 노트북', productPrice: 1290000, productImage: 'https://example.com/img1.jpg', productUrl: 'https://link.coupang.com/test1', isRocket: true },
    { productName: 'LG 그램 17인치', productPrice: 1590000, productImage: 'https://example.com/img2.jpg', productUrl: 'https://link.coupang.com/test2', isRocket: true },
    { productName: '레노버 씽크패드', productPrice: 890000, productImage: 'https://example.com/img3.jpg', productUrl: 'https://link.coupang.com/test3', isRocket: false }
  ];

  var formatted = formatCoupangPrice(1290000);
  Logger.log('가격 포맷팅: 1290000 → ' + formatted + ' (' + (formatted === '1,290,000' ? '✅' : '❌') + ')');

  var testContent = '<p>첫 번째 문단입니다.</p><p>두 번째 문단입니다.</p><p>세 번째 문단입니다.</p><p>네 번째 문단입니다.</p>';
  var withLinks = insertCoupangTextLinks(testContent, testProducts);
  var hasTextLink = withLinks.indexOf('link.coupang.com') !== -1;
  Logger.log('텍스트 링크 삽입: ' + (hasTextLink ? '✅' : '❌'));

  var cards = buildProductCards(testProducts);
  var hasCards = cards.indexOf('추천 상품') !== -1 && cards.indexOf('삼성 갤럭시') !== -1;
  Logger.log('상품 카드 생성: ' + (hasCards ? '✅' : '❌'));

  var banner = buildDynamicBanner('<script>test</script>');
  var hasBanner = banner.indexOf('<script>test</script>') !== -1;
  Logger.log('다이나믹 배너: ' + (hasBanner ? '✅' : '❌'));

  var emptyBanner = buildDynamicBanner('');
  Logger.log('빈 배너 코드 → 빈 문자열: ' + (emptyBanner === '' ? '✅' : '❌'));

  var finalContent = insertCoupangContent(testContent, testProducts, '<script>banner</script>');
  var hasAll = finalContent.indexOf('link.coupang.com') !== -1 &&
               finalContent.indexOf('추천 상품') !== -1 &&
               finalContent.indexOf('쿠팡 파트너스 활동') !== -1 &&
               finalContent.indexOf('<script>banner</script>') !== -1;
  Logger.log('통합 함수: ' + (hasAll ? '✅' : '❌'));

  var noProducts = insertCoupangContent(testContent, [], '');
  Logger.log('빈 상품 배열 → 원본 유지: ' + (noProducts === testContent ? '✅' : '❌'));

  Logger.log('=== 쿠팡 HTML 생성 테스트 완료 ===');
}

/**
 * 쿠팡 파트너스 전체 통합 테스트.
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

  Logger.log('1) 상품 검색: "' + keyword + '"');
  var products = searchCoupangProducts(keyword, config);
  Logger.log('   결과: ' + products.length + '개');

  if (products.length === 0) {
    Logger.log('⚠️ 검색 결과 없음 — 통합 테스트 중단');
    return;
  }

  var testContent = '<h1>무선 이어폰 추천</h1><p>요즘 무선 이어폰이 대세입니다.</p><p>다양한 제품을 비교해보겠습니다.</p><p>음질, 배터리, 착용감이 중요합니다.</p><p>가성비도 놓칠 수 없죠.</p>';

  Logger.log('2) HTML 삽입 테스트');
  var finalContent = insertCoupangContent(testContent, products, config.coupangBannerCode);

  var hasTextLinks = finalContent.indexOf('link.coupang.com') !== -1 || finalContent.indexOf('coupa.ng') !== -1;
  var hasProductCards = finalContent.indexOf('추천 상품') !== -1;
  var hasDisclosure = finalContent.indexOf('쿠팡 파트너스 활동') !== -1;

  Logger.log('   텍스트 링크: ' + (hasTextLinks ? '✅' : '❌'));
  Logger.log('   상품 카드: ' + (hasProductCards ? '✅' : '❌'));
  Logger.log('   파트너스 문구: ' + (hasDisclosure ? '✅' : '❌'));

  Logger.log('3) HTML 미리보기:');
  Logger.log(finalContent.substring(0, 500) + '...');

  if (hasTextLinks && hasProductCards && hasDisclosure) {
    Logger.log('✅ 쿠팡 파트너스 통합 테스트 통과');
  } else {
    Logger.log('❌ 쿠팡 파트너스 통합 테스트 실패');
  }
}
