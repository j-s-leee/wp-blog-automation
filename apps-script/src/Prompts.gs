/**
 * Prompts.gs - Prompt configuration and building module
 * Manages prompt settings and generates content/image prompts for Gemini API
 */

/**
 * Reads prompt settings from the "프롬프트 설정" sheet.
 * Sheet structure:
 *   Row 1: 글 톤 | 친근한 (options: 친근한/전문적/캐주얼)
 *   Row 2: 글 길이 | 2000자 (options: 1500자/2000자/3000자)
 *   Row 3: 커스텀 프롬프트 | (optional, uses {{keyword}} placeholder)
 *
 * @return {Object} Object with keys:
 *   - tone: 친근한|전문적|캐주얼 (default: 친근한)
 *   - length: 1500자|2000자|3000자 (default: 2000자)
 *   - customPrompt: Custom prompt string or empty string (optional)
 */
function getPromptSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PROMPT_SHEET_NAME);

  var settings = {
    tone: '친근한',
    length: '2000자',
    customPrompt: ''
  };

  if (!sheet) {
    // Sheet not found, return defaults
    return settings;
  }

  try {
    // Get the range with settings (A:B, rows 1-3)
    var data = sheet.getRange('A1:B3').getValues();

    // Parse tone (Row 1, Column B)
    if (data[0][1]) {
      var toneValue = data[0][1].toString().trim();
      if (toneValue === '친근한' || toneValue === '전문적' || toneValue === '캐주얼') {
        settings.tone = toneValue;
      }
    }

    // Parse length (Row 2, Column B)
    if (data[1][1]) {
      var lengthValue = data[1][1].toString().trim();
      if (lengthValue === '1500자' || lengthValue === '2000자' || lengthValue === '3000자') {
        settings.length = lengthValue;
      }
    }

    // Parse custom prompt (Row 3, Column B)
    if (data[2][1]) {
      settings.customPrompt = data[2][1].toString().trim();
    }
  } catch (e) {
    // Error reading sheet, return defaults
    Logger.log('Error reading prompt settings: ' + e);
  }

  return settings;
}

/**
 * Builds the full prompt string for blog content generation.
 * Uses custom prompt if configured, otherwise builds a Korean SEO blog prompt.
 *
 * @param {string} keyword - The blog keyword/topic
 * @param {boolean} includeImagePlaceholders - If true, adds instruction for [IMAGE_*] placeholders
 * @return {string} The complete prompt for Gemini API
 */
function buildContentPrompt(keyword, includeImagePlaceholders) {
  var settings = getPromptSettings();
  var customPrompt = settings.customPrompt;

  if (customPrompt) {
    // Use custom prompt, replacing {{keyword}} placeholder
    return customPrompt.replace(/\{\{keyword\}\}/g, keyword);
  }

  // Build default Korean SEO blog prompt
  var toneDescription = getToneDescription(settings.tone);
  var lengthNumber = extractLength(settings.length);

  var prompt = '다음 키워드로 한국 SEO에 최적화된 블로그 글을 작성하세요.\n\n';
  prompt += '키워드: ' + keyword + '\n';
  prompt += '글 길이: 약 ' + lengthNumber + '자\n';
  prompt += '톤: ' + toneDescription + '\n\n';

  prompt += '요청 사항:\n';
  prompt += '1. SEO 최적화: 주요 키워드를 자연스럽게 포함하되, 과도하게 반복하지 마세요.\n';
  prompt += '2. 구조: H1, H2, H3 제목으로 계층적으로 구성하세요.\n';
  prompt += '3. 읽기 쉽게: 단락은 2-3문장으로 짧게, 불릿 포인트 활용하세요.\n';
  prompt += '4. 가치: 독자에게 실질적인 정보와 인사이트를 제공하세요.\n';
  prompt += '5. HTML 형식: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> 등 적절한 HTML 태그로 작성하세요.\n\n';

  if (includeImagePlaceholders) {
    prompt += '6. 이미지 플레이스홀더: 적절한 위치에 [IMAGE_1], [IMAGE_2] 등의 플레이스홀더를 삽입하세요.\n\n';
  }

  prompt += '출력 형식:\n';
  prompt += '제목: [블로그 글 제목]\n';
  prompt += '---\n';
  prompt += '[HTML 본문]\n\n';

  prompt += '글을 작성해주세요.';

  return prompt;
}

/**
 * Builds an image generation prompt for Gemini or external image API.
 *
 * @param {string} keyword - The blog keyword/topic
 * @param {string} style - Illustration style (일러스트|사진풍|미니멀)
 * @param {string} type - Image type (thumbnail|body)
 * @return {string} The complete prompt for image generation
 */
function buildImagePrompt(keyword, style, type) {
  var styleDescription = getStyleDescription(style);

  var prompt = 'Create a blog image about "' + keyword + '" with the following requirements:\n\n';
  prompt += 'Style: ' + styleDescription + '\n';

  if (type === 'thumbnail') {
    prompt += 'Type: Blog thumbnail, eye-catching, 16:9 aspect ratio\n';
  } else if (type === 'body') {
    prompt += 'Type: Blog illustration, informative\n';
  }

  prompt += '\nThe image should:\n';
  prompt += '- Be relevant to the topic "' + keyword + '"\n';
  prompt += '- Grab attention and encourage clicks\n';
  prompt += '- Be suitable for a professional blog\n';
  prompt += '- Have good color balance and contrast\n\n';

  prompt += 'Generate the image now.';

  return prompt;
}

/**
 * Maps tone setting to Korean description.
 * @private
 * @param {string} tone - The tone setting (친근한|전문적|캐주얼)
 * @return {string} Korean description of the tone
 */
function getToneDescription(tone) {
  switch (tone) {
    case '친근한':
      return '독자에게 말하듯 친근하고 부드러운 톤';
    case '전문적':
      return '전문가가 설명하듯 신뢰감 있는 톤';
    case '캐주얼':
      return '친구에게 이야기하듯 가볍고 재미있는 톤';
    default:
      return '독자에게 말하듯 친근하고 부드러운 톤';
  }
}

/**
 * Maps style setting to English description.
 * @private
 * @param {string} style - The style setting (일러스트|사진풍|미니멀)
 * @return {string} English description of the style
 */
function getStyleDescription(style) {
  switch (style) {
    case '일러스트':
      return 'flat illustration style, clean lines, modern design, vibrant colors, digital art';
    case '사진풍':
      return 'professional photography style, high quality, realistic, well-lit, sharp focus';
    case '미니멀':
      return 'minimal design, simple shapes, white background, clean aesthetic, modern';
    default:
      return 'flat illustration style, clean lines, modern design, vibrant colors, digital art';
  }
}

/**
 * Extracts numeric length from length string (e.g., "2000자" -> "2000").
 * @private
 * @param {string} lengthStr - The length string (1500자|2000자|3000자)
 * @return {string} The numeric part
 */
function extractLength(lengthStr) {
  return lengthStr.replace(/[^0-9]/g, '');
}
