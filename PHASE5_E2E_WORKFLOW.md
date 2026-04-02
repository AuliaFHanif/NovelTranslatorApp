# Phase 5: Integration & E2E Workflow Validation

**Date**: April 2, 2026  
**Status**: Complete implementation validation across all phases

## Complete Feature Workflow

### Test Scenario 1: Create Chapter → Architect → Split Acts → Edit → Grouped Analysis

**Setup**: Create a new series and chapter

**Steps**:

1. **Create Series**: Add series with title, language (ja/zh)
2. **Create Chapter**: Add chapter with raw text
3. **Run Architect Phase**: Segment chapter into acts
   - ✅ System should create multiple acts with labels (1, 2, 3, etc.)
   - ✅ Acts should split intelligently at paragraph boundaries
   - ✅ Word counts should respect MAX_ACT_WORDS (1000)

4. **Verify Act Splitting**:
   - If AI creates act > 1000 words, auto-split occurs
   - Acts labeled with suffixes (1A, 1B, 1C etc.)
   - ActDependency chain created linking splits
   - ✅ No acts exceed 1000-word limit

5. **Edit Act Text (Phase 1)**:
   - Select Act 1 → Click Edit button
   - Modify raw text (trim/fix segmentation)
   - Click Save
   - If new word count > 1000, system auto-splits
   - ✅ Edited act updated or split as needed
   - ✅ Translation cleared (invalidate downstream)
   - ✅ Polish edits cleared

6. **Delete Act (Phase 1)**:
   - Select Act 2 → Click Delete
   - Confirm deletion
   - ✅ Act hard-deleted from database
   - ✅ Terms preserved in library (TermAppearance records kept)
   - ✅ Remaining acts resequenced (1, 3, 4 → 1, 2, 3)

7. **Run Grouped Analysis (Phase 2)**:
   - Select Act 1A (part of split group 1)
   - Click "Analyze Acts"
   - ✅ System detects group (1A, 1B, 1C share base label "1")
   - ✅ Shows toast: "Grouped Analysis: Analyzing Acts 1A, 1B, 1C together..."
   - ✅ Single analysis run on concatenated text
   - ✅ Identical results stored in all acts' anatomyProfile
   - Act 1A, 1B, 1C all show same term extraction and narrative analysis

### Test Scenario 2: Glossary Term Management & Conflict Resolution (Phase 3)

**Prerequisite**: Analysis complete with term extraction

**Steps**:

1. **View New Terms**:
   - Translation page shows "New Terms" badge
   - Click to open GlossaryApprovalDialog
   - ✅ Shows extracted candidates in editable list

2. **Detect Term Category**:
   - Some terms are brand new
   - Some terms already exist in library (from previous chapters)
   - Some terms conflict (exist with different English translations)
   - ✅ Frontend receives `categorized` result from backend:
     - `newTerms` (3 terms) - NEW section: editable with checkboxes
     - `existingTerms` (2 terms) - ALREADY IN LIBRARY section: read-only
     - `conflictTerms` (1 term) - CONFLICTS section: pre-conflict

3. **Approve New Terms**:
   - Check all checkboxes in NEW section
   - Edit translations as needed
   - Uncheck existing/conflict terms (already handled)
   - Click "Save to Library"
   - ✅ New terms added to glossary with status='approved'
   - ✅ TermAppearance records created for each act
   - ✅ Series glossary grows

4. **Resolve Conflicts**:
   - If conflicts exist, TermConflictDialog opens
   - For each conflict, select resolution:
     - **Option A: Keep Existing** - discard new, use existing translation
     - **Option B: Merge** - update existing term with new translation
     - **Option C: Create Variant** - link as variant of existing term
   - Click "Apply Resolutions"
   - ✅ Backend processes resolutions:
     - Existing terms updated with merged translations
     - Variant forms added to metadata
     - TermAppearances recorded for all resolutions
   - ✅ Success toast: "Resolved 1 conflict: 0 kept, 1 merged, 0 variants created"
   - ✅ Glossary state consistent across series

5. **Verify Glossary Consistency**:
   - Open Library tab
   - ✅ All approved terms visible
   - ✅ No duplicate canonical forms
   - ✅ Variant relationships tracked in metadata
   - ✅ Appearance count reflects all acts using term

### Test Scenario 3: Word Splitting with Intelligent Paragraph Boundaries

**Input**: Chapter with 3600 words in 6 paragraphs (~600 words each)

**Expected**: Should split into 2 acts (1A, 1B) around 1800 words each

**Steps**:

1. Create chapter with multi-paragraph text
2. Run architect phase
3. Verify splits:
   - ✅ Split 1 (1A): ~1800 words, ends at paragraph boundary
   - ✅ Split 2 (1B): ~1800 words, starts at paragraph boundary
   - ✅ No mid-paragraph breaks
   - ✅ ActDependency records created

4. Edit Act 1A to add 500 words:
   - Total words now ~2300
   - Click Save
   - ✅ System detects > 1000 word limit
   - ✅ Auto-splits into 1A, 1A-split
   - ✅ Original 1A deleted
   - ✅ Two new acts created with proper labeling

### Test Scenario 4: Cascade Operations & Data Integrity

