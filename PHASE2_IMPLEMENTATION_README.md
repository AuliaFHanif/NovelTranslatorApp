# Phase 2: Architect - Implementation Specification

## Overview
Implement the "Architect" phase of the NovelTranslatorApp's Anatomy Engine. This phase transforms raw chapter text into segmented narrative acts (scenes) using AI-powered scene detection with rule-based fallback.

---

## System Context

### Database Schema (Already Exists)
- **Series**: Container for translation projects (language: 'ja' or 'zh')
- **Chapters**: Contains `rawText` (input), `finalText` (output), `status` field
- **Acts**: NEW - Stores segmented narrative units
- **GlossaryEntries**: Scoped to series/chapter/act (hierarchical)

### Act Model Fields to Populate
```javascript
{
  id: INTEGER (PK, auto-increment),
  chapterId: INTEGER (FK → Chapters.id, CASCADE),
  order: INTEGER (sequence within chapter, min: 1),
  label: STRING (display: "1", "1A", "1B"),
  rawActText: TEXT (segment content),
  parentActId: INTEGER (FK → Acts.id, nullable),
  splitIndex: INTEGER (0 for root, 1+ for splits),
  glossaryScopeId: INTEGER (FK → Acts.id, root act ID),
  dependsOnActId: INTEGER (FK → Acts.id, previous split, nullable),
  status: ENUM('pending', 'ready', 'profiled', 'translated', 'complete', 'blocked'),
  boundaryStart: INTEGER (character position in chapter.rawText),
  boundaryEnd: INTEGER (character position in chapter.rawText),
  tokenCount: INTEGER (estimated tokens),
  source: ENUM('ai', 'fallback'), // how boundaries were determined
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Chapter Status Values
- `paste` → Phase 1 complete, ready for Phase 2
- `architect` → Phase 2 in progress
- `ready` → Phase 2 complete, ready for Phase 3

---

## Implementation Requirements

### 1. Paragraph Normalization Service

**File:** `backend/services/paragraphNormalizer.js`

**Input:** `chapter.rawText` (string)
**Output:** Array of paragraph objects:
```javascript
[
  {
    index: 1,           // 1-based paragraph number
    text: "full text",
    startPos: 0,        // character position in rawText
    endPos: 150,        // exclusive
    isSynthetic: false  // true if created by sentence-joining
  }
]
```

**Normalization Rules (in order):**

1. **HTML Stripping**
   - Remove `<p>`, `</p>`, `<br>`, `</br>`, `<br/>` tags
   - Replace with newlines

2. **Line Break Normalization**
   - Convert all line endings to `\n`
   - Collapse multiple newlines to `\n\n`

3. **Paragraph Detection (Japanese/Chinese)**
   - Split on:
     - `\n\n` (double newline)
     - `\n　` (newline + full-width space at start)
     - `\n「` or `\n『` (newline + opening quote)
     - `\n[Name]は` or `\n[Name]が` (newline + name particle)
   - Name detection: Any 2-4 kanji/hanzi followed by は/が/は/是/在

4. **Sentence Boundary Merging**
   - If a "paragraph" doesn't end with `。！？.!?`, merge with next
   - Max merge attempts: 3 (prevent runaway merging)

5. **Synthetic Paragraph Creation**
   - If no natural boundaries found (wall of text):
   - Split every 3-5 sentences using `。！？` as boundaries
   - Mark `isSynthetic: true`

**Token Estimation:**
```javascript
function estimateTokens(text) {
  // Conservative: 1 token ≈ 4 characters for CJK
  return Math.ceil(text.length / 4);
}
```

---

### 2. AI Segmentation Service

**File:** `backend/services/aiSegmentation.js`

**LM Studio Client Configuration:**
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  base_url: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
  api_key: 'lm-studio'
});
```

**JSON Schema for Structured Output:**
```javascript
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
          items: {
            type: 'integer',
            minimum: 1
          },
          minItems: 1
        },
        confidence: {
          type: 'array',
          items: {
            type: 'number',
            minimum: 0,
            maximum: 1
          }
        },
        sceneTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['dialogue', 'action', 'description', 'transition', 'monologue']
          }
        }
      },
      required: ['sceneBoundaries'],
      additionalProperties: false
    }
  }
};
```

