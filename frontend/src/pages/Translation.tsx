import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  getHealthStatus,
  getTranslationChapter,
  listAIModels,
  API_BASE_URL,
  // New Scene API
  getScenes,
  runSceneSegmentation,
  translateScene,
  polishScene,
  updateSceneRawText,
  deleteScene,
  deleteAllScenes,
  extractSceneTerms,
  analyzeScene,
  bulkApproveTermsToScene,
  // Real-time translation stream helper
  streamSceneTranslation,
  type AIModel,
  type GlossaryCandidate,
} from "../lib/api";
import type { Scene, Chapter } from "../types/scene";
import {
  showError,
  showInfo,
  showSuccess,
  showConfirm,
} from "../lib/notifications";
import { Badge } from "../components/ui/badge";
import { GlossaryApprovalDialog } from "../components/GlossaryApprovalDialog";
import { PolishSelectionPanel } from "../components/PolishSelectionPanel";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

export function Translation() {
  const [searchParams] = useSearchParams();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [editableTranslation, setEditableTranslation] = useState("");
  const [isLoadingChapter, setIsLoadingChapter] = useState(true);
  const [isRunningPass, setIsRunningPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modelName, setModelName] = useState("local-model");
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [apiStatus, setApiStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");

  const [isEditingScene, setIsEditingScene] = useState(false);
  const [editSceneText, setEditSceneText] = useState("");
  const [isSceneSaving, setIsSceneSaving] = useState(false);

  const [isExtractingTerms, setIsExtractingTerms] = useState(false);
  const [isAnalyzingScene, setIsAnalyzingScene] = useState(false);
  const [extractedTerms, setExtractedTerms] = useState<GlossaryCandidate[]>([]);
  const [isGlossaryDialogOpen, setIsGlossaryDialogOpen] = useState(false);
  const [failedExtractionScenes, setFailedExtractionScenes] = useState<
    Set<number>
  >(new Set());
  const [failedAnalysisScenes, setFailedAnalysisScenes] = useState<Set<number>>(
    new Set(),
  );
  const [polishPanelVisible, setPolishPanelVisible] = useState(true);

  // Simulation states
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [simLogs, setSimLogs] = useState<string[]>([]);

  const seriesId = Number(searchParams.get("seriesId") || "0");
  const chapterId = Number(searchParams.get("chapterId") || "0");

  const selectedScene = useMemo(() => {
    return scenes.find((s) => s.id === selectedSceneId) || null;
  }, [scenes, selectedSceneId]);

  const progress = useMemo(
    () => ({
      total: scenes.length,
      segmented: scenes.length > 0,
      translated: scenes.filter(
        (s) =>
          s.status === "translated" ||
          s.status === "polished" ||
          s.status === "complete",
      ).length,
      polished: scenes.filter(
        (s) => s.status === "polished" || s.status === "complete",
      ).length,
    }),
    [scenes],
  );

  const isLmStudioOnline = apiStatus === "ok";

  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoadingModels(true);
        const data = await listAIModels();
        setAiModels(data);
        if (data.length > 0) {
          setModelName(data[0].modelId);
        }
      } catch (error) {
        console.error("Failed to load AI models:", error);
        setAiModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    }
    void loadModels();
  }, []);

  useEffect(() => {
    void loadTranslationChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, chapterId]);

  useEffect(() => {
    void runConnectionTest(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, chapterId]);

  useEffect(() => {
    setEditableTranslation(
      selectedScene?.finalText || selectedScene?.translatedText || "",
    );
  }, [selectedScene]);

  async function loadTranslationChapter() {
    if (
      !Number.isInteger(seriesId) ||
      seriesId < 1 ||
      !Number.isInteger(chapterId) ||
      chapterId < 1
    ) {
      await showError(
        "No Chapter Selected",
        "Please select a chapter from your library to begin translation.",
      );
      return;
    }

    try {
      setIsLoadingChapter(true);
      const response = await getTranslationChapter(seriesId, chapterId);

      if (!response) {
        throw new Error("No response from server");
      }

      setChapter(response.chapter as unknown as Chapter);

      const scenesData = await getScenes(chapterId);
      setScenes(scenesData);

      setSelectedSceneId((current) => {
        if (!current) {
          return scenesData[0]?.id ?? null;
        }

        const stillExists = scenesData.some((s) => s.id === current);
        return stillExists ? current : (scenesData[0]?.id ?? null);
      });
    } catch (error) {
      await showError(
        "Failed to Load Chapter",
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setIsLoadingChapter(false);
    }
  }

  const handleApplyPolishEdits = useCallback(
    async (appliedEdits: import("../types/scene").PolishEdit[]) => {
      if (!selectedScene) return;

      let computedText = selectedScene.translatedText || "";
      for (const edit of appliedEdits) {
        if (edit.applied) {
          computedText = computedText.replaceAll(edit.original, edit.replacement);
        }
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/scenes/${selectedScene.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              translatedText: selectedScene.translatedText,
              finalText: computedText,
              polishEdits: appliedEdits,
              status: "complete",
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        await loadTranslationChapter();
        await showSuccess("Polish Applied", `Applied ${appliedEdits.filter((e) => e.applied).length} edits successfully. Scene marked complete.`);
      } catch (error) {
        await showError(
          "Apply Failed",
          error instanceof Error ? error.message : "Unable to apply polish edits.",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedScene],
  );

  async function handleTranslateScene() {
    if (!selectedScene) {
      await showInfo("No Scene Selected", "Select a scene before translating.");
      return;
    }

    if (!isLmStudioOnline) {
      await showError(
        "Ollama Offline",
        "Cannot translate while Ollama is offline.",
      );
      return;
    }

    try {
      setIsRunningPass(true);
      setEditableTranslation(""); // Clear and lock editor for streaming

      let streamedText = "";
      await streamSceneTranslation(selectedScene.id, modelName, (chunk) => {
        streamedText += chunk;
        // Perform clean, inline stripping of thinking and analysis blocks on the fly
        const cleanText = streamedText
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/<think>[\s\S]*/g, "")
          .replace(/<analysis>[\s\S]*?<\/analysis>/g, "")
          .replace(/<analysis>[\s\S]*/g, "");
        setEditableTranslation(cleanText);
      });

      await loadTranslationChapter();
      await showSuccess(
        "Translation Completed",
        `Scene ${selectedScene.sequence} has been translated.`,
      );
    } catch (error) {
      await showError(
        "Translation Failed",
        error instanceof Error ? error.message : "Unable to translate scene.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  async function handlePolishScene() {
    if (!selectedScene) {
      await showInfo("No Scene Selected", "Select a scene before polishing.");
      return;
    }

    try {
      setIsRunningPass(true);
      await polishScene(selectedScene.id, { model: modelName });
      await loadTranslationChapter();
      await showSuccess(
        "Polish Completed",
        `Scene ${selectedScene.sequence} has been polished.`,
      );
    } catch (error) {
      await showError(
        "Polish Failed",
        error instanceof Error ? error.message : "Unable to polish scene.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  function handleEditSceneStart() {
    if (!selectedScene) return;
    setEditSceneText(selectedScene.rawText);
    setIsEditingScene(true);
  }

  async function handleEditSceneSave() {
    if (!selectedScene) return;

    try {
      setIsSceneSaving(true);
      const result = await updateSceneRawText(selectedScene.id, editSceneText);

      if (result.split) {
        await showSuccess(
          "Scene Split",
          `Scene was split into multiple scenes due to size.`,
        );
      } else {
        await showSuccess("Scene Updated", `Scene updated successfully.`);
      }

      await loadTranslationChapter();
      setIsEditingScene(false);
      setEditSceneText("");
    } catch (error) {
      await showError(
        "Update Failed",
        error instanceof Error ? error.message : "Unable to update scene.",
      );
    } finally {
      setIsSceneSaving(false);
    }
  }

  function handleEditSceneCancel() {
    setIsEditingScene(false);
    setEditSceneText("");
  }

  async function handleDeleteScene() {
    if (!selectedScene) return;

    const confirmed = await showConfirm(
      "Delete Scene?",
      `Are you sure you want to delete this scene? Sequential scenes will be renumbered.`,
    );

    if (!confirmed) return;

    try {
      setIsSceneSaving(true);
      await deleteScene(selectedScene.id);

      await showSuccess("Scene Deleted", `Scene has been deleted.`);

      await loadTranslationChapter();
      setSelectedSceneId(null);
    } catch (error) {
      await showError(
        "Deletion Failed",
        error instanceof Error ? error.message : "Unable to delete scene.",
      );
    } finally {
      setIsSceneSaving(false);
    }
  }

  async function handleDeleteAllScenes() {
    if (!chapter) return;

    const confirmed = await showConfirm(
      "Delete ALL Scenes?",
      `This will permanently remove all ${scenes.length} scenes and their translations for this chapter. This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      setIsSceneSaving(true);
      await deleteAllScenes(chapter.id);
      await showSuccess(
        "All Scenes Deleted",
        `Chapter reset to pending status.`,
      );
      await loadTranslationChapter();
      setSelectedSceneId(null);
    } catch (error) {
      await showError(
        "Deletion Failed",
        error instanceof Error ? error.message : "Unable to delete scenes.",
      );
    } finally {
      setIsSceneSaving(false);
    }
  }

  async function handleRunChapterPass(pass: 1 | 2 | 3 | 4 | 5) {
    if (!chapter) return;

    if (!isLmStudioOnline) {
      await showError(
        "Ollama Offline",
        `Cannot run pass ${pass} while Ollama is offline.`,
      );
      return;
    }

    try {
      setIsRunningPass(true);

      // Pass 1: Segmentation
      if (pass === 1) {
        if (scenes.length > 0) {
          const confirmed = await showConfirm(
            "Re-segment Chapter?",
            "Scenes already exist. Re-segmenting will delete current scenes and translations. Continue?",
          );
          if (!confirmed) return;
        }

        const result = await runSceneSegmentation(chapter.id, {
          model: modelName,
        });
        await loadTranslationChapter();
        await showSuccess(
          "Segmentation Complete",
          `Created ${result.scenesCreated} scenes.`,
        );
        return;
      }

      // Check if scenes exist for remaining passes
      if (scenes.length === 0) {
        await showError("No Scenes", "Run segmentation (Pass 1) first.");
        return;
      }

      // Pass 2: Act Analysis
      if (pass === 2) {
        setIsAnalyzingScene(true);
        setFailedAnalysisScenes(new Set());
        let completed = 0;
        let failed = 0;
        const failedIds = new Set<number>();

        for (const scene of scenes) {
          try {
            await analyzeScene(scene.id, { model: modelName });
            completed++;
          } catch (err) {
            console.error(`Failed analyzing scene ${scene.id}:`, err);
            failedIds.add(scene.id);
            failed++;
          }
        }

        setFailedAnalysisScenes(failedIds);
        await loadTranslationChapter();
        if (failed > 0) {
          await showInfo(
            "Analysis Complete (with Errors)",
            `Analyzed ${completed} scenes. ${failed} scene(s) failed - marked with ⚠️ in the scenes list.`,
          );
        } else {
          await showSuccess(
            "Analysis Complete",
            `Analyzed all ${completed} scenes.`,
          );
        }
        return;
      }

      // Pass 3: Term & Name Extraction
      if (pass === 3) {
        setIsExtractingTerms(true);
        setFailedExtractionScenes(new Set());
        let completed = 0;
        let failed = 0;
        const allTerms: GlossaryCandidate[] = [];
        const failedIds = new Set<number>();

        for (const scene of scenes) {
          try {
            const result = await extractSceneTerms(scene.id, {
              model: modelName,
            });
            if (result.terms && result.terms.length > 0) {
              const normalizedTerms = result.terms.map((t: any) => ({
                ...t,
                context: t.context || "",
              }));
              allTerms.push(
                ...(normalizedTerms as unknown as GlossaryCandidate[]),
              );
            }
            completed++;
          } catch (err) {
            console.error(`Failed extracting from scene ${scene.id}:`, err);
            failedIds.add(scene.id);
            failed++;
          }
        }

        setFailedExtractionScenes(failedIds);
        await loadTranslationChapter();

        // Filter out terms already in database and deduplicate terms picked up in this pass
        const seenTerms = new Set<string>();
        const filteredTerms: GlossaryCandidate[] = [];
        for (const t of allTerms) {
          if (t.existingId !== null || (t as any).matchType !== "new") {
            continue;
          }
          const norm = t.term.trim().toLowerCase().normalize("NFKC");
          if (seenTerms.has(norm)) {
            continue;
          }
          seenTerms.add(norm);
          filteredTerms.push(t);
        }

        if (filteredTerms.length > 0) {
          setExtractedTerms(filteredTerms);
          setIsGlossaryDialogOpen(true);
          if (failed > 0) {
            await showInfo(
              "Extraction Complete (with Errors)",
              `Extracted ${filteredTerms.length} new terms from ${completed} scenes. ${failed} scene(s) failed - marked with ⚠️ in the scenes list.`,
            );
          } else {
            await showSuccess(
              "Extraction Complete",
              `Extracted ${filteredTerms.length} new terms from all ${completed} scenes.`,
            );
          }
        } else {
          if (failed > 0) {
            await showError(
              "Extraction Failed",
              `Could not extract any new terms from scenes. ${failed} scene(s) failed.`,
            );
          } else {
            await showInfo(
              "No New Terms Found",
              "AI did not identify any new terminology that is not already in your library.",
            );
          }
        }
        return;
      }

      // Pass 4: Translation
      if (pass === 4) {
        let completed = 0;
        let failed = 0;

        for (const scene of scenes) {
          try {
            await translateScene(scene.id, { model: modelName });
            completed++;
          } catch (err) {
            console.error(`Failed translating scene ${scene.id}:`, err);
            failed++;
          }
        }

        await loadTranslationChapter();
        if (failed > 0) {
          await showError(
            "Translation Complete with Errors",
            `${completed} succeeded, ${failed} failed.`,
          );
        } else {
          await showSuccess(
            "Translation Complete",
            `All ${completed} scenes translated.`,
          );
        }
        return;
      }

      // Pass 5: Polishing
      if (pass === 5) {
        let completed = 0;
        let failed = 0;

        for (const scene of scenes) {
          try {
            await polishScene(scene.id, { model: modelName });
            completed++;
          } catch (err) {
            console.error(`Failed polishing scene ${scene.id}:`, err);
            failed++;
          }
        }

        await loadTranslationChapter();
        if (failed > 0) {
          await showError(
            "Polish Complete with Errors",
            `${completed} succeeded, ${failed} failed.`,
          );
        } else {
          await showSuccess(
            "Polish Complete",
            `All ${completed} scenes polished.`,
          );
        }
        return;
      }

    } catch (error) {
      await showError(
        `Pass ${pass} Failed`,
        error instanceof Error ? error.message : "Unable to run pass.",
      );
    } finally {
      setIsRunningPass(false);
      setIsAnalyzingScene(false);
      setIsExtractingTerms(false);
    }
  }

  async function handleSaveTranslation() {
    if (!selectedScene) return;

    if (!editableTranslation.trim()) {
      await showInfo("Nothing to Save", "Translation is empty.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(
        `${API_BASE_URL}/scenes/${selectedScene.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translatedText: editableTranslation }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      await loadTranslationChapter();
      await showSuccess("Saved", "Translation updated successfully.");
    } catch (error) {
      await showError(
        "Save Failed",
        error instanceof Error ? error.message : "Unable to save translation.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyTranslation() {
    if (!editableTranslation.trim()) {
      await showInfo("Nothing to Copy", "No translation text available yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(editableTranslation);
      await showSuccess("Copied", "Translation copied to clipboard.");
    } catch {
      await showError("Copy Failed", "Clipboard access is not available.");
    }
  }

  async function runConnectionTest(silent = false) {
    try {
      setApiStatus("testing");
      const health = await getHealthStatus();
      const lmStudioStatus = health.services?.lmStudio?.status;
      const lmStudioMessage =
        health.services?.lmStudio?.message ||
        "Ollama service is not available.";

      if (health.status === "ok" && lmStudioStatus === "connected") {
        setApiStatus("ok");
        if (!silent) {
          await showSuccess(
            "Connection Successful",
            "API and Ollama are responding correctly.",
          );
        }
      } else {
        setApiStatus("error");
        if (!silent) {
          await showError(
            "Connection Failed",
            lmStudioStatus === "disconnected"
              ? lmStudioMessage
              : "API responded but Ollama is not connected.",
          );
        }
      }
    } catch (err) {
      setApiStatus("error");
      if (!silent) {
        await showError(
          "Connection Failed",
          err instanceof Error
            ? err.message
            : "Unable to reach the API endpoint.",
        );
      }
    }
  }

  async function handleTestConnection() {
    await runConnectionTest(false);
  }

  async function handleExtractTerms() {
    if (!selectedScene) return;

    try {
      setIsExtractingTerms(true);
      const result = await extractSceneTerms(selectedScene.id, {
        model: modelName,
      });

      if (result.terms && result.terms.length > 0) {
        // Filter out terms already in database and deduplicate
        const seenTerms = new Set<string>();
        const filteredTerms: GlossaryCandidate[] = [];
        for (const t of result.terms) {
          if (t.existingId !== null || t.matchType !== "new") {
            continue;
          }
          const norm = t.term.trim().toLowerCase().normalize("NFKC");
          if (seenTerms.has(norm)) {
            continue;
          }
          seenTerms.add(norm);
          filteredTerms.push(t);
        }

        if (filteredTerms.length > 0) {
          setExtractedTerms(filteredTerms);
          setIsGlossaryDialogOpen(true);
        } else {
          await showInfo(
            "No New Terms",
            "All identified terms already exist in the library.",
          );
        }
      } else {
        await showInfo(
          "No Terms Found",
          "AI did not identify any new key terminology in this scene.",
        );
      }
    } catch (error) {
      await showError(
        "Extraction Failed",
        error instanceof Error ? error.message : "Unable to extract terms.",
      );
    } finally {
      setIsExtractingTerms(false);
    }
  }

  async function handleAnalyzeScene() {
    if (!selectedScene) return;

    try {
      setIsAnalyzingScene(true);
      await analyzeScene(selectedScene.id, { model: modelName });
      await loadTranslationChapter();
      await showSuccess(
        "Analysis Complete",
        "Scene tone and narrative context updated.",
      );
    } catch (error) {
      await showError(
        "Analysis Failed",
        error instanceof Error ? error.message : "Unable to analyze scene.",
      );
    } finally {
      setIsAnalyzingScene(false);
    }
  }

  const runE2ESimulation = async () => {
    if (!chapter) return;
    setIsSimulating(true);
    setSimStep(1);
    setSimLogs([
      "[Simulation] Initializing E2E Autoplay...",
      "[Simulation] Bootstrapping workspace and establishing connections...",
      `[Simulation] Model target: ${modelName}`
    ]);
    
    try {
      // Step 1: Segmentation
      setSimLogs(prev => [...prev, "[Pass 1] Starting Scene Segmentation...", "[Pass 1] Invoking Ollama with chapter paragraphs..."]);
      const segResult = await runSceneSegmentation(chapter.id, { model: modelName });
      await loadTranslationChapter();
      setSimLogs(prev => [
        ...prev,
        `[Pass 1] Success! Story divided into ${segResult.scenesCreated} logical scenes.`,
        "[Pass 1] Scene boundaries successfully persisted in PostgreSQL."
      ]);
      setSimStep(2);
      await new Promise(r => setTimeout(r, 2000));

      // Step 2: Tone Analysis
      setSimLogs(prev => [...prev, "[Pass 2] Starting Narrative & Tone Analysis...", "[Pass 2] Extracting mood, emotional weight, and pacing profiles..."]);
      const scenesData = await getScenes(chapterId);
      for (const scene of scenesData) {
        setSimLogs(prev => [...prev, `[Pass 2] Analyzing Scene ${scene.sequence}...`]);
        await analyzeScene(scene.id, { model: modelName });
      }
      await loadTranslationChapter();
      setSimLogs(prev => [...prev, "[Pass 2] Success! All scenes analyzed. Tone metadata persisted in database."]);
      setSimStep(3);
      await new Promise(r => setTimeout(r, 2000));

      // Step 3: Term Extraction
      setSimLogs(prev => [...prev, "[Pass 3] Starting Term & Name Extraction...", "[Pass 3] Identifying key characters, locations, items, and concepts..."]);
      const allTerms: GlossaryCandidate[] = [];
      for (const scene of scenesData) {
        setSimLogs(prev => [...prev, `[Pass 3] Extracting terms from Scene ${scene.sequence}...`]);
        const result = await extractSceneTerms(scene.id, { model: modelName });
        if (result.terms) {
          allTerms.push(...result.terms);
        }
      }
      
      // Filter & Deduplicate
      const seenTerms = new Set<string>();
      const filteredTerms: GlossaryCandidate[] = [];
      for (const t of allTerms) {
        if (t.existingId !== null || (t as any).matchType !== "new") continue;
        const norm = t.term.trim().toLowerCase().normalize("NFKC");
        if (seenTerms.has(norm)) continue;
        seenTerms.add(norm);
        filteredTerms.push(t);
      }

      setSimLogs(prev => [
        ...prev,
        `[Pass 3] Extracted ${allTerms.length} raw candidates.`,
        `[Pass 3] Filtered down to ${filteredTerms.length} unique NEW terms (excluding existing terms).`,
        `[Pass 3] Simulating Glossary Candidate Checklist Dialog...`
      ]);

      if (filteredTerms.length > 0) {
        setExtractedTerms(filteredTerms);
        setIsGlossaryDialogOpen(true);
        setSimLogs(prev => [...prev, "[Pass 3] Demo: Autocomplete user checklist. Approving candidates to Series Glossary..."]);
        await new Promise(r => setTimeout(r, 3000));
        
        // Auto-approve terms
        const selectedTerms = filteredTerms.map((t) => ({
          term: t.term,
          type: t.type,
          proposedTranslation: t.proposedTranslation || t.term,
          definition: (t as any).definition || t.term,
          confidence: t.confidence,
        }));
        await bulkApproveTermsToScene(seriesId, chapter?.Series?.language || "zh", selectedTerms);
        setIsGlossaryDialogOpen(false);
        setSimLogs(prev => [...prev, `[Pass 3] Success! Approved ${selectedTerms.length} terms saved in the library database.`]);
      } else {
        setSimLogs(prev => [...prev, "[Pass 3] No new terms found. Continuing..."]);
      }
      setSimStep(4);
      await new Promise(r => setTimeout(r, 2000));

      // Step 4: Smart Glossary Injection & Translation
      setSimLogs(prev => [
        ...prev,
        "[Pass 4] Starting Context-Aware Translation...",
        "[Pass 4] Activating Smart Glossary Injection system...",
        "[Pass 4] Injecting scene-specific names/places in prompt context..."
      ]);
      const updatedScenes = await getScenes(chapterId);
      for (const scene of updatedScenes) {
        setSimLogs(prev => [...prev, `[Pass 4] Translating Scene ${scene.sequence} with Smart Injection...`]);
        await translateScene(scene.id, { model: modelName });
      }
      await loadTranslationChapter();
      setSimLogs(prev => [...prev, "[Pass 4] Success! All scenes translated with smart vocabulary injections."]);
      setSimStep(5);
      await new Promise(r => setTimeout(r, 2000));

      // Step 5: Constrained Polishing Side-by-Side Review
      setSimLogs(prev => [
        ...prev,
        "[Pass 5] Starting Constrained Phrasing Polishing...",
        "[Pass 5] Generating style, clarity, and grammatical alternative edits..."
      ]);
      const translatedScenes = await getScenes(chapterId);
      for (const scene of translatedScenes) {
        setSimLogs(prev => [...prev, `[Pass 5] Polishing Scene ${scene.sequence}...`]);
        await polishScene(scene.id, { model: modelName });
      }
      await loadTranslationChapter();
      setSimLogs(prev => [
        ...prev,
        "[Pass 5] Polish pass complete. Simulating Side-by-Side Polish Review panel...",
        "[Pass 5] Auto-selecting edits and committing approvals..."
      ]);
      
      const polishedScenes = await getScenes(chapterId);
      if (polishedScenes.length > 0) {
        setSelectedSceneId(polishedScenes[0].id);
        setPolishPanelVisible(true);
        await new Promise(r => setTimeout(r, 3000));

        // Apply edits for all scenes
        for (const scene of polishedScenes) {
          const edits = scene.polishEdits || [];
          let computedText = scene.translatedText || "";
          for (const edit of edits) {
            computedText = computedText.replace(edit.original, edit.replacement);
          }
          await fetch(`${API_BASE_URL}/scenes/${scene.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              translatedText: scene.translatedText,
              finalText: computedText,
              polishEdits: edits.map(e => ({ ...e, applied: true })),
              status: "complete",
            }),
          });
        }
        await loadTranslationChapter();
        setSimLogs(prev => [...prev, "[Pass 5] Success! All polish edits approved and committed. Scenes marked complete (emerald dot status)."]);
      }
      setSimStep(6);
      await new Promise(r => setTimeout(r, 2000));

      // Step 6: DOCX Export
      setSimLogs(prev => [...prev, "[Export] Compiling all approved scene translations into formatted Microsoft Word document...", "[Export] Compiling paragraph runs and generating download blob..."]);
      await handleExportDocx();
      setSimLogs(prev => [...prev, "[Export] Success! Formatted DOCX file downloaded to system. E2E pipeline completed successfully! 🎉"]);
      setSimStep(7);
    } catch (err) {
      console.error(err);
      setSimLogs(prev => [...prev, `[Error] Simulation failed: ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  async function handleExportDocx() {
    if (!chapter) return;
    if (scenes.length === 0) {
      await showInfo("No content", "There are no scenes to export.");
      return;
    }
    
    try {
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: chapter.title || `Chapter ${chapter.number}`,
                heading: HeadingLevel.HEADING_1,
              }),
              ...scenes.flatMap((s) => {
                const text = s.finalText || s.translatedText || "";
                return text.split('\n').filter(p => p.trim()).map(p => 
                  new Paragraph({
                    children: [new TextRun(p)],
                    spacing: { after: 200 }
                  })
                );
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Chapter_${chapter.number}_Translation.docx`);
      await showSuccess("Export Successful", "DOCX file has been saved.");
    } catch (error) {
      await showError("Export Failed", error instanceof Error ? error.message : "Unable to export DOCX");
    }
  }


  if (isLoadingChapter) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-dvh text-[#807068] font-serif">
        Loading translation workspace...
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-dvh text-[#807068] font-serif px-8 text-center">
        <p className="mb-4">No translation chapter is available.</p>
        <Link
          to="/library"
          className="text-[10px] tracking-[0.2em] font-sans uppercase text-[#8b2626]"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-dvh pt-20 px-8 pb-0 overflow-hidden bg-[#F8F5F2]">
      {/* Header Bar */}
      <div className="flex flex-col border-b border-[#d8cdbd] pb-3 mb-4 shrink-0">
        <div className="flex items-center text-[10px] tracking-[0.2em] font-sans uppercase mb-4 text-[#807068]">
          <Link
            to={`/series/${seriesId}`}
            className="hover:text-[#4A3D39] transition-colors"
          >
            &larr; {(chapter as any).Series?.title || "Series"}
          </Link>
          <span className="mx-3 text-[#d8cdbd]">&rsaquo;</span>
          <span className="text-[#4A3D39]">CHAPTER {chapter.number}</span>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-bold font-sans uppercase text-[#4A3D39] tracking-widest">
              {chapter.title || `Chapter ${chapter.number}`}
            </div>
            <div className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
              STATUS: {progress.segmented ? "SEGMENTED" : "PENDING"} &bull;{" "}
              {progress.translated}/{progress.total} TRANSLATED &bull;{" "}
              {progress.polished}/{progress.total} POLISHED
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-[#f2eadc]/40 p-1 rounded-sm border border-[#d8cdbd]/50 mr-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRunChapterPass(1)}
                disabled={isRunningPass || !isLmStudioOnline}
                className="h-7 text-[9px] tracking-widest px-3 hover:bg-white/60 font-sans uppercase text-[#807068]"
              >
                1. SEGMENT
              </Button>
              <div className="w-[1px] h-4 bg-[#d8cdbd] self-center mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRunChapterPass(2)}
                disabled={
                  isRunningPass ||
                  !isLmStudioOnline ||
                  progress.total === 0
                }
                className="h-7 text-[9px] tracking-widest px-3 hover:bg-white/60 font-sans uppercase text-[#807068]"
              >
                {isRunningPass && isAnalyzingScene ? "ANALYZING..." : "2. ANALYZE ALL"}
              </Button>
              <div className="w-[1px] h-4 bg-[#d8cdbd] self-center mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRunChapterPass(3)}
                disabled={
                  isRunningPass ||
                  !isLmStudioOnline ||
                  progress.total === 0
                }
                className="h-7 text-[9px] tracking-widest px-3 hover:bg-white/60 font-sans uppercase text-[#807068]"
              >
                {isRunningPass && isExtractingTerms ? "EXTRACTING..." : "3. EXTRACT ALL"}
              </Button>
              <div className="w-[1px] h-4 bg-[#d8cdbd] self-center mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRunChapterPass(4)}
                disabled={
                  isRunningPass || !isLmStudioOnline || progress.total === 0
                }
                className="h-7 text-[9px] tracking-widest px-3 hover:bg-white/60 font-sans uppercase text-[#807068]"
              >
                4. TRANSLATE ALL
              </Button>
              <div className="w-[1px] h-4 bg-[#d8cdbd] self-center mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRunChapterPass(5)}
                disabled={
                  isRunningPass ||
                  !isLmStudioOnline ||
                  progress.translated < progress.total ||
                  progress.total === 0
                }
                className="h-7 text-[9px] tracking-widest px-3 hover:bg-white/60 font-sans uppercase text-[#8B2626]"
              >
                5. POLISH ALL
              </Button>
            </div>

            <div className="w-[1px] h-8 bg-[#d8cdbd] mx-1" />

            <Button
              onClick={() => void runE2ESimulation()}
              disabled={isSimulating || !isLmStudioOnline}
              className="bg-[#8b2626] hover:bg-[#701c1c] text-white h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border-none mr-2 cursor-pointer transition-all"
            >
              {isSimulating ? "SIMULATION RUNNING" : "AUTOPLAY E2E SIMULATION"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadTranslationChapter()}
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              REFRESH
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExportDocx()}
              className="flex items-center justify-center border border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] hover:text-[#4A3D39] bg-transparent font-sans uppercase transition-colors"
            >
              EXPORT DOCX
            </Button>
            <Link
              to={`/contextLibrary?seriesId=${seriesId}`}
              className="flex items-center justify-center border border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] hover:text-[#4A3D39] bg-transparent font-sans uppercase no-underline transition-colors"
            >
              GLOSSARY
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0 mb-6 overflow-hidden">
        {/* MAIN WORKSPACE */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Column 1: Source & Analysis */}
          <div className="flex-[0.4] flex flex-col gap-4 min-h-0 h-full">
            {/* Source Card */}
            <div className="flex-1 basis-0 flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0">
              <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Scene Source
                </span>
                {selectedScene && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEditSceneStart}
                      className="h-5 text-[8px] text-blue-600 p-0 font-sans uppercase font-bold"
                    >
                      EDIT
                    </Button>
                    <div className="w-[1px] h-3 bg-[#d8cdbd] self-center mx-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteScene()}
                      className="h-5 text-[8px] text-red-600 p-0 font-sans uppercase font-bold"
                    >
                      DELETE
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-5 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed font-serif text-[#4A3D39] bg-white/40">
                {selectedScene?.rawText || "Select a scene to begin."}
              </div>
            </div>

            {/* Analysis Card */}
            <div className="flex-1 basis-0 flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0 relative">
              <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Scene Context
                </span>
              </div>
              <div className="flex-1 p-5 overflow-y-auto bg-white/20 custom-scrollbar">
                {selectedScene ? (
                  <div className="space-y-5">
                    {/* Summary Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {selectedScene.analysis?.analyzedAt && (
                          <Badge
                            variant="ghost"
                            className="h-4 text-[7px] text-[#A0908B] p-0 font-normal italic ml-auto"
                          >
                            Updated{" "}
                            {new Date(
                              selectedScene.analysis.analyzedAt,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#4A3D39] font-serif italic bg-[#f2eadc]/20 p-3 rounded-sm border-l-2 border-[#8B2626]/30">
                        {selectedScene.analysis?.summary ||
                          "No summary available."}
                      </p>
                    </div>

                    {/* Emotional Journey Section */}
                    {selectedScene.analysis?.emotionalExpression && (
                      <div>
                        <h4 className="text-[9px] font-bold uppercase text-[#8B2626] mb-2 tracking-widest border-b border-[#d8cdbd]/30 pb-1">
                          Emotional Journey
                        </h4>
                        <div className="bg-white/40 p-3 rounded-sm border border-[#d8cdbd]/20 space-y-2">
                          <div>
                            <p className="text-[9px] text-[#4A3D39] font-serif italic">
                              {
                                selectedScene.analysis.emotionalExpression
                                  .primary
                              }
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] text-[#A0908B] font-sans font-bold uppercase">
                              Intensity
                            </span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#8B2626]"
                                style={{
                                  width: `${
                                    (selectedScene.analysis.emotionalExpression
                                      ?.intensity || 0.5) * 100
                                  }%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] text-[#4A3D39] font-mono font-bold">
                              {selectedScene.analysis.emotionalExpression.intensity?.toFixed(
                                1,
                              )}
                            </span>
                          </div>
                          {selectedScene.analysis.emotionalExpression
                            .directness && (
                            <div className="text-[8px] text-[#807068] uppercase tracking-wider">
                              Directness:{" "}
                              <span className="font-bold">
                                {selectedScene.analysis.emotionalExpression.directness.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Cultural & Social Context */}
                    <div>
                      <h4 className="text-[9px] font-bold uppercase text-[#8B2626] mb-2 tracking-widest border-b border-[#d8cdbd]/30 pb-1">
                        Cultural Context
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedScene.analysis?.kuaiMan?.dominantPattern && (
                          <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[8px] h-5 font-medium px-2">
                            KUAI-MAN:{" "}
                            {selectedScene.analysis.kuaiMan.dominantPattern.toUpperCase()}
                          </Badge>
                        )}
                        {selectedScene.analysis?.faceSystem
                          ?.faceThreatPresent && (
                          <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[8px] h-5 font-medium px-2">
                            FACE THREAT
                          </Badge>
                        )}
                        {selectedScene.analysis?.powerDynamic?.type && (
                          <Badge className="bg-slate-50 text-slate-700 border-slate-200 text-[8px] h-5 font-medium px-2 uppercase">
                            {selectedScene.analysis.powerDynamic.type.replace(
                              "_",
                              " ",
                            )}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Linguistic Profile Section */}
                    {selectedScene.analysis?.linguistic && (
                      <div>
                        <h4 className="text-[9px] font-bold uppercase text-[#8B2626] mb-2 tracking-widest border-b border-[#d8cdbd]/30 pb-1">
                          Linguistic Weave
                        </h4>
                        <div className="space-y-2">
                          {/* Structure & Pattern */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#fcfaf8] p-2 rounded-sm border border-[#d8cdbd]/40">
                              <h5 className="text-[7px] font-bold uppercase text-[#A0908B] mb-1 tracking-tighter">
                                Structure
                              </h5>
                              <p className="text-[8.5px] text-[#4A3D39] font-sans font-bold">
                                {selectedScene.analysis.linguistic
                                  .sentenceStructure || "Standard"}
                              </p>
                            </div>
                            {selectedScene.analysis.linguistic.topicProminence
                              ?.frequency && (
                              <div className="bg-[#fcfaf8] p-2 rounded-sm border border-[#d8cdbd]/40">
                                <h5 className="text-[7px] font-bold uppercase text-[#A0908B] mb-1 tracking-tighter">
                                  Topic Density
                                </h5>
                                <div className="flex items-center gap-1">
                                  <span className="text-[8.5px] text-[#4A3D39] font-mono font-bold">
                                    {Math.round(
                                      selectedScene.analysis.linguistic
                                        .topicProminence.frequency * 100,
                                    )}
                                    %
                                  </span>
                                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-slate-400"
                                      style={{
                                        width: `${selectedScene.analysis.linguistic.topicProminence.frequency * 100}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Stylistic Markers */}
                          {(selectedScene.analysis.linguistic.onomatopoeia
                            ?.density ||
                            selectedScene.analysis.linguistic.honorifics
                              ?.density) && (
                            <div className="bg-[#fcfaf8]/50 p-2 rounded-sm border border-[#d8cdbd]/30">
                              <h5 className="text-[7px] font-bold uppercase text-[#A0908B] mb-1.5 tracking-widest">
                                Stylistic Markers
                              </h5>
                              <div className="flex flex-wrap gap-1">
                                {selectedScene.analysis.linguistic.onomatopoeia
                                  ?.density && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[7px] h-4 px-1.5 bg-white border-[#D8CDBD] text-[#807068]"
                                  >
                                    ONOMATOPOEIA:{" "}
                                    {selectedScene.analysis.linguistic.onomatopoeia.density.toUpperCase()}
                                  </Badge>
                                )}
                                {selectedScene.analysis.linguistic.honorifics
                                  ?.density && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[7px] h-4 px-1.5 bg-white border-[#D8CDBD] text-[#807068]"
                                  >
                                    KEIGO:{" "}
                                    {selectedScene.analysis.linguistic.honorifics.density.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Four-Character Idioms with Meanings */}
                          {(selectedScene.analysis.linguistic
                            .fourCharacterIdioms?.length ?? 0) > 0 && (
                            <div className="bg-[#fcfaf8]/50 p-2 rounded-sm border border-[#d8cdbd]/30">
                              <h5 className="text-[7px] font-bold uppercase text-[#8B2626] mb-1.5 tracking-widest">
                                Classical Expressions
                              </h5>
                              <div className="space-y-1">
                                {selectedScene.analysis.linguistic.fourCharacterIdioms!.map(
                                  (item: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="text-[8px] bg-white/40 p-1.5 rounded border border-[#d8cdbd]/20"
                                    >
                                      <p className="font-mono text-[#4A3D39] font-bold">
                                        {item.idiom}
                                      </p>
                                      <p className="text-[7.5px] text-[#807068] italic mt-0.5">
                                        {item.meaning}
                                      </p>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          {/* Topic/Focus Examples */}
                          {selectedScene.analysis.linguistic.topicProminence
                            ?.examples &&
                            selectedScene.analysis.linguistic.topicProminence
                              .examples.length > 0 && (
                              <div className="bg-[#fcfaf8]/50 p-2 rounded-sm border border-[#d8cdbd]/30">
                                <h5 className="text-[7px] font-bold uppercase text-[#8B2626] mb-1.5 tracking-widest">
                                  Key Passages
                                </h5>
                                <div className="space-y-1">
                                  {selectedScene.analysis.linguistic.topicProminence.examples.map(
                                    (example: string, idx: number) => (
                                      <p
                                        key={idx}
                                        className="text-[8px] font-serif text-[#4A3D39] italic bg-white/40 p-1.5 rounded border border-[#d8cdbd]/20 line-clamp-2"
                                      >
                                        {example}
                                      </p>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#a0908b] italic text-[11px]">
                    Select a scene for context
                  </div>
                )}
              </div>

              {/* Fixed / Anchored Action Buttons Footer */}
              {selectedScene && (
                <div className="shrink-0 p-4 border-t border-[#d8cdbd]/50 bg-[#f2eadc]/10 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleExtractTerms()}
                      disabled={
                        isExtractingTerms ||
                        isAnalyzingScene ||
                        !selectedScene ||
                        !isLmStudioOnline
                      }
                      className="flex-1 h-8 text-[9px] tracking-widest border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] font-sans uppercase rounded-sm cursor-pointer"
                    >
                      {isExtractingTerms
                        ? "EXTRACTING..."
                        : "EXTRACT TERMS"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleAnalyzeScene()}
                      disabled={
                        isExtractingTerms ||
                        isAnalyzingScene ||
                        !selectedScene ||
                        !isLmStudioOnline
                      }
                      className="flex-1 h-8 text-[9px] tracking-widest border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] font-sans uppercase rounded-sm cursor-pointer"
                    >
                      {isAnalyzingScene ? "ANALYZING..." : "ANALYZE TONE"}
                    </Button>
                  </div>
                  <p className="text-[8px] text-[#a0908b] italic text-center px-1 leading-relaxed">
                    Refine the scene's emotional context and identify key
                    terminology to guide the AI translator.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Translation & Editor */}
          <div className="flex-[0.6] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Translation Editor
                </span>
                {selectedScene?.status === "translated" && (
                  <Badge
                    variant="outline"
                    className="h-4 text-[8px] bg-white/50 border-[#D8CDBD] text-[#8B2626]"
                  >
                    TRANSLATED
                  </Badge>
                )}
                {selectedScene?.status === "polished" && (
                  <Badge
                    variant="outline"
                    className="h-4 text-[8px] bg-[#ebf5ed] border-[#2f7a46] text-[#2f7a46]"
                  >
                    POLISHED
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleTranslateScene()}
                  disabled={
                    isRunningPass || !selectedScene || !isLmStudioOnline
                  }
                  className="h-6 text-[8px] tracking-[0.1em] bg-[#8B2626] hover:bg-[#701c1c] border-none text-white font-sans uppercase rounded-sm px-3"
                >
                  Translate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handlePolishScene()}
                  disabled={
                    isRunningPass ||
                    !selectedScene ||
                    !selectedScene.translatedText ||
                    !isLmStudioOnline
                  }
                  className="h-6 text-[8px] tracking-[0.1em] bg-[#2f7a46] hover:bg-[#1a4d2e] border-none text-white font-sans uppercase rounded-sm px-3"
                >
                  Polish
                </Button>
              </div>
            </div>

            <textarea
              value={editableTranslation}
              onChange={(e) => setEditableTranslation(e.target.value)}
              disabled={isRunningPass}
              className={`flex-1 p-6 resize-none outline-none font-serif text-base leading-relaxed selection:bg-rose-100 placeholder:italic placeholder:text-[#A0908B]/50 transition-all duration-300 ${isRunningPass ? 'bg-[#FAF6F3] text-[#A0908B] cursor-not-allowed shadow-inner' : 'bg-white text-[#4A3D39]'}`}
              placeholder="Translation output..."
            />

             <div className="flex justify-between items-center p-3 border-t border-[#d8cdbd]/50 bg-white/50 shrink-0 px-6">
              <div className="text-[9px] font-sans text-[#a0908b] tracking-widest uppercase">
                Scene {selectedScene?.sequence || "-"} &bull; Status:{" "}
                {selectedScene?.status || "Pending"}
              </div>
              <div className="flex gap-2">
                {(selectedScene?.status === "polished" || selectedScene?.status === "complete") && !polishPanelVisible && (
                  <Button
                    variant="ghost"
                    onClick={() => setPolishPanelVisible(true)}
                    disabled={isRunningPass}
                    className="h-7 text-[9px] tracking-[0.1em] text-amber-600 hover:text-amber-800 font-sans uppercase px-3"
                  >
                    Review Polish
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => void handleCopyTranslation()}
                  disabled={isRunningPass}
                  className="h-7 text-[9px] tracking-[0.1em] text-[#a0908b] hover:text-[#4A3D39] font-sans uppercase"
                >
                  Copy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleSaveTranslation()}
                  disabled={isSaving || !selectedScene || isRunningPass}
                  className="h-7 text-[9px] tracking-[0.1em] border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] font-sans uppercase px-6"
                >
                  {isSaving ? "Saving..." : "Save Edit"}
                </Button>
              </div>
            </div>

            {(selectedScene?.status === "polished" || selectedScene?.status === "complete") &&
              selectedScene.finalText &&
              polishPanelVisible && (
                <PolishSelectionPanel
                  edits={selectedScene.polishEdits || []}
                  translatedText={selectedScene.translatedText || ""}
                  finalText={selectedScene.finalText}
                  onApplyEdits={(appliedEdits) => void handleApplyPolishEdits(appliedEdits)}
                  onClose={() => setPolishPanelVisible(false)}
                />
              )}
          </div>
        </div>

        {/* Column 3: Scenes Sidebar */}
        <div className="w-[180px] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
            <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
              Scenes
            </span>
            {scenes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDeleteAllScenes()}
                className="h-5 text-[8px] text-red-600 p-0 font-sans uppercase font-bold hover:bg-transparent"
              >
                DELETE ALL
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white/20">
            {scenes.length === 0 ? (
              <div className="text-[10px] text-[#a0908b] italic p-4 text-center">
                No scenes yet. Run segmentation.
              </div>
            ) : (
              scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSceneId(s.id)}
                  className={`w-full text-left p-3 rounded-sm transition-all border ${
                    selectedSceneId === s.id
                      ? "bg-[#f2eadc] border-[#d8cdbd] shadow-sm"
                      : "bg-transparent border-transparent hover:bg-[#f2eadc]/40 text-[#807068]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-[10px] font-bold font-sans ${selectedSceneId === s.id ? "text-[#8B2626]" : "text-[#a0908b]"}`}
                    >
                      SCENE {s.sequence}
                    </span>
                    <div className="flex items-center gap-1">
                      {failedExtractionScenes.has(s.id) && (
                        <div
                          title="Failed term extraction"
                          className="text-[12px]"
                        >
                          ⚠️
                        </div>
                      )}
                      {failedAnalysisScenes.has(s.id) && (
                        <div title="Failed analysis" className="text-[12px]">
                          ⚠️
                        </div>
                      )}
                      {s.status === "complete" ? (
                        <div className="w-1.5 h-1.5 bg-[#2f7a46] rounded-full" title="Approved & Completed" />
                      ) : s.status === "polished" ? (
                        <div className="w-1.5 h-1.5 bg-[#d8c080] rounded-full" title="Polished, Pending Review" />
                      ) : s.status === "translated" ? (
                        <div className="w-1.5 h-1.5 bg-[#8B2626] rounded-full" title="Translated" />
                      ) : s.status === "analyzed" ? (
                        <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full" title="Analyzed" />
                      ) : null}
                    </div>
                  </div>
                  <div className="text-[9px] line-clamp-2 leading-relaxed text-[#4A3D39]/70 font-serif">
                    {s.rawText.substring(0, 60)}...
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer / Model Selector Bar */}
      <div className="shrink-0 flex items-center justify-between border-t border-[#d8cdbd] py-2.5 -mx-8 px-8 bg-[#FBF9F6]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)] ${
                apiStatus === "ok"
                  ? "bg-[#2f7a46] animate-pulse"
                  : apiStatus === "testing"
                    ? "bg-[#d8c080] animate-bounce"
                    : "bg-[#8b2626]"
              }`}
            />
            <span className="text-[10px] font-sans tracking-widest text-[#807068] uppercase">
              {apiStatus === "ok"
                ? "CONNECTED"
                : apiStatus === "testing"
                  ? "TESTING..."
                  : "DISCONNECTED"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-sans text-[#a0908b] uppercase tracking-widest">
              MODEL
            </span>
            <Select value={modelName} onValueChange={setModelName}>
              <SelectTrigger className="h-7 w-[200px] border-[#d8cdbd] bg-transparent text-[10px] font-sans rounded-none focus:ring-0">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingModels ? (
                  <SelectItem value="loading" disabled>
                    Loading models...
                  </SelectItem>
                ) : (
                  aiModels.map((m) => (
                    <SelectItem key={m.id} value={m.modelId}>
                      {m.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isRunningPass && (
            <div className="flex items-center gap-2 text-[10px] font-sans text-[#8B2626] font-bold animate-pulse">
              <div className="w-2 h-2 bg-[#8B2626] rounded-full" />
              AI PROCESSING...
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => void handleTestConnection()}
            className="h-7 text-[9px] tracking-widest text-[#a0908b] hover:text-[#4A3D39] font-sans uppercase"
          >
            RETEST CONNECTION
          </Button>
        </div>
      </div>

      <GlossaryApprovalDialog
        isOpen={isGlossaryDialogOpen}
        onOpenChange={setIsGlossaryDialogOpen}
        terms={extractedTerms}
        language={chapter?.Series?.language}
        onApproved={() => {
          showSuccess(
            "Glossary Updated",
            "Terms have been added to the library.",
          );
        }}
      />

      <Dialog open={isEditingScene} onOpenChange={setIsEditingScene}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-[#FBF9F6] border-[#d8cdbd] rounded-sm p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 border-b border-[#d8cdbd] bg-[#f2eadc]/30">
            <DialogTitle className="text-[14px] font-bold font-sans uppercase tracking-widest text-[#4A3D39]">
              Edit Scene {selectedScene?.sequence}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#a0908b] font-sans uppercase tracking-wider">
              Modify the raw source text for this scene. Changes will affect
              future translation runs.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
            <textarea
              value={editSceneText}
              onChange={(e) => setEditSceneText(e.target.value)}
              className="flex-1 w-full p-6 resize-none outline-none border border-[#d8cdbd]/50 bg-white font-serif text-[15px] leading-relaxed text-[#4A3D39] shadow-inner"
              placeholder="Enter scene source text..."
            />
          </div>
          <DialogFooter className="p-4 bg-[#f2eadc]/20 border-t border-[#d8cdbd] gap-2">
            <Button
              variant="outline"
              onClick={handleEditSceneCancel}
              disabled={isSceneSaving}
              className="h-9 text-[10px] tracking-widest border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] font-sans uppercase px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleEditSceneSave()}
              disabled={isSceneSaving || !editSceneText.trim()}
              className="h-9 text-[10px] tracking-widest bg-[#8B2626] hover:bg-[#701c1c] border-none text-white font-sans uppercase px-8 rounded-sm shadow-sm"
            >
              {isSceneSaving ? "SAVING..." : "SAVE CHANGES"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isSimulating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#FBF9F6] border border-[#d8cdbd] rounded-sm p-6 shadow-2xl flex flex-col gap-6 max-h-[85vh]">
            <div className="flex justify-between items-start border-b border-[#d8cdbd]/60 pb-3">
              <div>
                <h3 className="text-[14px] font-bold font-sans uppercase tracking-[0.2em] text-[#8B2626]">
                  E2E PIPELINE SIMULATION ACTIVE
                </h3>
                <p className="text-[10px] text-[#a0908b] font-sans uppercase mt-0.5 tracking-wider font-bold">
                  Autoplayer: Simulating 5-Pass Pipeline & Smart Glossary Injection
                </p>
              </div>
              {simStep === 7 && (
                <Button
                  onClick={() => setIsSimulating(false)}
                  className="h-7 text-[9px] tracking-widest bg-[#2f7a46] hover:bg-[#1a4d2e] text-white px-4 font-sans uppercase rounded-sm border-none shadow-sm cursor-pointer"
                >
                  CLOSE
                </Button>
              )}
            </div>

            {/* Stepper progress */}
            <div className="grid grid-cols-6 gap-2 shrink-0">
              {[
                { name: "SEGMENT", step: 1 },
                { name: "ANALYZE", step: 2 },
                { name: "TERMS", step: 3 },
                { name: "TRANSLATE", step: 4 },
                { name: "POLISH", step: 5 },
                { name: "EXPORT", step: 6 },
              ].map((s) => {
                const isActive = simStep === s.step;
                const isCompleted = simStep > s.step;
                return (
                  <div key={s.name} className="flex flex-col gap-1.5 items-center">
                    <div
                      className={`w-full h-1 rounded-full transition-all duration-500 ${
                        isActive
                          ? "bg-[#8B2626] shadow-[0_0_8px_rgba(139,38,38,0.4)] animate-pulse"
                          : isCompleted
                            ? "bg-[#2f7a46]"
                            : "bg-[#d8cdbd]/40"
                      }`}
                    />
                    <span
                      className={`text-[8px] font-bold font-sans tracking-wider uppercase text-center ${
                        isActive
                          ? "text-[#8B2626]"
                          : isCompleted
                            ? "text-[#2f7a46]"
                            : "text-[#a0908b]"
                      }`}
                    >
                      {s.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Terminal logger */}
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <span className="text-[9px] font-bold font-sans uppercase tracking-widest text-[#807068]">
                Console Logs
              </span>
              <div
                id="sim-terminal"
                className="flex-1 bg-[#251e1b] text-[#f2eadc] font-mono p-4 rounded-sm border border-[#1e1917] overflow-y-auto text-[11px] leading-relaxed shadow-inner h-60 custom-scrollbar"
              >
                {simLogs.map((log, i) => (
                  <div key={i} className={log.startsWith("[Error") ? "text-red-400 font-bold" : log.startsWith("[Success") || log.startsWith("[Pass") && log.includes("Success") || log.includes("🎉") ? "text-emerald-400 font-bold" : log.startsWith("[Pass") ? "text-amber-300 font-bold" : ""}>
                    {log}
                  </div>
                ))}
                <div className="animate-pulse inline-block w-1.5 h-3 bg-[#f2eadc] ml-1" />
              </div>
            </div>

            <div className="flex justify-between items-center text-[9px] font-sans text-[#a0908b] tracking-wider uppercase border-t border-[#d8cdbd]/40 pt-3 shrink-0 font-bold">
              <span>Step {Math.min(simStep, 6)} of 6</span>
              {simStep < 7 ? (
                <span className="animate-pulse text-[#8B2626] font-bold">
                  AI SIMULATION RUNNING...
                </span>
              ) : (
                <span className="text-[#2f7a46] font-bold">
                  SIMULATION COMPLETE 🎉
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
