# Phase 3: Lexicographer-Anatomist - Complete Implementation Guide
## For AI Agent Implementation

---

## TABLE OF CONTENTS
1. [Overview](#1-overview)
2. [Database Changes](#2-database-changes)
3. [Service Layer](#3-service-layer)
4. [Controller Layer](#4-controller-layer)
5. [Routes](#5-routes)
6. [Integration](#6-integration)
7. [Testing](#7-testing)
8. [Environment Setup](#8-environment-setup)

---

## 1. OVERVIEW

### What Phase 3 Does
Extracts glossary terms AND performs linguistic/narrative analysis in a single AI call per act:

1. **Glossary Extraction** - Characters, locations, items, concepts with translations
2. **Linguistic Analysis** - Language-specific features (SOV/Topic-Comment, onomatopoeia, honorifics)
3. **Narrative Analysis** - Pacing, emotion, power dynamics, cultural context
4. **Strategy Generation** - Two-tier system (chapter-level style + act-level scene emotion)

### Input
- Acts with `status: 'ready'` (from Phase 2)
- Series metadata (language, genre, description)

### Output
- `GlossaryEntry` records (status: `pending_review`)
- `Act.anatomicalProfile` (JSONB)
- `Act.translationStrategy.actLevel` (JSONB)
- `Chapter.translationStrategy.chapterLevel` (JSONB, aggregated)
- Acts updated to `status: 'analyzed'`

### Data Flow
```
Chapter with Acts (status: ready)
    ↓
[For each Act]
    ↓
Combined AI Analysis (language-specific schema)
    ├─► Extracted Terms ──► Merge with existing glossary
    ├─► Linguistic Profile ──► Act.anatomicalProfile
    └─► Narrative Profile ──► Act-level strategy
    ↓
[After all acts]
    ↓
Aggregate strategies ──► Chapter-level strategy
    ↓
Chapter.status = 'analyzed'
```

---

## 2. DATABASE CHANGES

### 2.1 Create Migration for Glossary Tables

**File:** `backend/migrations/XXXX-create-glossary.js`

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Glossaries table (categories)
    await queryInterface.createTable('Glossaries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('character', 'location', 'item', 'concept'),
        allowNull: false
      },
      languageNotes: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // GlossaryEntries table (actual terms)
    await queryInterface.createTable('GlossaryEntries', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      seriesId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Series',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      glossaryId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Glossaries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      // Term data
      termJa: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      termZh: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      termEn: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('character', 'location', 'item', 'concept'),
        allowNull: false
      },
      definition: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Scoping
      scope: {
        type: Sequelize.ENUM('series', 'chapter', 'act'),
        defaultValue: 'act'
      },
      scopeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'ID of series/chapter/act depending on scope'
      },
      // Provenance tracking
      provenance: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of appearances with context'
      },
      // Metadata
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'variants, aliases, pronunciation, etc.'
      },
      confidence: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      // Workflow
      status: {
        type: Sequelize.ENUM('pending_review', 'approved', 'rejected', 'deprecated'),
        defaultValue: 'pending_review'
      },
      approvedBy: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Indexes
    await queryInterface.addIndex('GlossaryEntries', ['seriesId', 'type']);
    await queryInterface.addIndex('GlossaryEntries', ['seriesId', 'termJa']);
    await queryInterface.addIndex('GlossaryEntries', ['seriesId', 'termZh']);
    await queryInterface.addIndex('GlossaryEntries', ['scope', 'scopeId']);
    await queryInterface.addIndex('GlossaryEntries', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('GlossaryEntries');
    await queryInterface.dropTable('Glossaries');
  }
};
```

### 2.2 Update Act Model (Add Analysis Fields)

**Migration:** `backend/migrations/XXXX-add-anatomy-to-acts.js`

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Acts', 'anatomicalProfile', {
      type: Sequelize.JSONB,
      allowNull: true
    });

    await queryInterface.addColumn('Acts', 'translationStrategy', {
      type: Sequelize.JSONB,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Acts', 'anatomicalProfile');
    await queryInterface.removeColumn('Acts', 'translationStrategy');
  }
};
```

### 2.3 Update Chapter Model (Add Strategy)

**Migration:** `backend/migrations/XXXX-add-strategy-to-chapters.js`

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Chapters', 'translationStrategy', {
      type: Sequelize.JSONB,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Chapters', 'translationStrategy');
  }
};
```

### 2.4 Create Models

**File:** `backend/models/glossary.js`

```javascript
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Glossary extends Model {
    static associate(models) {
      Glossary.hasMany(models.GlossaryEntry, {
        foreignKey: 'glossaryId',
        as: 'Entries'
      });
    }
  }

  Glossary.init({
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('character', 'location', 'item', 'concept'),
      allowNull: false
    },
    languageNotes: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    sequelize,
    modelName: 'Glossary',
    tableName: 'Glossaries'
  });

  return Glossary;
};
```

**File:** `backend/models/glossaryentry.js`

```javascript
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GlossaryEntry extends Model {
    static associate(models) {
      GlossaryEntry.belongsTo(models.Series, {
        foreignKey: 'seriesId',
        as: 'Series'
      });

      GlossaryEntry.belongsTo(models.Glossary, {
        foreignKey: 'glossaryId',
        as: 'Glossary'
      });
    }

    // Helper to get term based on language
    getTerm(language) {
      if (language === 'ja') return this.termJa;
      if (language === 'zh') return this.termZh;
      return this.termEn;
    }
  }

  GlossaryEntry.init({
    seriesId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    glossaryId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    termJa: DataTypes.STRING(255),
    termZh: DataTypes.STRING(255),
    termEn: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('character', 'location', 'item', 'concept'),
      allowNull: false
    },
    definition: DataTypes.TEXT,
    scope: {
      type: DataTypes.ENUM('series', 'chapter', 'act'),
      defaultValue: 'act'
    },
    scopeId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    provenance: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    confidence: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0
    },
    status: {
      type: DataTypes.ENUM('pending_review', 'approved', 'rejected', 'deprecated'),
      defaultValue: 'pending_review'
    },
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'GlossaryEntry',
    tableName: 'GlossaryEntries'
  });

  return GlossaryEntry;
};
```

### 2.5 Update Act Model

**File:** `backend/models/act.js` (add fields)

```javascript
// Add to Act.init():
anatomicalProfile: {
  type: DataTypes.JSONB,
  allowNull: true
},
translationStrategy: {
  type: DataTypes.JSONB,
  allowNull: true
}
```

### 2.6 Update Chapter Model

**File:** `backend/models/chapter.js` (add field)

```javascript
// Add to Chapter.init():
translationStrategy: {
  type: DataTypes.JSONB,
  allowNull: true
}
```

Run migrations:
```bash
npx sequelize-cli db:migrate
```

---

## 3. SERVICE LAYER

Create directory: `backend/services/` (if not exists)

### 3.1 Language-Specific Analysis Schemas

**File:** `backend/services/analysisSchemas.js`

```javascript
/**
 * JSON schemas for structured output based on source language
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
              type: { enum: ['character', 'location', 'item', 'concept'] },
              context: { type: 'string' },
              proposedTranslation: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['term', 'type', 'context', 'proposedTranslation']
          }
        },

        // JAPANESE-SPECIFIC LINGUISTIC ANALYSIS
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
                gitaigo: {  // State/condition sounds
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
                giseigo: {  // Actual sounds
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

            taigenTome: {  // Noun-ending sentences
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
          required: ['language', 'sentenceStructure']
        },

        // JAPANESE-SPECIFIC NARRATIVE ANALYSIS
        narrativeAnalysis: {
          type: 'object',
          properties: {
            kokyu: {  // Narrative breath
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
                enryo: { type: 'boolean' },  // Restraint
                amae: { type: 'boolean' }     // Indulgent dependence
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
          required: ['pacingPattern', 'emotionalIntensity', 'primaryEmotion']
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
        // GLOSSARY (same structure)
        extractedTerms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              type: { enum: ['character', 'location', 'item', 'concept'] },
              context: { type: 'string' },
              proposedTranslation: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['term', 'type', 'context', 'proposedTranslation']
          }
        },

        // CHINESE-SPECIFIC LINGUISTIC ANALYSIS
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

            fourCharacterIdioms: {  // Chengyu
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
          required: ['language', 'sentenceStructure']
        },

        // CHINESE-SPECIFIC NARRATIVE ANALYSIS
        narrativeAnalysis: {
          type: 'object',
          properties: {
            kuaiMan: {  // Fast-slow rhythm
              type: 'object',
              properties: {
                dominantPattern: { enum: ['kuai', 'man', 'alternating'] },
                kuaiTriggers: { type: 'array', items: { type: 'string' } },
                manTriggers: { type: 'array', items: { type: 'string' } }
              }
            },

            faceSystem: {  // Mianzi
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

            filialPiety: {  // Xiao
              type: 'object',
              properties: {
                present: { type: 'boolean' },
                relationshipType: { enum: ['shifu_disciple', 'parent_child', 'emperor_subject', 'sect_leader_member', 'none'] },
                twisted: { type: 'boolean' },
                obedienceLevel: { enum: ['willing', 'coerced', 'brainwashed', 'rebellious'] }
              }
            },

            jianghu: {  // Wuxia world
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
          required: ['pacingPattern', 'emotionalIntensity', 'primaryEmotion']
        }
      },
      required: ['extractedTerms', 'linguisticAnalysis', 'narrativeAnalysis']
    }
  }
};

module.exports = {
  japanese: japaneseSchema,
  chinese: chineseSchema
};
```

### 3.2 Combined Analysis Service

**File:** `backend/services/combinedAnalysis.js`

```javascript
const OpenAI = require('openai');
const schemas = require('./analysisSchemas');

class CombinedAnalysisService {
  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
      apiKey: 'lm-studio'
    });
    this.model = process.env.LM_STUDIO_MODEL || 'default';
  }

  async analyze(act, series) {
    const language = series.language;
    const schema = language === 'ja' ? schemas.japanese : schemas.chinese;
    const systemPrompt = this.buildSystemPrompt(language, series);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(act, series) }
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: schema,
        temperature: 0.3,
        max_tokens: 2000
      });

      const result = JSON.parse(response.choices[0].message.content);

      // Add metadata
      result.language = language;
      result.actId = act.id;
      result.analyzedAt = new Date().toISOString();

      return result;
    } catch (err) {
      console.error('Analysis failed:', err);
      throw err;
    }
  }

  buildSystemPrompt(language, series) {
    const basePrompt = `You are a literary analysis engine for ${language === 'ja' ? 'Japanese' : 'Chinese'} web novels.`;

    if (language === 'ja') {
      return `${basePrompt}

Key features to identify:

1. SOV STRUCTURE (Subject-Object-Verb)
   - Verb comes LAST, creating cognitive suspense
   - Note sentences delaying verb for dramatic effect

2. PRO-DROP (Subject Omission)
   - High frequency = focus on victim/object, not perpetrator
   - Creates "invisible agency" effect

3. ONOMATOPOEIA
   - gitaigo (states): dampness, trembling, glare
   - giseigo (sounds): actual auditory words
   - Provide sensory texture - do not discard

4. KEIGO (Honorifics)
   - san, sama, kun, chan = social distance
   - First-person pronouns: ore-sama (arrogant), watakushi (humble)
   - Hierarchical speech = power dynamics

5. TAIGEN-TOME (Noun endings)
   - Sentences ending in nouns = "freeze frame" objectification
   - Example: "壊れた人形のように。" (Like a broken doll.)

6. MARU-KAKKO ()
   - Parentheses = internal monologue not spoken aloud
   - Different from spoken dialogue ""
   - Preserve this interiority

Extract glossary terms and analyze all linguistic/narrative features.`;
    } else {
      return `${basePrompt}

Key features to identify:

1. TOPIC-COMMENT STRUCTURE
   - Topic foregrounded first, then comment
   - Example: "那把剑，很重。" (That sword, [it] is heavy.)
   - Emphasizes objects/status before actions

2. FACE (面子) SYSTEM
   - Face-threatening acts drive conflict
   - Public humiliation, defeat, betrayal
   - Physiological markers: coughing blood, sucking cold air, pale face

3. FILIAL PIETY (孝) HIERARCHIES
   - Shifu/Master - Disciple relationship is sacred
   - Parent/child, Emperor/subject obligations
   - Note if TWISTED (abusive master, betrayed disciple)

4. KUAI-MAN (快-慢) RHYTHM
   - Kuai (fast): Short sentences, action, "face-slapping"
   - Man (slow): Descriptions, internal suffering
   - Identify dominant pattern

5. STATUS LANGUAGE
   - Self-deprecating: 在下, 鄙人, 奴才
   - Elevating: 阁下, 大人, 前辈
   - Arrogant: 老子, 本座, 朕

6. FOUR-CHARACTER IDIOMS (成语)
   - Heavy cultural weight
   - Decide: preserve pinyin or translate meaning?

7. JIANGHU (江湖) ELEMENTS
   - Wuxia/xianxia: cultivation realms, martial arts

Extract glossary terms and analyze all features.`;
    }
  }

  buildUserPrompt(act, series) {
    const context = [];
    if (series.title) context.push(`Series: ${series.title}`);
    if (series.genre) context.push(`Genre: ${series.genre}`);
    if (act.label) context.push(`Act: ${act.label}`);
    if (act.Chapter?.title) context.push(`Chapter: ${act.Chapter.title}`);

    const text = act.rawActText;
    const truncated = text.length > 3000 ? text.substring(0, 3000) + '... [truncated]' : text;

    return `${context.join('\n')}

Analyze this text:

${truncated}

Extract terms and provide full linguistic/narrative analysis per schema.`;
  }
}

module.exports = new CombinedAnalysisService();
```

### 3.3 Glossary Merger Service

**File:** `backend/services/glossaryMerger.js`

```javascript
/**
 * Handles merging duplicate glossary entries with provenance tracking
 */

