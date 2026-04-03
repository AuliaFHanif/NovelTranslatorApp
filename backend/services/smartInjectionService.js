"use strict";

const { GlossaryTerm, TermAppearance, SubAct } = require("../models");
const TextMetrics = require("../utils/textMetrics");

const PRIORITY_WEIGHTS = {
  character: 100, // Always inject if present
  organization: 90, // Groups, factions, companies
  location: 70, // Places
  item: 50, // Artifacts, weapons
  technique: 60, // Martial arts, spells
  concept: 30, // Abstract ideas
};

const INJECTION_LIMITS = {
  hardTokenLimit: 600, // Max tokens for glossary (conservative for 8GB VRAM)
  termSlotLimit: 15, // Absolute max terms to prevent bloat
  charTermMinimum: 3, // Strict: always inject ≥3 characters if available
  orgTermMinimum: 2, // Strict: always inject ≥2 organizations if available
  locationMaximum: 3, // Adaptive: max 3 locations (if space allows)
  itemMaximum: 2, // Adaptive: max 2 items
  conceptMaximum: 1, // Adaptive: max 1 concept (lowest priority)
};

class SmartInjectionService {
  /**
   * Get prioritized terms for a specific SubAct
   */
  async getTermsForSubAct(subActId, seriesId, options = {}) {
    // 1. Get all terms that appear in this SubAct via TermAppearance
    const appearances = await TermAppearance.findAll({
      where: { subActId },
      include: [
        {
          model: GlossaryTerm,
          as: "Term",
          where: {
            seriesId,
            status: "approved",
          },
        },
      ],
      order: [
        ["frequency", "DESC"],
        ["confidence", "DESC"],
      ],
    });

    // 2. If no appearances found (e.g., bulk-approved terms), include ALL approved terms for series
    let termsToScore;
    if (appearances.length === 0) {
      console.log(
        `[SmartInjection] SubAct ${subActId}: No TermAppearances found, loading all approved series terms`,
      );
      const allApprovedTerms = await GlossaryTerm.findAll({
        where: {
          seriesId,
          status: "approved",
        },
      });

      termsToScore = allApprovedTerms.map((term) => ({
        Term: term,
        frequency: 1,
        confidence: 0.8, // Default confidence for series-wide terms
      }));
    } else {
      termsToScore = appearances;
    }

    // 3. Score and prioritize
    const scoredTerms = termsToScore.map((app) => {
      const term = app.Term;
      const basePriority = PRIORITY_WEIGHTS[term.type] || 50;

      return {
        id: term.id,
        term: term.termEn,
        original: term.canonicalForm || term.termZh || term.termJa,
        type: term.type,
        definition: term.definition,

        // Composite score
        score: this.calculateScore(
          basePriority,
          app.frequency || 1,
          app.confidence,
          term.type,
        ),

        // Token cost estimate
        estimatedTokens: this.estimateTermTokens(term),
      };
    });

    // 4. Sort by score descending
    scoredTerms.sort((a, b) => b.score - a.score);

    // 5. Select terms respecting limits and quotas
    const selected = this.selectWithQuotas(scoredTerms);

    return {
      injected: selected,
      stats: {
        totalAvailable: scoredTerms.length,
        injected: selected.length,
        estimatedTokens: selected.reduce(
          (sum, t) => sum + t.estimatedTokens,
          0,
        ),
      },
    };
  }

  calculateScore(basePriority, frequency, confidence, type) {
    const freqMultiplier = Math.log2(frequency + 1) * 10;
    const confidenceWeight = (confidence || 0.8) * 20;
    const typeBonus = type === "character" || type === "organization" ? 50 : 0;

    return basePriority + freqMultiplier + confidenceWeight + typeBonus;
  }

