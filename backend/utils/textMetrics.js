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
    const nonCjkText = text.replace(
      /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g,
      " ",
    );
    const words = nonCjkText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
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
   * Estimate tokens for chat messages with lightweight role overhead.
   */
  static estimateMessageTokens(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;

    let total = 0;
    for (const message of messages) {
      const content =
        typeof message?.content === "string" ? message.content : "";
      total += this.estimateTokens(content) + 8;
    }

    // Small buffer for assistant priming and separators
    return total + 16;
  }

  /**
   * Build a dynamic token budget with explicit reserves.
   */
  static buildTokenBudget(options = {}) {
    const contextWindow = Math.max(1024, options.contextWindow || 16000);
    const systemReserve = Math.max(0, options.systemReserve ?? 450);
    const schemaReserve = Math.max(0, options.schemaReserve ?? 300);
    const outputReserve = Math.max(256, options.outputReserve ?? 2500);
    const safetyMargin = Math.max(128, options.safetyMargin ?? 500);
    const minimumInput = Math.max(256, options.minimumInput ?? 512);

    const promptBudget = Math.max(
      minimumInput,
      contextWindow - outputReserve - safetyMargin,
    );

    const maxInputTokens = Math.max(
      minimumInput,
      promptBudget - systemReserve - schemaReserve,
    );

    return {
      contextWindow,
      promptBudget,
      maxInputTokens,
      outputReserve,
      systemReserve,
      schemaReserve,
      safetyMargin,
      minimumInput,
    };
  }

  /**
   * Clamp completion max_tokens to a safe range for the current budget.
   */
  static clampCompletionTokens(requestedMaxTokens, budget) {
    const requested = Math.max(256, requestedMaxTokens || budget.outputReserve);
    const safeCap = Math.max(
      256,
      Math.floor((budget.contextWindow || 16000) * 0.5),
    );
    return Math.min(requested, budget.outputReserve, safeCap);
  }

  /**
   * Trim text to fit a target token count while preferring sentence boundaries.
   */
  static trimTextToTokenBudget(text, maxTokens) {
    if (!text) return "";
    if (!maxTokens || maxTokens <= 0) return "";

    if (this.estimateTokens(text) <= maxTokens) {
      return text;
    }

    const sentenceParts = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentenceParts.length <= 1) {
      const ratio = Math.max(
        0.1,
        maxTokens / Math.max(1, this.estimateTokens(text)),
      );
      return text.slice(0, Math.max(1, Math.floor(text.length * ratio))).trim();
    }

    const accepted = [];
    let runningTokens = 0;
    for (const sentence of sentenceParts) {
      const tokens = this.estimateTokens(sentence);
      if (runningTokens + tokens > maxTokens) break;
      accepted.push(sentence);
      runningTokens += tokens;
    }

    if (accepted.length === 0) {
      return this.trimTextToTokenBudget(
        text,
        Math.max(64, Math.floor(maxTokens * 0.8)),
      );
    }

    return accepted.join(" ").trim();
  }

  /**
   * Split oversized text into token-safe chunks with overlap.
   */
  static splitTextWithOverlap(text, maxTokens, overlapTokens = 80) {
    if (!text) return [];

    const normalizedMaxTokens = Math.max(256, maxTokens || 2000);
    const normalizedOverlap = Math.max(
      0,
      Math.min(overlapTokens, Math.floor(normalizedMaxTokens * 0.25)),
    );

    if (this.estimateTokens(text) <= normalizedMaxTokens) {
      return [text];
    }

    const sentences = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      const chunks = [];
      let remaining = text;
      while (remaining.length > 0) {
        const chunk = this.trimTextToTokenBudget(
          remaining,
          normalizedMaxTokens,
        );
        if (!chunk) break;
        chunks.push(chunk);

        const chunkTokens = this.estimateTokens(chunk);
        if (chunkTokens <= normalizedOverlap) {
          remaining = remaining.slice(chunk.length).trim();
          continue;
        }

        const consumeTarget = Math.max(32, chunkTokens - normalizedOverlap);
        const safeChunk = this.trimTextToTokenBudget(chunk, consumeTarget);
        remaining = remaining.slice(Math.max(1, safeChunk.length)).trim();
      }
      return chunks;
    }

    const chunks = [];
    let i = 0;

    while (i < sentences.length) {
      let current = "";
      let j = i;

      while (j < sentences.length) {
        const candidate = current ? `${current} ${sentences[j]}` : sentences[j];
        if (this.estimateTokens(candidate) > normalizedMaxTokens) break;
        current = candidate;
        j += 1;
      }

      if (!current) {
        current = this.trimTextToTokenBudget(sentences[i], normalizedMaxTokens);
        j = i + 1;
      }

      chunks.push(current);

      if (j >= sentences.length) break;

      let overlapStart = j - 1;
      let overlapText = sentences[overlapStart] || "";
      while (
        overlapStart > i &&
        this.estimateTokens(overlapText) < normalizedOverlap
      ) {
        overlapStart -= 1;
        overlapText = `${sentences[overlapStart]} ${overlapText}`;
      }
      i = Math.max(i + 1, overlapStart + 1);
    }

    return chunks;
  }

  /**
   * Count units based on language (chars for CJK, words for English)
   */
  static countUnits(text, language = "zh") {
    if (language === "zh" || language === "ja") {
      return this.countCjkChars(text);
    }
    return this.countWords(text);
  }

  /**
   * Get segmentation limit based on language
   */
  static getSegmentationLimit(language = "zh") {
    if (language === "zh" || language === "ja") {
      return 2000; // 2000 characters
    }
    return 2000; // 2000 words
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
      length: p.text.length,
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
      length: 0,
    };

    for (const pm of paragraphMetrics) {
      running = {
        cjkChars: running.cjkChars + pm.cjkChars,
        words: running.words + pm.words,
        unifiedWords: running.unifiedWords + pm.unifiedWords,
        estimatedTokens: running.estimatedTokens + pm.estimatedTokens,
        length: running.length + pm.length,
      };
      cumulative.push({ ...running });
    }

    return cumulative;
  }
}

module.exports = TextMetrics;
