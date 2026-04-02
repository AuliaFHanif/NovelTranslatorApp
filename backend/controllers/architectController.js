const { Chapter, Act } = require("../models");
const {
  normalizeParagraphs,
  normalizeLineBreaksAndHtml,
} = require("../services/paragraphNormalizer");
const { callSegmentationAI } = require("../services/aiSegmentation");
const actCreationService = require("../services/actCreation");
const { countWords } = require("../services/utils");

function getCoverageDiagnostics(paragraphs, boundaries) {
  const lastBoundary =
    boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
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

async function runArchitectPhase(req, res) {
  const chapterId = Number(req.params.chapterId);

  if (!Number.isInteger(chapterId) || chapterId < 1) {
    return res.status(400).json({ error: "Invalid chapterId" });
  }

  let chapter;

  try {
    chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    if (!chapter.rawText || !chapter.rawText.trim()) {
      return res.status(400).json({ error: "No raw text" });
    }

    await chapter.update({ status: "processing" });

    await Act.destroy({ where: { chapterId } });

    const normalizedSourceText = normalizeLineBreaksAndHtml(chapter.rawText);
    const paragraphs = normalizeParagraphs(chapter.rawText);
    if (paragraphs.length === 0) {
      throw new Error("No paragraphs could be extracted from chapter text");
    }

    const segmentation = await callSegmentationAI(paragraphs);

    if (paragraphs.length > 1 && segmentation.boundaries.length < 2) {
      throw new Error(
        "Pass 1 segmentation failed quality check: expected at least 2 boundaries for multi-paragraph chapter",
      );
    }

    const coverageDiagnostics = getCoverageDiagnostics(
      paragraphs,
      segmentation.boundaries,
    );

    console.log(
      "[Architect] Creating acts with segmentation:",
      JSON.stringify(segmentation.boundaries),
    );

    const acts = await actCreationService.createActs(
      chapterId,
      paragraphs,
      segmentation,
    );

    console.log(`[Architect] Created ${acts.length} acts successfully`);

    await chapter.update({ status: "ready" });

    const responseData = {
      success: true,
      data: {
        chapterId,
        actsCreated: acts.length,
        segmentationSource: segmentation.source,
        pass1Diagnostics: coverageDiagnostics,
        acts: acts.map((act) => ({
          id: act.id,
          label: act.label,
          sequence: act.sequence,
          status: act.status,
        })),
      },
    };

    console.log("[Architect] Response data structured successfully");
    return res.status(200).json(responseData);
  } catch (error) {
    console.error(
      "POST /api/chapters/:chapterId/architect - Error:",
      error.message,
    );
    console.error("[Architect] Full error stack:", error.stack);
    if (chapter) {
      await chapter.update({ status: "pending" });
    }
    return res.status(500).json({
      error: error.message || "Validation error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

/**
 * Update an act's raw text content
 * If word count exceeds MAX_WORDS, auto-split at paragraph boundaries
 * Clears downstream work (translation, polish) when updated
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

    const newWordCount = countWords(rawText);

    // Check if edit would cause split
    const needsSplit = newWordCount > actCreationService.MAX_WORDS;

    if (needsSplit) {
      // Split the updated act into multiple acts
      const normalizedText = normalizeLineBreaksAndHtml(rawText);
      const paragraphs = normalizeParagraphs(normalizedText);

      if (paragraphs.length === 0) {
        return res
          .status(400)
          .json({ error: "No paragraphs found in updated text" });
      }

      // Get current base label for split series
      const baseLabel = act.label.replace(/[A-Z]$/, ""); // Remove existing suffix if any
      const baseLabelNum = parseInt(baseLabel) || act.sequence;

      // Delete the old act
      await Act.destroy({ where: { id: actId } });

      // Create new split acts
      const splits = actCreationService.splitAct(rawText, paragraphs);
      const newActs = [];

      for (let j = 0; j < splits.length; j++) {
        const split = splits[j];
        const splitWordCount = countWords(split.text);

        const newAct = await Act.create({
          chapterId: chapter.id,
          sequence: act.sequence,
          label: `${baseLabelNum}${split.label}`,
          rawText: split.text,
          tokenCount: splitWordCount,
          segmentSource: act.segmentSource || "manual",
          status: "pending",
        });

        newActs.push(newAct);

        // Create dependency chain for splits
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
        message: `Act was split into ${splits.length} acts due to exceeding ${actCreationService.MAX_WORDS} word limit`,
        updatedActs: newActs.map((a) => ({
          id: a.id,
          label: a.label,
          sequence: a.sequence,
          wordCount: countWords(a.rawText),
          status: a.status,
        })),
      });
    } else {
      // Simple update: no split needed
      // Clear downstream work (translation, polish)
      act = await act.update({
        rawText: rawText.trim(),
        tokenCount: newWordCount,
      });

      // Clear analysis results
      if (act.anatomyProfile) {
        act.anatomyProfile = {
          ...act.anatomyProfile,
          finalTranslation: null,
          translatedText: null,
        };
        await act.save();
      }

      // Delete associated polish (since translation changed)
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
          wordCount: newWordCount,
          status: act.status,
        },
      });
    }
  } catch (error) {
    console.error("PATCH /api/acts/:id - Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Delete an act and its related data
 * Keeps TermAppearances so terms remain in the library
 * Deletes Polish and PolishEdit (cascade via model)
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

    // Delete term appearances for this act (but keep the terms)
    const { TermAppearance } = require("../models");
    const appearanceCount = await TermAppearance.destroy({
      where: { actId: act.id },
    });

    // Delete act (cascade will delete Polish, PolishEdit, ActDependency)
    await act.destroy();

    // Reorder remaining acts' sequences if necessary
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
      message: `Act ${actLabel} deleted successfully`,
      termsPreserved: appearanceCount,
      remainingActCount: remainingActs.length,
    });
  } catch (error) {
    console.error("DELETE /api/acts/:id - Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  runArchitectPhase,
  updateAct,
  deleteAct,
};
