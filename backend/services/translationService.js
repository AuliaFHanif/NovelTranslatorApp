const {
  Act,
  SubAct,
  Chapter,
  Series,
  GlossaryTerm,
  PolishEdit,
  Polish,
  Analysis,
} = require("../models");
const { Op } = require("sequelize");
const { resolveModel } = require("./resolveModel");
const { getPolishInstructions } = require("./polishPrompt");
const { polish: polishSchema } = require("./analysisSchemas");
const llmClient = require("./llmClient");
const { extractJson } = require("./utils");

class TranslationService {
  /**
   * Check if a pass can be run on an act
   */
  canRunPass(act, pass, force) {
    // Basic logic - can be expanded
    return { ok: true };
  }

  /**
   * Escape regex special characters
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Build the prompt for Pass 3 (Translation)
   */
  buildTranslationPrompt({
    language,
    rawActText,
    glossaryText,
    analysisContext,
  }) {
    const languageName = language === "ja" ? "Japanese" : "Chinese";
    const userParts = [`Source language: ${languageName}`];

    if (glossaryText) {
      userParts.push(
        `Glossary (use these translations for names/terms):\n${glossaryText}`,
      );
    }

    if (analysisContext) {
      userParts.push(`Literary analysis context:\n${analysisContext}`);
    }

    const onomatopoeiaRules = `
ONOMATOPOEIA RULES:
- Convert source sound effects into descriptive English equivalents (e.g., horse sounds = 'Clop, clop', heartbeat = 'Thump-thump').
- Avoid raw pinyin/phonetics (e.g., avoid 'Dada' for horse steps) unless it's a unique cultivation technique sound.
- Maintain the 'density' requested in the narrative profile.`;

    userParts.push(
      "Task: Translate the following text into natural, faithful English. Preserve character voice, narrative tone, cultural nuance, and proper names. Return only the translated text.",
      onomatopoeiaRules,
      "Source text:",
      rawActText,
    );

    return [
      {
        role: "system",
        content:
          "You are an expert literary translator specializing in translating web novels. Produce faithful, natural English translations that preserve the author's voice, tone, and style.",
      },
      {
        role: "user",
        content: userParts.join("\n\n"),
      },
    ];
  }

  /**
   * Build the prompt for Pass 4 (Polish)
   */
  buildPolishPrompt({
    language,
    rawActText,
    initialTranslation,
    analysisContext,
  }) {
    const languageName = language === "ja" ? "Japanese" : "Chinese";
    const userParts = [
      `Source language: ${languageName}`,
      `Source text:\n${rawActText}`,
      `Initial translation (Pass 3):\n${initialTranslation}`,
    ];

    if (analysisContext) {
      userParts.push(`Literary analysis context:\n${analysisContext}`);
    }

    const polishInstructions = getPolishInstructions(language);
    userParts.push(polishInstructions);

    return [
      {
        role: "system",
        content:
          "You are an expert literary editor. Refine translations into natural, high-quality literary English while strictly preserving the author's voice and intent.",
      },
      {
        role: "user",
        content: userParts.join("\n\n"),
      },
    ];
  }

  /**
   * Format glossary entries for use in prompts
   */
  formatGlossary(entries, language) {
    if (!entries.length) return "";

    const termField = language === "ja" ? "termJa" : "termZh";
    return entries
      .map((entry) => {
        const sourceTerm =
          entry[termField] || entry.canonicalForm || "(no source term)";
        const englishTerm = entry.termEn || "(no English term)";
        const typePrefix = entry.type ? `[${entry.type.toUpperCase()}] ` : "";
        const definition = entry.definition ? ` - ${entry.definition}` : "";
        return `- ${typePrefix}${sourceTerm} => ${englishTerm}${definition}`;
      })
      .join("\n");
  }

