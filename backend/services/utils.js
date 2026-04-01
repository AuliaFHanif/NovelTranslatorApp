/**
 * Shared utility functions for the NovelTranslator backend.
 */

/**
 * Extracts JSON content from a string, handles potential markdown blocks.
 * @param {string} str - The string containing JSON
 * @returns {string} Cleaned JSON string
 */
function extractJson(str) {
  if (typeof str !== 'string') return '';
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Robustly parses JSON with fallback for common LLM formatting issues.
 * @param {string} content - Raw content from LLM
 * @returns {Object} Parsed JSON object
 */
function safeParseJson(content) {
  if (!content) return null;
  try {
    return JSON.parse(extractJson(content));
  } catch (e) {
    console.warn('[utils] Failed to parse JSON:', e.message);
    // Potential further fallback: more aggressive cleaning if needed
    return null;
  }
}

/**
 * Rough estimation of tokens from characters.
 * @param {string} text - Input text
 * @returns {number} Estimated tokens
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

module.exports = {
  extractJson,
  safeParseJson,
  estimateTokens
};