**Prompt Construction:**
```javascript
function buildSegmentationPrompt(paragraphs) {
  const formatted = paragraphs.map((p, i) => {
    // Truncate long paragraphs to 200 chars for context efficiency
    const preview = p.text.length > 200 
      ? p.text.substring(0, 200) + '...'
      : p.text;
    return `[P${i + 1}] ${preview}`;
  }).join('\n\n');

  return {
    role: 'user',
    content: `Analyze this chapter and identify scene boundaries.

A scene is a continuous narrative unit with consistent:
- Time (no time jumps)
- Location (same setting)
- POV (same perspective/character focus)

Paragraphs:
${formatted}

Identify paragraph indices where one scene ends and another begins.
Return boundaries as 1-based indices (e.g., [3, 7, 12] means scenes end at P3, P7, P12).`
  };
}
```

**API Call with Retry Logic:**
```javascript
async function callSegmentationAI(paragraphs, retries = 3) {
  const messages = [
    {
      role: 'system',
      content: 'You are a literary scene analyzer for Japanese and Chinese web novels. Identify scene boundaries objectively.'
    },
    buildSegmentationPrompt(paragraphs)
  ];

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: process.env.LM_STUDIO_MODEL || 'default',
        messages,
        response_format: segmentationSchema,
        temperature: 0.2 + (attempt * 0.15),  // 0.2, 0.35, 0.5
        max_tokens: 1000
      });

      const result = JSON.parse(response.choices[0].message.content);

      // Validation
      if (!result.sceneBoundaries || !Array.isArray(result.sceneBoundaries)) {
        throw new Error('Invalid response: sceneBoundaries missing');
      }

      // Sort and deduplicate
      result.sceneBoundaries = [...new Set(result.sceneBoundaries)].sort((a, b) => a - b);

      // Validate range
      const maxParagraph = paragraphs.length;
      const invalid = result.sceneBoundaries.filter(b => b < 1 || b > maxParagraph);
      if (invalid.length > 0) {
        throw new Error(`Boundaries out of range: ${invalid.join(', ')}`);
      }

      return {
        boundaries: result.sceneBoundaries,
        confidence: result.confidence || [],
        sceneTypes: result.sceneTypes || [],
        source: 'ai'
      };

    } catch (err) {
      console.error(`Attempt ${attempt + 1} failed:`, err.message);
      if (attempt === retries - 1) throw err;
      // Retry with higher temperature
    }
  }
}
```

---

### 3. Fallback Segmentation Service

**File:** `backend/services/fallbackSegmentation.js`

**Trigger:** AI returns < 2 boundaries (0 or 1 scenes detected)

**Algorithm:**
```javascript
function fallbackSegmentation(paragraphs) {
  const PARAGRAPHS_PER_ACT = 5;
  const MAX_TOKENS = 800;  // Conservative pre-split threshold

  const boundaries = [];
  let currentTokens = 0;
  let paragraphCount = 0;
  let lastBoundary = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    paragraphCount++;
    currentTokens += estimateTokens(paragraphs[i].text);

    const hitParagraphLimit = paragraphCount >= PARAGRAPHS_PER_ACT;
    const hitTokenLimit = currentTokens >= MAX_TOKENS;
    const isLastParagraph = i === paragraphs.length - 1;

    if (hitParagraphLimit || hitTokenLimit || isLastParagraph) {
      boundaries.push(i + 1);  // 1-based index
      paragraphCount = 0;
      currentTokens = 0;
      lastBoundary = i + 1;
    }
  }

  // Ensure final boundary exists
  if (boundaries[boundaries.length - 1] !== paragraphs.length) {
    boundaries.push(paragraphs.length);
  }

  return {
    boundaries,
    source: 'fallback',
    reason: 'ai_detected_insufficient_scenes'
  };
}
```

---

### 4. Act Creation Service

**File:** `backend/services/actCreation.js`

