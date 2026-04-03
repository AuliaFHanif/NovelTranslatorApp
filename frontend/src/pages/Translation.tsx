import { useEffect, useMemo, useState } from "react";
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
  // ... (omitting lines 17-858 for brevity in this specific tool call, but I will provide the full replacement for the target block)
  runArchitectPhase,
  runChapterAnalysis,
  runActAnalysis,
  runActGroupAnalysis,
  getActTranslationPrompt,
  runChapterPass,
  updateAct,
  deleteAct,
  deleteAllActs,
  exportChapterResult,
  updateSubActTranslation,
  updateActTranslation,
  type Act,
  type AIModel,
  type TranslationChapter,
  type GlossaryCandidate,
} from "../lib/api";
import {
  showError,
  showInfo,
  showSuccess,
  showConfirm,
} from "../lib/notifications";
import { Badge } from "../components/ui/badge";
import { GlossaryApprovalDialog } from "../components/GlossaryApprovalDialog";
import { PromptViewerDialog } from "../components/PromptViewerDialog";
import { ActAnalysisCard } from "../components/ActAnalysisCard";
import { PolishSelector } from "../components/PolishSelector";

export function Translation() {
  const [searchParams] = useSearchParams();
  const [chapter, setChapter] = useState<TranslationChapter | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [selectedActId, setSelectedActId] = useState<number | null>(null);
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
  const [extractedTerms, setExtractedTerms] = useState<GlossaryCandidate[]>([]);
  const [isGlossaryDialogOpen, setIsGlossaryDialogOpen] = useState(false);
  const [isPreviewPromptOpen, setIsPreviewPromptOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<Array<{
    role: string;
    content: string;
  }> | null>(null);
  const [isFetchingPrompt, setIsFetchingPrompt] = useState(false);
  // Act edit mode state
  const [isEditingAct, setIsEditingAct] = useState(false);
  const [editActText, setEditActText] = useState("");
  const [isActMetadataLoading, setIsActMetadataLoading] = useState(false);

  // Polish UI state
  const [actPolishes, setActPolishes] = useState<
    Array<{
      id: number;
      reason: string;
      isSelected: boolean;
    }>
  >([]);
  const [isGeneratingPolish, setIsGeneratingPolish] = useState(false);

  const seriesId = Number(searchParams.get("seriesId") || "0");
  const chapterId = Number(searchParams.get("chapterId") || "0");

  const selectedAct = useMemo(() => {
    // First, check if it's an Act ID
    const act = acts.find((act) => act.id === selectedActId);
    if (act) return act;

    // Then, check if it's a SubAct ID
    for (const act of acts) {
      if (act.SubActs) {
        for (const subAct of act.SubActs) {
          if (subAct.id === selectedActId) {
            // Return subAct as act-like object for compatibility
            // Include parent Act's Analysis so we can display it
            return {
              ...subAct,
              // Add act fields for compatibility
              sequence: `${act.sequence}.${subAct.sequence}`,
              label: `Act ${act.sequence} - SubAct ${subAct.sequence}`,
              // Include parent Act's Analysis for panel display
              Analysis: act.Analysis,
            } as any;
          }
        }
      }
    }
    return null;
  }, [acts, selectedActId]);

  const progress = useMemo(
    () => ({
      total: acts.length,
      pass1Done: acts.length, // If acts exist, Architect is done
      pass2Done: acts.filter((act) =>
        Boolean(act.Analysis?.anatomyProfile?.linguistic),
      ).length,
      pass3Done: acts.filter((act) =>
        Boolean(act.anatomyProfile?.finalTranslation),
      ).length,
      pass4Done: acts.filter((act) =>
        Boolean(act.anatomyProfile?.pass4Polished),
      ).length,
    }),

    [acts],
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
      selectedAct?.translatedText ||
        selectedAct?.anatomyProfile?.finalTranslation ||
        selectedAct?.anatomyProfile?.draftTranslation ||
        "",
    );
  }, [selectedAct]);

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

      setChapter(response.chapter);
      const actsArr = response.acts || [];
      setActs(actsArr);

      setSelectedActId((current) => {
        if (!current) {
          return actsArr[0]?.id ?? null;
        }

        const stillExists = actsArr.some((act) => act.id === current);
        return stillExists ? current : (actsArr[0]?.id ?? null);
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

  async function handleTranslateAct(pass: 3 | 4 = 3) {
    if (!selectedAct) {
      await showInfo("No Act Selected", "Select an act before translating.");
      return;
    }

    if (pass === 4 && !selectedAct.anatomyProfile?.finalTranslation) {
      await showInfo(
        "Translate First",
        "Run Pass 3 (Translate) before polishing.",
      );
      return;
    }

    if (!isLmStudioOnline) {
      await showError(
        "LM Studio Offline",
        "Cannot translate while LM Studio is offline.",
      );
      return;
    }

    try {
      setIsRunningPass(true);
      setEditableTranslation(""); // Clear before streaming

      // If selected item is a SubAct, use that directly; otherwise use Act's SubActs
      let url: string;
      const isSubAct = selectedAct.actId !== undefined;

      if (isSubAct) {
        // Translate only this specific SubAct
        url = `${API_BASE_URL}/translation/subacts/${selectedAct.id}/stream?model=${encodeURIComponent(modelName)}&pass=${pass}`;
      } else {
        // Translate all SubActs of this Act
        url = `${API_BASE_URL}/translation/acts/${selectedAct.id}/stream?model=${encodeURIComponent(modelName)}&pass=${pass}`;
      }

      const response = await fetch(url, { method: "POST" });

      if (!response.ok) {
        throw new Error(`Failed to start stream: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamCompleted = false;
      let hadError = false;

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Stream ended - check if we got [DONE] signal
              if (!streamCompleted) {
                console.warn(
                  "Stream ended without [DONE] signal - connection may have been lost",
                );
              }
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();

                // Check for completion signal
                if (dataStr === "[DONE]") {
                  streamCompleted = true;
                  continue;
                }

                try {
                  const data = JSON.parse(dataStr);

                  // Check for error messages in the content
                  if (data.content && data.content.startsWith("ERROR:")) {
                    hadError = true;
                    const errorMsg = data.content.substring(6).trim();
                    console.error("Stream error:", errorMsg);
                    throw new Error(`LM Studio error: ${errorMsg}`);
                  }

                  if (data.content) {
                    setEditableTranslation((prev) => prev + data.content);
                  }
                } catch (e) {
                  // If it's our thrown error, re-throw it
                  if (
                    e instanceof Error &&
                    e.message.startsWith("LM Studio error:")
                  ) {
                    throw e;
                  }
                  // Otherwise just log parse errors
                  console.debug("Parse error on chunk:", dataStr, e);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      // Throw error if stream didn't complete properly
      if (!streamCompleted && !hadError) {
        throw new Error(
          "Stream interrupted. The LM Studio server may have stopped or connection was lost.",
        );
      }

      await loadTranslationChapter();
      await showSuccess(
        pass === 4 ? "Polish Completed" : "Translation Completed",
        `Act ${selectedAct.sequence} has been ${pass === 4 ? "polished" : "translated"}.`,
      );
    } catch (error) {
      await showError(
        "Process Failed",
        error instanceof Error ? error.message : "Unable to process act.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  async function handleShowPrompt() {
    if (!selectedAct) {
      await showInfo("No Act Selected", "Select an act before viewing prompt.");
      return;
    }

    try {
      setIsFetchingPrompt(true);

      // Check if selected item is a SubAct (has actId property from parent Act)
      const isSubAct = selectedAct.actId !== undefined;
      let actIdToUse = selectedAct.id;

      if (isSubAct) {
        // If it's a SubAct, find its parent Act and use that ID
        const parentAct = acts.find((act) =>
          act.SubActs?.some((subAct) => subAct.id === selectedAct.id),
        );
        if (parentAct) {
          actIdToUse = parentAct.id;
        }
      }

      const data = await getActTranslationPrompt(actIdToUse, modelName);
      setCurrentPrompt(data.messages);
      setIsPreviewPromptOpen(true);
    } catch (error) {
      await showError(
        "Failed to Load Prompt",
        error instanceof Error
          ? error.message
          : "Unable to retrieve prompt context.",
      );
    } finally {
      setIsFetchingPrompt(false);
    }
  }

  /**
   * Detect if an act is part of a group (e.g., 1A, 1B are grouped)
   * Returns array of all act IDs in the same group
   */
  function detectActGroup(actId: number): number[] {
    const targetAct = acts.find((a) => a.id === actId);
    if (!targetAct) return [actId];

    const label = String(targetAct.label || "");
    const baseLabel = label.replace(/[A-Z]$/, ""); // Remove suffix if present

    if (!baseLabel || baseLabel === label) {
      // No grouping detected
      return [actId];
    }

    // Find all acts with same base label
    const groupActs = acts.filter((a) => {
      const aLabel = String(a.label || "");
      const aBaseLabel = aLabel.replace(/[A-Z]$/, "");
      return aBaseLabel === baseLabel;
    });

    return groupActs.sort((a, b) => a.sequence - b.sequence).map((a) => a.id);
  }

  async function handleAnalyzeAct(task: "terms" | "narrative") {
    if (!selectedAct) {
      await showInfo("No Act Selected", "Select an act before analyzing.");
      return;
    }

    if (!isLmStudioOnline) {
      await showError(
        "LM Studio Offline",
        "Cannot analyze while LM Studio is offline.",
      );
      return;
    }

    try {
      setIsRunningPass(true);

      // Detect act group and analyze all together if part of a group
      const groupActIds = detectActGroup(selectedAct.id);
      const isGrouped = groupActIds.length > 1;
      const groupActLabels = acts
        .filter((a) => groupActIds.includes(a.id))
        .map((a) => a.label);

      if (isGrouped) {
        await showInfo(
          "Grouped Analysis",
          `Analyzing acts: ${groupActLabels.join(", ")} together...`,
        );
      }

      const result = isGrouped
        ? await runActGroupAnalysis(chapter!.id, groupActIds, {
            model: modelName,
            task,
          })
        : await runActAnalysis(selectedAct.id, {
            model: modelName,
            task,
          });

      await loadTranslationChapter();

      if (result.failed && result.failed.length > 0) {
        await showError(
          "Analysis Failed",
          `${result.failed[0]?.label || "Unknown"}: ${result.failed[0]?.error || "Unknown error"}`,
        );
      }

      if (isGrouped && groupActLabels.length > 0) {
        await showSuccess(
          "Group Analysis Complete",
          `Acts ${groupActLabels.join(", ")} analyzed with shared results.`,
        );
      }

      if (result.terms && result.terms.length > 0) {
        setExtractedTerms(result.terms);
        setIsGlossaryDialogOpen(true);
      } else if (task === "terms") {
        await showSuccess(
          "Term Extraction Complete",
          "No new terms identified.",
        );
      } else if (task === "narrative") {
        await showSuccess(
          "Narrative Analysis Complete",
          "Analysis profile updated.",
        );
      }
    } catch (error) {
      await showError(
        "Analysis Failed",
        error instanceof Error ? error.message : "Unable to analyze act.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  function handleEditActStart() {
    if (!selectedAct) return;
    setEditActText(selectedAct.rawText);
    setIsEditingAct(true);
  }

  async function handleEditActSave() {
    if (!selectedAct) return;

    const wordCount = editActText.trim().split(/\s+/).length;
    const MAX_WORDS = 2500;

    try {
      setIsActMetadataLoading(true);
      const result = await updateAct(selectedAct.id, editActText);

      if (result.wasSplit) {
        await showSuccess(
          "Act Split",
          `Act was split into ${result.updatedActs?.length || 0} acts due to exceeding ${MAX_WORDS} word limit.`,
        );
      } else {
        await showSuccess(
          "Act Updated",
          `Act updated successfully. Word count: ${wordCount}`,
        );
      }

      await loadTranslationChapter();
      setIsEditingAct(false);
      setEditActText("");
    } catch (error) {
      await showError(
        "Update Failed",
        error instanceof Error ? error.message : "Unable to update act.",
      );
    } finally {
      setIsActMetadataLoading(false);
    }
  }

  function handleEditActCancel() {
    setIsEditingAct(false);
    setEditActText("");
  }

  async function handleDeleteAct() {
    if (!selectedAct) return;

    const confirmed = await showConfirm(
      "Delete Act?",
      `Are you sure you want to delete Act ${selectedAct.label}? This will delete any associated translations, polish, and analysis. Terms in the library will be preserved.`,
    );

    if (!confirmed) return;

    try {
      setIsActMetadataLoading(true);
      await deleteAct(selectedAct.id);

      await showSuccess(
        "Act Deleted",
        `Act ${selectedAct.label} has been deleted.`,
      );

      await loadTranslationChapter();
      setSelectedActId(null);
    } catch (error) {
      await showError(
        "Deletion Failed",
        error instanceof Error ? error.message : "Unable to delete act.",
      );
    } finally {
      setIsActMetadataLoading(false);
    }
  }

  async function handleRunChapterPass(
    pass: 1 | 2 | 3 | 4,
    task: "all" | "terms" | "narrative" = "all",
  ) {
    if (!chapter) {
      return;
    }

    if (!isLmStudioOnline) {
      await showError(
        "LM Studio Offline",
        "Cannot run passes while LM Studio is offline.",
      );
      return;
    }

    try {
      setIsRunningPass(true);

      // Pass 1: Architect (segment chapter into acts)
      if (pass === 1) {
        if (progress.total > 0) {
          const confirmed = await showConfirm(
            "Re-segment Chapter?",
            `Acts already exist for this chapter. Are you sure you want to delete all ${progress.total} acts and re-segment? Current translations and analysis WILL BE LOST.`,
          );
          if (!confirmed) return;

          await deleteAllActs(chapter.id);
        }
        const result = await runArchitectPhase(chapter.id);
        await loadTranslationChapter();
        await showSuccess(
          "Architect Completed",
          `Chapter segmented into ${result.actsCreated} act(s) using ${result.segmentationSource}.`,
        );
        return;
      }

      // Pass 2: Lexicographer (analysis + term extraction)
      if (pass === 2) {
        if (progress.total === 0) {
          await showError(
            "No Acts",
            "Run Pass 1 first to segment the chapter into acts.",
          );
          return;
        }
        const result = await runChapterAnalysis(chapter.id, {
          model: modelName,
          task,
        });
        await loadTranslationChapter();

        if (result.failed && result.failed.length > 0) {
          await showError(
            "Analysis Incomplete",
            `${result.processed} acts analyzed, but ${result.failed.length} act(s) failed (e.g., ${result.failed[0]?.label || "unknown"}). Check LM Studio for token limits or JSON errors.`,
          );
        }

        if (result.terms && result.terms.length > 0) {
          setExtractedTerms(result.terms);
          setIsGlossaryDialogOpen(true);
        } else if (result.failed?.length === 0) {
          await showSuccess(
            "Lexicographer Completed",
            `Analyzed all ${result.processed || 0} act(s). No new terms identified.`,
          );
        }

        return;
      }

      // Pass 4: Polish
      if (pass === 4) {
        if (progress.total === 0) {
          await showError(
            "No Acts",
            "Run Pass 1 first to segment the chapter into acts.",
          );
          return;
        }
        if (progress.pass3Done < progress.total) {
          await showInfo(
            "Translate First",
            "Ensure all acts are translated (Pass 3) before polishing.",
          );
          return;
        }

        const result = await runChapterPass(chapter.id, 4, {
          model: modelName,
        });
        await loadTranslationChapter();

        if (result.failed > 0) {
          await showError(
            "Polish Completed With Errors",
            `${result.completed} acts succeeded, ${result.failed} failed.`,
          );
          return;
        }

        await showSuccess(
          "Polish Completed",
          `All ${result.completed} act(s) polished.`,
        );
        return;
      }

      // Pass 3: Translation
      if (progress.total === 0) {
        await showError(
          "No Acts",
          "Run Pass 1 first to segment the chapter into acts.",
        );
        return;
      }

      const result = await runChapterPass(chapter.id, 3, {
        model: modelName,
      });
      await loadTranslationChapter();

      if (result.failed > 0) {
        await showError(
          "Translation Completed With Errors",
          `${result.completed} acts succeeded, ${result.failed} failed.`,
        );
        return;
      }

      await showSuccess(
        "Translation Completed",
        `All ${result.completed} act(s) translated.`,
      );
    } catch (error) {
      await showError(
        `Pass ${pass} Failed`,
        error instanceof Error ? error.message : "Unable to run pass.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  async function handleSaveTranslation() {
    if (!selectedAct) {
      return;
    }

    if (!editableTranslation.trim()) {
      await showInfo(
        "Nothing to Save",
        "The translation field is empty. Please add translation text before saving.",
      );
      return;
    }

    try {
      setIsSaving(true);

      // Check if it's a SubAct or Act
      const isSubAct = "actId" in selectedAct;

      if (isSubAct) {
        // Save SubAct translation
        await updateSubActTranslation(selectedAct.id, editableTranslation);
      } else {
        // Save Act translation
        await updateActTranslation(selectedAct.id, editableTranslation);
      }

      // Reload chapter to sync the state
      await loadTranslationChapter();
      await showSuccess(
        "Saved",
        `Translation was saved for ${isSubAct ? "the SubAct" : "the Act"}.`,
      );
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

  function formatCharCount(value?: string | null): string {
    return `${(value || "").length.toLocaleString()} chars`;
  }

  async function runConnectionTest(silent = false) {
    try {
      setApiStatus("testing");
      const health = await getHealthStatus();
      const lmStudioStatus = health.services?.lmStudio?.status;
      const lmStudioMessage =
        health.services?.lmStudio?.message ||
        "LM Studio service is not available.";

      if (health.status === "ok" && lmStudioStatus === "connected") {
        setApiStatus("ok");
        if (!silent) {
          await showSuccess(
            "Connection Successful",
            "API and LM Studio are responding correctly.",
          );
        }
      } else {
        setApiStatus("error");
        if (!silent) {
          await showError(
            "Connection Failed",
            lmStudioStatus === "disconnected"
              ? lmStudioMessage
              : "API responded but LM Studio is not connected.",
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

  async function handleDeleteAllActs() {
    if (!chapter) return;
    if (acts.length === 0) {
      await showInfo("No Acts", "There are no acts to delete.");
      return;
    }
    const confirmed = await showConfirm(
      "Delete All Acts?",
      `Are you sure you want to delete all ${acts.length} act(s) for this chapter? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      const result = await deleteAllActs(chapter.id);
      await loadTranslationChapter();
      await showSuccess(
        "Acts Deleted",
        `Deleted ${result.deletedCount} act(s). The chapter has been reset.`,
      );
    } catch (error) {
      await showError(
        "Delete Failed",
        error instanceof Error ? error.message : "Unable to delete acts.",
      );
    }
  }

  async function handleExport() {
    if (!chapter) return;
    try {
      setIsSaving(true);
      const result = await exportChapterResult(chapter.id);
      setChapter((prev) =>
        prev ? { ...prev, finalText: result.finalText } : null,
      );
      await showSuccess(
        "Export Successful",
        "Chapter final text has been generated from acts, with reasoning blocks removed.",
      );
    } catch (error) {
      await showError(
        "Export Failed",
        error instanceof Error
          ? error.message
          : "Unable to export chapter result.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateActPolishes() {
    if (!selectedAct) {
      await showInfo(
        "No Act Selected",
        "Select an act before generating polish.",
      );
      return;
    }

    try {
      setIsGeneratingPolish(true);
      const response = await fetch(
        `${API_BASE_URL}/translation/polish-batch/act/${selectedAct.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count: 3,
            temperature: 0.7,
            model: modelName,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to generate polish: ${response.statusText}`);
      }

      const data = await response.json();

      // Map response to local state
      const polishes =
        data.data?.map((p: any) => ({
          id: p.id,
          reason: p.reason || "Polish variation",
          isSelected: p.isSelected || false,
        })) || [];

      setActPolishes(polishes);
      await showSuccess(
        "Polish Generated",
        `Generated ${polishes.length} polish variations for Act ${selectedAct.label}`,
      );
    } catch (error) {
      await showError(
        "Polish Generation Failed",
        error instanceof Error ? error.message : "Unable to generate polish.",
      );
    } finally {
      setIsGeneratingPolish(false);
    }
  }

  async function handleSelectActPolish(polishId: number) {
    if (!selectedAct) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/translation/polish/${polishId}/select`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to select polish: ${response.statusText}`);
      }

      // Update local state
      setActPolishes((prev) =>
        prev.map((p) => ({
          ...p,
          isSelected: p.id === polishId,
        })),
      );

      await showSuccess(
        "Polish Selected",
        "Polish variation has been applied.",
      );
    } catch (error) {
      await showError(
        "Selection Failed",
        error instanceof Error ? error.message : "Unable to select polish.",
      );
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
            &larr; {chapter.Series.title}
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
              P1 {progress.total > 0 ? "DONE" : "PENDING"} / P2{" "}
              {progress.pass2Done} / P3 {progress.pass3Done} / P4{" "}
              {progress.pass4Done} &bull; {progress.total} ACTS
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRunChapterPass(1)}
              disabled={isRunningPass || !isLmStudioOnline}
              className={`${progress.total === 0 ? "bg-[#d0a080] hover:bg-[#bd8c6c] border-none text-white font-bold" : "bg-transparent text-[#d0a080] border-[#d0a080] hover:bg-[#fcf8f4]"} h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border`}
            >
              {isRunningPass
                ? "SEGMENTING..."
                : progress.total === 0
                  ? "SEGMENT CHAPTER"
                  : "RE-SEGMENT CHAPTER"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRunChapterPass(2, "terms")}
              disabled={
                isRunningPass || !isLmStudioOnline || progress.total === 0
              }
              className="bg-transparent text-[#2f7a46] border-[#2f7a46] hover:bg-[#ebf5ed] h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border"
            >
              EXTRACT TERMS
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRunChapterPass(2, "narrative")}
              disabled={
                isRunningPass || !isLmStudioOnline || progress.total === 0
              }
              className="bg-transparent text-[#8B2626] border-[#8B2626] hover:bg-[#fcf0f0] h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border"
            >
              FULL ANALYSIS
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRunChapterPass(3)}
              disabled={
                isRunningPass || !isLmStudioOnline || progress.total === 0
              }
              className="bg-transparent text-[#5B3E96] border-[#5B3E96] hover:bg-[#f3f0fc] h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border"
            >
              TRANSLATE ALL
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRunChapterPass(4)}
              disabled={
                isRunningPass || !isLmStudioOnline || progress.total === 0
              }
              className="bg-transparent text-[#d48c29] border-[#d48c29] hover:bg-[#fcf5eb] h-8 text-[9px] tracking-widest rounded-sm px-4 font-sans uppercase shadow-sm border"
            >
              POLISH ALL
            </Button>

            <div className="w-[1px] h-8 bg-[#d8cdbd] mx-1" />

            <Button
              variant="outline"
              onClick={() => void loadTranslationChapter()}
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              REFRESH
            </Button>
            <Link
              to={`/contextLibrary?seriesId=${seriesId}`}
              className="flex items-center justify-center border border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] hover:text-[#4A3D39] bg-transparent font-sans uppercase no-underline transition-colors"
            >
              GLOSSARY
            </Link>
            <Button
              variant="outline"
              disabled={isSaving || progress.pass3Done === 0}
              onClick={() => void handleExport()}
              className="border-[#d8cdbd] text-[#2f7a46] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#ebf5ed] hover:text-[#1a4d2e] bg-transparent font-sans uppercase"
            >
              {isSaving ? "EXPORTING..." : "EXPORT"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDeleteAllActs()}
              className="border-[#d8cdbd] text-[#c68080] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#ffeaea] hover:text-[#a04040] bg-transparent font-sans uppercase"
            >
              RESET CHAPTER
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0 mb-6 overflow-hidden">
        {/* SIDEBAR: Unified Act Selector */}
        <div className="w-64 flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0 shrink-0">
          <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
            <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
              ACT LIST
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-1 py-2">
            {acts.map((act) => {
              // Generate list of SubActs or fallback to Act itself
              const actItems =
                act.SubActs && act.SubActs.length > 0
                  ? act.SubActs.map((subAct) => ({
                      id: subAct.id,
                      type: "subact",
                      label: `SubAct ${subAct.sequence}`,
                      charCount: subAct.charCount,
                      tokenCount: subAct.tokenCount,
                      translated: !!subAct.translatedText,
                      actSequence: act.sequence,
                    }))
                  : [
                      {
                        id: act.id,
                        type: "act",
                        label: `Act ${act.sequence} (Full)`,
                        charCount: (act.rawText || "").length,
                        tokenCount: act.tokenCount,
                        translated: !!act.translatedText,
                        actSequence: act.sequence,
                      },
                    ];

              return (
                <div key={`act-${act.id}`}>
                  {/* Act Header with Status Indicators */}
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#666] bg-[#f5ede4] border-b border-[#e0d5c7] flex justify-between items-center">
                    <span>Act {act.sequence}</span>
                    <div className="flex gap-1.5">
                      {/* Extraction Status Indicator */}
                      <div
                        className={`w-2 h-2 rounded-full ${
                          act.anatomyProfile?.termExtractionStatus
                            ? "bg-blue-400"
                            : "bg-gray-300"
                        }`}
                        title={`Extraction: ${act.anatomyProfile?.termExtractionStatus || "pending"}`}
                      />
                      {/* Analysis Status Indicator */}
                      <div
                        className={`w-2 h-2 rounded-full ${
                          act.anatomyProfile?.actAnalysisStatus
                            ? "bg-green-400"
                            : "bg-gray-300"
                        }`}
                        title={`Analysis: ${act.anatomyProfile?.actAnalysisStatus || "pending"}`}
                      />
                    </div>
                  </div>

                  {/* Act Items */}
                  {actItems.map((item) => (
                    <div
                      key={item.id}
                      className={`group flex flex-col px-4 py-3 mx-1 mb-1 rounded-sm cursor-pointer transition-all ${
                        selectedActId === item.id
                          ? "bg-[#f2eadc] text-[#4A3D39] border border-[#d8cdbd] shadow-sm"
                          : "text-[#807068] hover:bg-[#f5efe6] border border-transparent"
                      }`}
                      onClick={() => setSelectedActId(item.id)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span
                          className={`text-[10px] font-sans uppercase tracking-widest ${
                            selectedActId === item.id
                              ? "font-bold text-[#8B2626]"
                              : ""
                          }`}
                        >
                          {item.label}
                        </span>
                        {item.translated && (
                          <div
                            className="w-1.5 h-1.5 rounded-full bg-purple-500"
                            title="Translated"
                          />
                        )}
                      </div>
                      <div className="mt-2 text-[8px] font-sans text-[#a0908b] group-hover:text-[#4A3D39] transition-colors">
                        {item.charCount} chars • {item.tokenCount || 0} tokens
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN WORKSPACE */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Column 1: Source & Analysis */}
          <div className="flex-[0.4] flex flex-col gap-4 min-h-0">
            {/* Source Card */}
            <div className="flex-[0.5] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0">
              <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Act Source
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] tracking-widest font-sans text-[#a0908b]">
                    {formatCharCount(selectedAct?.rawText)}
                  </span>
                  {selectedAct && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleEditActStart}
                        disabled={isActMetadataLoading}
                        className="h-5 text-[8px] text-blue-600 p-0 font-sans uppercase font-bold hover:text-blue-800"
                      >
                        EDIT
                      </Button>
                      <div className="w-[1px] h-3 bg-[#d8cdbd] self-center" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteAct()}
                        disabled={isActMetadataLoading}
                        className="h-5 text-[8px] text-red-600 p-0 font-sans uppercase font-bold hover:text-red-800"
                      >
                        DELETE
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 p-5 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed font-serif text-[#4A3D39] bg-white/40">
                {selectedAct?.rawText || "Select an act to begin."}
              </div>
            </div>

            {/* Analysis Card */}
            <div className="flex-[0.5] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0 relative">
              <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center sticky top-0 z-10">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Analysis Run
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleAnalyzeAct("terms")}
                    disabled={isRunningPass || !selectedAct}
                    className="h-5 text-[8px] text-[#2f7a46] p-0 font-sans uppercase font-bold"
                  >
                    {isRunningPass ? "..." : "EXTRACT ACT TERMS"}
                  </Button>
                  <div className="w-[1px] h-3 bg-[#d8cdbd] self-center" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleAnalyzeAct("narrative")}
                    disabled={isRunningPass || !selectedAct}
                    className="h-5 text-[8px] text-[#8B2626] p-0 font-sans uppercase"
                  >
                    {isRunningPass ? "..." : "NAV ANALYSIS"}
                  </Button>
                </div>
              </div>
              <div className="flex-1 p-5 overflow-y-auto bg-white/20">
                <ActAnalysisCard
                  linguistic={selectedAct?.Analysis?.anatomyProfile?.linguistic}
                  narrative={selectedAct?.Analysis?.anatomyProfile?.narrative}
                />
              </div>
            </div>
          </div>

          {/* Column 2: Translation & Polish */}
          <div className="flex-[0.6] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase font-bold">
                  Translation Editor
                </span>
                <Badge
                  variant="outline"
                  className="h-4 text-[8px] bg-white/50 border-[#D8CDBD] text-[#8B2626]"
                >
                  PASS 3
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-widest font-sans text-[#a0908b] mr-2">
                  {formatCharCount(editableTranslation)}
                </span>
                <Button
                  variant="outline"
                  onClick={() => void handleTranslateAct(3)}
                  disabled={isRunningPass || !selectedAct || !isLmStudioOnline}
                  className="h-6 text-[8px] tracking-[0.1em] bg-[#8B2626] hover:bg-[#701c1c] border-none text-white font-sans uppercase rounded-sm px-3"
                >
                  Translate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleShowPrompt()}
                  disabled={isFetchingPrompt || !selectedAct}
                  className="h-6 text-[8px] tracking-[0.1em] bg-[#f2eadc]/40 border border-[#d8cdbd] hover:bg-[#f2eadc] text-[#807068] font-sans uppercase rounded-sm px-3"
                >
                  Prompt
                </Button>
              </div>
            </div>

            <textarea
              value={editableTranslation}
              onChange={(event) => setEditableTranslation(event.target.value)}
              className="flex-1 p-6 pb-2 resize-none outline-none bg-white font-serif text-[#4A3D39] text-base leading-relaxed selection:bg-rose-100 placeholder:italic placeholder:text-[#A0908B]/50"
            />

            <div className="flex justify-end p-2 gap-2 border-t border-[#d8cdbd]/50 bg-white/50 shrink-0">
              <Button
                variant="ghost"
                onClick={() => void handleCopyTranslation()}
                className="h-7 text-[9px] tracking-[0.1em] text-[#a0908b] hover:text-[#4A3D39] font-sans uppercase"
              >
                Copy Text
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleSaveTranslation()}
                disabled={isSaving || !selectedAct}
                className="h-7 text-[9px] tracking-[0.1em] border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] font-sans uppercase px-6"
              >
                {isSaving ? "Saving..." : "Save Selection"}
              </Button>
            </div>

            {/* Sub-panel: Polish Selector */}
            <div className="flex-0 max-h-[180px] flex flex-col border-t border-[#d8cdbd] bg-[#f9f7f4] min-h-0 p-4 overflow-y-auto">
              {selectedAct ? (
                <PolishSelector
                  actPolishes={actPolishes}
                  onGeneratePolishes={handleGenerateActPolishes}
                  onSelectActPolish={handleSelectActPolish}
                  isGenerating={isGeneratingPolish}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[#a0908b] italic text-[11px] text-center">
                  Select an act to manage polish variations
                </div>
              )}
            </div>
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
        onApproved={() => void loadTranslationChapter()}
      />

      <PromptViewerDialog
        isOpen={isPreviewPromptOpen}
        onOpenChange={setIsPreviewPromptOpen}
        prompt={currentPrompt}
        actLabel={selectedAct?.label}
      />

      <Dialog open={isEditingAct} onOpenChange={setIsEditingAct}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Act {selectedAct?.label}</DialogTitle>
            <DialogDescription>
              Modify the raw text for this act. Word count limit is ~2500 words.
              If exceeded, the act will be automatically split at paragraph
              boundaries.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <textarea
              value={editActText}
              onChange={(e) => setEditActText(e.target.value)}
              className="w-full h-full p-4 resize-none outline-none border border-[#d8cdbd] rounded font-serif text-[14px] leading-relaxed focus:border-blue-500"
              placeholder="Enter or edit the act text..."
            />
            <div className="mt-2 text-[12px] text-gray-600">
              Word count: {editActText.trim().split(/\s+/).length} / ~2500
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleEditActCancel}
              disabled={isActMetadataLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleEditActSave()}
              disabled={isActMetadataLoading || !editActText.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isActMetadataLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
