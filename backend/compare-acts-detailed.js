#!/usr/bin/env node

/**
 * Detailed Acts Comparison (50-word limit)
 * Shows exactly what text is missing or different
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

async function compareActsDetailed() {
  try {
    console.log("[✓] Connecting to database...");
    await sequelize.authenticate();
    console.log("[✓] Database connected\n");

    const chapters = await Chapter.findAll({
      include: [{ model: Act, as: "Acts" }],
      order: [["id", "ASC"]],
    });

    if (chapters.length === 0) {
      console.log("[!] No chapters found");
      process.exit(0);
    }

    for (const chapter of chapters) {
      if (!chapter.Acts || chapter.Acts.length === 0) {
        continue;
      }

      const originalText = chapter.rawText || "";
      const reconstructedText = chapter.Acts.sort(
        (a, b) => a.sequence - b.sequence,
      )
        .map((act) => act.rawText)
        .join("\n\n");

      console.log(`📋 Chapter ${chapter.id} Detailed Comparison`);
      console.log("═".repeat(80));
      console.log(`\nOriginal length:      ${originalText.length} characters`);
      console.log(
        `Reconstructed length: ${reconstructedText.length} characters`,
      );
      console.log(
        `Difference:           ${originalText.length - reconstructedText.length} characters\n`,
      );

      // Find where they differ
      let firstDifference = -1;
      const minLen = Math.min(originalText.length, reconstructedText.length);
      for (let i = 0; i < minLen; i++) {
        if (originalText[i] !== reconstructedText[i]) {
          firstDifference = i;
          break;
        }
      }

      if (
        firstDifference === -1 &&
        originalText.length !== reconstructedText.length
      ) {
        firstDifference = minLen;
      }

      if (firstDifference >= 0) {
        const start = Math.max(0, firstDifference - 50);
        const end = Math.min(originalText.length, firstDifference + 100);

        console.log(`First difference at position ${firstDifference}:\n`);
        console.log("Original text around difference:");
        console.log(
          `  ...${JSON.stringify(originalText.substring(start, end))}...`,
        );
        console.log("\nReconstructed text around difference:");
        console.log(
          `  ...${JSON.stringify(reconstructedText.substring(start, end))}...`,
        );
      } else {
        console.log("✓ Texts match perfectly!");
      }

      console.log("\n" + "─".repeat(80));
      console.log("\nActs breakdown:");
      for (const act of chapter.Acts.sort((a, b) => a.sequence - b.sequence)) {
        const words = countWords(act.rawText);
        console.log(
          `  Act ${act.label}: ${act.rawText.length} chars, ${words} words`,
        );
      }

      console.log(
        "\n════════════════════════════════════════════════════════════════════════════════\n",
      );
    }

    await sequelize.close();
  } catch (error) {
    console.error("[✗] Error:", error.message);
    process.exit(1);
  }
}

compareActsDetailed();
