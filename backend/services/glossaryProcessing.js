const { GlossaryTerm, TermAppearance } = require("../models");
const { loadSeriesGlossary, clearCache } = require("./glossaryCache");
const config = require("../config/config.json");

class GlossaryProcessingService {
  /**
   * Process extracted terms from AI analysis
   * Uses TermAppearances linking table (new schema)
   *
   * @param {Array} extractedTerms - From AI analysis
   * @param {Object} act - Act instance (with associations loaded)
   * @returns {Object} Stats { created, merged, appearances }
   */
  /**
   * Identify terms and separate into "already approved" and "new candidates"
   *
   * @param {Array} extractedTerms - From AI analysis
   * @param {Object} subAct - SubAct instance
   * @param {Object} series - Series instance
   * @returns {Object} { candidates, approvedAppearances }
   */
  async identifyTerms(extractedTerms, subAct, series) {
    const seriesId = series.id;
    const language = series.language;
    const candidates = [];
    const approvedAppearances = [];
    let approvedCount = 0;

    // Load glossary cache for this series
    const glossaryCache = await loadSeriesGlossary(seriesId);

    // Filter validated terms
    const validatedTerms = this.validateExtractedTerms(extractedTerms);
    console.log(
      `[TermIdentification] SubAct ${subAct.id}: Processing ${validatedTerms.length} terms`,
    );

    for (const extracted of validatedTerms) {
      const normalized = {
        term: (extracted.term || "").trim(),
        type: extracted.type || "term",
        context: extracted.context || "",
        proposedTranslation: extracted.proposedTranslation || "",
        confidence:
          typeof extracted.confidence === "number" ? extracted.confidence : 0.8,
      };

      if (!normalized.term) continue;

      // Check 1: Existence in Context Library (Approved)
      const existingTerm = this.findExistingTermFromCache(
        normalized,
        glossaryCache,
      );

      if (existingTerm && existingTerm.status === "approved") {
        approvedAppearances.push({
          termId: existingTerm.id,
          subActId: subAct.id,
          contextSnippet: normalized.context,
          confidence: normalized.confidence,
          frequency: 1,
        });
        approvedCount++;
      } else {
        // Check 2: Batch duplicates (Similarity within this extraction)
        const batchDuplicate = candidates.find(
          (p) =>
            require("./utils").similarity(
              require("./utils").normalizeTerm(p.term),
              require("./utils").normalizeTerm(normalized.term),
            ) > 0.85,
        );

        if (batchDuplicate) {
          // Merge contexts or just ignore (can track frequency)
          batchDuplicate.frequency = (batchDuplicate.frequency || 1) + 1;
          continue;
        }

        candidates.push({
          ...normalized,
          existingId: existingTerm?.id || null,
          subActId: subAct.id,
          seriesId: series.id,
        });
      }
    }

    // Batch insert approved appearances
    if (approvedAppearances.length > 0) {
      await TermAppearance.bulkCreate(approvedAppearances, {
        ignoreDuplicates: true,
      });
      console.log(
        `[TermIdentification] Recorded ${approvedAppearances.length} approved appearances for SubAct ${subAct.id}`,
      );
    }

    return { candidates, approvedCount };
  }

  /**
   * Validate extracted terms against configured thresholds
   * Filters: min length, confidence, stopwords, duplicates
   */
  validateExtractedTerms(extractedTerms) {
    const devConfig = config[process.env.NODE_ENV || "development"];
    const extraction = devConfig?.extraction || {};

    const minLength = extraction.minTermLength || 2;
    const confidenceThreshold = extraction.confidenceThreshold || 0.6;
    const maxTermsPerAct = extraction.maxTermsPerAct || 50;
    const stopwords = extraction.stopwords || [];

    const validated = [];
    const seen = new Set();

    for (const term of extractedTerms) {
      // Check: term length
      if (term.term && term.term.length < minLength) {
        console.log(
          `[TermValidation] Skipping "${term.term}" - too short (< ${minLength} chars)`,
        );
        continue;
      }

      // Check: confidence threshold
      if (
        typeof term.confidence === "number" &&
        term.confidence < confidenceThreshold
      ) {
        console.log(
          `[TermValidation] Skipping "${term.term}" - confidence ${term.confidence} < ${confidenceThreshold}`,
        );
        continue;
      }

      // Check: stopwords
      if (stopwords.includes(term.term)) {
        console.log(`[TermValidation] Skipping "${term.term}" - is a stopword`);
        continue;
      }

      // Check: duplicates within this extraction
      if (seen.has(term.term)) {
        console.log(
          `[TermValidation] Skipping "${term.term}" - duplicate within extraction`,
        );
        continue;
      }
      seen.add(term.term);

      validated.push(term);

      // Check: max terms per act
      if (validated.length >= maxTermsPerAct) {
        console.log(
          `[TermValidation] Reached max ${maxTermsPerAct} terms for this act`,
        );
        break;
      }
    }

    return validated;
  }

