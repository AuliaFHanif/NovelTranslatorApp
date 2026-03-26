# 📋 Anatomy Engine - Phase 1: Foundation Build (Monorepo)

## TL;DR

Build a flexible, modular monorepo foundation:

- **Frontend**: Vite + React 18 + Tailwind + Shadcn/UI (port 5173)
- **Backend**: Node.js + Express + PostgreSQL + Sequelize (port 5000)
- **LLM Proxy**: LM Studio integration (localhost:1234)
- **Core Feature**: Paste-to-DB editor with metadata ingestion
- **Verified Stack**: Both servers running, database connected, user flows working

---

## Project Structure

```
StandaloneNovelTranslatorV4/  (monorepo root)
├── frontend/                        # Vite + React 18 + Tailwind + Shadcn
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                  # Shadcn/UI components
│   │   │   ├── Editor.tsx           # Reusable paste editor
│   │   │   └── ChapterDisplay.tsx   # Chapter viewer
│   │   ├── pages/
│   │   │   ├── Translate.tsx        # Main paste editor page
│   │   │   ├── Chapter.tsx          # Chapter view + sidebar
│   │   │   ├── Home.tsx             # Landing page
│   │   │   └── Layout.tsx           # Root layout
│   │   ├── api/
│   │   │   └── client.ts            # API client (fetch wrapper)
│   │   ├── store/
│   │   │   └── useGlobalStore.ts    # Zustand state management
│   │   ├── App.tsx                  # Main app component
│   │   ├── main.tsx                 # Entry point
│   │   └── index.css                # Global + Tailwind styles
│   ├── public/                      # Static assets
│   ├── vite.config.ts               # Vite configuration
│   ├── tsconfig.json                # TypeScript + path aliases
│   ├── tailwind.config.ts           # Tailwind config
│   ├── postcss.config.ts            # PostCSS (for Tailwind)
│   ├── package.json
│   └── .env.local                   # Frontend env (VITE_API_BASE_URL)
│
├── backend/                         # Express + PostgreSQL + Sequelize
│   ├── src/
│   │   ├── db/
│   │   │   ├── models/
│   │   │   │   ├── index.ts         # Export all models
│   │   │   │   ├── User.ts
│   │   │   │   ├── Series.ts
│   │   │   │   ├── Chapter.ts
│   │   │   │   ├── Act.ts
│   │   │   │   ├── Glossary.ts
│   │   │   │   └── GlossaryEntry.ts
│   │   │   ├── sequelize.ts         # Sequelize instance + config
│   │   │   └── migrations/
│   │   │       └── [timestamps]_create-tables.js
│   │   ├── routes/
│   │   │   ├── chapters.ts          # GET /chapters/:id, POST /chapters
│   │   │   ├── series.ts            # GET /series, POST /series
│   │   │   ├── proxy.ts             # POST /api/llm, GET /api/health
│   │   │   └── index.ts             # Route aggregation
│   │   ├── controllers/
│   │   │   ├── ChapterController.ts # Chapter CRUD logic
│   │   │   ├── SeriesController.ts  # Series logic
│   │   │   └── LLMController.ts     # LM Studio proxy handler
│   │   ├── services/
│   │   │   ├── LLMService.ts        # LM Studio API client
│   │   │   └── GlossaryService.ts   # Glossary injection (Phase 3+)
│   │   ├── utils/
│   │   │   ├── api-error.ts         # Error response utilities
│   │   │   └── logger.ts            # Logging setup
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts      # Global error middleware
│   │   │   └── cors.ts              # CORS config
│   │   ├── app.ts                   # Express app setup
│   │   └── server.ts                # Server entry point (listen on 5000)
│   ├── .env.local                   # Backend env (DB, LM_STUDIO_URL, PORT)
│   ├── tsconfig.json                # TypeScript config
│   ├── nodemon.json                 # Nodemon (auto-restart on file change)
│   └── package.json
│
├── package.json                     # Monorepo root (npm workspaces)
├── PLAN.md                          # This file
└── .gitignore
```

---

## Steps

### **1.1 Monorepo Scaffolding** (Root Setup)

