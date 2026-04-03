#!/usr/bin/env node

/**
 * Acts Integrity Validation (50-word limit)
 * Verifies that acts when concatenated match the original chapter text
 */

require("dotenv").config();
const { sequelize, Chapter, Act } = require("./models");

function countWords(text) {
  if (!text) return 0;
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.length;
}

async function validateActsIntegrity() {
  try {
    console.log("[✓] Connecting to database...");
    await sequelize.authenticate();
    console.log("[✓] Database connected\n");

    const chapters = await Chapter.findAll({
      include: [{ model: Act, as: "Acts" }],
      order: [["id", "ASC"]],
    });

    if (chapters.length === 0) {
      console.log("[!] No chapters found in database");
      process.exit(0);
    }

    console.log(`[*] Found ${chapters.length} chapters. Validating acts...\n`);
    console.log("═".repeat(80));

    let totalPassCount = 0;
    let totalFailCount = 0;
    const issues = [];

    for (const chapter of chapters) {
      if (!chapter.Acts || chapter.Acts.length === 0) {
        console.log(`[!] Chapter ${chapter.id} has no acts`);
        continue;
      }

      const originalText = chapter.rawText || "";
      const originalWordCount = countWords(originalText);

      // Reconstruct text from acts
      const reconstructedText = chapter.Acts.sort(
        (a, b) => a.sequence - b.sequence,
      )
        .map((act) => act.rawText)
        .join("\n\n");

      const reconstructedWordCount = countWords(reconstructedText);

      // Calculate character counts (more precise)
      const originalCharCount = originalText.length;
      const reconstructedCharCount = reconstructedText.length;

      const wordMatch = originalWordCount === reconstructedWordCount;
      const charMatch = originalCharCount === reconstructedCharCount;
      const textMatch = originalText.trim() === reconstructedText.trim();

      const status = textMatch ? "✓" : "✗";
      const color = textMatch ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";

      console.log(
        `${color}${status}${reset} Chapter ${chapter.id} (${chapter.Acts.length} acts)`,
      );
      console.log(
        `   Original:      ${originalWordCount} words, ${originalCharCount} chars`,
      );
      console.log(
        `   Reconstructed: ${reconstructedWordCount} words, ${reconstructedCharCount} chars`,
      );

      if (textMatch) {
        totalPassCount++;
      } else {
        totalFailCount++;
        issues.push({
          chapterId: chapter.id,
          actCount: chapter.Acts.length,
          originalWords: originalWordCount,
          reconstructedWords: reconstructedWordCount,
          originalChars: originalCharCount,
          reconstructedChars: reconstructedCharCount,
          wordMatch,
          charMatch,
          textMatch,
        });
      }

      console.log("");
    }

    console.log("═".repeat(80));
    console.log(
      `\n[Summary] PASS: ${totalPassCount}/${chapters.length} | FAIL: ${totalFailCount}/${chapters.length}\n`,
    );

    if (issues.length > 0) {
      console.log("⚠️  INTEGRITY ISSUES DETECTED:\n");
      for (const issue of issues) {
        console.log(`  • Chapter ${issue.chapterId}`);
        console.log(`    - Acts: ${issue.actCount}`);
        if (!issue.wordMatch) {
          console.log(
            `    - Word count mismatch: Original ${issue.originalWords} vs Reconstructed ${issue.reconstructedWords}`,
          );
        }
        if (!issue.charMatch) {
          console.log(
            `    - Char count mismatch: Original ${issue.originalChars} vs Reconstructed ${issue.reconstructedChars}`,
          );
        }
        if (!issue.textMatch) {
          console.log(
            `    - Text content mismatch (content differs, not just formatting)`,
          );
        }
      }
      console.log(
        "\n[Note] Acts may have been modified or the original chapter text has changed.\n",
      );
    } else {
      console.log("✓ All acts match their original chapter text perfectly!\n");
    }

    await sequelize.close();
  } catch (error) {
    console.error("[✗] Error:", error.message);
    process.exit(1);
  }
}

validateActsIntegrity();
