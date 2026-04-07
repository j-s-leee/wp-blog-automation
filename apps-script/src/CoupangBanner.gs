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
 * 본문 중간 지점에 쿠팡 텍스트 링크를 삽입한다.
 * @param {string} content - 원본 HTML 콘텐츠
 * @param {Array} products - 상품 배열
 * @return {string} 텍스트 링크가 삽입된 HTML
 */
function insertCoupangTextLinks(content, products) {
  if (!products || products.length === 0) return content;

  var positions = [];
  var searchFrom = 0;
  while (true) {
    var idx = content.indexOf('</p>', searchFrom);
    if (idx === -1) break;
    positions.push(idx + 4); // </p> 태그 뒤 삽입 위치
    searchFrom = idx + 4;
  }

  if (positions.length === 0) return content;

  var midIndex = Math.floor(positions.length * 0.5);
  var insertPos = positions[midIndex];

  var linksHtml = '';
  var count = Math.min(products.length, 2);
  for (var i = 0; i < count; i++) {
    var p = products[i];
    var formattedPrice = formatCoupangPrice(p.price);
    var rocketBadge = p.isRocket
      ? ' <span style="background: #00a0e0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 11px;">🚀 로켓배송</span>'
      : '';
    linksHtml +=
      '<p style="background: #f8f9fa; padding: 12px 16px; border-left: 4px solid #00a0e0; margin: 15px 0;">' +
      '👉 <a href="' + p.productUrl + '" target="_blank" rel="noopener noreferrer" ' +
      'style="color: #1a73e8; font-weight: bold; text-decoration: none;">' + p.productName + '</a>' +
      ' — <strong style="color: #e74c3c;">' + formattedPrice + '원</strong>' +
      rocketBadge +
      '</p>';
  }

  return content.slice(0, insertPos) + linksHtml + content.slice(insertPos);
}

/**
 * 상품 카드 HTML을 생성한다.
 * @param {Array} products - 상품 배열
 * @return {string} 상품 카드 HTML
 */
function buildProductCards(products) {
  if (!products || products.length === 0) return '';

  var items = products.slice(0, 3);
  var cardsHtml = '';

  for (var i = 0; i < items.length; i++) {
    var p = items[i];
    var formattedPrice = formatCoupangPrice(p.price);
    var isLast = (i === items.length - 1);
    var borderStyle = isLast ? '' : 'border-bottom: 1px solid #e0e0e0;';
    var rocketBadge = p.isRocket
      ? ' <span style="background: #00a0e0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 11px;">🚀 로켓배송</span>'
      : '';

    cardsHtml +=
      '<div style="display: flex; align-items: center; padding: 15px 0; ' + borderStyle + '">' +
      '<img src="' + p.productImage + '" alt="' + p.productName + '" ' +
      'style="width: 100px; height: 100px; object-fit: contain; margin-right: 15px; flex-shrink: 0;" />' +
      '<div style="flex: 1;">' +
      '<a href="' + p.productUrl + '" target="_blank" rel="noopener noreferrer" ' +
      'style="color: #333; font-weight: bold; text-decoration: none; font-size: 15px;">' +
      p.productName + '</a>' +
      '<div style="margin-top: 6px;">' +
      '<strong style="color: #e74c3c; font-size: 16px;">' + formattedPrice + '원</strong>' +
      rocketBadge +
      '</div>' +
      '</div>' +
      '</div>';
  }

  return (
    '<div style="margin: 30px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa;">' +
    '<h3 style="margin-top: 0; font-size: 18px; color: #333;">🛒 추천 상품</h3>' +
    cardsHtml +
    '</div>'
  );
}

/**
 * 다이나믹 배너 HTML을 생성한다.
 * @param {string} bannerCode - 배너 코드
 * @return {string} 배너 HTML
 */
function buildDynamicBanner(bannerCode) {
  if (!bannerCode) return '';

  return (
    '<div style="text-align: center; margin: 20px 0;">' +
    bannerCode +
    '</div>'
  );
}

/**
 * 쿠팡 섹션 전체(상품 카드 + 배너 + 고지문)를 조합한다.
 * @param {Array} products - 상품 배열
 * @param {string} bannerCode - 배너 코드
 * @return {string} 쿠팡 섹션 HTML
 */
function assembleCoupangSection(products, bannerCode) {
  var productCards = buildProductCards(products);
  var dynamicBanner = buildDynamicBanner(bannerCode);
  var disclosure =
    '<p style="font-size: 11px; color: #999; text-align: center; margin-top: 10px;">' +
    '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' +
    '</p>';

  return (
    '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />' +
    productCards +
    dynamicBanner +
    disclosure
  );
}

/**
 * 본문에 쿠팡 텍스트 링크(중간)와 하단 섹션을 삽입한다.
 * @param {string} content - 원본 HTML 콘텐츠
 * @param {Array} products - 상품 배열
 * @param {string} bannerCode - 배너 코드
 * @return {string} 쿠팡 콘텐츠가 삽입된 HTML
 */
function insertCoupangContent(content, products, bannerCode) {
  if (!products || products.length === 0) return content;

  var withLinks = insertCoupangTextLinks(content, products);
  var bottomSection = assembleCoupangSection(products, bannerCode);

  return withLinks + bottomSection;
}
