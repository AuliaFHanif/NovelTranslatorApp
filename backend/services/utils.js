/**
 * Shared utility functions for the NovelTranslator backend.
 */

/**
 * Extracts JSON content from a string, handles potential markdown blocks.
 * @param {string} str - The string containing JSON
 * @returns {string} Cleaned JSON string
 */
function extractJson(str) {
  if (typeof str !== "string") return "";
  let cleaned = str.trim();

  // 1. Strip thinking blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // 2. Identify and extract JSON from markdown blocks
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  } else {
    // 3. Fallback: find anything that looks like an object or array
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1).trim();
    }
  }

  return cleaned;
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
    console.warn("[utils] Failed to parse JSON:", e.message);
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
  return Math.ceil((text || "").length / 4);
}

/**
 * Counts approximate word count in text.
 * Splits on whitespace and filters empty elements.
 * @param {string} text - Input text
 * @returns {number} Approximate word count
 */
function countWords(text) {
  if (!text) return 0;
  // Split on whitespace, filter empty strings
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.length;
}

module.exports = {
  extractJson,
  safeParseJson,
  estimateTokens,
  countWords,
};