  /**
   * Collect all approved glossary terms relevant to an act
   */
  async collectGlossaryForAct(chapter, act) {
    const linkedApproved = await act.getGlossaryTerms({
      where: { status: "approved" },
      order: [["updatedAt", "DESC"]],
    });

    const allApproved = await GlossaryTerm.findAll({
      where: {
        seriesId: chapter.seriesId,
        status: "approved",
        id: { [Op.notIn]: linkedApproved.map((t) => t.id) },
      },
    });

    if (!act.rawText) return linkedApproved;

    const termField = chapter.Series?.language === "ja" ? "termJa" : "termZh";
    const manualScanMatches = allApproved.filter((term) => {
      const forms = [
        term[termField],
        term.canonicalForm,
        ...(term.metadata?.variants || []),
      ].filter(Boolean);

      return forms.some((form) => act.rawText.includes(form));
    });

    return [...linkedApproved, ...manualScanMatches];
  }

  /**
   * Prepare context for a SubAct translation
   */
  async prepareSubActTranslationContext(subActId, model) {
    const smartInjectionService = require("./smartInjectionService");

    const subAct = await SubAct.findByPk(subActId, {
      include: [
        {
          model: Act,
          as: "Act",
          include: [
            {
              model: Chapter,
              as: "Chapter",
              include: [{ model: Series, as: "Series" }],
            },
            {
              model: Analysis,
              as: "Analysis",
            },
          ],
        },
      ],
    });

    if (!subAct) throw new Error(`SubAct ${subActId} not found`);

    const act = subAct.Act;
    const series = act.Chapter.Series;

    // 1. Get smart terms for this SubAct
    const termsData = await smartInjectionService.getTermsForSubAct(
      subAct.id,
      series.id,
    );
    const glossaryText = smartInjectionService.buildGlossaryPrompt(termsData);

    console.log(
      `[Translation] SubAct ${subAct.id}: Found ${termsData.injected.length} terms, glossary length: ${glossaryText.length} chars`,
    );

    // 2. Get comprehensive Act-level analysis context
    console.log(
      `[Translation] Act Analysis present: ${!!act.Analysis}, has anatomyProfile: ${!!act.Analysis?.anatomyProfile}`,
    );
    let analysisContext = smartInjectionService.buildAnalysisContext(act);

    // Add segment position info
    analysisContext =
      `Current Position: Chapter ${act.Chapter.number} | Act ${act.label} | Segment ${subAct.sequence}\n` +
      analysisContext;

    // Add segment-specific guidance if available
    const segmentGuidance =
      act.Analysis?.anatomyProfile?.segmentGuidance?.[
        String(subAct.sequence)
      ] || {};

    if (segmentGuidance.tone)
      analysisContext += `Segment Tone: ${segmentGuidance.tone}\n`;
    if (segmentGuidance.pacing)
      analysisContext += `Segment Pacing: ${segmentGuidance.pacing}\n`;
    if (segmentGuidance.focus)
      analysisContext += `Segment Focus: ${segmentGuidance.focus}\n`;

    const messages = this.buildTranslationPrompt({
      language: series.language,
      rawActText: subAct.rawText,
      glossaryText,
      analysisContext,
    });

    const resolvedModel = await resolveModel(model);

    return { messages, resolvedModel, subAct };
  }

  /**
   * Strip thinking blocks from text
   */
  stripThinking(text) {
    if (!text) return "";
    let cleaned = text
      .replace(/(?:<think>|Thinking Process:)[\s\S]*?<\/think>/g, "")
      .trim();
    if (cleaned.includes("</think>")) {
      cleaned = cleaned.split("</think>").pop().trim();
    }
    return cleaned;
  }

  /**
   * Aggregate final text for a chapter from its acts
   */
  async aggregateChapterFinalText(chapterId) {
    const acts = await Act.findAll({
      where: { chapterId },
      order: [["sequence", "ASC"]],
      include: [
        {
          model: Polish,
          as: "Polishes",
          where: { isActive: true },
          required: false,
          include: [
            {
              model: PolishEdit,
              as: "Edits",
              where: { applied: true },
              required: false,
            },
          ],
        },
      ],
    });

    const cleanedTexts = acts
      .map((act) => {
        const activePolish = act.Polishes?.[0];
        const appliedEdits = activePolish?.Edits || [];

        // SOURCE OF TRUTH: Always start from the base Pass 3 translation
        let text =
          act.anatomyProfile?.finalTranslation || act.translatedText || "";

        if (activePolish && text) {
          let patchedText = text;
          // APPLY ONLY USER-APPROVED EDITS:
          for (const edit of appliedEdits) {
            if (edit.original && edit.replacement && edit.applied) {
              const regex = new RegExp(this.escapeRegExp(edit.original), "g");
              patchedText = patchedText.replace(regex, edit.replacement);
            }
          }
          text = patchedText;
        }

        return this.stripThinking(text);
      })
      .filter(Boolean);

    const finalText = cleanedTexts.join("\n\n");
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) return null;

