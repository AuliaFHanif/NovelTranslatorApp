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
  async processTerms(extractedTerms, act) {
    const seriesId = act.Chapter?.seriesId;
    const language = act.Chapter?.Series?.language;

    const stats = { created: 0, merged: 0, appearances: 0 };
    const processedTerms = [];

    for (const extracted of extractedTerms) {
      try {
        // 1. Find or create GlossaryTerm
        const { term, isNew } = await this.findOrCreateTerm(extracted, seriesId, language);

        if (isNew) {
          stats.created++;
        } else {
          stats.merged++;
        }

        // 2. Create TermAppearance (linking record - NEW SCHEMA!)
        await this.recordAppearance(term.id, act.id, extracted);
        stats.appearances++;

        // 3. Add variants if different form
        await this.handleVariants(term, extracted.term);

        // Add to return list
        processedTerms.push(term);

      } catch (err) {
        console.error(`Failed to process term "${extracted.term}":`, err.message);
        // Continue with other terms
      }
    }

    return { ...stats, terms: processedTerms };
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