- Create project structure with `/frontend` and `/backend` directories
- Create root `package.json` with npm workspaces
- Setup concurrent dev script: `npm run dev` (runs both servers with concurrently or similar)
- Initialize Git + `.gitignore` at root
- Create individual `package.json` in both `/frontend` and `/backend`

### **1.2 Frontend Setup (Vite)** _(depends on 1.1)_

- Initialize Vite: `npm create vite frontend -- --template react-ts`
- Navigate to `/frontend` → `npm install`
- Install dependencies: Tailwind CSS, Shadcn/UI, React Router, Zustand, React Query
- Configure Tailwind (generate `tailwind.config.ts`, `postcss.config.ts`)
- Configure tsconfig with path aliases (`@/components`, `@/api`, `@/store`)
- Create `.env.local`: `VITE_API_BASE_URL=http://localhost:5000`
- Setup Vite to run on port 5173 (default)

### **1.3 Backend Setup (Express)** _(depends on 1.1)_

- Initialize Node.js + Express:
  - `npm init -y` in `/backend`
  - `npm install express typescript sequelize pg pg-hstore dotenv cors body-parser`
- Initialize TypeScript: `npx tsc --init`
- Configure tsconfig (strict mode, path aliases)
- Create `.env.local`: `DATABASE_URL`, `LM_STUDIO_URL=http://localhost:1234`, `PORT=5000`, `NODE_ENV=development`
- Setup basic Express app in `/backend/src/app.ts` with CORS middleware

### **1.4 Database Setup (PostgreSQL + Sequelize)** _(depends on 1.3)_

- Create PostgreSQL database locally (via DBeaver or `psql`)
- Initialize Sequelize: `npx sequelize-cli init` in `/backend`
- Create models in `/backend/src/db/models/`:
  - User, Series, Chapter, Act, Glossary, GlossaryEntry
- Define associations (Series → Chapters → Acts; tiered glossary)
- Create initial migration: `npx sequelize-cli migration:generate --name create-tables`
- Run migration: `npx sequelize-cli db:migrate`
- Seed database with 1 test Series + Chapter
- Verify connectivity via Node REPL

### **1.5 Backend Routes & Controllers** _(depends on 1.4)_

- Create `/backend/src/routes/chapters.ts`:
  - `POST /chapters` → ChapterController.create (save raw_text to DB)
  - `GET /chapters/:id` → ChapterController.fetchById
- Create `/backend/src/routes/series.ts`:
  - `GET /series` → SeriesController.list
  - `POST /series` → SeriesController.create
- Create `/backend/src/routes/proxy.ts`:
  - `POST /api/llm` → LLMController.forward (to LM Studio)
  - `GET /api/health` → LLMController.health (health check)
- Create controllers in `/backend/src/controllers/` with business logic
- Setup error handling middleware

### **1.6 LM Studio Proxy Service** _(can run in parallel with 1.5)_

- Create `/backend/src/services/LLMService.ts`:
  - Method: `forward(request)` → Routes to `http://localhost:1234/v1/chat/completions`
  - Handles OpenAI-compatible schema (model, messages, temperature, max_tokens)
  - Implement error handling (timeout, unreachable, invalid model)
  - Support streaming responses (ready for Phase 4+)
- Create `/backend/src/controllers/LLMController.ts`:
  - Route handlers for `/api/llm` and `/api/health`
- Document LM Studio setup in README (version, recommended models)

### **1.7 Backend Server** _(depends on 1.5, 1.6)_

- Create `/backend/src/server.ts`:
  - Express app listens on `http://localhost:5000`
  - On startup: verify database connection, log status
  - Health endpoint returns service status
- Test: `npm run dev:backend` → server starts successfully

### **1.8 Frontend Pages & Components** _(depends on 1.2)_

- Create `/frontend/src/pages/Translate.tsx`:
  - Textarea for raw text input
  - Series selector (dropdown, fetch from backend GET /series)
  - Chapter selector (existing or "Create New")
  - Submit button → POST to backend `/chapters`
  - Toast notifications (success/error)
- Create `/frontend/src/pages/Chapter.tsx`:
  - Fetch chapter data: GET `/chapters/:id`
  - Display raw_text
  - Sidebar navigation (stub for Phase 2+)
