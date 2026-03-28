const express = require("express");
const cors = require("cors");
const { sequelize } = require("./models");
const chapterRoutes = require("./routes/chapters");
const seriesRoutes = require("./routes/series");
const proxyRoutes = require("./routes/proxy");
const translationRoutes = require("./routes/translation");
const settingsRoutes = require("./routes/settings");
const lexicographerRoutes = require("./routes/lexicographer");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/series", seriesRoutes);
app.use("/api/chapters", chapterRoutes);
app.use("/api/llm", proxyRoutes);
app.use("/api/health", proxyRoutes);
app.use("/api/translation", translationRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api", lexicographerRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// Database sync and server start
sequelize
  .authenticate()
  .then(() => {
    console.log("✓ Database connection successful");
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ API endpoints:`);
      console.log(`  - GET  /api/series         (list all series)`);
      console.log(`  - POST /api/series         (create series)`);
      console.log(`  - GET  /api/chapters       (list chapters)`);
      console.log(`  - POST /api/chapters       (create chapter)`);
      console.log(`  - GET  /api/chapters/:id   (get chapter)`);
      console.log(`  - POST /api/llm            (LM Studio proxy)`);
      console.log(`  - GET  /api/health         (service health)`);
      console.log(`  - GET  /api/translation/chapters/:chapterId`);
      console.log(`  - POST /api/translation/acts/:actId/pass`);
      console.log(`  - POST /api/translation/chapters/:chapterId/pass`);
    });
  })
  .catch((err) => {
    console.error("✗ Database connection failed:", err.message);
    process.exit(1);
  });

module.exports = app;
