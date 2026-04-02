/**
 * Optimized AI Segmentation Service
 * 
 * Performance improvements:
 * 1. Reduced max_tokens from 16000 to 2000 (major speedup)
 * 2. Added batching for long chapters
 * 3. Simplified prompt to reduce LLM processing time
 * 4. Direct OpenAI client usage (no abstraction overhead)
 */

const OpenAI = require('openai');
const TextMetrics = require('../utils/textMetrics');
const config = require('../config/segmentation');
const { resolveModel } = require('./resolveModel');

// Initialize client once
const client = new OpenAI({
  baseURL: normalizeBaseUrl(process.env.LM_STUDIO_URL),
  apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
});

function normalizeBaseUrl(url) {
  const base = (url || 'http://localhost:1234').replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

// Simplified, faster JSON schema
const segmentationSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'scene_segmentation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        sceneBoundaries: {
          type: 'array',
          description: '1-based paragraph indices where scenes end',
          items: { type: 'integer', minimum: 1 },
          minItems: 1,
        },
        // Optional fields removed from schema to speed up parsing
        // Add back if needed: confidence, sceneTypes
      },
      required: ['sceneBoundaries'],
      additionalProperties: false,
    },
  },
};

/**
 * Build optimized prompt - shorter = faster processing
 */
function buildSegmentationPrompt(paragraphs, startIndex = 0) {
  const { paragraphPreviewLength } = config.ai;

  const formatted = paragraphs
    .map((p, i) => {
      const globalIdx = startIndex + i + 1;
      const preview = p.text.length > paragraphPreviewLength 
        ? p.text.substring(0, paragraphPreviewLength) + '...'
        : p.text;
      return `[P${globalIdx}] ${preview}`;
    })
    .join('\n\n');

  return {
    role: 'user',
    content: `Segment the following chapter into 2-5 logical 'Acts'. An Act is a substantial narrative unit (typically 500-2000 words) encompassing multiple smaller scenes. Focus ONLY on major narrative shifts or POV changes.

${formatted}

Return 1-based paragraph indices where Acts end (e.g., [15, 48]). Avoid creating many small segments. We want high-level structure only.`,
  };
}

/**
 * Fast JSON extraction without regex overhead for simple cases
 */
function fastExtractJson(str) {
  if (typeof str !== 'string') return str;

  str = str.trim();

  // Fast path: already clean JSON
  if (str.startsWith('{') && str.endsWith('}')) {
    return str;
  }

  // Handle markdown code blocks
  if (str.startsWith('```json')) {
    return str.substring(7, str.endsWith('```') ? str.length - 3 : str.length).trim();
  }
  if (str.startsWith('```')) {
    return str.substring(3, str.endsWith('```') ? str.length - 3 : str.length).trim();
  }

  return str;
}

/**
 * Parse with fallback
 */
