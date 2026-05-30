const express = require("express");
const axios = require("axios");
const router = express.Router();

// Ollama / LM Studio endpoint
const LM_STUDIO_URL = process.env.OLLAMA_URL || process.env.LM_STUDIO_URL || "http://localhost:8080";
const LM_STUDIO_MODELS_ENDPOINT = `${LM_STUDIO_URL}/v1/models`;
const LM_STUDIO_CHAT_ENDPOINT = `${LM_STUDIO_URL}/v1/chat/completions`;

/**
 * GET /api/health
 * Health check - verify backend and Ollama / LM Studio connectivity
 */
router.get("/", async (req, res) => {
  try {
    let lmStudioStatus = "disconnected";
    let lmStudioMessage = "";

    try {
      const response = await axios.get(LM_STUDIO_MODELS_ENDPOINT, {
        timeout: 3000,
      });

      if (response.status === 200) {
        lmStudioStatus = "connected";
        lmStudioMessage =
          response.data.data?.length > 0
            ? `${response.data.data.length} model(s) available`
            : "No models loaded";
      }
    } catch (err) {
      lmStudioMessage = err.message || "Connection refused";
    }

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      backend: {
        status: "running",
        port: 5000,
      },
      services: {
        lmStudio: {
          status: lmStudioStatus,
          url: LM_STUDIO_URL,
          message: lmStudioMessage,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/health - Error:", error.message);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * POST /api/llm
 * Proxy requests to Ollama / LM Studio Chat Completions API
 * Forward the request body directly and return response
 *
 * Body format (OpenAI compatible):
 * {
 *   "model": "model-name",
 *   "messages": [{"role": "user", "content": "..."}],
 *   "temperature": 0.7,
 *   "top_p": 0.9,
 *   ...
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { model, messages, temperature, top_p, max_tokens, ...otherParams } =
      req.body;

    // Validation
    if (
      !model ||
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error: "Invalid request format",
        required: ["model", "messages"],
        messageFormat: [{ role: "user", content: "text" }],
      });
    }

    // Build request
    const lmRequest = {
      model,
      messages,
      temperature: temperature || 0.7,
      top_p: top_p || 0.9,
      max_tokens: max_tokens || 2048,
      ...otherParams,
    };

    console.log(`[LLM Proxy] Forwarding request to ${LM_STUDIO_CHAT_ENDPOINT}`);
    console.log(`[LLM Proxy] Model: ${model}, Messages: ${messages.length}`);

    // Forward
    const response = await axios.post(LM_STUDIO_CHAT_ENDPOINT, lmRequest, {
      timeout: 30000, // 30 second timeout for LLM responses
    });

    // Return response
    res.status(200).json(response.data);
  } catch (error) {
    console.error("POST /api/llm - Error:", error.message);

    if (error.response) {
      // LLM service returned an error response
      return res.status(error.response.status || 500).json({
        error: "LLM service error",
        details: error.response.data,
      });
    }

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Ollama / LM Studio service unavailable",
        message: `Cannot connect to ${LM_STUDIO_URL}. Ensure Ollama or LM Studio is running.`,
      });
    }

    if (error.code === "ECONNABORTED") {
      return res.status(504).json({
        error: "Ollama / LM Studio request timeout",
        message:
          "The LLM processing took too long. Try with fewer tokens or simpler input.",
      });
    }

    res.status(500).json({
      error: "Proxy error",
      message: error.message,
    });
  }
});

module.exports = router;
