/**
 * JSON schemas for OpenAI/LM Studio structured output
 * Split into Term Extraction and Narrative Analysis passes
 * Restored from the development branch of the NovelTranslatorApp repo.
 */

// --- TERM EXTRACTION PASS --- (Unified Pass)
const unifiedTermExtractionSchema = {
  type: "json_schema",
  json_schema: {
    name: "unified_term_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        extractedTerms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              term: { type: "string" },
              type: {
                enum: [
                  "character",
                  "location",
                  "organization",
                  "item",
                  "concept",
                  "technique",
                ],
              },
              context: { type: "string" },
              definition: { type: "string" },
              proposedTranslation: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: [
              "term",
              "type",
              "context",
              "definition",
              "proposedTranslation",
              "confidence",
            ],
          },
        },
      },
      required: ["extractedTerms"],
    },
  },
};

// --- JAPANESE NARRATIVE ANALYSIS ---
const japaneseNarrativeSchema = {
  type: "json_schema",
  json_schema: {
    name: "japanese_narrative_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        linguisticAnalysis: {
          type: "object",
          properties: {
            language: { const: "ja" },
            sentenceStructure: { enum: ["SOV", "SVO", "mixed"] },
            proDrop: {
              type: "object",
              properties: {
                frequency: { type: "number", minimum: 0, maximum: 1 },
                agentOmission: { type: "boolean" },
                examples: { type: "array", items: { type: "string" } },
              },
              required: ["frequency", "agentOmission", "examples"],
            },
            onomatopoeia: {
              type: "object",
              properties: {
                gitaigo: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      term: { type: "string" },
                      meaning: { type: "string" },
                      context: { type: "string" },
                      emotionalWeight: {
                        enum: ["neutral", "negative", "positive"],
                      },
                    },
                  },
                },
                density: { enum: ["none", "low", "medium", "high"] },
              },
            },
            honorifics: {
              type: "object",
              properties: {
                system: { const: "keigo" },
                hierarchicalLanguage: { type: "boolean" },
                density: { enum: ["none", "low", "medium", "high"] },
              },
            },
            internalMonologue: {
              type: "object",
              properties: {
                format: { enum: ["maru_kakko", "kagi_kakko", "none"] },
                ratio: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
          required: [
            "language",
            "sentenceStructure",
            "onomatopoeia",
            "proDrop",
          ],
        },
        narrativeAnalysis: {
          type: "object",
          properties: {
            summary: { type: "string" },
            kokyu: {
              type: "object",
              properties: {
                pattern: {
                  enum: [
                    "suspense_building",
                    "quick_burst",
                    "lingering",
                    "staccato",
                  ],
                },
                avgSentenceLength: { type: "integer" },
              },
              required: ["pattern", "avgSentenceLength"],
            },
            emotionalTone: {
              type: "object",
              properties: {
                primary: { type: "string" },
                intensity: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["primary", "intensity"],
            },
            powerDynamic: {
              type: "object",
              properties: {
                type: {
                  enum: [
                    "sempai_kohai",
                    "master_servant",
                    "family",
                    "romantic",
                    "none",
                  ],
                },
              },
            },
          },
          required: ["summary", "emotionalTone", "kokyu"],
        },
      },
      required: ["linguisticAnalysis", "narrativeAnalysis"],
    },
  },
};

// --- CHINESE NARRATIVE ANALYSIS ---
const chineseNarrativeSchema = {
  type: "json_schema",
  json_schema: {
    name: "chinese_narrative_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        linguisticAnalysis: {
          type: "object",
          properties: {
            language: { const: "zh" },
            sentenceStructure: { enum: ["Topic-Comment", "SVO", "classical"] },
            topicProminence: {
              type: "object",
              properties: {
                frequency: { type: "number", minimum: 0, maximum: 1 },
                examples: { type: "array", items: { type: "string" } },
              },
              required: ["frequency", "examples"],
            },
            fourCharacterIdioms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  idiom: { type: "string" },
                  meaning: { type: "string" },
                },
              },
            },
            onomatopoeia: {
              type: "object",
              properties: {
                density: { enum: ["none", "low", "medium", "high"] },
              },
            },
          },
          required: ["language", "sentenceStructure", "topicProminence"],
        },
        narrativeAnalysis: {
          type: "object",
          properties: {
            summary: { type: "string" },
            kuaiMan: {
              type: "object",
              properties: {
                dominantPattern: { enum: ["kuai", "man", "alternating"] },
              },
              required: ["dominantPattern"],
            },
            faceSystem: {
              type: "object",
              properties: {
                faceThreatPresent: { type: "boolean" },
              },
            },
            emotionalExpression: {
              type: "object",
              properties: {
                directness: { enum: ["direct", "implied", "physiological"] },
                primary: { type: "string" },
                intensity: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["directness", "primary", "intensity"],
            },
          },
          required: ["summary", "faceSystem", "kuaiMan", "emotionalExpression"],
        },
      },
      required: ["linguisticAnalysis", "narrativeAnalysis"],
    },
  },
};

module.exports = {
  terms: {
    unified: unifiedTermExtractionSchema,
  },
  narrative: {
    ja: japaneseNarrativeSchema,
    zh: chineseNarrativeSchema,
  },
};
