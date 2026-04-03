/**
 * Optimized AI Segmentation Service
 *
 * Performance improvements:
 * 1. Reduced max_tokens from 16000 to 2000 (major speedup)
 * 2. Added batching for long chapters
 * 3. Simplified prompt to reduce LLM processing time
 * 4. Direct OpenAI client usage (no abstraction overhead)
 */

const OpenAI = require("openai");
const TextMetrics = require("../utils/textMetrics");
const config = require("../config/segmentation");
const { resolveModel } = require("./resolveModel");

// Initialize client once
const client = new OpenAI({
  baseURL: normalizeBaseUrl(process.env.LM_STUDIO_URL),
  apiKey: process.env.LM_STUDIO_API_KEY || "lm-studio",
});

function normalizeBaseUrl(url) {
  const base = (url || "http://localhost:1234").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

// Simplified, faster JSON schema
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
          items: { type: "integer", minimum: 1 },
          minItems: 1,
        },
        // Optional fields removed from schema to speed up parsing
        // Add back if needed: confidence, sceneTypes
      },
      required: ["sceneBoundaries"],
      additionalProperties: false,
    },
  },
};

/**
 * Build optimized prompt - shorter = faster processing
 * Allow AI to decide natural number of acts (3-6 range)
 */
function buildSegmentationPrompt(paragraphs, startIndex = 0) {
  const { paragraphPreviewLength } = config.ai;

  const formatted = paragraphs
    .map((p, i) => {
      const globalIdx = startIndex + i + 1;
      const preview =
        p.text.length > paragraphPreviewLength
          ? p.text.substring(0, paragraphPreviewLength) + "..."
          : p.text;
      return `[P${globalIdx}] ${preview}`;
    })
    .join("\n\n");

  return {
    role: "user",
    content: `Identify the natural narrative ACTS/SCENES in the following text. Structure the text into 3-4 major acts following this pattern:

**Look for these markers to identify act boundaries:**
- Time transitions (e.g., "两天后", "一周的时间", "next day")
- Location changes (different settings, movements between places)
- Character introductions or significant interactions
- Plot shifts or changes in objective (new mission, mission completion, obstacle)
- Narrative momentum changes (routine → urgent, tension → release)
- Theme/mood transitions
- Natural pacing breaks where reader would expect a scene/chapter division

Prioritize finding 3 substantial acts over finding many micro-divisions. Each act should contain meaningful narrative progression.

${formatted}

Return 1-based paragraph indices where acts END (e.g., [42, 85, 120]). Include ALL boundary indices. Aim for 3-4 boundaries total.`,
  };
}

/**
 * Build prompt for dividing an act into subacts
 * Target: ~1500 tokens per subact
 */
function buildSubActSegmentationPrompt(
  paragraphs,
  startIndex = 0,
  targetTokens = 1500,
) {
  const { paragraphPreviewLength } = config.ai;

  // Calculate total tokens
  const actText = paragraphs.map((p) => p.text).join("\n\n");
  const totalTokens = TextMetrics.estimateTokens(actText);
  const estimatedSubActs = Math.max(1, Math.ceil(totalTokens / targetTokens));

  const formatted = paragraphs
    .map((p, i) => {
      const globalIdx = startIndex + i + 1;
      const preview =
        p.text.length > paragraphPreviewLength
          ? p.text.substring(0, paragraphPreviewLength) + "..."
          : p.text;
      return `[P${globalIdx}] ${preview}`;
    })
    .join("\n\n");

  return {
    role: "user",
    content: `Divide this act into approximately ${estimatedSubActs} subacts/scenes. Each subact should be roughly 1500 tokens in size and represent a complete narrative beat or scene.

Look for natural breaks:
- Scene/perspective shifts
- Time progression
- Dialogue exchanges ending
- Emotional beats
- Minor plot conclusions

${formatted}

Return 1-based paragraph indices where subacts END (e.g., [15, 30, 45]). Space them evenly to target ~${estimatedSubActs} subacts total. Do NOT include the final paragraph index.`,
  };
}

/**
 * Fast JSON extraction without regex overhead for simple cases
 */
function fastExtractJson(str) {
  if (typeof str !== "string") return str;

  str = str.trim();

  // Fast path: already clean JSON
  if (str.startsWith("{") && str.endsWith("}")) {
    return str;
  }

  // Handle markdown code blocks
  if (str.startsWith("```json")) {
    return str
      .substring(7, str.endsWith("```") ? str.length - 3 : str.length)
      .trim();
  }
  if (str.startsWith("```")) {
    return str
      .substring(3, str.endsWith("```") ? str.length - 3 : str.length)
      .trim();
  }

  return str;
}