- Create `/frontend/src/components/Editor.tsx` (reusable paste editor component)
- Setup React Router in `/frontend/src/App.tsx` for navigation
- Create `/frontend/src/api/client.ts`: Fetch wrapper pointing to `VITE_API_BASE_URL`
- Create `/frontend/src/store/useGlobalStore.ts`: Zustand store for app state

### **1.9 Frontend Styling** _(depends on 1.8)_

- Install and initialize Shadcn/UI components (Button, Card, Textarea, Select, Toast)
- Add minimal global styles in `/frontend/src/index.css`
- Use Tailwind + Shadcn defaults (no custom theming yet)

### **1.10 Monorepo Scripts** _(depends on 1.7, 1.9)_

- Update root `package.json` with scripts:
  ```json
  {
    "scripts": {
      "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:backend\"",
      "dev:frontend": "cd frontend && npm run dev",
      "dev:backend": "cd backend && npm run dev",
      "build:frontend": "cd frontend && npm run build",
      "build:backend": "cd backend && npm run build",
      "migrate": "cd backend && npx sequelize-cli db:migrate"
    },
    "devDependencies": {
      "concurrently": "^8.0.0"
    }
  }
  ```
- Install `concurrently`: `npm install -D concurrently`

### **1.11 Verification** _(depends on 1.10)_

- Run `npm run dev` → both frontend (port 5173) + backend (port 5000) start
- Backend health check: `curl http://localhost:5000/api/health` → returns status
- Frontend navigation: Open `http://localhost:5173/` → routes work
- User flow test:
  - Navigate to `/translate`
  - Paste text + select series → Submit
  - Check backend logs: POST received
  - Verify in DBeaver: data saved to `Chapter` table
  - Navigate to `/chapter/:id` → raw_text displays
- Test LM Studio proxy: Manual POST to `/api/llm` with sample prompt

---

## User Flow

### **Primary User Journey: "Paste → Save → Review"**

```
START
  ↓
[Frontend: Navigate to /translate]
  ↓
[Editor Page Renders]
  • Textarea: "Paste raw text here..."
  • Series Selector (fetched from backend GET /series)
  • Chapter Selector (select existing or "Create New")
  • Submit Button: "Save Chapter"
  ↓
[User Pastes Text]
  • Text loaded into textarea
  • Series dropdown populated from DB
  ↓
[User Clicks "Save Chapter"]
  • Frontend validation: Text not empty? Series selected?
  • If invalid → Show error toast
  • If valid → POST to `http://localhost:5000/chapters`
  ↓
[Backend Processing]
  • API receives: { seriesId, chapterId?, raw_text, title?, number? }
  • ChapterController.create validates & stores in DB
  • Returns: { success: true, chapterId, createdAt }
  ↓
[Frontend UI Response]
  • Show success toast: "Chapter saved!"
  • Redirect to `/chapter/[chapterId]`
  ↓
[Chapter View Page]
  • Fetch chapter data: GET `/chapters/[chapterId]`
  • Display raw_text in main area
  • Sidebar: Navigation + CTA "Ready for next step?" (Phase 2+)
  ↓
END
```

### **Secondary Flows**

#### **Flow 2: Create New Series**

```
[Series Selector]
  ↓ (User clicks "+ Create New Series")
  ↓
[Modal Form]
  • Input: Series title
  • Input: Language (ja|zh)
  • Input: Description (optional)
  ↓
[Submit]
  • POST to `/series`
  • Backend creates new Series record
  • Returns { seriesId }
  • Frontend refreshes series list
  ↓
[User can now select new series]
```

---

## Logic Flow

### **API Endpoints & Database Logic**

#### **1. POST /chapters - Create/Update Chapter**

```
Request Body:
  {
    "seriesId": string (required),
    "chapterId": string (optional),
    "raw_text": string (required, >10 chars),
    "number": number (optional),
    "title": string (optional, default "Untitled")
  }

