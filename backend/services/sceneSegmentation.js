const OpenAI = require("openai");
const { resolveModel } = require("./resolveModel");

const client = new OpenAI({
  baseURL: normalizeBaseUrl(process.env.OLLAMA_URL || process.env.LM_STUDIO_URL),
  apiKey: process.env.OLLAMA_API_KEY || process.env.LM_STUDIO_API_KEY || "ollama",
});

function normalizeBaseUrl(url) {
  const base = (url || process.env.OLLAMA_URL || process.env.LM_STUDIO_URL || "http://localhost:8080").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

/**
 * Helper to extract the starting transition hook of a paragraph
 * Keeps the first ~800 characters and cuts cleanly at a sentence end if possible.
 */
function compressParagraph(text, maxLength = 800) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  
  const slice = trimmed.substring(0, maxLength);
  // Look for sentence boundaries (Japanese/Chinese full stop or English period)
  const lastPeriod = Math.max(
    slice.lastIndexOf("。"),
    slice.lastIndexOf("."),
    slice.lastIndexOf("？"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("!")
  );
  
  // If we found a sentence boundary in the second half of the slice, cut there cleanly
  if (lastPeriod > maxLength * 0.7) {
    return trimmed.substring(0, lastPeriod + 1);
  }
  
  return slice.trim() + "...";
}

/**
 * Scene detection using LLM
 * Directs a single, straightforward request to the AI.
 */
async function detectScenes(paragraphs, options = {}) {
  if (!paragraphs?.length) throw new Error("Cannot segment empty text");

  // 1. Resolve model to use
  const model = await resolveModel(options.model);

  // Dynamic context adjustment: if chapter is small (<25,000 characters), send full text!
  const totalLength = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
  const useFullText = totalLength < 25000;
  
  console.log(`[Segmentation] Chapter length: ${totalLength} chars. useFullText = ${useFullText}`);

  // 2. Prepare direct instructions for the AI
  const messages = [
    {
      role: "system",
      content: `You are an expert Literary Editor. Your task is to perform "Scene Slicing" on a story.
Analyze the provided paragraphs and partition them into logical, individual scenes. A scene change occurs when there is a significant shift in time, setting, characters, or narrative focus.

You must return a valid JSON object containing an array of the starting paragraph indices (0-indexed) for each scene.
Example Output:
{"scene_starts": [0, 2, 5]}`
    },
    {
      role: "user",
      content: `Analyze the following story paragraphs (indexed 0 to ${paragraphs.length - 1}) and divide this story into individual scenes:

${paragraphs.map((p, i) => `[Paragraph ${i}]\n${useFullText ? p.text : compressParagraph(p.text)}`).join("\n\n")}`
    }
  ];

  console.log(`[Segmentation] Calling AI model (${model}) to segment ${paragraphs.length} paragraphs...`);
  
  // Call AI with flexible json_object format and high max_tokens to accommodate reasoning models
  const response = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 4000, // Generous token limit to prevent Qwen reasoning truncation
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty content during segmentation.");
  }

  const parsed = JSON.parse(content);
  const sceneStarts = parsed.scene_starts;

  if (!Array.isArray(sceneStarts)) {
    throw new Error("AI did not return a valid list of scene starts.");
  }

  console.log(`[Segmentation] AI successfully divided text into scene starts:`, sceneStarts);
  return convertToSceneGroups(sceneStarts, paragraphs);
}

function createScenePayload(paragraphs, sceneType = "exposition") {
  const TextMetrics = require("../utils/textMetrics");
  const rawText = paragraphs.map((p) => p.text).join("\n\n");
  return {
    paragraphs,
    rawText,
    sceneType,
    summary: "",
    estimatedTokens: TextMetrics.estimateTokens(rawText),
    charCount: rawText.length,
    wordCount: TextMetrics.countUnifiedWords(rawText),
  };
}

function sanitizeSceneStarts(sceneStarts, paragraphCount) {
  if (paragraphCount <= 0) return [0];
  if (!Array.isArray(sceneStarts)) return [0];

  const starts = [...new Set([0, ...sceneStarts])]
    .map((idx) => Number(idx))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < paragraphCount)
    .sort((a, b) => a - b);

  return starts.length ? starts : [0];
}

function convertToSceneGroups(sceneStarts, paragraphs) {
  const scenes = [];
  const starts = sanitizeSceneStarts(sceneStarts, paragraphs.length);

  for (let i = 0; i < starts.length; i++) {
    const startIdx = starts[i];
    const endIdx = i + 1 < starts.length ? starts[i + 1] : paragraphs.length;

    if (startIdx < paragraphs.length) {
      const sceneParagraphs = paragraphs.slice(startIdx, endIdx);
      if (!sceneParagraphs.length) continue;
      scenes.push(createScenePayload(sceneParagraphs, "exposition"));
    }
  }

  return scenes.length ? scenes : [createScenePayload(paragraphs, "exposition")];
}

module.exports = {
  detectScenes,
};