  selectWithQuotas(scoredTerms) {
    const selected = [];
    let usedTokens = 0;

    const quotas = {
      character: 0,
      organization: 0,
      location: 0,
      item: 0,
      concept: 0,
      technique: 0,
    };

    // Phase 1: Fill mandatory strict quotas (guarantee critical types)
    for (const term of scoredTerms) {
      if (usedTokens >= INJECTION_LIMITS.hardTokenLimit) break;
      if (selected.length >= INJECTION_LIMITS.termSlotLimit) break;

      const isCharacterQuota =
        term.type === "character" &&
        quotas.character < INJECTION_LIMITS.charTermMinimum;
      const isOrgQuota =
        term.type === "organization" &&
        quotas.organization < INJECTION_LIMITS.orgTermMinimum;

      if (isCharacterQuota || isOrgQuota) {
        selected.push(term);
        usedTokens += term.estimatedTokens;
        if (isCharacterQuota) quotas.character++;
        if (isOrgQuota) quotas.organization++;
      }
    }

    // Phase 2: Fill remaining slots with adaptive quotas (respecting type limits)
    for (const term of scoredTerms) {
      if (selected.find((s) => s.id === term.id)) continue;
      if (usedTokens >= INJECTION_LIMITS.hardTokenLimit) break;
      if (selected.length >= INJECTION_LIMITS.termSlotLimit) break;

      // Check adaptive quotas for this type
      const typeQuota = {
        location: INJECTION_LIMITS.locationMaximum,
        item: INJECTION_LIMITS.itemMaximum,
        concept: INJECTION_LIMITS.conceptMaximum,
        technique: 3, // No explicit limit, adaptive
      }[term.type];

      // Only add if within adaptive quota
      if (typeQuota === undefined || quotas[term.type] < typeQuota) {
        selected.push(term);
        usedTokens += term.estimatedTokens;
        quotas[term.type]++;
      }
    }

    return selected;
  }

  estimateTermTokens(term) {
    const text = `${term.termEn || term.term || "unknown"} (${term.canonicalForm || term.termZh || term.termJa || "unknown"}): ${term.definition || "N/A"}`;
    return TextMetrics.estimateTokens(text);
  }

  /**
   * Build the actual prompt section for LLM
   * Uses hybrid quota system: strict for critical types, adaptive for others
   */
  buildGlossaryPrompt(termsData) {
    const { injected, stats } = termsData;
    if (!injected || injected.length === 0) return "";

    let prompt = `=== CHARACTER & TERM REFERENCE ===\n`;
    prompt += `Use these translations consistently.\n`;
    prompt += `(${injected.length} terms | ${stats?.estimatedTokens || 0} tokens)\n\n`;

    const grouped = injected.reduce((acc, t) => {
      acc[t.type] = acc[t.type] || [];
      acc[t.type].push(t);
      return acc;
    }, {});

    // Priority order: characters first, then organizations, then others
    const typeOrder = [
      "character",
      "organization",
      "location",
      "item",
      "technique",
      "concept",
    ];
    for (const type of typeOrder) {
      if (!grouped[type]) continue;
      const terms = grouped[type];
      prompt += `${type.toUpperCase()}S (${terms.length}):\n`;
      terms.forEach((t) => {
        prompt += `- ${t.original} → ${t.term}`;
        if (t.definition) prompt += ` (${t.definition})`;
        prompt += `\n`;
      });
      prompt += `\n`;
    }

    prompt += `=== END REFERENCE ===\n\n`;
    return prompt;
  }

  /**
   * Load all approved glossary terms for a series (no SubAct filter)
   * Used when building prompts for entire Acts
   */
  async loadGlossaryForSeries(seriesId) {
    console.log(
      `[SmartInjection] Loading all approved terms for series ${seriesId}`,
    );

    // Load all approved terms for this series
    const allApprovedTerms = await GlossaryTerm.findAll({
      where: {
        seriesId,
        status: "approved",
      },
    });

    console.log(
      `[SmartInjection] Found ${allApprovedTerms.length} approved terms`,
    );

    // Convert to scored format
    const scoredTerms = allApprovedTerms.map((term) => {
      const basePriority = PRIORITY_WEIGHTS[term.type] || 50;

      return {
        id: term.id,
        term: term.termEn,
        original: term.canonicalForm || term.termZh || term.termJa,
        type: term.type,
        definition: term.definition,

        // Composite score (without frequency/confidence since no appearance data)
        score: this.calculateScore(basePriority, 1, 0.8, term.type),

        // Token cost estimate
        estimatedTokens: this.estimateTermTokens(term),
      };
    });

    // Sort by score descending
    scoredTerms.sort((a, b) => b.score - a.score);

    // Select terms respecting limits and quotas
    const selected = this.selectWithQuotas(scoredTerms);

    return {
      injected: selected,
      stats: {
        totalAvailable: scoredTerms.length,
        injected: selected.length,
        estimatedTokens: selected.reduce(
          (sum, t) => sum + t.estimatedTokens,
          0,
        ),
      },
    };
  }

