const express = require("express");
const router = express.Router();
const { Series, Chapter, Act } = require("../models");
const { runArchitectPhase } = require("../controllers/architectController");

/**
 * GET /api/chapters
 * List all chapters with optional filtering
 */
router.get("/", async (req, res) => {
  try {
    const { seriesId } = req.query;
    const where = seriesId ? { seriesId: parseInt(seriesId) } : {};

    const chapters = await Chapter.findAll({
      where,
      include: [{ model: Series, as: 'Series', attributes: ["id", "title", "language"] }],
      order: [["number", "ASC"]],
    });

    res.status(200).json({
      success: true,
      count: chapters.length,
      data: chapters,
    });
  } catch (error) {
    console.error("GET /api/chapters - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chapters
 * Create new chapter
 * Body: { seriesId, number, title?, rawText }
 */
router.post("/", async (req, res) => {
  try {
    const { seriesId, number, title, rawText } = req.body;

    // Validation
    if (!seriesId || !number || !rawText) {
      return res.status(400).json({
        error: "Missing required fields: seriesId, number, rawText",
      });
    }

    // Check series exists
    const series = await Series.findByPk(seriesId);
    if (!series) {
      return res.status(404).json({ error: `Series ${seriesId} not found` });
    }

    // Create chapter
    const chapter = await Chapter.create({
      seriesId,
      number,
      title: title || "Untitled",
      rawText,
    });

    res.status(201).json({
      success: true,
      message: "Chapter created",
      data: chapter,
    });
  } catch (error) {
    console.error("POST /api/chapters - Error:", error.message);

    // Handle specific Sequelize validation errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        error: "Chapter with this number already exists in this series",
      });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chapters/:chapterId/architect
 * Run Phase 2 Architect segmentation for a chapter
 */
router.post("/:chapterId/architect", runArchitectPhase);

/**
 * GET /api/chapters/:id
 * Get chapter details with associated acts
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findByPk(id, {
      include: [
        { model: Series, as: 'Series', attributes: ["id", "title", "language"] },
        { model: Act, as: 'Acts' },
      ],
    });

    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${id} not found` });
    }

    res.status(200).json({
      success: true,
      data: chapter,
    });
  } catch (error) {
    console.error("GET /api/chapters/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/chapters/:id
 * Update chapter finalText or other fields
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { finalText, title } = req.body;

    const chapter = await Chapter.findByPk(id);
    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${id} not found` });
    }

    if (finalText !== undefined) chapter.finalText = finalText;
    if (title !== undefined) chapter.title = title;

    await chapter.save();

    res.status(200).json({
      success: true,
      message: "Chapter updated",
      data: chapter,
    });
  } catch (error) {
    console.error("PATCH /api/chapters/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/chapters/:id
 * Delete chapter (cascades to acts and glossary entries)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const chapter = await Chapter.findByPk(id);
    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${id} not found` });
    }

    await chapter.destroy();

    res.status(200).json({
      success: true,
      message: `Chapter ${id} deleted`,
    });
  } catch (error) {
    console.error("DELETE /api/chapters/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
