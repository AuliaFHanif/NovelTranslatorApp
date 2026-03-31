const express = require("express");
const axios = require("axios");
const {
  Act,
  Chapter,
  Series,
  GlossaryTerm,
  PolishEdit,
  Polish,
} = require("../models");

const { Op } = require("sequelize");
const { resolveModel } = require("../services/resolveModel");
const { getPolishInstructions } = require("../services/polishPrompt");
const { polish: polishSchema } = require("../services/analysisSchemas");

const router = express.Router();

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234";
const LM_STUDIO_CHAT_ENDPOINT = `${LM_STUDIO_URL}/v1/chat/completions`;

function parsePass(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    return null;
  }
  return parsed;
}

function canRunPass() {
  return { ok: true };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function buildTranslationPrompt({
  language,
  rawActText,
  glossaryText,
  analysisContext,
}) {
  const languageName = language === "ja" ? "Japanese" : "Chinese";

  const userParts = [`Source language: ${languageName}`];

  if (glossaryText) {
    userParts.push(
      `Glossary (use these translations for names/terms):\n${glossaryText}`,
    );
  }

  if (analysisContext) {
    userParts.push(`Literary analysis context:\n${analysisContext}`);
  }

  userParts.push(
    "Task: Translate the following text into natural, faithful English. Preserve character voice, narrative tone, cultural nuance, and proper names. Return only the translated text.",
    "Source text:",
    rawActText,
  );

  return [
    {
      role: "system",
      content:
        "You are an expert literary translator specializing in translating web novels. Produce faithful, natural English translations that preserve the author's voice, tone, and style.",
    },
    {
      role: "user",
      content: userParts.join("\n\n"),
    },
  ];
}

function buildPolishPrompt({
  language,
  rawActText,
  initialTranslation,
  analysisContext,
}) {
  const languageName = language === "ja" ? "Japanese" : "Chinese";

  const userParts = [
    `Source language: ${languageName}`,
    `Source text:\n${rawActText}`,
    `Initial translation (Pass 3):\n${initialTranslation}`,
  ];

  if (analysisContext) {
    userParts.push(`Literary analysis context:\n${analysisContext}`);
  }

  const polishInstructions = getPolishInstructions(language);
  userParts.push(polishInstructions);

  return [
    {
      role: "system",
      content:
        "You are an expert literary editor. Refine translations into natural, high-quality literary English while strictly preserving the author's voice and intent.",
    },
    {
      role: "user",
      content: userParts.join("\n\n"),
    },
  ];
}

function formatGlossary(entries, language) {
  if (!entries.length) {
    return "";
  }

  const termField = language === "ja" ? "termJa" : "termZh";
  return entries
    .map((entry) => {
      const sourceTerm =
        entry[termField] || entry.canonicalForm || "(no source term)";
      const englishTerm = entry.termEn || "(no English term)";
      const typePrefix = entry.type ? `[${entry.type.toUpperCase()}] ` : "";
      const definition = entry.definition ? ` - ${entry.definition}` : "";
      return `- ${typePrefix}${sourceTerm} => ${englishTerm}${definition}`;
    })
    .join("\n");
}

async function collectGlossaryForAct(chapter, act) {
  // 1. Get terms specifically linked to this act via Phase 3 analysis (TermAppearances)
  const linkedApproved = await act.getGlossaryTerms({
    where: { status: "approved" },
    order: [["updatedAt", "DESC"]],
  });

  // 2. Fallback/Supplemental: Get all other approved terms for the series and scan for them
  // This catches terms added to glossary AFTER the analysis pass
  const allApproved = await GlossaryTerm.findAll({
    where: {
      seriesId: chapter.seriesId,
      status: "approved",
      id: { [Op.notIn]: linkedApproved.map((t) => t.id) },
    },
  });

  if (!act.rawText) {
    return linkedApproved;
  }

  const termField = chapter.Series?.language === "ja" ? "termJa" : "termZh";
  const manualScanMatches = allApproved.filter((term) => {
    // Check all possible forms: field specific, canonical, and variants
    const forms = [
      term[termField],
      term.canonicalForm,
      ...(term.metadata?.variants || []),
    ].filter(Boolean);

    return forms.some((form) => act.rawText.includes(form));
  });

  // Combine both sets
  return [...linkedApproved, ...manualScanMatches];
}

async function aggregateChapterFinalText(chapterId) {
  const acts = await Act.findAll({
    where: { chapterId },
    order: [["sequence", "ASC"]],
  });

  const cleanedTexts = acts
    .map((act) => {
      // Priority: 1. translatedText (user manual save or P3 output)
      //           2. anatomyProfile.finalTranslation (legacy/internal)
      let text =
        act.translatedText || act.anatomyProfile?.finalTranslation || "";

      // Strip <think>...</think> or Thinking Process: ... </think> blocks
      let cleaned = text
        .replace(/(?:<think>|Thinking Process:)[\s\S]*?<\/think>/g, "")
        .trim();

      // Handle orphaned </think> (where the AI starts thinking without an opening tag/phrase)
      if (cleaned.includes("</think>")) {
        cleaned = cleaned.split("</think>").pop().trim();
      }

      const source = act.translatedText
        ? "translatedText"
        : act.anatomyProfile?.finalTranslation
          ? "finalTranslation"
          : "empty";
      console.log(`Act ${act.sequence} export source: ${source}`);
      return cleaned;
    })
    .filter(Boolean);

  const finalText = cleanedTexts.join("\n\n");

  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) {
    return null;
  }

  chapter.finalText = finalText || null;

  // If we have text for all acts, set status to complete
  if (acts.length > 0 && cleanedTexts.length === acts.length) {
    chapter.status = "complete";
  } else if (cleanedTexts.length > 0) {
    chapter.status = "ready";
  }

  await chapter.save();
  return chapter;
}