class GlossaryMergerService {
  constructor() {
    this.variantCache = new Map();  // term -> canonical entry
  }

  async mergeOrCreate(extractedTerm, act, seriesId, models) {
    const { GlossaryEntry } = models;

    // 1. Check for exact match
    const exactMatch = await this.findExactMatch(GlossaryEntry, extractedTerm, seriesId);
    if (exactMatch) {
      return this.mergeWithExisting(exactMatch, extractedTerm, act);
    }

    // 2. Check for variant match (e.g., "山田" matches "山田太郎")
    const variantMatch = await this.findVariantMatch(GlossaryEntry, extractedTerm, seriesId);
    if (variantMatch) {
      return this.mergeVariant(variantMatch, extractedTerm, act);
    }

    // 3. Create new entry
    return this.createNew(extractedTerm, act, seriesId, GlossaryEntry);
  }

  async findExactMatch(GlossaryEntry, term, seriesId) {
    const termField = this.getTermField(term.term);

    return await GlossaryEntry.findOne({
      where: {
        seriesId,
        [termField]: term.term,
        type: term.type
      }
    });
  }

  async findVariantMatch(GlossaryEntry, term, seriesId) {
    // Check if this term is a substring of existing entries
    // or if existing entries are substrings of this term
    const entries = await GlossaryEntry.findAll({
      where: {
        seriesId,
        type: term.type
      }
    });

    for (const entry of entries) {
      const entryTerm = entry.termJa || entry.termZh;
      if (!entryTerm) continue;

      // Check substring relationships
      if (term.term.includes(entryTerm) || entryTerm.includes(term.term)) {
        // Additional check: ensure they're related (same context type)
        return entry;
      }

      // Check metadata variants
      const variants = entry.metadata?.variants || [];
      if (variants.includes(term.term)) {
        return entry;
      }
    }

    return null;
  }

