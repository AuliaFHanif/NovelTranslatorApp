/**
 * Optimized Act Creation Service
 *
 * Improvements:
 * 1. Unified metrics (no duplicate counting)
 * 2. Cleaner split logic
 * 3. Better dependency chain creation
 * 4. Configurable limits
 */

const { Act, ActDependency } = require("../models");
const TextMetrics = require("../utils/textMetrics");
const config = require("../config/segmentation");

class ActCreationService {
  constructor() {
    this.limits = config.boundaries;
  }

  /**
   * Main entry: Create acts (and their SubActs) from segmentation
   *
   * NEW FLOW (hierarchical):
   * 1. callSegmentationAI identifies N Acts (from AI decision)
   * 2. Each Act is recursively broken into M SubActs
   * 3. We create DB Acts from segmentation.acts
   * 4. We create SubActs from segmentation.actSubActMap[actIndex]
   */
  async createActs(chapterId, paragraphs, segmentation, language = "zh") {
    const { acts, actSubActMap, source } = segmentation; // NEW: hierarchical structure
    const { SubAct } = require("../models");
    const createdActs = [];
    let actSequence = 1;

    for (let i = 0; i < acts.length; i++) {
      const actParagraphs = acts[i];
      const actText = actParagraphs.map((p) => p.text).join("\n\n");

      // 1. Create the parent Act (AI-identified)
      const act = await this.createSingleAct({
        chapterId,
        sequence: actSequence++,
        label: String(actSequence - 1),
        rawText: actText,
        tokenCount: TextMetrics.estimateTokens(actText),
        segmentSource: source,
      });

      // 2. Get pre-computed SubActs for this Act (no re-segmentation needed!)
      const subActGroups = actSubActMap[i] || [actParagraphs]; // Fallback if not in map

      // 3. Create SubActs (already properly segmented by aiSegmentation.js)
      let subSequence = 1;
      for (const subActParagraphs of subActGroups) {
        const subText = subActParagraphs.map((p) => p.text).join("\n\n");
        const subTokens = TextMetrics.estimateTokens(subText);
        const subChars = subText.length;

        const subAct = await SubAct.create({
          actId: act.id,
          sequence: subSequence,
          rawText: subText,
          tokenCount: subTokens,
          charCount: subChars,
        });

        console.log(
          `[ActCreation] Act ${act.label} → SubAct ${subSequence}: ${subTokens} tokens, ${subChars} chars`,
        );
        subSequence++;
      }

      console.log(
        `[ActCreation] Act ${act.label}: Created ${subSequence - 1} SubActs total`,
      );
      createdActs.push(act);
    }

    // Inter-act dependencies
    for (let i = 1; i < createdActs.length; i++) {
      await this.createDependency(createdActs[i - 1].id, createdActs[i].id);
    }

    return createdActs;
  }

  /**
   * NEW: Segment a single Act into SubActs based on SubAct size limits
   * This respects minTokensPerSubAct and maxTokensPerSubAct from config
   *
   * Algorithm: Greedy packing
   * - Accumulate paragraphs until crossing maxTokens
   * - Create SubAct at good break point
   * - Repeat until all paragraphs processed
   */
  async segmentActIntoSubActs(actParagraphs, language = "zh") {
    const {
      minTokensPerSubAct,
      maxTokensPerSubAct,
      minUnifiedWordsPerSubAct,
      maxUnifiedWordsPerSubAct,
    } = this.limits;

    // Calculate metrics for each paragraph
    const metrics = TextMetrics.calculateParagraphMetrics(actParagraphs);

    const subActGroups = [];
    let currentGroup = [];
    let currentTokens = 0;
    let currentWords = 0;

    for (let i = 0; i < actParagraphs.length; i++) {
      const para = actParagraphs[i];
      const paraTokens = metrics[i].estimatedTokens;
      const paraWords = metrics[i].unifiedWords;

      const willExceedTokens = currentTokens + paraTokens > maxTokensPerSubAct;
      const willExceedWords =
        currentWords + paraWords > maxUnifiedWordsPerSubAct;
      const hasContent = currentGroup.length > 0;
      const isLastParagraph = i === actParagraphs.length - 1;

      // Decide: finalize current group or add this paragraph?
      if (
        (willExceedTokens || willExceedWords) &&
        hasContent &&
        !isLastParagraph
      ) {
        // Check if current group meets minimum size
        if (
          currentTokens >= minTokensPerSubAct ||
          currentWords >= minUnifiedWordsPerSubAct
        ) {
          // Finalize current group
          subActGroups.push(currentGroup);
          console.log(
            `[ActCreation] SubAct boundary at para ${i}: ${currentTokens} tokens, ${currentWords} words`,
          );
          currentGroup = [];
          currentTokens = 0;
          currentWords = 0;
        }
        // Otherwise, continue accumulating (too small to finalize)
      }

      // Add this paragraph to current group
      currentGroup.push(para);
      currentTokens += paraTokens;
      currentWords += paraWords;

      // Handle last paragraph
      if (isLastParagraph && currentGroup.length > 0) {
        // Check if we should merge with previous group (too small)
        if (
          subActGroups.length > 0 &&
          currentTokens < minTokensPerSubAct &&
          currentWords < minUnifiedWordsPerSubAct
        ) {
          console.log(
            `[ActCreation] Final SubAct too small (${currentTokens} tokens), merging with previous`,
          );
          subActGroups[subActGroups.length - 1].push(...currentGroup);
        } else {
          subActGroups.push(currentGroup);
        }
      }
    }

    // Safety: if no groups created, return whole act as single SubAct
    if (subActGroups.length === 0) {
      console.log(`[ActCreation] Warning: No SubActs created, using whole act`);
      return [actParagraphs];
    }

    console.log(
      `[ActCreation] Segmented Act into ${subActGroups.length} SubActs`,
    );
    return subActGroups;
  }

