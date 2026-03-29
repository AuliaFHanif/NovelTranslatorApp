/**
 * JSON schemas for OpenAI/LM Studio structured output
 * Different schemas for Japanese vs Chinese analysis
 */

const japaneseSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'japanese_literary_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        // GLOSSARY EXTRACTION
        extractedTerms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              type: { enum: ['character', 'location', 'organization', 'item', 'concept', 'technique'] },
              context: { type: 'string' },
              proposedTranslation: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['term', 'type', 'context', 'proposedTranslation']
          }
        },

        // JAPANESE LINGUISTIC ANALYSIS
        linguisticAnalysis: {
          type: 'object',
          properties: {
            language: { const: 'ja' },
            sentenceStructure: { enum: ['SOV', 'SVO', 'mixed'] },

            proDrop: {
              type: 'object',
              properties: {
                frequency: { type: 'number', minimum: 0, maximum: 1 },
                agentOmission: { type: 'boolean' },
                examples: { type: 'array', items: { type: 'string' } }
              }
            },

            onomatopoeia: {
              type: 'object',
              properties: {
                gitaigo: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      term: { type: 'string' },
                      meaning: { type: 'string' },
                      context: { type: 'string' },
                      emotionalWeight: { enum: ['neutral', 'negative', 'positive'] }
                    }
                  }
                },
                giseigo: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      term: { type: 'string' },
                      meaning: { type: 'string' },
                      context: { type: 'string' }
                    }
                  }
                },
                density: { enum: ['none', 'low', 'medium', 'high'] }
              }
            },

            honorifics: {
              type: 'object',
              properties: {
                system: { const: 'keigo' },
                types: { type: 'array', items: { type: 'string' } },
                statusMarkers: { type: 'array', items: { type: 'string' } },
                hierarchicalLanguage: { type: 'boolean' },
                density: { enum: ['none', 'low', 'medium', 'high'] }
              }
            },

            taigenTome: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
                examples: { type: 'array', items: { type: 'string' } },
                emotionalFunction: { enum: ['objectification', 'suspense', 'emphasis', 'freeze_frame'] }
              }
            },

            sentenceEndingParticles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  particle: { type: 'string' },
                  frequency: { type: 'integer' },
                  genderTone: { enum: ['feminine', 'masculine', 'neutral', 'archaic'] }
                }
              }
            },

            internalMonologue: {
              type: 'object',
              properties: {
                format: { enum: ['maru_kakko', 'kagi_kakko', 'none'] },
                ratio: { type: 'number', minimum: 0, maximum: 1 },
                closeness: { enum: ['distant', 'close', 'intimate'] }
              }
            }
          },
          required: ['language', 'sentenceStructure', 'onomatopoeia', 'honorifics']
        },

        // NARRATIVE ANALYSIS
        narrativeAnalysis: {
          type: 'object',
          properties: {
            kokyu: {
              type: 'object',
              properties: {
                pattern: { enum: ['suspense_building', 'quick_burst', 'lingering', 'staccato'] },
                avgSentenceLength: { type: 'integer' },
                subordinateClauses: { type: 'number' }
              }
            },

            emotionalTone: {
              type: 'object',
              properties: {
                primary: { type: 'string' },
                intensity: { type: 'number', minimum: 0, maximum: 1 },
                enryo: { type: 'boolean' },
                amae: { type: 'boolean' }
              }
            },

            powerDynamic: {
              type: 'object',
              properties: {
                type: { enum: ['sempai_kohai', 'master_servant', 'family', 'romantic', 'none'] },
                explicitness: { enum: ['explicit', 'implicit', 'contextual'] }
              }
            },

            pacingPattern: { enum: ['kuai', 'man', 'mixed'] },
            emotionalIntensity: { type: 'number', minimum: 0, maximum: 1 },
            primaryEmotion: { type: 'string' }
          },
          required: ['pacingPattern', 'emotionalIntensity', 'primaryEmotion', 'emotionalTone']
        }
      },
      required: ['extractedTerms', 'linguisticAnalysis', 'narrativeAnalysis']
    }
  }
};

const chineseSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'chinese_literary_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        extractedTerms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              type: { enum: ['character', 'location', 'organization', 'item', 'concept', 'technique'] },
              context: { type: 'string' },
              proposedTranslation: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['term', 'type', 'context', 'proposedTranslation']
          }
        },

        linguisticAnalysis: {
          type: 'object',
          properties: {
            language: { const: 'zh' },
            sentenceStructure: { enum: ['Topic-Comment', 'SVO', 'classical'] },

            topicProminence: {
              type: 'object',
              properties: {
                frequency: { type: 'number', minimum: 0, maximum: 1 },
                examples: { type: 'array', items: { type: 'string' } }
              }
            },

            fourCharacterIdioms: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  idiom: { type: 'string' },
                  literalMeaning: { type: 'string' },
                  contextualMeaning: { type: 'string' },
                  preserve: { type: 'boolean' }
                }
              }
            },

            onomatopoeia: {
              type: 'object',
              properties: {
                types: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      term: { type: 'string' },
                      pinyin: { type: 'string' },
                      category: { enum: ['sound', 'motion', 'emotion'] }
                    }
                  }
                },
                density: { enum: ['none', 'low', 'medium', 'high'] }
              }
            },

            statusLanguage: {
              type: 'object',
              properties: {
                selfDeprecating: { type: 'array', items: { type: 'string' } },
                elevatingOther: { type: 'array', items: { type: 'string' } },
                arrogant: { type: 'array', items: { type: 'string' } }
              }
            },

            rhetoricalDevices: {
              type: 'object',
              properties: {
                parallelism: { type: 'boolean' },
                antithesis: { type: 'boolean' },
                exaggeration: { type: 'boolean' }
              }
            }
          },
          required: ['language', 'sentenceStructure', 'onomatopoeia']
        },

        narrativeAnalysis: {
          type: 'object',
          properties: {
            kuaiMan: {
              type: 'object',
              properties: {
                dominantPattern: { enum: ['kuai', 'man', 'alternating'] },
                kuaiTriggers: { type: 'array', items: { type: 'string' } },
                manTriggers: { type: 'array', items: { type: 'string' } }
              }
            },

            faceSystem: {
              type: 'object',
              properties: {
                faceThreatPresent: { type: 'boolean' },
                lossOfFaceEvents: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { enum: ['public_shame', 'defeat', 'betrayal', 'humiliation'] },
                      severity: { enum: ['minor', 'moderate', 'severe'] },
                      physiologicalMarkers: {
                        type: 'array',
                        items: { enum: ['coughing_blood', 'sucking_cold_air', 'pale_face', 'trembling_hands', 'spitting_blood'] }
                      }
                    }
                  }
                }
              }
            },

            filialPiety: {
              type: 'object',
              properties: {
                present: { type: 'boolean' },
                relationshipType: { enum: ['shifu_disciple', 'parent_child', 'emperor_subject', 'sect_leader_member', 'none'] },
                twisted: { type: 'boolean' },
                obedienceLevel: { enum: ['willing', 'coerced', 'brainwashed', 'rebellious'] }
              }
            },

            jianghu: {
              type: 'object',
              properties: {
                present: { type: 'boolean' },
                martialArtsTerms: { type: 'array', items: { type: 'string' } },
                cultivationStages: { type: 'array', items: { type: 'string' } }
              }
            },

            emotionalExpression: {
              type: 'object',
              properties: {
                directness: { enum: ['direct', 'implied', 'physiological'] },
                primary: { type: 'string' },
                intensity: { type: 'number', minimum: 0, maximum: 1 }
              }
            },

            pacingPattern: { enum: ['kuai', 'man', 'mixed'] },
            emotionalIntensity: { type: 'number', minimum: 0, maximum: 1 },
            primaryEmotion: { type: 'string' }
          },
          required: ['pacingPattern', 'emotionalIntensity', 'primaryEmotion', 'faceSystem']
        }
      },
      required: ['extractedTerms', 'linguisticAnalysis', 'narrativeAnalysis']
    }
  }
};

module.exports = {
  ja: japaneseSchema,
  zh: chineseSchema
};
