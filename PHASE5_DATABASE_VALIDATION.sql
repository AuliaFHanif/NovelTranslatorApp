-- Phase 5: Database Integrity Validation
-- Run these queries after deployment to verify database consistency

-- ✅ Check 1: No orphaned TermAppearances
-- These would indicate term links to deleted acts
SELECT COUNT(*) as orphaned_term_appearances
FROM TermAppearances ta
WHERE ta."actId" NOT IN (SELECT id FROM Acts);
-- Expected: 0

-- ✅ Check 2: No orphaned Polish/PolishEdit records
-- These would indicate polish records for deleted acts
SELECT COUNT(*) as orphaned_polish
FROM Polishes p
WHERE p."actId" NOT IN (SELECT id FROM Acts);
-- Expected: 0

-- ✅ Check 3: Verify act sequences are continuous per chapter
-- Sequences should be: 1, 2, 3... (no gaps)
SELECT c.id, STRING_AGG(CAST(a."sequence" AS TEXT), ', ' ORDER BY a."sequence")
FROM Chapters c
LEFT JOIN Acts a ON c.id = a."chapterId"
GROUP BY c.id
HAVING COUNT(a.id) > 0;
-- Expected: No gaps in sequence numbers

-- ✅ Check 4: Verify all acts have valid word counts
-- All acts should be under MAX_ACT_WORDS (1000)
SELECT id, label, LENGTH(REGEXP_SPLIT_TO_ARRAY("rawText", '\s+')::text[]) as word_count
FROM Acts
WHERE LENGTH(REGEXP_SPLIT_TO_ARRAY("rawText", '\s+')::text[]) > 1000
ORDER BY word_count DESC;
-- Expected: Empty result

-- ✅ Check 5: Verify ActDependency relationships are valid
-- Both parent and child should reference valid acts
SELECT COUNT(*) as orphaned_dependencies
FROM ActDependencies ad
WHERE ad."parentActId" NOT IN (SELECT id FROM Acts)
   OR ad."childActId" NOT IN (SELECT id FROM Acts);
-- Expected: 0

-- ✅ Check 6: Check for duplicate term canonical forms in same series
-- Same canonical form + type should only appear once
SELECT "seriesId", "canonicalForm", "type", COUNT(*) as count
FROM GlossaryTerms
GROUP BY "seriesId", "canonicalForm", "type"
HAVING COUNT(*) > 1;
-- Expected: Empty result (no duplicates)

-- ✅ Check 7: Verify TermAppearance records have valid confidence
-- Confidence should be between 0 and 1
SELECT COUNT(*) as invalid_confidence
FROM TermAppearances
WHERE confidence < 0 OR confidence > 1;
-- Expected: 0

-- ✅ Check 8: Check for deleted acts still referenced
-- Should have no acts with null raw text
SELECT COUNT(*) as deleted_acts_with_null_text
FROM Acts
WHERE "rawText" IS NULL;
-- Expected: 0

-- ✅ Check 9: Verify all glossary terms have a series
-- Orphaned terms with null seriesId
SELECT COUNT(*) as orphaned_terms
FROM GlossaryTerms
WHERE "seriesId" IS NULL;
-- Expected: 0

-- ✅ Check 10: Count by phase completion
-- Shows current state of data
SELECT 
  (SELECT COUNT(*) FROM Series) as total_series,
  (SELECT COUNT(*) FROM Chapters) as total_chapters,
  (SELECT COUNT(*) FROM Acts) as total_acts,
  (SELECT COUNT(*) FROM GlossaryTerms) as total_terms,
  (SELECT COUNT(*) FROM TermAppearances) as total_appearances,
  (SELECT COUNT(*) FROM ActDependencies) as total_dependencies,
  (SELECT COUNT(*) FROM Polishes) as total_polish_edits;

-- ✅ Check 11: Verify metadata is valid JSON in GlossaryTerms
-- All metadata should be valid JSON
SELECT id, "metadat" FROM GlossaryTerms
WHERE "metadata"::text ~ '^\{[^}]*\}$' IS FALSE
LIMIT 10;
-- Expected: Empty result (all valid JSON)

-- ✅ Check 12: Verify split act labels follow pattern
-- Labels should be: "1", "2", "3" or "1A", "1B", "2A", etc.
SELECT id, label
FROM Acts
WHERE label !~ '^[0-9]+([A-Z])?$'
LIMIT 10;
-- Expected: Empty result (all valid labels)

-- ✅ Check 13: Verify no circular ActDependency references
-- An act shouldn't be its own parent/child (directly or indirectly)
WITH RECURSIVE dep_chain AS (
  SELECT "parentActId", "childActId", 1 as depth
  FROM ActDependencies
  
  UNION ALL
  
  SELECT dc."parentActId", ad."childActId", dc.depth + 1
  FROM ActDependencies ad
  JOIN dep_chain dc ON ad."parentActId" = dc."childActId"
  WHERE dc.depth < 10 -- Prevent infinite recursion
)
SELECT COUNT(*) as circular_references
FROM dep_chain
WHERE "parentActId" = "childActId";
-- Expected: 0

-- ✅ Check 14: Polish status consistency
-- No polish should be active if its act is deleted
SELECT COUNT(*) as invalidated_polish
FROM Polishes p
WHERE p.isActive = true
  AND p."actId" NOT IN (SELECT id FROM Acts WHERE "translatedText" IS NOT NULL);
-- Expected: 0 (active polish only for translated acts)

-- ✅ Check 15: Glossary term status distribution
SELECT status, COUNT(*) as count
FROM GlossaryTerms
GROUP BY status;
-- Expected: Mostly 'approved', some 'pending'

-- Summary query: Overall health check
SELECT 
  CASE WHEN 
    (SELECT COUNT(*) FROM TermAppearances WHERE "actId" NOT IN (SELECT id FROM Acts)) = 0
    AND (SELECT COUNT(*) FROM Polishes WHERE "actId" NOT IN (SELECT id FROM Acts)) = 0
    AND (SELECT COUNT(*) FROM ActDependencies WHERE "parentActId" NOT IN (SELECT id FROM Acts)) = 0
    THEN '✅ Database Integrity: HEALTHY'
    ELSE '❌ Database Integrity: ISSUES DETECTED'
  END as database_health;

-- Execution time check: are queries performant?
-- If any query above takes > 100ms on 10k+ records, add indexes:
-- CREATE INDEX idx_term_appearance_act ON TermAppearances("actId");
-- CREATE INDEX idx_polish_act ON Polishes("actId");
-- CREATE INDEX idx_act_dependency_parent ON ActDependencies("parentActId");
-- CREATE INDEX idx_glossary_series_form ON GlossaryTerms("seriesId", "canonicalForm");
