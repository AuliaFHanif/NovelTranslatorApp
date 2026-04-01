const OpenAI = require("openai");

/**
 * Normalizes LM Studio base URL to ensure it ends with /v1
 */
function normalizeBaseUrl(url) {
  const base = (url || "http://localhost:1234").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

class LLMClient {
  constructor() {
    this.client = new OpenAI({
      baseURL: normalizeBaseUrl(process.env.LM_STUDIO_URL),
      apiKey: process.env.LM_STUDIO_API_KEY || "lm-studio",
      timeout: parseInt(process.env.LLM_TIMEOUT) || 900000, // 15 min default
    });
  }

  /**
   * Standard non-streaming chat completion
   */
  async chatCompletion(payload) {
    try {
      const response = await this.client.chat.completions.create({
        ...payload,
        stream: false,
      });
      return response.choices[0].message.content;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Streaming chat completion
   */
  async streamChatCompletion(payload) {
    try {
      return await this.client.chat.completions.create({
        ...payload,
        stream: true,
      });
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error("LM Studio service unavailable. Please check if it is running.");
    }
    if (error.code === "ECONNABORTED" || error.name === "TimeoutError") {
      throw new Error("LM Studio request timed out.");
    }
    throw error;
  }
}

module.exports = new LLMClient();
