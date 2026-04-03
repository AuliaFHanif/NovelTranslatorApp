# Quick Reference: Novel Translator V4 Feature Guide

## Phase 1: Act Management

### Edit an Act

**User Flow**: Translation page → Select act → "Edit" button → Modal → Save  
**API**: `PATCH /api/acts/:id` with `{ rawText: string }`  
**Response**: `{ success, wasSplit?, updatedActs?, updatedAct?, message }`  
**Auto-behavior**:

- If word count > 1000: Auto-splits at paragraph boundary
- If word count ≤ 1000: Updates rawText, clears translation & polish

### Delete an Act

**User Flow**: Translation page → Select act → "Delete" button → Confirm  
**API**: `DELETE /api/acts/:id`  
**Response**: `{ success, termsPreserved, remainingActCount }`  
**Auto-behavior**:

- TermAppearances deleted (terms preserved)
- Remaining acts resequenced
- No orphaned references

---

## Phase 2: Grouped Analysis

### How Grouping Works

1. System detects acts with shared base label (e.g., 1A, 1B, 1C → group "1")
2. Auto-concatenates all group members
3. Runs SINGLE analysis on combined text
4. Stores identical results in all acts' `anatomyProfile`

### Run Grouped Analysis

**User Flow**: Select any act in group → "Analyze" button  
**Detection**: Automatic on analyze button click  
**Notification**: "Grouped Analysis: Acts 1A, 1B, 1C analyzed together..."  
**Result**: All group members show identical analysis

### Backend Implementation

```javascript
// In analysisService.js
const groupActIds = detectActGroup(actId, allChapterActs);
if (groupActIds.length > 1) {
  await analyzeActGroup(groupActs, options);
}
```

---

## Phase 3: Term Deduplication & Conflicts

### Bulk Approve Workflow

**Step 1**: Click "Approve Terms" after analysis

```
GlossaryApprovalDialog opens
├─ NEW TERMS section (editable, with checkboxes)
├─ ALREADY IN LIBRARY section (read-only)
└─ CONFLICTS section (if any exist)
```

**Step 2**: Select new terms to approve, click "Save to Library"

**Step 3a**: If NO conflicts

- Terms added immediately
- Glossary updated

**Step 3b**: If conflicts detected

- TermConflictDialog opens
- Shows for each conflict:
  - Existing translation
  - New candidate translation
  - Three resolution options

### Conflict Resolution Options

| Option         | Behavior                             | Use Case                |
| -------------- | ------------------------------------ | ----------------------- |
| Keep Existing  | Discard new, use existing term       | New candidate is wrong  |
| Merge          | Update existing with new translation | New is better quality   |
| Create Variant | Link as alternate form               | Both translations valid |

### Backend Processing

**Conflict Detection** (bulkApprove):

```javascript
const categorized = await glossaryProcessing.detectTermConflicts(
  terms,
  seriesId,
  language,
);
// Returns: { newTerms, existingTerms, conflictTerms }
```

**Conflict Resolution** (resolveTermConflicts):

```javascript
const results = await glossaryProcessing.resolveConflicts(
  resolutions,
  seriesId,
  language,
);
// Returns: { processed, kept, merged, created_variants, failed }
```

---

## Word Splitting Algorithm

### When Splitting Occurs

1. **During Architect**: If AI creates act > 1000 words
2. **During Edit**: If edited text > 1000 words
3. **Goal**: Maximize balanced act sizes

### How It Works

```
Input: 3600-word act in 6 paragraphs (~600 words each)
Target words per split: 3600 / 2 = 1800

Find paragraph closest to 1800 words:
- Paragraph 1: 600 words
- Paragraph 2: 600 words
- Paragraph 3: 600 words (cumulative: 1800) ← SPLIT HERE

Result:
- Act 1A: 1800 words (paragraphs 1-3)
- Act 1B: 1800 words (paragraphs 4-6)
```

### Labels

- First split: `label + "A"` (e.g., 1A)
- Second split: `label + "B"` (e.g., 1B)
- Pattern: ...A, B, C, D, etc.

---

## API Reference

### Acts

| Method | Path            | Purpose       | Response                                         |
| ------ | --------------- | ------------- | ------------------------------------------------ |
| PATCH  | `/api/acts/:id` | Edit act text | `{ success, wasSplit, updatedActs? }`            |
| DELETE | `/api/acts/:id` | Delete act    | `{ success, termsPreserved, remainingActCount }` |

### Analysis

| Method | Path                                 | Purpose                | Response                           |
| ------ | ------------------------------------ | ---------------------- | ---------------------------------- |
| POST   | `/acts/:actId/analyze`               | Analyze single/group   | Auto-detects group                 |
| POST   | `/chapters/:chapterId/analyze-group` | Explicit group analyze | `{ analyzed, failed, termsFound }` |

