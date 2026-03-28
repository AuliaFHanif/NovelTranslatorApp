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

  /**
   * Analyze a single act
   * @param {Object} act - Act instance (with Chapter and Series loaded)
   * @returns {Object} Analysis result with glossary terms and profiles
   */
  async analyzeAct(act) {
    const language = act.Chapter?.Series?.language;
    if (!language || !['ja', 'zh'].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

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
        model: this.model,
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

    if (language === 'ja') {
      return `${base}

Analyze for:
1. SOV structure - verb-last suspense
2. Pro-drop frequency - invisible agency
3. Onomatopoeia (gitaigo/giseigo) - sensory texture
4. Keigo (honorifics) - social hierarchy
5. Taigen-tome - noun-ending objectification
6. Maru-kakko () - unuttered internal thoughts

Series: ${series.title}
Genre: ${series.genre || 'Unknown'}`;
    } else {
      return `${base}

Analyze for:
1. Topic-Comment structure - foregrounding
2. Face (面子) system - shame/honor dynamics
3. Filial piety (孝) - twisted hierarchies
4. Kuai-Man rhythm - pacing patterns
5. Four-character idioms (成语) - cultural weight
6. Jianghu elements - martial arts cultivation

Series: ${series.title}
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

Extract glossary terms and provide full analysis.`;
  }
}

module.exports = new CombinedAnalysisService();
