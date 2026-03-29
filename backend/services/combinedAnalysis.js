const OpenAI = require('openai');
const schemas = require('./analysisSchemas');
const { resolveModel } = require('./resolveModel');

class CombinedAnalysisService {
  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
      apiKey: 'lm-studio',
      timeout: 900000 // 15 minutes for heavy analysis
    });
  }

  /**
   * Analyze a single act
   * @param {Object} act - Act instance (with Chapter and Series loaded)
   * @param {Object} [options] - Optional settings
   * @param {string} [options.model] - Explicit model ID to use
   * @returns {Object} Analysis result with glossary terms and profiles
   */
  async analyzeAct(act, options = {}) {
    const language = act.Chapter?.Series?.language;
    if (!language || !['ja', 'zh'].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const modelId = await resolveModel(options.model);

    const schema = schemas[language];
    const messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(language, act.Chapter.Series)
      },
      {
        role: 'user',
        content: this.buildUserPrompt(act)
      }
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: modelId,
        messages,
        response_format: schema,
        temperature: 0.3,
        max_tokens: 2000
      });

      const result = JSON.parse(response.choices[0].message.content);

      // Add metadata
      return {
        ...result,
        language,
        actId: act.id,
        analyzedAt: new Date().toISOString()
      };

    } catch (err) {
      console.error(`Analysis failed for act ${act.id}:`, err.message);
      throw err;
    }
  }

  buildSystemPrompt(language, series) {
    const base = `You are a literary analysis engine for ${language === 'ja' ? 'Japanese' : 'Chinese'} web novels.`;

    const common = `
NAMING CONVENTION (CRITICAL):
- For all "character" and "location" types, the "proposedTranslation" MUST be phonetic transliteration.
- For Chinese: Use Pinyin without tone marks (e.g., "白枫" -> "Bai Feng").
- For Japanese: Use Romaji (e.g., "田中" -> "Tanaka").
- Do NOT translate names literally (e.g., "白枫" is NOT "White Maple").
`;

    if (language === 'ja') {
      return `${base}
${common}
Analyze for:
1. SOV structure - verb-last suspense
2. Pro-drop frequency - invisible agency
3. Onomatopoeia (gitaigo/giseigo) - sensory texture
4. Keigo (honorifics) - social hierarchy
5. Taigen-tome - noun-ending objectification
6. Maru-kakko () - unuttered internal thoughts

Series: ${series.title || 'Novel'}
Genre: ${series.genre || 'Unknown'}`;
    } else {
      return `${base}
${common}
Analyze for:
1. Topic-Comment structure - foregrounding
2. Face (面子) system - shame/honor dynamics
3. Filial piety (孝) - twisted hierarchies
4. Kuai-Man rhythm - pacing patterns
5. Four-character idioms (成语) - cultural weight
6. Jianghu elements - martial arts cultivation

Series: ${series.title || 'Novel'}
Genre: ${series.genre || 'Unknown'}`;
    }
  }

  buildUserPrompt(act) {
    const context = [];
    if (act.Chapter?.Series?.title) {
      context.push(`Series: ${act.Chapter.Series.title}`);
    }
    if (act.Chapter?.title) {
      context.push(`Chapter ${act.Chapter.number}: ${act.Chapter.title}`);
    }
    context.push(`Act: ${act.label}`);

    // Truncate long text
    const text = act.rawText;
    const truncated = text.length > 3000 
      ? text.substring(0, 3000) + '... [truncated]'
      : text;

    return `${context.join('\n')}

${truncated}

### TERM EXTRACTION POLICY (STRICT!)
1. PRIORITIZE:
   - Character Names (Use phonetic names only - "Bai Feng" not "White Maple")
   - Organization Names (Sects, guilds, clans)
   - Unique Location Names (Distinct nouns)
   - Unique World Terms (Magic items, techniques)
2. EXCLUDE:
   - General dictionary terms (e.g., "running", "house", "angry", "sword").
3. FORMATTING:
   - The "term" field must be the EXACT source text from the novel.
   - Do NOT add explanations or phonetic romaji inside the "term" field.`;
  }
}

module.exports = new CombinedAnalysisService();
