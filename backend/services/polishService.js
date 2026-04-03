"use strict";

const { SubAct, Act, Polish, Analysis, Chapter, Series } = require("../models");
const { resolveModel } = require("./resolveModel");
const llmClient = require("./llmClient");
const { extractJson } = require("./utils");
const { getPolishInstructions } = require("./polishPrompt");
const schemas = require("./analysisSchemas");

class PolishService {
  /**
   * Run polish on an Act or SubAct
   * @param {string} scope - 'act' or 'subact'
   * @param {number} id - ID of the entity
   * @param {Object} options - { model, temperature }
   */
  async runPolish(scope, id, options = {}) {
    const { model, temperature } = options;
    const resolvedModel = await resolveModel(model);

    let sourceText = "";
    let initialTranslation = "";
    let analysisContext = "";
    let language = "zh";

    if (scope === "subact") {
      const subAct = await SubAct.findByPk(id, {
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
            ],
          },
        ],
      });
      if (!subAct) throw new Error("SubAct not found");

      sourceText = subAct.rawText;
      initialTranslation = subAct.translatedText;
      language = subAct.Act.Chapter.Series.language;

      // Get guidance
      const analysis = await Analysis.findOne({
        where: { actId: subAct.Act.id },
      });
      const guidance =
        analysis?.anatomyProfile?.segmentGuidance?.[String(subAct.sequence)] ||
        {};
      analysisContext = `Segment Pacing: ${guidance.pacing || "normal"}\nSegment Tone: ${guidance.tone || "neutral"}`;
    } else {
      // Act-level polish (concatenated SubActs)
      const act = await Act.findByPk(id, {
        include: [
          { model: SubAct, as: "SubActs", order: [["sequence", "ASC"]] },
          {
            model: Chapter,
            as: "Chapter",
            include: [{ model: Series, as: "Series" }],
          },
        ],
      });
      if (!act) throw new Error("Act not found");

      sourceText = act.SubActs.map((s) => s.rawText).join("\n\n");
      initialTranslation = act.SubActs.map((s) => s.translatedText).join(
        "\n\n",
      );
      language = act.Chapter.Series.language;

      const analysis = await Analysis.findOne({ where: { actId: act.id } });
      analysisContext = `Primary Emotion: ${analysis?.anatomyProfile?.narrative?.primaryEmotion || "neutral"}`;
    }

    const messages = [
      {
        role: "system",
        content:
          "You are an expert literary editor. Refine the translation into natural, high-quality literary English while strictly preserving the author's voice and intent.",
      },
      {
        role: "user",
        content: `Source text (${language}):\n${sourceText}\n\nInitial translation:\n${initialTranslation}\n\nContext:\n${analysisContext}\n\nInstructions:\n${getPolishInstructions(language)}`,
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: resolvedModel,
        messages,
        temperature: temperature ?? 0.3,
        response_format: schemas.polish,
      });

      const parsed = JSON.parse(extractJson(content));

      // Save to Polish table
      const polish = await Polish.create({
        actId: scope === "act" ? id : null,
        subActId: scope === "subact" ? id : null,
        scope,
        originalText: initialTranslation,
        polishedText: parsed.polishedText || content,
        reason: parsed.notes || "",
        modelUsed: resolvedModel,
        isSelected: false,
      });

      return { polish, edits: parsed.edits || [] };
    } catch (err) {
      console.error(`[Polish] Failed for ${scope} ${id}:`, err.message);
      throw err;
    }
  }

  /**
   * Generate 3 batched polish variations in a single LLM call (more efficient)
   * @param {string} scope - 'act' or 'subact'
   * @param {number} id - ID of the entity
   * @param {Object} options - { model, temperature, count }
   * @returns {Array} - Array of Polish records created
   */
  async generateBatchedPolishes(scope, id, options = {}) {
    const { model, temperature, count = 3 } = options;
    const resolvedModel = await resolveModel(model);

    let sourceText = "";
    let initialTranslation = "";
    let analysisContext = "";
    let language = "zh";

    if (scope === "subact") {
      const subAct = await SubAct.findByPk(id, {
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
            ],
          },
        ],
      });
      if (!subAct) throw new Error("SubAct not found");

      sourceText = subAct.rawText;
      initialTranslation = subAct.translatedText;
      language = subAct.Act.Chapter.Series.language;

      const analysis = await Analysis.findOne({
        where: { actId: subAct.Act.id },
      });
      const guidance =
        analysis?.anatomyProfile?.segmentGuidance?.[String(subAct.sequence)] ||
        {};
      analysisContext = `Segment Pacing: ${guidance.pacing || "normal"}\nSegment Tone: ${guidance.tone || "neutral"}`;
    } else {
      const act = await Act.findByPk(id, {
        include: [
          { model: SubAct, as: "SubActs", order: [["sequence", "ASC"]] },
          {
            model: Chapter,
            as: "Chapter",
            include: [{ model: Series, as: "Series" }],
          },
        ],
      });
      if (!act) throw new Error("Act not found");

      sourceText = act.SubActs.map((s) => s.rawText).join("\n\n");
      initialTranslation = act.SubActs.map((s) => s.translatedText).join(
        "\n\n",
      );
      language = act.Chapter.Series.language;

      const analysis = await Analysis.findOne({ where: { actId: act.id } });
      analysisContext = `Primary Emotion: ${analysis?.anatomyProfile?.narrative?.primaryEmotion || "neutral"}`;
    }

    // Build prompt requesting all variations in one response
    const messages = [
      {
        role: "system",
        content:
          "You are an expert literary editor. Generate multiple refined versions of the translation into natural, high-quality literary English while strictly preserving the author's voice and intent.",
      },
      {
        role: "user",
        content: `Source text (${language}):\n${sourceText}\n\nInitial translation:\n${initialTranslation}\n\nContext:\n${analysisContext}\n\nInstructions:\n${getPolishInstructions(language)}\n\nIMPORTANT: Generate exactly ${count} different polish variations. Each variation should have a different focus/approach (e.g., 1st: improve flow, 2nd: fix terminology, 3rd: enhance style). Return as JSON array with format: [{"polishedText": "...", "reason": "focus area"}, ...]`,
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: resolvedModel,
        messages,
        temperature: temperature ?? 0.7, // Higher temp for diversity
        max_tokens: 4000, // Allow room for multiple variations
      });

      // Parse the response - expect an array
      let variations = [];
      try {
        const parsed = JSON.parse(extractJson(content));
        variations = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Fallback: treat entire response as single variation
        variations = [{ polishedText: content, reason: "generated" }];
      }

      // Limit to requested count
      variations = variations.slice(0, count);

      // Save all variations to Polish table
      const polishRecords = await Promise.all(
        variations.map((variation) =>
          Polish.create({
            actId: scope === "act" ? id : null,
            subActId: scope === "subact" ? id : null,
            scope,
            originalText: initialTranslation,
            polishedText: variation.polishedText || variation,
            reason: variation.reason || "variation",
            modelUsed: resolvedModel,
            isSelected: false,
          }),
        ),
      );

      console.log(
        `[Polish Batch] Generated ${polishRecords.length} variations for ${scope} ${id}`,
      );
      return polishRecords;
    } catch (err) {
      console.error(`[Polish Batch] Failed for ${scope} ${id}:`, err.message);
      throw err;
    }
  }

  /**
   * Finalize an Act by concatenating best available text
   * Priority: SubAct Polish (if selected) > Act Polish (if selected) > SubAct Translation
   */
  async finalizeAct(actId) {
    const act = await Act.findByPk(actId, {
      include: [
        { model: SubAct, as: "SubActs", order: [["sequence", "ASC"]] },
        { model: Analysis, as: "Analysis" },
      ],
    });

    if (!act) throw new Error("Act not found");

    // 1. Check for Act-level selected polish
    const actPolish = await Polish.findOne({
      where: { actId: act.id, scope: "act", isSelected: true },
    });

    if (actPolish) {
      // Act-level polish wins
      return actPolish.polishedText;
    }

    // 2. Aggregate SubAct texts
    let finalParts = [];
    for (const subAct of act.SubActs) {
      const subActPolish = await Polish.findOne({
        where: { subActId: subAct.id, scope: "subact", isSelected: true },
      });

      finalParts.push(
        subActPolish ? subActPolish.polishedText : subAct.translatedText,
      );
    }

    return finalParts.join("\n\n");
  }
}

module.exports = new PolishService();
