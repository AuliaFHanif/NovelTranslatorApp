/**
 * Architect Controller - Phase 2 Segmentation
 *
 * Changes:
 * 1. Better error handling and logging
 * 2. Performance timing logs
 * 3. Cleaner response structure
 */

const {
  Chapter,
  Act,
  Series,
  SubAct,
  Analysis,
  Polish,
  TermAppearance,
} = require("../models");
const { Op } = require("sequelize");
const {
  normalizeParagraphs,
  normalizeLineBreaksAndHtml,
} = require("../services/paragraphNormalizer");
const { callSegmentationAI } = require("../services/aiSegmentation");
const actCreationService = require("../services/actCreation");
const TextMetrics = require("../utils/textMetrics");

/**
 * Calculate coverage statistics for diagnostics
 */
function getCoverageDiagnostics(paragraphs, boundaries) {
  const lastBoundary = boundaries[boundaries.length - 1] || 0;
  const paragraphCount = paragraphs.length;
  const coveredParagraphs = Math.min(lastBoundary, paragraphCount);
  const coveragePercent =
    paragraphCount === 0
      ? 0
      : Number(((coveredParagraphs / paragraphCount) * 100).toFixed(2));

  return {
    paragraphCount,
    boundaryCount: boundaries.length,
    lastBoundary,
    coveredParagraphs,
    coveragePercent,
    gapCount: Math.max(0, paragraphCount - coveredParagraphs),
  };
}

/**
 * POST /api/chapters/:chapterId/architect
 * Run Phase 2 hierarchical segmentation
 */
