const { Scene, Chapter, Series } = require("../models");
const llmClient = require("./llmClient");
const { resolveModel } = require("./resolveModel");
const sceneSmartInjection = require("./sceneSmartInjection");
const TextMetrics = require("../utils/textMetrics");
const config = require("../config/inference");

const POLISH_RETRY_ATTEMPTS = 3;
const POLISH_RETRY_BASE_DELAY = 800;
const DEFAULT_MAX_DRIFT_RATIO = 0.45;

class ScenePolishService {
  buildPolishBudget(options = {}) {
    const limits = config.contextLimits?.polish || {};
    const dynamic = TextMetrics.buildTokenBudget({
      contextWindow: options.contextWindow || limits.totalContextWindow || 4096,
      outputReserve: options.outputReserve || limits.maxOutputTokens || 1500,
      systemReserve: options.systemReserve || 420,
      schemaReserve: options.schemaReserve || 260,
      safetyMargin: options.safetyMargin || 300,
      minimumInput: 320,
    });

    const inputCap =
      options.maxInputTokens || limits.maxInputTokens || dynamic.maxInputTokens;
    return {
      ...dynamic,
      maxInputTokens: Math.max(320, Math.min(dynamic.maxInputTokens, inputCap)),
      maxOutputTokens: TextMetrics.clampCompletionTokens(
        options.max_tokens || limits.maxOutputTokens || 1500,
        dynamic,
      ),
    };
  }

  /**
   * Run polish pass on scene
   */
  async polishScene(sceneId, options = {}) {
    const scene = await Scene.findByPk(sceneId, {
      include: [
        {
          model: Chapter,
          as: "Chapter",
          include: [{ model: Series, as: "Series" }],
        },
      ],
    });

    if (!scene?.translatedText) {
      throw new Error("Scene must be translated before polishing");
    }

    const budget = this.buildPolishBudget(options);
    const { terms } = await sceneSmartInjection.getTermsForScene(scene.id, {
      limit: 40,
      maxGlossaryTokens: 350,
    });

    const { messages, model } = await this.buildPolishPrompt(
      scene,
      terms,
      budget,
      options,
    );

    console.log(`[Polish] Scene ${sceneId}: Sending to LLM (${model})`);

    const result = await this._runPolishWithRetry({
      scene,
      terms,
      model,
      messages,
      budget,
      options,
    });

    // Store edits but keep finalText as source of truth
    await scene.update({
      finalText: result.finalText,
      polishEdits: result.edits.map((e) => ({ ...e, applied: true })),
      status: "polished",
    });

    return { scene, edits: result.edits, finalText: result.finalText };
  }

