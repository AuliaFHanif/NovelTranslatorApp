# Anatomy Engine - Database Schema & Architecture

## Project Overview

**Anatomy Engine** is a 4-phase literary translation processor for Japanese/Chinese novels with an integrated glossary system. The system implements a sophisticated segmentation, profiling, and translation pipeline.

---

## Data Model

### **Series**

Represents a novel/translation project. Container for all chapters and glossary entries.

| Column      | Type            | Nullable | Validation                    | Default  | Description                                 |
| ----------- | --------------- | -------- | ----------------------------- | -------- | ------------------------------------------- |
| id          | INTEGER         | NO       | -                             | AUTO_INC | Primary key (auto-increment)                |
| title       | VARCHAR(255)    | NO       | notEmpty: "Title is required" | -        | Series title                                |
| genre       | VARCHAR(255)    | YES      | -                             | NULL     | Genre classification                        |
| description | TEXT            | YES      | -                             | NULL     | Series description/notes                    |
| language    | ENUM('ja','zh') | NO       | -                             | 'ja'     | Original language (Japanese or Chinese)     |
| createdAt   | TIMESTAMP       | NO       | -                             | NOW()    | Creation timestamp (auto-managed by ORM)    |
| updatedAt   | TIMESTAMP       | NO       | -                             | NOW()    | Last update timestamp (auto-managed by ORM) |

**Constraints:**

- Primary Key: `id`
- Foreign Keys: None (parent table)

**Relationships:**

- `hasMany` → Chapters
- `hasMany` → GlossaryEntries (series-scoped)

---

### **Chapters**

Individual chapters within a Series. Entry point for raw text during Phase 1 (Paste).

| Column    | Type         | Nullable | Validation                             | Default    | Description                              |
| --------- | ------------ | -------- | -------------------------------------- | ---------- | ---------------------------------------- |
| id        | INTEGER      | NO       | -                                      | AUTO_INC   | Primary key (auto-increment)             |
| seriesId  | INTEGER      | NO       | Foreign Key → Series.id (CASCADE)      | -          | Reference to parent Series               |
| number    | INTEGER      | NO       | min: 1 ("Chapter number must be >= 1") | -          | Chapter sequence number                  |
| title     | VARCHAR(255) | YES      | -                                      | 'Untitled' | Chapter title                            |
| rawText   | TEXT         | NO       | notEmpty: "Raw text cannot be empty"   | -          | Original pasted text (Phase 1 input)     |
| finalText | TEXT         | YES      | -                                      | NULL       | Translated output (populated by Phase 5) |
| createdAt | TIMESTAMP    | NO       | -                                      | NOW()      | Creation timestamp                       |
| updatedAt | TIMESTAMP    | NO       | -                                      | NOW()      | Last update timestamp                    |

**Constraints:**

