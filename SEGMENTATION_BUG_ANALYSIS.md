# Segmentation Logic Analysis - Critical Bug Found

## Issue: Duplicate Content in Acts and SubActs

**Symptom:** Act 585 has identical `rawText` as SubAct (with `actId=585`)

**Root Cause:** Double segmentation and missing SubAct granularity configuration

---

## Architecture Problem

### Current Flow (BROKEN)

```
Raw Chapter Text
  ↓
callSegmentationAI(chapters)
  - Uses segmentRecursively()
  - Returns groups[] of paragraphs
  ↓
createActs() for each group:
  - Creates Act with rawText = full group text
  - Calls segmentRecursively() AGAIN on same group
  - Creates SubActs from recursive output
  ↓
PROBLEM: If group fits minimum size (800+ tokens),
segmentRecursively() returns [group] as-is
→ Act.rawText === SubAct[0].rawText (DUPLICATE!)
```

### Design Flaw

1. **Two-pass approach is redundant:**
   - First pass: `callSegmentationAI` uses `segmentRecursively`
   - Second pass: `createActs` calls `segmentRecursively` again
   - Result: Wasted computation + no granularity control

2. **Missing SubAct size target:**
   - `config.boundaries` defines Act sizes (800-1500 tokens)
   - NO definition of SubAct sizes
   - Acts and SubActs therefore end up the same size
   - Creates 1:1 mapping where Act.rawText = first SubAct.rawText

3. **Architectural confusion:**
   - Act is meant to be analysis scope (contains analysis + glossary)
   - SubAct is meant to be translation atomic unit
   - But they're created at the same granularity level!

---

## Code Flow Analysis

### Problem Location: `backend/services/actCreation.js`

```javascript
async createActs(chapterId, paragraphs, segmentation, language = "zh") {
  const { groups, source } = segmentation;  // Already segmented by callSegmentationAI

  for (const actParagraphs of groups) {
    const actText = actParagraphs.map((p) => p.text).join("\n\n");

    // Issue #1: Create Act with already-segmented group
    const act = await this.createSingleAct({
      rawText: actText,  // Full group (already at ~1000 tokens)
      ...
    });

    // Issue #2: Segment AGAIN - redundant!
    const subSegments = await require("./aiSegmentation").segmentRecursively(
      actParagraphs,
      language,
    );

    // Issue #3: No size check - if subSegments = [actParagraphs],
    // this SubAct will have identical content as the Act
    for (const subPara of subSegments) {
      const subText = subPara.map((p) => p.text).join("\n\n");
      await SubAct.create({
        actId: act.id,
        rawText: subText,  // Often = actText!
      });
    }
  }
}
```

### How It Happens

1. Act 585 created with 1200 tokens
2. `segmentRecursively` called on same 1200-token text
3. Check: Is 1200 ≤ segmentation limit?
   - If yes → returns `[[all 1200 tokens]]`
4. SubAct 1 created with same 1200 tokens
5. Result: **Act.rawText === SubAct.rawText**

---

## Configuration Gap

### Current Settings (backend/config/segmentation.js)

```javascript
boundaries: {
  // ACT sizes
  minTokensPerAct: 800,
  minUnifiedWordsPerAct: 600,

  maxTokensPerAct: 1500,
  maxUnifiedWordsPerAct: 1200,

  // SUBACT sizes - MISSING!
  // No minTokensPerSubAct
  // No maxTokensPerSubAct
}
```

**Missing:**

- `minTokensPerSubAct` (should be smaller than Act, e.g., 200-400)
- `maxTokensPerSubAct` (should be smaller than Act, e.g., 300-600)

---

## Correct Architecture Design

### Option A: Hierarchical Segmentation (2-Level)

```
Level 1: AISegmentation → Acts (600-1500 tokens)
  ↓ (for each Act)
Level 2: Binary splitting → SubActs (200-600 tokens)

Database Result:
- Act 1: 1200 tokens
  - SubAct 1.1: 400 tokens
  - SubAct 1.2: 400 tokens
  - SubAct 1.3: 400 tokens
```

### Option B: Flat then Aggregate (Preferred)

