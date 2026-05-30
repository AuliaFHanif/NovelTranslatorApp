const express = require("express");
const {
  Chapter,
  Series,
  Scene,
  GlossaryTerm,
  TermAppearance,
} = require("../models");

const { Op } = require("sequelize");
const llmClient = require("../services/llmClient");

const router = express.Router();

/**
 * GET /api/translation/translate/:seriesId/chapter/:chapterId
 * Get comprehensive chapter status for translation (Bootstrap)
 */
router.get("/translate/:seriesId/chapter/:chapterId", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);

    const chapter = await Chapter.findByPk(chapterId, {
      include: [
        { model: Series, as: "Series" },
        { model: Scene, as: "Scenes" },
      ],
      order: [
        [{ model: Scene, as: "Scenes" }, "sequence", "ASC"],
      ],
    });

    if (!chapter) return res.status(404).json({ error: "Chapter not found" });

    // Calculate progress based on Scenes
    const totalScenes = chapter.Scenes?.length || 0;
    const translatedScenes = chapter.Scenes?.filter((s) => !!s.translatedText).length || 0;
    const polishedScenes = chapter.Scenes?.filter((s) => !!s.finalText).length || 0;

    const chapterJson = chapter.toJSON();

    res.status(200).json({
      success: true,
      data: {
        chapter: chapterJson,
        scenes: chapterJson.Scenes || [],
        progress: {
          total: totalScenes,
          translated: translatedScenes,
          polished: polishedScenes,
          percent:
            totalScenes > 0
              ? (((translatedScenes + polishedScenes) / (totalScenes * 2)) * 100).toFixed(1)
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("GET /translate/:seriesId/chapter/:chapterId - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Legacy support for common translation endpoints
 * These are mostly handled by /api/scenes now, but keeping some structure for compatibility
 */

module.exports = router;
