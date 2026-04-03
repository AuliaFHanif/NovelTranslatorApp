/**
 * Inference Configuration for RTX 4060 8GB VRAM
 * Hard cut-over to Qwen 9B Q6 (from experimental 35B)
 */

const config = {
  // Primary model: Qwen 9B Q6 (fits comfortably in 8GB, high quality)
  defaultModel: {
    name: "qwen2.5-9b-instruct-q6_k",
    provider: "local", // LM Studio via OpenAI-compatible API
    displayName: "Qwen 2.5 9B Q6",
  },

  // Fallback (if primary fails to load)
  fallbackModel: {
    name: "qwen2.5-7b-instruct-q6_k",
    provider: "local",
    displayName: "Qwen 2.5 7B Q6",
  },

  // Hardware constraints for RTX 4060 8GB
  hardware: {
    vramGbTotal: 8,
    vramGbReserved: 0.5, // System overhead
    maxContextTokens: 4096,
    estimatedModelVram: 6.5, // Qwen 9B Q6 VRAM footprint
  },

  // Context window for each task
  contextLimits: {
    segmentation: {
      maxInputTokens: 2000,
      maxOutputTokens: 1500,
      totalContextWindow: 4096,
    },
    translation: {
      maxInputTokens: 1200, // SubAct size
      maxGlossaryTokens: 600, // Smart injection limit
      maxOutputTokens: 1500,
      totalContextWindow: 4096,
    },
    analysis: {
      maxInputTokens: 2500,
      maxOutputTokens: 1000,
      totalContextWindow: 4096,
    },
    polish: {
      maxInputTokens: 1500, // For single variation
      maxOutputTokens: 1500,
      totalContextWindow: 4096,
      batchMaxTokens: 4000, // For batched 3 variations
    },
  },

  // Temperature settings per task
  temperature: {
    segmentation: 0.2, // Low temp for deterministic splits
    translation: 0.3, // Low temp for faithful translation
    analysis: 0.5, // Medium for creative analysis
    polish: 0.7, // Higher temp for diverse polish options
  },

  // GPU/CPU inference settings
  inference: {
    gpuLayers: 35, // Offload all layers to GPU (9B fits)
    batchSize: 512, // Token batch size
    threadCount: 4, // CPU threads for non-GPU ops
    enableMemoryMapping: true,
    contextCacheEnabled: false, // Reduces cache overhead
  },

  // Retry & timeout settings
  reliability: {
    maxRetries: 3,
    retryBackoffMs: 1000,
    timeoutSeconds: 300, // 5 min timeout per inference
  },

  // Deprecations (hard cut-over from 35B)
  deprecated: {
    // Previous model config - DO NOT USE
    // model: 'qwen3.5-35b-uncensored-hauhaus-aggressive-q4',
    // This model requires 20GB VRAM - NOT feasible on RTX 4060
    // Recommend upgrading to RTX 4070 Ti (16GB) or RTX 4090 (24GB) for 35B support
  },

  // Validation
  validate() {
    const errors = [];

    const hardVramNeeded = 6.5; // Qwen 9B Q6
    const softVramNeeded = hardVramNeeded + 1.0; // With overhead

    if (softVramNeeded > this.hardware.vramGbTotal) {
      errors.push(
        `Qwen 9B Q6 needs ~${softVramNeeded.toFixed(1)}GB VRAM, ` +
          `but RTX 4060 only has ${this.hardware.vramGbTotal}GB`,
      );
    }

    if (
      this.contextLimits.translation.maxInputTokens >
      this.hardware.maxContextTokens
    ) {
      errors.push("Translation context limit exceeds hardware max");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [
        "RTX 4060 8GB is at capacity limit. Close other CUDA apps during inference.",
        "Expected inference speed: 15-20 tokens/second at Q6 quantization",
        "For faster speeds or larger contexts, upgrade to RTX 4070 Ti (16GB) or higher",
      ],
    };
  },
};

// Validate on load
const validation = config.validate();
if (!validation.valid) {
  console.warn("[Inference Config] Warnings:", validation.errors);
}

module.exports = config;
