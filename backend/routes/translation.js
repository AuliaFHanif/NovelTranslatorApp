const express = require("express");
const {
  Act,
  SubAct,
  Chapter,
  Series,
  GlossaryTerm,
  Analysis,
  Polish,
  TermAppearance,
} = require("../models");

const { Op } = require("sequelize");
const translationService = require("../services/translationService");
const polishService = require("../services/polishService");
const llmClient = require("../services/llmClient");
const { extractJson } = require("../services/utils");

const router = express.Router();

/**
 * GET /api/translation/translate/:seriesId/chapter/:chapterId
 * Get comprehensive chapter status for translation
 */
router.get("/translate/:seriesId/chapter/:chapterId", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);

    const chapter = await Chapter.findByPk(chapterId, {
      include: [
        { model: Series, as: "Series" },
        {
          model: Act,
          as: "Acts",
          include: [
            { model: SubAct, as: "SubActs" },
            { model: Analysis, as: "Analysis" },
          ],
        },
      ],
      order: [
        [{ model: Act, as: "Acts" }, "sequence", "ASC"],
        [
          { model: Act, as: "Acts" },
          { model: SubAct, as: "SubActs" },
          "sequence",
          "ASC",
        ],
      ],
    });

    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    // Calculate progress based on SubActs
    let totalSubActs = 0;
    let translatedSubActs = 0;
    chapter.Acts.forEach((act) => {
      totalSubActs += act.SubActs.length;
      translatedSubActs += act.SubActs.filter((s) => !!s.translatedText).length;
    });

    const chapterJson = chapter.toJSON();

    res.status(200).json({
      success: true,
      data: {
        chapter: chapterJson,
        acts: chapterJson.Acts || [],
        progress: {
          totalSubActs,
          translatedSubActs,
          percent:
            totalSubActs > 0
              ? ((translatedSubActs / totalSubActs) * 100).toFixed(1)
              : 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/subacts/:subActId/translate
 * Translate a single SubAct
 */
router.post("/subacts/:subActId/translate", async (req, res) => {
  try {
    const subActId = Number(req.params.subActId);
    const { model, temperature } = req.body;

    const result = await translationService.runTranslationOnSubAct({
      subActId,
      model,
      temperature,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/chapters/:chapterId/translate
 * Translate all SubActs in a chapter
 */
router.post("/chapters/:chapterId/translate", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    const { model } = req.body;

    const acts = await Act.findAll({
      where: { chapterId },
      include: [{ model: SubAct, as: "SubActs" }],
      order: [["sequence", "ASC"]],
    });

    const results = [];
    const failures = [];

    for (const act of acts) {
      // Sort subacts manually if include order failed or just to be safe
      const sortedSubActs = act.SubActs.sort((a, b) => a.sequence - b.sequence);
      for (const subAct of sortedSubActs) {
        try {
          const res = await translationService.runTranslationOnSubAct({
            subActId: subAct.id,
            model,
          });
          results.push(res);
        } catch (err) {
          failures.push({ subActId: subAct.id, error: err.message });
        }
      }
    }

    res.status(failures.length > 0 ? 207 : 200).json({
      success: failures.length === 0,
      completed: results.length,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/polish/:scope/:id
 * Run polish on Act or SubAct
 */
router.post("/polish/:scope/:id", async (req, res) => {
  try {
    const { scope, id } = req.params;
    const { model, temperature } = req.body;

    if (!["act", "subact"].includes(scope)) {
      return res.status(400).json({ error: "Invalid scope" });
    }

    const result = await polishService.runPolish(scope, id, {
      model,
      temperature,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/polish-batch/:scope/:id
 * Generate multiple batched polish variations in one LLM call (efficient)
 * Request body: { model?, temperature?, count? }
 */
router.post("/polish-batch/:scope/:id", async (req, res) => {
  try {
    const { scope, id } = req.params;
    const { model, temperature, count = 3 } = req.body;

    if (!["act", "subact"].includes(scope)) {
      return res.status(400).json({ error: "Invalid scope" });
    }

    const polishRecords = await polishService.generateBatchedPolishes(
      scope,
      id,
      {
        model,
        temperature,
        count: Math.min(count, 5), // Cap at 5 variations max
      },
    );

    res.status(201).json({
      success: true,
      count: polishRecords.length,
      data: polishRecords,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/acts/:actId/finalize
 * Finalize an Act by concatenating best text
 */
router.post("/acts/:actId/finalize", async (req, res) => {
  try {
    const actId = req.params.actId;
    const finalText = await polishService.finalizeAct(actId);

    // We could save this to the Act or just return it
    res.status(200).json({
      success: true,
      finalText,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/translation/subacts/:subActId/prompt
 * Get the translation prompt for a SubAct (for debugging)
 */
router.get("/subacts/:subActId/prompt", async (req, res) => {
  try {
    const subActId = req.params.subActId;
    const { model } = req.query;
    const { messages } =
      await translationService.prepareSubActTranslationContext(subActId, model);

    res.status(200).json({
      success: true,
      data: { messages },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/translation/subacts/:subActId
 * Manually update subact translation
 */
router.patch("/subacts/:subActId", async (req, res) => {
  try {
    const subActId = req.params.subActId;
    const { translatedText } = req.body;

    const subAct = await SubAct.findByPk(subActId);
    if (!subAct) return res.status(404).json({ error: "SubAct not found" });

    await subAct.update({ translatedText });

    res.status(200).json({ success: true, data: subAct });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/translation/acts/:actId
 * Manually update act translation
 */
router.patch("/acts/:actId", async (req, res) => {
  try {
    const actId = req.params.actId;
    const { translatedText } = req.body;

    const act = await Act.findByPk(actId);
    if (!act) return res.status(404).json({ error: "Act not found" });

    await act.update({ translatedText });

    res.status(200).json({ success: true, data: act });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/chapters/:chapterId/export
 * Export the whole chapter
 */
router.post("/chapters/:chapterId/export", async (req, res) => {
  try {
    const chapterId = req.params.chapterId;
    const acts = await Act.findAll({
      where: { chapterId },
      order: [["sequence", "ASC"]],
    });

    let finalChapterText = "";
    for (const act of acts) {
      const actText = await polishService.finalizeAct(act.id);
      finalChapterText += actText + "\n\n";
    }

    const chapter = await Chapter.findByPk(chapterId);
    await chapter.update({
      finalText: finalChapterText.trim(),
      status: "complete",
    });

    res.status(200).json({ success: true, finalText: finalChapterText.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/translation/chapters/:chapterId/acts
 * Delete all acts for a chapter (for re-segmentation)
 */
router.delete("/chapters/:chapterId/acts", async (req, res) => {
  try {
    const chapterId = req.params.chapterId;

    const acts = await Act.findAll({ where: { chapterId } });
    const actIds = acts.map((a) => a.id);

    if (actIds.length === 0) {
      return res.status(200).json({ success: true, deletedCount: 0 });
    }

    // Delete all related data
    await SubAct.destroy({ where: { actId: actIds } });
    await Analysis.destroy({ where: { actId: actIds } });
    await Polish.destroy({ where: { actId: actIds } });

    // Delete term appearances for these acts
    const termAppearanceCount = await TermAppearance.destroy({
      where: { actId: actIds },
    });

    // Delete acts
    const deletedCount = await Act.destroy({ where: { chapterId } });

    res.status(200).json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} acts and ${termAppearanceCount} term appearances`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/translation/acts/:actId/prompt
 * Get the translation prompt for an Act (wrapper that handles Acts with SubActs)
 */
router.get("/acts/:actId/prompt", async (req, res) => {
  try {
    const actId = req.params.actId;
    const { model } = req.query;

    const act = await Act.findByPk(actId, {
      include: [
        { model: SubAct, as: "SubActs" },
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
    });

    if (!act) return res.status(404).json({ error: "Act not found" });

    console.log(
      `[Prompt] Act ${act.id} loaded. Has Analysis: ${!!act.Analysis}, Has anatomyProfile: ${!!act.Analysis?.anatomyProfile}`,
    );

    // If Act has SubActs, get prompt for the first one (primary subact)
    if (act.SubActs && act.SubActs.length > 0) {
      const { messages } =
        await translationService.prepareSubActTranslationContext(
          act.SubActs[0].id,
          model,
        );

      // Log glossary status for debugging
      const { smartInjectionService } = require("../services");
      const termsData = await smartInjectionService.loadGlossaryForSeries(
        act.Chapter.Series.id,
      );
      console.log(
        `[Prompt] Act ${act.id} glossary terms loaded: ${termsData.injected.length} terms`,
      );

      return res.status(200).json({
        success: true,
        data: { messages },
      });
    }

    // Otherwise, build prompt for the Act itself with glossary and analysis injected
    const series = act.Chapter.Series;
    const { smartInjectionService } = require("../services");

    // Build glossary from approved terms
    const termsData = await smartInjectionService.loadGlossaryForSeries(
      series.id,
    );
    const glossaryText = smartInjectionService.buildGlossaryPrompt(termsData);

    // Build comprehensive analysis context (structure, emotions, pacing, idioms, etc.)
    const analysisContext = smartInjectionService.buildAnalysisContext(act);

    const messages = translationService.buildTranslationPrompt({
      language: series.language,
      rawActText: act.rawText,
      glossaryText,
      analysisContext,
    });

    res.status(200).json({
      success: true,
      data: { messages },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/acts/:actId/stream
 * Stream translation for an Act (translates its SubActs sequentially)
 * Query params: model={modelId}&pass={3|4}
 */
router.post("/acts/:actId/stream", async (req, res) => {
  try {
    const actId = req.params.actId;
    const { model, pass = "3" } = req.query;

    const act = await Act.findByPk(actId, {
      include: [{ model: SubAct, as: "SubActs" }],
    });

    if (!act) return res.status(404).json({ error: "Act not found" });

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendChunk = (content) => {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    };

    try {
      // If Act has SubActs, translate them sequentially
      if (act.SubActs && act.SubActs.length > 0) {
        const sortedSubActs = act.SubActs.sort(
          (a, b) => a.sequence - b.sequence,
        );

        for (const subAct of sortedSubActs) {
          if (pass === "4") {
            // Polish mode - use existing method
            const polishRes = await polishService.runPolish(
              "subact",
              subAct.id,
              { model },
            );
            sendChunk(polishRes?.polishedText || "");
          } else {
            // Translation mode (pass 3) - use streaming
            const { messages, resolvedModel } =
              await translationService.prepareSubActTranslationContext(
                subAct.id,
                model,
              );

            const payload = {
              model: resolvedModel,
              messages,
              temperature: 0.3,
              top_p: 0.95,
              max_tokens: 8192,
            };

            try {
              const stream = await llmClient.streamChatCompletion(payload);

              // Stream tokens as they arrive
              for await (const chunk of stream) {
                const token = chunk.choices[0]?.delta?.content || "";
                if (token) {
                  sendChunk(token);
                }
              }

              // Save the complete translation to DB
              const fullTranslation = ""; // TODO: would need to accumulate above
              // For now, call the non-streaming version to save
              await translationService.runTranslationOnSubAct({
                subActId: subAct.id,
                model,
              });
            } catch (streamError) {
              console.error(
                `Stream error for SubAct ${subAct.id}:`,
                streamError,
              );
              // Fall back to non-streaming
              const translateRes =
                await translationService.runTranslationOnSubAct({
                  subActId: subAct.id,
                  model,
                });
              sendChunk(translateRes?.translation || "");
            }
          }
        }
      } else {
        // If no SubActs, translate the Act's rawText directly
        if (pass === "4") {
          sendChunk("Act polish not available without subacts");
        } else {
          sendChunk(act.rawText); // Placeholder - could implement direct translation
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      sendChunk(`ERROR: ${err.message}`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/translation/subacts/:subActId/stream
 * Stream translation for a single SubAct
 * Query params: model={modelId}&pass={3|4}
 */
router.post("/subacts/:subActId/stream", async (req, res) => {
  try {
    const subActId = req.params.subActId;
    const { model, pass = "3" } = req.query;

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

    if (!subAct) return res.status(404).json({ error: "SubAct not found" });

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendChunk = (content) => {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    };

    try {
      if (pass === "4") {
        // Polish mode
        const polishRes = await polishService.runPolish("subact", subAct.id, {
          model,
        });
        sendChunk(polishRes?.polishedText || "");
      } else {
        // Translation mode (pass 3) - use streaming
        const { messages, resolvedModel } =
          await translationService.prepareSubActTranslationContext(
            subAct.id,
            model,
          );

        const payload = {
          model: resolvedModel,
          messages,
          temperature: 0.3,
          top_p: 0.95,
          max_tokens: 8192,
        };

        try {
          const stream = await llmClient.streamChatCompletion(payload);

          // Stream tokens as they arrive
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || "";
            if (token) {
              sendChunk(token);
            }
          }

          // Save the complete translation to DB
          await translationService.runTranslationOnSubAct({
            subActId: subAct.id,
            model,
          });
        } catch (streamError) {
          console.error(`Stream error for SubAct ${subAct.id}:`, streamError);
          // Fall back to non-streaming
          const translateRes = await translationService.runTranslationOnSubAct({
            subActId: subAct.id,
            model,
          });
          sendChunk(translateRes?.translation || "");
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      sendChunk(`ERROR: ${err.message}`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/translation/polish/:polishId/select
 * Mark a polish variation as selected
 */
router.patch("/polish/:polishId/select", async (req, res) => {
  try {
    const polishId = Number(req.params.polishId);

    const polish = await Polish.findByPk(polishId);
    if (!polish) return res.status(404).json({ error: "Polish not found" });

    // Update this polish as selected
    await polish.update({ isSelected: true });

    // If there's a scope and ID, mark others as not selected
    // (Only one polish should be selected per act/subact)
    if (polish.actId) {
      await Polish.update(
        { isSelected: false },
        { where: { actId: polish.actId, id: { [Op.ne]: polishId } } },
      );
    }
    if (polish.subActId) {
      await Polish.update(
        { isSelected: false },
        { where: { subActId: polish.subActId, id: { [Op.ne]: polishId } } },
      );
    }

    res.status(200).json({
      success: true,
      message: "Polish selected",
      data: polish,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
