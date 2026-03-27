const { estimateTokens } = require("./paragraphNormalizer");

function fallbackSegmentation(paragraphs) {
  const PARAGRAPHS_PER_ACT =
    Number(process.env.FALLBACK_PARAGRAPHS_PER_ACT) || 5;
  const MAX_TOKENS = Number(process.env.FALLBACK_MAX_TOKENS) || 800;

  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return {
      boundaries: [],
      source: "fallback",
      reason: "empty_paragraphs",
    };
  }

  const boundaries = [];
  let currentTokens = 0;
  let paragraphCount = 0;

  for (let i = 0; i < paragraphs.length; i += 1) {
    paragraphCount += 1;
    currentTokens += estimateTokens(paragraphs[i].text);

    const hitParagraphLimit = paragraphCount >= PARAGRAPHS_PER_ACT;
    const hitTokenLimit = currentTokens >= MAX_TOKENS;
    const isLastParagraph = i === paragraphs.length - 1;

    if (hitParagraphLimit || hitTokenLimit || isLastParagraph) {
      boundaries.push(i + 1);
      paragraphCount = 0;
      currentTokens = 0;
    }
  }

  if (boundaries[boundaries.length - 1] !== paragraphs.length) {
    boundaries.push(paragraphs.length);
  }

  return {
    boundaries,
    source: "fallback",
    reason: "ai_detected_insufficient_scenes",
  };
}

module.exports = {
  fallbackSegmentation,
};
