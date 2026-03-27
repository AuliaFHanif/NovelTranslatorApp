const express = require("express");
const router = express.Router();
const { Genre, AIModel } = require("../models");

/**
 * GENRES ENDPOINTS
 */

/**
 * GET /api/settings/genres
 * List all genres
 */
router.get("/genres", async (req, res) => {
  try {
    const genres = await Genre.findAll({
      order: [["name", "ASC"]],
    });
    res.status(200).json({
      success: true,
      data: genres,
    });
  } catch (error) {
    console.error("GET /api/settings/genres - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/settings/genres
 * Create a new genre
 * Body: { name, description? }
 */
router.post("/genres", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Genre name is required" });
    }

    const genre = await Genre.create({
      name: name.trim(),
      description: description ? description.trim() : null,
    });

    res.status(201).json({
      success: true,
      message: "Genre created",
      data: genre,
    });
  } catch (error) {
    console.error("POST /api/settings/genres - Error:", error.message);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Genre name already exists" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/settings/genres/:id
 * Update a genre
 * Body: { name?, description? }
 */
router.patch("/genres/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const genre = await Genre.findByPk(id);
    if (!genre) {
      return res.status(404).json({ error: `Genre ${id} not found` });
    }

    if (name) {
      genre.name = name.trim();
    }
    if (description !== undefined) {
      genre.description = description ? description.trim() : null;
    }

    await genre.save();

    res.status(200).json({
      success: true,
      message: "Genre updated",
      data: genre,
    });
  } catch (error) {
    console.error("PATCH /api/settings/genres/:id - Error:", error.message);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Genre name already exists" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/settings/genres/:id
 * Delete a genre
 */
router.delete("/genres/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const genre = await Genre.findByPk(id);
    if (!genre) {
      return res.status(404).json({ error: `Genre ${id} not found` });
    }

    await genre.destroy();

    res.status(200).json({
      success: true,
      message: "Genre deleted",
    });
  } catch (error) {
    console.error("DELETE /api/settings/genres/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * AI MODELS ENDPOINTS
 */

/**
 * GET /api/settings/ai-models
 * List all AI models
 */
router.get("/ai-models", async (req, res) => {
  try {
    const models = await AIModel.findAll({
      order: [["name", "ASC"]],
    });
    res.status(200).json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error("GET /api/settings/ai-models - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/settings/ai-models
 * Create a new AI model
 * Body: { name, modelId, provider?, description?, isActive? }
 */
router.post("/ai-models", async (req, res) => {
  try {
    const { name, modelId, provider, description, isActive } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Model name is required" });
    }

    if (!modelId || !modelId.trim()) {
      return res.status(400).json({ error: "Model ID is required" });
    }

    const model = await AIModel.create({
      name: name.trim(),
      modelId: modelId.trim(),
      provider: provider || "lm-studio",
      description: description ? description.trim() : null,
      isActive: isActive !== false,
    });

    res.status(201).json({
      success: true,
      message: "AI model created",
      data: model,
    });
  } catch (error) {
    console.error("POST /api/settings/ai-models - Error:", error.message);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Model name already exists" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/settings/ai-models/:id
 * Update an AI model
 * Body: { name?, modelId?, provider?, description?, isActive? }
 */
router.patch("/ai-models/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, modelId, provider, description, isActive } = req.body;

    const model = await AIModel.findByPk(id);
    if (!model) {
      return res.status(404).json({ error: `AI model ${id} not found` });
    }

    if (name) {
      model.name = name.trim();
    }
    if (modelId) {
      model.modelId = modelId.trim();
    }
    if (provider) {
      model.provider = provider;
    }
    if (description !== undefined) {
      model.description = description ? description.trim() : null;
    }
    if (isActive !== undefined) {
      model.isActive = isActive;
    }

    await model.save();

    res.status(200).json({
      success: true,
      message: "AI model updated",
      data: model,
    });
  } catch (error) {
    console.error("PATCH /api/settings/ai-models/:id - Error:", error.message);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Model name already exists" });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/settings/ai-models/:id
 * Delete an AI model
 */
router.delete("/ai-models/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const model = await AIModel.findByPk(id);
    if (!model) {
      return res.status(404).json({ error: `AI model ${id} not found` });
    }

    await model.destroy();

    res.status(200).json({
      success: true,
      message: "AI model deleted",
    });
  } catch (error) {
    console.error("DELETE /api/settings/ai-models/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
