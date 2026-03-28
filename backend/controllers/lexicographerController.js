const { combinedAnalysis, glossaryProcessing, strategyGenerator } = require('../services');
const { Chapter, Act, GlossaryTerm, TermAppearance } = require('../models');

class LexicographerController {
  /**
   * Run Phase 3 analysis on a chapter
   * POST /api/chapters/:chapterId/analyze
   */
  async analyzeChapter(req, res) {
    const { chapterId } = req.params;

    try {
      // 1. Load chapter with acts and series
      const chapter = await Chapter.findByPk(chapterId, {
        include: [
          {
            model: Act,
            as: 'Acts',
            where: { status: 'pending' },
            required: false
          },
          'Series'
        ]
      });

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      if (!chapter.Acts || chapter.Acts.length === 0) {
        return res.status(400).json({
          error: 'No pending acts to analyze. Run Phase 2 first.'
        });
      }

      // Update chapter status
      await chapter.update({ status: 'processing' });

      // 2. Process each act in sequence order
      const results = {
        processed: 0,
        failed: [],
        glossary: {
          created: 0,
          merged: 0,
          appearances: 0
        }
      };

      // Sort by sequence to ensure order
      const sortedActs = chapter.Acts.sort((a, b) => a.sequence - b.sequence);

      for (const act of sortedActs) {
        try {
          console.log(`[Phase 3] Analyzing act ${act.label} (${act.id})`);

          // Run AI analysis
          const analysis = await combinedAnalysis.analyzeAct(act);

          // Process glossary terms (uses TermAppearances table)
          const glossaryStats = await glossaryProcessing.processTerms(
            analysis.extractedTerms || [],
            act
          );

          results.glossary.created += glossaryStats.created;
          results.glossary.merged += glossaryStats.merged;
          results.glossary.appearances += glossaryStats.appearances;

          // Update act with analysis and strategy
          await act.update({
            anatomyProfile: {
              linguistic: analysis.linguisticAnalysis,
              narrative: analysis.narrativeAnalysis
            },
            status: 'ready'
          });

          // Note: We don't store strategy in Act table in new schema
          // It's derived from anatomyProfile when needed

          results.processed++;

        } catch (err) {
          console.error(`[Phase 3] Failed act ${act.id}:`, err.message);
          results.failed.push({
            actId: act.id,
            label: act.label,
            error: err.message
          });
        }
      }

      // 3. Aggregate chapter strategy
      const analyzedActs = await Act.findAll({
        where: { chapterId, status: 'ready' }
      });

      if (analyzedActs.length > 0) {
        const chapterStrategy = strategyGenerator.aggregateChapterStrategy(analyzedActs);

        await chapter.update({
          strategyProfile: chapterStrategy,
          status: 'ready'
        });

        results.chapterStrategy = chapterStrategy;
      }

      // 4. Count pending glossary for response
      const pendingGlossary = await GlossaryTerm.count({
        where: {
          seriesId: chapter.seriesId,
          status: 'pending'
        }
      });

      res.json({
        success: true,
        chapterId: parseInt(chapterId),
        ...results,
        pendingGlossary
      });

    } catch (err) {
      console.error('[Phase 3] Controller error:', err);

      // Rollback status on error
      await Chapter.update(
        { status: 'pending' },
        { where: { id: chapterId } }
      );

      res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }

  /**
   * Get glossary entries for a series
   * GET /api/series/:seriesId/glossary
   */
  async getGlossary(req, res) {
    const { seriesId } = req.params;
    const { status, type } = req.query;

    try {
      const where = { seriesId };
      if (status) where.status = status;
      if (type) where.type = type;

      const entries = await GlossaryTerm.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      res.json({
        seriesId: parseInt(seriesId),
        count: entries.length,
        entries
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get glossary entries with their appearances (full data)
   * GET /api/series/:seriesId/glossary/detailed
   */
  async getGlossaryDetailed(req, res) {
    const { seriesId } = req.params;
    const { status } = req.query;

    try {
      const where = { seriesId };
      if (status) where.status = status;

      const entries = await GlossaryTerm.findAll({
        where,
        include: [{
          model: TermAppearance,
          as: 'Appearances',
          include: [{
            model: Act,
            as: 'Act',
            attributes: ['id', 'label', 'sequence'],
            include: [{
              model: Chapter,
              as: 'Chapter',
              attributes: ['number', 'title']
            }]
          }]
        }],
        order: [['createdAt', 'DESC']]
      });

      res.json({
        seriesId: parseInt(seriesId),
        count: entries.length,
        entries
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Update glossary entry (approve/reject/edit)
   * PUT /api/glossary-terms/:termId
   */
  async updateGlossaryTerm(req, res) {
    const { termId } = req.params;
    const { termEn, definition, status, metadata } = req.body;

    try {
      const term = await GlossaryTerm.findByPk(termId);

      if (!term) {
        return res.status(404).json({ error: 'Term not found' });
      }

      const updates = {};
      if (termEn !== undefined) updates.termEn = termEn;
      if (definition !== undefined) updates.definition = definition;
      if (metadata !== undefined) updates.metadata = { ...term.metadata, ...metadata };

      if (status) {
        updates.status = status;
        if (status === 'approved') {
          updates.approvedAt = new Date();
          updates.approvedBy = req.user?.id || null;
        }
      }

      await term.update(updates);

      res.json({
        success: true,
        term
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get analysis for a specific act
   * GET /api/acts/:actId/analysis
   */
  async getActAnalysis(req, res) {
    const { actId } = req.params;

    try {
      const act = await Act.findByPk(actId, {
        attributes: ['id', 'label', 'sequence', 'anatomyProfile', 'status'],
        include: [{
          model: GlossaryTerm,
          as: 'Terms',
          through: { attributes: ['contextSentence', 'confidence'] }
        }]
      });

      if (!act) {
        return res.status(404).json({ error: 'Act not found' });
      }

      // Generate strategy on-the-fly from anatomyProfile
      let strategy = null;
      if (act.anatomyProfile) {
        strategy = strategyGenerator.generateActStrategy(
          act.anatomyProfile.narrative,
          act.anatomyProfile.linguistic
        );
      }

      res.json({
        actId: parseInt(actId),
        label: act.label,
        sequence: act.sequence,
        status: act.status,
        anatomyProfile: act.anatomyProfile,
        strategy,
        terms: act.Terms
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get pending glossary count for a series
   * GET /api/series/:seriesId/glossary/pending-count
   */
  async getPendingCount(req, res) {
    const { seriesId } = req.params;

    try {
      const count = await GlossaryTerm.count({
        where: {
          seriesId,
          status: 'pending'
        }
      });

      res.json({ seriesId: parseInt(seriesId), pendingCount: count });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new LexicographerController();
