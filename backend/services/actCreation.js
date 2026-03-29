const { Act, ActDependency } = require('../models');

class ActCreationService {
  constructor() {
    this.MAX_TOKENS = parseInt(process.env.MAX_ACT_TOKENS) || 1000;
  }

  /**
   * Create acts from segmentation boundaries
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
      const actText = actParagraphs.map(p => p.text).join('\n\n');
      const tokenCount = this.estimateTokens(actText);

      if (tokenCount <= this.MAX_TOKENS) {
        // Create single act
        const act = await Act.create({
          chapterId,
          sequence: sequence++,
          label: String(sequence - 1),
          rawText: actText,
          tokenCount,
          segmentSource: source,
          status: 'pending'
        });
        createdActs.push(act);

      } else {
        // Split into multiple acts
        const baseSequence = sequence;
        const splits = this.splitAct(actText, actParagraphs);

        for (let j = 0; j < splits.length; j++) {
          const split = splits[j];

          const act = await Act.create({
            chapterId,
            sequence: sequence++,
            label: `${baseSequence}${split.label}`,
            rawText: split.text,
            tokenCount: this.estimateTokens(split.text),
            segmentSource: source,
            status: 'pending'
          });

          createdActs.push(act);

          // Create dependency chain for splits
          if (j > 0) {
            await ActDependency.create({
              actId: act.id,
              dependsOnActId: createdActs[createdActs.length - 2].id,
              dependencyType: 'translation_sequence'
            });
          }
        }
      }
    }

    return createdActs;
  }

  splitAct(actText, paragraphs) {
    const splits = [];
    const totalTokens = this.estimateTokens(actText);
    const numSplits = Math.ceil(totalTokens / this.MAX_TOKENS);
    const targetTokens = Math.ceil(totalTokens / numSplits);
    
    let currentText = '';
    let currentTokens = 0;
    let splitIndex = 0;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para.text);

      if (currentTokens + paraTokens > targetTokens && currentText.length > 0 && splitIndex < numSplits - 1) {
        splits.push({
          text: currentText.trim(),
          label: alphabet[splitIndex++]
        });
        currentText = para.text;
        currentTokens = paraTokens;
      } else {
        currentText += (currentText ? '\n\n' : '') + para.text;
        currentTokens += paraTokens;
      }
    }

    if (currentText) {
      splits.push({
        text: currentText.trim(),
        label: alphabet[splitIndex]
      });
    }

    return splits;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

module.exports = new ActCreationService();
