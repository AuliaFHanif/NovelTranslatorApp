import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  getHealthStatus,
  getTranslationChapter,
  listAIModels,
  LLM_PROXY_ENDPOINT,
  runActPass,
  runChapterPass,
  updateAct,
  type Act,
  type AIModel,
  type TranslationChapter,
} from "../lib/api";
import { showError, showInfo, showSuccess } from "../lib/notifications";

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

  const seriesId = Number(searchParams.get("seriesId") || "0");
  const chapterId = Number(searchParams.get("chapterId") || "0");

  const selectedAct = useMemo(
    () => acts.find((act) => act.id === selectedActId) || null,
    [acts, selectedActId],
  );

  const progress = useMemo(
    () => ({
      total: acts.length,
      pass1Done: acts.filter((act) => Boolean(act.pass1Analysis)).length,
      pass2Done: acts.filter((act) => Boolean(act.pass2Draft)).length,
      pass3Done: acts.filter((act) => Boolean(act.pass3Final)).length,
    }),
    [acts],
  );

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
    setEditableTranslation(
      selectedAct?.pass3Final || selectedAct?.pass2Draft || "",
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
      setChapter(response.chapter);
      setActs(response.acts);
      setSelectedActId((current) => current ?? response.acts[0]?.id ?? null);
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

  async function handleRunActPass(pass: 1 | 2 | 3) {
    if (!selectedAct) {
      await showInfo("No Act Selected", "Select an act before running a pass.");
      return;
    }

    try {
      setIsRunningPass(true);
      await runActPass(selectedAct.id, pass, {
        model: modelName,
      });
      await loadTranslationChapter();
      await showSuccess(
        "Pass Completed",
        `Pass ${pass} finished for the selected act.`,
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

  async function handleRunChapterPass(pass: 1 | 2 | 3) {
    if (!chapter) {
      return;
    }

    try {
      setIsRunningPass(true);
      const result = await runChapterPass(chapter.id, pass, {
        model: modelName,
      });
      await loadTranslationChapter();

      if (result.failed > 0) {
        await showError(
          `Pass ${pass} Completed With Errors`,
          `${result.completed} acts succeeded, ${result.failed} failed.`,
        );
        return;
      }

      await showSuccess(
        "Global Pass Completed",
        `Pass ${pass} completed for ${result.completed} act(s).`,
      );
    } catch (error) {
      await showError(
        `Pass ${pass} Failed`,
        error instanceof Error ? error.message : "Unable to run global pass.",
      );
    } finally {
      setIsRunningPass(false);
    }
  }

  async function handleSaveTranslation() {
    if (!selectedAct) {
      return;
    }

    try {
      setIsSaving(true);
      await updateAct(selectedAct.id, {
        pass3Final: editableTranslation.trim(),
      });
      await loadTranslationChapter();
      await showSuccess("Saved", "Translation was saved for the selected act.");
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

  async function handleTestConnection() {
    try {
      setApiStatus("testing");
      const health = await getHealthStatus();
      if (health.status === "ok") {
        setApiStatus("ok");
        await showSuccess(
          "Connection Successful",
          "API is responding correctly.",
        );
      } else {
        setApiStatus("error");
        await showError(
          "Connection Failed",
          "API responded but with an error status.",
        );
      }
    } catch (err) {
      setApiStatus("error");
      await showError(
        "Connection Failed",
        err instanceof Error
          ? err.message
          : "Unable to reach the API endpoint.",
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
    <div className="flex flex-col w-full h-dvh pt-20 px-8 pb-0 overflow-hidden">
      <div className="flex flex-col border-b border-[#d8cdbd] pb-3 mb-3 shrink-0">
        <div className="flex items-center text-[10px] tracking-[0.2em] font-sans uppercase mb-4 text-[#807068]">
          <Link
            to="/library"
            className="hover:text-[#4A3D39] transition-colors"
          >
            &larr; {chapter.Series.title}
          </Link>
          <span className="mx-3 text-[#d8cdbd]">&rsaquo;</span>
          <span className="text-[#4A3D39]">CHAPTER {chapter.number}</span>
        </div>

        <div className="flex justify-between items-end">
          <div className="text-[10px] tracking-[0.2em] font-sans uppercase text-[#807068]">
            {chapter.title || `Chapter ${chapter.number}`} &bull;{" "}
            {progress.total} ACTS
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void loadTranslationChapter()}
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-widest rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              REFRESH
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 mb-4 overflow-hidden">
        <div className="flex-1 flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
          <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                {chapter.Series.language === "zh"
                  ? "CHINESE SOURCE"
                  : "JAPANESE SOURCE"}
              </span>
              <span className="text-[8px] font-sans text-[#c8a080] uppercase tracking-widest ml-2">
                🔒 LOCKED
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] tracking-widest font-sans text-[#a0908b]">
                {formatCharCount(selectedAct?.rawActText)}
              </span>
              <span className="text-[8px] font-sans text-[#a0908b] uppercase tracking-widest">
                ACT {selectedAct?.order || "-"}
              </span>
            </div>
          </div>
          <div className="flex-1 p-6 overflow-y-auto text-base leading-[2.2] font-serif text-[#4A3D39]">
            {selectedAct?.rawActText ||
              chapter.rawText ||
              "No source text available."}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex-[0.45] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                {progress.total} ACTS
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
                P1 {progress.pass1Done} / P2 {progress.pass2Done} / P3{" "}
                {progress.pass3Done}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-1 py-2">
              {acts.map((act) => (
                <div
                  key={act.id}
                  className={`flex justify-between items-center px-4 py-2.5 mx-1 rounded-sm text-xs font-serif cursor-pointer ${
                    selectedActId === act.id
                      ? "bg-[#f2eadc] text-[#4A3D39] border border-[#d8cdbd]"
                      : "text-[#807068] hover:bg-[#f5efe6] border border-transparent"
                  }`}
                  onClick={() => setSelectedActId(act.id)}
                >
                  <span className="font-bold font-sans text-[10px]">
                    Act {act.order}
                  </span>
                  <span className="text-[9px] font-sans text-[#a0908b]">
                    &mdash; {(act.rawActText || "").length}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-[0.55] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <span className="text-[10px] font-bold font-sans text-[#4A3D39]">
                Act {selectedAct?.order || "-"}
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b]">
                {formatCharCount(selectedAct?.rawActText)}
              </span>
            </div>
            <div className="flex-1 p-5 overflow-y-auto text-[13px] leading-loose font-serif text-[#4A3D39]">
              {selectedAct?.pass1Analysis ||
                "Run Pass 1 to generate analysis notes for this act."}
            </div>
            <div className="flex justify-between p-2 pt-0 gap-2 shrink-0 bg-[#FBF9F6]">
              <Button
                variant="outline"
                onClick={() => void handleRunActPass(1)}
                disabled={isRunningPass || !selectedAct}
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 1
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleRunActPass(2)}
                disabled={isRunningPass || !selectedAct}
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 2
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleRunActPass(3)}
                disabled={isRunningPass || !selectedAct}
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 3
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex-[0.45] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                {progress.total} TRANSLATIONS
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
                P3 READY: {progress.pass3Done}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-1 py-2">
              {acts.map((act) => {
                const output = act.pass3Final || act.pass2Draft || "";
                return (
                  <div
                    key={act.id}
                    className={`flex justify-between items-center px-4 py-2.5 mx-1 rounded-sm text-xs font-serif cursor-pointer ${
                      selectedActId === act.id
                        ? "bg-[#f2eadc] text-[#4A3D39] border border-[#d8cdbd]"
                        : "text-[#807068] hover:bg-[#f5efe6] border border-transparent"
                    }`}
                    onClick={() => setSelectedActId(act.id)}
                  >
                    <span className="font-bold font-sans text-[10px]">
                      Act {act.order}
                    </span>
                    <span className="text-[9px] font-sans text-[#a0908b]">
                      &mdash; {output.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-[0.55] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <span className="text-[10px] font-bold font-sans text-[#4A3D39]">
                Act {selectedAct?.order || "-"} Translation
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b]">
                {formatCharCount(editableTranslation)}
              </span>
            </div>
            <textarea
              value={editableTranslation}
              onChange={(event) => setEditableTranslation(event.target.value)}
              className="flex-1 p-6 resize-none outline-none bg-transparent font-serif text-[#4A3D39] text-[13px] leading-relaxed"
              placeholder="Run Pass 3 on this act to generate translation..."
            />
            <div className="flex justify-between p-2 pt-0 gap-2 shrink-0 bg-[#FBF9F6]">
              <Button
                variant="outline"
                onClick={() => void handleSaveTranslation()}
                disabled={isSaving || !selectedAct}
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-transparent border border-[#e8dfcf] hover:bg-[#f2eadc] text-[#d0c0b8] font-sans uppercase rounded-sm"
              >
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleCopyTranslation()}
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-transparent border border-[#e8dfcf] hover:bg-[#f2eadc] text-[#d0c0b8] font-sans uppercase rounded-sm"
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="shrink-0 flex items-center justify-between border-y border-[#d8cdbd] py-3 -mx-8 px-8 bg-[#FBF9F6]">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                apiStatus === "ok"
                  ? "bg-[#2f7a46]"
                  : apiStatus === "error"
                    ? "bg-[#8b2626]"
                    : apiStatus === "testing"
                      ? "bg-[#c8a080]"
                      : "bg-[#a0908b]"
              }`}
            ></div>
            <span className="text-[9px] tracking-[0.2em] font-sans text-[#807068] uppercase">
              API
            </span>
            <Input
              value={LLM_PROXY_ENDPOINT}
              readOnly
              className="h-8 w-64 border-[#d8cdbd] bg-white text-xs font-mono text-[#5c504b] focus-visible:ring-[#a0908b] rounded-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-[0.2em] font-sans text-[#807068] uppercase">
              MODEL
            </span>
            <Select
              value={modelName || ""}
              onValueChange={setModelName}
              disabled={isLoadingModels || aiModels.length === 0}
            >
              <SelectTrigger className="h-8 w-48 border-[#d8cdbd] bg-white focus:ring-1 focus:ring-[#a0908b] rounded-sm">
                <SelectValue
                  placeholder={
                    isLoadingModels
                      ? "Loading..."
                      : aiModels.length === 0
                        ? "No models"
                        : "Select model"
                  }
                />
              </SelectTrigger>
              {aiModels.length > 0 && (
                <SelectContent className="bg-white border-[#d8cdbd]">
                  {aiModels.map((model) => (
                    <SelectItem key={model.id} value={model.modelId}>
                      <span className="text-xs font-mono">
                        {model.name} • {model.modelId}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              )}
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            className="h-8 text-[9px] tracking-[0.1em] bg-transparent hover:bg-[#f2eadc] border-[#d8cdbd] text-[#807068] font-sans uppercase rounded-sm px-6"
          >
            {apiStatus === "testing" ? "TESTING..." : "TEST"}
          </Button>
        </div>

        <div className="flex items-center gap-6">
          <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
            {progress.total} ACTS &bull; GLOBAL PASSES
          </span>
          <div className="flex gap-3">
            <Button
              onClick={() => void handleRunChapterPass(1)}
              disabled={isRunningPass || progress.total === 0}
              className="h-8 text-[9px] tracking-[0.1em] bg-[#d0a080] hover:bg-[#bd8c6c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2"
            >
              <span className="text-[10px]">
                {progress.pass1Done === progress.total && progress.total > 0
                  ? "✔"
                  : "〇"}
              </span>{" "}
              PASS 1
            </Button>
            <Button
              onClick={() => void handleRunChapterPass(2)}
              disabled={isRunningPass || progress.total === 0}
              className="h-8 text-[9px] tracking-[0.1em] bg-[#d0a080] hover:bg-[#bd8c6c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2"
            >
              <span className="text-[10px]">
                {progress.pass2Done === progress.total && progress.total > 0
                  ? "✔"
                  : "〇"}
              </span>{" "}
              PASS 2
            </Button>
            <Button
              onClick={() => void handleRunChapterPass(3)}
              disabled={isRunningPass || progress.total === 0}
              className="h-8 text-[9px] tracking-[0.1em] bg-[#8b2626] hover:bg-[#701c1c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2"
            >
              <span className="text-[10px] text-[#f2eadc]">
                {progress.pass3Done === progress.total && progress.total > 0
                  ? "✔"
                  : "〇"}
              </span>{" "}
              PASS 3
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
