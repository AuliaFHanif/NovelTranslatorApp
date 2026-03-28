class StrategyGenerator {
  /**
   * Generate act-level strategy from narrative analysis
   */
  generateActStrategy(narrative, linguistic) {
    const base = {
      primaryEmotion: narrative?.primaryEmotion,
      emotionalIntensity: narrative?.emotionalIntensity,
      pacingPattern: narrative?.pacingPattern
    };

    if (linguistic?.language === 'ja') {
      return this.generateJapaneseStrategy(base, narrative, linguistic);
    } else {
      return this.generateChineseStrategy(base, narrative, linguistic);
    }
  }

  generateJapaneseStrategy(base, narrative, linguistic) {
    return {
      ...base,

      sentenceLengthTarget: narrative?.pacingPattern === 'kuai' ? 'short' : 'long',

      fragmentUsage: (narrative?.powerDynamic?.type === 'master_servant' ||
                     narrative?.emotionalTone?.enryo)
        ? 'absolute_phrases'
        : 'standard',

      physiologicalTropes: narrative?.emotionalIntensity > 0.7 ? 'preserve' : 'standard',

      agencyOmission: (linguistic?.proDrop?.frequency > 0.5 ||
                       linguistic?.proDrop?.agentOmission)
        ? 'preserve_passive'
        : 'standard',

      objectificationFreeze: linguistic?.taigenTome?.count > 0
        ? 'noun_endings'
        : 'standard',

      interiorityFormat: linguistic?.internalMonologue?.format === 'maru_kakko'
        ? 'italics_no_tags'
        : 'standard',

      enryo: narrative?.emotionalTone?.enryo || false,
      amae: narrative?.emotionalTone?.amae || false,

      honorificStrategy: linguistic?.honorifics?.density === 'high'
        ? 'retain_keigo'
        : 'adapt_status'
    };
  }

  generateChineseStrategy(base, narrative, linguistic) {
    const faceThreat = narrative?.faceSystem || {};

    return {
      ...base,

      sentenceLengthTarget: narrative?.kuaiMan?.dominantPattern === 'kuai' ? 'short' : 'long',

      faceThreatEmphasis: faceThreat.faceThreatPresent
        ? (faceThreat.lossOfFaceEvents?.[0]?.severity || 'medium')
        : 'none',

      physiologicalTropes: faceThreat.lossOfFaceEvents?.some(e =>
        e.physiologicalMarkers?.length > 0
      ) ? 'preserve_markers' : 'standard',

      filialContext: narrative?.filialPiety?.present ? {
        relationship: narrative.filialPiety.relationshipType,
        twisted: narrative.filialPiety.twisted,
        obedience: narrative.filialPiety.obedienceLevel
      } : null,

      statusLanguageStrategy: this.determineStatusStrategy(linguistic?.statusLanguage),

       నాలుగుCharacterIdioms: linguistic?.fourCharacterIdioms?.length > 0
        ? 'preserve_pinyin'
        : 'standard',

      jianghuContext: narrative?.jianghu?.present ? {
        martialArtsTerms: narrative.jianghu.martialArtsTerms,
        cultivationStages: narrative.jianghu.cultivationStages
      } : null
    };
  }

  determineStatusStrategy(statusLanguage) {
    if (!statusLanguage) return 'standard';

    const hasArrogant = statusLanguage.arrogant?.length > 0;
    const hasHumble = statusLanguage.selfDeprecating?.length > 0;

    if (hasArrogant && hasHumble) return 'contrastive_status';
    if (hasArrogant) return 'aggressive_dominant';
    if (hasHumble) return 'humble_subordinate';
    return 'standard';
  }

  /**
   * Aggregate chapter-level strategy from all acts
   */
  aggregateChapterStrategy(acts) {
    if (!acts || acts.length === 0) return null;

    const strategies = acts
      .map(a => a.anatomyProfile?.narrative)
      .filter(Boolean);

    const linguisticProfiles = acts
      .map(a => a.anatomyProfile?.linguistic)
      .filter(Boolean);

    if (linguisticProfiles.length === 0) return null;

    const language = linguisticProfiles[0]?.language;

    // Onomatopoeia strategy
    const onomatopoeiaDensities = linguisticProfiles.map(p => p.onomatopoeia?.density);
    const onomatopoeiaStrategy = onomatopoeiaDensities.includes('high')
      ? 'romanize_with_context'
      : 'translate_sensory';

    // Honorific/status retention
    let honorificRetention;
    if (language === 'ja') {
      const honorificDensities = linguisticProfiles.map(p => p.honorifics?.density);
      honorificRetention = honorificDensities.includes('high') ? 'retain' : 'adapt';
    } else {
      const hasStatus = linguisticProfiles.some(p =>
        p.statusLanguage?.arrogant?.length > 0 ||
        p.statusLanguage?.selfDeprecating?.length > 0
      );
      honorificRetention = hasStatus ? 'retain' : 'adapt';
    }

    // Pacing consistency
    const patterns = strategies.map(s => s.pacingPattern).filter(Boolean);
    const pacingConsistency = new Set(patterns).size > 1 ? 'mixed' : 'uniform';

    // Emotional arc
    const emotionalArc = strategies.map(s => s.primaryEmotion).filter(Boolean);

    return {
      language,
      onomatopoeiaStrategy,
      honorificRetention,
      interiorityFormat: 'italics_no_tags',
      pacingConsistency,
      emotionalArc
    };
  }
}

module.exports = new StrategyGenerator();
