const { resolveModel } = require("./resolveModel");
const { extractJson, countWords } = require("./utils");
const llmClient = require("./llmClient");
const { Act, SubAct, Analysis, Chapter, Series } = require("../models");
const TextMetrics = require("../utils/textMetrics");
const schemas = require("./analysisSchemas");

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

    // Extract base label (e.g., "1" from "1a", "1" from "1B")
    const label = String(targetAct.label || "");
    const baseLabel = label.replace(/[a-zA-Z]$/, ""); // Remove suffix (case-insensitive)

    if (!baseLabel || baseLabel === label) {
      // No grouping detected (no letter suffix), return just this act
      return [actId];
    }

    // Find all acts with same base label
    const groupActs = allChapterActs.filter((a) => {
      const aLabel = String(a.label || "");
      const aBaseLabel = aLabel.replace(/[a-zA-Z]$/, "");
      return aBaseLabel === baseLabel;
    });

    // Return group members sorted by sequence
    return groupActs.sort((a, b) => a.sequence - b.sequence).map((a) => a.id);
  }

  /**
   * Analyze an Act (and its constituent SubActs)
   * Stores analysis in the Analysis table with segment-specific guidance
   * @param {number} actId - The ID of the Act to analyze
   * @param {Object} options - { model }
   */
  async analyzeAct(actId, options = {}) {
    const act = await Act.findByPk(actId, {
      include: [
        { model: SubAct, as: "SubActs", order: [["sequence", "ASC"]] },
        {
          model: Chapter,
          as: "Chapter",
          include: [{ model: Series, as: "Series" }],
        },
      ],
    });

    if (!act) throw new Error("Act not found");

    // Concatenate all sub-act texts for holistic analysis
    // Fall back to act.rawText if SubActs don't exist or are empty
    let fullText;
    if (act.SubActs && act.SubActs.length > 0) {
      fullText = act.SubActs.map((s) => s.rawText).join("\n\n");
    } else {
      if (!act.rawText) {
        throw new Error(
          `Act ${act.id} has no SubActs and no rawText available`,
        );
      }
      fullText = act.rawText;
      console.log(
        `[Analysis] No SubActs for Act ${act.label}, using act.rawText`,
      );
    }

    const language = act.Chapter?.Series?.language || "zh";

    console.log(
      `[Analysis] Analyzing Act ${act.label} (${TextMetrics.countUnits(fullText, language)} units, ${act.SubActs?.length || 0} subacts)`,
    );

    const modelId = await resolveModel(options.model);
    const schema = schemas.narrative[language];

    // Add segment count to prompt to get per-segment guidance
    const messages = [
      {
        role: "system",
        content: this.buildNarrativeSystemPrompt(
          language,
          act.Chapter.Series,
          act.SubActs?.length || 1,
        ),
      },
      {
        role: "user",
        content: this.buildNarrativeUserPrompt(act, fullText),
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.3,
        max_tokens: 2500,
      });

      const result = JSON.parse(extractJson(content));
      const sanitized = this.sanitizeResult(result);

      // Extract only narrative and linguistic analysis to store in anatomyProfile
      const anatomyProfile = {
        narrative: sanitized.narrativeAnalysis,
        linguistic: sanitized.linguisticAnalysis,
      };

      // Save to Analysis table
      const [analysis, created] = await Analysis.findOrCreate({
        where: { actId: act.id },
        defaults: {
          actId: act.id,
          anatomyProfile: anatomyProfile,
          scope: "act",
        },
      });

      if (!created) {
        await analysis.update({
          anatomyProfile: anatomyProfile,
          updatedAt: new Date(),
        });
      }

      await act.update({ status: "analyzed" });

      return sanitized;
    } catch (err) {
      console.error(`[Analysis] Failed for act ${act.id}:`, err.message);
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
   * Extract terms from a single SubAct
   */
  async extractTermsFromSubAct(subActId, options = {}) {
    const subAct = await SubAct.findByPk(subActId, {
      include: [
        {
          model: Act,
          as: "Act",
          include: [
            {
              model: Chapter,
              as: "Chapter",
              include: [{ model: Series, as: "Series" }],
            },
          ],
        },
      ],
    });

    if (!subAct) throw new Error("SubAct not found");

    const language = subAct.Act.Chapter.Series.language || "zh";
    const series = subAct.Act.Chapter.Series;

    console.log(
      `[Extraction] Extracting terms from SubAct ${subAct.id} (${TextMetrics.countUnits(subAct.rawText, language)} units)`,
    );

    const modelId = await resolveModel(options.model);

    const messages = [
      {
        role: "system",
        content: this.buildUnifiedExtractionPrompt(language),
      },
      {
        role: "user",
        content: `### SOURCE TEXT\n[START]\n${subAct.rawText}\n[END]`,
      },
    ];

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages,
        response_format: schemas.terms.unified,
        temperature: 0.1,
        max_tokens: 2000,
      });

      // Better error handling for JSON parsing
      let extractedJson;
      try {
        extractedJson = extractJson(content);
        const parsed = JSON.parse(extractedJson);
        const rawTerms = parsed.extractedTerms || [];

        const sanitized = this.sanitizeResult({
          extractedTerms: rawTerms,
        }).extractedTerms;

        // Process with GlossaryProcessingService (deduplication/identification)
        const glossaryProcessing = require("./glossaryProcessing");
        const { candidates, approvedCount } =
          await glossaryProcessing.identifyTerms(sanitized, subAct, series);

        return {
          subActId: subAct.id,
          candidates,
          approvedCount,
          rawCount: rawTerms.length,
        };
      } catch (jsonErr) {
        // Log the problematic content for debugging
        console.error(`[Extraction] JSON parse error for SubAct ${subActId}:`);
        console.error(`  Error: ${jsonErr.message}`);
        console.error(`  Extracted JSON length: ${extractedJson?.length || 0}`);
        console.error(
          `  First 200 chars: ${extractedJson?.substring(0, 200) || "N/A"}`,
        );
        console.error(
          `  Last 200 chars: ${extractedJson?.substring(-200) || "N/A"}`,
        );

        // Try simpler fallback extraction
        console.log(`[Extraction] Attempting simpler fallback extraction...`);
        try {
          const fallbackTerms = await this.fallbackSimpleExtraction(
            subAct.rawText,
            language,
            modelId,
          );
          const glossaryProcessing = require("./glossaryProcessing");
          const { candidates, approvedCount } =
            await glossaryProcessing.identifyTerms(
              fallbackTerms,
              subAct,
              series,
            );

          return {
            subActId: subAct.id,
            candidates,
            approvedCount,
            rawCount: fallbackTerms.length,
            method: "fallback",
          };
        } catch (fallbackErr) {
          console.error(
            `[Extraction] Fallback extraction also failed: ${fallbackErr.message}`,
          );
          // Return empty candidates for this subact
          return {
            subActId: subAct.id,
            candidates: [],
            approvedCount: 0,
            rawCount: 0,
            error: `Both extraction methods failed: ${jsonErr.message}`,
          };
        }
      }
    } catch (err) {
      console.error(`[Extraction] Failed for subAct ${subActId}:`, err.message);
      // Return empty candidates instead of throwing
      return {
        subActId: subAct.id,
        candidates: [],
        approvedCount: 0,
        rawCount: 0,
        error: err.message,
      };
    }
  }

  /**
   * Fallback simpler extraction - just extract term names without complex schema
   * Used when full extraction fails due to JSON parsing errors
   */
  async fallbackSimpleExtraction(rawText, language, modelId) {
    const simplePrompt = `Extract the most important proper nouns (characters, locations, organizations, items, concepts, techniques) from the following ${language === "ja" ? "Japanese" : "Chinese"} text. 
Return ONLY a JSON object with an "terms" array containing objects with "term" (exact source text) and "type" (character/location/organization/item/concept/technique) fields, nothing else.

Text:
${rawText.substring(0, 2000)}`;

    try {
      const content = await llmClient.chatCompletion({
        model: modelId,
        messages: [{ role: "user", content: simplePrompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const json = extractJson(content);
      const parsed = JSON.parse(json);
      const terms = parsed.terms || [];

      // Convert simple format to extraction format
      return terms.map((t) => ({
        term: t.term,
        type: t.type || "concept",
        proposedTranslation: t.term, // Fallback to term itself
        context: "Extracted via fallback method",
        confidence: 0.5, // Lower confidence for fallback
      }));
    } catch (err) {
      console.error(`[Extraction] Fallback extraction failed: ${err.message}`);
      return []; // Return empty array if even fallback fails
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

  buildNarrativeSystemPrompt(language, series, segmentCount = 1) {
    const base = `You are a senior literary analyst specializing in ${language === "ja" ? "Japanese" : "Chinese"} narrative structure.`;

    const common = `
STRICT LANGUAGE RULE:
- ALL descriptions, meanings, and contextual explanations MUST be in English.
- Use a 0.0 to 1.0 scale for all decimal intensities/frequencies.

Series: ${series?.title || "Unknown"}
Genre: ${series?.genre || "Unknown"}

SEGMENT GUIDANCE:
The provided text consists of ${segmentCount} segments (SubActs). 
Your analysis MUST include a "segmentGuidance" object in your anatomyProfile, where each key is the 1-based segment sequence (e.g., "1", "2") and the value contains:
- "tone": Specific tone for this segment.
- "pacing": Specific pacing (slow, fast, urgent).
- "focus": Primary narrative focus.
`;

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

  buildNarrativeUserPrompt(act, fullText) {
    const context = [];
    if (act.Chapter?.Series?.title)
      context.push(`Series: ${act.Chapter.Series.title}`);
    if (act.Chapter?.title)
      context.push(`Chapter ${act.Chapter.number}: ${act.Chapter.title}`);
    context.push(`Act: ${act.label}`);

    const truncated =
      fullText.length > 8000
        ? fullText.substring(0, 8000) + "... [truncated]"
        : fullText;

    return `### CONTEXT
${context.join("\n")}

### SOURCE TEXT (INCLUDING SUB-ACTS)
[START]
${truncated}
[END]

Analyze the narrative profile and provide specific guidance for each of the segments within this Act.`;
  }

  /**
   * Analyze a group of Acts together (e.g., 1A, 1B)
   * Returns analysis results for each act in the group
   */
  async analyzeActGroup(acts, options = {}) {
    const results = {
      analyzed: [],
      failed: [],
      termsFound: [],
    };

    for (const act of acts) {
      try {
        // Analyze this act (gets tone for whole act + all SubActs)
        const analysis = await this.analyzeAct(act.id, options);
        results.analyzed.push({
          actId: act.id,
          label: act.label,
          analysis,
        });
      } catch (err) {
        console.error(`[Analysis] Failed for act ${act.id}:`, err.message);
        results.failed.push({
          actId: act.id,
          error: err.message,
        });
      }
    }

    return results;
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
