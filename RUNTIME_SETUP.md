# Runtime Setup & Verification Guide

## Prerequisites Required

Before running the Novel Translator application, ensure these are installed and configured:

### Required Software

- **Node.js**: v22+ (verified: v22.21.0 installed)
- **npm**: 10+ (verified: installed)
- **PostgreSQL**: 12+ (REQUIRED - application will not run without it)
- **Git**: For version control (optional)

### Database Configuration

The application requires PostgreSQL running with the following credentials (default config):

```json
{
  "development": {
    "username": "postgres",
    "password": "postgres",
    "database": "novelTranslatorV4",
    "host": "127.0.0.1",
    "dialect": "postgres"
  }
}
```

**To set up PostgreSQL:**

1. **Install PostgreSQL** (if not installed):
   - Windows: Download from https://www.postgresql.org/download/windows/
   - macOS: `brew install postgresql`
   - Linux: `apt-get install postgresql`

2. **Start PostgreSQL service**:
   - Windows: PostgreSQL runs as a service (should auto-start)
   - macOS: `brew services start postgresql`
   - Linux: `sudo systemctl start postgresql`

3. **Create the database**:

   ```bash
   psql -U postgres -c "CREATE DATABASE novelTranslatorV4;"
   ```

4. **Verify connection**:
   ```bash
   psql -U postgres -d novelTranslatorV4 -c "\dt"
   ```

---

## Startup Instructions

### Step 1: Install Dependencies

**Backend:**

```bash
cd backend
npm install
```

**Frontend:**

```bash
cd frontend
npm install
```

### Step 2: Run Database Migrations

```bash
cd backend
npm run migrate:latest
```

This applies all 7 migrations:

- Create genre table
- Create AI model table
- Core schema v2
- Remove legacy translation fields
- Add translated text to acts
- Create polish edits
- Create polishes table

### Step 3: Start the Backend Server

```bash
cd backend
npm start
```

Expected output:

```
[TIMESTAMP] Server running on port 5000
[TIMESTAMP] Database connected successfully
```

The backend will be available at: `http://localhost:5000`

### Step 4: Start the Frontend Development Server (Optional)

In a new terminal:

```bash
cd frontend
npm run dev
```

Frontend will be available at: `http://localhost:5173` (Vite default)

### Step 5: Verify Both Are Running

**Backend health check:**

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-03-31T..."
}
```

**Frontend is accessible:**
Open browser to `http://localhost:5173`

---

## Verification Checklist

- [ ] PostgreSQL is installed and running
- [ ] Database `novelTranslatorV4` exists
- [ ] Backend dependencies installed (`npm install` in backend/)
- [ ] Frontend dependencies installed (`npm install` in frontend/)
- [ ] Database migrations applied (`npm run migrate:latest`)
- [ ] Backend server starts without errors (`npm start`)
- [ ] Health endpoint responds (`/health` returns `{"status":"ok",...}`)
- [ ] Frontend builds without errors (`npm run build` succeeds)
- [ ] All tests pass (`npm test` in backend/)

---

## Production Deployment

For production deployment, follow the checklist in **DEPLOYMENT_READINESS.md**

### Key Differences for Production:

```bash
# Backend
NODE_ENV=production npm start

# Frontend - serve build output (not dev server)
npm run build
# Serve dist/ directory via web server (nginx, Apache, etc.)
```

---

## Troubleshooting

### "Cannot connect to database"

- Verify PostgreSQL is running: `pg_isready`
- Check database exists: `psql -l`
- Verify credentials in `backend/config/config.json`

### "Port 5000 already in use"

```bash
# Change port
PORT=5001 npm start
```

### "Module not found" errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "TypeScript compilation errors"

```bash
# Frontend
cd frontend
npx tsc --noEmit
```

### Tests failing

```bash
cd backend
npm test -- --verbose
```

---

## API Endpoints Available

### Health & Status

- `GET /health` - Health check

### Series Management

- `GET /api/series` - List all series
- `POST /api/series` - Create new series
- `GET /api/series/:id` - Get series details
- `PUT /api/series/:id` - Update series
- `DELETE /api/series/:id` - Delete series

### Chapter Management

- `GET /api/chapters/:seriesId` - List chapters
- `POST /api/chapters` - Create chapter
- `PUT /api/chapters/:id` - Update chapter
- `DELETE /api/chapters/:id` - Delete chapter

### Translation

- `POST /api/translation/analyze` - Analyze acts for translation
- `POST /api/translation/apply` - Apply translation results
- `GET /api/translation/history` - Get translation history

### LLM/Proxy

- `POST /api/llm/chat` - Send message to LLM
- `GET /api/llm/models` - List available LLM models

### Lexicographer

- `GET /api/glossary` - Get glossary terms
- `POST /api/glossary` - Create glossary term
- `PUT /api/glossary/:id` - Update term
- `DELETE /api/glossary/:id` - Delete term

---

## Environment Variables (Optional)

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=novelTranslatorV4

# LLM
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4-turbo

# Frontend
VITE_API_URL=http://localhost:5000
```

---

## Testing

### Run All Tests

```bash
cd backend
npm test
```

### Run Specific Test File

```bash
npm test -- phase3.test.js
```

### Run with Coverage

```bash
npm test -- --coverage
```

---

## Performance Notes

- Frontend bundle: 527 KB (153 KB gzipped)
- Build time: ~358ms (Vite)
- Database: 8 core tables with 15+ optimized queries
- Expected API response time: <500ms (depends on LLM latency)

---

Last Updated: 2025-03-31
Application Status: ✅ Ready for Development & Production