Process:
  1. Validation
     • If raw_text.length < 10 → 400 "Text too short"
     • If !seriesId → 400 "Series required"

  2. Verify Series exists
     • Query: SELECT * FROM Series WHERE id = ?
     • If not found → 404 "Series not found"

  3. Chapter Handling
     • If chapterId provided:
       - Query: SELECT * FROM Chapter WHERE id = ? AND seriesId = ?
       - If found: UPDATE SET raw_text = ?, updated_at = NOW()
       - Returns existing chapterId
       - Else: 409 "Chapter/Series mismatch"

     • If chapterId is null (create new):
       - Get next number: SELECT MAX(number) FROM Chapter WHERE seriesId = ?
       - nextNumber = (max || 0) + 1
       - INSERT into Chapter (seriesId, number, title, raw_text, status)
       - status = 'pending' (ready for Phase 2)
       - Returns new chapterId

  4. Response
     {
       "success": true,
       "chapterId": "ch-123",
       "message": "Saved",
       "createdAt": "2026-03-26T..."
     }

Error Codes:
  • 400: Validation error
  • 404: Series/Chapter not found
  • 409: Conflict (mismatch)
  • 500: DB error
```

#### **2. GET /chapters/:id - Fetch Chapter**

```
Process:
  1. Parse chapterId from URL
  2. Query: SELECT * FROM Chapter WHERE id = ?
     • Include: id, seriesId, number, title, raw_text, final_text, status, createdAt, updatedAt
     • Join: Series { id, title }
     • Include: related Acts (empty list for Phase 1)

  3. Response
     {
       "id": "ch-123",
       "seriesId": "series-1",
       "number": 1,
       "title": "Chapter 1",
       "raw_text": "...",
       "final_text": null,
       "status": "pending",
       "series": { "id": "series-1", "title": "My Novel" },
       "acts": [],
       "createdAt": "2026-03-26T...",
       "updatedAt": "2026-03-26T..."
     }

Error: 404 if chapter not found
```

#### **3. GET /series - List All Series**

```
Response:
  [
    {
      "id": "series-1",
      "title": "My Novel",
      "description": "A novel...",
      "language": "ja",
      "chapterCount": 5,
      "createdAt": "2026-03-26T..."
    },
    ...
  ]
```

#### **4. POST /series - Create Series**

```
Request Body:
  {
    "title": string (required),
    "language": "ja" | "zh" (required),
    "description": string (optional)
  }

Response:
  {
    "id": "series-1",
    "title": "New Series",
    "language": "ja",
    "createdAt": "2026-03-26T..."
  }
```

#### **5. POST /api/llm - Forward to LM Studio**

```
Request Body:
  {
    "model": string,                # LM Studio loaded model
    "messages": array,              # OpenAI format
    "temperature": 0.7,
    "max_tokens": 2000,
    "stream": boolean (optional)
  }

Process:
  1. Validate: model + messages required
  2. Forward to: http://localhost:1234/v1/chat/completions
  3. If stream=true → SSE chunks to client
  4. If stream=false → Return JSON response

Error Codes:
  • 400: Missing required fields
  • 503: LM Studio unreachable
  • 504: LM Studio timeout (>60s)
```

#### **6. GET /api/health - Health Check**

```
Process:
  1. Check Database: SELECT 1
  2. Check LM Studio: Ping http://localhost:1234/v1/models
  3. Return status

Response (healthy):
  {
    "status": "healthy",
    "services": {
      "database": "connected",
      "llm_studio": "connected",
      "timestamp": "2026-03-26T..."
    }
  }

Response (unhealthy):
  {
    "status": "unhealthy",
    "services": {
      "database": "disconnected",
      "llm_studio": "timeout",
      "errors": ["Cannot reach LM Studio at localhost:1234"]
    }
  }
```

---

## Database State Transitions

```
Chapter.status Lifecycle:
  pending           ← Created at Phase 1
    ↓
  extracted         ← Phase 2 (Architect) segments into Acts
    ↓
  profiled          ← Phase 3 (Profiler) scores MDA
    ↓
  translated        ← Phase 4 (Master Sculptor) generates final
    ↓
  complete
```

---

## Verification Checklist

### Local Environment

- [ ] PostgreSQL running (verify via DBeaver)
- [ ] LM Studio running on `localhost:1234`
- [ ] Node.js + npm installed (v18+)

### Setup

- [ ] `npm install` succeeds in root → installs both workspaces
- [ ] `npm run migrate` → Sequelize migrations run successfully
- [ ] DBeaver shows: Series, Chapter, Act, Glossary tables created
- [ ] Seed data visible: 1 test Series + 1 test Chapter

### Backend

- [ ] `npm run dev:backend` starts Express server on `http://localhost:5000`
- [ ] `curl http://localhost:5000/api/health` returns OK
- [ ] `npm run dev:backend` logs show: "Connected to PostgreSQL"