  /**
   * Find existing term from in-memory cache (O(1) lookup)
   */
  findExistingTermFromCache(extracted, glossaryCache) {
    const { byCanonical, byJa, byZh, byVariant } = glossaryCache;

    // Try canonical form
    let term = byCanonical.get(extracted.term);
    if (term && term.type === extracted.type) return term;

    // Try language-specific field
    if (extracted.language === "ja") {
      term = byJa.get(extracted.term);
      if (term && term.type === extracted.type) return term;
    } else if (extracted.language === "zh") {
      term = byZh.get(extracted.term);
      if (term && term.type === extracted.type) return term;
    }

    // Try variant lookup
    term = byVariant.get(extracted.term);
    if (term && term.type === extracted.type) return term;

    return null;
  }

  /**
   * Find an existing term by various matching strategies (fallback method, uses DB)
   * Used when cache is not available - kept for backward compatibility
   */
  async findExistingTerm(extracted, seriesId, language) {
    const termField = language === "ja" ? "termJa" : "termZh";

    // Try exact match
    let term = await GlossaryTerm.findOne({
      where: {
        seriesId,
        [termField]: extracted.term,
        type: extracted.type,
      },
    });

    // Try canonical form
    if (!term) {
      term = await GlossaryTerm.findOne({
        where: {
          seriesId,
          canonicalForm: extracted.term,
          type: extracted.type,
        },
      });
    }

    // Try variant matching
    if (!term) {
      term = await this.findByVariant(extracted.term, seriesId, extracted.type);
    }

    return term;
  }

  /**
   * Process and save a batch of approved candidates
   */
  async handleBulkApproval(approvedItems, seriesId, language) {
    const results = { created: 0, updated: 0, appearances: 0 };
    const termField = language === "ja" ? "termJa" : "termZh";

    for (const item of approvedItems) {
      try {
        let term;
        if (item.existingId) {
          term = await GlossaryTerm.findByPk(item.existingId);
          if (term) {
            console.log(
              `[Phase 3] UPDATING existing term via bulk-approve: ${item.term}`,
            );
            await term.update({
              termEn: item.termEn || item.proposedTranslation, // User edited or AI proposed
              status: "approved",
              confidence: item.confidence,
              approvedAt: new Date(),
            });
            results.updated++;
          }
        }

        if (!term) {
          // Create new approved term
          console.log(
            `[Phase 3] CREATING new approved term via bulk-approve: ${item.term}`,
          );
          term = await GlossaryTerm.create({
            seriesId,
            canonicalForm: item.term,
            [termField]: item.term,
            termEn: item.termEn || item.proposedTranslation,
            type: item.type,
            metadata: { variants: [] },
            confidence: item.confidence,
            status: "approved",
            approvedAt: new Date(),
          });
          results.created++;
        }

        // Record all appearances for this term
        // The item might have multiple appearances if we aggregated them,
        // but for now the frontend sends them 1-by-1 or we can handle an array
        const appearances = item.appearances || [item];
        for (const app of appearances) {
          await this.recordAppearance(term.id, app.actId, app);
          results.appearances++;
        }

        // Handle variants
        await this.handleVariants(term, item.term);
      } catch (err) {
        console.error(
          `Failed to approve candidate "${item.term}":`,
          err.message,
        );
      }
    }

    return results;
  }

  async findOrCreateTerm(extracted, seriesId, language) {
    const termField = language === "ja" ? "termJa" : "termZh";

    // Try exact match first
    let term = await GlossaryTerm.findOne({
      where: {
        seriesId,
        [termField]: extracted.term,
        type: extracted.type,
      },
    });

    // Try canonical form
    if (!term) {
      term = await GlossaryTerm.findOne({
        where: {
          seriesId,
          canonicalForm: extracted.term,
          type: extracted.type,
        },
      });
    }

    // Try variant matching
    if (!term) {
      term = await this.findByVariant(extracted.term, seriesId, extracted.type);
    }

    if (term) {
      // Update translation if higher confidence
      if (extracted.confidence > (term.confidence || 0)) {
        await term.update({
          termEn: extracted.proposedTranslation,
          confidence: extracted.confidence,
        });
      }
      return { term, isNew: false };
    }

    // Create new term
    const newTerm = await GlossaryTerm.create({
      seriesId,
      canonicalForm: extracted.term,
      [termField]: extracted.term,
      termEn: extracted.proposedTranslation,
      type: extracted.type,
      metadata: { variants: [] },
      confidence: extracted.confidence,
      status: "pending",
    });

    return { term: newTerm, isNew: true };
  }

