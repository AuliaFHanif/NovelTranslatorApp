const { Act, sequelize } = require("../models");
const { estimateTokens } = require("./paragraphNormalizer");

const MAX_ACT_TOKENS = Number(process.env.MAX_ACT_TOKENS) || 1000;

function validateBoundaries(boundaries, paragraphCount) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    throw new Error("Segmentation produced zero boundaries");
  }

  for (let i = 0; i < boundaries.length; i += 1) {
    const boundary = Number(boundaries[i]);
    if (!Number.isInteger(boundary)) {
      throw new Error(`Boundary at index ${i} is not an integer`);
    }
    if (boundary < 1 || boundary > paragraphCount) {
      throw new Error(`Boundary ${boundary} out of range 1..${paragraphCount}`);
    }
    if (i > 0 && boundary <= boundaries[i - 1]) {
      throw new Error(
        `Boundaries must be strictly increasing: ${boundaries[i - 1]} >= ${boundary}`,
      );
    }
  }

  if (boundaries[boundaries.length - 1] !== paragraphCount) {
    throw new Error(
      `BOUNDARY COVERAGE GAP: last boundary ${boundaries[boundaries.length - 1]} does not match paragraph count ${paragraphCount}`,
    );
  }
}

function splitActIfNeeded(paragraphs, startIdx, endIdx, sourceText) {
  const firstParagraph = paragraphs[startIdx - 1];
  const lastParagraph = paragraphs[endIdx - 1];
  const totalTokens = estimateTokens(
    sourceText.slice(firstParagraph.startPos, lastParagraph.endPos),
  );

  if (totalTokens <= MAX_ACT_TOKENS) {
    return [
      {
        paragraphs: [startIdx, endIdx],
        splitIndex: 0,
        splitLabel: null,
      },
    ];
  }

  const splits = [];
  let currentStart = startIdx;
  let currentTokens = 0;
  let splitIndex = 1;

  for (let i = startIdx; i <= endIdx; i += 1) {
    const paragraphText = paragraphs[i - 1].text;
    const paragraphTokens = estimateTokens(paragraphText);

    if (currentTokens + paragraphTokens > MAX_ACT_TOKENS && i > currentStart) {
      splits.push({
        paragraphs: [currentStart, i - 1],
        splitIndex,
        splitLabel: String.fromCharCode(64 + splitIndex),
      });

      currentStart = i;
      currentTokens = paragraphTokens;
      splitIndex += 1;
    } else {
      currentTokens += paragraphTokens;
    }
  }

  if (currentStart <= endIdx) {
    splits.push({
      paragraphs: [currentStart, endIdx],
      splitIndex,
      splitLabel: String.fromCharCode(64 + splitIndex),
    });
  }

  return splits;
}

function verifyActsReconstructSource(acts, sourceText) {
  if (!Array.isArray(acts) || acts.length === 0) {
    throw new Error("No acts were created for verification");
  }

  const ordered = [...acts].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.splitIndex - b.splitIndex;
  });

  let cursor = 0;
  const rebuilt = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const act = ordered[i];
    if (act.boundaryStart !== cursor) {
      const direction = act.boundaryStart > cursor ? "GAP" : "OVERLAP";
      throw new Error(
        `ACT_INTEGRITY_${direction}: expected next start ${cursor}, got ${act.boundaryStart} at act ${act.label}`,
      );
    }

    if (act.boundaryEnd < act.boundaryStart) {
      throw new Error(
        `ACT_INTEGRITY_INVALID_RANGE: end ${act.boundaryEnd} before start ${act.boundaryStart} at act ${act.label}`,
      );
    }

    rebuilt.push(act.rawActText || "");
    cursor = act.boundaryEnd;
  }

  if (cursor !== sourceText.length) {
    throw new Error(
      `ACT_INTEGRITY_COVERAGE_MISMATCH: rebuilt end ${cursor} does not match source length ${sourceText.length}`,
    );
  }

  const concatenated = rebuilt.join("");
  if (concatenated !== sourceText) {
    let mismatchAt = -1;
    const max = Math.min(concatenated.length, sourceText.length);
    for (let i = 0; i < max; i += 1) {
      if (concatenated[i] !== sourceText[i]) {
        mismatchAt = i;
        break;
      }
    }
    if (mismatchAt === -1 && concatenated.length !== sourceText.length) {
      mismatchAt = max;
    }

    throw new Error(
      `ACT_INTEGRITY_TEXT_MISMATCH: reconstructed text diverges at index ${mismatchAt}`,
    );
  }
}

