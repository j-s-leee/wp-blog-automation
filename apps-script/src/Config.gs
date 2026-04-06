/**
 * Config.gs - Settings module for Google Sheets
 * Reads configuration from the "설정" (Settings) sheet
 */

var SETTINGS_SHEET_NAME = '설정';
var CONTENT_SHEET_NAME = '글감 생성';
var PROMPT_SHEET_NAME = '프롬프트 설정';

/**
 * Reads all settings from the "설정" sheet and returns them as an object.
 *
 * Expected sheet structure (2 columns):
 * Row 1: Gemini API 키 | <api_key>
 * Row 2: WordPress 주소 | <url>
 * Row 3: WordPress 아이디 | <username>
 * Row 4: WordPress App Password | <password>
 * Row 5: Pexels API 키 | <pexels_api_key>
 *
 * @return {Object} Configuration object with keys:
 *   - geminiApiKey: Gemini API key
 *   - wpUrl: WordPress URL
 *   - wpUser: WordPress username
 *   - wpAppPassword: WordPress app password
 *   - pexelsApiKey: Pexels API key
 */
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);

  if (!sheet) {
    throw new Error('설정 sheet not found');
  }

  // Get the range with all settings (A:B, rows 1-5)
  var data = sheet.getRange('A1:B5').getValues();

  // Parse the settings from rows
  var config = {
    geminiApiKey: data[0][1] || '',        // Row 1, Column B
    wpUrl: data[1][1] || '',               // Row 2, Column B
    wpUser: data[2][1] || '',              // Row 3, Column B
    wpAppPassword: data[3][1] || '',       // Row 4, Column B
    pexelsApiKey: data[4][1] || ''         // Row 5, Column B
  };

  return config;
}

/**
 * Checks if Gemini API key is configured.
 *
 * @return {boolean} true if Gemini API key is set, false otherwise
 */
function hasGeminiKey() {
  var config = getConfig();
  return !!config.geminiApiKey && config.geminiApiKey.trim().length > 0;
}

/**
 * Checks if Pexels API key is configured.
 * @return {boolean}
 */
function hasPexelsKey() {
  var config = getConfig();
  return !!config.pexelsApiKey && config.pexelsApiKey.trim().length > 0;
}

/**
 * Checks if WordPress configuration is complete.
 *
 * @return {boolean} true if all WordPress settings are configured, false otherwise
 */
function hasWordPressConfig() {
  var config = getConfig();
  return (
    !!config.wpUrl && config.wpUrl.trim().length > 0 &&
    !!config.wpUser && config.wpUser.trim().length > 0 &&
    !!config.wpAppPassword && config.wpAppPassword.trim().length > 0
  );
}
