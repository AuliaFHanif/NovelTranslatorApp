const OpenAI = require("openai");
const { estimateTokens } = require("./paragraphNormalizer");

function normalizeBaseUrl(url) {
  const base = (url || "http://localhost:1234").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

const client = new OpenAI({
  baseURL: normalizeBaseUrl(process.env.LM_STUDIO_URL),
  apiKey: process.env.LM_STUDIO_API_KEY || "lm-studio",
});

const segmentationSchema = {
  type: "json_schema",
  json_schema: {
    name: "scene_segmentation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        sceneBoundaries: {
          type: "array",
          description: "1-based paragraph indices where scenes end",
          items: {
            type: "integer",
            minimum: 1,
          },
          minItems: 1,
        },
        confidence: {
          type: "array",
          items: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
        sceneTypes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "dialogue",
              "action",
              "description",
              "transition",
              "monologue",
            ],
          },
        },
      },
      required: ["sceneBoundaries"],
      additionalProperties: false,
    },
  },
};

function buildSegmentationPrompt(paragraphs) {
  const formatted = paragraphs
    .map((paragraph, i) => {
      const preview =
        paragraph.text.length > 200
          ? `${paragraph.text.substring(0, 200)}...`
          : paragraph.text;
      return `[P${i + 1}] ${preview}`;
    })
    .join("\n\n");

  return {
    role: "user",
    content: `Analyze this chapter and identify scene boundaries.\n\nA scene is a continuous narrative unit with consistent:\n- Time (no time jumps)\n- Location (same setting)\n- POV (same perspective/character focus)\n\nImportant constraints:\n- You are selecting boundaries only.\n- Do NOT summarize, rewrite, or skip connective narrative detail.\n- Keep world-building and internal monologue inside scenes unless there is a true scene transition.\n- Ensure boundaries represent full contiguous coverage from P1 to the final paragraph.\n\nParagraphs:\n${formatted}\n\nIdentify paragraph indices where one scene ends and another begins.\nReturn boundaries as 1-based indices (e.g., [3, 7, 12] means scenes end at P3, P7, P12).`,
  };
}

function parseResponseContent(content) {
  if (!content) {
    throw new Error("Empty AI response content");
  }

  if (typeof content === "string") {
    return JSON.parse(content);
  }

  if (typeof content === "object") {
    return content;
  }

  throw new Error("Unsupported AI response content type");
}

function isStrongBoundaryParagraph(text) {
  const value = (text || "").trim();
  if (!value) {
    return false;
  }

  // Avoid cutting after continuation punctuation that often indicates in-progress dialogue/thought.
  if (/[，、；：,:]$/.test(value)) {
    return false;
  }

  // Prefer end-of-sentence style punctuation for cleaner scene transitions.
  return /[。！？!?…]$/.test(value) || /[」』】）》）)]$/.test(value);
}

function smoothBoundaries(boundaries, paragraphs) {
  const maxParagraph = paragraphs.length;
  const normalized = [...new Set(boundaries)]
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= maxParagraph)
    .sort((a, b) => a - b);

  const MIN_TOKENS_PER_ACT =
    Number(process.env.MIN_ACT_TOKENS) || 400;
  const adjusted = [];

  for (const rawBoundary of normalized) {
    if (rawBoundary === maxParagraph) {
      adjusted.push(rawBoundary);
      continue;
    }

    let candidate = rawBoundary;
    if (!isStrongBoundaryParagraph(paragraphs[candidate - 1]?.text)) {
      // Prefer a nearby forward sentence end for continuity, then fall back backward.
      let found = false;

      for (let delta = 1; delta <= 2; delta += 1) {
        const forward = rawBoundary + delta;
        if (
          forward < maxParagraph &&
          isStrongBoundaryParagraph(paragraphs[forward - 1]?.text)
        ) {
          candidate = forward;
          found = true;
          break;
        }
      }

      if (!found) {
        for (let delta = 1; delta <= 2; delta += 1) {
          const backward = rawBoundary - delta;
          if (
            backward >= 1 &&
            isStrongBoundaryParagraph(paragraphs[backward - 1]?.text)
          ) {
            candidate = backward;
            break;
          }
        }
      }
    }

    adjusted.push(candidate);
  }

  const dedupedAdjusted = [...new Set(adjusted)].sort((a, b) => a - b);

  // Avoid over-fragmenting into tiny acts by accumulating tokens.
  const spanFiltered = [];
  let lastBoundary = 0;
  let accumulatedTokens = 0;

  for (const boundary of dedupedAdjusted) {
    let spanTokens = 0;
    for (let i = lastBoundary; i < boundary; i++) {
        const text = paragraphs[i]?.text || "";
        spanTokens += estimateTokens(text);
    }
    accumulatedTokens += spanTokens;

    const isFinal = boundary === maxParagraph;
    if (isFinal || accumulatedTokens >= MIN_TOKENS_PER_ACT) {
      spanFiltered.push(boundary);
      lastBoundary = boundary;
      accumulatedTokens = 0;
    }
  }

  const finalBoundaries =
    spanFiltered.length > 0 ? spanFiltered : [maxParagraph];

  if (finalBoundaries[finalBoundaries.length - 1] !== maxParagraph) {
    finalBoundaries.push(maxParagraph);
  }

  return finalBoundaries;
}

async function callSegmentationAI(paragraphs, retries = 3) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error("Cannot segment empty paragraph list");
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a literary scene analyzer for Japanese and Chinese web novels. Identify scene boundaries objectively.",
    },
    buildSegmentationPrompt(paragraphs),
  ];

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: process.env.LM_STUDIO_MODEL || "default",
        messages,
        response_format: segmentationSchema,
        temperature: 0.2 + attempt * 0.15,
        max_tokens: 1000,
      });

      const content = response?.choices?.[0]?.message?.content;
      const result = parseResponseContent(content);

      if (!result.sceneBoundaries || !Array.isArray(result.sceneBoundaries)) {
        throw new Error("Invalid response: sceneBoundaries missing");
      }

      const maxParagraph = paragraphs.length;
      const deduped = [...new Set(result.sceneBoundaries)]
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v))
        .sort((a, b) => a - b);

      const invalid = deduped.filter(
        (boundary) => boundary < 1 || boundary > maxParagraph,
      );
      if (invalid.length > 0) {
        throw new Error(`Boundaries out of range: ${invalid.join(", ")}`);
      }

      const boundaries = deduped.length > 0 ? deduped : [maxParagraph];
      if (boundaries[boundaries.length - 1] !== maxParagraph) {
        boundaries.push(maxParagraph);
      }

      const smoothedBoundaries = smoothBoundaries(boundaries, paragraphs);

      return {
        boundaries: smoothedBoundaries,
        confidence: Array.isArray(result.confidence) ? result.confidence : [],
        sceneTypes: Array.isArray(result.sceneTypes) ? result.sceneTypes : [],
        source: "ai",
      };
    } catch (error) {
      console.error(
        `AI segmentation attempt ${attempt + 1} failed:`,
        error.message,
      );
      if (attempt === retries - 1) {
        throw error;
      }
    }
  }

  throw new Error("AI segmentation exhausted retries");
}

module.exports = {
  callSegmentationAI,
  buildSegmentationPrompt,
};
