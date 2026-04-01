const {
  Act,
  Chapter,
  Series,
  GlossaryTerm,
  PolishEdit,
  Polish,
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
      userParts.push(`Glossary (use these translations for names/terms):\n${glossaryText}`);
    }

    if (analysisContext) {
      userParts.push(`Literary analysis context:\n${analysisContext}`);
    }

    userParts.push(
      "Task: Translate the following text into natural, faithful English. Preserve character voice, narrative tone, cultural nuance, and proper names. Return only the translated text.",
      "Source text:",
      rawActText
    );

    return [
      {
        role: "system",
        content: "You are an expert literary translator specializing in translating web novels. Produce faithful, natural English translations that preserve the author's voice, tone, and style.",
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
        content: "You are an expert literary editor. Refine translations into natural, high-quality literary English while strictly preserving the author's voice and intent.",
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
        const sourceTerm = entry[termField] || entry.canonicalForm || "(no source term)";
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
   * Prepare the messages and model configuration for an act translation/polish pass
   */
  async prepareActTranslationContext(act, model, pass) {
    const chapter = await Chapter.findByPk(act.chapterId, {
      include: [{ model: Series, as: "Series", attributes: ["id", "language", "title"] }],
    });

    if (!chapter) throw new Error(`Chapter ${act.chapterId} not found`);

    const glossaryEntries = await this.collectGlossaryForAct(chapter, act);
    const glossaryText = this.formatGlossary(glossaryEntries, chapter.Series.language);

    let analysisContext = `Current Position: Chapter ${chapter.number} | Act ${act.sequence} - ${act.label}`;
    const linguistic = act.anatomyProfile?.linguistic;
    const narrative = act.anatomyProfile?.narrative;

    if (linguistic || narrative) {
      const parts = [];
      if (narrative?.primaryEmotion) parts.push(`Primary emotion: ${narrative.primaryEmotion}`);
      if (narrative?.emotionalIntensity) parts.push(`Emotional intensity: ${narrative.emotionalIntensity}`);
      if (narrative?.pacingPattern) parts.push(`Pacing: ${narrative.pacingPattern}`);
      if (linguistic?.sentenceStructure) parts.push(`Sentence structure: ${linguistic.sentenceStructure}`);
      
      if (linguistic?.topicProminence?.frequency !== undefined) {
        const freq = linguistic.topicProminence.frequency;
        if (freq > 0) {
          parts.push(`Topic prominence frequency: ${(freq * 100).toFixed(0)}% — preserve subject-drop and topic-fronting constructions.`);
        }
      }
      
      if (linguistic?.honorifics?.density) parts.push(`Honorific density: ${linguistic.honorifics.density}`);
      if (linguistic?.onomatopoeia?.density) parts.push(`Onomatopoeia density: ${linguistic.onomatopoeia.density}`);
      if (narrative?.emotionalTone?.enryo) parts.push("Enryo present");
      if (narrative?.emotionalTone?.amae) parts.push("Amae present");
      
      if (parts.length > 0) analysisContext += "\n\n" + parts.join("\n");
    }

    const messages = pass !== 4
      ? this.buildTranslationPrompt({
          language: chapter.Series.language,
          rawActText: act.rawText || "",
          glossaryText,
          analysisContext,
        })
      : this.buildPolishPrompt({
          language: chapter.Series.language,
          rawActText: act.rawText || "",
          initialTranslation: act.anatomyProfile?.finalTranslation || "",
          analysisContext,
        });

    const resolvedModel = await resolveModel(model);
    const responseFormat = pass === 4 ? polishSchema : null;

    return { messages, resolvedModel, chapter, responseFormat };
  }

  /**
   * Strip thinking blocks from text
   */
  stripThinking(text) {
    if (!text) return "";
    let cleaned = text.replace(/(?:<think>|Thinking Process:)[\s\S]*?<\/think>/g, "").trim();
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
          include: [{ model: PolishEdit, as: "Edits", where: { applied: true }, required: false }],
        },
      ],
    });

    const cleanedTexts = acts.map((act) => {
      const activePolish = act.Polishes?.[0];
      const appliedEdits = activePolish?.Edits || [];
      let text;

      if (activePolish && act.anatomyProfile?.finalTranslation) {
        let patchedText = act.anatomyProfile.finalTranslation;
        for (const edit of appliedEdits) {
          if (edit.original && edit.replacement) {
            const regex = new RegExp(this.escapeRegExp(edit.original), "g");
            patchedText = patchedText.replace(regex, edit.replacement);
          }
        }
        text = patchedText;
      } else {
        text = act.translatedText || act.anatomyProfile?.finalTranslation || "";
      }

      return this.stripThinking(text);
    }).filter(Boolean);

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

    let patchedText = act.anatomyProfile?.finalTranslation || "";
    const appliedEdits = [];

    for (const edit of edits) {
      if (edit.original && edit.replacement) {
        const escapedOriginal = this.escapeRegExp(edit.original);
        let regex = new RegExp(escapedOriginal, "g");

        if (!regex.test(patchedText)) {
          const fuzzyOriginal = escapedOriginal.replace(/\s+/g, "\\s+");
          regex = new RegExp(fuzzyOriginal, "g");
        } else {
          regex = new RegExp(escapedOriginal, "g");
        }

        if (regex.test(patchedText)) {
          patchedText = patchedText.replace(regex, edit.replacement);
          appliedEdits.push({ ...edit, applied: true });
        } else {
          appliedEdits.push({ ...edit, applied: false });
        }
      }
    }

    act.translatedText = patchedText;
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
      content: patchedText,
      editCount: appliedEdits.length,
      appliedCount: appliedEdits.filter((e) => e.applied).length,
      isActive: true,
    });

    await PolishEdit.bulkCreate(appliedEdits.map((edit) => ({
      actId: act.id,
      polishId: newPolish.id,
      original: edit.original,
      replacement: edit.replacement,
      reason: edit.reason,
      applied: edit.applied,
      modelUsed: resolvedModel,
    })));
    
    return patchedText;
  }

  /**
   * Run a pass on a single act
   */
  async runPassOnAct({ act, pass, force, model, temperature, top_p, max_tokens }) {
    const readiness = this.canRunPass(act, pass, force);
    if (!readiness.ok) throw new Error(readiness.reason);

    const { messages, resolvedModel, chapter, responseFormat } = 
      await this.prepareActTranslationContext(act, model, pass);

    const payload = {
      model: resolvedModel,
      messages,
      temperature: temperature ?? 0.4,
      top_p: top_p ?? 0.9,
      max_tokens: max_tokens ?? 16384,
    };

    if (responseFormat) payload.response_format = responseFormat;

    const content = await llmClient.chatCompletion(payload);
    if (!content) throw new Error("No content returned from LLM");

    if (pass === 4) {
      await this.processPolishResults(act, content, resolvedModel);
    } else {
      act.anatomyProfile = { ...(act.anatomyProfile || {}), finalTranslation: content };
      act.translatedText = content;
    }

    act.status = "ready";
    act.lastRunAt = new Date();
    act.llmMeta = {
      ...(act.llmMeta || {}),
      [`pass${pass}`]: {
        model: resolvedModel,
        temperature: payload.temperature,
        top_p: payload.top_p,
        max_tokens: payload.max_tokens,
        ranAt: new Date().toISOString(),
      },
    };

    await act.save();
    await Chapter.update({ status: "ready" }, { where: { id: act.chapterId } });

    return { act, pass, output: content };
  }
}

module.exports = new TranslationService();
