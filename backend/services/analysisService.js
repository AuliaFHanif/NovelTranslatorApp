const OpenAI = require("openai");
const schemas = require("./analysisSchemas");
const { resolveModel } = require("./resolveModel");

function extractJson(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

class AnalysisService {
  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LM_STUDIO_URL || "http://localhost:1234/v1",
      apiKey: "lm-studio",
      timeout: 900000, // 15 minutes for heavy analysis
    });
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
      const response = await this.client.chat.completions.create({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.1, // Lower temperature for more stable extraction
        max_tokens: 1500,
      });

      const result = JSON.parse(
        extractJson(response.choices[0].message.content),
      );
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
      const response = await this.client.chat.completions.create({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.3,
        max_tokens: 2000,
      });

      const result = JSON.parse(
        extractJson(response.choices[0].message.content),
      );

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