async function prepareActTranslationContext(act, model, pass) {
  const chapter = await Chapter.findByPk(act.chapterId, {
    include: [
      { model: Series, as: "Series", attributes: ["id", "language", "title"] },
    ],
  });

  if (!chapter) {
    throw new Error(`Chapter ${act.chapterId} not found`);
  }

  const glossaryEntries = await collectGlossaryForAct(chapter, act);
  const glossaryText = formatGlossary(glossaryEntries, chapter.Series.language);

  // EXPLICIT ACT CONTEXT
  let analysisContext = `Current Position: Chapter ${chapter.number} | Act ${act.sequence} - ${act.label}`;

  const linguistic = act.anatomyProfile?.linguistic;
  const narrative = act.anatomyProfile?.narrative;
  if (linguistic || narrative) {
    const parts = [];
    if (narrative?.primaryEmotion)
      parts.push(`Primary emotion: ${narrative.primaryEmotion}`);
    if (narrative?.emotionalIntensity)
      parts.push(`Emotional intensity: ${narrative.emotionalIntensity}`);
    if (narrative?.pacingPattern)
      parts.push(`Pacing: ${narrative.pacingPattern}`);
    if (linguistic?.sentenceStructure)
      parts.push(`Sentence structure: ${linguistic.sentenceStructure}`);
    if (linguistic?.honorifics?.density)
      parts.push(`Honorific density: ${linguistic.honorifics.density}`);
    if (linguistic?.onomatopoeia?.density)
      parts.push(`Onomatopoeia density: ${linguistic.onomatopoeia.density}`);
    if (narrative?.emotionalTone?.enryo)
      parts.push("Enryo (restraint/reserve) present");
    if (narrative?.emotionalTone?.amae)
      parts.push("Amae (dependence/indulgence) present");
    if (parts.length > 0) analysisContext += "\n\n" + parts.join("\n");
  }

  const messages =
    pass !== 4
      ? buildTranslationPrompt({
          language: chapter.Series.language,
          rawActText: act.rawText || "",
          glossaryText,
          analysisContext,
        })
      : buildPolishPrompt({
          language: chapter.Series.language,
          rawActText: act.rawText || "",
          initialTranslation: act.anatomyProfile?.finalTranslation || "",
          analysisContext,
        });

  const resolvedModel = await resolveModel(model);
  const responseFormat = pass === 4 ? polishSchema : null;

  return { messages, resolvedModel, chapter, responseFormat };
}

