const schemas = require("./analysisSchemas");
const { resolveModel } = require("./resolveModel");
const { extractJson, countWords } = require("./utils");
const llmClient = require("./llmClient");

class AnalysisService {
  constructor() {}

  /**
   * Detect if an act is part of a group (e.g., 1A, 1B are grouped)
   * Returns array of act IDs that belong to the same group
   * @param {number} actId - The act to check
   * @param {Array} allChapterActs - All acts in the chapter
   * @returns {Array} Array of act IDs in the same group (or just [actId] if not grouped)
   */
  detectActGroup(actId, allChapterActs) {
    const targetAct = allChapterActs.find((a) => a.id === actId);
    if (!targetAct) return [actId];

    // Extract base label (e.g., "1" from "1A", "1" from "1B")
    const label = String(targetAct.label || "");
    const baseLabel = label.replace(/[A-Z]$/, ""); // Remove suffix if present

    if (!baseLabel || baseLabel === label) {
      // No grouping detected (no letter suffix), return just this act
      return [actId];
    }

    // Find all acts with same base label
    const groupActs = allChapterActs.filter((a) => {
      const aLabel = String(a.label || "");
      const aBaseLabel = aLabel.replace(/[A-Z]$/, "");
      return aBaseLabel === baseLabel;
    });

    // Return group members sorted by sequence
    return groupActs.sort((a, b) => a.sequence - b.sequence).map((a) => a.id);
  }

  /**
   * Analyze a group of acts together (concatenate text, run single analysis)
   * Stores identical analysis in all acts' anatomyProfile
   * @param {Array} acts - Array of act objects to analyze together
   * @param {Object} options - { model, task }
   * @returns {Array} Array of updated act objects
   */
  async analyzeActGroup(acts, options = {}) {
    if (!acts || acts.length === 0) {
      throw new Error("Must provide at least one act to analyze");
    }

    // Concatenate all act texts
    const combinedText = acts.map((a) => a.rawText).join("\n\n");
    const combinedWords = countWords(combinedText);

    console.log(
      `[Grouped Analysis] Analyzing ${acts.length} acts (${combinedWords} words total)`,
    );
    console.log(
      `[Grouped Analysis] Acts: ${acts.map((a) => a.label).join(", ")}`,
    );

    // Create temporary mock act with combined text for analysis
    const groupAct = {
      id: acts[0].id,
      label: acts.map((a) => a.label).join(" + "),
      rawText: combinedText,
      Chapter: acts[0].Chapter,
    };

    const results = {
      analyzed: [],
      failed: [],
      termsFound: [],
    };

    try {
      // Run extraction on combined text if task includes "terms"
      if (options.task === "all" || options.task === "terms") {
        try {
          console.log(`[Grouped Analysis] Pass 1: Extracting terms from group`);
          const combinedExtractedTerms = await this.runFullTermExtraction(
            groupAct,
            options,
          );
          results.termsFound = combinedExtractedTerms;
        } catch (err) {
          console.error(
            `[Grouped Analysis] Term extraction failed:`,
            err.message,
          );
          results.failed.push({
            stage: "term_extraction",
            error: err.message,
          });
        }
      }

      // Run narrative analysis on combined text if task includes "narrative"
      let narrativeResult = null;
      if (options.task === "all" || options.task === "narrative") {
        try {
          console.log(
            `[Grouped Analysis] Pass 2: Analyzing narrative for group`,
          );
          narrativeResult = await this.analyzeNarrative(groupAct, options);
        } catch (err) {
          console.error(
            `[Grouped Analysis] Narrative analysis failed:`,
            err.message,
          );
          results.failed.push({
            stage: "narrative_analysis",
            error: err.message,
          });
        }
      }

      // Store identical analysis in all acts
      for (const act of acts) {
        const updatedProfile = {
          ...act.anatomyProfile,
        };

        if (options.task === "all" || options.task === "terms") {
          updatedProfile.termExtractionStatus = results.failed.some(
            (f) => f.stage === "term_extraction",
          )
            ? "error"
            : "success";
        }

        if (
          (options.task === "all" || options.task === "narrative") &&
          narrativeResult
        ) {
          updatedProfile.linguistic = narrativeResult.linguisticAnalysis;
          updatedProfile.narrative = narrativeResult.narrativeAnalysis;
          updatedProfile.actAnalysisStatus = "success";
        }

        await act.update({
          anatomyProfile: updatedProfile,
          status: results.failed.length === 0 ? "ready" : "pending",
        });

        results.analyzed.push(act);
      }

      return results;
    } catch (err) {
      console.error(`[Grouped Analysis] Critical error:`, err.message);
      throw err;
    }
  }

