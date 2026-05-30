const { Scene, Chapter, Series } = require("../models");
const llmClient = require("./llmClient");
const { resolveModel } = require("./resolveModel");
const sceneSmartInjection = require("./sceneSmartInjection");
const config = require("../config/inference");

const POLISH_RETRY_ATTEMPTS = 3;
const POLISH_RETRY_BASE_DELAY = 800;
const DEFAULT_MAX_DRIFT_RATIO = 0.45;
const MAX_OUTPUT_TOKENS = 16384;

class ScenePolishService {
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

    const { terms } = await sceneSmartInjection.getTermsForScene(scene.id, {
      limit: 100,
    });

    const { messages, model } = await this.buildPolishPrompt(
      scene,
      terms,
      options,
    );

    console.log(`[Polish] Scene ${sceneId}: Sending to LLM (${model})`);

    const result = await this._runPolishWithRetry({
      scene,
      terms,
      model,
      messages,
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
          max_tokens: options.max_tokens || MAX_OUTPUT_TOKENS,
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

  async buildPolishPrompt(scene, terms, options) {
    const model = await resolveModel(options.model);
    const lockedTerms = terms
      .map((term) => term.termEn)
      .filter(Boolean)
      .slice(0, 50)
      .join(", ");

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
          `Source (${scene.sceneType} scene):\n${scene.rawText}\n\n` +
          `Current Translation:\n${scene.translatedText}\n\n` +
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

    // Two-row space optimization: O(min(n,m)) memory instead of O(n*m)
    let prev = Array(len2 + 1);
    let curr = Array(len2 + 1);

    for (let j = 0; j <= len2; j++) prev[j] = j;

    for (let i = 1; i <= len1; i++) {
      curr[0] = i;
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost,
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[len2];
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
