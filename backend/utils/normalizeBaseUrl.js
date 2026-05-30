/**
 * Shared URL normalization for LLM service endpoints.
 * Ensures the base URL ends with /v1 for OpenAI-compatible API calls.
 */
function normalizeBaseUrl(url) {
  const base = (
    url ||
    process.env.OLLAMA_URL ||
    process.env.LM_STUDIO_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

module.exports = { normalizeBaseUrl };