  async findByVariant(termText, seriesId, type) {
    // Check if any term has this as a variant
    const candidates = await GlossaryTerm.findAll({
      where: { seriesId, type },
    });

    for (const candidate of candidates) {
      // Check substring relationship
      const forms = [
        candidate.canonicalForm,
        candidate.termJa,
        candidate.termZh,
        ...(candidate.metadata?.variants || []),
      ].filter(Boolean);

      for (const form of forms) {
        if (termText.includes(form) || form.includes(termText)) {
          return candidate;
        }
      }
    }

    return null;
  }

  async recordAppearance(termId, actId, extracted) {
    // Skip recording if actId is not provided (e.g., from bulk-approve without source context)
    if (!actId) {
      console.log(
        `[Phase 3] Skipping appearance recording for termId ${termId} - no actId provided`,
      );
      return null;
    }

    // Use linking table - NEW SCHEMA PATTERN
    console.log(
      `[Phase 3] Recording appearance for termId: ${termId} in actId: ${actId}`,
    );
    const [appearance, created] = await TermAppearance.findOrCreate({
      where: {
        termId,
        actId,
      },
      defaults: {
        contextSentence: extracted?.context,
        confidence: extracted?.confidence,
        extractedAt: new Date(),
      },
    });

    // Update if already exists but higher confidence
    if (!created && extracted?.confidence > appearance.confidence) {
      await appearance.update({
        contextSentence: extracted?.context,
        confidence: extracted?.confidence,
      });
    }

    return appearance;
  }

  async handleVariants(term, variantForm) {
    const mainForms = [term.canonicalForm, term.termJa, term.termZh].filter(
      Boolean,
    );

    if (mainForms.includes(variantForm)) return;

    const variants = term.metadata?.variants || [];
    if (!variants.includes(variantForm)) {
      await term.update({
        metadata: {
          ...term.metadata,
          variants: [...variants, variantForm],
        },
      });
    }
  }

  /**
   * Get all terms for an act (using linking table)
   */
  async getTermsForAct(actId) {
    return await GlossaryTerm.findAll({
      include: [
        {
          model: TermAppearance,
          where: { actId },
          required: true,
          attributes: ["contextSentence", "confidence", "extractedAt"],
        },
      ],
    });
  }

  /**
   * Get all acts where a term appears (using linking table)
   */
  async getActsForTerm(termId) {
    const { Act } = require("../models");

    return await Act.findAll({
      include: [
        {
          model: TermAppearance,
          where: { termId },
          required: true,
        },
      ],
      order: [["sequence", "ASC"]],
    });
  }

  /**
   * Detect conflicts: identify if terms already exist in library (uses cache)
   * Returns: { existing (already approved), conflicts (duplicates with different translations), newest (truly new) }
   */
  async detectTermConflicts(candidateTerms, seriesId, language) {
    const result = {
      newTerms: [],
      existingTerms: [],
      conflictTerms: [],
    };

    // Load cache for efficient lookups
    const glossaryCache = await loadSeriesGlossary(seriesId);
    const { byCanonical, byJa, byZh, byVariant, allTerms } = glossaryCache;
    const termField = language === "ja" ? "termJa" : "termZh";

    for (const candidate of candidateTerms) {
      // Try cache lookups first (O(1))
      let existing =
        byCanonical.get(candidate.term) ||
        (termField === "termJa"
          ? byJa.get(candidate.term)
          : byZh.get(candidate.term)) ||
        byVariant.get(candidate.term);

      // Filter by type
      if (existing && existing.type !== candidate.type) {
        existing = null;
      }

      if (existing) {
        // Term already exists - check if it's a duplicate or conflict
        const isDifferentTranslation =
          existing.termEn &&
          existing.termEn !==
            (candidate.termEn || candidate.proposedTranslation);

        if (isDifferentTranslation && existing.status === "approved") {
          // Conflict: different English translation for already-approved term
          result.conflictTerms.push({
            ...candidate,
            existingId: existing.id,
            existingTranslation: existing.termEn,
            existingStatus: existing.status,
            confidence: existing.confidence,
          });
        } else {
          // Already exists in library (not a new term)
          result.existingTerms.push({
            ...candidate,
            existingId: existing.id,
            existingTranslation: existing.termEn,
            existingStatus: existing.status,
            confidence: existing.confidence,
          });
        }
      } else {
        // Truly new term
        result.newTerms.push(candidate);
      }
    }

    return result;
  }

