## Database Schema Audit - April 3, 2026

### Active Tables (NEEDED)

#### Core Structure

1. **Series** - Novel/project container
   - Usage: ✅ Heavy (translations, glossary, chapters)
   - Models: Series.js
   - Migration: 20260327200000+

2. **Genre** - Classification for storytelling context
   - Usage: ✅ Light (reference only)
   - Models: genre.js
   - Migration: 20260327200000

3. **AIModel** - LLM config and model selection
   - Usage: ✅ Heavy (routing all AI calls)
   - Models: aimodel.js
   - Migration: 20260327200001

4. **Chapter** - Story structure (collection of Acts)
   - Usage: ✅ Heavy (translation, analysis, display)
   - Models: chapter.js
   - Migration: 20260329000000

#### Segmentation & Analysis

5. **Act** - Major narrative unit
   - Usage: ✅ Heavy (core workflow)
   - Models: act.js
   - Associations: Chapter, SubActs, Analysis, TermAppearances, ActDependency, Polish, PolishEdit
   - Migration: 20260329000000, 20260403000000

6. **SubAct** - Atomic translation unit (~1500 tokens)
   - Usage: ✅ Heavy (new hierarchical workflow)
   - Models: SubAct.js
   - Associations: Act, TermAppearances, Analysis
   - Migration: 20260403000000

7. **Analysis** - Narrative/linguistic profile storage
   - Usage: ✅ Medium (analysis workflow)
   - Models: Analysis.js
   - Migration: 20260403000000

#### Glossary Management

8. **GlossaryTerm** - Approved terminology database
   - Usage: ✅ Heavy (term extraction, translation)
   - Models: GlossaryTerm.js
   - Associations: Series, TermAppearances
   - Migration: 20260329000000

9. **TermAppearance** - Junction table (Term ↔ Act/SubAct)
   - Usage: ✅ Heavy (new schema, term tracking)
   - Models: TermAppearance.js
   - Fields: termId, actId, subActId, contextSnippet, confidence, frequency
   - Associations: GlossaryTerm, Act, SubAct
   - Migration: 20260403000000, **20260403000002 (MISSING COLUMNS)**

#### Translation Workflow

10. **Polish** - Translation refinement/polish edits
    - Usage: ✅ Medium (quality control)
    - Models: Polish.js
    - Associations: Act, SubAct, PolishEdit
    - Migration: 20260331000000, 20260403000000

11. **PolishEdit** - Individual edit recommendations
    - Usage: ✅ Medium (edit suggestions)
    - Models: PolishEdit.js
    - Migration: 20260330010000

#### Dependencies

12. **ActDependency** - Narrative dependency tracking
    - Usage: ✅ Light (primarily stored but not actively queried)
    - Models: ActDependency.js
    - Migration: 20260402000000

---

### Required Columns by Table

#### TermAppearances (PRIORITY)

- ✅ termId (FK)
- ✅ actId (FK, nullable)
- ✅ subActId (FK, nullable)
- ❌ contextSnippet (MISSING - TEXT)
- ❌ confidence (MISSING - FLOAT, default 1.0)
- ❌ frequency (MISSING - INT, default 1)
- ✅ createdAt, updatedAt

#### SubActs

- ✅ id (PK)
- ✅ actId (FK)
- ✅ sequence (INT)
- ✅ rawText (TEXT)
- ✅ translatedText (TEXT, nullable)
- ✅ tokenCount (INT, default 0)
- ✅ charCount (INT, default 0)
- ✅ createdAt, updatedAt

#### Analysis

- ✅ id (PK)
- ✅ actId (FK, unique)
- ✅ anatomyProfile (JSONB)
- ✅ scope (ENUM: 'act', 'subact', default 'act')
- ✅ createdAt, updatedAt

---

### Migration Status

| Migration File                                 | Purpose            | Status        |
| ---------------------------------------------- | ------------------ | ------------- |
| 20260327200000-create-genre.js                 | Initial schema     | ✅            |
| 20260327200001-create-ai-model.js              | AI config          | ✅            |
| 20260329000000-core-schema-v2.js               | Core tables        | ✅            |
| 20260329000001-remove-legacy-translation.js    | Schema cleanup     | ✅            |
| 20260330000000-add-translated-text-to-acts.js  | Translation fields | ✅            |
| 20260330010000-create-polish-edits.js          | Polish edits       | ✅            |
| 20260331000000-create-polishes-table.js        | Polishes table     | ✅            |
| 20260402000000-add-split-from-dependency.js    | Act dependencies   | ✅            |
| 20260403000000-hierarchical-segmentation-v3.js | SubActs + Analysis | ⚠️ INCOMPLETE |
| 20260403000001-add-analyzed-status.js          | Status enum        | ✅            |
| 20260403000002-add-term-appearance-fields.js   | **NEEDS CREATION** | ❌            |

---

### Clean Remigration Strategy

**Order to create:**

1. Genre → AIModel → Series → Chapter
2. Act (with segmentationDepth)
3. SubAct
4. Analysis
5. GlossaryTerm → TermAppearance (WITH all columns)
6. Polish → PolishEdit
7. ActDependency
8. Status/Enum fixes

**Delete if remigrating from scratch:**

- None - all tables are actively used

**Columns to ensure in final schema:**

- ✅ TermAppearances: Add contextSnippet, confidence, frequency
- ✅ Acts: Verify segmentationDepth exists
- ✅ Polishes: Verify subActId, scope fields exist
- ✅ Analysis: Create with proper schema

---

### Recommendation

**Current Issue:** Migration 20260403000000 created TermAppearances but didn't include the columns the model defines.

**Solution:**

- Create migration 20260403000002 to add missing columns (already done)
- Run: `npx sequelize-cli db:migrate`
- If remigrating from scratch, create a fresh migration combining all into one for clarity

**Optional cleanup:** None - schema is lean and focused. All 12 tables serve active purposes.
