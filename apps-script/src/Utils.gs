/**
 * Updates a row in the "글감 생성" sheet with status and optional results.
 * @param {number} row - 1-based row number
 * @param {string} status - Status value (e.g., "완료", "에러", "진행중")
 * @param {Object} results - Optional object with keys: title, content, postingResult
 */
function updateRowStatus(row, status, results) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);

  // Update status in column F (was E before 쿠팡 column added)
  sheet.getRange(row, 6).setValue(status);

  // Update optional results
  if (results) {
    if (results.title) {
      sheet.getRange(row, 7).setValue(results.title);
    }
    if (results.content) {
      sheet.getRange(row, 8).setValue(results.content);
    }
    if (results.postingResult !== undefined) {
      sheet.getRange(row, 9).setValue(results.postingResult);
    }
  }

  // Flush to ensure changes are written
  SpreadsheetApp.flush();
}

/**
 * Gets all pending rows from the "글감 생성" sheet.
 * @returns {Array} Array of objects with {row, keyword, imageGen, imageStyle, autoPost}
 */
function getPendingRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET_NAME);
  var data = sheet.getDataRange().getValues();

  var pendingRows = [];

  // Start from row 2 (row 1 is header)
  for (var i = 1; i < data.length; i++) {
    var statusCell = data[i][5]; // Column F (0-indexed: 5)

    if (statusCell === "대기") {
      pendingRows.push({
        row: i + 1, // Convert back to 1-based row number
        keyword: data[i][0], // Column A
        imageGen: data[i][1], // Column B
        imageStyle: data[i][2], // Column C
        autoPost: data[i][3], // Column D
        coupang: data[i][4] // Column E
      });
    }
  }

  return pendingRows;
}

/**
 * Handles an error for a specific row.
 * @param {number} row - 1-based row number
 * @param {Error} error - Error object
 */
function handleRowError(row, error) {
  Logger.log("Error processing row " + row + ": " + error.message);
  updateRowStatus(row, "에러", {
    postingResult: error.message
  });
}

/**
 * Checks if execution time exceeds the time limit (5 minutes for safety).
 * Apps Script has a 6-minute limit; we stop at 5 minutes for safety.
 * @param {number} startTime - Start time in milliseconds (from Date.now())
 * @returns {boolean} True if more than 300 seconds have elapsed
 */
function isNearTimeLimit(startTime) {
  var elapsedSeconds = (Date.now() - startTime) / 1000;
  return elapsedSeconds > 300;
}
