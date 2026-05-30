import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  listGenres,
  createGenre,
  updateGenre,
  deleteGenre,
  listAIModels,
  createAIModel,
  updateAIModel,
  deleteAIModel,
  type Genre,
  type AIModel,
} from "../lib/api";
import { showSuccess, showError, showConfirm } from "../lib/notifications";

type Tab = "genres" | "models";

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("genres");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [aiModels, setAIModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Genre dialog state
  const [genreDialogOpen, setGenreDialogOpen] = useState(false);
  const [editingGenreId, setEditingGenreId] = useState<number | null>(null);
  const [genreName, setGenreName] = useState("");
  const [genreDescription, setGenreDescription] = useState("");
  const [isSubmittingGenre, setIsSubmittingGenre] = useState(false);

  // AI Model dialog state
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [modelName, setModelName] = useState("");
  const [modelId, setModelId] = useState("");
  const [provider, setProvider] = useState<
    "lm-studio" | "openai" | "claude" | "other"
  >("lm-studio");
  const [modelDescription, setModelDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSubmittingModel, setIsSubmittingModel] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setIsLoading(true);
      const [genresData, modelsData] = await Promise.all([
        listGenres(),
        listAIModels(),
      ]);
      setGenres(genresData);
      setAIModels(modelsData);
    } catch (error) {
      await showError(
        "Failed to Load Settings",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * GENRE HANDLERS
   */

  function openGenreDialog(genre?: Genre) {
    if (genre) {
      setEditingGenreId(genre.id);
      setGenreName(genre.name);
      setGenreDescription(genre.description || "");
    } else {
      setEditingGenreId(null);
      setGenreName("");
      setGenreDescription("");
    }
    setGenreDialogOpen(true);
  }

  async function handleSaveGenre() {
    if (!genreName.trim()) {
      await showError("Validation Error", "Genre name is required");
      return;
    }

    try {
      setIsSubmittingGenre(true);

      if (editingGenreId) {
        await updateGenre(editingGenreId, {
          name: genreName.trim(),
          description: genreDescription.trim() || undefined,
        });
        await showSuccess("Success", "Genre updated successfully!");
      } else {
        await createGenre({
          name: genreName.trim(),
          description: genreDescription.trim() || undefined,
        });
        await showSuccess("Success", "Genre created successfully!");
      }

      await loadSettings();
      setGenreDialogOpen(false);
    } catch (error) {
      await showError(
        "Failed to Save Genre",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmittingGenre(false);
    }
  }

  async function handleDeleteGenre(genre: Genre) {
    const confirmed = await showConfirm(
      "Delete Genre",
      `Are you sure you want to delete "${genre.name}"? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteGenre(genre.id);
      await showSuccess("Success", "Genre deleted successfully!");
      await loadSettings();
    } catch (error) {
      await showError(
        "Failed to Delete Genre",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  }

  /**
   * AI MODEL HANDLERS
   */

  function openModelDialog(model?: AIModel) {
    if (model) {
      setEditingModelId(model.id);
      setModelName(model.name);
      setModelId(model.modelId);
      setProvider(model.provider);
      setModelDescription(model.description || "");
      setIsActive(model.isActive);
    } else {
      setEditingModelId(null);
      setModelName("");
      setModelId("");
      setProvider("lm-studio");
      setModelDescription("");
      setIsActive(true);
    }
    setModelDialogOpen(true);
  }

  async function handleSaveModel() {
    if (!modelName.trim()) {
      await showError("Validation Error", "Model name is required");
      return;
    }

    if (!modelId.trim()) {
      await showError("Validation Error", "Model ID is required");
      return;
    }

    try {
      setIsSubmittingModel(true);

      if (editingModelId) {
        await updateAIModel(editingModelId, {
          name: modelName.trim(),
          modelId: modelId.trim(),
          provider,
          description: modelDescription.trim() || undefined,
          isActive,
        });
        await showSuccess("Success", "Model updated successfully!");
      } else {
        await createAIModel({
          name: modelName.trim(),
          modelId: modelId.trim(),
          provider,
          description: modelDescription.trim() || undefined,
          isActive,
        });
        await showSuccess("Success", "Model created successfully!");
      }

      await loadSettings();
      setModelDialogOpen(false);
    } catch (error) {
      await showError(
        "Failed to Save Model",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmittingModel(false);
    }
  }

  async function handleDeleteModel(model: AIModel) {
    const confirmed = await showConfirm(
      "Delete AI Model",
      `Are you sure you want to delete "${model.name}"? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAIModel(model.id);
      await showSuccess("Success", "Model deleted successfully!");
      await loadSettings();
    } catch (error) {
      await showError(
        "Failed to Delete Model",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  }

  if (isLoading) {
    return (
      <main className="flex-1 w-full max-w-4xl px-8 mt-32 mx-auto pb-24">
        <p className="text-[#a0908b] font-serif italic">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-4xl px-8 mt-32 mx-auto pb-24">
      <div className="mb-8">
        <Link
          to="/"
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
        >
          ← HOME
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide mb-2">
          SETTINGS
        </h1>
        <p className="text-[#807068] font-serif italic">
          Manage system genres and AI models
        </p>
      </div>

      <hr className="border-t border-[#d8cdbd] mb-8" />

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-[#d8cdbd]">
        <button
          onClick={() => setActiveTab("genres")}
          className={`pb-3 px-4 text-[10px] tracking-[0.2em] font-sans uppercase transition-colors ${
            activeTab === "genres"
              ? "text-[#8b2626] border-b-2 border-[#8b2626]"
              : "text-[#a0908b] hover:text-[#4A3D39]"
          }`}
        >
          GENRES
        </button>
        <button
          onClick={() => setActiveTab("models")}
          className={`pb-3 px-4 text-[10px] tracking-[0.2em] font-sans uppercase transition-colors ${
            activeTab === "models"
              ? "text-[#8b2626] border-b-2 border-[#8b2626]"
              : "text-[#a0908b] hover:text-[#4A3D39]"
          }`}
        >
          AI MODELS
        </button>
      </div>

      {/* GENRES TAB */}
      {activeTab === "genres" && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans">
              GENRES ({genres.length})
            </h2>
            <Button
              onClick={() => openGenreDialog()}
              className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase h-10"
            >
              + ADD GENRE
            </Button>
          </div>

          {genres.length === 0 ? (
            <p className="text-[#807068] font-serif italic">No genres yet.</p>
          ) : (
            <div className="space-y-2">
              {genres.map((genre) => (
                <div
                  key={genre.id}
                  className="flex justify-between items-center p-4 rounded-sm border border-[#d8cdbd] bg-[#FBF9F6] hover:bg-[#f2eadc]/20 transition-colors"
                >
                  <div className="flex-1">
                    <div className="text-sm font-serif text-[#4A3D39] font-semibold">
                      {genre.name}
                    </div>
                    {genre.description && (
                      <div className="text-xs text-[#a0908b] mt-1">
                        {genre.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => openGenreDialog(genre)}
                      variant="outline"
                      className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-4 text-[10px] tracking-[0.2em] uppercase h-8"
                    >
                      EDIT
                    </Button>
                    <Button
                      onClick={() => handleDeleteGenre(genre)}
                      variant="outline"
                      className="border-[#c68080] font-sans text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] rounded-sm px-4 text-[10px] tracking-[0.2em] uppercase h-8"
                    >
                      DELETE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI MODELS TAB */}
      {activeTab === "models" && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans">
              AI MODELS ({aiModels.length})
            </h2>
            <Button
              onClick={() => openModelDialog()}
              className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase h-10"
            >
              + ADD MODEL
            </Button>
          </div>

          {aiModels.length === 0 ? (
            <p className="text-[#807068] font-serif italic">
              No AI models yet.
            </p>
          ) : (
            <div className="space-y-2">
              {aiModels.map((model) => (
                <div
                  key={model.id}
                  className="flex justify-between items-center p-4 rounded-sm border border-[#d8cdbd] bg-[#FBF9F6] hover:bg-[#f2eadc]/20 transition-colors"
                >
                  <div className="flex-1">
                    <div className="text-sm font-serif text-[#4A3D39] font-semibold flex items-center gap-2">
                      {model.name}
                      {!model.isActive && (
                        <span className="text-[8px] text-[#a0908b] font-sans bg-[#e8dfcf] px-2 py-1 rounded">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#a0908b] mt-1">
                      <span className="font-mono">{model.modelId}</span> •{" "}
                      <span className="capitalize">{model.provider}</span>
                    </div>
                    {model.description && (
                      <div className="text-xs text-[#a0908b] mt-1">
                        {model.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => openModelDialog(model)}
                      variant="outline"
                      className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-4 text-[10px] tracking-[0.2em] uppercase h-8"
                    >
                      EDIT
                    </Button>
                    <Button
                      onClick={() => handleDeleteModel(model)}
                      variant="outline"
                      className="border-[#c68080] font-sans text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] rounded-sm px-4 text-[10px] tracking-[0.2em] uppercase h-8"
                    >
                      DELETE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GENRE DIALOG */}
      <Dialog open={genreDialogOpen} onOpenChange={setGenreDialogOpen}>
        <DialogContent className="max-w-md bg-[#FBF9F6] border-[#d8cdbd]">
          <DialogHeader>
            <DialogTitle className="font-serif text-[#4A3D39]">
              {editingGenreId ? "Edit Genre" : "Add New Genre"}
            </DialogTitle>
            <DialogDescription className="text-[#807068]">
              {editingGenreId
                ? "Update the genre information"
                : "Create a new genre for your translation projects"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                NAME *
              </label>
              <Input
                value={genreName}
                onChange={(e) => setGenreName(e.target.value)}
                placeholder="e.g., Xianxia, Wuxia, Isekai..."
                className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0]"
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                DESCRIPTION
              </label>
              <Textarea
                value={genreDescription}
                onChange={(e) => setGenreDescription(e.target.value)}
                placeholder="Optional description..."
                className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] h-[80px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGenreDialogOpen(false)}
              className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent"
              disabled={isSubmittingGenre}
            >
              CANCEL
            </Button>
            <Button
              type="button"
              onClick={handleSaveGenre}
              disabled={isSubmittingGenre || !genreName.trim()}
              className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm text-[10px] tracking-[0.2em] uppercase disabled:bg-[#e8dfcf] disabled:text-[#a0908b] disabled:hover:bg-[#e8dfcf] disabled:opacity-80 disabled:cursor-not-allowed"
            >
              {isSubmittingGenre
                ? editingGenreId
                  ? "SAVING..."
                  : "CREATING..."
                : editingGenreId
                  ? "SAVE"
                  : "CREATE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI MODEL DIALOG */}
      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
        <DialogContent className="max-w-md bg-[#FBF9F6] border-[#d8cdbd]">
          <DialogHeader>
            <DialogTitle className="font-serif text-[#4A3D39]">
              {editingModelId ? "Edit AI Model" : "Add New AI Model"}
            </DialogTitle>
            <DialogDescription className="text-[#807068]">
              {editingModelId
                ? "Update the model information"
                : "Register a new AI model for translations"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                NAME *
              </label>
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g., Llama 2, GPT-4..."
                className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0]"
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                MODEL ID *
              </label>
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g., local-model, gpt-4-turbo..."
                className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0]"
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                PROVIDER
              </label>
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(
                    e.target.value as
                      | "lm-studio"
                      | "openai"
                      | "claude"
                      | "other",
                  )
                }
                className="w-full border border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] px-3 py-2 h-10"
              >
                <option value="lm-studio">Ollama / LM Studio</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                DESCRIPTION
              </label>
              <Textarea
                value={modelDescription}
                onChange={(e) => setModelDescription(e.target.value)}
                placeholder="Optional description..."
                className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] h-[80px] resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-[#d8cdbd]"
              />
              <label
                htmlFor="isActive"
                className="text-sm font-serif text-[#4A3D39] cursor-pointer"
              >
                Active
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModelDialogOpen(false)}
              className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent"
              disabled={isSubmittingModel}
            >
              CANCEL
            </Button>
            <Button
              type="button"
              onClick={handleSaveModel}
              disabled={
                isSubmittingModel || !modelName.trim() || !modelId.trim()
              }
              className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm text-[10px] tracking-[0.2em] uppercase disabled:bg-[#e8dfcf] disabled:text-[#a0908b] disabled:hover:bg-[#e8dfcf] disabled:opacity-80 disabled:cursor-not-allowed"
            >
              {isSubmittingModel
                ? editingModelId
                  ? "SAVING..."
                  : "CREATING..."
                : editingModelId
                  ? "SAVE"
                  : "CREATE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
