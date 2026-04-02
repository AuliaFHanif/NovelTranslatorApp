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

      // 2. Process acts, grouping sub-acts (1a, 1b...) together
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
      const processedActIds = new Set();

      for (const act of sortedActs) {
        if (processedActIds.has(act.id)) continue;

        try {
          // Detect if this act is part of a group
          const groupActIds = analysisService.detectActGroup(act.id, sortedActs);
          const groupActs = sortedActs.filter(a => groupActIds.includes(a.id));
          
          if (groupActs.length > 1) {
            console.log(`[Phase 3] Analyzing group: ${groupActs.map(a => a.label).join(', ')}`);
          } else {
            console.log(`[Phase 3] Analyzing single act: ${act.label}`);
          }

          // Mark all in group as processed
          groupActIds.forEach(id => processedActIds.add(id));

          // Ensure acts have parent context
          groupActs.forEach(a => a.Chapter = chapter);

          // Clear stale appearances and RESET the anatomyProfile for the whole group
          // This ensures a "clean slate" for the fresh analysis
          await TermAppearance.destroy({
            where: { actId: groupActIds },
          });

          for (const gAct of groupActs) {
            await gAct.update({
              anatomyProfile: {
                ...gAct.anatomyProfile,
                linguistic: null,
                narrative: null,
                actAnalysisStatus: 'processing',
                termExtractionStatus: 'processing'
              }
            });
          }

          // Run grouped analysis via service
          const analysisResults = await analysisService.analyzeActGroup(groupActs, { model, task });

          // Aggregate term candidates from group
          if (analysisResults.termsFound && analysisResults.termsFound.length > 0) {
            results.glossary.appearances += analysisResults.termsFound.length * groupActs.length;
            
            // For each term found in the group, we need to identify it for each act
            // to maintain proper database linking
            for (const term of analysisResults.termsFound) {
              for (const gAct of groupActs) {
                const { candidates, approvedCount } = await glossaryProcessing.identifyTerms(
                  [{ ...term, actId: gAct.id, actLabel: gAct.label }],
                  gAct
                );
                allCandidates.push(...candidates);
                results.glossary.merged += approvedCount;
              }
            }
          }

          results.processed += groupActs.length;
        } catch (err) {
          console.error(`[Phase 3] Failed processing starting at act ${act.id}:`, err.message);
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
   * Run Phase 2 analysis on a single act or its group
   * POST /api/acts/:actId/analyze
   * Auto-detects if act is part of a group and analyzes all together
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

      // 2. Detect act group - if act is part of a group (1A, 1B), analyze all together
      const allChapterActs = await Act.findAll({
        where: { chapterId: act.chapterId },
        order: [["sequence", "ASC"]],
      });

      const groupActIds = analysisService.detectActGroup(actId, allChapterActs);
      const isGrouped = groupActIds.length > 1;

      console.log(
        `[Phase 2] Analyzing act ${act.label} (${act.id}) - ${isGrouped ? "Group: " + groupActIds.join(", ") : "Single act"}`,
      );

      // Load all group acts with full context
      const groupActs = await Act.findAll({
        where: { id: groupActIds },
        include: [
          {
            model: Chapter,
            as: "Chapter",
            include: ["Series"],
          },
        ],
        order: [["sequence", "ASC"]],
      });

      // Prepare results
      const results = {
        processed: 0,
        failed: [],
        glossary: {
          created: 0,
          merged: 0,
          appearances: 0,
        },
        terms: [],
        groupSize: groupActs.length,
        groupedActsLabels: groupActs.map((a) => a.label),
      };

      // Clear existing appearances for all group members and reset profiles
      await TermAppearance.destroy({
        where: { actId: groupActIds },
      });

      for (const gAct of groupActs) {
        await gAct.update({
          anatomyProfile: {
            ...gAct.anatomyProfile,
            linguistic: null,
            narrative: null,
            actAnalysisStatus: "processing",
            termExtractionStatus: "processing",
          },
        });
      }

      // Run grouped analysis
      try {
        const analysisResults = await analysisService.analyzeActGroup(
          groupActs,
          { model, task },
        );

        results.processed = analysisResults.analyzed.length;
        results.failed = analysisResults.failed;

        // Process extracted terms if any
        if (
          analysisResults.termsFound &&
          analysisResults.termsFound.length > 0
        ) {
          // Link terms to the originating acts
          // For grouped analysis, link to all acts in the group
          for (const term of analysisResults.termsFound) {
            // Create appearance for each group act
            for (const gAct of groupActs) {
              const { candidates, approvedCount } =
                await glossaryProcessing.identifyTerms(
                  [{ ...term, actId: gAct.id, actLabel: gAct.label }],
                  gAct,
                );

              results.glossary.appearances += 1;
              results.glossary.merged += approvedCount;

              if (candidates.length > 0) {
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
                  }
                }

                for (const cand of candidateMap.values()) {
                  results.terms.push(cand);
                }
              }
            }
          }
        }

        // Return success with analysis details
        return res.status(200).json({
          success: true,
          message: isGrouped
            ? `Analyzed ${groupActs.length} acts as a group`
            : "Analyzed single act",
          data: results,
          terms: results.terms,
        });
      } catch (err) {
        throw err;
      }
    } catch (error) {
      console.error(`[Phase 2] Analysis failed:`, error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Explicitly analyze a group of acts together
   * POST /api/chapters/:chapterId/analyze-group
   * Body: { actIds: [1, 2, 3], task: "all" | "terms" | "narrative" }
   */
  async analyzeActGroup(req, res) {
    const { chapterId } = req.params;
    const { actIds = [], model, task = "all" } = req.body || {};

    try {
      if (!Array.isArray(actIds) || actIds.length === 0) {
        return res
          .status(400)
          .json({ error: "actIds must be a non-empty array" });
      }

      // Load chapter
      const chapter = await Chapter.findByPk(chapterId, {
        include: ["Series"],
      });

      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      // Load all acts
      const acts = await Act.findAll({
        where: { id: actIds, chapterId },
        include: [
          {
            model: Chapter,
            as: "Chapter",
            include: ["Series"],
          },
        ],
        order: [["sequence", "ASC"]],
      });

      if (acts.length === 0) {
        return res
          .status(400)
          .json({ error: "No acts found for the given IDs" });
      }

      console.log(
        `[Grouped Analysis] Explicit group analysis for acts: ${acts.map((a) => a.label).join(", ")}`,
      );

      // Clear existing appearances
      await TermAppearance.destroy({
        where: { actId: actIds },
      });

      // Run analysis
      const analysisResults = await analysisService.analyzeActGroup(acts, {
        model,
        task,
      });

      // Process terms similar to analyzeAct
      const results = {
        processed: analysisResults.analyzed.length,
        failed: analysisResults.failed,
        glossary: {
          appearances: 0,
          merged: 0,
          created: 0,
        },
        terms: [],
      };

      if (analysisResults.termsFound && analysisResults.termsFound.length > 0) {
        for (const term of analysisResults.termsFound) {
          for (const gAct of acts) {
            const { candidates, approvedCount } =
              await glossaryProcessing.identifyTerms(
                [{ ...term, actId: gAct.id, actLabel: gAct.label }],
                gAct,
              );

            results.glossary.appearances += 1;
            results.glossary.merged += approvedCount;

            if (candidates.length > 0) {
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
                }
              }

              for (const cand of candidateMap.values()) {
                results.terms.push(cand);
              }
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: `Analyzed ${acts.length} acts as a group`,
        data: results,
        terms: results.terms,
      });
    } catch (error) {
      console.error(`[Grouped Analysis] Failed:`, error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
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
   * Returns: { newTerms, existingTerms, conflictTerms, results: { created, updated, appearances } }
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

      // Phase 3: Detect conflicts and categorize terms
      const categorized = await glossaryProcessing.detectTermConflicts(
        terms,
        seriesId,
        series.language,
      );

      // Process only new and existing terms for now (skip conflicts - user must resolve)
      const termsToProcess = [
        ...categorized.newTerms,
        ...categorized.existingTerms,
      ];
      const results = await glossaryProcessing.handleBulkApproval(
        termsToProcess,
        seriesId,
        series.language,
      );

      res.json({
        success: true,
        data: {
          ...results,
          categorized, // Return categorization for frontend conflict handling
          conflictCount: categorized.conflictTerms.length,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Resolve term conflicts
   * POST /api/series/:seriesId/glossary/resolve-conflicts
   * Body: { resolutions: [{ existingId, term, resolution, termEn, variantForm?, appearances }] }
   */
  async resolveTermConflicts(req, res) {
    const { seriesId } = req.params;
    const { resolutions } = req.body;

    try {
      const series = await Series.findByPk(seriesId);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (!resolutions || !Array.isArray(resolutions)) {
        return res.status(400).json({ error: "Resolutions array is required" });
      }

      const results = await glossaryProcessing.resolveConflicts(
        resolutions,
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
