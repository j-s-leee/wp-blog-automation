/**
 * WordPress.gs - WordPress REST API integration
 * Handles image uploads and post creation via WP REST API.
 */

/**
 * Uploads a base64-encoded image to the WordPress media library.
 *
 * @param {string} base64Data - Base64-encoded image data
 * @param {string} mimeType   - MIME type (e.g. 'image/jpeg')
 * @param {string} filename   - Desired filename for the media item
 * @param {Object} config     - Config object with wpUrl, wpUser, wpAppPassword
 * @return {{ id: number, url: string }} Uploaded media ID and source URL
 */
function uploadImageToWordPress(base64Data, mimeType, filename, config) {
  var baseUrl = config.wpUrl.replace(/\/$/, '');
  var endpoint = baseUrl + '/wp-json/wp/v2/media';

  var authToken = Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);
  var imageBytes = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename).getBytes();

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + authToken,
      'Content-Disposition': 'attachment; filename="' + filename + '"'
    },
    contentType: mimeType,
    payload: imageBytes,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(endpoint, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 201) {
    throw new Error(
      'Image upload failed (' + statusCode + '): ' + response.getContentText()
    );
  }

  var data = JSON.parse(response.getContentText());
  var url = (data.source_url) || (data.guid && data.guid.rendered) || '';

  return { id: data.id, url: url };
}

/**
 * Creates a WordPress post as a draft.
 *
 * @param {string} title           - Post title
 * @param {string} content         - Post HTML content
 * @param {number|null} featuredMediaId - Media ID to set as featured image (0 if none)
 * @param {Object} config          - Config object with wpUrl, wpUser, wpAppPassword
 * @return {{ id: number, link: string }} Created post ID and permalink
 */
function postToWordPress(title, content, featuredMediaId, config, metaDescription) {
  var baseUrl = config.wpUrl.replace(/\/$/, '');
  var endpoint = baseUrl + '/wp-json/wp/v2/posts';

  var authToken = Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);

  var body = {
    title: title,
    content: content,
    status: 'draft',
    featured_media: featuredMediaId || 0,
    excerpt: metaDescription || ''
  };

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + authToken
    },
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(endpoint, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 201) {
    throw new Error(
      'Post creation failed (' + statusCode + '): ' + response.getContentText()
    );
  }

  var data = JSON.parse(response.getContentText());

  return { id: data.id, link: data.link };
}

/**
 * Full publish flow: uploads images, injects them into content, and creates a draft post.
 *
 * @param {string} title    - Post title
 * @param {string} content  - Post HTML content (may contain image placeholders)
 * @param {Object} imageSet - Object with optional keys: thumbnail, body1, body2
 *                            Each value: { base64Data, mimeType } or null
 * @param {string} keyword  - Keyword used for safe filename generation
 * @param {Object} config   - Config object with wpUrl, wpUser, wpAppPassword
 * @return {string} Result message, e.g. '포스팅 완료 (ID: 123)'
 */
function publishToWordPress(title, content, imageSet, keyword, config, metaDescription) {
  var safeKeyword = keyword.replace(/[^a-zA-Z0-9가-힣]/g, '-');
  var timestamp = Date.now();

  var featuredMediaId = 0;
  var uploadedImageUrls = [];

  // Upload thumbnail → featured image
  if (imageSet && imageSet.thumbnail) {
    var thumbFilename = safeKeyword + '-thumb-' + timestamp + '.' + _mimeToExt(imageSet.thumbnail.mimeType);
    var thumbResult = uploadImageToWordPress(
      imageSet.thumbnail.base64Data,
      imageSet.thumbnail.mimeType,
      thumbFilename,
      config
    );
    featuredMediaId = thumbResult.id;
  }

  // Upload body images and collect their URLs
  if (imageSet && imageSet.body1) {
    var body1Filename = safeKeyword + '-body1-' + timestamp + '.' + _mimeToExt(imageSet.body1.mimeType);
    var body1Result = uploadImageToWordPress(
      imageSet.body1.base64Data,
      imageSet.body1.mimeType,
      body1Filename,
      config
    );
    uploadedImageUrls.push(body1Result.url);
  }

  if (imageSet && imageSet.body2) {
    var body2Filename = safeKeyword + '-body2-' + timestamp + '.' + _mimeToExt(imageSet.body2.mimeType);
    var body2Result = uploadImageToWordPress(
      imageSet.body2.base64Data,
      imageSet.body2.mimeType,
      body2Filename,
      config
    );
    uploadedImageUrls.push(body2Result.url);
  }

  // Replace image placeholders in content with uploaded URLs
  var finalContent = content;
  if (uploadedImageUrls.length > 0) {
    finalContent = insertImagesIntoContent(content, uploadedImageUrls, keyword);
  }

  // Create the draft post
  var postResult = postToWordPress(title, finalContent, featuredMediaId, config, metaDescription);

  return '포스팅 완료 (ID: ' + postResult.id + ')';
}

/**
 * Searches existing WordPress posts by keyword for internal linking.
 *
 * @param {string} keyword - Search keyword
 * @param {Object} config - Config object with wpUrl, wpUser, wpAppPassword
 * @param {number} count - Max posts to return (default 3)
 * @return {Array<{title: string, url: string}>} Existing posts matching keyword
 */
function searchExistingPosts(keyword, config) {
  var baseUrl = config.wpUrl.replace(/\/$/, '');
  var endpoint = baseUrl + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(keyword) + '&per_page=3&status=publish&_fields=id,title,link';

  var authToken = Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);

  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + authToken
    },
    muteHttpExceptions: true
  };

  var response;
  try {
    response = UrlFetchApp.fetch(endpoint, options);
  } catch (e) {
    Logger.log('기존 글 검색 오류: ' + e.message);
    return [];
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('기존 글 검색 실패 (HTTP ' + response.getResponseCode() + ')');
    return [];
  }

  var posts = JSON.parse(response.getContentText());
  var results = [];

  for (var i = 0; i < posts.length; i++) {
    results.push({
      title: posts[i].title.rendered || '',
      url: posts[i].link || ''
    });
  }

  Logger.log('내부 링크용 기존 글 ' + results.length + '개 검색됨');
  return results;
}

/**
 * Maps a MIME type to a file extension string.
 * @param {string} mimeType
 * @return {string}
 */
function _mimeToExt(mimeType) {
  var map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
  };
  return map[mimeType] || 'jpg';
}