**Prerequisite**: Multi-phase workflow with terms and edits applied

**Steps**:

1. **Delete Act with Dependencies**:
   - Select Act with associated terms and polish edits
   - Delete act
   - ✅ Term TermAppearances deleted
   - ✅ Polish/PolishEdit records deleted
   - ✅ GlossaryTerms preserved
   - ✅ Remaining acts resequenced

2. **Edit Act That Invalidates Downstream**:
   - Select translated act (with finalized translation)
   - Edit raw text
   - Save (assume no split)
   - ✅ rawText updated
   - ✅ anatomyProfile.finalTranslation cleared
   - ✅ Polish records cleared
   - ✅ TermAppearances preserved
   - Translation pass must be re-run

3. **Grouped Analysis on Mixed State**:
   - Create group with Acts 1A, 1B
   - Run analysis on 1A and 1B
   - ✅ Both acts get identical analysis results
   - Delete Act 1B
   - ✅ Act 1A still has analysis intact
   - ✅ No orphaned references

## Technical Validation Checklist

### Database State

- [ ] No orphaned TermAppearance records (all reference valid terms/acts)
- [ ] No orphaned Polish/PolishEdit records
- [ ] ActDependency chains valid (references exist)
- [ ] Sequence numbers continuous per chapter
- [ ] Act labels follow expected pattern (1, 2, 1A, 1B, etc.)

### Act Management (Phase 1)

- [ ] Edit act preserves terms in library
- [ ] Edit act clears downstream translation/polish
- [ ] Delete act removes only specific records
- [ ] Word count enforcement working (MAX_ACT_WORDS=1000)
- [ ] Intelligent paragraph-aware splitting functional
- [ ] Auto-split on edit when > MAX_WORDS

### Grouped Analysis (Phase 2)

- [ ] detectActGroup() correctly identifies base label
- [ ] analyzeActGroup() concatenates texts properly
- [ ] Results distributed to all group members
- [ ] anatomyProfile identical across group
- [ ] Single analysis run per group (not per act)

### Term Deduplication (Phase 3)

- [ ] detectTermConflicts() categorizes correctly
- [ ] Conflicts don't prevent approval (handled separately)
- [ ] resolveConflicts() processes all three strategies
- [ ] Variant metadata populated correctly
- [ ] TermAppearance records created for all resolutions

### Word Splitting

- [ ] Acts never exceed 1000 words
- [ ] Splits happen at paragraph boundaries
- [ ] Split labels follow pattern (1A, 1B, 1C)
- [ ] ActDependency tracks original → splits
- [ ] Edit on split group splits further if needed

### API Contracts

- [ ] PATCH /acts/:id returns { success, wasSplit, updatedActs? }
- [ ] DELETE /acts/:id returns { success, termsPreserved, remainingActCount }
- [ ] POST /chapters/:chapterId/analyze-group returns grouped results
- [ ] POST /series/:seriesId/glossary/bulk-approve returns categorized terms
- [ ] POST /series/:seriesId/glossary/resolve-conflicts returns resolution stats

## Manual Test Procedures

### Quick Validation (15 minutes)

1. Create series with short test chapter (2000 words)
2. Run architect → verify acts created
3. Edit one act → verify saves with validation
4. Delete one act → verify resequencing
5. Run analysis → verify results store

### Full Workflow (60 minutes)

1. Create series and chapter with 5000+ words
2. Architect into multiple acts
3. Some acts auto-split (> 1000 words)
4. Edit acts to verify word limit + splitting
5. Delete acts to verify cascade
6. Run grouped analysis on split acts
7. Verify all group members get same results
8. Extract terms from analysis
9. Show conflicts in approval dialog
10. Resolve conflicts with different strategies
11. Verify glossary state consistent

### Edge Cases

1. **Empty act deletion**: Can delete acts with no dependencies
2. **Last act deletion**: Acts cannot be reduced to zero
3. **Max group size**: Analyze 10+ acts in single group
4. **Variant recursion**: Create variant of variant (should flatten)
5. **Concurrent edits**: Two users edit different acts simultaneously (should be independent)

## Success Criteria

All phases working together:

- ✅ Acts can be created, edited, deleted without data loss
- ✅ Word limits enforced with intelligent splitting
- ✅ Grouped analysis shares results across related acts
- ✅ Terms extracted and approved with conflict handling
- ✅ No orphaned or inconsistent database records
- ✅ Cascade deletes preserve glossary
- ✅ All API endpoints respond correctly
- ✅ Frontend reflects all backend changes

## Known Limitations / Future Work

- Polish selection UI enhancement (Phase 4) not yet implemented
- Batch conflict resolution UI could be more polished
- Word splitting doesn't support right-to-left text layout (Japanese/Chinese)
- No undo functionality for deletions
- Concurrent user edits could create conflicts (needs optimistic locking)

## Deployment Checklist

- [ ] All Phases 1-3 code deployed
- [ ] Database migrations run successfully
- [ ] Environment variables set (MAX_ACT_WORDS=1000)
- [ ] Manual E2E tests pass
- [ ] No console errors in browser/terminal
- [ ] API response times acceptable (< 2s)
- [ ] Database queries optimized
