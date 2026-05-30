const axios = require('axios');
const { AIModel } = require('../models');

const LM_STUDIO_URL = (process.env.OLLAMA_URL || process.env.LM_STUDIO_URL || 'http://localhost:8080').replace(/\/+$/, '');

/**
 * Resolve the model ID to use for LM Studio / Ollama requests.
 *
 * Priority:
 *   1. Explicit `model` passed in (from request body / caller)
 *   2. First active AIModel in the database
 *   3. First model currently loaded in Ollama / LM Studio (GET /v1/models)
 *
 * Throws if no model can be resolved at all.
 */
async function resolveModel(explicitModel) {
  // 1. Caller provided a model
  if (explicitModel && typeof explicitModel === 'string' && explicitModel.trim()) {
    return explicitModel.trim();
  }

  // 2. First active model from the database
  try {
    const dbModel = await AIModel.findOne({
      where: { isActive: true },
      order: [['id', 'ASC']],
    });
    if (dbModel?.modelId) {
      return dbModel.modelId;
    }
  } catch (err) {
    console.warn('[resolveModel] Could not query AIModel table:', err.message);
  }

  // 3. Ask Ollama / LM Studio what's loaded
  try {
    const response = await axios.get(`${LM_STUDIO_URL}/v1/models`, { timeout: 3000 });
    const models = response.data?.data;
    if (Array.isArray(models) && models.length > 0) {
      return models[0].id;
    }
  } catch (err) {
    console.warn('[resolveModel] Could not query Ollama / LM Studio /v1/models:', err.message);
  }

  throw new Error(
    'No model available. Please configure a model in Settings → AI Models, ' +
    'or ensure a model is loaded in Ollama / LM Studio.'
  );
}

module.exports = { resolveModel };
