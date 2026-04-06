/**
 * Main.gs - Orchestration module
 * Menu setup, trigger management, and the main content generation loop.
 */

/**
 * Creates the custom menu in the spreadsheet UI when the document is opened.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 블로그 자동화')
    .addItem('▶️ 글 생성 실행', 'runContentGeneration')
    .addSeparator()
    .addItem('⏰ 자동 실행 켜기 (10분 간격)', 'enableAutoTrigger')
    .addItem('⏹️ 자동 실행 끄기', 'disableAutoTrigger')
    .addSeparator()
    .addItem('🔑 설정 확인', 'checkSettings')
    .addToUi();
}

/**
 * Main content generation loop.
 * Iterates over all pending rows and processes each one, stopping early if
 * the Apps Script execution time limit is approaching.
 */
function runContentGeneration() {
  if (!hasGeminiKey()) {
    SpreadsheetApp.getUi().alert('Gemini API 키가 설정되지 않았습니다. "설정" 시트에서 API 키를 입력해 주세요.');
    return;
  }

  var config = getConfig();
  var pendingRows = getPendingRows();

  if (pendingRows.length === 0) {
    SpreadsheetApp.getUi().alert('처리할 대기 항목이 없습니다. "글감 생성" 시트에서 상태를 "대기"로 설정해 주세요.');
    return;
  }

  var startTime = Date.now();

  for (var i = 0; i < pendingRows.length; i++) {
    if (isNearTimeLimit(startTime)) {
      var remaining = pendingRows.length - i;
      Logger.log('시간 제한 접근: 남은 항목 ' + remaining + '개. 다음 실행 시 계속됩니다.');
      break;
    }

    processRow(pendingRows[i], config);
  }
}

/**
 * Processes a single row: generates content, optionally generates images,
 * and optionally publishes to WordPress.
 *
 * @param {Object} row    - Row object from getPendingRows(): {row, keyword, imageGen, imageStyle, autoPost}
 * @param {Object} config - Config object from getConfig()
 */
function processRow(row, config) {
  try {
    updateRowStatus(row.row, '처리 중');

    var needsImages  = (row.imageGen  === 'Y' || row.imageGen  === 'y');
    var needsPosting = (row.autoPost  === 'Y' || row.autoPost  === 'y');

    // --- 1. Generate text content ---
    var prompt = buildContentPrompt(row.keyword, needsImages);
    var generated = generateContent(prompt, config.geminiApiKey);
    var title   = generated.title;
    var content = generated.content;

    // --- 2. 이미지 검색 (Pexels 무료 스톡 이미지) ---
    var imageResult = null;
    if (needsImages && hasPexelsKey()) {
      imageResult = searchImageSet(row.keyword, config.pexelsApiKey);
      if (imageResult.bodyImageUrls.length > 0) {
        content = insertImagesIntoContent(content, imageResult.bodyImageUrls, row.keyword);
      }
    } else if (needsImages && !hasPexelsKey()) {
      Logger.log('⚠️ Pexels API 키가 없어 이미지 삽입을 건너뜁니다.');
    }

    // --- 3. Publish ---
    var postingResult = '';

    if (needsPosting) {
      if (hasWordPressConfig()) {
        postingResult = publishToWordPress(title, content, null, row.keyword, config);
      } else {
        postingResult = '⚠️ WordPress 설정이 없어 포스팅을 건너뜀. "설정" 시트에서 WordPress 정보를 입력해 주세요.';
      }
    }

    // --- 4. Write results back to sheet ---
    updateRowStatus(row.row, '완료', {
      title:         title,
      content:       content,
      postingResult: postingResult
    });

  } catch (e) {
    handleRowError(row.row, e);
  }
}

/**
 * Removes any existing runContentGeneration triggers, then creates a new
 * time-based trigger that fires every 10 minutes.
 */
function enableAutoTrigger() {
  disableAutoTrigger();

  ScriptApp.newTrigger('runContentGeneration')
    .timeBased()
    .everyMinutes(10)
    .create();

  SpreadsheetApp.getUi().alert('자동 실행이 활성화되었습니다. 10분마다 자동으로 실행됩니다.');
}

/**
 * Deletes all project triggers whose handler function is 'runContentGeneration'.
 * The alert is wrapped in try/catch because this may run in a trigger context
 * where the UI is not available.
 */
function disableAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runContentGeneration') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  try {
    SpreadsheetApp.getUi().alert('자동 실행이 비활성화되었습니다.');
  } catch (e) {
    // Running in trigger context — UI not available; log instead
    Logger.log('disableAutoTrigger: 자동 실행 트리거가 삭제되었습니다.');
  }
}

/**
 * Reads the current configuration and shows an alert summarising the status
 * of the Gemini API key and WordPress settings.
 */
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