### Frontend

- [ ] `npm run dev:frontend` starts Vite on `http://localhost:5173`
- [ ] `http://localhost:5173/` loads without errors
- [ ] `/translate` page renders with Editor UI

### Integration

- [ ] `npm run dev` → both servers start simultaneously
- [ ] Navigate to `/translate` → Series dropdown loads from backend GET /series
- [ ] Paste text + select series → Submit POST to `/chapters`
- [ ] Backend logs show: POST received + DB insert
- [ ] Frontend redirects to `/chapter/[id]` → raw_text displays
- [ ] Verify in DBeaver: data saved to `Chapter` table
- [ ] LM Studio proxy: Manual test of `/api/llm` endpoint (if LM Studio running)

### Documentation

- [ ] README.md includes:
  - PostgreSQL setup instructions
  - LM Studio setup instructions
  - NPM scripts usage (`npm run dev`, `npm run migrate`)
  - Environment variables (.env.local template)
  - Directory structure explanation
- [ ] No `any` types in TypeScript models/controllers

---

## Decisions & Scope

### ✅ Included in Phase 1

- **Monorepo structure** (frontend + backend separation)
- **Frontend**: Vite + React 18 + Tailwind + Shadcn/UI
- **Backend**: Express + TypeScript + Sequelize ORM
- **Database**: PostgreSQL with full schema + associations
- **Paste-to-DB**: Ingestion interface (user → frontend → backend → DB)
- **LM Studio proxy**: Health check + forwarding endpoint
- **Single-user**: Local dev only, minimal auth needed
- **Functional UI**: Form-focused (minimal styling)

### ❌ Deliberately Excluded (Later Phases)

- Phase 2 (Architect): Text segmentation into Acts
- Phase 3 (Lexicographer): Automated term extraction
- Phase 4 (Profiler): MDA scoring engine
- Phase 5 (Master Sculptor): Final translation generation
- Advanced features: Conflict detection, export engine
- Authentication/multi-user support
- Streaming response UI integration

### Key Assumptions

- LM Studio installed locally on `localhost:1234` (standard)
- PostgreSQL accessible locally (no remote DB)
- Single-user, no login needed
- Both servers run on same machine during development
- Frontend API client configured to backend base URL

---

## Stack Summary

| Layer        | Technology                                 |
| ------------ | ------------------------------------------ |
| **Frontend** | **Vite + React 18 + Tailwind + Shadcn/UI** |
| State        | Zustand + React Query                      |
| **Backend**  | **Node.js + Express + TypeScript**         |
| **Database** | **PostgreSQL + Sequelize ORM**             |
| **Admin**    | **DBeaver**                                |
| **LLM**      | **LM Studio** (local, OpenAI-compatible)   |
| Deployment   | Local development (monorepo)               |

---

## Further Considerations

1. **Monorepo Management**
   - Use `npm workspaces` for dependency management
   - Both `frontend/` and `backend/` are independent projects
   - Root `npm run dev` uses `concurrently` to run both
   - Can build/test independently: `npm run dev:frontend` or `npm run dev:backend`

2. **Frontend API Client**
   - `/frontend/src/api/client.ts` wraps all backend calls
   - Configured to use `VITE_API_BASE_URL` env variable
   - Easy to switch between localhost dev and remote backend

3. **Backend Logging**
   - Use console.log for now (upgrade to Winston/Pino later)
   - Log all API requests in dev mode (middleware)
   - Log database queries in dev mode (Sequelize logging)

4. **Error Handling**
   - Consistent error response format across all endpoints
   - Frontend shows user-friendly toast messages
   - Backend logs full errors for debugging

5. **Future Phase Integration Points**
   - Act table pre-built; Phase 2 will populate `boundary_start/end`, `raw_act_text`
   - GlossaryEntry table ready; Phase 3 will insert extracted terms
   - LM Studio proxy ready for streaming Phase 5 translation responses
   - Zustand store ready for pipeline state (current phase, progress, etc.)
