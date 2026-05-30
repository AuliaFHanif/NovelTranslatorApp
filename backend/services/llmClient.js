const OpenAI = require("openai");
const { normalizeBaseUrl } = require("../utils/normalizeBaseUrl");

class LLMClient {
  constructor() {
    this.client = new OpenAI({
      baseURL: normalizeBaseUrl(process.env.OLLAMA_URL || process.env.LM_STUDIO_URL),
      apiKey: process.env.OLLAMA_API_KEY || process.env.LM_STUDIO_API_KEY || "ollama",
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
      throw new Error("Ollama / LM Studio service unavailable. Please check if it is running on the configured port.");
    }
    if (error.code === "ECONNABORTED" || error.name === "TimeoutError") {
      throw new Error("Ollama / LM Studio request timed out.");
    }
    throw error;
  }
}

module.exports = new LLMClient();