async function runArchitectPhase(req, res) {
  const chapterId = Number(req.params.chapterId);
  const startTime = Date.now();

  if (!Number.isInteger(chapterId) || chapterId < 1) {
    return res.status(400).json({ error: "Invalid chapterId" });
  }

  let chapter;

  try {
    // 1. Fetch chapter
    chapter = await Chapter.findByPk(chapterId, {
      include: [{ model: Series, as: "Series" }],
    });
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    if (!chapter.rawText || !chapter.rawText.trim()) {
      return res.status(400).json({ error: "No raw text" });
    }

    const language = chapter.Series?.language || "zh";

    console.log(
      `[Architect] Starting hierarchical segmentation for chapter ${chapterId} (${language})`,
    );
    await chapter.update({ status: "processing" });

    // 2. HARD RESET: Clear existing Acts and ALL children
    const existingActs = await Act.findAll({ where: { chapterId } });
    const actIds = existingActs.map((a) => a.id);

    if (actIds.length > 0) {
      console.log(
        `[Architect] Hard Reset: Purging ${actIds.length} existing acts and children`,
      );
      await SubAct.destroy({ where: { actId: actIds } });
      await Analysis.destroy({ where: { actId: actIds } });
      await Polish.destroy({
        where: {
          [Op.or]: [{ actId: actIds }, { subActId: { [Op.ne]: null } }],
        },
      });
      await TermAppearance.destroy({
        where: {
          [Op.or]: [{ actId: actIds }, { subActId: { [Op.ne]: null } }],
        },
      });
      await Act.destroy({ where: { chapterId } });
    }

    // 3. Normalize text
    const paragraphs = normalizeParagraphs(chapter.rawText);

    if (paragraphs.length === 0) {
      throw new Error("No paragraphs could be extracted from chapter text");
    }

    const units = TextMetrics.countUnits(chapter.rawText, language);
    console.log(`[Architect] Text units: ${units} (${language})`);

    // 4. AI Segmentation (Recursive)
    const segStartTime = Date.now();
    const segmentation = await callSegmentationAI(paragraphs, { language });
    const segDuration = Date.now() - segStartTime;

    console.log(`[Architect] AI segmentation completed in ${segDuration}ms`);
    console.log(
      `[Architect] Segmentation breakdown: ${segmentation.batchCount} SubActs from ${segmentation.acts?.length || 0} Acts`,
    );

    // 5. Create acts and SubActs
    const createStartTime = Date.now();
    const acts = await actCreationService.createActs(
      chapterId,
      paragraphs,
      segmentation,
      language,
    );
    const createDuration = Date.now() - createStartTime;

    console.log(
      `[Architect] Created ${acts.length} acts in ${createDuration}ms`,
    );

    // Update chapter status
    await chapter.update({ status: "ready" });

    const totalDuration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        chapterId,
        actsCreated: acts.length,
        segmentationSource: segmentation.source,
        timing: {
          total: totalDuration,
          aiSegmentation: segDuration,
          actCreation: createDuration,
        },
        metrics: {
          paragraphs: paragraphs.length,
          totalUnits: units,
        },
        acts: acts.map((act) => ({
          id: act.id,
          label: act.label,
          sequence: act.sequence,
          status: act.status,
        })),
      },
    });
  } catch (error) {
    console.error(`[Architect] Error: ${error.message}`);
    if (chapter) await chapter.update({ status: "pending" });

    return res.status(500).json({
      error: error.message || "Segmentation failed",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

/**
 * PATCH /api/acts/:id
 * Update act text (with auto-split if too large)
 */
async function updateAct(req, res) {
  const actId = Number(req.params.id);
  const { rawText } = req.body;

  if (!Number.isInteger(actId) || actId < 1) {
    return res.status(400).json({ error: "Invalid actId" });
  }

  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return res
      .status(400)
      .json({ error: "rawText is required and must be non-empty" });
  }

  try {
    let act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: "Act not found" });
    }

    const chapter = await act.getChapter();
    if (!chapter) {
      return res.status(404).json({ error: "Parent chapter not found" });
    }

    const wordCount = TextMetrics.countUnifiedWords(rawText);
    const { maxUnifiedWordsPerAct } =
      require("../config/segmentation").boundaries;

    // Check if split needed
    if (wordCount > maxUnifiedWordsPerAct) {
      // Split logic
      const normalizedText = normalizeLineBreaksAndHtml(rawText);
      const paragraphs = normalizeParagraphs(normalizedText);

      if (paragraphs.length === 0) {
        return res
          .status(400)
          .json({ error: "No paragraphs found in updated text" });
      }

      const baseLabel = act.label.replace(/[A-Z]$/, "");
      const baseLabelNum = parseInt(baseLabel) || act.sequence;

      // Delete old act
      await Act.destroy({ where: { id: actId } });

      // Create splits
      const splits = actCreationService.splitActForEdit(rawText, paragraphs);
      const newActs = [];

      for (let j = 0; j < splits.length; j++) {
        const split = splits[j];
        const newAct = await Act.create({
          chapterId: chapter.id,
          sequence: act.sequence + j,
          label: `${baseLabelNum}${split.label}`,
          rawText: split.text,
          tokenCount: split.tokens,
          segmentSource: act.segmentSource || "manual",
          status: "pending",
        });

        newActs.push(newAct);

        // Dependencies
        if (j > 0) {
          const { ActDependency } = require("../models");
          await ActDependency.create({
            actId: newAct.id,
            dependsOnActId: newActs[j - 1].id,
            dependencyType: "translation_sequence",
          });
        }
      }

      return res.status(200).json({
        success: true,
        wasSplit: true,
        message: `Act split into ${splits.length} acts`,
        updatedActs: newActs.map((a) => ({
          id: a.id,
          label: a.label,
          sequence: a.sequence,
          wordCount: TextMetrics.countUnifiedWords(a.rawText),
          status: a.status,
        })),
      });
    }

    // Simple update
    act = await act.update({
      rawText: rawText.trim(),
      tokenCount: TextMetrics.estimateTokens(rawText),
    });

    // Clear downstream work
    if (act.anatomyProfile) {
      act.anatomyProfile = {
        ...act.anatomyProfile,
        finalTranslation: null,
        translatedText: null,
      };
      await act.save();
    }

    const { Polish, PolishEdit } = require("../models");
    await PolishEdit.destroy({ where: { actId: act.id } });
    await Polish.destroy({ where: { actId: act.id } });

    return res.status(200).json({
      success: true,
      wasSplit: false,
      updatedAct: {
        id: act.id,
        label: act.label,
        sequence: act.sequence,
        wordCount,
        status: act.status,
      },
    });
  } catch (error) {
    console.error(`[updateAct] Error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/acts/:id
 * Delete act and reorder remaining
 */
async function deleteAct(req, res) {
  const actId = Number(req.params.id);

  if (!Number.isInteger(actId) || actId < 1) {
    return res.status(400).json({ error: "Invalid actId" });
  }

  try {
    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: "Act not found" });
    }

    const chapterId = act.chapterId;
    const actLabel = act.label;

    // Clean up appearances
    const { TermAppearance } = require("../models");
    const appearanceCount = await TermAppearance.destroy({
      where: { actId: act.id },
    });

    // Delete act (cascade handles Polish, PolishEdit, ActDependency)
    await act.destroy();

    // Reorder remaining acts
    const remainingActs = await Act.findAll({
      where: { chapterId },
      order: [["sequence", "ASC"]],
    });

    let newSequence = 1;
    for (const remainingAct of remainingActs) {
      if (remainingAct.sequence !== newSequence) {
        await remainingAct.update({ sequence: newSequence });
      }
      newSequence++;
    }

    return res.status(200).json({
      success: true,
      message: `Act ${actLabel} deleted`,
      termsPreserved: appearanceCount,
      remainingActCount: remainingActs.length,
    });
  } catch (error) {
    console.error(`[deleteAct] Error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  runArchitectPhase,
  updateAct,
  deleteAct,
};