/**
 * Parse with fallback
 */
function parseResponse(content) {
  if (!content) throw new Error("Empty response");

  if (typeof content === "object") return content;

  try {
    const cleaned = fastExtractJson(content);
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}`);
  }
}

/**
 * Check if text ends with sentence boundary
 */
function isStrongBoundary(text) {
  if (!text) return false;
  const t = text.trim();

  // Avoid cutting after continuation punctuation
  if (/[，、；：,;:"]$/.test(t)) return false;

  // Prefer sentence-ending punctuation
  return /[。！？.!?…」』】）》）]$/.test(t);
}

/**
 * Align boundary to nearest good sentence break
 */
function alignBoundary(boundary, paragraphs, maxParagraph) {
  if (boundary >= maxParagraph) return maxParagraph;
  if (boundary <= 1) return 1;

  // Already good?
  if (isStrongBoundary(paragraphs[boundary - 1]?.text)) {
    return boundary;
  }

  const { sentenceBoundaryWindow } = config.boundaries;

  // Look forward first (prefer extending scene)
  for (let delta = 1; delta <= sentenceBoundaryWindow; delta++) {
    const forward = boundary + delta;
    if (
      forward < maxParagraph &&
      isStrongBoundary(paragraphs[forward - 1]?.text)
    ) {
      return forward;
    }
  }

  // Then look backward
  for (let delta = 1; delta <= sentenceBoundaryWindow; delta++) {
    const backward = boundary - delta;
    if (backward >= 1 && isStrongBoundary(paragraphs[backward - 1]?.text)) {
      return backward;
    }
  }

  return boundary;
}

/**
 * Merge tiny acts and enforce minimum sizes
 */
function optimizeBoundaries(boundaries, paragraphs) {
  const maxParagraph = paragraphs.length;
  const { minTokensPerAct, minUnifiedWordsPerAct, minLastActWords } =
    config.boundaries;

  // Align all boundaries to good break points
  const aligned = boundaries.map((b) =>
    alignBoundary(b, paragraphs, maxParagraph),
  );
  const deduped = [...new Set(aligned)].sort((a, b) => a - b);

  // Ensure coverage
  if (deduped[deduped.length - 1] !== maxParagraph) {
    deduped.push(maxParagraph);
  }

  // Calculate metrics for each span
  const paraMetrics = TextMetrics.calculateParagraphMetrics(paragraphs);
  const cumulative = TextMetrics.getCumulativeMetrics(paraMetrics);

  const optimized = [];
  let lastBoundary = 0;
  let accumulatedTokens = 0;
  let accumulatedWords = 0;

  for (let i = 0; i < deduped.length; i++) {
    const boundary = deduped[i];
    const isFinal = boundary === maxParagraph;

    // Calculate span metrics
    const spanTokens =
      cumulative[boundary - 1].estimatedTokens -
      (lastBoundary > 0 ? cumulative[lastBoundary - 1].estimatedTokens : 0);
    const spanWords =
      cumulative[boundary - 1].unifiedWords -
      (lastBoundary > 0 ? cumulative[lastBoundary - 1].unifiedWords : 0);

    accumulatedTokens += spanTokens;
    accumulatedWords += spanWords;

    if (isFinal) {
      console.log(
        `[Segmentation] Final boundary at ${boundary}. Span: ${spanWords} words, ${spanTokens} tokens.`,
      );
      // Check if last act is too small
      if (optimized.length > 0 && spanWords < minLastActWords) {
        console.log(
          `[Segmentation] Last act too small (${spanWords} < ${minLastActWords}), merging with previous.`,
        );
        optimized[optimized.length - 1] = maxParagraph;
      } else {
        optimized.push(boundary);
      }
    } else if (
      accumulatedTokens >= minTokensPerAct ||
      accumulatedWords >= minUnifiedWordsPerAct
    ) {
      console.log(
        `[Segmentation] Keeping boundary ${boundary}. Accumulated: ${accumulatedWords} words, ${accumulatedTokens} tokens.`,
      );
      optimized.push(boundary);
      lastBoundary = boundary;
      accumulatedTokens = 0;
      accumulatedWords = 0;
    } else {
      console.log(
        `[Segmentation] Skipping AI boundary ${boundary}. Accumulated only ${accumulatedWords} words.`,
      );
    }
  }

  console.log(
    `[Segmentation] Optimized ${deduped.length} boundaries down to ${optimized.length}.`,
  );

  // Ensure we have at least one boundary
  if (optimized.length === 0) {
    optimized.push(maxParagraph);
  }

  return optimized;
}

/**
 * Call AI with timeout and retry logic
 */
async function callAIWithRetry(messages, attempt = 0) {
  const { maxTokens, temperature, temperatureIncrement, maxRetries } =
    config.ai;

  const temp = temperature + attempt * temperatureIncrement;

  try {
    const response = await client.chat.completions.create({
      model: await resolveModel(),
      messages,
      response_format: segmentationSchema,
      temperature: temp,
      max_tokens: maxTokens,
    });

    return response?.choices?.[0]?.message?.content;
  } catch (error) {
    if (attempt < maxRetries - 1) {
      console.warn(`AI call failed (attempt ${attempt + 1}), retrying...`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
      return callAIWithRetry(messages, attempt + 1);
    }
    throw error;
  }
}

/**
 * Process a single batch of paragraphs
 */
async function processBatch(paragraphs, targetParts = null, startIndex = 0) {
  const messages = [
    {
      role: "system",
      content:
        "You are a senior literary orchestrator specializing in book-length narrative structure. Your goal is to identify natural narrative segments in a text based on story structure. Focus ONLY on the most significant plot shifts, POV changes, or thematic boundaries. Let the text guide the number of segments - don't force any particular count.",
    },
    buildSegmentationPrompt(paragraphs, startIndex),
  ];

  const content = await callAIWithRetry(messages);
  const result = parseResponse(content);

  if (!result.sceneBoundaries || !Array.isArray(result.sceneBoundaries)) {
    throw new Error("Invalid response: missing sceneBoundaries");
  }

  return result.sceneBoundaries;
}

/**
 * Process a single act to divide it into SubActs (~1500 characters each)
 */
async function processBatchForSubActs(
  paragraphs,
  language = "zh",
  actNumber = 1,
  startIndex = 0,
  targetTokens = 1500,
) {
  const messages = [
    {
      role: "system",
      content:
        "You are an expert at dividing narrative scenes into even smaller, natural beats. Each subact should be a complete narrative unit. Ensure subacts are consistently sized and represent meaningful story moments. Divide evenly if needed.",
    },
    buildSubActSegmentationPrompt(paragraphs, startIndex, targetTokens),
  ];

  const content = await callAIWithRetry(messages);
  const result = parseResponse(content);

  if (!result.sceneBoundaries || !Array.isArray(result.sceneBoundaries)) {
    throw new Error("Invalid response: missing sceneBoundaries");
  }

  return result.sceneBoundaries;
}

/**
 * Step 3: Combine any subacts that are under 800 tokens
 * Merges small subacts with adjacent ones to maintain minimum size
 */
function combineSmallSubActs(actSubActMap, minTokens = 800) {
  const minTokenThreshold = minTokens;
  const optimizedMap = [];

  for (let actIdx = 0; actIdx < actSubActMap.length; actIdx++) {
    const subActList = actSubActMap[actIdx];
    const combined = [];

    for (let i = 0; i < subActList.length; i++) {
      const currentSubAct = subActList[i];
      const currentText = currentSubAct.map((p) => p.text).join("\n\n");
      const currentTokens = TextMetrics.estimateTokens(currentText);

      // If this subact is above threshold, keep it as-is
      if (currentTokens >= minTokenThreshold) {
        combined.push(currentSubAct);
      } else {
        // This subact is too small - try to merge with next one
        if (i + 1 < subActList.length) {
          // Merge with next subact
          const nextSubAct = subActList[i + 1];
          const mergedSubAct = [...currentSubAct, ...nextSubAct];
          combined.push(mergedSubAct);
          i++; // Skip the next subact since we merged it
        } else if (combined.length > 0) {
          // Last subact is too small - merge with previous
          const prevSubAct = combined.pop();
          const mergedSubAct = [...prevSubAct, ...currentSubAct];
          combined.push(mergedSubAct);
        } else {
          // First subact and too small, but no next - keep as-is
          combined.push(currentSubAct);
        }
      }
    }

    optimizedMap.push(combined);
  }

  return optimizedMap;
}

/**
 * Re-segment oversized SubActs using AI with stricter parameters
 * If a subact exceeds maxTokens, ask AI to segment it again with lower targetTokens
 */
async function reSegmentOversizedSubActs(
  actSubActMap,
  maxTokens = 4000,
  language = "zh",
) {
  const resegmentedMap = [];

  for (let actIdx = 0; actIdx < actSubActMap.length; actIdx++) {
    const subActList = actSubActMap[actIdx];
    const resegmentedSubActs = [];

    for (let i = 0; i < subActList.length; i++) {
      const subAct = subActList[i];
      const subActText = subAct.map((p) => p.text).join("\n\n");
      const subActTokens = TextMetrics.estimateTokens(subActText);

      // If under max limit, keep as-is
      if (subActTokens <= maxTokens) {
        resegmentedSubActs.push(subAct);
      } else {
        // Re-segment this oversized subact with stricter parameters
        console.log(
          `[Segmentation] ⚠ Act ${actIdx + 1}, SubAct ${i + 1}: ${subActTokens} tokens exceeds max ${maxTokens}, re-segmenting with AI (targetTokens=1000)...`,
        );

        // Use stricter target: 1000 tokens instead of 1500
        const stricterTargetTokens = 1000;

        try {
          const boundaries = await processBatchForSubActs(
            subAct,
            language,
            actIdx + 1,
            0, // startIndex doesn't matter for local paragraph numbering
            stricterTargetTokens,
          );

          // Convert boundaries to subact groups within this oversized subact
          const validBoundaries = boundaries.filter(
            (b) => b > 0 && b < subAct.length,
          );
          const finalBoundaries = [...validBoundaries, subAct.length];

          let lastIdx = 0;
          let reSegmentCount = 0;
          for (const boundary of finalBoundaries) {
            const segment = subAct.slice(lastIdx, boundary);
            if (segment.length > 0) {
              resegmentedSubActs.push(segment);
              reSegmentCount++;
            }
            lastIdx = boundary;
          }

          console.log(
            `[Segmentation] ✓ Re-segmented SubAct ${i + 1} into ${reSegmentCount} smaller subacts`,
          );
        } catch (error) {
          console.error(
            `[Segmentation] ✗ Failed to re-segment SubAct ${i + 1}: ${error.message}`,
          );
          // Fallback: keep original if re-segmentation fails
          resegmentedSubActs.push(subAct);
        }
      }
    }

    resegmentedMap.push(resegmentedSubActs);
  }

  return resegmentedMap;
}

/**
 * Main entry point - AI first pass + direct SubAct division
 * Step 1: AI identifies natural act boundaries
 * Step 2: AI divides each act into subacts (~1500 characters each)
 */
async function callSegmentationAI(paragraphs, options = {}) {
  const { language = "zh" } = options;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error("Cannot segment empty paragraph list");
  }

  // STEP 1: AI decides natural act boundaries for the whole chapter
  const fullText = paragraphs.map((p) => p.text).join("\n\n");
  const estimatedTokens = TextMetrics.estimateTokens(fullText);

  console.log(
    `[Segmentation] Step 1 - AI pass: tokens=${estimatedTokens}, paragraphs=${paragraphs.length}`,
  );

  // Let AI decide natural boundaries - don't force a specific count
  const aiDecision = await processBatch(paragraphs, null, 0);

  console.log(
    `\n[Segmentation] ✓ AI DECISION: ${aiDecision.length} ACTS identified`,
  );
  console.log(
    `[Segmentation] └─ Boundaries at paragraphs: ${JSON.stringify(aiDecision)}`,
  );

  // Convert boundaries to act groups
  const actGroups = [];
  let lastIdx = 0;
  for (const boundary of aiDecision) {
    const group = paragraphs.slice(lastIdx, boundary);
    // Only add non-empty groups
    if (group.length > 0) {
      actGroups.push(group);
    }
    lastIdx = boundary;
  }

  // Add any remaining paragraphs after the last boundary
  if (lastIdx < paragraphs.length) {
    actGroups.push(paragraphs.slice(lastIdx));
  }

  // Log original act breakdown
  console.log(`[Segmentation]\n[Segmentation] Original AI Acts:`);
  for (let i = 0; i < actGroups.length; i++) {
    const actText = actGroups[i].map((p) => p.text).join("\n\n");
    const actTokens = TextMetrics.estimateTokens(actText);
    const startPara = i === 0 ? 1 : aiDecision[i - 1] + 1;
    const endPara = aiDecision[i];
    console.log(
      `[Segmentation] │  Act ${i + 1}: paragraphs [${startPara}-${endPara}], tokens=${actTokens}, words=${actGroups[i].length}`,
    );
  }

  // CONSOLIDATION PASS: Merge tiny final act (< 25 tokens) into previous act
  if (actGroups.length > 1) {
    const lastActText = actGroups[actGroups.length - 1]
      .map((p) => p.text)
      .join("\n\n");
    const lastActTokens = TextMetrics.estimateTokens(lastActText);

    if (lastActTokens < 25) {
      console.log(
        `[Segmentation] ⚠ Final act has only ${lastActTokens} tokens (< 25), consolidating into Act ${actGroups.length - 1}`,
      );

      // Merge last act into previous act
      actGroups[actGroups.length - 2].push(...actGroups[actGroups.length - 1]);
      actGroups.pop();

      console.log(
        `[Segmentation] ✓ Consolidated: ${actGroups.length} acts now`,
      );
    }
  }

  // STEP 2: AI divides each act into SubActs (targeting ~1500 characters each)
  console.log(
    `\n[Segmentation] Step 2 - Processing ${actGroups.length} acts for SubAct segmentation...`,
  );

  const allSubActs = [];
  const actSubActMap = []; // Track SubActs per Act

  for (let i = 0; i < actGroups.length; i++) {
    const actText = actGroups[i].map((p) => p.text).join("\n\n");
    const actChars = actText.length;

    // Use AI to divide this act into subacts (~1500 characters each)
    const subActBoundaries = await processBatchForSubActs(
      actGroups[i],
      language,
      i + 1,
    );

    // Convert boundaries to subact groups
    // Filter out invalid boundaries and add the final segment
    const validBoundaries = subActBoundaries.filter(
      (b) => b > 0 && b < actGroups[i].length,
    );
    // Always include the last paragraph index
    const finalBoundaries = [...validBoundaries, actGroups[i].length];

    const subActs = [];
    let lastIdx = 0;
    for (const boundary of finalBoundaries) {
      const segment = actGroups[i].slice(lastIdx, boundary);
      if (segment.length > 0) {
        subActs.push(segment);
      }
      lastIdx = boundary;
    }

    // Log SubAct breakdown for this act
    if (subActs.length > 1) {
      console.log(
        `[Segmentation] └─ Act ${i + 1} (${actChars} chars) → ${subActs.length} SubActs`,
      );
    } else {
      console.log(
        `[Segmentation] └─ Act ${i + 1} (${actChars} chars) → 1 SubAct (no split needed)`,
      );
    }

    actSubActMap.push(subActs); // Store SubActs grouped by Act
    allSubActs.push(...subActs);
  }

  // STEP 3: Combine any subacts that are under 800 tokens
  console.log(
    `\n[Segmentation] Step 3 - Combining subacts under 800 tokens...`,
  );
  const optimizedSubActMap = combineSmallSubActs(actSubActMap, 800);

  // Rebuild allSubActs from optimized map
  const allOptimizedSubActs = [];
  for (const subActList of optimizedSubActMap) {
    allOptimizedSubActs.push(...subActList);
  }

  // Log combining results
  let combinedCount = 0;
  for (let i = 0; i < optimizedSubActMap.length; i++) {
    const original = actSubActMap[i].length;
    const optimized = optimizedSubActMap[i].length;
    if (optimized < original) {
      combinedCount += original - optimized;
      console.log(
        `[Segmentation] └─ Act ${i + 1}: ${original} → ${optimized} SubActs (combined ${original - optimized} small ones)`,
      );
    }
  }
  if (combinedCount === 0) {
    console.log(`[Segmentation] └─ No small subacts found (all ≥ 800 tokens)`);
  }

  // Final summary
  console.log(
    `\n[Segmentation] ✓ FINAL: ${actGroups.length} Acts → ${allOptimizedSubActs.length} SubActs total`,
  );
  console.log(
    `[Segmentation] optimizedSubActMap has ${optimizedSubActMap.length} entries:`,
  );
  optimizedSubActMap.forEach((subActList, i) => {
    console.log(`[Segmentation]   Act ${i + 1}: ${subActList.length} SubActs`);
  });
  console.log("");

  // Return structure preserving Act hierarchy
  return {
    acts: actGroups, // Original AI-identified acts (for DB: create these as Acts)
    actSubActMap: optimizedSubActMap, // Optimized SubActs (combined small ones)
    boundaries: aiDecision, // Act boundaries in paragraphs
    source: "ai",
    batchCount: allOptimizedSubActs.length,
  };
}

module.exports = {
  callSegmentationAI,
  buildSegmentationPrompt,
  buildSubActSegmentationPrompt,
  optimizeBoundaries,
  alignBoundary,
  combineSmallSubActs,
};
