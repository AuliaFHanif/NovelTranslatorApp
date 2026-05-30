const { Scene, Chapter, Series } = require("../models");
const { Op } = require("sequelize");
const llmClient = require("./llmClient");
const { resolveModel } = require("./resolveModel");
const sceneSmartInjection = require("./sceneSmartInjection");
const TextMetrics = require("../utils/textMetrics");
const config = require("../config/inference");

const TRANSLATION_RETRY_ATTEMPTS = 3;
const TRANSLATION_RETRY_BASE_DELAY = 750;
const MIN_TRANSLATION_LENGTH_RATIO = 0.22;
const MIN_GLOSSARY_COVERAGE = 0.45;

class SceneTranslationService {
  buildTranslationBudget(options = {}) {
    const limits = config.contextLimits?.translation || {};
    const dynamic = TextMetrics.buildTokenBudget({
      contextWindow: options.contextWindow || limits.totalContextWindow || 4096,
      outputReserve: options.outputReserve || limits.maxOutputTokens || 1500,
      systemReserve: options.systemReserve || 420,
      schemaReserve: options.schemaReserve || 120,
      safetyMargin: options.safetyMargin || 320,
      minimumInput: 400,
    });

    const inputCap =
      options.maxInputTokens || limits.maxInputTokens || dynamic.maxInputTokens;

    return {
      ...dynamic,
      maxInputTokens: Math.max(400, Math.min(dynamic.maxInputTokens, inputCap)),
      maxOutputTokens: TextMetrics.clampCompletionTokens(
        options.max_tokens || limits.maxOutputTokens || 1500,
        dynamic,
      ),
      glossaryTokenCap:
        options.maxGlossaryTokens || limits.maxGlossaryTokens || 600,
      sourceChunkOverlap: options.sourceChunkOverlapTokens || 90,
    };
  }

  /**
   * Build context-rich prompt for scene translation
   */
  async buildSceneTranslationContext(sceneId, options = {}) {
    const budget = this.buildTranslationBudget(options);

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

    // Get relevant glossary terms using the smart injection service
    const glossaryTermLimit =
      options.maxGlossaryTerms ||
      Math.max(20, Math.floor(budget.glossaryTokenCap / 8));

    const { terms, glossaryText } = await sceneSmartInjection.getTermsForScene(
      sceneId,
      {
        limit: glossaryTermLimit,
        maxGlossaryTokens: budget.glossaryTokenCap,
      },
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

    const prompt = this.buildPrompt(
      scene.rawText,
      context,
      series.language,
      budget,
    );
    const model = await resolveModel(options.model);

    return { messages: prompt.messages, model, scene, context, budget, prompt };
  }

  /**
   * Run translation on a scene
   */
  async translateScene(sceneId, options = {}) {
    const { messages, model, scene, context, budget, prompt } =
      await this.buildSceneTranslationContext(sceneId, options);

    let cleaned;
    const fullSourceIncluded = prompt.sourceText === scene.rawText;

    if (
      fullSourceIncluded &&
      (prompt.promptTokens || TextMetrics.estimateMessageTokens(messages)) <=
        budget.maxInputTokens
    ) {
      console.log(
        `[Translation] Scene ${sceneId}: Sending single prompt to LLM (${model})`,
      );
      cleaned = await this._translateWithRetry({
        sceneId,
        model,
        messages,
        budget,
        context,
        sourceText: prompt.sourceText,
        language: scene.Chapter.Series.language,
        options,
      });
    } else {
      console.log(
        `[Translation] Scene ${sceneId}: Prompt exceeds budget (${budget.maxInputTokens}). Translating in chunks.`,
      );
      cleaned = await this._translateChunkedScene({
        scene,
        context,
        model,
        budget,
        options,
      });
    }

    // Generate context summary for NEXT scene
    const summary = await this.generateContextSummary(cleaned);

    await scene.update({
      translatedText: cleaned,
      status: "translated",
      contextSummary: summary,
    });

    return { scene, translation: cleaned };
  }

  async _translateChunkedScene({ scene, context, model, budget, options }) {
    const sourceChunkBudget = Math.max(
      320,
      Math.floor(budget.maxInputTokens * 0.72),
    );
    const chunks = TextMetrics.splitTextWithOverlap(
      scene.rawText,
      sourceChunkBudget,
      budget.sourceChunkOverlap,
    );

    if (chunks.length <= 1) {
      const prompt = this.buildPrompt(
        scene.rawText,
        context,
        scene.Chapter.Series.language,
        budget,
      );

      return this._translateWithRetry({
        sceneId: scene.id,
        model,
        messages: prompt.messages,
        budget,
        context,
        sourceText: prompt.sourceText,
        language: scene.Chapter.Series.language,
        options,
      });
    }

    const translatedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const prompt = this.buildPrompt(
        chunkText,
        context,
        scene.Chapter.Series.language,
        budget,
        { chunkIndex: i + 1, totalChunks: chunks.length },
      );

      const translatedChunk = await this._translateWithRetry({
        sceneId: scene.id,
        model,
        messages: prompt.messages,
        budget,
        context,
        sourceText: prompt.sourceText,
        language: scene.Chapter.Series.language,
        options,
        chunkLabel: `${i + 1}/${chunks.length}`,
      });

      translatedChunks.push(translatedChunk);
    }

    return this._mergeChunkTranslations(translatedChunks);
  }

