const {
  Scene,
  Chapter,
  Series,
  GlossaryTerm,
  TermAppearance,
} = require("../models");
const { Op } = require("sequelize");

class SceneSmartInjectionService {
  /**
   * Get terms for scene translation - optimized with pre-extracted data
   */
  async getTermsForScene(sceneId, options = {}) {
    const { limit = 80 } = options;

    const scene = await Scene.findByPk(sceneId, {
      include: [
        {
          model: Chapter,
          as: "Chapter",
          include: [{ model: Series, as: "Series" }],
        },
      ],
    });

    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    // Only re-extract if glossaryTermIds haven't been computed yet, or force is requested
    const needsExtraction =
      options.force ||
      !scene.glossaryTermIds ||
      scene.glossaryTermIds.length === 0;

    if (needsExtraction) {
      await this.extractAndStore(scene);
    }

    // Fetch full glossary data for approved terms
    const glossaryTerms = await GlossaryTerm.findAll({
      where: {
        id: { [Op.in]: scene.glossaryTermIds || [] },
        status: "approved",
      },
    });

    if (!glossaryTerms.length) {
      return { terms: [], glossaryText: "" };
    }

    const appearances = await TermAppearance.findAll({
      where: {
        sceneId: scene.id,
        termId: { [Op.in]: glossaryTerms.map((term) => term.id) },
      },
      attributes: ["termId", "frequency"],
      raw: true,
    });

    const frequencyMap = new Map(
      appearances.map((appearance) => [
        appearance.termId,
        appearance.frequency || 1,
      ]),
    );

    const rankedTerms = glossaryTerms
      .map((term) => {
        const payload = term.toJSON ? term.toJSON() : term;
        return {
          ...payload,
          frequency: frequencyMap.get(term.id) || 1,
        };
      })
      .sort((a, b) => {
        if (b.frequency !== a.frequency) return b.frequency - a.frequency;
        return (a.canonicalForm || "").localeCompare(b.canonicalForm || "");
      });

    const limitedTerms = rankedTerms.slice(0, Math.max(0, limit));

    return {
      terms: limitedTerms,
      glossaryText: this.formatGlossaryBlock(
        limitedTerms,
        scene.Chapter.Series.language,
      ),
    };
  }

  /**
   * Extract terms from scene and store in both Scene model and TermAppearances table
   */
  async extractAndStore(scene) {
    const seriesId = scene.Chapter.seriesId;
    const language = scene.Chapter.Series.language;
    const termField = language === "ja" ? "termJa" : "termZh";

    // 1. Get all approved terms for this series to match against
    const existingTerms = await GlossaryTerm.findAll({
      where: { seriesId, status: "approved" },
    });

    // 2. Simple extraction: find existing terms in text
    const matchedTermIds = [];
    for (const term of existingTerms) {
      const sourceTerm = term[termField];
      if (sourceTerm && scene.rawText.includes(sourceTerm)) {
        matchedTermIds.push(term.id);

        // Create or update TermAppearance
        await TermAppearance.upsert({
          termId: term.id,
          sceneId: scene.id,
          contextSnippet: this.getSnippet(scene.rawText, sourceTerm),
          frequency: (
            scene.rawText.match(
              new RegExp(this.escapeRegExp(sourceTerm), "g"),
            ) || []
          ).length,
        });
      }
    }

    // 3. Update Scene with matched IDs
    await scene.update({
      glossaryTermIds: matchedTermIds,
    });

    return matchedTermIds;
  }

  formatGlossaryBlock(terms, language) {
    const termField = language === "ja" ? "termJa" : "termZh";

    const lines = [];

    for (const term of terms) {
      const source = term[termField] || term.canonicalForm;
      if (!source || !term.termEn) continue;

      const type = term.type ? `[${term.type.toUpperCase()}]` : "";
      const freq = term.frequency ? ` (freq:${term.frequency})` : "";
      const def = term.definition ? ` - ${term.definition}` : "";
      const line = `- ${type} ${source} -> ${term.termEn}${freq}${def}`.trim();

      lines.push(line);
    }

    return lines.join("\n");
  }

  getSnippet(text, term, window = 50) {
    const idx = text.indexOf(term);
    if (idx === -1) return "";
    const start = Math.max(0, idx - window);
    const end = Math.min(text.length, idx + term.length + window);
    return text.substring(start, end).trim();
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

module.exports = new SceneSmartInjectionService();
