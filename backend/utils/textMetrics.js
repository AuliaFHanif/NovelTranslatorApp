/**
 * Unified text metrics - Single source of truth for all counting operations
 * Handles CJK (Chinese/Japanese/Korean) characters properly
 */

class TextMetrics {
  /**
   * Count CJK characters (Chinese, Japanese, Korean)
   * These are typically 1-2 tokens each in modern LLMs
   */
  static countCjkChars(text) {
    if (!text) return 0;
    const cjkRegex = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g;
    const matches = text.match(cjkRegex);
    return matches ? matches.length : 0;
  }

  /**
   * Count non-CJK words (space-separated)
   * For English and other Latin-script languages
   */
  static countWords(text) {
    if (!text) return 0;
    const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g, ' ');
    const words = nonCjkText.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  /**
   * Unified word count: CJK chars + non-CJK words
   * This is the standard for act sizing
   */
  static countUnifiedWords(text) {
    return this.countCjkChars(text) + this.countWords(text);
  }

  /**
   * Estimate tokens for LLM context window
   * ~4 chars per token for English, ~1-2 for CJK
   * Conservative estimate: 1 token per CJK char, 0.75 per non-CJK word
   */
  static estimateTokens(text) {
    if (!text) return 0;
    const cjk = this.countCjkChars(text);
    const words = this.countWords(text);
    return Math.ceil(cjk * 1.0 + words * 0.75);
  }

  /**
   * Calculate metrics for an array of paragraphs
   */
  static calculateParagraphMetrics(paragraphs) {
    return paragraphs.map((p, idx) => ({
      index: idx,
      text: p.text,
      cjkChars: this.countCjkChars(p.text),
      words: this.countWords(p.text),
      unifiedWords: this.countUnifiedWords(p.text),
      estimatedTokens: this.estimateTokens(p.text),
      length: p.text.length
    }));
  }

  /**
   * Get cumulative metrics up to each paragraph boundary
   */
  static getCumulativeMetrics(paragraphMetrics) {
    const cumulative = [];
    let running = {
      cjkChars: 0,
      words: 0,
      unifiedWords: 0,
      estimatedTokens: 0,
      length: 0
    };

    for (const pm of paragraphMetrics) {
      running = {
        cjkChars: running.cjkChars + pm.cjkChars,
        words: running.words + pm.words,
        unifiedWords: running.unifiedWords + pm.unifiedWords,
        estimatedTokens: running.estimatedTokens + pm.estimatedTokens,
        length: running.length + pm.length
      };
      cumulative.push({ ...running });
    }

    return cumulative;
  }
}

module.exports = TextMetrics;