    chapter.finalText = finalText || null;
    if (acts.length > 0 && cleanedTexts.length === acts.length) {
      chapter.status = "complete";
    } else if (cleanedTexts.length > 0) {
      chapter.status = "ready";
    }

    await chapter.save();
    return chapter;
  }

  /**
   * Process results of a Pass 4 (Polish) run
   */
  async processPolishResults(act, content, resolvedModel) {
    const profile = act.anatomyProfile || {};
    const parsed = JSON.parse(extractJson(content));
    const edits = parsed.edits || [];

    // Base text to match against (Pass 3)
    const baseText =
      act.anatomyProfile?.finalTranslation || act.translatedText || "";
    const appliedEdits = [];

    // Analyze which edits CAN be applied, but do not overwrite the main text yet
    for (const edit of edits) {
      if (edit.original && edit.replacement) {
        const escapedOriginal = this.escapeRegExp(edit.original);
        const regex = new RegExp(escapedOriginal, "g");

        // Check if the original exists in the text
        if (regex.test(baseText)) {
          appliedEdits.push({ ...edit, applied: true });
        } else {
          // If direct match fails, try fuzzy (case/whitespace insensitive) check
          const fuzzyOriginal = escapedOriginal.replace(/\s+/g, "\\s+");
          const fuzzyRegex = new RegExp(fuzzyOriginal, "gi");
          appliedEdits.push({ ...edit, applied: fuzzyRegex.test(baseText) });
        }
      }
    }

    // Do NOT overwrite act.translatedText here.
    // It remains the Pass 3 version until we export.
    act.anatomyProfile = {
      ...profile,
      pass4Polished: content,
      pass4Edits: appliedEdits,
      pass4AppliedCount: appliedEdits.filter((e) => e.applied).length,
      pass4TotalCount: appliedEdits.length,
    };

    await Polish.update({ isActive: false }, { where: { actId: act.id } });

    const newPolish = await Polish.create({
      actId: act.id,
      modelUsed: resolvedModel,
      content: content, // Store raw AI JSON output for reference
      editCount: appliedEdits.length,
      appliedCount: appliedEdits.filter((e) => e.applied).length,
      isActive: true,
    });

    await PolishEdit.bulkCreate(
      appliedEdits.map((edit) => ({
        actId: act.id,
        polishId: newPolish.id,
        original: edit.original,
        replacement: edit.replacement,
        reason: edit.reason,
        applied: edit.applied,
        modelUsed: resolvedModel,
      })),
    );

    return patchedText;
  }

  /**
   * Run translation on a single SubAct
   */
  async runTranslationOnSubAct({
    subActId,
    model,
    temperature,
    top_p,
    max_tokens,
  }) {
    const { messages, resolvedModel, subAct } =
      await this.prepareSubActTranslationContext(subActId, model);

    // Log the exact message being sent to LLM
    console.log(
      `[Translation] Sending to LLM - User message (first 1000 chars):\n${messages[1].content.substring(0, 1000)}`,
    );

    const payload = {
      model: resolvedModel,
      messages,
      temperature: temperature ?? 0.3,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 12000,
    };

    const content = await llmClient.chatCompletion(payload);
    if (!content) throw new Error("No content returned from LLM");

    const cleanedTranslation = this.stripThinking(content);

    await subAct.update({
      translatedText: cleanedTranslation,
      // Metadata/stats can be added to a JSON field if needed
    });

    console.log(
      `[Translation] Completed SubAct ${subActId} using ${resolvedModel}`,
    );

    return { subAct, translation: cleanedTranslation };
  }
}

module.exports = new TranslationService();
