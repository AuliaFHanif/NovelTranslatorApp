const express = require("express");
const axios = require("axios");
const { Act, Chapter, Series, GlossaryTerm } = require("../models");
const { Op } = require("sequelize");

const router = express.Router();

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234";
const LM_STUDIO_CHAT_ENDPOINT = `${LM_STUDIO_URL}/v1/chat/completions`;
const DEFAULT_MODEL = process.env.LM_STUDIO_MODEL || "local-model";

function parsePass(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    return null;
  }
  return parsed;
}

function canRunPass(act, pass, force) {
  if (force) {
    return { ok: true };
  }

  if (pass === 2 && !act.pass1Analysis) {
    return { ok: false, reason: "Pass 1 must be completed before Pass 2" };
  }

  if (pass === 3 && !act.pass2Draft) {
    return { ok: false, reason: "Pass 2 must be completed before Pass 3" };
  }

  return { ok: true };
}

function buildPrompt(
  pass,
  { language, rawActText, pass1Analysis, pass2Draft, glossaryText },
) {
  const languageName = language === "ja" ? "Japanese" : "Chinese";

  if (pass === 1) {
    return [
      {
        role: "system",
        content:
          "You are a literary translation analyst. Produce concise analysis notes for translation quality.",
      },
      {
        role: "user",
        content: [
          `Source language: ${languageName}`,
          glossaryText
            ? `Glossary context:\n${glossaryText}`
            : "Glossary context: none",
          "Task: Analyze tone, voice, idioms, culture-specific references, and translation risks.",
          "Return clear bullet points only.",
          "Source text:",
          rawActText,
        ].join("\n\n"),
      },
    ];
  }

  if (pass === 2) {
    return [
      {
        role: "system",
        content:
          "You are a literary translator. Produce a faithful but natural English draft translation.",
      },
      {
        role: "user",
        content: [
          `Source language: ${languageName}`,
          glossaryText
            ? `Glossary context:\n${glossaryText}`
            : "Glossary context: none",
          pass1Analysis
            ? `Pass 1 analysis notes:\n${pass1Analysis}`
            : "Pass 1 analysis notes: none",
          "Task: Translate into English preserving intent, names, and tone.",
          "Return only the translation text.",
          "Source text:",
          rawActText,
        ].join("\n\n"),
      },
    ];
  }

  return [
    {
      role: "system",
      content:
        "You are a literary editor. Polish translation for readability while preserving meaning.",
    },
    {
      role: "user",
      content: [
        `Source language: ${languageName}`,
        glossaryText
          ? `Glossary context:\n${glossaryText}`
          : "Glossary context: none",
        pass1Analysis
          ? `Pass 1 analysis notes:\n${pass1Analysis}`
          : "Pass 1 analysis notes: none",
        "Task: Refine this draft translation and output final polished English text.",
        "Return only the polished translation text.",
        "Draft translation:",
        pass2Draft || "",
        "Source text (for reference):",
        rawActText,
      ].join("\n\n"),
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

async function collectGlossaryForAct(chapter, actId) {
  const entries = await GlossaryTerm.findAll({
    where: {
      seriesId: chapter.seriesId
    },
    order: [["updatedAt", "DESC"]],
  });

  return entries;
}

async function aggregateChapterFinalText(chapterId) {
  const acts = await Act.findAll({
    where: { chapterId },
    order: [
      ["sequence", "ASC"]
    ],
  });

  const finalText = acts
    .map((act) => (act.translation || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) {
    return;
  }

  chapter.finalText = finalText || null;
  chapter.status =
    acts.length > 0 && acts.every((act) => act.translation)
      ? "ready"
      : chapter.status;
  await chapter.save();
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
  const chapter = await Chapter.findByPk(act.chapterId, {
    include: [{ model: Series, as: 'Series', attributes: ["id", "language", "title"] }],
  });

  if (!chapter) {
    return {
      status: 404,
      body: { error: `Chapter ${act.chapterId} not found` },
    };
  }

  const readiness = canRunPass(act, pass, force);
  if (!readiness.ok) {
    return { status: 409, body: { error: readiness.reason } };
  }

  const glossaryEntries = await collectGlossaryForAct(chapter, act.id);
  const glossaryText = formatGlossary(glossaryEntries, chapter.Series.language);

  const messages = buildPrompt(pass, {
    language: chapter.Series.language,
    rawActText: act.rawText || "",
    pass1Analysis: act.anatomyProfile?.legacyAnalysis || "",
    pass2Draft: act.anatomyProfile?.draftTranslation || "",
    glossaryText,
  });

  const llmRequest = {
    model: model || DEFAULT_MODEL,
    messages,
    temperature: temperature ?? 0.4,
    top_p: top_p ?? 0.9,
    max_tokens: max_tokens ?? 2048,
  };

  let llmResponse;
  try {
    llmResponse = await axios.post(LM_STUDIO_CHAT_ENDPOINT, llmRequest, {
      timeout: 60000,
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
  if (pass === 1) {
    act.anatomyProfile = { ...profile, legacyAnalysis: content };
    act.status = "processing";
  } else if (pass === 2) {
    act.anatomyProfile = { ...profile, draftTranslation: content };
    act.status = "processing";
  } else {
    act.translation = content;
    act.status = "ready";
  }

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

  const chapterStatus =
    pass === 1 ? "processing" : pass === 2 ? "processing" : "ready";
  await Chapter.update(
    { status: chapterStatus },
    { where: { id: act.chapterId } },
  );

  if (pass === 3) {
    await aggregateChapterFinalText(act.chapterId);
  }

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
      pass1Done: acts.filter((act) => Boolean(act.anatomyProfile?.legacyAnalysis)).length,
      pass2Done: acts.filter((act) => Boolean(act.anatomyProfile?.draftTranslation)).length,
      pass3Done: acts.filter((act) => Boolean(act.translation)).length,
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

    if (pass === 3 && failures.length === 0) {
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
    if (saveProfile) {
      act.anatomyProfile = profile;
    }
    
    if (translation !== undefined) {
      act.translation = translation;
      act.status = "ready";
    }

    act.lastRunAt = new Date();
    await act.save();

    if (pass3Final !== undefined) {
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

module.exports = router;