async function runPassOnAct({
  act,
  pass,
  force,
  model,
  temperature,
  top_p,
  max_tokens,
}) {
  const readiness = canRunPass(act, pass, force);
  if (!readiness.ok) {
    return { status: 409, body: { error: readiness.reason } };
  }

  let messages, resolvedModel, chapter, responseFormat;
  try {
    const context = await prepareActTranslationContext(act, model, pass);
    messages = context.messages;
    resolvedModel = context.resolvedModel;
    chapter = context.chapter;
    responseFormat = context.responseFormat;
  } catch (err) {
    return { status: 404, body: { error: err.message } };
  }

  const llmRequest = {
    model: resolvedModel,
    messages,
    response_format: responseFormat,
    temperature: temperature ?? 0.4,

    top_p: top_p ?? 0.9,
    max_tokens: max_tokens ?? 16384,
  };

  let llmResponse;
  try {
    llmResponse = await axios.post(LM_STUDIO_CHAT_ENDPOINT, llmRequest, {
      timeout: 900000,
    });
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      return {
        status: 503,
        body: {
          error: "LM Studio service unavailable",
          message: `Cannot connect to ${LM_STUDIO_URL}. Ensure LM Studio is running.`,
        },
      };
    }

    if (error.code === "ECONNABORTED") {
      return {
        status: 504,
        body: {
          error: "LM Studio request timeout",
          message: "The translation request timed out.",
        },
      };
    }

    return {
      status: error.response?.status || 500,
      body: {
        error: "LM Studio error",
        details: error.response?.data || error.message,
      },
    };
  }

  const content = llmResponse.data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    return {
      status: 502,
      body: {
        error: "Invalid LLM response",
        message: "No message content returned from LM Studio.",
      },
    };
  }

  const profile = act.anatomyProfile || {};
  if (pass === 4) {
    try {
      const parsed = JSON.parse(content);
      const edits = parsed.edits || [];

      let patchedText = act.anatomyProfile?.finalTranslation || "";
      const appliedEdits = [];

      for (const edit of edits) {
        if (edit.original && edit.replacement) {
          // Improve matching by allowing fuzzy whitespace if the exact match fails
          const escapedOriginal = escapeRegExp(edit.original);
          let regex = new RegExp(escapedOriginal, "g");

          if (!regex.test(patchedText)) {
            // First fallback: whitespace normalization
            const fuzzyOriginal = escapedOriginal.replace(/\s+/g, "\\s+");
            regex = new RegExp(fuzzyOriginal, "g");
          } else {
            // Reset regex for actual replacement
            regex = new RegExp(escapedOriginal, "g");
          }

          const matched = regex.test(patchedText);
          if (matched) {
            patchedText = patchedText.replace(regex, edit.replacement);
            appliedEdits.push({ ...edit, applied: true });
          } else {
            console.warn(`Pass 4 edit failed to match: "${edit.original}"`);
            appliedEdits.push({ ...edit, applied: false });
          }
        }
      }

      act.translatedText = patchedText;
      act.anatomyProfile = {
        ...profile,
        pass4Polished: content,
        pass4Edits: appliedEdits,
        pass4AppliedCount: appliedEdits.filter((e) => e.applied).length,
        pass4TotalCount: appliedEdits.length,
      };

      // 1. Mark existing polishes as inactive
      await Polish.update({ isActive: false }, { where: { actId: act.id } });

      // 2. Create new Polish record
      const newPolish = await Polish.create({
        actId: act.id,
        modelUsed: resolvedModel,
        content: patchedText,
        editCount: appliedEdits.length,
        appliedCount: appliedEdits.filter((e) => e.applied).length,
        isActive: true,
      });

      // 3. Save to PolishEdit table, linked to the new Polish record
      await PolishEdit.bulkCreate(
        appliedEdits.map((edit) => ({
          actId: act.id,
          polishId: newPolish.id, // Linked to the new container
          original: edit.original,
          replacement: edit.replacement,
          reason: edit.reason,
          applied: edit.applied,
          modelUsed: resolvedModel,
        })),
      );
    } catch (e) {
      console.error("Failed to parse Pass 4 JSON edits/save to DB:", e.message);
    }
  } else {
    act.anatomyProfile = { ...profile, finalTranslation: content };
    // Pass 3 also populates the base translatedText for export/viewing
    act.translatedText = content;
  }

  act.status = "ready";

  act.lastRunAt = new Date();
  act.llmMeta = {
    ...(act.llmMeta || {}),
    [`pass${pass}`]: {
      model: llmRequest.model,
      temperature: llmRequest.temperature,
      top_p: llmRequest.top_p,
      max_tokens: llmRequest.max_tokens,
      ranAt: new Date().toISOString(),
    },
  };

  await act.save();

  await Chapter.update({ status: "ready" }, { where: { id: act.chapterId } });

  // await aggregateChapterFinalText(act.chapterId);

  return {
    status: 200,
    body: {
      success: true,
      data: {
        act,
        pass,
        output: content,
      },
    },
  };
}

