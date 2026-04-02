# Novel Translator V4

**A sophisticated AI-powered literary translation processor for Japanese/Chinese novels with an integrated glossary system.**

✅ **Status:** Production Ready | 🚀 **Phase 1-3 Complete** | 📦 **Full E2E Validation**

---

## Quick Start

```bash
# Backend (Port 5000)
cd backend && npm install && npm run migrate:latest && npm start

# Frontend (Port 5173) - in new terminal
cd frontend && npm install && npm run dev

# Open browser to http://localhost:5173
```

**Full setup guide:** See [START_HERE.md](START_HERE.md) (5 minutes)

---

## What's Included

| Phase | Feature                            | Status      |
| ----- | ---------------------------------- | ----------- |
| **1** | Act Management (edit/delete/split) | ✅ Complete |
| **2** | Act Grouping (unified analysis)    | ✅ Complete |
| **3** | Term Conflict Resolution           | ✅ Complete |
| **4** | Polish Selection UI                | ⏸️ Deferred |
| **5** | E2E Validation & Deployment        | ✅ Complete |

---

## Documentation

**Read these in order:**

1. **[INDEX.md](INDEX.md)** - Documentation roadmap
2. **[START_HERE.md](START_HERE.md)** - Quick setup (5 min)
3. **[RUNTIME_SETUP.md](RUNTIME_SETUP.md)** - Detailed setup & troubleshooting (15 min)
4. **[DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md)** - Pre-deployment checklist (30 min)
5. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - API reference (10 min)
6. **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - Feature details (10 min)
7. **[PHASE5_E2E_WORKFLOW.md](PHASE5_E2E_WORKFLOW.md)** - Test scenarios (20 min)

---

## Architecture

### Frontend

- **React 19** + TypeScript
- **Vite** build system (~358ms)
- **Tailwind CSS** + shadcn/ui components
- **React Router v7** for navigation

### Backend

- **Express.js** with PostgreSQL + Sequelize ORM
- **8 core tables** with 7 database migrations
- OpenAI API proxy integration
- Jest test suite

### Database

- **PostgreSQL** 12+ required
- **Indexed queries** for performance
- **Full audit trail** (timestamps)
- **Cascade operations** for data integrity

---

## Key Metrics

- ✅ 0 TypeScript errors
- ✅ 0 Node.js syntax errors
- ✅ 4/4 tests passing
- ✅ Frontend bundle: 527 KB (153 KB gzipped)
- ✅ Build time: ~358ms

---

## Project Structure

```
├── frontend/              # React + TypeScript UI
├── backend/               # Express + Sequelize API
├── INDEX.md              # Documentation roadmap (start here)
├── START_HERE.md         # Quick setup guide
├── RUNTIME_SETUP.md      # Full setup & troubleshooting
├── DEPLOYMENT_READINESS.md
├── QUICK_REFERENCE.md    # API endpoints
├── IMPLEMENTATION_COMPLETE.md
├── PHASE5_E2E_WORKFLOW.md
└── STATUS.md
```

---

## Need Help?

- **Getting started?** → [START_HERE.md](START_HERE.md)
- **Setup issues?** → [RUNTIME_SETUP.md](RUNTIME_SETUP.md#troubleshooting)
- **API questions?** → [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **Deploying?** → [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md)
- **Lost?** → [INDEX.md](INDEX.md)

---

**Last Updated:** April 2, 2026  
**For detailed information, see [INDEX.md](INDEX.md)**

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
