const express = require("express");
const router = express.Router();
const { GlossaryTerm } = require("../models");

/**
 * PUT /api/glossary-terms/:id
 * Update a glossary term
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { termEn, type, status, definition } = req.body;

    const term = await GlossaryTerm.findByPk(id);
    if (!term) {
      return res.status(404).json({ error: `Glossary term ${id} not found` });
    }

    // If status is being set to 'rejected', delete the term
    if (status === "rejected") {
      await term.destroy();
      return res.status(200).json({
        success: true,
        message: `Glossary term ${id} deleted`,
      });
    }

    // Update fields if provided
    if (termEn !== undefined) term.termEn = termEn;
    if (type !== undefined) term.type = type;
    if (status !== undefined) term.status = status;
    if (definition !== undefined) term.definition = definition;

    if (status === "approved") {
      term.approvedAt = new Date();
      // You can optionally track who approved it if you have user info
      // term.approvedBy = req.user?.id;
    }

    await term.save();

    res.status(200).json({
      success: true,
      message: "Glossary term updated",
      data: term,
    });
  } catch (error) {
    console.error("PUT /api/glossary-terms/:id - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