async function createActs(
  chapterId,
  paragraphs,
  segmentationResult,
  sourceText,
) {
  const { boundaries, source } = segmentationResult;
  if (!sourceText || typeof sourceText !== "string") {
    throw new Error("Act creation requires normalized source text");
  }
  validateBoundaries(boundaries, paragraphs.length);

  const createdActs = [];

  await sequelize.transaction(async (transaction) => {
    let orderCounter = 1;

    for (let i = 0; i < boundaries.length; i += 1) {
      const startParagraph = i === 0 ? 1 : boundaries[i - 1] + 1;
      const endParagraph = boundaries[i];

      const splits = splitActIfNeeded(
        paragraphs,
        startParagraph,
        endParagraph,
        sourceText,
      );

      if (splits.length === 1 && splits[0].splitIndex === 0) {
        const firstParagraph = paragraphs[startParagraph - 1];
        const lastParagraph = paragraphs[endParagraph - 1];
        const rawActText = sourceText.slice(
          firstParagraph.startPos,
          lastParagraph.endPos,
        );

        const act = await Act.create(
          {
            chapterId,
            order: orderCounter,
            label: String(orderCounter),
            rawActText,
            parentActId: null,
            splitIndex: 0,
            glossaryScopeId: null,
            dependsOnActId: null,
            status: "pending",
            boundaryStart: firstParagraph.startPos,
            boundaryEnd: lastParagraph.endPos,
            tokenCount: estimateTokens(rawActText),
            source,
          },
          { transaction },
        );

        await act.update({ glossaryScopeId: act.id }, { transaction });
        createdActs.push(act);
      } else {
        let rootSplitId = null;
        let previousSplitId = null;

        for (
          let splitOffset = 0;
          splitOffset < splits.length;
          splitOffset += 1
        ) {
          const split = splits[splitOffset];
          const firstParagraph = paragraphs[split.paragraphs[0] - 1];
          const lastParagraph = paragraphs[split.paragraphs[1] - 1];
          const isFirstSplit = splitOffset === 0;
          const rawActText = sourceText.slice(
            firstParagraph.startPos,
            lastParagraph.endPos,
          );

          const act = await Act.create(
            {
              chapterId,
              order: orderCounter,
              label: `${orderCounter}${split.splitLabel}`,
              rawActText,
              parentActId: isFirstSplit ? null : rootSplitId,
              splitIndex: split.splitIndex,
              glossaryScopeId: isFirstSplit ? null : rootSplitId,
              dependsOnActId: isFirstSplit ? null : previousSplitId,
              status: isFirstSplit ? "pending" : "blocked",
              boundaryStart: firstParagraph.startPos,
              boundaryEnd: lastParagraph.endPos,
              tokenCount: estimateTokens(rawActText),
              source,
            },
            { transaction },
          );

          if (isFirstSplit) {
            rootSplitId = act.id;
            await act.update({ glossaryScopeId: act.id }, { transaction });
          }

          previousSplitId = act.id;
          createdActs.push(act);
        }
      }

      orderCounter += 1;
    }

    verifyActsReconstructSource(createdActs, sourceText);
  });

  return createdActs;
}

module.exports = {
  createActs,
  splitActIfNeeded,
};
