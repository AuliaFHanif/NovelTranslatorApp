const express = require('express');
const router = express.Router();
const lexicographerController = require('../controllers/lexicographerController');

// Run Phase 3 analysis on chapter
router.post('/chapters/:chapterId/analyze', lexicographerController.analyzeChapter);

// Get glossary entries for series
router.get('/series/:seriesId/glossary', lexicographerController.getGlossary);

// Get glossary with appearance details
router.get('/series/:seriesId/glossary/detailed', lexicographerController.getGlossaryDetailed);

// Get pending count
router.get('/series/:seriesId/glossary/pending-count', lexicographerController.getPendingCount);

// Update glossary entry (approve/reject)
router.put('/glossary-terms/:termId', lexicographerController.updateGlossaryTerm);

// Bulk approve candidates
router.post('/series/:seriesId/glossary/bulk-approve', lexicographerController.bulkApprove);

// Get act analysis
router.get('/acts/:actId/analysis', lexicographerController.getActAnalysis);

module.exports = router;
