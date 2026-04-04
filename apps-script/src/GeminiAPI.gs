/**
 * GeminiAPI.gs - Gemini text generation and Imagen image generation module
 * Handles all Gemini API communication for blog content and images
 */

var GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
var IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';

/**
 * Generates blog content via Gemini text API.
 *
 * @param {string} prompt - The full prompt to send to Gemini
 * @param {string} apiKey - Gemini API key
 * @return {Object} Object with keys:
 *   - title: Extracted blog post title
 *   - content: HTML blog body content
 */
function generateContent(prompt, apiKey) {
  var url = GEMINI_TEXT_URL + '?key=' + apiKey;

  var payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
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
    throw new Error(
      'Gemini text API error: HTTP ' + statusCode + ' - ' + response.getContentText()
    );
  }

  var json = JSON.parse(response.getContentText());
  var text = json.candidates[0].content.parts[0].text;

  return parseGeneratedContent(text);
}

/**
 * Parses the raw text from Gemini into title and content.
 * Expects format: "제목: [title]\n---\n[HTML body]"
 * Falls back to using the first line as title if pattern not found.
 * Strips ```html code block wrappers if present.
 *
 * @param {string} text - Raw text output from Gemini
 * @return {Object} Object with keys:
 *   - title: Blog post title
 *   - content: HTML blog body content
 */
function parseGeneratedContent(text) {
  // Strip ```html ... ``` code block wrappers if present
  text = text.replace(/^```html\s*/i, '').replace(/\s*```\s*$/, '').trim();
  text = text.replace(/^```\s*/i, '').replace(/\s*```\s*$/, '').trim();

  var title = '';
  var content = '';

  // Look for "제목:" line followed by "---" separator
  var titleMatch = text.match(/^제목:\s*(.+)/m);
  var separatorIndex = text.indexOf('---');

  if (titleMatch && separatorIndex !== -1) {
    title = titleMatch[1].trim();
    content = text.substring(separatorIndex + 3).trim();
  } else {
    // Fallback: use first line as title, rest as content
    var lines = text.split('\n');
    title = lines[0].replace(/^제목:\s*/i, '').trim();
    content = lines.slice(1).join('\n').trim();
  }

  return {
    title: title,
    content: content
  };
}

/**
 * Generates a single image via Imagen API.
 *
 * @param {string} prompt - Image generation prompt
 * @param {string} apiKey - Gemini API key
 * @param {string} aspectRatio - Aspect ratio string (default: "16:9")
 * @return {Object} Object with keys:
 *   - base64: Base64-encoded image data
 *   - mimeType: MIME type of the image (e.g., "image/png")
 */
function generateImage(prompt, apiKey, aspectRatio) {
  var url = IMAGEN_URL + '?key=' + apiKey;

  var payload = {
    instances: [
      { prompt: prompt }
    ],
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

  if (statusCode !== 200 && statusCode !== 201) {
    throw new Error(
      'Imagen API error: HTTP ' + statusCode + ' - ' + response.getContentText()
    );
  }

  var json = JSON.parse(response.getContentText());
  var prediction = json.predictions[0];

  return {
    base64: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType || 'image/png'
  };
}

/**
 * Generates a set of 3 images for a blog post: 1 thumbnail + 2 body images.
 * Adds 3-second delays between API calls to respect rate limits.
 *
 * @param {string} keyword - The blog keyword/topic
 * @param {string} style - Image style (일러스트|사진풍|미니멀)
 * @param {string} apiKey - Gemini API key
 * @return {Object} Object with keys:
 *   - thumbnail: { base64, mimeType } — 16:9 thumbnail image
 *   - body1: { base64, mimeType } — 4:3 first body image
 *   - body2: { base64, mimeType } — 4:3 second body image
 */
function generateImageSet(keyword, style, apiKey) {
  var thumbnailPrompt = buildImagePrompt(keyword, style, 'thumbnail');
  var bodyPrompt1 = buildImagePrompt(keyword, style, 'body');
  var bodyPrompt2 = buildImagePrompt(keyword, style, 'body');

  var thumbnail = generateImage(thumbnailPrompt, apiKey, '16:9');

  Utilities.sleep(3000);

  var body1 = generateImage(bodyPrompt1, apiKey, '4:3');

  Utilities.sleep(3000);

  var body2 = generateImage(bodyPrompt2, apiKey, '4:3');

  return {
    thumbnail: thumbnail,
    body1: body1,
    body2: body2
  };
}

/**
 * Replaces [IMAGE_1] and [IMAGE_2] placeholders in HTML content with
 * <figure><img> tags using the provided image URLs. Any remaining
 * [IMAGE_N] placeholders beyond the provided URLs are removed.
 *
 * @param {string} content - HTML blog content with [IMAGE_N] placeholders
 * @param {string[]} imageUrls - Array of image URLs indexed by position
 * @param {string} keyword - Blog keyword used as alt text context
 * @return {string} HTML content with placeholders replaced
 */
function insertImagesIntoContent(content, imageUrls, keyword) {
  var result = content;

  // Replace each [IMAGE_N] placeholder with a figure/img tag
  for (var i = 0; i < imageUrls.length; i++) {
    var placeholder = '[IMAGE_' + (i + 1) + ']';
    var altText = keyword + ' 이미지 ' + (i + 1);
    var imgTag =
      '<figure>' +
        '<img src="' + imageUrls[i] + '" alt="' + altText + '" style="max-width:100%;height:auto;" />' +
      '</figure>';
    result = result.split(placeholder).join(imgTag);
  }

  // Remove any remaining [IMAGE_N] placeholders not covered by provided URLs
  result = result.replace(/\[IMAGE_\d+\]/g, '');

  return result;
}