  async mergeWithExisting(existing, extracted, act) {
    const provenanceRecord = this.createProvenanceRecord(act, extracted);

    const newProvenance = [...(existing.provenance || []), provenanceRecord];

    // Update if higher confidence
    const shouldUpdateTranslation = extracted.confidence > (existing.confidence || 0);

    await existing.update({
      provenance: newProvenance,
      confidence: Math.max(existing.confidence || 0, extracted.confidence),
      termEn: shouldUpdateTranslation ? extracted.proposedTranslation : existing.termEn
    });

    return { action: 'merged', entry: existing, isNew: false };
  }

  async mergeVariant(existing, extracted, act) {
    // Add as variant, don't change main term
    const variants = existing.metadata?.variants || [];

    if (!variants.includes(extracted.term)) {
      await existing.update({
        metadata: {
          ...existing.metadata,
          variants: [...variants, extracted.term]
        },
        provenance: [...(existing.provenance || []), this.createProvenanceRecord(act, extracted)]
      });
    }

    return { action: 'variant', entry: existing, isNew: false };
  }

  async createNew(extracted, act, seriesId, GlossaryEntry) {
    const termField = this.getTermField(extracted.term);

    const entry = await GlossaryEntry.create({
      seriesId,
      [termField]: extracted.term,
      termEn: extracted.proposedTranslation,
      type: extracted.type,
      scope: 'act',
      scopeId: act.id,
      definition: null,
      metadata: {
        variants: [],
        firstAppearance: this.createProvenanceRecord(act, extracted)
      },
      provenance: [this.createProvenanceRecord(act, extracted)],
      confidence: extracted.confidence,
      status: 'pending_review'
    });

    return { action: 'created', entry, isNew: true };
  }

