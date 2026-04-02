/**
 * Optimized Act Creation Service
 * 
 * Improvements:
 * 1. Unified metrics (no duplicate counting)
 * 2. Cleaner split logic
 * 3. Better dependency chain creation
 * 4. Configurable limits
 */

const { Act, ActDependency } = require('../models');
const TextMetrics = require('../utils/textMetrics');
const config = require('../config/segmentation');

class ActCreationService {
  constructor() {
    this.limits = config.boundaries;
  }

  /**
   * Main entry: Create acts from segmentation boundaries
   */
  async createActs(chapterId, paragraphs, segmentation) {
    const { boundaries, source } = segmentation;
    const createdActs = [];
    let sequence = 1;

    // Pre-calculate all metrics
    const paraMetrics = TextMetrics.calculateParagraphMetrics(paragraphs);
    let actIndex = 1; // Narrative act counter

    for (let i = 0; i < boundaries.length; i++) {
      const startIdx = i === 0 ? 0 : boundaries[i - 1];
      const endIdx = boundaries[i];

      const actParagraphs = paragraphs.slice(startIdx, endIdx);
      const actText = actParagraphs.map(p => p.text).join('\n\n');
      const metrics = paraMetrics.slice(startIdx, endIdx);
      const totalTokens = metrics.reduce((sum, m) => sum + m.estimatedTokens, 0);
      const totalWords = metrics.reduce((sum, m) => sum + m.unifiedWords, 0);

      // Current major act label
      const baseLabel = actIndex++;

      // Check if splitting needed
      const needsSplit = totalTokens > this.limits.maxTokensPerAct || 
                        totalWords > this.limits.maxUnifiedWordsPerAct;

      if (!needsSplit) {
        // Create single act
        const act = await this.createSingleAct({
          chapterId,
          sequence: sequence++,
          label: String(baseLabel),
          rawText: actText,
          tokenCount: totalTokens,
          unifiedWordCount: totalWords,
          segmentSource: source,
        });
        createdActs.push(act);
      } else {
        // Split into multiple acts
        const splits = this.calculateOptimalSplits(actParagraphs, metrics);

        for (let j = 0; j < splits.length; j++) {
          const split = splits[j];
          const label = splits.length === 1 
            ? String(baseLabel) 
            : `${baseLabel}${String.fromCharCode(97 + j)}`;

          const act = await this.createSingleAct({
            chapterId,
            sequence: sequence++,
            label,
            rawText: split.text,
            tokenCount: split.tokens,
            unifiedWordCount: split.words,
            segmentSource: source,
          });

          createdActs.push(act);

          // Create translation sequence dependency
          if (j > 0) {
            await this.createDependency(createdActs[createdActs.length - 2].id, act.id);
          }
        }
      }
    }

    // Create inter-act dependencies (sequential translation order)
    for (let i = 1; i < createdActs.length; i++) {
      await this.createDependency(createdActs[i - 1].id, createdActs[i].id);
    }

    return createdActs;
  }

  /**
   * Calculate optimal split points to balance size
   */
  calculateOptimalSplits(paragraphs, metrics) {
    const totalTokens = metrics.reduce((sum, m) => sum + m.estimatedTokens, 0);
    const totalWords = metrics.reduce((sum, m) => sum + m.unifiedWords, 0);

    // Determine number of splits needed
    const tokenSplits = Math.ceil(totalTokens / this.limits.maxTokensPerAct);
    const wordSplits = Math.ceil(totalWords / this.limits.maxUnifiedWordsPerAct);
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
      const wouldExceed = (currentTokens + paraTokens > targetTokens * 1.2) || 
                         (currentWords + paraWords > targetWords * 1.2);

      const isLastSplit = splitIdx === numSplits - 1;
      const hasContent = currentText.length > 0;

      if (wouldExceed && hasContent && !isLastSplit) {
        // Finalize current split
        splits.push({
          text: currentText.join('\n\n'),
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
        text: currentText.join('\n\n'),
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
        status: 'pending',
      });

      console.log(`[ActCreation] Created act ${data.label} (${data.unifiedWordCount} words, ${data.tokenCount} tokens)`);
      return act;
    } catch (error) {
      console.error(`[ActCreation] Failed to create act ${data.label}:`, error.message);
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
        dependencyType: 'translation_sequence',
      });
    } catch (error) {
      console.warn(`[ActCreation] Failed to create dependency ${fromActId} -> ${toActId}:`, error.message);
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
    const numSplits = Math.ceil(totalWords / this.limits.maxUnifiedWordsPerAct) || 1;

    return this.calculateOptimalSplits(paragraphs, metrics).map((split, idx) => ({
      ...split,
      label: String.fromCharCode(65 + idx), // A, B, C...
    }));
  }
}

module.exports = new ActCreationService();