**Token Splitting Logic (1000 token limit):**
```javascript
const MAX_ACT_TOKENS = 1000;

function splitActIfNeeded(actText, paragraphs, startIdx, endIdx) {
  const totalTokens = estimateTokens(actText);

  if (totalTokens <= MAX_ACT_TOKENS) {
    return [{ text: actText, paragraphs: [startIdx, endIdx], isSplit: false }];
  }

  // Split into A, B, C...
  const splits = [];
  let currentText = '';
  let currentStart = startIdx;
  let currentTokens = 0;
  let splitIndex = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const pText = paragraphs[i - 1].text;  // 0-based array
    const pTokens = estimateTokens(pText);

    if (currentTokens + pTokens > MAX_ACT_TOKENS && currentText.length > 0) {
      // Finalize current split
      splits.push({
        text: currentText.trim(),
        paragraphs: [currentStart, i - 1],
        isSplit: true,
        splitLabel: String.fromCharCode(65 + splitIndex)  // A, B, C...
      });

      // Start new split
      currentText = pText;
      currentStart = i;
      currentTokens = pTokens;
      splitIndex++;
    } else {
      currentText += (currentText ? '\n\n' : '') + pText;
      currentTokens += pTokens;
    }
  }

  // Final split
  if (currentText) {
    splits.push({
      text: currentText.trim(),
      paragraphs: [currentStart, endIdx],
      isSplit: true,
      splitLabel: String.fromCharCode(65 + splitIndex)
    });
  }

  return splits;
}
```

**Database Creation:**
```javascript
async function createActs(chapterId, paragraphs, segmentationResult) {
  const { boundaries, source } = segmentationResult;
  const createdActs = [];
  let orderCounter = 1;

  // Track root acts for glossary scoping
  const rootActMap = new Map();  // order -> rootActId

  for (let i = 0; i < boundaries.length; i++) {
    const startPara = i === 0 ? 1 : boundaries[i - 1] + 1;
    const endPara = boundaries[i];

    // Extract text
    const actParagraphs = paragraphs.slice(startPara - 1, endPara);
    const actText = actParagraphs.map(p => p.text).join('\n\n');

    // Check if needs splitting
    const splits = splitActIfNeeded(actText, paragraphs, startPara, endPara);

    for (let j = 0; j < splits.length; j++) {
      const split = splits[j];
      const isRoot = splits.length === 1;
      const isFirstSplit = j === 0;

      // Determine label
      let label;
      if (isRoot) {
        label = String(orderCounter);
      } else {
        label = `${orderCounter}${split.splitLabel}`;
      }

      // Calculate character boundaries
      const firstPara = paragraphs[split.paragraphs[0] - 1];
      const lastPara = paragraphs[split.paragraphs[1] - 1];

      const actData = {
        chapterId,
        order: orderCounter,
        label,
        rawActText: split.text,
        boundaryStart: firstPara.startPos,
        boundaryEnd: lastPara.endPos,
        tokenCount: estimateTokens(split.text),
        status: isRoot ? 'pending' : 'blocked',
        source,
        parentActId: null,  // Set after root creation for splits
        splitIndex: isRoot ? 0 : j + 1,
        glossaryScopeId: null,  // Set to root act ID
        dependsOnActId: null    // Set for split chains
      };

      const act = await Act.create(actData);
      createdActs.push(act);

      // Track root for splits
      if (isRoot) {
        rootActMap.set(orderCounter, act.id);
      } else {
        // Update split with root references
        const rootId = rootActMap.get(orderCounter);
        await act.update({
          parentActId: rootId,
          glossaryScopeId: rootId,
          dependsOnActId: isFirstSplit 
            ? rootId  // 1A depends on root (1)
            : createdActs[createdActs.length - 2].id  // 1B depends on 1A
        });
      }
    }

    orderCounter++;
  }

  // Update root acts with their own glossaryScopeId
  for (const act of createdActs) {
    if (act.splitIndex === 0) {
      await act.update({ glossaryScopeId: act.id });
    }
  }

  return createdActs;
}
```

---

### 5. Main Phase 2 Controller

**File:** `backend/controllers/architectController.js`

**Endpoint:** `POST /api/chapters/:chapterId/architect`

