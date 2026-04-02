/**
 * Paragraph Normalizer - Text preprocessing
 * 
 * Changes:
 * 1. Use TextMetrics instead of local estimateTokens
 * 2. Slightly faster regex patterns
 */

const TextMetrics = require('../utils/textMetrics');

function normalizeLineBreaksAndHtml(rawText) {
  return (rawText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function splitNaturalParagraphs(text) {
  const paragraphs = [];
  if (!text) return paragraphs;

  // Optimized regex for CJK text detection
  const boundaryRegex = /\n\n+|\n(?=　|「|『|[\u3400-\u9FFF]{2,4}(?:は|が||在))/g;
  let lastIndex = 0;
  let match;

  while ((match = boundaryRegex.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > lastIndex) {
      const rawChunk = text.slice(lastIndex, end);
      const chunk = rawChunk.trim();
      if (chunk || rawChunk.length > 0) {
        paragraphs.push({
          text: chunk,
          startPos: lastIndex,
          endPos: end,
          isSynthetic: false,
        });
      }
    }
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    const tailRaw = text.slice(lastIndex);
    const tail = tailRaw.trim();
    if (tail || tailRaw.length > 0) {
      paragraphs.push({
        text: tail,
        startPos: lastIndex,
        endPos: text.length,
        isSynthetic: false,
      });
    }
  }

  return paragraphs;
}

function mergeIncompleteParagraphs(paragraphs) {
  const merged = [];
  const sentenceEndRegex = /[。！？.!?]$/;

  for (let i = 0; i < paragraphs.length; i++) {
    const current = { ...paragraphs[i] };
    let attempts = 0;

    while (
      !sentenceEndRegex.test(current.text.trim()) &&
      i + 1 < paragraphs.length &&
      attempts < 3
    ) {
      const next = paragraphs[i + 1];
      current.text = `${current.text}\n${next.text}`;
      current.endPos = next.endPos;
      current.isSynthetic = current.isSynthetic || next.isSynthetic;
      attempts += 1;
      i += 1;
    }

    merged.push(current);
  }

  return merged;
}

function buildSyntheticParagraphs(text) {
  const sentenceRegex = /[^。！？.!?\n]+[。！？.!?]?/g;
  const sentences = [];
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = (match[0] || '').trim();
    if (!sentence) continue;

    const startOffset = match.index + match[0].indexOf(sentence);
    sentences.push({
      text: sentence,
      startPos: startOffset,
      endPos: startOffset + sentence.length,
    });
  }

  if (sentences.length === 0) {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];

    const startPos = text.indexOf(trimmed);
    return [{
      text: trimmed,
      startPos: startPos < 0 ? 0 : startPos,
      endPos: (startPos < 0 ? 0 : startPos) + trimmed.length,
      isSynthetic: true,
    }];
  }

  const grouped = [];
  const groupSize = 4;

  for (let i = 0; i < sentences.length; i += groupSize) {
    const group = sentences.slice(i, i + groupSize);
    grouped.push({
      text: group.map((s) => s.text).join('\n'),
      startPos: group[0].startPos,
      endPos: group[group.length - 1].endPos,
      isSynthetic: true,
    });
  }

  return grouped;
}

function normalizeParagraphs(rawText) {
  const normalized = normalizeLineBreaksAndHtml(rawText);
  if (!normalized.trim()) return [];

  let paragraphs = splitNaturalParagraphs(normalized);
  paragraphs = mergeIncompleteParagraphs(paragraphs);

  if (paragraphs.length <= 1) {
    const synthetic = buildSyntheticParagraphs(normalized);
    if (synthetic.length > 1) {
      paragraphs = synthetic;
    }
  }

  // Ensure contiguous coverage
  if (paragraphs.length > 0) {
    paragraphs[0].startPos = 0;
    for (let i = 1; i < paragraphs.length; i++) {
      if (paragraphs[i].startPos < paragraphs[i - 1].endPos) {
        paragraphs[i].startPos = paragraphs[i - 1].endPos;
      }
      if (paragraphs[i].startPos > paragraphs[i - 1].endPos) {
        paragraphs[i - 1].endPos = paragraphs[i].startPos;
      }
    }
    paragraphs[paragraphs.length - 1].endPos = normalized.length;
  }

  return paragraphs.map((p, idx) => ({
    index: idx + 1,
    text: p.text || normalized.slice(p.startPos, p.endPos).trim(),
    startPos: p.startPos,
    endPos: p.endPos,
    isSynthetic: Boolean(p.isSynthetic),
  }));
}

module.exports = {
  normalizeLineBreaksAndHtml,
  normalizeParagraphs,
};