  /**
   * Build comprehensive analysis context for a prompt
   * Extracts all available analysis fields based on language
   * Note: Profile uses "narrative" and "linguistic", not "narrativeAnalysis" and "linguisticAnalysis"
   */
  buildAnalysisContext(act) {
    if (!act.Analysis?.anatomyProfile) {
      console.log(
        `[SmartInjection] No analysis data for Act ${act.label}: Analysis=${!!act.Analysis}, anatomyProfile=${!!act.Analysis?.anatomyProfile}`,
      );
      return `Act ${act.label} (${act.rawText?.length || 0} chars)\n`;
    }

    console.log(
      `[SmartInjection] Building analysis context for Act ${act.label}`,
    );
    const profile = act.Analysis.anatomyProfile;

    // Log the actual structure
    console.log(
      `[SmartInjection] Profile structure:`,
      JSON.stringify(profile, null, 2).substring(0, 500),
    );

    const language = act.Chapter?.Series?.language || "zh";
    let context = `Act ${act.label} (${act.rawText?.length || 0} chars)\n`;

    // Narrative analysis (common fields for both languages)
    const narrative = profile.narrative || {};
    console.log(
      `[SmartInjection] Narrative data:`,
      JSON.stringify(narrative).substring(0, 300),
    );

    // Primary emotion (universal)
    if (narrative.primaryEmotion) {
      context += `Primary Emotion: ${narrative.primaryEmotion}\n`;
    }

    // Emotional intensity (universal)
    if (narrative.emotionalIntensity !== undefined) {
      context += `Emotional Intensity: ${(narrative.emotionalIntensity * 100).toFixed(0)}%\n`;
    }

    // Language-specific analysis
    if (language === "zh") {
      const linguistics = profile.linguistic || {};
      console.log(
        `[SmartInjection] Linguistic data:`,
        JSON.stringify(linguistics).substring(0, 300),
      );

      // Topic prominence (Chinese-specific)
      if (linguistics.topicProminence) {
        context += `Topic Prominence: ${(linguistics.topicProminence.frequency * 100).toFixed(0)}%`;
        if (linguistics.topicProminence.examples?.length > 0) {
          context += ` (e.g., "${linguistics.topicProminence.examples[0]}")`;
        }
        context += `\n`;
      }

      // Four-character idioms (Chinese-specific)
      if (linguistics.fourCharacterIdioms?.length > 0) {
        context += `Four-Character Idioms (${linguistics.fourCharacterIdioms.length}):\n`;
        linguistics.fourCharacterIdioms.slice(0, 3).forEach((idiom) => {
          context += `  - ${idiom.idiom}: ${idiom.contextualMeaning}`;
          if (idiom.preserve) context += ` [PRESERVE]`;
          context += `\n`;
        });
      }

      // Pacing pattern (kuaiMan - Chinese-specific)
      if (narrative.kuaiMan?.dominantPattern) {
        context += `Pacing: ${narrative.kuaiMan.dominantPattern} (${narrative.kuaiMan.dominantPattern === "kuai" ? "fast/urgent" : narrative.kuaiMan.dominantPattern === "man" ? "slow/leisurely" : "alternating"})\n`;
      }

      // Face system (Chinese-specific)
      if (narrative.faceSystem?.faceThreatPresent) {
        context += `Face System: Present (threat to character face)\n`;
      }

      // Onomatopoeia density (Chinese-specific)
      if (linguistics.onomatopoeia?.density) {
        context += `Onomatopoeia Density: ${linguistics.onomatopoeia.density}\n`;
      }
    } else if (language === "ja") {
      const linguistics = profile.linguistic || {};

      // Pacing via kokyu (Japanese-specific)
      if (narrative.kokyu?.pattern) {
        context += `Kokyu (Breathing Pattern): ${narrative.kokyu.pattern} (${narrative.kokyu.avgSentenceLength || "?"} avg words)\n`;
      }

      // Emotional tone (Japanese-specific)
      if (narrative.emotionalTone?.primary) {
        const tone = narrative.emotionalTone;
        context += `Emotional Tone: ${tone.primary}`;
        if (tone.intensity !== undefined) {
          context += ` (intensity: ${(tone.intensity * 100).toFixed(0)}%)`;
        }
        context += `\n`;
      }

      // Onomatopoeia (Japanese-specific)
      if (linguistics.onomatopoeia?.density) {
        context += `Onomatopoeia Density: ${linguistics.onomatopoeia.density}\n`;
      }
    }

    console.log(
      `[SmartInjection] Final analysis context (${context.length} chars):\n${context}`,
    );
    return context;
  }
}

module.exports = new SmartInjectionService();