  _mergeChunkTranslations(chunks) {
    if (!chunks.length) return "";
    if (chunks.length === 1) return chunks[0];

    const merged = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const current = chunks[i];
      const prev = merged[merged.length - 1];

      // Lightweight overlap removal to reduce duplicated boundary lines.
      const prevTail = prev.slice(-240).trim();
      if (prevTail && current.startsWith(prevTail)) {
        merged[merged.length - 1] = prev;
        merged.push(current.slice(prevTail.length).trim());
      } else {
        merged.push(current);
      }
    }

    return merged.filter(Boolean).join("\n\n");
  }

  async _translateWithRetry({
    sceneId,
    model,
    messages,
    budget,
    context,
    sourceText,
    language,
    options,
    chunkLabel,
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
          max_tokens: budget.maxOutputTokens,
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
          `Translation quality gate failed (${quality.reason}) for scene ${sceneId}${chunkLabel ? ` chunk ${chunkLabel}` : ""}`,
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
          `[Translation] Retry ${attempt}/${maxAttempts} for scene ${sceneId}${chunkLabel ? ` chunk ${chunkLabel}` : ""} in ${delayMs}ms: ${error.message}`,
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

    const sourceTokens = Math.max(1, TextMetrics.estimateTokens(sourceText));
    const translatedTokens = TextMetrics.estimateTokens(translatedText);
    const lengthRatio = translatedTokens / sourceTokens;
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

  buildPrompt(rawText, context, language, budget, chunkMeta = null) {
    const languageName = language === "ja" ? "Japanese" : "Chinese";

    const systemPrompt = `You are an expert literary translator. Translate the provided scene from ${languageName} to English.

Key principles:
- Preserve narrative voice and character personality
- Maintain scene pacing and tension
- Use provided glossary for consistent terminology
- Adapt cultural references naturally for English readers
- Keep dialogue natural and character-appropriate`;

    const baseParts = [
      `Series: ${context.seriesTitle}`,
      `Chapter ${context.chapterNumber}: ${context.chapterTitle}`,
      `Scene ${context.sceneSequence} (${context.sceneType})`,
    ];

    let includePreviousContext = Boolean(context.previousContext);
    let includeAnalysisSummary = Boolean(context.analysis?.summary);
    let glossaryLines = context.glossary
      ? context.glossary.split("\n").filter((line) => line.trim())
      : [];
    let effectiveSourceText = rawText;

    let messages = [];
    let promptTokens = Number.POSITIVE_INFINITY;

    for (let guard = 0; guard < 8; guard++) {
      const userParts = [...baseParts];

      if (chunkMeta?.totalChunks > 1) {
        userParts.push(
          `Chunk ${chunkMeta.chunkIndex}/${chunkMeta.totalChunks}: translate this chunk and preserve continuity with adjacent chunks.`,
        );
      }

      if (includePreviousContext) {
        userParts.push(
          `Previous Scene Summary: ${TextMetrics.trimTextToTokenBudget(context.previousContext, 160)}`,
        );
      }

      if (glossaryLines.length) {
        userParts.push(`Glossary:\n${glossaryLines.join("\n")}`);
      }

      if (includeAnalysisSummary) {
        userParts.push(
          `Scene Summary: ${TextMetrics.trimTextToTokenBudget(context.analysis.summary, 140)}`,
        );
      }

      userParts.push(`Translate this scene:\n\n${effectiveSourceText}`);

      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userParts.join("\n\n") },
      ];

      promptTokens = TextMetrics.estimateMessageTokens(messages);
      if (promptTokens <= budget.maxInputTokens) {
        break;
      }

      if (includeAnalysisSummary) {
        includeAnalysisSummary = false;
        continue;
      }

      if (includePreviousContext) {
        includePreviousContext = false;
        continue;
      }

      if (glossaryLines.length > 8) {
        glossaryLines = glossaryLines.slice(
          0,
          Math.ceil(glossaryLines.length * 0.7),
        );
        continue;
      }

      const reservedTokens = TextMetrics.estimateMessageTokens([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userParts.join("\n\n").replace(effectiveSourceText, ""),
        },
      ]);
      const sourceBudget = Math.max(
        200,
        budget.maxInputTokens - reservedTokens - 24,
      );
      const trimmed = TextMetrics.trimTextToTokenBudget(
        effectiveSourceText,
        sourceBudget,
      );
      if (!trimmed || trimmed === effectiveSourceText) {
        break;
      }
      effectiveSourceText = trimmed;
    }

    return {
      messages,
      promptTokens,
      sourceText: effectiveSourceText,
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
      .replace(/<analysis>[\s\S]*?<\/analysis>/g, "")
      .replace(/\[Thinking.*?\]/gi, "")
      .replace(/```(?:json|text)?/gi, "")
      .replace(/```/g, "")
      .trim();
  }
}

module.exports = new SceneTranslationService();