router.get("/translate/:seriesId/chapter/:chapterId", async (req, res) => {
  try {
    const seriesId = Number(req.params.seriesId);
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(seriesId) || seriesId < 1) {
      return res.status(400).json({ error: "Invalid seriesId" });
    }
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId, {
      include: [
        {
          model: Series,
          as: "Series",
          attributes: ["id", "title", "language", "genre"],
        },
      ],
    });

    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${chapterId} not found` });
    }

    if (chapter.seriesId !== seriesId) {
      return res
        .status(403)
        .json({ error: "Chapter does not belong to this series" });
    }

    const acts = await Act.findAll({
      where: { chapterId },
      include: [
        { model: PolishEdit, as: "PolishEdits" },
        {
          model: Polish,
          as: "Polishes",
          where: { isActive: true },
          required: false,
          include: [{ model: PolishEdit, as: "Edits" }],
        },
      ],
      order: [["sequence", "ASC"]],
    });

    const progress = {
      totalActs: acts.length,
      pass1Done: acts.length, // If acts exist, Architect is done
      pass2Done: acts.filter((act) => Boolean(act.anatomyProfile?.linguistic))
        .length,
      pass3Done: acts.filter((act) =>
        Boolean(act.anatomyProfile?.finalTranslation),
      ).length,
      pass4Done: acts.filter((act) => Boolean(act.translatedText)).length,
    };

    res.status(200).json({
      success: true,
      data: {
        chapter,
        acts,
        progress,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/translation/translate/:seriesId/chapter/:chapterId - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/acts/:actId/pass", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const pass = parsePass(req.body.pass);
    const force = Boolean(req.body.force);

    if (!Number.isInteger(actId) || actId < 1) {
      return res.status(400).json({ error: "Invalid actId" });
    }

    if (!pass) {
      return res.status(400).json({ error: "Pass must be 1, 2, or 3" });
    }

    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: `Act ${actId} not found` });
    }

    const result = await runPassOnAct({
      act,
      pass,
      force,
      model: req.body.model,
      temperature: req.body.temperature,
      top_p: req.body.top_p,
      max_tokens: req.body.max_tokens,
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error(
      "POST /api/translation/acts/:actId/pass - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/chapters/:chapterId/pass", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    const pass = parsePass(req.body.pass);
    const force = Boolean(req.body.force);

    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    if (!pass) {
      return res.status(400).json({ error: "Pass must be 1, 2, or 3" });
    }

    const acts = await Act.findAll({
      where: { chapterId },
      order: [["sequence", "ASC"]],
    });

    if (!acts.length) {
      return res
        .status(404)
        .json({ error: `No acts found for chapter ${chapterId}` });
    }

    const results = [];
    const failures = [];

    for (const act of acts) {
      const result = await runPassOnAct({
        act,
        pass,
        force,
        model: req.body.model,
        temperature: req.body.temperature,
        top_p: req.body.top_p,
        max_tokens: req.body.max_tokens,
      });

      if (result.status === 200) {
        results.push(result.body.data);
      } else {
        failures.push({
          actId: act.id,
          status: result.status,
          error: result.body.error || "Failed to run pass",
          message: result.body.message,
        });
      }
    }

    const refreshedActs = await Act.findAll({
      where: { chapterId },
      include: [
        { model: PolishEdit, as: "PolishEdits" },
        {
          model: Polish,
          as: "Polishes",
          where: { isActive: true },
          required: false,
          include: [{ model: PolishEdit, as: "Edits" }],
        },
      ],
      order: [["sequence", "ASC"]],
    });

    // if (failures.length === 0) {
    //   await aggregateChapterFinalText(chapterId);
    // }

    res.status(failures.length > 0 ? 207 : 200).json({
      success: failures.length === 0,
      data: {
        pass,
        completed: results.length,
        failed: failures.length,
        failures,
        acts: refreshedActs,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/translation/chapters/:chapterId/pass - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.get("/acts/:actId/prompt", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const model = req.query.model;
    const act = await Act.findByPk(actId);

    if (!act) return res.status(404).json({ error: "Act not found" });

    const pass = parsePass(req.query.pass) || 3;
    const { messages } = await prepareActTranslationContext(act, model, pass);

    res.status(200).json({
      success: true,
      data: {
        messages,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/translation/acts/:actId/prompt - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.get("/acts/:actId/stream", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const model = req.query.model;
    const act = await Act.findByPk(actId);

    if (!act) return res.status(404).json({ error: "Act not found" });

    const passNum = Number(req.query.pass) || 3;
    const { messages, resolvedModel, responseFormat } =
      await prepareActTranslationContext(act, model, passNum);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const llmRequest = {
      model: resolvedModel,
      messages,
      response_format: responseFormat,
      temperature: 0.4,
      max_tokens: 16384,
      stream: true,
    };

    const response = await axios.post(LM_STUDIO_CHAT_ENDPOINT, llmRequest, {
      responseType: "stream",
    });

    let fullText = "";

    response.data.on("data", (chunk) => {
      const raw = chunk.toString();
      const lines = raw.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") break;

        try {
          const data = JSON.parse(dataStr);
          const content = data.choices[0]?.delta?.content || "";
          if (content) {
            fullText += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }
    });

    response.data.on("end", async () => {
      try {
        const profile = act.anatomyProfile || {};
        const passId = Number(req.query.pass) || 3;

        if (passId === 4) {
          try {
            const parsed = JSON.parse(fullText);
            const edits = parsed.edits || [];

            let patchedText = act.anatomyProfile?.finalTranslation || "";
            const appliedEdits = [];

            for (const edit of edits) {
              if (edit.original && edit.replacement) {
                const escapedOriginal = escapeRegExp(edit.original);
                let regex = new RegExp(escapedOriginal, "g");

                if (!regex.test(patchedText)) {
                  const fuzzyOriginal = escapedOriginal.replace(/\s+/g, "\\s+");
                  regex = new RegExp(fuzzyOriginal, "g");
                } else {
                  regex = new RegExp(escapedOriginal, "g");
                }

                const matched = regex.test(patchedText);
                if (matched) {
                  patchedText = patchedText.replace(regex, edit.replacement);
                  appliedEdits.push({ ...edit, applied: true });
                } else {
                  appliedEdits.push({ ...edit, applied: false });
                }
              }
            }

            act.translatedText = patchedText;
            act.anatomyProfile = {
              ...profile,
              pass4Polished: fullText,
              pass4Edits: appliedEdits,
              pass4AppliedCount: appliedEdits.filter((e) => e.applied).length,
              pass4TotalCount: appliedEdits.length,
            };

            // 1. Mark existing polishes as inactive
            await Polish.update(
              { isActive: false },
              { where: { actId: act.id } },
            );

            // 2. Create new Polish record
            const newPolish = await Polish.create({
              actId: act.id,
              modelUsed: resolvedModel,
              content: patchedText,
              editCount: appliedEdits.length,
              appliedCount: appliedEdits.filter((e) => e.applied).length,
              isActive: true,
            });

            // 3. Save to PolishEdit table, linked to the new Polish record
            await PolishEdit.bulkCreate(
              appliedEdits.map((edit) => ({
                actId: act.id,
                polishId: newPolish.id, // Linked to the new container
                original: edit.original,
                replacement: edit.replacement,
                reason: edit.reason,
                applied: edit.applied,
                modelUsed: resolvedModel,
              })),
            );
          } catch (e) {
            console.error(
              "Failed to parse streamed Pass 4 JSON/save to DB:",
              e.message,
            );
          }
        } else {
          act.anatomyProfile = { ...profile, finalTranslation: fullText };
          act.translatedText = fullText;
        }

        act.status = "ready";
        await act.save();
      } catch (err) {
        console.error("Failed to save streamed translation:", err);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
      res.end();
    });
  } catch (error) {
    console.error("Streaming route error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.end();
    }
  }
});

router.patch("/acts/:actId", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    if (!Number.isInteger(actId) || actId < 1) {
      return res.status(400).json({ error: "Invalid actId" });
    }

    const { draftTranslation, translation, rawText } = req.body;

    const act = await Act.findByPk(actId);
    if (!act) {
      return res.status(404).json({ error: `Act ${actId} not found` });
    }

    if (rawText !== undefined) {
      act.rawText = rawText;
    }
    const profile = act.anatomyProfile || {};
    let saveProfile = false;

    if (draftTranslation !== undefined) {
      profile.draftTranslation = draftTranslation;
      saveProfile = true;
      act.status = "processing";
    }
    if (translation !== undefined) {
      profile.finalTranslation = translation;
      profile.pass3Final = translation;
      saveProfile = true;
      act.status = "ready";
    }

    if (translation !== undefined) {
      act.translatedText = translation;
    }

    if (saveProfile) {
      act.anatomyProfile = profile;
    }

    act.lastRunAt = new Date();
    await act.save();

    // if (translation !== undefined) {
    //   await aggregateChapterFinalText(act.chapterId);
    // }

    res.status(200).json({
      success: true,
      message: "Act updated",
      data: act,
    });
  } catch (error) {
    console.error("PATCH /api/translation/acts/:actId - Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/chapters/:chapterId/acts", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);

    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: `Chapter ${chapterId} not found` });
    }

    const deleted = await Act.destroy({ where: { chapterId } });

    // Reset chapter status
    chapter.status = "pending";
    chapter.finalText = null;
    chapter.strategyProfile = null;
    await chapter.save();

    res.status(200).json({
      success: true,
      message: `Deleted ${deleted} act(s) for chapter ${chapterId}`,
      deletedCount: deleted,
    });
  } catch (error) {
    console.error(
      "DELETE /api/translation/chapters/:chapterId/acts - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.post("/chapters/:chapterId/export", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await aggregateChapterFinalText(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    res.status(200).json({
      success: true,
      message: "Chapter exported successfully",
      data: chapter,
    });
  } catch (error) {
    console.error(
      "POST /api/translation/chapters/:chapterId/export - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

router.delete("/chapters/:chapterId/export", async (req, res) => {
  try {
    const chapterId = Number(req.params.chapterId);
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return res.status(400).json({ error: "Invalid chapterId" });
    }

    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    chapter.finalText = null;
    await chapter.save();

    res.status(200).json({
      success: true,
      message: "Chapter result deleted successfully",
      data: chapter,
    });
  } catch (error) {
    console.error(
      "DELETE /api/translation/chapters/:chapterId/export - Error:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
