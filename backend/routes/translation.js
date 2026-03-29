const express = require("express");
const axios = require("axios");
const { Act, Chapter, Series, GlossaryTerm } = require("../models");
const { Op } = require("sequelize");
const { resolveModel } = require("../services/resolveModel");

const router = express.Router();

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234";
const LM_STUDIO_CHAT_ENDPOINT = `${LM_STUDIO_URL}/v1/chat/completions`;

function parsePass(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    return null;
  }
  return parsed;
}

function canRunPass() {
  return { ok: true };
}

function buildTranslationPrompt(
  { language, rawActText, glossaryText, analysisContext },
) {
  const languageName = language === "ja" ? "Japanese" : "Chinese";

  const userParts = [
    `Source language: ${languageName}`,
  ];

  if (glossaryText) {
    userParts.push(`Glossary (use these translations for names/terms):\n${glossaryText}`);
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

function formatGlossary(entries, language) {
  if (!entries.length) {
    return "";
  }

  const termField = language === "ja" ? "termJa" : "termZh";
  return entries
    .map((entry) => {
      const sourceTerm =
        entry[termField] ||
        entry.canonicalForm ||
        "(no source term)";
      const englishTerm = entry.termEn || "(no English term)";
      const definition = entry.definition ? ` - ${entry.definition}` : "";
      return `- ${sourceTerm} => ${englishTerm}${definition}`;
    })
    .join("\n");
}

async function collectGlossaryForAct(chapter, act) {
  const allApproved = await GlossaryTerm.findAll({
    where: {
      seriesId: chapter.seriesId,
      status: "approved"
    },
    order: [["updatedAt", "DESC"]],
  });

  if (!act.rawText || !allApproved.length) {
    return [];
  }

  // Filter ONLY terms that actually appear in the act's source text
  const termField = chapter.Series?.language === "ja" ? "termJa" : "termZh";
  const relevanceFilter = allApproved.filter(term => {
    const sourceString = term[termField] || term.canonicalForm;
    if (!sourceString) return false;
    
    // Exact match case-sensitive for source languages is best
    return act.rawText.includes(sourceString);
  });

  return relevanceFilter;
}

async function aggregateChapterFinalText(chapterId) {
  const acts = await Act.findAll({
    where: { chapterId },
    order: [
      ["sequence", "ASC"]
    ],
  });

  const finalText = acts
    .map((act) => (act.anatomyProfile?.finalTranslation || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) {
    return;
  }

  chapter.finalText = finalText || null;
  chapter.status =
    acts.length > 0 && acts.every((act) => act.anatomyProfile?.finalTranslation)
      ? "ready"
      : chapter.status;
  await chapter.save();
}

async function prepareActTranslationContext(act, model) {
  const chapter = await Chapter.findByPk(act.chapterId, {
    include: [{ model: Series, as: 'Series', attributes: ["id", "language", "title"] }],
  });

  if (!chapter) {
    throw new Error(`Chapter ${act.chapterId} not found`);
  }

  const glossaryEntries = await collectGlossaryForAct(chapter, act);
  const glossaryText = formatGlossary(glossaryEntries, chapter.Series.language);

  // EXPLICIT ACT CONTEXT
  let analysisContext = `Current Position: Chapter ${chapter.number} | Act ${act.sequence} - ${act.label}\n\n`;
  
  const linguistic = act.anatomyProfile?.linguistic;
  const narrative = act.anatomyProfile?.narrative;
  if (linguistic || narrative) {
    const parts = [];
    if (narrative?.primaryEmotion) parts.push(`Primary emotion: ${narrative.primaryEmotion}`);
    if (narrative?.emotionalIntensity) parts.push(`Emotional intensity: ${narrative.emotionalIntensity}`);
    if (narrative?.pacingPattern) parts.push(`Pacing: ${narrative.pacingPattern}`);
    if (linguistic?.sentenceStructure) parts.push(`Sentence structure: ${linguistic.sentenceStructure}`);
    if (linguistic?.honorifics?.density) parts.push(`Honorific density: ${linguistic.honorifics.density}`);
    if (linguistic?.onomatopoeia?.density) parts.push(`Onomatopoeia density: ${linguistic.onomatopoeia.density}`);
    if (narrative?.emotionalTone?.enryo) parts.push("Enryo (restraint/reserve) present");
    if (narrative?.emotionalTone?.amae) parts.push("Amae (dependence/indulgence) present");
    if (parts.length > 0) analysisContext = parts.join("\n");
  }

  const messages = buildTranslationPrompt({
    language: chapter.Series.language,
    rawActText: act.rawText || "",
    glossaryText,
    analysisContext,
  });

  const resolvedModel = await resolveModel(model);
  return { messages, resolvedModel, chapter };
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

  let messages, resolvedModel, chapter;
  try {
    const context = await prepareActTranslationContext(act, model);
    messages = context.messages;
    resolvedModel = context.resolvedModel;
    chapter = context.chapter;
  } catch (err) {
    return { status: 404, body: { error: err.message } };
  }

  const llmRequest = {
    model: resolvedModel,
    messages,
    temperature: temperature ?? 0.4,
    top_p: top_p ?? 0.9,
    max_tokens: max_tokens ?? 8192,
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
  act.anatomyProfile = { ...profile, finalTranslation: content };
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

  await Chapter.update(
    { status: "ready" },
    { where: { id: act.chapterId } },
  );

  await aggregateChapterFinalText(act.chapterId);

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
        { model: Series, as: 'Series', attributes: ["id", "title", "language", "genre"] },
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
      order: [
        ["sequence", "ASC"]
      ],
    });

    const progress = {
      totalActs: acts.length,
      pass1Done: acts.length, // If acts exist, Architect is done
      pass2Done: acts.filter((act) => Boolean(act.anatomyProfile?.linguistic)).length,
      pass3Done: acts.filter((act) => Boolean(act.anatomyProfile?.finalTranslation)).length,
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
      order: [
        ["sequence", "ASC"]
      ],
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
      order: [
        ["sequence", "ASC"]
      ],
    });

    if (failures.length === 0) {
      await aggregateChapterFinalText(chapterId);
    }

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

router.get("/acts/:actId/stream", async (req, res) => {
  try {
    const actId = Number(req.params.actId);
    const model = req.query.model;
    const act = await Act.findByPk(actId);
    
    if (!act) return res.status(404).json({ error: "Act not found" });

    const { messages, resolvedModel } = await prepareActTranslationContext(act, model);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const llmRequest = {
      model: resolvedModel,
      messages,
      temperature: 0.4,
      max_tokens: 8192,
      stream: true
    };

    const response = await axios.post(LM_STUDIO_CHAT_ENDPOINT, llmRequest, {
      responseType: 'stream'
    });

    let fullText = "";
    
    response.data.on('data', chunk => {
      const raw = chunk.toString();
      const lines = raw.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') break;
        
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

    response.data.on('end', async () => {
      try {
        const profile = act.anatomyProfile || {};
        act.anatomyProfile = { ...profile, finalTranslation: fullText };
        act.status = "ready";
        await act.save();
        await aggregateChapterFinalText(act.chapterId);
      } catch (err) {
        console.error("Failed to save streamed translation:", err);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });

    response.data.on('error', (err) => {
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

    if (saveProfile) {
      act.anatomyProfile = profile;
    }

    act.lastRunAt = new Date();
    await act.save();

    if (translation !== undefined) {
      await aggregateChapterFinalText(act.chapterId);
    }

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

module.exports = router;