  async _runPolishWithRetry({
    scene,
    terms,
    model,
    messages,
    budget,
    options,
  }) {
    const maxAttempts = options.retries || POLISH_RETRY_ATTEMPTS;
    let lastError;
    let correctiveMessages = messages.slice();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const content = await llmClient.chatCompletion({
          model,
          messages: correctiveMessages,
          temperature: options.temperature ?? config.temperature?.polish ?? 0.4,
          max_tokens: budget.maxOutputTokens,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "polish_edits",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  finalText: { type: "string" },
                  edits: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        original: { type: "string" },
                        replacement: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["original", "replacement", "reason"],
                    },
                  },
                },
                required: ["finalText", "edits"],
              },
            },
          },
        });

        const result = JSON.parse(content);
        const validation = this._validatePolishOutput(
          scene.translatedText,
          result.finalText,
          terms,
          options,
        );

        if (validation.passed) {
          return {
            finalText: result.finalText,
            edits: Array.isArray(result.edits) ? result.edits : [],
          };
        }

        lastError = new Error(`Polish validation failed: ${validation.reason}`);
        if (attempt >= maxAttempts) break;

        correctiveMessages = [
          ...messages,
          {
            role: "user",
            content:
              `Your previous polish failed validation: ${validation.reason}. ` +
              "Retry with minimal edits. Keep locked terms and all numeric values exactly intact.",
          },
        ];
      } catch (error) {
        lastError = error;
        const transient = this._isTransientError(error);
        const parseError =
          error instanceof SyntaxError ||
          (error?.message || "").toLowerCase().includes("json");
        if ((!transient && !parseError) || attempt >= maxAttempts) {
          break;
        }

        const delayMs = POLISH_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error(`Polish failed for scene ${scene.id}`);
  }

  async buildPolishPrompt(scene, terms, budget, options) {
    const model = await resolveModel(options.model);
    const lockedTerms = terms
      .map((term) => term.termEn)
      .filter(Boolean)
      .slice(0, 25)
      .join(", ");

    const sourceText = TextMetrics.trimTextToTokenBudget(
      scene.rawText,
      Math.floor(budget.maxInputTokens * 0.45),
    );
    const translatedText = TextMetrics.trimTextToTokenBudget(
      scene.translatedText,
      Math.floor(budget.maxInputTokens * 0.55),
    );

    const messages = [
      {
        role: "system",
        content:
          "You are a literary editor. Perform a constrained polish pass only. " +
          "Keep meaning, chronology, character intent, and factual details unchanged. " +
          "Do not rewrite from scratch. Return JSON with finalText and edits.",
      },
      {
        role: "user",
        content:
          `Source (${scene.sceneType} scene):\n${sourceText}\n\n` +
          `Current Translation:\n${translatedText}\n\n` +
          `Locked English terms (must remain if present): ${lockedTerms || "none"}\n\n` +
          "Constraints:\n" +
          "1) Preserve all numbers and dates exactly.\n" +
          "2) Preserve locked terms exactly.\n" +
          "3) Keep paragraph structure unless absolutely necessary.\n" +
          "4) Prefer style and clarity fixes over semantic changes.\n\n" +
          "Return final polished version and specific edits in JSON format.",
      },
    ];

    return { messages, model };
  }

  _validatePolishOutput(originalText, polishedText, terms, options = {}) {
    if (!polishedText || polishedText.trim().length < 10) {
      return { passed: false, reason: "empty_output" };
    }

    const driftRatio = this._computeDriftRatio(originalText, polishedText);
    const maxDriftRatio = options.maxDriftRatio || DEFAULT_MAX_DRIFT_RATIO;
    if (driftRatio > maxDriftRatio) {
      return {
        passed: false,
        reason: `excessive_drift ratio=${driftRatio.toFixed(2)} threshold=${maxDriftRatio}`,
      };
    }

    const numberCheck = this._hasNumberLoss(originalText, polishedText);
    if (numberCheck.failed) {
      return {
        passed: false,
        reason: `numeric_loss missing=${numberCheck.missing}`,
      };
    }

    const retained = this._lockedTermsRetained(
      originalText,
      polishedText,
      terms,
    );
    if (!retained.passed) {
      return {
        passed: false,
        reason: `locked_term_loss missing=${retained.missing.join(",")}`,
      };
    }

    return { passed: true, reason: "ok" };
  }

  _computeDriftRatio(originalText, polishedText) {
    const a = this._normalizeForComparison(originalText);
    const b = this._normalizeForComparison(polishedText);
    if (!a && !b) return 0;
    if (!a || !b) return 1;

    const distance = this._levenshteinDistance(a, b);
    return distance / Math.max(a.length, b.length, 1);
  }

  _hasNumberLoss(originalText, polishedText) {
    const originalNumbers = (originalText.match(/\d+(?:[.,]\d+)?/g) || []).map(
      (n) => n.trim(),
    );
    const polishedNumbers = new Set(
      (polishedText.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.trim()),
    );

    const missing = originalNumbers.find(
      (value) => !polishedNumbers.has(value),
    );
    return { failed: Boolean(missing), missing: missing || null };
  }

  _lockedTermsRetained(originalText, polishedText, terms) {
    if (!Array.isArray(terms) || !terms.length) {
      return { passed: true, missing: [] };
    }

    const normalizedOriginal = this._normalizeForComparison(originalText);
    const normalizedPolished = this._normalizeForComparison(polishedText);
    const missing = [];

    for (const term of terms.slice(0, 30)) {
      const en = this._normalizeForComparison(term.termEn);
      if (!en) continue;

      if (!normalizedOriginal.includes(en)) continue;
      if (!normalizedPolished.includes(en)) {
        missing.push(term.termEn);
      }
    }

    return {
      passed: missing.length === 0,
      missing,
    };
  }

  _normalizeForComparison(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,!?;:"'()\[\]{}<>\-_/\\]/g, "")
      .trim();
  }

  _levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len2 + 1)
      .fill(null)
      .map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[len2][len1];
  }

  _isTransientError(error) {
    const message = (error?.message || "").toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("temporarily") ||
      message.includes("unavailable") ||
      message.includes("econn") ||
      message.includes("429") ||
      message.includes("503")
    );
  }
}

module.exports = new ScenePolishService();
