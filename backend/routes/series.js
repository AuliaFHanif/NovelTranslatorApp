const express = require("express");
const router = express.Router();
const { Series } = require("../models");

/**
 * GET /api/series
 * List all series
 */
router.get("/", async (req, res) => {
  try {
    const series = await Series.findAll({
      attributes: [
        "id",
        "title",
        "genre",
        "description",
        "language",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      count: series.length,
      data: series,
    });
  } catch (error) {
    console.error("GET /api/series - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/series
 * Create new series
 * Body: { title, language, genre?, description? }
 */
router.post("/", async (req, res) => {
  try {
    const { title, language, genre, description } = req.body;

    // Validation
    if (!title || !language) {
      return res.status(400).json({
        error: "Missing required fields: title, language",
      });
    }

    if (!["ja", "zh"].includes(language)) {
      return res.status(400).json({
        error: 'Invalid language. Must be "ja" (Japanese) or "zh" (Chinese)',
      });
    }

    const series = await Series.create({
      title,
      language,
      genre,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Series created",
      data: series,
    });
  } catch (error) {
    console.error("POST /api/series - Error:", error.message);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/series/:id
 * Get series details with chapters
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const series = await Series.findByPk(id, {
      include: ["Chapters"],
    });

    if (!series) {
      return res.status(404).json({ error: `Series ${id} not found` });
    }

    res.status(200).json({
      success: true,
      data: series,
    });
  } catch (error) {
    console.error("GET /api/series/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/series/:id
 * Update series metadata
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, genre, description, language } = req.body;

    const series = await Series.findByPk(id);
    if (!series) {
      return res.status(404).json({ error: `Series ${id} not found` });
    }

    if (title !== undefined) series.title = title;
    if (genre !== undefined) series.genre = genre;
    if (description !== undefined) series.description = description;
    if (language !== undefined) {
      if (!["ja", "zh"].includes(language)) {
        return res.status(400).json({ error: "Invalid language value" });
      }
      series.language = language;
    }

    await series.save();

    res.status(200).json({
      success: true,
      message: "Series updated",
      data: series,
    });
  } catch (error) {
    console.error("PATCH /api/series/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/series/:id
 * Delete series (cascades to chapters, acts, glossary entries)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const series = await Series.findByPk(id);
    if (!series) {
      return res.status(404).json({ error: `Series ${id} not found` });
    }

    await series.destroy();

    res.status(200).json({
      success: true,
      message: `Series ${id} deleted with all associated data`,
    });
  } catch (error) {
    console.error("DELETE /api/series/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