  createProvenanceRecord(act, extracted) {
    return {
      seriesId: act.Chapter?.seriesId,
      seriesTitle: act.Chapter?.Series?.title,
      chapterId: act.chapterId,
      chapterNumber: act.Chapter?.number,
      chapterTitle: act.Chapter?.title,
      actId: act.id,
      actLabel: act.label,
      contextSentence: extracted.context,
      extractedAt: new Date().toISOString(),
      confidence: extracted.confidence
    };
  }

  getTermField(term) {
    // Detect if Japanese or Chinese
    // Japanese: Hiragana/Katakana = ぀-ゟ, ゠-ヿ
    // Chinese: Hanzi = 一-龥 (mostly, overlap exists)

    if (/[぀-ゟ゠-ヿ]/.test(term)) {
      return 'termJa';
    }
    return 'termZh';
  }
}

module.exports = new GlossaryMergerService();
```

### 3.4 Strategy Generation Service

**File:** `backend/services/strategyGenerator.js`

```javascript
/**
 * Generates translation strategies from analysis results
 */

class StrategyGenerator {

  generateActStrategy(narrativeAnalysis, linguisticAnalysis) {
    const base = {
      primaryEmotion: narrativeAnalysis.primaryEmotion,
      emotionalIntensity: narrativeAnalysis.emotionalIntensity,
      pacingPattern: narrativeAnalysis.pacingPattern,
      powerDynamic: narrativeAnalysis.powerDynamic || narrativeAnalysis.power?.type || 'none'
    };

    // Add language-specific strategies
    if (linguisticAnalysis.language === 'ja') {
      return this.generateJapaneseStrategy(base, narrativeAnalysis, linguisticAnalysis);
    } else {
      return this.generateChineseStrategy(base, narrativeAnalysis, linguisticAnalysis);
    }
  }