  /**
   * Process conflict resolutions from user choices
   * @param {Array} resolutions - Array of { existingId, term, resolution, termEn, variantForm? }
   * @param {number} seriesId - Series context
   * @param {string} language - 'ja' or 'zh'
   * @returns {Object} Stats { processed, kept, merged, created_variants }
   */
  async resolveConflicts(resolutions, seriesId, language) {
    const termField = language === "ja" ? "termJa" : "termZh";
    const result = {
      processed: 0,
      kept: 0,
      merged: 0,
      created_variants: 0,
      failed: [],
    };

    for (const resolution of resolutions) {
      try {
        const {
          existingId,
          term,
          resolution: choice,
          termEn,
          variantForm,
          appearances,
        } = resolution;

        // Load the existing term
        let existingTerm = await GlossaryTerm.findByPk(existingId);
        if (!existingTerm) {
          result.failed.push(`Existing term with ID ${existingId} not found`);
          continue;
        }

        if (choice === "keep_existing") {
          // Option 1: Keep existing translation, discard new candidate
          console.log(
            `[Phase 3] CONFLICT RESOLUTION: Keeping existing term "${term}"`,
          );

          // Record appearances for the existing term
          if (appearances && Array.isArray(appearances)) {
            for (const app of appearances) {
              await this.recordAppearance(existingTerm.id, app.actId, {
                context: app.context,
                confidence: app.confidence || 0.5,
              });
            }
          }

          result.kept++;
        } else if (choice === "merge") {
          // Option 2: Update existing term with new translation
          console.log(
            `[Phase 3] CONFLICT RESOLUTION: Merging - updating term "${term}" translation to "${termEn}"`,
          );

          await existingTerm.update({
            termEn: termEn || existingTerm.termEn,
            confidence: Math.max(existingTerm.confidence || 0, 0.8),
            status: existingTerm.status, // Keep existing status
          });

          // Record appearances for the existing term
          if (appearances && Array.isArray(appearances)) {
            for (const app of appearances) {
              await this.recordAppearance(existingTerm.id, app.actId, {
                context: app.context,
                confidence: app.confidence || 0.5,
              });
            }
          }

          result.merged++;
        } else if (choice === "create_variant") {
          // Option 3: Create as variant or separate term
          console.log(
            `[Phase 3] CONFLICT RESOLUTION: Creating variant - "${term}" as variant of "${existingTerm.canonicalForm}"`,
          );

          if (variantForm) {
            // Add to existing term's variants
            await existingTerm.addVariant(variantForm);
            console.log(
              `[Phase 3] Added variant form "${variantForm}" to term "${existingTerm.canonicalForm}"`,
            );
          } else {
            // Create as new term with metadata linking to existing
            const newVariantTerm = await GlossaryTerm.create({
              seriesId,
              canonicalForm: term,
              [termField]: term,
              termEn: termEn,
              type: existingTerm.type,
              metadata: {
                variants: [],
                linkedTermId: existingTerm.id,
                relationshipType: "variant",
              },
              confidence: 0.8,
              status: "pending",
            });

            // Update existing term to reference this new variant
            const existingMetadata = existingTerm.metadata || {};
            existingTerm.metadata = {
              ...existingMetadata,
              variantIds: [
                ...(existingMetadata.variantIds || []),
                newVariantTerm.id,
              ],
            };
            await existingTerm.save();

            console.log(
              `[Phase 3] Created new variant term "${term}" linked to "${existingTerm.canonicalForm}"`,
            );
          }

          // Record appearances
          if (appearances && Array.isArray(appearances)) {
            for (const app of appearances) {
              await this.recordAppearance(existingTerm.id, app.actId, {
                context: app.context,
                confidence: app.confidence || 0.5,
              });
            }
          }

          result.created_variants++;
        }

        result.processed++;
      } catch (err) {
        console.error(
          `[Phase 3] Conflict resolution failed for term "${resolution.term}":`,
          err.message,
        );
        result.failed.push(`${resolution.term}: ${err.message}`);
      }
    }

    return result;
  }
}

module.exports = new GlossaryProcessingService();