**Flow:**
```javascript
async function runArchitectPhase(req, res) {
  const { chapterId } = req.params;

  try {
    // 1. Fetch chapter
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    if (!chapter.rawText) return res.status(400).json({ error: 'No raw text' });

    // 2. Update status
    await chapter.update({ status: 'architect' });

    // 3. Clear existing acts (re-run support)
    await Act.destroy({ where: { chapterId } });

    // 4. Normalize paragraphs
    const paragraphs = normalizeParagraphs(chapter.rawText);

    // 5. Detect boundaries
    let segmentation;
    try {
      segmentation = await callSegmentationAI(paragraphs);
    } catch (err) {
      console.error('AI segmentation failed, using fallback:', err.message);
      segmentation = fallbackSegmentation(paragraphs);
    }

    // 6. Validate minimum boundaries
    if (segmentation.boundaries.length < 2) {
      segmentation = fallbackSegmentation(paragraphs);
      segmentation.source = 'fallback';  // Override
    }

    // 7. Create acts
    const acts = await createActs(chapterId, paragraphs, segmentation);

    // 8. Update chapter status
    await chapter.update({ status: 'ready' });

    res.json({
      success: true,
      chapterId,
      actsCreated: acts.length,
      segmentationSource: segmentation.source,
      acts: acts.map(a => ({
        id: a.id,
        label: a.label,
        order: a.order,
        tokenCount: a.tokenCount,
        status: a.status,
        dependsOn: a.dependsOnActId
      }))
    });

  } catch (err) {
    await Chapter.update({ status: 'paste' }, { where: { id: chapterId } });
    res.status(500).json({ error: err.message });
  }
}
```

---

## Environment Variables

```bash
# .env
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=your-model-name  # Must support JSON schema/structured output
MAX_ACT_TOKENS=1000
FALLBACK_PARAGRAPHS_PER_ACT=5
FALLBACK_MAX_TOKENS=800
```

---

## Testing Checklist

### Unit Tests
- [ ] Paragraph normalizer handles all 5 input formats
- [ ] Token estimation within ±20% of actual
- [ ] AI segmentation parses valid JSON schema
- [ ] Fallback triggers when boundaries < 2
- [ ] Act splitting creates correct 1A/1B labels
- [ ] Dependency chain links 1B → 1A → root

### Integration Tests
- [ ] Full chapter processed end-to-end
- [ ] Re-running Phase 2 clears old acts
- [ ] Chapter status transitions: paste → architect → ready
- [ ] Database constraints enforced (unique order per chapter)

### Edge Cases
- [ ] Empty chapter (error handling)
- [ ] Single paragraph chapter (single act)
- [ ] Chapter with 50+ scenes (performance)
- [ ] LM Studio timeout (retry logic)
- [ ] Invalid JSON from AI (fallback)

---

## Dependencies

```json
{
  "openai": "^4.x",
  "sequelize": "^6.x",  // Already in project
  "pg": "^8.x"          // Already in project
}
```

---

## Output Verification

After implementation, verify in database:

```sql
-- Check act structure
SELECT 
  c.number as chapter,
  a.label,
  a.order,
  a.split_index,
  a.parent_act_id,
  a.glossary_scope_id,
  a.depends_on_act_id,
  a.token_count,
  a.source
FROM acts a
JOIN chapters c ON a.chapter_id = c.id
WHERE c.id = ?
ORDER BY a.order, a.split_index;

-- Verify glossary scope sharing
SELECT 
  a1.label as act,
  a2.label as glossary_source
FROM acts a1
JOIN acts a2 ON a1.glossary_scope_id = a2.id
WHERE a1.parent_act_id IS NOT NULL;
```

---

## Success Criteria

Phase 2 is complete when:
1. All chapters in test set process without errors
2. Acts have sensible token counts (800-1200 range)
3. Split acts (1A/1B) share `glossaryScopeId`
4. Dependency chains are unbroken
5. `source` field correctly indicates 'ai' or 'fallback'
6. Re-processing produces identical results (deterministic)

---

## Next Steps After Implementation

1. Run test suite
2. Process 3-5 sample chapters manually verify output
3. Tune `MAX_ACT_TOKENS` based on actual LLM performance
4. Proceed to Phase 3 (Lexicographer) implementation