  generateJapaneseStrategy(base, narrative, linguistic) {
    return {
      ...base,

      // Derived from analysis
      sentenceLengthTarget: narrative.pacingPattern === 'kuai' ? 'short' : 'long',

      fragmentUsage: (narrative.power?.type === 'dominant_submissive' || 
                     base.powerDynamic === 'master_servant') 
        ? 'absolute_phrases' 
        : 'standard',

      physiologicalTropes: narrative.emotionalIntensity > 0.7 ? 'preserve' : 'standard',

      agencyOmission: (linguistic.proDrop?.frequency > 0.5 || 
                       linguistic.proDrop?.agentOmission)
        ? 'preserve_passive'
        : 'standard',

      objectificationFreeze: linguistic.taigenTome?.count > 0 
        ? 'noun_endings' 
        : 'standard',

      interiorityFormat: linguistic.internalMonologue?.format === 'maru_kakko'
        ? 'italics_no_tags'
        : 'standard',

      // Emotional nuances
      enryo: narrative.emotionalTone?.enryo || false,
      amae: narrative.emotionalTone?.amae || false,

      // Honorific strategy
      honorificStrategy: linguistic.honorifics?.density === 'high'
        ? 'retain_keigo'
        : 'adapt_status'
    };
  }

  generateChineseStrategy(base, narrative, linguistic) {
    const faceThreat = narrative.faceSystem || {};
    const filialPiety = narrative.filialPiety || {};

    return {
      ...base,

      sentenceLengthTarget: narrative.kuaiMan?.dominantPattern === 'kuai' ? 'short' : 'long',

      faceThreatEmphasis: faceThreat.faceThreatPresent 
        ? (faceThreat.lossOfFaceEvents?.[0]?.severity || 'medium')
        : 'none',

      physiologicalTropes: faceThreat.lossOfFaceEvents?.some(e => 
        e.physiologicalMarkers?.length > 0
      ) ? 'preserve_markers' : 'standard',

      filialContext: filialPiety.present ? {
        relationship: filialPiety.relationshipType,
        twisted: filialPiety.twisted,
        obedience: filialPiety.obedienceLevel
      } : null,

      statusLanguageStrategy: this.determineStatusStrategy(linguistic.statusLanguage),

      fourCharacterIdioms: linguistic.fourCharacterIdioms?.length > 0
        ? 'preserve_pinyin'
        : 'standard',

      jianghuContext: narrative.jianghu?.present ? {
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

  aggregateChapterStrategy(acts) {
    if (acts.length === 0) return null;

    const strategies = acts.map(a => a.translationStrategy?.actLevel).filter(Boolean);
    const profiles = acts.map(a => a.anatomicalProfile?.linguistic).filter(Boolean);

    // Language (unanimous)
    const language = profiles[0]?.language;
    const structure = profiles[0]?.sentenceStructure;

    // Onomatopoeia strategy
    const onomatopoeiaDensities = profiles.map(p => p.onomatopoeia?.density);
    const onomatopoeiaStrategy = onomatopoeiaDensities.includes('high')
      ? 'romanize_with_context'
      : 'translate_sensory';

    // Honorifics (Japanese) or Status (Chinese)
    let honorificRetention;
    if (language === 'ja') {
      const honorificDensities = profiles.map(p => p.honorifics?.density);
      honorificRetention = honorificDensities.includes('high') ? 'retain' : 'adapt';
    } else {
      const statusDensities = profiles.map(p => 
        p.statusLanguage?.arrogant?.length > 0 || 
        p.statusLanguage?.selfDeprecating?.length > 0
      );
      honorificRetention = statusDensities.some(Boolean) ? 'retain' : 'adapt';
    }

    // Interior monologue
    const hasMaruKakko = profiles.some(p => 
      p.internalMonologue?.format === 'maru_kakko'
    );
    const interiorityFormat = hasMaruKakko ? 'italics_no_tags' : 'standard';

    // Pacing consistency
    const patterns = strategies.map(s => s.pacingPattern);
    const pacingConsistency = new Set(patterns).size > 1 ? 'mixed' : 'uniform';

    // Emotional arc
    const emotionalArc = strategies.map(s => s.primaryEmotion);

    return {
      language,
      sentenceStructure: structure,
      onomatopoeiaStrategy,
      honorificRetention,
      interiorityFormat,
      pacingConsistency,
      emotionalArc
    };
  }
}

module.exports = new StrategyGenerator();
```

### 3.5 Update Service Index

**File:** `backend/services/index.js` (add new services)

```javascript
module.exports = {
  // Phase 2 services
  paragraphNormalizer: require('./paragraphNormalizer'),
  aiSegmentation: require('./aiSegmentation'),
  fallbackSegmentation: require('./fallbackSegmentation'),
  actCreation: require('./actCreation'),

  // Phase 3 services
  combinedAnalysis: require('./combinedAnalysis'),
  glossaryMerger: require('./glossaryMerger'),
  strategyGenerator: require('./strategyGenerator')
};
```

---

## 4. CONTROLLER LAYER

**File:** `backend/controllers/lexicographerController.js`

```javascript
const services = require('../services');
const { CombinedAnalysis, GlossaryMerger, StrategyGenerator } = services;

class LexicographerController {

  /**
   * Run Phase 3 analysis on all acts in a chapter
   * POST /api/chapters/:chapterId/analyze
   */
  async runPhase3(req, res) {
    const { chapterId } = req.params;
    const models = req.app.get('models');
    const { Chapter, Act, Series, GlossaryEntry } = models;

    try {
      // 1. Fetch chapter with acts
      const chapter = await Chapter.findByPk(chapterId, {
        include: [
          { 
            model: Act, 
            where: { status: 'ready' },
            required: false
          },
          Series
        ]
      });

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      if (!chapter.Acts || chapter.Acts.length === 0) {
        return res.status(400).json({ 
          error: 'No acts ready for analysis. Run Phase 2 first.' 
        });
      }

      // 2. Process each act
      const results = {
        processed: 0,
        failed: [],
        glossary: {
          created: 0,
          merged: 0,
          variants: 0
        }
      };

      for (const act of chapter.Acts) {
        try {
          console.log(`[Phase 3] Analyzing act ${act.label} (${act.id})`);

          // Run combined analysis
          const analysis = await CombinedAnalysis.analyze(act, chapter.Series);

          // Process glossary terms
          for (const term of analysis.extractedTerms) {
            const mergeResult = await GlossaryMerger.mergeOrCreate(
              term, act, chapter.seriesId, models
            );

            if (mergeResult.action === 'created') results.glossary.created++;
            else if (mergeResult.action === 'merged') results.glossary.merged++;
            else if (mergeResult.action === 'variant') results.glossary.variants++;
          }

          // Generate act-level strategy
          const actStrategy = StrategyGenerator.generateActStrategy(
            analysis.narrativeAnalysis,
            analysis.linguisticAnalysis
          );

          // Update act
          await act.update({
            anatomicalProfile: {
              linguistic: analysis.linguisticAnalysis,
              narrative: analysis.narrativeAnalysis
            },
            translationStrategy: {
              actLevel: actStrategy
            },
            status: 'analyzed'
          });

          results.processed++;

        } catch (err) {
          console.error(`[Phase 3] Failed to analyze act ${act.id}:`, err);
          results.failed.push({
            actId: act.id,
            label: act.label,
            error: err.message
          });
        }
      }

      // 3. Aggregate chapter-level strategy
      const analyzedActs = await Act.findAll({
        where: { chapterId, status: 'analyzed' }
      });

      if (analyzedActs.length > 0) {
        const chapterStrategy = StrategyGenerator.aggregateChapterStrategy(analyzedActs);

        await chapter.update({
          translationStrategy: { chapterLevel: chapterStrategy },
          status: 'analyzed'
        });

        results.chapterStrategy = chapterStrategy;
      }

      // 4. Count pending glossary entries
      const pendingGlossary = await GlossaryEntry.count({
        where: {
          seriesId: chapter.seriesId,
          status: 'pending_review'
        }
      });

      res.json({
        success: true,
        chapterId: parseInt(chapterId),
        ...results,
        pendingGlossary
      });

    } catch (err) {
      console.error('[Phase 3] Controller error:', err);
      res.status(500).json({ 
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }

  /**
   * Get glossary entries for review
   * GET /api/series/:seriesId/glossary?status=pending_review
   */
  async getGlossary(req, res) {
    const { seriesId } = req.params;
    const { status = 'pending_review', type } = req.query;
    const { GlossaryEntry } = req.app.get('models');

    try {
      const where = { seriesId };
      if (status) where.status = status;
      if (type) where.type = type;

      const entries = await GlossaryEntry.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      res.json({
        seriesId: parseInt(seriesId),
        count: entries.length,
        entries
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Approve or reject glossary entry
   * PUT /api/glossary-entries/:entryId
   */
  async updateGlossaryEntry(req, res) {
    const { entryId } = req.params;
    const { termEn, definition, status, scope, scopeId } = req.body;
    const { GlossaryEntry } = req.app.get('models');

    try {
      const entry = await GlossaryEntry.findByPk(entryId);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      const updates = {};
      if (termEn !== undefined) updates.termEn = termEn;
      if (definition !== undefined) updates.definition = definition;
      if (scope !== undefined) updates.scope = scope;
      if (scopeId !== undefined) updates.scopeId = scopeId;

      if (status) {
        updates.status = status;
        if (status === 'approved') {
          updates.approvedAt = new Date();
          updates.approvedBy = req.user?.id || null;
        }
      }

      await entry.update(updates);

      res.json({
        success: true,
        entry
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get analysis for a specific act
   * GET /api/acts/:actId/analysis
   */
  async getActAnalysis(req, res) {
    const { actId } = req.params;
    const { Act } = req.app.get('models');

    try {
      const act = await Act.findByPk(actId, {
        attributes: ['id', 'label', 'anatomicalProfile', 'translationStrategy', 'status']
      });

      if (!act) {
        return res.status(404).json({ error: 'Act not found' });
      }

      res.json({
        actId: parseInt(actId),
        label: act.label,
        status: act.status,
        anatomicalProfile: act.anatomicalProfile,
        translationStrategy: act.translationStrategy
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new LexicographerController();
```

---

## 5. ROUTES

**File:** `backend/routes/lexicographer.js`

```javascript
const express = require('express');
const router = express.Router();
const LexicographerController = require('../controllers/lexicographerController');

// Run Phase 3 analysis on chapter
router.post('/chapters/:chapterId/analyze', LexicographerController.runPhase3);

// Get glossary entries for series
router.get('/series/:seriesId/glossary', LexicographerController.getGlossary);

// Update glossary entry (approve/reject/edit)
router.put('/glossary-entries/:entryId', LexicographerController.updateGlossaryEntry);

// Get analysis for specific act
router.get('/acts/:actId/analysis', LexicographerController.getActAnalysis);

module.exports = router;
```

**Update File:** `backend/routes/index.js`

```javascript
const lexicographerRoutes = require('./lexicographer');

// Add to router setup
app.use('/api', lexicographerRoutes);
```

---

## 6. INTEGRATION

### Update Model Index

**File:** `backend/models/index.js`

```javascript
const Glossary = require('./glossary')(sequelize, Sequelize.DataTypes);
const GlossaryEntry = require('./glossaryentry')(sequelize, Sequelize.DataTypes);

db.Glossary = Glossary;
db.GlossaryEntry = GlossaryEntry;

// Add associations
db.Glossary.hasMany(db.GlossaryEntry, { foreignKey: 'glossaryId' });
db.GlossaryEntry.belongsTo(db.Glossary, { foreignKey: 'glossaryId' });

db.GlossaryEntry.belongsTo(db.Series, { foreignKey: 'seriesId' });
db.Series.hasMany(db.GlossaryEntry, { foreignKey: 'seriesId' });
```

---

## 7. TESTING

### 7.1 Unit Test Example

**File:** `backend/tests/glossaryMerger.test.js`

```javascript
const GlossaryMerger = require('../services/glossaryMerger');

describe('GlossaryMerger', () => {
  test('creates new entry for unique term', async () => {
    const mockModels = {
      GlossaryEntry: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, termEn: 'Test' })
      }
    };

    const extracted = {
      term: 'テスト',
      type: 'concept',
      proposedTranslation: 'Test',
      confidence: 0.9
    };

    const result = await GlossaryMerger.mergeOrCreate(
      extracted, 
      { id: 1, chapterId: 1, Chapter: { seriesId: 1 } },
      1,
      mockModels
    );

    expect(result.action).toBe('created');
    expect(mockModels.GlossaryEntry.create).toHaveBeenCalled();
  });

  test('merges with existing exact match', async () => {
    const existing = {
      id: 1,
      termJa: 'テスト',
      termEn: 'OldTest',
      confidence: 0.8,
      provenance: [],
      update: jest.fn()
    };

    const mockModels = {
      GlossaryEntry: {
        findOne: jest.fn().mockResolvedValue(existing)
      }
    };

    const extracted = {
      term: 'テスト',
      type: 'concept',
      proposedTranslation: 'NewTest',
      confidence: 0.95
    };

    const result = await GlossaryMerger.mergeOrCreate(
      extracted,
      { id: 1, chapterId: 1, Chapter: { seriesId: 1 } },
      1,
      mockModels
    );

    expect(result.action).toBe('merged');
    expect(existing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: 0.95  // Updated to higher confidence
      })
    );
  });
});
```

### 7.2 API Test

```bash
# Run Phase 3 on chapter 1
curl -X POST http://localhost:3000/api/chapters/1/analyze

# Expected response:
{
  "success": true,
  "chapterId": 1,
  "processed": 5,
  "failed": [],
  "glossary": {
    "created": 12,
    "merged": 3,
    "variants": 2
  },
  "chapterStrategy": {
    "language": "ja",
    "sentenceStructure": "SOV",
    "onomatopoeiaStrategy": "romanize_with_context",
    "honorificRetention": "retain",
    "emotionalArc": ["distress", "distress", "defiance"]
  },
  "pendingGlossary": 17
}

# Get pending glossary
curl http://localhost:3000/api/series/1/glossary?status=pending_review

# Approve entry
curl -X PUT http://localhost:3000/api/glossary-entries/1   -H "Content-Type: application/json"   -d '{"status":"approved","termEn":"Yamada Taro"}'
```

---

## 8. ENVIRONMENT SETUP

### Environment Variables

Add to `backend/.env`:

```bash
# LM Studio (same as Phase 2)
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=your-model-name

# Phase 3 Settings
MAX_GLOSSARY_ENTRIES_PER_ACT=50  # Limit API response size
CONFIDENCE_THRESHOLD=0.7          # Minimum confidence for auto-accept
```

---

## IMPLEMENTATION CHECKLIST

- [ ] Create migrations (3 tables: Glossaries, GlossaryEntries, +2 updates)
- [ ] Run migrations
- [ ] Create Glossary model
- [ ] Create GlossaryEntry model
- [ ] Update Act model (add anatomy fields)
- [ ] Update Chapter model (add strategy field)
- [ ] Create analysisSchemas.js
- [ ] Create combinedAnalysis.js
- [ ] Create glossaryMerger.js
- [ ] Create strategyGenerator.js
- [ ] Update services index
- [ ] Create lexicographerController.js
- [ ] Create lexicographer routes
- [ ] Update routes index
- [ ] Update models index with associations
- [ ] Test with sample chapter

---

## NEXT STEPS

After Phase 3 is working:
1. Build frontend UI for glossary approval
2. Implement Phase 4 (Profiler) - MDA scoring
3. Implement Phase 5 (Master Sculptor) - Final translation using strategies

---

END OF PHASE 3 IMPLEMENTATION GUIDE
