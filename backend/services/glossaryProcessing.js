const { GlossaryTerm, TermAppearance } = require('../models');

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
   * @param {Object} act - Act instance
   * @returns {Object} { candidates, approvedAppearances }
   */
  async identifyTerms(extractedTerms, act) {
    const seriesId = act.Chapter?.seriesId;
    const language = act.Chapter?.Series?.language;
    const candidates = [];
    let approvedCount = 0;

    for (const extracted of extractedTerms) {
      try {
        // Normalize extracted data (handle potential AI property name variations)
        const normalized = {
          term: extracted.term || extracted.name || extracted.text || extracted.word,
          type: extracted.type || 'term',
          context: extracted.context || extracted.contextSentence || extracted.sentence || '',
          proposedTranslation: extracted.proposedTranslation || extracted.translation || '',
          confidence: typeof extracted.confidence === 'number' ? extracted.confidence : 0.8
        };

        if (!normalized.term) {
          console.warn(`[Phase 3] AI returned term without name/text. Skipping.`, extracted);
          continue;
        }

        // 1. Check if term already exists and is approved
        const existingTerm = await this.findExistingTerm(normalized, seriesId, language);

        if (existingTerm && existingTerm.status === 'approved') {
          // Record appearance immediately for approved terms
          console.log(`[Phase 3] Logging appearance for EXISTING APPROVED term: ${normalized.term}`);
          await this.recordAppearance(existingTerm.id, act.id, normalized);
          approvedCount++;
          
          // Also handle variants for existing terms
          await this.handleVariants(existingTerm, normalized.term);
        } else {
          // If not approved (unseen or pending), treat as candidate
          console.log(`[Phase 3] Identified NEW CANDIDATE: ${normalized.term} (Existing: ${!!existingTerm})`);
          candidates.push({
            ...normalized,
            existingId: existingTerm?.id || null,
            actId: act.id,
            actLabel: act.label
          });
        }
      } catch (err) {
        console.error(`Failed to identify term:`, err.message);
      }
    }

    return { candidates, approvedCount };
  }

  /**
   * Find an existing term by various matching strategies
   */
  async findExistingTerm(extracted, seriesId, language) {
    const termField = language === 'ja' ? 'termJa' : 'termZh';

    // Try exact match
    let term = await GlossaryTerm.findOne({
      where: {
        seriesId,
        [termField]: extracted.term,
        type: extracted.type
      }
    });

    // Try canonical form
    if (!term) {
      term = await GlossaryTerm.findOne({
        where: {
          seriesId,
          canonicalForm: extracted.term,
          type: extracted.type
        }
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
    const termField = language === 'ja' ? 'termJa' : 'termZh';

    for (const item of approvedItems) {
      try {
        let term;
        if (item.existingId) {
          term = await GlossaryTerm.findByPk(item.existingId);
          if (term) {
            console.log(`[Phase 3] UPDATING existing term via bulk-approve: ${item.term}`);
            await term.update({
              termEn: item.termEn || item.proposedTranslation, // User edited or AI proposed
              status: 'approved',
              confidence: item.confidence,
              approvedAt: new Date()
            });
            results.updated++;
          }
        }

        if (!term) {
          // Create new approved term
          console.log(`[Phase 3] CREATING new approved term via bulk-approve: ${item.term}`);
          term = await GlossaryTerm.create({
            seriesId,
            canonicalForm: item.term,
            [termField]: item.term,
            termEn: item.termEn || item.proposedTranslation,
            type: item.type,
            metadata: { variants: [] },
            confidence: item.confidence,
            status: 'approved',
            approvedAt: new Date()
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
        console.error(`Failed to approve candidate "${item.term}":`, err.message);
      }
    }

    return results;
  }

  async findOrCreateTerm(extracted, seriesId, language) {
    const termField = language === 'ja' ? 'termJa' : 'termZh';

    // Try exact match first
    let term = await GlossaryTerm.findOne({
      where: {
        seriesId,
        [termField]: extracted.term,
        type: extracted.type
      }
    });

    // Try canonical form
    if (!term) {
      term = await GlossaryTerm.findOne({
        where: {
          seriesId,
          canonicalForm: extracted.term,
          type: extracted.type
        }
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
          confidence: extracted.confidence
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
      status: 'pending'
    });

    return { term: newTerm, isNew: true };
  }

  async findByVariant(termText, seriesId, type) {
    // Check if any term has this as a variant
    const candidates = await GlossaryTerm.findAll({
      where: { seriesId, type }
    });

    for (const candidate of candidates) {
      // Check substring relationship
      const forms = [
        candidate.canonicalForm,
        candidate.termJa,
        candidate.termZh,
        ...(candidate.metadata?.variants || [])
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
    // Use linking table - NEW SCHEMA PATTERN
    console.log(`[Phase 3] Recording appearance for termId: ${termId} in actId: ${actId}`);
    const [appearance, created] = await TermAppearance.findOrCreate({
      where: {
        termId,
        actId
      },
      defaults: {
        contextSentence: extracted.context,
        confidence: extracted.confidence,
        extractedAt: new Date()
      }
    });

    // Update if already exists but higher confidence
    if (!created && extracted.confidence > appearance.confidence) {
      await appearance.update({
        contextSentence: extracted.context,
        confidence: extracted.confidence
      });
    }

    return appearance;
  }

  async handleVariants(term, variantForm) {
    const mainForms = [
      term.canonicalForm,
      term.termJa,
      term.termZh
    ].filter(Boolean);

    if (mainForms.includes(variantForm)) return;

    const variants = term.metadata?.variants || [];
    if (!variants.includes(variantForm)) {
      await term.update({
        metadata: {
          ...term.metadata,
          variants: [...variants, variantForm]
        }
      });
    }
  }

  /**
   * Get all terms for an act (using linking table)
   */
  async getTermsForAct(actId) {
    return await GlossaryTerm.findAll({
      include: [{
        model: TermAppearance,
        where: { actId },
        required: true,
        attributes: ['contextSentence', 'confidence', 'extractedAt']
      }]
    });
  }

  /**
   * Get all acts where a term appears (using linking table)
   */
  async getActsForTerm(termId) {
    const { Act } = require('../models');

    return await Act.findAll({
      include: [{
        model: TermAppearance,
        where: { termId },
        required: true
      }],
      order: [['sequence', 'ASC']]
    });
  }
}

module.exports = new GlossaryProcessingService();
