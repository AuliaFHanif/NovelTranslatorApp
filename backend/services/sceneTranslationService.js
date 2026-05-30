const { Scene, Chapter, Series } = require("../models");
const { Op } = require("sequelize");
const llmClient = require("./llmClient");
const { resolveModel } = require("./resolveModel");
const sceneSmartInjection = require("./sceneSmartInjection");
const config = require("../config/inference");

const TRANSLATION_RETRY_ATTEMPTS = 3;
const TRANSLATION_RETRY_BASE_DELAY = 750;
const MIN_TRANSLATION_LENGTH_RATIO = 0.22;
const MIN_GLOSSARY_COVERAGE = 0.45;
const MAX_OUTPUT_TOKENS = 16384;

class SceneTranslationService {
  /**
   * Build context-rich prompt for scene translation
   */
  async buildSceneTranslationContext(sceneId, options = {}) {
    const scene = await Scene.findByPk(sceneId, {
      include: [
        {
          model: Chapter,
          as: "Chapter",
          include: [{ model: Series, as: "Series" }],
        },
      ],
    });

    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    if (!scene.rawText || !scene.rawText.trim()) {
      throw new Error(`Scene ${sceneId} has no source text`);
    }

    const chapter = scene.Chapter;
    const series = chapter.Series;

    // Get previous scene for context (if exists)
    const prevScene = await Scene.findOne({
      where: {
        chapterId: chapter.id,
        sequence: { [Op.lt]: scene.sequence },
      },
      order: [["sequence", "DESC"]],
    });

    // Get all relevant glossary terms — no cap, send everything relevant
    const { terms, glossaryText } = await sceneSmartInjection.getTermsForScene(
      sceneId,
      { limit: 200 },
    );

    // Build context
    const context = {
      seriesTitle: series.title,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      sceneSequence: scene.sequence,
      sceneType: scene.sceneType,
      previousContext: prevScene?.contextSummary || null,
      glossary: glossaryText,
      terms,
      analysis: scene.analysis,
    };

    const prompt = this.buildPrompt(scene.rawText, context, series.language);
    const model = await resolveModel(options.model);

    return { messages: prompt.messages, model, scene, context, prompt };
  }

  /**
   * Run translation on a scene — always single prompt, full context
   */
  async translateScene(sceneId, options = {}) {
    const { messages, model, scene, context, prompt } =
      await this.buildSceneTranslationContext(sceneId, options);

    console.log(
      `[Translation] Scene ${sceneId}: Sending full prompt to LLM (${model})`,
    );

    const cleaned = await this._translateWithRetry({
      sceneId,
      model,
      messages,
      context,
      sourceText: prompt.sourceText,
      language: scene.Chapter.Series.language,
      options,
    });

    // Generate context summary for NEXT scene
    const summary = await this.generateContextSummary(cleaned);

    await scene.update({
      translatedText: cleaned,
      status: "translated",
      contextSummary: summary,
    });

    return { scene, translation: cleaned };
  }

