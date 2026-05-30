/**
 * Inference Configuration
 * Temperature settings and reliability parameters used by translation services.
 * Context budget/limiting has been removed — the LLM's full context window is used.
 */

const config = {
  // Temperature settings per task (actively used by services)
  temperature: {
    segmentation: 0.2, // Low temp for deterministic splits
    translation: 0.3, // Low temp for faithful translation
    analysis: 0.5, // Medium for creative analysis
    polish: 0.4, // Moderate temp for constrained polish
  },

  // Retry & timeout settings
  reliability: {
    maxRetries: 3,
    retryBackoffMs: 1000,
    timeoutSeconds: 900, // 15 min timeout per inference
  },

  // Validation (no-op — retained for compatibility)
  validate() {
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  },
};

module.exports = config;

