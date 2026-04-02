/**
 * Architect Controller - Phase 2 Segmentation
 * 
 * Changes:
 * 1. Better error handling and logging
 * 2. Performance timing logs
 * 3. Cleaner response structure
 */

const { Chapter, Act } = require('../models');
const {
  normalizeParagraphs,
  normalizeLineBreaksAndHtml,
} = require('../services/paragraphNormalizer');
const { callSegmentationAI } = require('../services/aiSegmentation');
const actCreationService = require('../services/actCreation');
const TextMetrics = require('../utils/textMetrics');

/**
 * Calculate coverage statistics for diagnostics
 */
function getCoverageDiagnostics(paragraphs, boundaries) {
  const lastBoundary = boundaries[boundaries.length - 1] || 0;
  const paragraphCount = paragraphs.length;
  const coveredParagraphs = Math.min(lastBoundary, paragraphCount);
  const coveragePercent = paragraphCount === 0
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
 * Run Phase 2 segmentation
 */
async function runArchitectPhase(req, res) {
  const chapterId = Number(req.params.chapterId);
  const startTime = Date.now();

  if (!Number.isInteger(chapterId) || chapterId < 1) {
    return res.status(400).json({ error: 'Invalid chapterId' });
  }

  let chapter;

  try {
    // Fetch chapter
    chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (!chapter.rawText || !chapter.rawText.trim()) {
      return res.status(400).json({ error: 'No raw text' });
    }

    console.log(`[Architect] Starting segmentation for chapter ${chapterId}`);
    await chapter.update({ status: 'processing' });

    // Clear existing acts
    await Act.destroy({ where: { chapterId } });
    console.log(`[Architect] Cleared existing acts`);

    // Normalize text
    const normalizedSourceText = normalizeLineBreaksAndHtml(chapter.rawText);
    const paragraphs = normalizeParagraphs(chapter.rawText);

    if (paragraphs.length === 0) {
      throw new Error('No paragraphs could be extracted from chapter text');
    }

    const totalMetrics = TextMetrics.calculateParagraphMetrics(paragraphs);
    const totalTokens = totalMetrics.reduce((s, m) => s + m.estimatedTokens, 0);
    const totalWords = totalMetrics.reduce((s, m) => s + m.unifiedWords, 0);

    console.log(`[Architect] Text metrics: ${paragraphs.length} paragraphs, ${totalTokens} tokens, ${totalWords} words`);

    // AI Segmentation
    const segStartTime = Date.now();
    const segmentation = await callSegmentationAI(paragraphs);
    const segDuration = Date.now() - segStartTime;

    console.log(`[Architect] AI segmentation completed in ${segDuration}ms, boundaries: [${segmentation.boundaries.join(', ')}]`);

    // Quality check
    if (paragraphs.length > 1 && segmentation.boundaries.length < 2) {
      throw new Error(
        'Segmentation quality check failed: expected at least 2 boundaries for multi-paragraph chapter'
      );
    }

    const coverageDiagnostics = getCoverageDiagnostics(paragraphs, segmentation.boundaries);

    // Create acts
    const createStartTime = Date.now();
    const acts = await actCreationService.createActs(
      chapterId,
      paragraphs,
      segmentation
    );
    const createDuration = Date.now() - createStartTime;

    console.log(`[Architect] Created ${acts.length} acts in ${createDuration}ms`);

    // Update chapter status
    await chapter.update({ status: 'ready' });

    const totalDuration = Date.now() - startTime;
    console.log(`[Architect] Phase 2 complete in ${totalDuration}ms`);

    return res.status(200).json({
      success: true,
      data: {
        chapterId,
        actsCreated: acts.length,
        segmentationSource: segmentation.source,
        batchCount: segmentation.batchCount || 1,
        timing: {
          total: totalDuration,
          aiSegmentation: segDuration,
          actCreation: createDuration,
        },
        metrics: {
          paragraphs: paragraphs.length,
          totalTokens,
          totalWords,
        },
        coverage: coverageDiagnostics,
        acts: acts.map((act) => ({
          id: act.id,
          label: act.label,
          sequence: act.sequence,
          status: act.status,
          tokenCount: act.tokenCount,
        })),
      },
    });
  } catch (error) {
    console.error(`[Architect] Error: ${error.message}`);
    console.error(error.stack);

    if (chapter) {
      await chapter.update({ status: 'error' });
    }

    return res.status(500).json({
      error: error.message || 'Segmentation failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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
    return res.status(400).json({ error: 'Invalid actId' });
  }

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: 'rawText is required and must be non-empty' });
  }

  try {
    let act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: 'Act not found' });
    }

    const chapter = await act.getChapter();
    if (!chapter) {
      return res.status(404).json({ error: 'Parent chapter not found' });
    }

    const wordCount = TextMetrics.countUnifiedWords(rawText);
    const { maxUnifiedWordsPerAct } = require('../config/segmentation').boundaries;

    // Check if split needed
    if (wordCount > maxUnifiedWordsPerAct) {
      // Split logic
      const normalizedText = normalizeLineBreaksAndHtml(rawText);
      const paragraphs = normalizeParagraphs(normalizedText);

      if (paragraphs.length === 0) {
        return res.status(400).json({ error: 'No paragraphs found in updated text' });
      }

      const baseLabel = act.label.replace(/[A-Z]$/, '');
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
          segmentSource: act.segmentSource || 'manual',
          status: 'pending',
        });

        newActs.push(newAct);

        // Dependencies
        if (j > 0) {
          const { ActDependency } = require('../models');
          await ActDependency.create({
            actId: newAct.id,
            dependsOnActId: newActs[j - 1].id,
            dependencyType: 'translation_sequence',
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

    const { Polish, PolishEdit } = require('../models');
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
    return res.status(400).json({ error: 'Invalid actId' });
  }

  try {
    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: 'Act not found' });
    }

    const chapterId = act.chapterId;
    const actLabel = act.label;

    // Clean up appearances
    const { TermAppearance } = require('../models');
    const appearanceCount = await TermAppearance.destroy({
      where: { actId: act.id },
    });

    // Delete act (cascade handles Polish, PolishEdit, ActDependency)
    await act.destroy();

    // Reorder remaining acts
    const remainingActs = await Act.findAll({
      where: { chapterId },
      order: [['sequence', 'ASC']],
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
