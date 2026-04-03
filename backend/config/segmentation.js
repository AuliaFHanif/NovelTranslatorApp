/**
 * Segmentation configuration
 * All limits and thresholds in one place
 */

const config = {
  ai: {
    // LLM request settings
    maxTokens: 2000, // Response token limit (was 16000!)
    temperature: 0.2,
    temperatureIncrement: 0.15, // Per retry
    maxRetries: 3,

    // Prompt settings
    maxParagraphsInPrompt: 50, // Split long chapters into batches
    paragraphPreviewLength: 200, // Characters per paragraph in prompt

    // Model settings
    defaultModel: process.env.SEGMENTATION_MODEL || "local",
  },

  boundaries: {
    // ACT sizes (narrative/analysis scope)
    minTokensPerAct: parseInt(process.env.MIN_ACT_TOKENS) || 1200,
    minUnifiedWordsPerAct: parseInt(process.env.MIN_ACT_WORDS) || 900,

    maxTokensPerAct: parseInt(process.env.MAX_ACT_TOKENS) || 3000,
    maxUnifiedWordsPerAct: parseInt(process.env.MAX_ACT_WORDS) || 2500,

    // SUBACT sizes (atomic translation units - SMALLER than Acts)
    minTokensPerSubAct: parseInt(process.env.MIN_SUBACT_TOKENS) || 400,
    minUnifiedWordsPerSubAct: parseInt(process.env.MIN_SUBACT_WORDS) || 300,

    maxTokensPerSubAct: parseInt(process.env.MAX_SUBACT_TOKENS) || 1000,
    maxUnifiedWordsPerSubAct: parseInt(process.env.MAX_SUBACT_WORDS) || 750,

    // Hard limits (safety)
    absoluteMaxTokens: 2500,
    absoluteMaxUnifiedWords: 2000,

    // Boundary smoothing
    sentenceBoundaryWindow: 3, // Look ahead/back 3 paragraphs for good break
    minLastActWords: 150, // Merge tiny final acts
  },

  // Performance settings
  performance: {
    enableBatchProcessing: true,
    batchSize: 50, // Paragraphs per AI call
    parallelBatchLimit: 1, // Sequential for now (respect rate limits)
  },
};

module.exports = config;