  // --- TERM EXTRACTION PASSES ---

  async _executeExtractionPass(act, options, schema, systemPromptBuilder) {
    const language = act.Chapter?.Series?.language;
    if (!language || !["ja", "zh"].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const modelId = await resolveModel(options.model);

    const messages = [
      {
        role: "system",
        content: systemPromptBuilder(language),
      },
      {
        role: "user",
        content: this.buildTermExtractionUserPrompt(act),
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.1, // Lower temperature for more stable extraction
        max_tokens: 1500,
      });

      const result = JSON.parse(extractJson(content));
      return this.sanitizeResult(result);
    } catch (err) {
      console.error(
        `Term extraction pass failed for act ${act.id}:`,
        err.message,
      );
      throw err;
    }
  }

  async extractCharacters(act, options = {}) {
    const result = await this._executeExtractionPass(
      act,
      options,
      schemas.terms.character,
      this.buildCharacterExtractionPrompt,
    );
    return {
      ...result,
      actId: act.id,
      extractedAt: new Date().toISOString(),
    };
  }

  async extractLocationsAndOrgs(act, options = {}) {
    const result = await this._executeExtractionPass(
      act,
      options,
      schemas.terms.locationOrg,
      this.buildLocationOrgExtractionPrompt,
    );
    return {
      ...result,
      actId: act.id,
      extractedAt: new Date().toISOString(),
    };
  }

