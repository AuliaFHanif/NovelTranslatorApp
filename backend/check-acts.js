#!/usr/bin/env node

/**
 * Check Acts Database Validation
 * Verifies all acts are within the 50-word limit
 */

require("dotenv").config();
const { sequelize, Act } = require("./models");

const ACT_WORD_LIMIT = 50;

function countWords(text) {
  if (!text) return 0;
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.length;
}

async function checkActs() {
  try {
    console.log("[✓] Connecting to database...");
    await sequelize.authenticate();
    console.log("[✓] Database connected\n");

    const acts = await Act.findAll({
      order: [["sequence", "ASC"]],
    });

    if (acts.length === 0) {
      console.log("[!] No acts found in database");
      process.exit(0);
    }

    console.log(`[*] Found ${acts.length} acts. Checking word counts...\n`);
    console.log("═".repeat(80));

    let passCount = 0;
    let failCount = 0;
    const violations = [];

    for (const act of acts) {
      const wordCount = countWords(act.rawText);
      const status = wordCount <= ACT_WORD_LIMIT ? "✓" : "✗";
      const color = wordCount <= ACT_WORD_LIMIT ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";

      console.log(
        `${color}${status}${reset} Act ${act.label} (ID: ${act.id}): ${wordCount} words`,
      );

      if (wordCount <= ACT_WORD_LIMIT) {
        passCount++;
      } else {
        failCount++;
        violations.push({
          id: act.id,
          label: act.label,
          wordCount,
          excess: wordCount - ACT_WORD_LIMIT,
        });
      }
    }

    console.log("═".repeat(80));
    console.log(
      `\n[Summary] PASS: ${passCount}/${acts.length} | FAIL: ${failCount}/${acts.length}\n`,
    );

    if (violations.length > 0) {
      console.log("⚠️  VIOLATIONS DETECTED:\n");
      for (const violation of violations) {
        console.log(`  • Act ${violation.label} (ID: ${violation.id})`);
        console.log(
          `    - Word count: ${violation.wordCount} (${violation.excess} words OVER limit)`,
        );
      }
      console.log(
        `\n[Action] These acts need to be split or edited to be <= ${ACT_WORD_LIMIT} words\n`,
      );
    } else {
      console.log(`✓ All acts are within the ${ACT_WORD_LIMIT}-word limit!\n`);
    }

    await sequelize.close();
  } catch (error) {
    console.error("[✗] Error:", error.message);
    process.exit(1);
  }
}

checkActs();