- Primary Key: `id`
- Foreign Key: `seriesId` → `Series.id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- Unique Constraint: `(seriesId, number)` - prevents duplicate chapter numbers per series

**Indexes:**

- `(seriesId, number)` - ensures uniqueness and efficient series-chapter lookups

**Relationships:**

- `belongsTo` → Series
- `hasMany` → Acts
- `hasMany` → GlossaryEntries (chapter-scoped)

---

### **Acts**

Narrative segments extracted from each Chapter during Phase 2 (Architect). Represents a coherent scene or narrative unit.

| Column     | Type      | Nullable | Validation                          | Default  | Description                    |
| ---------- | --------- | -------- | ----------------------------------- | -------- | ------------------------------ |
| id         | INTEGER   | NO       | -                                   | AUTO_INC | Primary key (auto-increment)   |
| chapterId  | INTEGER   | NO       | Foreign Key → Chapters.id (CASCADE) | -        | Reference to parent Chapter    |
| order      | INTEGER   | NO       | min: 1 ("Act order must be >= 1")   | -        | Act sequence within chapter    |
| rawActText | TEXT      | YES      | -                                   | NULL     | Extracted segment from rawText |
| createdAt  | TIMESTAMP | NO       | -                                   | NOW()    | Creation timestamp             |
| updatedAt  | TIMESTAMP | NO       | -                                   | NOW()    | Last update timestamp          |

**Constraints:**

- Primary Key: `id`
- Foreign Key: `chapterId` → `Chapters.id` (ON DELETE CASCADE, ON UPDATE CASCADE)
- Unique Constraint: `(chapterId, order)` - prevents duplicate act numbers per chapter

**Indexes:**

- `(chapterId, order)` - ensures uniqueness and efficient chapter-act lookups

**Relationships:**

- `belongsTo` → Chapter
- `hasMany` → GlossaryEntries (act-scoped)

---

### **Glossaries**

Represents a term category or thematic grouping (e.g., "Main Characters", "Locations").

| Column         | Type         | Nullable | Validation                                | Default  | Description                                                 |
| -------------- | ------------ | -------- | ----------------------------------------- | -------- | ----------------------------------------------------------- |
| id             | INTEGER      | NO       | -                                         | AUTO_INC | Primary key (auto-increment)                                |
| name           | VARCHAR(255) | NO       | notEmpty: "Glossary name cannot be empty" | -        | Glossary category name                                      |
| type           | ENUM         | NO       | -                                         | -        | Type: `character`, `location`, `item`, `concept`            |
| language_notes | JSONB        | YES      | -                                         | NULL     | Language-specific metadata (pronunciation, etymology, etc.) |
| createdAt      | TIMESTAMP    | NO       | -                                         | NOW()    | Creation timestamp                                          |
| updatedAt      | TIMESTAMP    | NO       | -                                         | NOW()    | Last update timestamp                                       |

**Enum Values (type):**

- `character` - Character/person entries
- `location` - Place/location entries
- `item` - Object/item entries
- `concept` - Abstract concept/idea entries

**Constraints:**

- Primary Key: `id`
- Foreign Keys: None (parent table)

**Relationships:**

- `hasMany` → GlossaryEntries

---

### **GlossaryEntries**

Individual term/translation within a Glossary, scoped to Series/Chapter/Act level for hierarchical lookup priority.

| Column     | Type         | Nullable | Validation                               | Default  | Description                                         |
| ---------- | ------------ | -------- | ---------------------------------------- | -------- | --------------------------------------------------- |
| id         | INTEGER      | NO       | -                                        | AUTO_INC | Primary key (auto-increment)                        |
| glossaryId | INTEGER      | NO       | Foreign Key → Glossaries.id (CASCADE)    | -        | Reference to parent Glossary                        |
| scope      | ENUM         | NO       | -                                        | -        | Scope: `series`, `chapter`, `act`                   |
| scopeId    | INTEGER      | NO       | -                                        | -        | ID of scoped entity (seriesId, chapterId, or actId) |
| term_ja    | VARCHAR(255) | YES      | -                                        | NULL     | Japanese term                                       |
| term_zh    | VARCHAR(255) | YES      | -                                        | NULL     | Chinese term                                        |
| term_en    | VARCHAR(255) | NO       | notEmpty: "English term cannot be empty" | -        | English translation                                 |
| definition | TEXT         | YES      | -                                        | NULL     | Definition/notes                                    |
| metadata   | JSONB        | YES      | -                                        | NULL     | Additional metadata (context, aliases, etc.)        |
| createdAt  | TIMESTAMP    | NO       | -                                        | NOW()    | Creation timestamp                                  |
| updatedAt  | TIMESTAMP    | NO       | -                                        | NOW()    | Last update timestamp                               |

**Enum Values (scope):**

- `series` - Global glossary term (applies to entire series)
- `chapter` - Chapter-local term (overrides series-level)
- `act` - Act-specific term (highest priority)

**Constraints:**

- Primary Key: `id`
- Foreign Key: `glossaryId` → `Glossaries.id` (ON DELETE CASCADE, ON UPDATE CASCADE)

**Indexes:**

- `(glossaryId, scope, scopeId)` - efficient tiered lookup queries
- `(term_ja, term_zh)` - efficient term searches

**Relationships:**

- `belongsTo` → Glossary

**Lookup Priority (during Phase 3+):**

```
Act-level (most specific) ← Most recent override
  ↓ (if not found, fall through)
Chapter-level (mid-level)
  ↓ (if not found, fall through)
Series-level (global default) ← Least specific
```

---

## Entity Relationship Diagram

```
Series (1)
├── ╎ (1) ──→ (many) Chapters
│   │
│   └─→ Chapter (1)
│       ├── ╎ (1) ──→ (many) Acts
│       │   │
│       │   └─→ Act (1)
│       │
│       └─→ (scoped entries) GlossaryEntries
│
└─→ (scoped entries) GlossaryEntries

