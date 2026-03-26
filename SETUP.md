# 🚀 Anatomy Engine - Quick Start Guide

## Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 12+ running locally
- **LM Studio** (optional, for LLM features) - running on `http://localhost:1234`
- **DBeaver** (optional, for database GUI management)

## Database Setup

### 1. Create PostgreSQL Database

```sql
CREATE DATABASE novel_translator_V4;
```

### 2. Verify Backend Config

Open `backend/config/config.json` and ensure development configuration matches:

```json
{
  "development": {
    "username": "postgres",
    "password": "postgres",
    "database": "novel_translator_V4",
    "host": "127.0.0.1",
    "dialect": "postgres"
  }
}
```

### 3. Run Migrations

```bash
cd backend
npx sequelize-cli db:migrate
```

Check status:
```bash
npx sequelize-cli db:migrate:status
```

### 4. Seed Test Data (Optional)

```bash
cd backend
node seed.js
```

This creates a demo series with 2 test chapters in Japanese.

---

## Running the Application

### Option 1: Development Mode (Recommended)

#### Terminal 1 - Backend API (Port 5000)
```bash
cd backend
npm run dev
```

Expected output:
```
✓ Database connection successful
✓ Server running on http://localhost:5000
✓ API endpoints:
  - GET  /api/series         (list all series)
  - POST /api/series         (create series)
  - GET  /api/chapters       (list chapters)
  - POST /api/chapters       (create chapter)
  ...
```

#### Terminal 2 - Frontend SPA (Port 5173)
```bash
cd frontend
npm run dev
```

Check status at: `http://localhost:5173`

### Option 2: Check Backend Health

```bash
curl http://localhost:5000/api/health
```

Response:
```json
{
  "status": "ok",
  "services": {
    "lmStudio": {
      "status": "connected" || "disconnected",
      "message": "..."
    }
  }
}
```

---

## API Endpoints

### Series Management

**List all series**
```bash
GET /api/series
```

**Create new series**
```bash
POST /api/series
Content-Type: application/json

{
  "title": "My Novel",
  "language": "ja",
  "genre": "Fantasy",
  "description": "A great story..."
}
```

**Get series details**
```bash
GET /api/series/:id
```

---

### Chapter Management

**List chapters (optionally filtered by series)**
```bash
GET /api/chapters?seriesId=1
```

**Create Chapter (Phase 1 - Paste)**
```bash
POST /api/chapters
Content-Type: application/json

{
  "seriesId": 1,
  "number": 1,
  "title": "Chapter 1",
  "rawText": "Japanese/Chinese text..."
}
```

**Get chapter with raw text**
```bash
GET /api/chapters/:id
```

**Update chapter (add translation)**
```bash
PATCH /api/chapters/:id
Content-Type: application/json

{
  "finalText": "English translation..."
}
```

---

### LLM Integration

**Health check (including LM Studio status)**
```bash
GET /api/health
```

**Forward to LM Studio API (OpenAI compatible)**
```bash
POST /api/llm
Content-Type: application/json

{
  "model": "your-model-name",
  "messages": [
    {"role": "user", "content": "Translate this text..."}
  ],
  "temperature": 0.7,
  "max_tokens": 2048
}
```

---

## File Structure

```
StandaloneNovelTranslatorV4/
├── backend/
│   ├── app.js                 # Express server setup
│   ├── config/
│   │   └── config.json        # Database config
│   ├── models/                # Sequelize ORM models
│   ├── migrations/            # Database schema (5 files)
│   ├── routes/                # API endpoint handlers
│   ├── seed.js                # Database seeding script
│   ├── package.json
│   └── node_modules/
│
├── frontend/
│   ├── src/
│   │   ├── pages/             # Route pages (Translate, Chapter)
│   │   ├── components/        # Reusable UI components
│   │   ├── store/             # Zustand state management
│   │   ├── App.jsx            # Main app with routing
│   │   └── main.jsx           # React entrypoint
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── node_modules/
│
├── PLAN.md                    # Project architecture & timeline
├── README.md                  # Database schema documentation
├── SETUP.md                   # This file
└── package.json               # Root workspace config
```

---

## Troubleshooting

### Port Already in Use

If port 5000 or 5173 is in use:

```bash
# Windows - Find process using port 5000
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000

# Kill process (Windows)
taskkill /PID <process_id> /F
```

### Database Connection Error

```bash
# Check PostgreSQL is running
psql -U postgres -d novel_translator_V4

# Verify connection string in backend/config/config.json
```

### LM Studio Not Found

If LLM features fail:

1. Download LM Studio from https://lmstudio.ai
2. Start LM Studio and load a model
3. Verify API accessibility at `http://localhost:1234/v1/models`

---

## Next Steps

1. ✅ **Database**: Migrations executed, test data seeded
2. ✅ **Backend API**: Routes created and tested
3. ✅ **Frontend**: Vite SPA with main pages
4. 🔄 **Integration**: Test full user flow (Paste → Save → View)
5. ⏳ **Phase 2+**: Implement Architect (text segmentation), Lexicographer (MDA profiling), Profiler (LLM generation), Master Sculptor (final review)

## Development Commands

```bash
# From root directory
npm run backend:dev      # Backend only
npm run frontend:dev     # Frontend only
npm run backend:seed     # Reseed test data
npm run frontend:build   # Build for production
```

---

## Current Status

- ✅ Project structure created
- ✅ Database initialized with 5 tables
- ✅ Backend API with CRUD operations
- ✅ Frontend SPA with Vite, React, Tailwind
- ✅ Test data seeded
- ⏳ Ready for full integration testing