  async extractItemsConceptsTechniques(act, options = {}) {
    const result = await this._executeExtractionPass(
      act,
      options,
      schemas.terms.itemConceptTechnique,
      this.buildItemConceptTechniqueExtractionPrompt,
    );
    return {
      ...result,
      actId: act.id,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Pass 1: Unified Term Extraction (Optimized Single Call)
   * Combines character, location/org, and item/concept/technique extraction into one LLM call
   */
  async runUnifiedTermExtraction(act, options = {}) {
    const language = act.Chapter?.Series?.language;
    if (!language || !["ja", "zh"].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const modelId = await resolveModel(options.model);
    const startTime = Date.now();

    const messages = [
      {
        role: "system",
        content: this.buildUnifiedExtractionPrompt(language),
      },
      {
        role: "user",
        content: this.buildTermExtractionUserPrompt(act),
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages,
        response_format: schemas.terms.unified,
        temperature: 0.1,
        max_tokens: 2000, // Increased from 1500 to accommodate combined extraction
      });

      const result = JSON.parse(extractJson(content));
      const duration = Date.now() - startTime;

      console.log(
        `[LLM] Unified extraction (Act ${act.id}): ${result.extractedTerms?.length || 0} terms in ${duration}ms`,
      );

      return this.sanitizeResult(result).extractedTerms || [];
    } catch (err) {
      console.error(
        `Unified term extraction failed for act ${act.id}:`,
        err.message,
      );
      throw err;
    }
  }

  /**
   * Pass 1: Full Term Extraction (Legacy 3-pass for backward compatibility)
   */
  async runFullTermExtraction(act, options = {}) {
    // Use unified extraction instead of 3 sequential calls
    return this.runUnifiedTermExtraction(act, options);
  }

  /**
   * Pass 2: Narrative & Linguistic Analysis
   * Focuses on tone, pacing, and grammatical structures.
   */
  async analyzeNarrative(act, options = {}) {
    const language = act.Chapter?.Series?.language;
    if (!language || !["ja", "zh"].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const modelId = await resolveModel(options.model);
    const schema = schemas.narrative[language];

    const messages = [
      {
        role: "system",
        content: this.buildNarrativeSystemPrompt(language, act.Chapter.Series),
      },
      {
        role: "user",
        content: this.buildNarrativeUserPrompt(act),
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.3,
        max_tokens: 2000,
      });

      const result = JSON.parse(extractJson(content));

      // DEBUG: Log raw response to check if topicProminence is present
      if (language === "zh") {
        console.log(
          `[DEBUG] Raw LLM response for Chinese analysis (Act ${act.id}):`,
        );
        console.log(JSON.stringify(result.linguisticAnalysis, null, 2));
      }

      const sanitized = this.sanitizeResult(result);

      return {
        ...sanitized,
        actId: act.id,
        analyzedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(
        `Narrative analysis failed for act ${act.id}:`,
        err.message,
      );
      throw err;
    }
  }

  // --- PROMPT BUILDERS ---

  buildCharacterExtractionPrompt = (language) => {
    return `You are a precision lexicographer for ${language === "ja" ? "Japanese" : "Chinese"} web novels.
Your sole task is to extract CHARACTER NAMES for a series glossary.

STRICT EXTRACTION RULES:
1. ONLY EXTRACT CHARACTERS:
   - Include main characters, side characters, notable figures.
   - Include pets or titled entities functioning as characters.
2. EXCLUDE everything else (no locations, items, or general words).
3. FORMATTING:
   - "term": The EXACT source text (JA/ZH characters).
   - "proposedTranslation": A clear, romanized phonetic name (e.g., "Pinyin" for Chinese, "Romaji" for Japanese), properly capitalized.
   - "context": A brief English snippet of who they are without spoiling future events.
   - All descriptions MUST be in ENGLISH.`;
  };

  buildLocationOrgExtractionPrompt = (language) => {
    return `You are a precision lexicographer for ${language === "ja" ? "Japanese" : "Chinese"} web novels.
Your sole task is to extract LOCATIONS and ORGANIZATIONS for a series glossary.

STRICT EXTRACTION RULES:
1. ONLY EXTRACT LOCATIONS AND ORGANIZATIONS:
   - Locations: Cities, continents, realms, distinct geographical features, specific buildings.
   - Organizations: Sects, gangs, guilds, families, clans, empires.
2. EXCLUDE everything else (no characters, items, or concepts).
3. FORMATTING:
   - "term": The EXACT source text (JA/ZH characters).
   - "proposedTranslation": A clear literary English name (e.g., "Heavenly Sword Sect", "Azure Continent"). Combine phonetic and literal translations as appropriate for the genre.
   - "context": A brief English snippet of what it is.
   - All descriptions MUST be in ENGLISH.`;
  };

  buildItemConceptTechniqueExtractionPrompt = (language) => {
    return `You are a precision lexicographer for ${language === "ja" ? "Japanese" : "Chinese"} web novels.
Your sole task is to extract ITEMS, CONCEPTS, and TECHNIQUES for a series glossary.

STRICT EXTRACTION RULES:
1. ONLY EXTRACT ITEMS, CONCEPTS, AND TECHNIQUES:
   - Items: Weapons, artifacts, pills, currency, distinct materials.
   - Concepts: Unique world terms, societal rules, realms of cultivation/magic, special states of being.
   - Techniques: Martial arts moves, magic spells, secret arts.
2. EXCLUDE everything else (no characters, locations, or orgs).
3. FORMATTING:
   - "term": The EXACT source text (JA/ZH characters).
   - "proposedTranslation": A clear literary English name (e.g., "Nine Heavens Dragon Sword", "Qi Condensation").
   - "context": A brief English snippet of how it's used or what it means.
   - All descriptions MUST be in ENGLISH.`;
  };

  buildUnifiedExtractionPrompt = (language) => {
    return `You are a precision lexicographer for ${language === "ja" ? "Japanese" : "Chinese"} web novels.
Your task is to extract ALL RELEVANT TERMS for a series glossary in a single pass.

STRICT EXTRACTION RULES:

**CHARACTERS** (type: "character"):
- Main characters, side characters, notable figures.
- Pets or titled entities functioning as characters.

**LOCATIONS** (type: "location"):
- Cities, continents, realms, distinct geographical features, specific buildings.

**ORGANIZATIONS** (type: "organization"):
- Sects, gangs, guilds, families, clans, empires.

**ITEMS** (type: "item"):
- Weapons, artifacts, pills, currency, distinct materials.

**CONCEPTS** (type: "concept"):
- Unique world terms, societal rules, realms of cultivation/magic, special states of being.

**TECHNIQUES** (type: "technique"):
- Martial arts moves, magic spells, secret arts.

GENERAL RULES:
1. Extract ONLY the categories above. Do NOT extract generic words, common adjectives, or general dialogs.
2. For each term, assign EXACTLY ONE of the 6 types listed above.
3. Do NOT include the same term multiple times.
4. Ensure high-quality extractions with confidence ≥ 0.6.

FORMATTING:
- "term": The EXACT source text (JA/ZH characters).
- "type": One of: character, location, organization, item, concept, technique.
- "proposedTranslation": A clear, literary English translation or phonetic name (e.g., "Pinyin" for Chinese, "Romaji" for Japanese), properly capitalized.
- "context": A brief English snippet explaining what it is or how it's used.
- "confidence": Your confidence the extraction is correct (0.0-1.0, use 0.6 minimum).
- All descriptions MUST be in ENGLISH.`;
  };

  buildTermExtractionUserPrompt(act) {
    // Truncate long text
    const text = act.rawText;
    const truncated =
      text.length > 3500 ? text.substring(0, 3500) + "... [truncated]" : text;

    return `### SOURCE TEXT (EXTRACT TERMS FROM HERE ONLY)
[START]
${truncated}
[END]`;
  }

  buildNarrativeSystemPrompt(language, series) {
    const base = `You are a literary analyst specializing in ${language === "ja" ? "Japanese" : "Chinese"} narrative structure.`;

    const common = `
STRICT LANGUAGE RULE:
- ALL descriptions, meanings, and contextual explanations MUST be in English.
- Use a 0.0 to 1.0 scale for all decimal intensities/frequencies.

Series: ${series?.title || "Unknown"}
Genre: ${series?.genre || "Unknown"}`;

    if (language === "ja") {
      return `${base}
${common}
Analyze for:
1. SOV structure and verb-last suspense.
2. Pro-drop (subject omission) markers.
3. Onomatopoeia (Gitaigo/Giseigo) textures.
4. Honorifics (Keigo) and social hierarchy.
5. Internal thoughts (Maru-kakko).`;
    } else {
      return `${base}
${common}
Analyze for:
1. Topic Prominence (Topic-Comment structure) and foregrounding.
2. Face (面子) dynamics and social shame.
3. Pacing (Kuai/Man rhythm).
4. Four-character idioms (Chengyu).
5. Jianghu elements (Martial arts, cultivation).`;
    }
  }

  buildNarrativeUserPrompt(act) {
    const context = [];
    if (act.Chapter?.Series?.title)
      context.push(`Series: ${act.Chapter.Series.title}`);
    if (act.Chapter?.title)
      context.push(`Chapter ${act.Chapter.number}: ${act.Chapter.title}`);
    context.push(`Act: ${act.label}`);

    const text = act.rawText;
    const truncated =
      text.length > 3000 ? text.substring(0, 3000) + "... [truncated]" : text;

    return `### CONTEXT
${context.join("\n")}

### SOURCE TEXT
[START]
${truncated}
[END]

Analyze the narrative profile and linguistic markers of the source text above.`;
  }

  /**
   * Sanitizes and normalizes numerical values from LLM response
   */
  sanitizeResult(result) {
    if (!result) return result;

    const normalize = (val) => {
      if (typeof val !== "number") return val;
      if (val > 1) {
        if (val > 100) return val / 1000;
        return val / 100;
      }
      if (val < 0) return 0;
      return val;
    };

    // Fields to normalize (Narrative Analysis)
    if (result.narrativeAnalysis) {
      const na = result.narrativeAnalysis;
      if (na.emotionalIntensity !== undefined)
        na.emotionalIntensity = normalize(na.emotionalIntensity);
      if (na.emotionalTone?.intensity !== undefined)
        na.emotionalTone.intensity = normalize(na.emotionalTone.intensity);
      if (na.emotionalExpression?.intensity !== undefined)
        na.emotionalExpression.intensity = normalize(
          na.emotionalExpression.intensity,
        );
    }

    // Fields to normalize (Linguistic Analysis)
    if (result.linguisticAnalysis) {
      const la = result.linguisticAnalysis;
      if (la.proDrop?.frequency !== undefined)
        la.proDrop.frequency = normalize(la.proDrop.frequency);
      if (la.topicProminence?.frequency !== undefined)
        la.topicProminence.frequency = normalize(la.topicProminence.frequency);
      if (la.internalMonologue?.ratio !== undefined)
        la.internalMonologue.ratio = normalize(la.internalMonologue.ratio);
    }

    // Term extraction confidence
    if (result.extractedTerms && Array.isArray(result.extractedTerms)) {
      result.extractedTerms.forEach((term) => {
        if (term.confidence !== undefined)
          term.confidence = normalize(term.confidence);
      });
    }

    return result;
  }
}

module.exports = new AnalysisService();
