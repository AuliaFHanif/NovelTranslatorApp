const { GlossaryTerm } = require("../models");

/**
 * Glossary Cache Service (Per-Act Lazy Loading)
 *
 * Loads approved glossary terms once per act and builds indices for O(1) lookups.
 * Lazy-loads on demand to avoid memory bloat during batch processing.
 *
 * Structure: {
 *   byCanonical: Map<canonicalForm, GlossaryTerm>,
 *   byJa: Map<termJa, GlossaryTerm>,
 *   byZh: Map<termZh, GlossaryTerm>,
 *   byVariant: Map<variantForm, GlossaryTerm>,
 *   allTerms: GlossaryTerm[]
 * }
 */

let cacheMap = {}; // Caches keyed by seriesId to reuse within same series

/**
 * Load or retrieve cached glossary for a series
 * Lazy-loads on first call per series, reuses for subsequent calls
 *
 * @param {number} seriesId - Series ID to load glossary for
 * @param {boolean} forceRefresh - Force reload from DB (default: false)
 * @returns {Object} Cache object with indexed maps
 */
async function loadSeriesGlossary(seriesId, forceRefresh = false) {
  if (cacheMap[seriesId] && !forceRefresh) {
    console.log(
      `[GlossaryCache] Cache hit for series ${seriesId} (${cacheMap[seriesId].allTerms.length} terms)`,
    );
    return cacheMap[seriesId];
  }

  console.log(`[GlossaryCache] Loading approved terms for series ${seriesId}`);

  // Single DB query: load all approved terms for this series
  const allTerms = await GlossaryTerm.findAll({
    where: {
      seriesId,
      status: "approved",
    },
  });

  // Build indices for O(1) lookups
  const byCanonical = new Map();
  const byJa = new Map();
  const byZh = new Map();
  const byVariant = new Map();

  for (const term of allTerms) {
    // Index by canonical form
    if (term.canonicalForm) {
      byCanonical.set(term.canonicalForm, term);
    }

    // Index by language-specific forms
    if (term.termJa) {
      byJa.set(term.termJa, term);
    }
    if (term.termZh) {
      byZh.set(term.termZh, term);
    }

    // Index all variants
    if (term.metadata?.variants && Array.isArray(term.metadata.variants)) {
      for (const variant of term.metadata.variants) {
        if (variant) {
          byVariant.set(variant, term);
        }
      }
    }
  }

  const cache = {
    byCanonical,
    byJa,
    byZh,
    byVariant,
    allTerms,
  };

  // Cache for reuse within series (lazy-load per act, reuse for subsequent acts)
  cacheMap[seriesId] = cache;

  console.log(
    `[GlossaryCache] Loaded ${allTerms.length} terms for series ${seriesId}`,
  );
  console.log(
    `[GlossaryCache] Index sizes: canonical=${byCanonical.size}, ja=${byJa.size}, zh=${byZh.size}, variants=${byVariant.size}`,
  );

  return cache;
}

/**
 * Clear cache for a series (e.g., after terms are approved)
 *
 * @param {number} seriesId - Series ID to clear cache for
 */
function clearCache(seriesId) {
  if (cacheMap[seriesId]) {
    delete cacheMap[seriesId];
    console.log(`[GlossaryCache] Cleared cache for series ${seriesId}`);
  }
}

/**
 * Clear all caches
 */
function clearAllCaches() {
  cacheMap = {};
  console.log(`[GlossaryCache] Cleared all caches`);
}

module.exports = {
  loadSeriesGlossary,
  clearCache,
  clearAllCaches,
};