function parseResponse(content) {
  if (!content) throw new Error('Empty response');

  if (typeof content === 'object') return content;

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
    if (forward < maxParagraph && isStrongBoundary(paragraphs[forward - 1]?.text)) {
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
  const { minTokensPerAct, minUnifiedWordsPerAct, minLastActWords } = config.boundaries;

  // Align all boundaries to good break points
  const aligned = boundaries.map(b => alignBoundary(b, paragraphs, maxParagraph));
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
    const spanTokens = cumulative[boundary - 1].estimatedTokens - 
                      (lastBoundary > 0 ? cumulative[lastBoundary - 1].estimatedTokens : 0);
    const spanWords = cumulative[boundary - 1].unifiedWords - 
                     (lastBoundary > 0 ? cumulative[lastBoundary - 1].unifiedWords : 0);

    accumulatedTokens += spanTokens;
    accumulatedWords += spanWords;

    if (isFinal) {
      console.log(`[Segmentation] Final boundary at ${boundary}. Span: ${spanWords} words, ${spanTokens} tokens.`);
      // Check if last act is too small
      if (optimized.length > 0 && spanWords < minLastActWords) {
        console.log(`[Segmentation] Last act too small (${spanWords} < ${minLastActWords}), merging with previous.`);
        optimized[optimized.length - 1] = maxParagraph;
      } else {
        optimized.push(boundary);
      }
    } else if (accumulatedTokens >= minTokensPerAct || accumulatedWords >= minUnifiedWordsPerAct) {
      console.log(`[Segmentation] Keeping boundary ${boundary}. Accumulated: ${accumulatedWords} words, ${accumulatedTokens} tokens.`);
      optimized.push(boundary);
      lastBoundary = boundary;
      accumulatedTokens = 0;
      accumulatedWords = 0;
    } else {
      console.log(`[Segmentation] Skipping AI boundary ${boundary}. Accumulated only ${accumulatedWords} words.`);
    }
  }

  console.log(`[Segmentation] Optimized ${deduped.length} boundaries down to ${optimized.length}.`);

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
  const { maxTokens, temperature, temperatureIncrement, maxRetries } = config.ai;

  const temp = temperature + (attempt * temperatureIncrement);

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
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
      return callAIWithRetry(messages, attempt + 1);
    }
    throw error;
  }
}

/**
 * Process a single batch of paragraphs
 */
async function processBatch(paragraphs, startIndex) {
  const messages = [
    {
      role: 'system',
      content: 'You are a senior literary orchestrator specializing in book-length narrative structure. Your goal is to segment a raw chapter into several (typically 2-5) major Narrative Acts. Avoid identifying minor scene shifts; focus ONLY on the most significant turning points, POV shifts, or climax/resolution boundaries.',
    },
    buildSegmentationPrompt(paragraphs, startIndex),
  ];

  const content = await callAIWithRetry(messages);
  const result = parseResponse(content);

  if (!result.sceneBoundaries || !Array.isArray(result.sceneBoundaries)) {
    throw new Error('Invalid response: missing sceneBoundaries');
  }

  return result.sceneBoundaries;
}

/**
 * Main entry point - handles batching for long chapters
 */
async function callSegmentationAI(paragraphs, options = {}) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error('Cannot segment empty paragraph list');
  }

  const { maxParagraphsInPrompt, batchSize } = config.ai;
  const { enableBatchProcessing } = config.performance;

  // Short chapter: single call
  if (!enableBatchProcessing || paragraphs.length <= maxParagraphsInPrompt) {
    const boundaries = await processBatch(paragraphs, 0);
    const optimized = optimizeBoundaries(boundaries, paragraphs);

    return {
      boundaries: optimized,
      source: 'ai',
      batchCount: 1,
    };
  }

  // Long chapter: batch processing
  console.log(`[Segmentation] Long chapter detected (${paragraphs.length} paragraphs), using batching`);

  const allBoundaries = [];
  let globalOffset = 0;

  // Process in overlapping batches for continuity
  const overlap = 5; // paragraphs of overlap between batches

  for (let i = 0; i < paragraphs.length; i += (batchSize - overlap)) {
    const batch = paragraphs.slice(i, i + batchSize);
    const batchBoundaries = await processBatch(batch, i);

    // Adjust boundaries to global indices
    const adjusted = batchBoundaries.map(b => b + i);

    // Filter out boundaries in the overlap zone (except the last one)
    const effectiveBoundaries = adjusted.filter(b => {
      const isInOverlap = b > (i + batchSize - overlap);
      const isLastBatch = (i + batchSize) >= paragraphs.length;
      return !isInOverlap || isLastBatch;
    });

    allBoundaries.push(...effectiveBoundaries);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < paragraphs.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const optimized = optimizeBoundaries(allBoundaries, paragraphs);

  return {
    boundaries: optimized,
    source: 'ai',
    batchCount: Math.ceil(paragraphs.length / (batchSize - overlap)),
  };
}

module.exports = {
  callSegmentationAI,
  buildSegmentationPrompt,
  optimizeBoundaries,
  alignBoundary,
};