Glossary (1) ──→ (many) GlossaryEntries
```

---

## Enums Reference

### Series.language

```
'ja'  → Japanese source material
'zh'  → Chinese source material
```

### Glossary.type

```
'character'  → Character/person entries
'location'   → Place/location entries
'item'       → Object/item entries
'concept'    → Abstract concept/idea entries
```

### GlossaryEntry.scope

```
'series'  → Applies globally to entire series
'chapter' → Chapter-local (overrides series)
'act'     → Act-specific (highest priority)
```

---

## Database Connection

**Development Environment:**

- Engine: PostgreSQL
- Host: 127.0.0.1
- Port: 5432
- Database: `novel_translator_V4`
- User: `postgres`
- Password: `postgres`

**Configuration File:** `backend/config/config.json`

---

## Migration Status

✅ All 5 migrations executed successfully:

1. ✅ `20260326164643-create-series.js`
2. ✅ `20260326164743-create-chapter.js`
3. ✅ `20260326164924-create-act.js`
4. ✅ `20260326165156-create-glossary.js`
5. ✅ `20260326165221-create-glossary-entry.js`

All tables are now created in PostgreSQL and ready for application use.

---

## Implementation Notes

### Integer Primary Keys

All primary and foreign keys use `INTEGER` with `autoIncrement: true` rather than UUID for:

- Better join performance in PostgreSQL
- Simpler debugging and manual SQL queries
- Reduced storage overhead
- Easier index management

### JSONB Data Types

- `Series.language_notes` → stores pronunciation guides, etymology, language-specific metadata
- `GlossaryEntry.metadata` → stores context, aliases, usage frequency, pronunciation

### Validation at Schema Level

All validations are enforced at the database level with descriptive error messages:

- `chapter.rawText` - Cannot be empty (entry point for raw text)
- `chapter.number` - Minimum value 1 (sequential numbering)
- `glossary.name` - Cannot be empty (category naming)
- `glossaryEntry.term_en` - Cannot be empty (required translation)

### Cascade Behavior

All foreign keys use `ON DELETE CASCADE` and `ON UPDATE CASCADE`:

- Deleting a Series cascades to delete all Chapters
- Deleting a Chapter cascades to delete all Acts and chapter-scoped GlossaryEntries
- Deleting a Glossary cascades to delete all GlossaryEntries

This ensures referential integrity and prevents orphaned records.

---

## Next Steps

1. **Backend Models** - Sequelize model files have been generated; add relationship definitions
2. **API Routes** - Create Express routes for CRUD operations on Series, Chapters, Acts
3. **LLM Proxy** - Implement LM Studio proxy endpoints
4. **Frontend Pages** - Build Vite SPA with editor and chapter management UI
5. **Database Seeding** - Create seed data for testing
   complete // Translation finalized

```

### **Act.status**

```

pending // Created during Phase 2, not yet processed
ready // Ready for MDA profiling (Phase 4)
profiled // MDA scores calculated
translated // LLM has generated translation

```

---

## Scope Enum (GlossaryEntry)

```

series // Global glossary (applies to all chapters)
chapter // Chapter-local glossary (overrides series-level)
act // Act-specific glossary (most specific, highest priority)

```

---

## Language Enum (Series)

```

ja // Japanese
zh // Chinese

```

---

## Type Enum (Glossary)

```

character // Character/person names
location // Place names, settings
item // Objects, artifacts, items
concept // Abstract concepts, ideas, themes

```

---

## Migration Strategy

Phase 1 creates all tables with their full schema immediately, even though some columns are populated by later phases:

- **Act table**: Created with empty rows until Phase 2 (Architect) populates it
- **GlossaryEntry table**: Created with empty rows until Phase 3 (Lexicographer) inserts extracted terms
- **Chapter.final_text**: Remains NULL until Phase 5 (Master Sculptor) generates translation

This prevents rearchitecting the database during phase transitions.

---

## Constraints

### Unique Constraints

- Chapter: `(seriesId, number)` - each series has one chapter per number
- Act: `(chapterId, order)` - each chapter has one act per order position

### Foreign Keys

- Chapter.seriesId → Series.id (CASCADE on delete)
- Act.chapterId → Chapter.id (CASCADE on delete)
- GlossaryEntry.glossaryId → Glossary.id (CASCADE on delete)

### Check Constraints

- Act.boundary_start >= 0
- Act.boundary_end > boundary_start
- Chapter.number >= 1
- Act.order >= 1
```
