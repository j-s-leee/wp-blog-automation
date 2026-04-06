/**
 * ImageSearch.gs — Pexels API를 사용한 무료 스톡 이미지 검색
 *
 * Pexels API: https://www.pexels.com/api/
 * 무료 한도: 월 20,000회
 */

var PEXELS_API_URL = 'https://api.pexels.com/v1/search';

/**
 * Pexels API로 키워드 관련 이미지를 검색한다.
 * @param {string} keyword - 검색 키워드
 * @param {string} apiKey - Pexels API 키
 * @param {number} count - 가져올 이미지 수 (기본 3)
 * @returns {Array<{url: string, alt: string}>} 이미지 URL과 alt 텍스트 배열
 */
function searchImages(keyword, apiKey, count) {
  count = count || 3;

  var url = PEXELS_API_URL + '?query=' + encodeURIComponent(keyword) + '&per_page=' + count + '&locale=ko-KR';

  var options = {
    method: 'get',
    headers: {
      'Authorization': apiKey
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error('Pexels API 오류 (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var json = JSON.parse(response.getContentText());

  if (!json.photos || json.photos.length === 0) {
    Logger.log('Pexels에서 "' + keyword + '" 관련 이미지를 찾지 못했습니다.');
    return [];
  }

  var images = [];
  for (var i = 0; i < json.photos.length; i++) {
    var photo = json.photos[i];
    images.push({
      url: photo.src.large,
      alt: photo.alt || keyword
    });
  }

  return images;
}

/**
 * 키워드로 블로그용 이미지 세트를 검색한다.
 * 썸네일 1장 + 본문 이미지 2장을 반환.
 * @param {string} keyword - 글감 키워드
 * @param {string} apiKey - Pexels API 키
 * @returns {{ thumbnailUrl: string, bodyImageUrls: string[] }}
 */
function searchImageSet(keyword, apiKey) {
  var images = searchImages(keyword, apiKey, 3);

  var result = {
    thumbnailUrl: '',
    bodyImageUrls: []
  };

  if (images.length >= 1) {
    result.thumbnailUrl = images[0].url;
  }
  if (images.length >= 2) {
    result.bodyImageUrls.push(images[1].url);
  }
  if (images.length >= 3) {
    result.bodyImageUrls.push(images[2].url);
  }

  return result;
}