  /**
   * Calculate optimal split points to balance size
   */
  calculateOptimalSplits(paragraphs, metrics) {
    const totalTokens = metrics.reduce((sum, m) => sum + m.estimatedTokens, 0);
    const totalWords = metrics.reduce((sum, m) => sum + m.unifiedWords, 0);

    // Determine number of splits needed
    const tokenSplits = Math.ceil(totalTokens / this.limits.maxTokensPerAct);
    const wordSplits = Math.ceil(
      totalWords / this.limits.maxUnifiedWordsPerAct,
    );
    const numSplits = Math.max(tokenSplits, wordSplits, 1);

    const targetTokens = totalTokens / numSplits;
    const targetWords = totalWords / numSplits;

    const splits = [];
    let currentText = [];
    let currentTokens = 0;
    let currentWords = 0;
    let splitIdx = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const paraTokens = metrics[i].estimatedTokens;
      const paraWords = metrics[i].unifiedWords;

      // Check if adding this paragraph would exceed target (and we have content)
      const wouldExceed =
        currentTokens + paraTokens > targetTokens * 1.2 ||
        currentWords + paraWords > targetWords * 1.2;

      const isLastSplit = splitIdx === numSplits - 1;
      const hasContent = currentText.length > 0;

      if (wouldExceed && hasContent && !isLastSplit) {
        // Finalize current split
        splits.push({
          text: currentText.join("\n\n"),
          tokens: currentTokens,
          words: currentWords,
        });

        // Start new split
        currentText = [para.text];
        currentTokens = paraTokens;
        currentWords = paraWords;
        splitIdx++;
      } else {
        // Add to current split
        currentText.push(para.text);
        currentTokens += paraTokens;
        currentWords += paraWords;
      }
    }

    // Don't forget the last split
    if (currentText.length > 0) {
      splits.push({
        text: currentText.join("\n\n"),
        tokens: currentTokens,
        words: currentWords,
      });
    }

    return splits;
  }

  /**
   * Create a single act record
   */
  async createSingleAct(data) {
    try {
      const act = await Act.create({
        chapterId: data.chapterId,
        sequence: data.sequence,
        label: data.label,
        rawText: data.rawText,
        tokenCount: data.tokenCount,
        segmentSource: data.segmentSource,
        status: "pending",
      });

      console.log(
        `[ActCreation] Created act ${data.label} (${data.unifiedWordCount} words, ${data.tokenCount} tokens)`,
      );
      return act;
    } catch (error) {
      console.error(
        `[ActCreation] Failed to create act ${data.label}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Create dependency between acts
   */
  async createDependency(fromActId, toActId) {
    try {
      await ActDependency.create({
        actId: toActId,
        dependsOnActId: fromActId,
        dependencyType: "translation_sequence",
      });
    } catch (error) {
      console.warn(
        `[ActCreation] Failed to create dependency ${fromActId} -> ${toActId}:`,
        error.message,
      );
      // Non-fatal: continue without dependency
    }
  }

  /**
   * Split an act manually (for edit operations)
   */
  splitActForEdit(actText, paragraphs) {
    const metrics = TextMetrics.calculateParagraphMetrics(paragraphs);
    const totalWords = metrics.reduce((sum, m) => sum + m.unifiedWords, 0);

    // Use same limits as automatic segmentation
    const numSplits =
      Math.ceil(totalWords / this.limits.maxUnifiedWordsPerAct) || 1;

    return this.calculateOptimalSplits(paragraphs, metrics).map(
      (split, idx) => ({
        ...split,
        label: String.fromCharCode(65 + idx), // A, B, C...
      }),
    );
  }
}

module.exports = new ActCreationService();
