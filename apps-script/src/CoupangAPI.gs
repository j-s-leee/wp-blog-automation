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
