const { Act, ActDependency } = require("../models");
const { countWords } = require("./utils");

// Hardcoded limit: 50 words per act
const ACT_WORD_LIMIT = 50;

class ActCreationService {
  /**
   * Create acts from segmentation boundaries
   * Splits any act exceeding 50 words into multiple pieces at paragraph boundaries
   * @param {number} chapterId
   * @param {Array} paragraphs - Normalized paragraphs
   * @param {Object} segmentation - { boundaries: [], source: 'ai'|'fallback' }
   */
  async createActs(chapterId, paragraphs, segmentation) {
    const { boundaries, source } = segmentation;
    const createdActs = [];
    let sequence = 1;

    for (let i = 0; i < boundaries.length; i++) {
      const startIdx = i === 0 ? 0 : boundaries[i - 1];
      const endIdx = boundaries[i];

      const actParagraphs = paragraphs.slice(startIdx, endIdx);
      const actText = actParagraphs.map((p) => p.text).join("\n\n");

      // Split the act if needed
      const splits = this.splitActByLimit(actText, actParagraphs);
      const labelBase = sequence; // Base label (e.g., "9" for "9a", "9b")
      const splitActIds = []; // Track all splits from this boundary for linking

      for (let j = 0; j < splits.length; j++) {
        const split = splits[j];
        const labelSuffix =
          splits.length === 1 ? "" : String.fromCharCode(97 + j); // a, b, c, ...

        // Each split piece gets its own unique sequence number
        const actSequence = sequence + j;
        const finalLabel = `${labelBase}${labelSuffix}`;

        console.log(
          `[ActCreation] Creating act ${createdActs.length + 1}: sequence=${actSequence}, label="${finalLabel}", words=${countWords(split)}, splits=${splits.length} (${j + 1}/${splits.length})`,
        );

        if (finalLabel.length > 10) {
          throw new Error(
            `Label exceeds 10 character limit: "${finalLabel}" (${finalLabel.length} chars for sequence ${labelBase}, split ${j + 1}/${splits.length})`,
          );
        }

        try {
          const act = await Act.create({
            chapterId,
            sequence: actSequence,
            label: finalLabel,
            rawText: split,
            tokenCount: countWords(split),
            segmentSource: source,
            status: "pending",
          });

          createdActs.push(act);
          splitActIds.push(act.id);
          console.log(`[ActCreation] ✓ Act created with ID ${act.id}`);

          // Create dependency chain
          if (createdActs.length > 1) {
            await ActDependency.create({
              actId: act.id,
              dependsOnActId: createdActs[createdActs.length - 2].id,
              dependencyType: "translation_sequence",
            });
          }
        } catch (dbError) {
          console.error(
            `[ActCreation] Database error for label "${finalLabel}":`,
            dbError.message,
          );
          if (dbError.errors && Array.isArray(dbError.errors)) {
            dbError.errors.forEach((err) => {
              console.error(`  - ${err.path}: ${err.message}`);
            });
          }
          throw dbError;
        }
      }

      // If this boundary was split, link all split pieces together
      if (splitActIds.length > 1) {
        for (let j = 1; j < splitActIds.length; j++) {
          try {
            await ActDependency.create({
              actId: splitActIds[j],
              dependsOnActId: splitActIds[0],
              dependencyType: "split_from",
            });
            console.log(
              `[ActCreation] Linked split act ${splitActIds[j]} to original ${splitActIds[0]}`,
            );
          } catch (depError) {
            console.warn(
              `[ActCreation] Warning: Could not create split dependency. This may be due to database schema mismatch. Continuing without link.`,
              depError.message,
            );
            // Don't throw - continue processing other splits
            // The acts themselves were created successfully
          }
        }
      }

      // Increment sequence for next boundary by the number of splits
      sequence += splits.length;
    }

    return createdActs;
  }

  /**
   * Splits an act into multiple pieces if it exceeds 50 words.
   * Calculates how many splits are needed so each piece is under 50 words.
   * Splits at paragraph boundaries closest to the target word count.
   * @param {string} actText - Full act text
   * @param {Array} paragraphs - Paragraph objects with { text } property
   * @returns {Array} Array of text strings (act pieces)
   */
  splitActByLimit(actText, paragraphs) {
    const totalWords = countWords(actText);

    // If under limit, no split needed
    if (totalWords <= ACT_WORD_LIMIT) {
      return [actText];
    }

    // Calculate how many splits are needed
    // numSplits is the smallest number where totalWords / numSplits <= ACT_WORD_LIMIT
    const numSplits = Math.ceil(totalWords / ACT_WORD_LIMIT);
    const targetWordsPerSplit = Math.ceil(totalWords / numSplits);

    // Find split indices at paragraph boundaries
    const splitIndices = this.findSplitIndices(
      paragraphs,
      numSplits,
      targetWordsPerSplit,
    );

    // Build the splits from indices
    const splits = [];
    for (let i = 0; i < splitIndices.length - 1; i++) {
      const startIdx = splitIndices[i];
      const endIdx = splitIndices[i + 1];
      const splitParas = paragraphs.slice(startIdx, endIdx);
      const splitText = splitParas.map((p) => p.text).join("\n\n");
      if (splitText.trim()) {
        splits.push(splitText);
      }
    }

    return splits.length > 0 ? splits : [actText];
  }

  /**
   * Finds paragraph indices where splits should occur.
   * Distributes splits to aim for roughly equal word counts.
   * @param {Array} paragraphs - Paragraph objects with { text } property
   * @param {number} numSplits - How many splits to create
   * @param {number} targetWordsPerSplit - Target words per split
   * @returns {Array} Array of paragraph indices [0, idx1, idx2, ..., paragraphs.length]
   */
  findSplitIndices(paragraphs, numSplits, targetWordsPerSplit) {
    // Calculate cumulative word counts
    const cumulativeWords = [];
    let runningTotal = 0;
    for (const para of paragraphs) {
      runningTotal += countWords(para.text);
      cumulativeWords.push(runningTotal);
    }

    const totalWords = cumulativeWords[cumulativeWords.length - 1];
    const splitIndices = [0]; // Always start at 0

    // For each split point, find the paragraph boundary closest to that position
    for (let splitNum = 1; splitNum < numSplits; splitNum++) {
      // Calculate the target word position for this split
      const targetWord = (splitNum / numSplits) * totalWords;

      let closestIdx = 0;
      let closestDiff = Math.abs(cumulativeWords[0] - targetWord);

      // Find the paragraph index where cumulative words is closest to target
      for (let j = 1; j < cumulativeWords.length; j++) {
        const diff = Math.abs(cumulativeWords[j] - targetWord);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIdx = j;
        }
      }

      // We want to split AFTER this paragraph, so add closestIdx + 1
      const nextSplitIdx = closestIdx + 1;

      // Only add if not duplicate and not already at the end
      if (
        !splitIndices.includes(nextSplitIdx) &&
        nextSplitIdx < paragraphs.length
      ) {
        splitIndices.push(nextSplitIdx);
      }
    }

    // Always end at the last paragraph
    if (splitIndices[splitIndices.length - 1] !== paragraphs.length) {
      splitIndices.push(paragraphs.length);
    }

    // Sort to ensure ascending order
    return [...new Set(splitIndices)].sort((a, b) => a - b);
  }
}

module.exports = new ActCreationService();
