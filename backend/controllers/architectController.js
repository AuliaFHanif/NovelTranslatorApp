const { Chapter, Act } = require("../models");
const {
  normalizeParagraphs,
  normalizeLineBreaksAndHtml,
} = require("../services/paragraphNormalizer");
const { callSegmentationAI } = require("../services/aiSegmentation");
const actCreationService = require("../services/actCreation");

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

    const acts = await actCreationService.createActs(
      chapterId,
      paragraphs,
      segmentation
    );

    await chapter.update({ status: "ready" });

    return res.status(200).json({
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
          status: act.status
        }))
      }
    });
  } catch (error) {
    console.error(
      "POST /api/chapters/:chapterId/architect - Error:",
      error.message,
    );
    if (chapter) {
      await chapter.update({ status: "pending" });
    }
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  runArchitectPhase,
};