  async _translateWithRetry({
    sceneId,
    model,
    messages,
    context,
    sourceText,
    language,
    options,
  }) {
    const maxAttempts = options.retries || TRANSLATION_RETRY_ATTEMPTS;
    let lastError;
    let correctiveMessages = messages.slice();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const content = await llmClient.chatCompletion({
          model,
          messages: correctiveMessages,
          temperature:
            options.temperature ?? config.temperature?.translation ?? 0.3,
          top_p: options.top_p ?? 0.95,
          max_tokens: options.max_tokens || MAX_OUTPUT_TOKENS,
        });

        const cleaned = this.stripThinking(content);
        const quality = this._assessTranslationQuality(
          sourceText,
          cleaned,
          context,
          language,
          options,
        );

        if (quality.passed) {
          return cleaned;
        }

        lastError = new Error(
          `Translation quality gate failed (${quality.reason}) for scene ${sceneId}`,
        );

        if (attempt >= maxAttempts) {
          break;
        }

        correctiveMessages = [
          ...messages,
          {
            role: "user",
            content:
              `Your last translation did not pass validation: ${quality.reason}. ` +
              "Retry and preserve all key entities, numbers, and glossary terms.",
          },
        ];
      } catch (error) {
        lastError = error;
        const transient = this._isTransientError(error);

        if (!transient || attempt >= maxAttempts) {
          break;
        }

        const delayMs = TRANSLATION_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.warn(
          `[Translation] Retry ${attempt}/${maxAttempts} for scene ${sceneId} in ${delayMs}ms: ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error(`Translation failed for scene ${sceneId}`);
  }

  _assessTranslationQuality(
    sourceText,
    translatedText,
    context,
    language,
    options = {},
  ) {
    if (!translatedText || translatedText.trim().length < 10) {
      return { passed: false, reason: "empty_output" };
    }

    // CJK characters ≈ 1 word each; English ≈ split by whitespace
    // This gives a more accurate cross-language length comparison
    const cjkCharCount = (sourceText.match(/[\u3000-\u9fff\uf900-\ufaff]/g) || []).length;
    const sourceWordEstimate = cjkCharCount > 0
      ? cjkCharCount + (sourceText.replace(/[\u3000-\u9fff\uf900-\ufaff]/g, "").match(/\S+/g) || []).length
      : (sourceText.match(/\S+/g) || []).length;
    const translatedWordCount = (translatedText.match(/\S+/g) || []).length;
    const lengthRatio = translatedWordCount / Math.max(1, sourceWordEstimate);
    const minLengthRatio =
      options.minLengthRatio || MIN_TRANSLATION_LENGTH_RATIO;

    if (lengthRatio < minLengthRatio) {
      return {
        passed: false,
        reason: `too_short ratio=${lengthRatio.toFixed(2)} threshold=${minLengthRatio}`,
      };
    }

    const malformedPatterns = [
      /^\s*\{\s*"scene_starts"/i,
      /^\s*\{\s*"extractedTerms"/i,
      /```json/i,
      /\[Thinking/i,
    ];

    if (malformedPatterns.some((pattern) => pattern.test(translatedText))) {
      return { passed: false, reason: "malformed_output" };
    }

    const coverage = this._calculateGlossaryCoverage(
      sourceText,
      translatedText,
      context.terms || [],
      language,
    );

    const minGlossaryCoverage =
      options.minGlossaryCoverage ?? MIN_GLOSSARY_COVERAGE;
    if (coverage.applicable > 0 && coverage.ratio < minGlossaryCoverage) {
      return {
        passed: false,
        reason: `low_glossary_coverage ratio=${coverage.ratio.toFixed(2)} threshold=${minGlossaryCoverage}`,
      };
    }

    return { passed: true, reason: "ok", coverage };
  }

  _calculateGlossaryCoverage(sourceText, translatedText, terms, language) {
    if (!Array.isArray(terms) || !terms.length) {
      return { applicable: 0, matched: 0, ratio: 1 };
    }

    const sourceField = language === "ja" ? "termJa" : "termZh";
    const normalizedTarget = this._normalizeForComparison(translatedText);

    let applicable = 0;
    let matched = 0;

    for (const term of terms.slice(0, 40)) {
      const sourceTerm = term[sourceField] || term.canonicalForm;
      const englishTerm = term.termEn;
      if (!sourceTerm || !englishTerm) continue;
      if (!sourceText.includes(sourceTerm)) continue;

      applicable += 1;
      if (
        normalizedTarget.includes(this._normalizeForComparison(englishTerm))
      ) {
        matched += 1;
      }
    }

    return {
      applicable,
      matched,
      ratio: applicable ? matched / applicable : 1,
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

  buildPrompt(rawText, context, language) {
    const languageName = language === "ja" ? "Japanese" : "Chinese";

    const systemPrompt = `You are an expert literary translator. Translate the provided scene from ${languageName} to English.

Key principles:
- Preserve narrative voice and character personality
- Maintain scene pacing and tension
- Use provided glossary for consistent terminology
- Adapt cultural references naturally for English readers
- Keep dialogue natural and character-appropriate`;

    const userParts = [
      `Series: ${context.seriesTitle}`,
      `Chapter ${context.chapterNumber}: ${context.chapterTitle}`,
      `Scene ${context.sceneSequence} (${context.sceneType})`,
    ];

    if (context.previousContext) {
      userParts.push(`Previous Scene Summary: ${context.previousContext}`);
    }

    if (context.glossary) {
      userParts.push(`Glossary:\n${context.glossary}`);
    }

    if (context.analysis?.summary) {
      userParts.push(`Scene Summary: ${context.analysis.summary}`);
    }

    userParts.push(`Translate this scene:\n\n${rawText}`);

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userParts.join("\n\n") },
    ];

    return {
      messages,
      sourceText: rawText,
    };
  }

  async generateContextSummary(text) {
    // Simple summary extraction: first couple of sentences
    const sentences = text.split(/[.!?]/).slice(0, 2).join(". ");
    return sentences.substring(0, 250) + (sentences.length > 250 ? "..." : "");
  }

  stripThinking(text) {
    return (text || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<think>[\s\S]*/g, "")
      .replace(/<analysis>[\s\S]*?<\/analysis>/g, "")
      .replace(/<analysis>[\s\S]*/g, "")
      .replace(/\[Thinking.*?\]/gi, "")
      .replace(/\[Thinking[\s\S]*/gi, "")
      .replace(/```(?:json|text)?/gi, "")
      .replace(/```/g, "")
      .trim();
  }
}

module.exports = new SceneTranslationService();