```
Level 1: AISegmentation → SubActs only (300-600 tokens)
  ↓
Level 2: Aggregate consecutive SubActs → Acts (600-1500 tokens)

Database Result:
- Act 1: (aggregate of 2-3 SubActs)
  - SubAct 1: 400 tokens
  - SubAct 2: 500 tokens
  - SubAct 3: 300 tokens
```

---

## Impact of Bug

### What This Breaks

1. **Translation Scope Confusion:**
   - Acts used for analysis + glossary extraction
   - SubActs used for translation
   - With identical content, no actual subdivision benefit

2. **Database Bloat:**
   - Duplicate storage of identical text
   - Wasted space in `rawText` columns

3. **Potential API Issues:**
   - When translating a SubAct, Act already has identical text
   - When updating translated text, hierarchy is confused
   - Aggregation from SubActs → Act becomes meaningless

4. **Analysis Scope Problem:**
   - Analysis runs on Acts
   - But if Act = SubAct (content-wise), analysis scope is wrong
   - Glossary extraction at wrong granularity

---

## Recommended Fix

### Step 1: Add SubAct Configuration

```javascript
// backend/config/segmentation.js
boundaries: {
  // ACTS: narrative/analysis scope
  minTokensPerAct: 800,
  minUnifiedWordsPerAct: 600,
  maxTokensPerAct: 1500,
  maxUnifiedWordsPerAct: 1200,

  // SUBACTS: translation atomic units (NEW)
  minTokensPerSubAct: 200,
  minUnifiedWordsPerSubAct: 150,
  maxTokensPerSubAct: 600,
  maxUnifiedWordsPerSubAct: 500,
}
```

### Step 2: Implement Hierarchical Segmentation

Replace `createActs` with proper 2-level segmentation:

```javascript
async createActs(chapterId, paragraphs, segmentation, language = "zh") {
  const { groups } = segmentation;  // These are Acts

  let actSequence = 1;
  const createdActs = [];

  for (const actParagraphs of groups) {
    const actText = actParagraphs.map((p) => p.text).join("\n\n");

    // 1. Create Act
    const act = await this.createSingleAct({
      chapterId,
      sequence: actSequence++,
      rawText: actText,
    });

    // 2. Segment THIS Act into SubActs (smaller granularity)
    const MIN_SUBACT_TOKENS = 200;  // from config
    const subActGroups = await segmentToSize(
      actParagraphs,
      MIN_SUBACT_TOKENS,
      language
    );

    // 3. Create SubActs
    let subSequence = 1;
    for (const subActParagraphs of subActGroups) {
      const subText = subActParagraphs.map((p) => p.text).join("\n\n");
      await SubAct.create({
        actId: act.id,
        sequence: subSequence++,
        rawText: subText,  // Now SMALLER than Act
      });
    }

    createdActs.push(act);
  }

  return createdActs;
}
```

### Step 3: Verify Non-duplication

After fix, database should show:

```
Act 585: 1200 tokens (actParagraph[0:40])
  SubAct 1 (actId=585): 400 tokens (actParagraph[0:15])  ← Different!
  SubAct 2 (actId=585): 400 tokens (actParagraph[15:28]) ← Different!
  SubAct 3 (actId=585): 400 tokens (actParagraph[28:40]) ← Different!
```

---

## Database Query to Verify Bug

Check if any Act has a SubAct with identical content:

```sql
SELECT
  a.id as act_id,
  a.rawText as act_text,
  s.id as subact_id,
  s.rawText as subact_text,
  LENGTH(a.rawText) as act_length,
  LENGTH(s.rawText) as subact_length
FROM Acts a
JOIN SubActs s ON s.actId = a.id
WHERE a.rawText = s.rawText
LIMIT 10;
```

If this returns rows, the bug is confirmed.

---

## Next Steps

1. ✅ Identify all affected Acts (query above)
2. ✅ Add SubAct size constraints to config
3. ✅ Implement proper 2-level segmentation
4. ✅ Re-run Architect Phase 1 on affected chapters
5. ✅ Verify no more Act ↔ SubAct text duplication