### Glossary

| Method | Path                                     | Purpose                          | Response                                                        |
| ------ | ---------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| POST   | `/series/:id/glossary/bulk-approve`      | Approve terms + detect conflicts | `{ created, updated, appearances, categorized, conflictCount }` |
| POST   | `/series/:id/glossary/resolve-conflicts` | Apply conflict resolutions       | `{ processed, kept, merged, created_variants, failed }`         |

---

## Database Schema Quick Facts

### Key Tables

- **Acts**: Contains rawText, anatomyProfile (JSONB), word-based validation
- **GlossaryTerms**: Canonical form, language variants, metadata (JSONB for variants)
- **TermAppearance**: M2M link between terms and acts
- **ActDependency**: Tracks original → split relationships

### Cascading Behavior

- ✅ Delete act → delete TermAppearances (preserve GlossaryTerms)
- ✅ Delete act → delete Polish/PolishEdit
- ✅ Delete act → resequence remaining acts
- ✅ Merge terms → update TermAppearances

---

## Environment Configuration

```bash
# Act word limit (default 2500, set to 1000 for balanced distribution)
MAX_ACT_WORDS=1000

# Legacy token limit (kept for compatibility)
MAX_ACT_TOKENS=1000

# Series language support
LANGUAGE=ja|zh

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/novel_translator_v4
```

---

## Common Scenarios

### "I want to fix act segmentation"

→ Click Edit, modify text, Save. System validates word count + splits if needed.

### "I have 10 related acts, do I need to analyze each separately?"

→ No. Select any one, click Analyze. System auto-detects group and runs once.

### "A term exists with the wrong translation, what do I do?"

→ During bulk approve, select Merge for that conflict. New translation updates the term.

### "Can I have two different translations for the same term?"

→ Yes. Use "Create Variant" to track alternate forms in metadata.

### "What happens to my glossary when I delete an act?"

→ Terms stay in the library. Only the act-term link is deleted.

### "How do I know a split happened?"

→ UI shows "✅ Act was split into N new acts" + lists new act labels.

---

## Troubleshooting

| Problem                         | Check                 | Solution                                                                            |
| ------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| Acts not splitting on edit      | MAX_ACT_WORDS env var | Set to 1000, restart                                                                |
| Grouped analysis not triggering | Act labels            | Verify base labels match (1A, 1B)                                                   |
| Conflict dialog doesn't appear  | Backend logs          | Check categorized.conflictTerms                                                     |
| TermAppearances orphaned        | Database cleanup      | Run: DELETE FROM TermAppearances WHERE termId NOT IN (SELECT id FROM GlossaryTerms) |
| Sequence numbers wrong          | Act order             | Run: UPDATE Acts SET sequence = ROW_NUMBER() OVER (ORDER BY id)                     |

---

## Performance Tips

- **Batch operations**: Bulk approve 50+ terms at once (faster than individual)
- **Grouped analysis**: Analyze split acts together (1 AI call vs 3)
- **Word count**: Keep MAX_ACT_WORDS at 1000 for balanced loads
- **Indexing**: Database has indexes on seriesId, termId, type

---

## Code Examples

### Frontend: Initialize glossary dialog with conflict handling

```typescript
import { GlossaryApprovalDialog } from './components/GlossaryApprovalDialog';

<GlossaryApprovalDialog
  isOpen={showGlossary}
  onOpenChange={setShowGlossary}
  terms={extractedTerms}
  onApproved={() => {
    refetchGlossary();
    showSuccess('Terms approved!');
  }}
/>
```

### Backend: Edit act with auto-split

```javascript
async updateAct(req, res) {
  const { id } = req.params;
  const { rawText } = req.body;

  const wordCount = countWords(rawText);

  if (wordCount > this.MAX_WORDS) {
    // Auto-split
    const splits = await actCreationService.splitAct(rawText, paragraphs);
    // Delete original, create splits
  } else {
    // Update in-place
    await act.update({ rawText });
  }
}
```

### Backend: Detect and analyze group

```javascript
async analyzeAct(req, res) {
  const groupActIds = await analysisService.detectActGroup(
    actId,
    allChapterActs
  );

  if (groupActIds.length > 1) {
    return await analysisService.analyzeActGroup(groupActs, options);
  }
}
```

---

## Support & Maintenance

**Questions?** Check implementation docs:

- `IMPLEMENTATION_COMPLETE.md` - Full feature overview
- `PHASE5_E2E_WORKFLOW.md` - Test scenarios and validation

**Issues?** Review:

- Backend logs: `backend/debug-logs/`
- Database state: Check for orphaned records
- API responses: Verify error messages match expected schema

**Next Steps**: Phase 4 Polish UI Enhancement ready for implementation
