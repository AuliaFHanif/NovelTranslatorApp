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

/**
 * Calculates string similarity using Levenshtein distance.
 * Returns a score between 0.0 and 1.0 (1.0 = identical).
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score
 */
function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  
  if (longerLength === 0) return 1.0;
  
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Normalizes a term for deduplication.
 * Removes honorifics, common prefixes, and whitespace.
 * @param {string} term - The raw term
 * @returns {string} Normalized term
 */
function normalizeTerm(term) {
  if (!term) return "";
  return term
    .trim()
    .toLowerCase()
    .replace(/[・「」『』（）()\[\]【】]/g, "") // Remove common Japanese/Chinese punctuation
    .replace(/\s+/g, ""); // Remove all whitespace
}

module.exports = {
  extractJson,
  safeParseJson,
  estimateTokens,
  countWords,
  similarity,
  normalizeTerm,
};

