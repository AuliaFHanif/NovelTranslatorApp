const {
  analysisService,
  glossaryProcessing,
  strategyGenerator,
} = require("../services");
const {
  Chapter,
  Act,
  GlossaryTerm,
  TermAppearance,
  Series,
} = require("../models");

class LexicographerController {
  /**
   * Run Phase 3 analysis on a chapter
   * POST /api/chapters/:chapterId/analyze
   */
  async analyzeChapter(req, res) {
    const { chapterId } = req.params;
    const { model, task = "all" } = req.body || {};

    try {
      // 1. Load chapter with acts and series
      const chapter = await Chapter.findByPk(chapterId, {
        include: [
          {
            model: Act,
            as: "Acts",
            required: false,
          },
          "Series",
        ],
      });

      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      if (!chapter.Acts || chapter.Acts.length === 0) {
        return res.status(400).json({
          error: "No acts found to analyze. Run Phase 1 (Segmentation) first.",
        });
      }

      // Update chapter status
      await chapter.update({ status: "processing" });

      // 2. Process each act in sequence order
      const results = {
        processed: 0,
        failed: [],
        glossary: {
          created: 0,
          merged: 0,
          appearances: 0,
        },
        terms: [], // Track unique terms for the frontend to approve
      };

      const allCandidates = [];

      // Sort by sequence to ensure order
      const sortedActs = chapter.Acts.sort((a, b) => a.sequence - b.sequence);

      for (const act of sortedActs) {
        try {
          console.log(`[Phase 3] Analyzing act ${act.label} (${act.id})`);

          // Ensure act has access to parent Chapter/Series for analysis context
          act.Chapter = chapter;

          // CLEAR STALE LINKS: Remove existing appearances for this act before fresh analysis
          await TermAppearance.destroy({
            where: { actId: act.id },
          });

          // Run Phase 3 analysis in two specialized passes
          if (task === "all" || task === "terms") {
            try {
              console.log(
                `[Phase 3] Pass 1: Extracting terms for act ${act.label}`,
              );
              const termResult = await analysisService.extractTerms(act, {
                model,
              });

              // Identify terms (approved vs candidates)
              const { candidates, approvedCount } =
                await glossaryProcessing.identifyTerms(
                  termResult.extractedTerms || [],
                  act,
                );

              results.glossary.appearances +=
                termResult.extractedTerms?.length || 0;
              results.glossary.merged += approvedCount;
              allCandidates.push(...candidates);

              await act.update({
                anatomyProfile: {
                  ...act.anatomyProfile,
                  termExtractionStatus: "success",
                },
              });
            } catch (err) {
              await act.update({
                anatomyProfile: {
                  ...act.anatomyProfile,
                  termExtractionStatus: "error",
                },
              });
              throw err;
            }
          }

          if (task === "all" || task === "narrative") {
            try {
              console.log(
                `[Phase 3] Pass 2: Analyzing narrative for act ${act.label}`,
              );
              const narrativeResult = await analysisService.analyzeNarrative(
                act,
                { model },
              );

              // Update act with analysis results
              await act.update({
                anatomyProfile: {
                  ...act.anatomyProfile, // Preserve existing data (like terms)
                  linguistic: narrativeResult.linguisticAnalysis,
                  narrative: narrativeResult.narrativeAnalysis,
                  actAnalysisStatus: "success",
                },
              });
            } catch (err) {
              await act.update({
                anatomyProfile: {
                  ...act.anatomyProfile,
                  actAnalysisStatus: "error",
                },
              });
              throw err;
            }
          }

          // Mark act as ready if at least one run was fully successful
          await act.update({ status: "ready" });

          // Note: We don't store strategy in Act table in new schema
          // It's derived from anatomyProfile when needed

          results.processed++;
        } catch (err) {
          console.error(`[Phase 3] Failed act ${act.id}:`, err.message);
          results.failed.push({
            actId: act.id,
            label: act.label,
            error: err.message,
          });
        }
      }

      // 3. Aggregate chapter strategy
      const analyzedActs = await Act.findAll({
        where: { chapterId, status: "ready" },
      });

      if (analyzedActs.length > 0) {
        const chapterStrategy =
          strategyGenerator.aggregateChapterStrategy(analyzedActs);

        await chapter.update({
          strategyProfile: chapterStrategy,
          status: "ready",
        });

        results.chapterStrategy = chapterStrategy;
      }

      // 4. Aggregated candidates (deduplicated by term text and type)
      const candidateMap = new Map();
      for (const cand of allCandidates) {
        // Robust normalization for key: trim, case-insensitive mapping
        const termKey = String(cand.term || "").trim();
        const typeKey = String(cand.type || "term").trim();
        const key = `${termKey}|${typeKey}`.toLowerCase();

        if (!candidateMap.has(key)) {
          candidateMap.set(key, {
            ...cand,
            term: termKey, // Use trimmed version
            appearances: [
              {
                actId: cand.actId,
                actLabel: cand.actLabel,
                context: cand.context,
                confidence: cand.confidence,
              },
            ],
          });
        } else {
          const existing = candidateMap.get(key);
          existing.appearances.push({
            actId: cand.actId,
            actLabel: cand.actLabel,
            context: cand.context,
            confidence: cand.confidence,
          });
          // Keep highest confidence for the main record
          if (cand.confidence > (existing.confidence || 0)) {
            existing.confidence = cand.confidence;
            existing.proposedTranslation = cand.proposedTranslation;
          }
        }
      }

      results.terms = Array.from(candidateMap.values());

      // 4. Count pending glossary for response
      const pendingGlossary = await GlossaryTerm.count({
        where: {
          seriesId: chapter.seriesId,
          status: "pending",
        },
      });

      res.json({
        success: true,
        data: {
          chapterId: parseInt(chapterId),
          ...results,
          pendingGlossary,
        },
      });
    } catch (err) {
      console.error("[Phase 3] Controller error:", err);

      // Rollback status on error
      await Chapter.update({ status: "pending" }, { where: { id: chapterId } });

      res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }

  /**
   * Run Phase 2 analysis on a single act
   * POST /api/acts/:actId/analyze
   */
  async analyzeAct(req, res) {
    const { actId } = req.params;
    const { model, task = "all" } = req.body || {};

    try {
      // 1. Load act with chapter and series
      const act = await Act.findByPk(actId, {
        include: [
          {
            model: Chapter,
            as: "Chapter",
            include: ["Series"],
          },
        ],
      });

      if (!act) {
        return res.status(404).json({ error: "Act not found" });
      }

      if (!act.Chapter || !act.Chapter.Series) {
        return res
          .status(400)
          .json({ error: "Act chapter or series not found" });
      }

      console.log(`[Phase 2] Analyzing single act ${act.label} (${act.id})`);

      const results = {
        processed: 0,
        failed: [],
        glossary: {
          created: 0,
          merged: 0,
          appearances: 0,
        },
        terms: [],
      };

      try {
        // CLEAR STALE LINKS: Remove existing appearances for this act before fresh analysis
        await TermAppearance.destroy({
          where: { actId: act.id },
        });

        // Run analysis passes as requested
        if (task === "all" || task === "terms") {
          console.log(
            `[Phase 2] Pass 1: Extracting terms for act ${act.label}`,
          );
          try {
            const termResult = await analysisService.extractTerms(act, {
              model,
            });

            // Identify terms (approved vs candidates)
            const { candidates, approvedCount } =
              await glossaryProcessing.identifyTerms(
                termResult.extractedTerms || [],
                act,
              );

            results.glossary.appearances +=
              termResult.extractedTerms?.length || 0;
            results.glossary.merged += approvedCount;

            // Deduplicate and format candidates for response
            const candidateMap = new Map();
            for (const cand of candidates) {
              const termKey = String(cand.term || "").trim();
              const typeKey = String(cand.type || "term").trim();
              const key = `${termKey}|${typeKey}`.toLowerCase();

              if (!candidateMap.has(key)) {
                candidateMap.set(key, {
                  ...cand,
                  term: termKey,
                  appearances: [
                    {
                      actId: cand.actId,
                      actLabel: cand.actLabel,
                      context: cand.context,
                      confidence: cand.confidence,
                    },
                  ],
                });
              } else {
                const existing = candidateMap.get(key);
                existing.appearances.push({
                  actId: cand.actId,
                  actLabel: cand.actLabel,
                  context: cand.context,
                  confidence: cand.confidence,
                });
                if (cand.confidence > (existing.confidence || 0)) {
                  existing.confidence = cand.confidence;
                  existing.proposedTranslation = cand.proposedTranslation;
                }
              }
            }
            results.terms = Array.from(candidateMap.values());

            await act.update({
              anatomyProfile: {
                ...act.anatomyProfile,
                termExtractionStatus: "success",
              },
            });
          } catch (err) {
            await act.update({
              anatomyProfile: {
                ...act.anatomyProfile,
                termExtractionStatus: "error",
              },
            });
            throw err;
          }
        }

        if (task === "all" || task === "narrative") {
          console.log(
            `[Phase 2] Pass 2: Analyzing narrative for act ${act.label}`,
          );
          try {
            const narrativeResult = await analysisService.analyzeNarrative(
              act,
              {
                model,
              },
            );

            // Update act with analysis results
            await act.update({
              anatomyProfile: {
                ...act.anatomyProfile,
                linguistic: narrativeResult.linguisticAnalysis,
                narrative: narrativeResult.narrativeAnalysis,
                actAnalysisStatus: "success",
              },
            });
          } catch (err) {
            await act.update({
              anatomyProfile: {
                ...act.anatomyProfile,
                actAnalysisStatus: "error",
              },
            });
            throw err;
          }
        }

        await act.update({ status: "ready" });
        results.processed = 1;
      } catch (err) {
        console.error(`[Phase 2] Failed act ${act.id}:`, err.message);
        results.failed.push({
          actId: act.id,
          label: act.label,
          error: err.message,
        });
      }

      res.json({
        success: true,
        data: {
          actId: parseInt(actId),
          ...results,
        },
      });
    } catch (err) {
      console.error("[Phase 2] Controller error:", err);
      res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
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
        order: [["createdAt", "DESC"]],
      });

      res.json({
        success: true,
        data: {
          seriesId: parseInt(seriesId),
          count: entries.length,
          entries,
        },
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
        include: [
          {
            model: TermAppearance,
            as: "Appearances",
            include: [
              {
                model: Act,
                as: "Act",
                attributes: ["id", "label", "sequence"],
                include: [
                  {
                    model: Chapter,
                    as: "Chapter",
                    attributes: ["number", "title"],
                  },
                ],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      res.json({
        success: true,
        data: {
          seriesId: parseInt(seriesId),
          count: entries.length,
          entries,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async updateGlossaryTerm(req, res) {
    const { termId } = req.params;
    const { termEn, definition, status, type } = req.body;

    try {
      const term = await GlossaryTerm.findByPk(termId);
      if (!term)
        return res
          .status(404)
          .json({ success: false, error: "Term not found" });

      // If status is rejected, DELETE the term (don't just flag it)
      if (status === "rejected") {
        await term.destroy();
        return res.json({
          success: true,
          message: "Term deleted successfully",
        });
      }

      const updated = await term.update({
        termEn,
        definition,
        status,
        type,
        approvedAt: status === "approved" ? new Date() : term.approvedAt,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
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
        attributes: ["id", "label", "sequence", "anatomyProfile", "status"],
        include: [
          {
            model: GlossaryTerm,
            as: "Terms",
            through: { attributes: ["contextSentence", "confidence"] },
          },
        ],
      });

      if (!act) {
        return res.status(404).json({ error: "Act not found" });
      }

      // Generate strategy on-the-fly from anatomyProfile
      let strategy = null;
      if (act.anatomyProfile) {
        strategy = strategyGenerator.generateActStrategy(
          act.anatomyProfile.narrative,
          act.anatomyProfile.linguistic,
        );
      }

      res.json({
        success: true,
        data: {
          actId: parseInt(actId),
          label: act.label,
          sequence: act.sequence,
          status: act.status,
          anatomyProfile: act.anatomyProfile,
          strategy,
          terms: act.Terms,
        },
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
          status: "pending",
        },
      });

      res.json({
        success: true,
        data: {
          seriesId: parseInt(seriesId),
          pendingCount: count,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Bulk approve candidates
   * POST /api/series/:seriesId/glossary/bulk-approve
   */
  async bulkApprove(req, res) {
    const { seriesId } = req.params;
    const { terms } = req.body;

    try {
      const series = await Series.findByPk(seriesId);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (!terms || !Array.isArray(terms)) {
        return res.status(400).json({ error: "Terms array is required" });
      }

      const results = await glossaryProcessing.handleBulkApproval(
        terms,
        seriesId,
        series.language,
      );

      res.json({
        success: true,
        data: results,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new LexicographerController();
