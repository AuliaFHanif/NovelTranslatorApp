const express = require("express");
const {
  Act,
  Chapter,
  Series,
  GlossaryTerm,
  PolishEdit,
  Polish,
} = require("../models");

const { Op } = require("sequelize");
const translationService = require("../services/translationService");
const llmClient = require("../services/llmClient");
const { extractJson } = require("../services/utils");

const router = express.Router();

function parsePass(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    return null;
  }
  return parsed;
}


router.get("/translate/:seriesId/chapter/:chapterId", async (req, res) => {
  try {
    const seriesId = Number(req.params.seriesId);
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(seriesId) || seriesId < 1) {
      return res.status(400).json({ error: "Invalid seriesId" });
    }
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId, {
      include: [
        {
          model: Series,
          as: "Series",
          attributes: ["id", "title", "language", "genre"],
        },
      ],
    });

    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${chapterId} not found` });
    }

    if (chapter.seriesId !== seriesId) {
      return res
        .status(403)
        .json({ error: "Chapter does not belong to this series" });
    }

    const acts = await Act.findAll({
      where: { chapterId },
      include: [
        { model: PolishEdit, as: "PolishEdits" },
        {
          model: Polish,
          as: "Polishes",
          where: { isActive: true },
          required: false,
          include: [{ model: PolishEdit, as: "Edits" }],
        },
      ],
      order: [["sequence", "ASC"]],
    });

    const progress = {
      totalActs: acts.length,
      pass1Done: acts.length, // If acts exist, Architect is done
      pass2Done: acts.filter((act) => Boolean(act.anatomyProfile?.linguistic))
        .length,
      pass3Done: acts.filter((act) =>
        Boolean(act.anatomyProfile?.finalTranslation),
      ).length,
      pass4Done: acts.filter((act) => Boolean(act.translatedText)).length,
    };

    res.status(200).json({
      success: true,
      data: {
        chapter,
        acts,
        progress,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/translation/translate/:seriesId/chapter/:chapterId - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/acts/:actId/pass", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const pass = parsePass(req.body.pass);
    const force = Boolean(req.body.force);

    if (!Number.isInteger(actId) || actId < 1) {
      return res.status(400).json({ error: "Invalid actId" });
    }

    if (!pass) {
      return res.status(400).json({ error: "Pass must be 1, 2, or 3" });
    }

    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: `Act ${actId} not found` });
    }

    const result = await translationService.runPassOnAct({
      act,
      pass,
      force,
      model: req.body.model,
      temperature: req.body.temperature,
      top_p: req.body.top_p,
      max_tokens: req.body.max_tokens,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "POST /api/translation/acts/:actId/pass - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/chapters/:chapterId/pass", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    const pass = parsePass(req.body.pass);
    const force = Boolean(req.body.force);

    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    if (!pass) {
      return res.status(400).json({ error: "Pass must be 1, 2, 3, or 4" });
    }

    const acts = await Act.findAll({
      where: { chapterId },
      order: [["sequence", "ASC"]],
    });

    if (!acts.length) {
      return res
        .status(404)
        .json({ error: `No acts found for chapter ${chapterId}` });
    }

    const results = [];
    const failures = [];

    for (const act of acts) {
      try {
        const result = await translationService.runPassOnAct({
          act,
          pass,
          force,
          model: req.body.model,
          temperature: req.body.temperature,
          top_p: req.body.top_p,
          max_tokens: req.body.max_tokens,
        });
        results.push(result);
      } catch (err) {
        failures.push({
          actId: act.id,
          error: err.message,
        });
      }
    }

    const refreshedActs = await Act.findAll({
      where: { chapterId },
      include: [
        { model: PolishEdit, as: "PolishEdits" },
        {
          model: Polish,
          as: "Polishes",
          where: { isActive: true },
          required: false,
          include: [{ model: PolishEdit, as: "Edits" }],
        },
      ],
      order: [["sequence", "ASC"]],
    });

    res.status(failures.length > 0 ? 207 : 200).json({
      success: failures.length === 0,
      data: {
        pass,
        completed: results.length,
        failed: failures.length,
        failures,
        acts: refreshedActs,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/translation/chapters/:chapterId/pass - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.get("/acts/:actId/prompt", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const model = req.query.model;
    const act = await Act.findByPk(actId);

    if (!act) return res.status(404).json({ error: "Act not found" });

    const pass = parsePass(req.query.pass) || 3;
    const { messages } = await translationService.prepareActTranslationContext(
      act,
      model,
      pass,
    );

    res.status(200).json({
      success: true,
      data: {
        messages,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/translation/acts/:actId/prompt - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.get("/acts/:actId/stream", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const model = req.query.model;
    const passNum = Number(req.query.pass) || 3;

    const act = await Act.findByPk(actId);
    if (!act) return res.status(404).json({ error: "Act not found" });

    const { messages, resolvedModel, responseFormat } =
      await translationService.prepareActTranslationContext(act, model, passNum);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const payload = {
      model: resolvedModel,
      messages,
      temperature: 0.4,
      max_tokens: 16384,
    };

    if (responseFormat) payload.response_format = responseFormat;

    const stream = await llmClient.streamChatCompletion(payload);
    let fullText = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (passNum === 4) {
      await translationService.processPolishResults(
        act,
        fullText,
        resolvedModel,
      );
    } else {
      act.anatomyProfile = {
        ...(act.anatomyProfile || {}),
        finalTranslation: fullText,
      };
      act.translatedText = fullText;
    }

    act.status = "ready";
    act.lastRunAt = new Date();
    await act.save();

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Streaming route error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.end();
    }
  }
});

router.patch("/acts/:actId", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    if (!Number.isInteger(actId) || actId < 1) {
      return res.status(400).json({ error: "Invalid actId" });
    }

    const { draftTranslation, translation, rawText } = req.body;

    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: `Act ${actId} not found` });
    }

    if (rawText !== undefined) {
      act.rawText = rawText;
    }
    const profile = act.anatomyProfile || {};
    let saveProfile = false;

    if (draftTranslation !== undefined) {
      profile.draftTranslation = draftTranslation;
      saveProfile = true;
      act.status = "processing";
    }
    if (translation !== undefined) {
      profile.finalTranslation = translation;
      profile.pass3Final = translation;
      saveProfile = true;
      act.status = "ready";
    }

    if (translation !== undefined) {
      act.translatedText = translation;
    }

    if (saveProfile) {
      act.anatomyProfile = profile;
    }

    act.lastRunAt = new Date();
    await act.save();

    res.status(200).json({
      success: true,
      message: "Act updated",
      data: act,
    });
  } catch (error) {
    console.error("PATCH /api/translation/acts/:actId - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/polish-edits/:editId", async (req, res) => {
  try {
    const editId = Number(req.params.editId);
    if (!Number.isInteger(editId) || editId < 1) {
      return res.status(400).json({ error: "Invalid editId" });
    }

    const { applied } = req.body;
    if (typeof applied !== "boolean") {
      return res
        .status(400)
        .json({ error: "'applied' must be a boolean value" });
    }

    const edit = await PolishEdit.findByPk(editId);
    if (!edit) {
      return res
        .status(404)
        .json({ error: `PolishEdit ${editId} not found` });
    }

    edit.applied = applied;
    await edit.save();

    res.status(200).json({
      success: true,
      message: `Edit ${editId} marked as ${applied ? "applied" : "skipped"}`,
      data: edit,
    });
  } catch (error) {
    console.error(
      "PATCH /api/translation/polish-edits/:editId - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.delete("/chapters/:chapterId/acts", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);

    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${chapterId} not found` });
    }

    const deleted = await Act.destroy({ where: { chapterId } });

    // Reset chapter status
    chapter.status = "pending";
    chapter.finalText = null;
    chapter.strategyProfile = null;
    await chapter.save();

    res.status(200).json({
      success: true,
      message: `Deleted ${deleted} act(s) for chapter ${chapterId}`,
      deletedCount: deleted,
    });
  } catch (error) {
    console.error(
      "DELETE /api/translation/chapters/:chapterId/acts - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/chapters/:chapterId/export", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await translationService.aggregateChapterFinalText(
      chapterId,
    );
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    res.status(200).json({
      success: true,
      message: "Chapter exported successfully",
      data: chapter,
    });
  } catch (error) {
    console.error(
      "POST /api/translation/chapters/:chapterId/export - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.delete("/chapters/:chapterId/export", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    chapter.finalText = null;
    await chapter.save();

    res.status(200).json({
      success: true,
      message: "Chapter result deleted successfully",
      data: chapter,
    });
  } catch (error) {
    console.error(
      "DELETE /api/translation/chapters/:chapterId/export - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
