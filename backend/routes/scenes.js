const express = require("express");
const router = express.Router();
const sceneCreation = require("../services/sceneCreation");
const sceneTranslation = require("../services/sceneTranslationService");
const scenePolish = require("../services/scenePolishService");
const sceneLexicographer = require("../services/sceneLexicographerService");
const { Scene, Chapter, GlossaryTerm } = require("../models");
const { clearCache } = require("../services/glossaryCache");
const llmClient = require("../services/llmClient");

function normalizeTermText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:"'()\[\]{}<>\-_/\\]/g, "")
    .trim();
}

// GET /api/scenes/chapters/:chapterId - List all scenes for a chapter
router.get("/chapters/:chapterId", async (req, res) => {
  try {
    const scenes = await Scene.findAll({
      where: { chapterId: req.params.chapterId },
      order: [["sequence", "ASC"]],
    });
    res.json({ success: true, data: scenes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/chapters/:chapterId/segment - Run scene detection
router.post("/chapters/:chapterId/segment", async (req, res) => {
  try {
    const chapter = await Chapter.findByPk(req.params.chapterId);
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    const scenes = await sceneCreation.createScenesFromChapter(
      chapter.id,
      chapter.rawText,
      { language: req.body.language, model: req.body.model },
    );

    res.json({
      success: true,
      scenesCreated: scenes.length,
      data: scenes,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/scenes/:id - Get single scene
router.get("/:id", async (req, res) => {
  try {
    const scene = await Scene.findByPk(req.params.id);
    if (!scene) return res.status(404).json({ error: "Scene not found" });
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/scenes/:id - Update scene attributes (text, translation, polish, status)
router.patch("/:id", async (req, res) => {
  try {
    const { rawText, translatedText, finalText, polishEdits, status } = req.body;

    // If updating attributes without modifying rawText
    if (!rawText && (translatedText !== undefined || finalText !== undefined || polishEdits !== undefined || status !== undefined)) {
      const scene = await Scene.findByPk(req.params.id);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      if (translatedText !== undefined) scene.translatedText = translatedText;
      if (finalText !== undefined) scene.finalText = finalText;
      if (polishEdits !== undefined) scene.polishEdits = polishEdits;
      if (status !== undefined) scene.status = status;

      await scene.save();

      return res.json({
        success: true,
        data: scene,
      });
    }

    // Original behavior: updating raw text
    const result = await sceneCreation.updateScene(req.params.id, rawText);
    res.json({
      success: true,
      split: result.split,
      data: result.scene || result.scenes,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/:id/translate - Translate scene
router.post("/:id/translate", async (req, res) => {
  try {
    const result = await sceneTranslation.translateScene(
      req.params.id,
      req.body,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/:id/translate/stream - Stream translate scene
router.post("/:id/translate/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sceneId = req.params.id;
  try {
    const { messages, model, scene, context, prompt } =
      await sceneTranslation.buildSceneTranslationContext(sceneId, req.body);

    const stream = await llmClient.streamChatCompletion({
      model,
      messages,
      temperature: req.body.temperature ?? 0.3,
      top_p: req.body.top_p ?? 0.95,
      max_tokens: req.body.max_tokens || 16384,
    });

    let fullText = "";
    let tempBuffer = "";
    let inThink = false;
    let inAnalysis = false;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (!content) continue;

      fullText += content;

      let toSend = "";
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        tempBuffer += char;

        if (tempBuffer.endsWith("<think>")) {
          inThink = true;
          tempBuffer = "";
        } else if (tempBuffer.endsWith("</think>")) {
          inThink = false;
          tempBuffer = "";
        } else if (tempBuffer.endsWith("<analysis>")) {
          inAnalysis = true;
          tempBuffer = "";
        } else if (tempBuffer.endsWith("</analysis>")) {
          inAnalysis = false;
          tempBuffer = "";
        } else {
          while (tempBuffer.length > 0 && !tempBuffer.startsWith("<")) {
            const outputChar = tempBuffer[0];
            tempBuffer = tempBuffer.slice(1);
            if (!inThink && !inAnalysis) {
              toSend += outputChar;
            }
          }

          if (tempBuffer.startsWith("<")) {
            const maxTagLen = 11;
            const isValidPartialTag = /^[<\/>a-z]*$/.test(tempBuffer);
            if (tempBuffer.length > maxTagLen || !isValidPartialTag) {
              const outputChar = tempBuffer[0];
              tempBuffer = tempBuffer.slice(1);
              if (!inThink && !inAnalysis) {
                toSend += outputChar;
              }
            }
          }
        }
      }

      if (toSend) {
        res.write(`data: ${JSON.stringify({ content: toSend })}\n\n`);
      }
    }

    if (tempBuffer && !inThink && !inAnalysis) {
      res.write(`data: ${JSON.stringify({ content: tempBuffer })}\n\n`);
    }

    // Process complete text database updates after stream completes successfully
    const cleaned = sceneTranslation.stripThinking(fullText);
    const summary = await sceneTranslation.generateContextSummary(cleaned);

    await scene.update({
      translatedText: cleaned,
      status: "translated",
      contextSummary: summary,
    });

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("[Streaming Translation Error]:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/scenes/:id/polish - Polish scene
router.post("/:id/polish", async (req, res) => {
  try {
    const result = await scenePolish.polishScene(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/:id/extract-terms - Identify new terms
router.post("/:id/extract-terms", async (req, res) => {
  try {
    const result = await sceneLexicographer.extractTermsFromScene(
      req.params.id,
      req.body,
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/:id/analyze - Narrative analysis
router.post("/:id/analyze", async (req, res) => {
  try {
    const result = await sceneLexicographer.analyzeSceneNarrative(
      req.params.id,
      req.body,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/bulk-approve-terms - Create/update glossary terms
router.post("/bulk-approve-terms", async (req, res) => {
  try {
    const {
      terms,
      seriesId,
      language,
      forceConflictResolution = false,
    } = req.body;
    if (!Array.isArray(terms) || !seriesId || !language) {
      return res.status(400).json({
        success: false,
        error: "terms (array), seriesId, and language are required",
      });
    }

    const termField = language === "ja" ? "termJa" : "termZh";

    const created = [];
    const updated = [];
    const conflicts = [];

    for (const termData of terms) {
      const sourceTerm = termData?.term?.trim();
      if (!sourceTerm) continue;

      const existing = await GlossaryTerm.findOne({
        where: {
          seriesId,
          [termField]: sourceTerm,
        },
      });

      if (!existing) {
        const term = await GlossaryTerm.create({
          seriesId,
          [termField]: sourceTerm,
          termEn: termData.proposedTranslation || sourceTerm,
          type: termData.type || "concept",
          definition: termData.definition || null,
          status: "approved",
          canonicalForm: sourceTerm,
        });
        created.push(term);
        continue;
      }

      const existingEn = normalizeTermText(existing.termEn);
      const proposedEn = normalizeTermText(termData.proposedTranslation);
      const hasConflict =
        existingEn &&
        proposedEn &&
        existingEn !== proposedEn &&
        !forceConflictResolution;

      if (hasConflict) {
        conflicts.push({
          existingId: existing.id,
          term: sourceTerm,
          existingTranslation: existing.termEn,
          proposedTranslation: termData.proposedTranslation,
        });
        continue;
      }

      await existing.update({
        status: "approved",
        termEn: termData.proposedTranslation || existing.termEn,
        definition: termData.definition || existing.definition,
        type: termData.type || existing.type,
      });
      updated.push(existing);
    }

    if (created.length || updated.length) {
      clearCache(seriesId);
    }

    res.json({
      success: true,
      count: created.length + updated.length,
      createdCount: created.length,
      updatedCount: updated.length,
      conflictCount: conflicts.length,
      conflicts,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/scenes/chapters/:chapterId - Bulk delete all scenes for a chapter
router.delete("/chapters/:chapterId", async (req, res) => {
  try {
    const deletedCount = await Scene.destroy({
      where: { chapterId: req.params.chapterId },
    });
    res.json({ success: true, deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/scenes/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await sceneCreation.deleteScene(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
