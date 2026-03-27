import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
  getSeries,
  createChapter,
  listChapters,
  updateSeries,
  deleteSeries,
  deleteChapter,
  type Series,
  type Chapter,
} from "../lib/api";
import { showSuccess, showError, showConfirm } from "../lib/notifications";

export function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chapterNumber, setChapterNumber] = useState("1");
  const [chapterTitle, setChapterTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    async function loadSeries() {
      try {
        setIsLoading(true);
        if (!id) {
          await showError("Missing Series ID", "Series ID is missing.");
          return;
        }
        const seriesId = parseInt(id, 10);
        const data = await getSeries(seriesId);
        setSeries(data);

        // Load chapters for this series
        const chapterData = await listChapters(seriesId);
        setChapters(chapterData);
      } catch (loadError) {
        await showError(
          "Failed to Load Series",
          loadError instanceof Error
            ? loadError.message
            : "An unexpected error occurred",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadSeries();
  }, [id]);

  async function handleAddChapter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!series || !rawText.trim()) {
      void showError("Validation Error", "Raw text is required.");
      return;
    }

    try {
      setIsSubmitting(true);

      await createChapter({
        seriesId: series.id,
        number: parseInt(chapterNumber, 10),
        title: chapterTitle.trim() || undefined,
        rawText: rawText.trim(),
      });

      // Reload chapters
      const chapterData = await listChapters(series.id);
      setChapters(chapterData);

      await showSuccess("Success", "Chapter created successfully!");
      setDialogOpen(false);
      setChapterNumber("1");
      setChapterTitle("");
      setRawText("");
    } catch (err) {
      await showError(
        "Failed to Create Chapter",
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEditDialog() {
    if (series) {
      setEditTitle(series.title);
      setEditGenre(series.genre || "");
      setEditDescription(series.description || "");
      setEditDialogOpen(true);
    }
  }

  async function handleEditSeries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!series || !editTitle.trim()) {
      await showError("Validation Error", "Title is required.");
      return;
    }

    try {
      setIsEditSubmitting(true);

      const updated = await updateSeries(series.id, {
        title: editTitle.trim(),
        genre: editGenre.trim() || undefined,
        description: editDescription.trim() || undefined,
      });

      setSeries(updated);
      await showSuccess("Success", "Series updated successfully!");
      setEditDialogOpen(false);
    } catch (err) {
      await showError(
        "Failed to Update Series",
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsEditSubmitting(false);
    }
  }

  async function handleDeleteSeries() {
    if (!series) {
      return;
    }

    const confirmed = await showConfirm(
      "Delete Series",
      "Are you sure you want to delete this series? This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteSeries(series.id);
      await showSuccess("Success", "Series deleted successfully!");
      navigate("/library");
    } catch (err) {
      await showError(
        "Failed to Delete Series",
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteChapter(chapter: Chapter) {
    if (!series) {
      return;
    }

    const confirmed = await showConfirm(
      "Delete Chapter",
      `Delete Chapter ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ""}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingChapterId(chapter.id);
      await deleteChapter(chapter.id);
      const chapterData = await listChapters(series.id);
      setChapters(chapterData);
      await showSuccess("Success", "Chapter deleted successfully!");
    } catch (err) {
      await showError(
        "Failed to Delete Chapter",
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setDeletingChapterId(null);
    }
  }

  function formatLanguage(value: Series["language"]): string {
    return value === "zh" ? "中文 — Chinese" : "日本語 — Japanese";
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (isLoading) {
    return (
      <main className="flex-1 w-full max-w-3xl px-8 mt-32 mx-auto pb-24">
        <p className="text-[#a0908b] font-serif italic">Loading...</p>
      </main>
    );
  }

  if (!series) {
    return (
      <main className="flex-1 w-full max-w-3xl px-8 mt-32 mx-auto pb-24">
        <div className="mb-8">
          <Link
            to="/library"
            className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
          >
            &larr; LIBRARY
          </Link>
        </div>
        <p className="text-[#807068] text-xs tracking-[0.06em] font-serif">
          Series not found.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-3xl px-8 mt-32 mx-auto pb-24">
      <div className="mb-8">
        <Link
          to="/library"
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
        >
          &larr; LIBRARY
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide mb-2">
              {series.title}
            </h1>
            <p className="text-[#807068] font-serif italic mb-4">
              {formatLanguage(series.language)}
            </p>
            {series.description ? (
              <p className="text-base leading-relaxed font-serif text-[#5c504b]">
                {series.description}
              </p>
            ) : (
              <p className="text-base leading-relaxed font-serif text-[#a0908b] italic">
                This series has no description.
              </p>
            )}
          </div>
          {series.genre && (
            <Badge className="bg-[#e8dfcf] text-[#5c504b] hover:bg-[#e8dfcf] border border-[#d8cdbd] rounded-full px-3 py-1 text-[8px] tracking-[0.2em] uppercase font-sans font-normal shadow-none">
              {series.genre}
            </Badge>
          )}
        </div>

        <hr className="border-t border-[#d8cdbd] mb-8" />

        <div className="mb-8">
          <h2 className="text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            SERIES INFO
          </h2>
          <div className="space-y-2 text-sm font-serif text-[#5c504b]">
            <div className="flex justify-between">
              <span className="text-[#b8a8a0]">ID:</span>
              <span className="font-mono">{series.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b8a8a0]">Created:</span>
              <span>{formatDate(series.createdAt)}</span>
            </div>
          </div>
        </div>

        <hr className="border-t border-[#d8cdbd] mb-8" />

        <div className="mb-8">
          <h2 className="text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            CHAPTERS ({chapters.length})
          </h2>
          {chapters.length === 0 ? (
            <p className="text-[#807068] font-serif italic">
              No chapters yet. Click "ADD CHAPTER" to start.
            </p>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="flex items-center gap-3 p-3 rounded-sm border border-[#d8cdbd] hover:bg-[#f2eadc]/20 transition-colors group"
                >
                  <Link
                    to={`/translation?seriesId=${series.id}&chapterId=${chapter.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="text-sm font-serif text-[#4A3D39] group-hover:text-[#8b2626] transition-colors">
                      Chapter {chapter.number}
                      {chapter.title && ` — ${chapter.title}`}
                    </div>
                    <div className="text-xs text-[#a0908b] mt-1">
                      {chapter.rawText.length} chars
                      {chapter.finalText &&
                        ` • ${chapter.finalText.length} in translation`}
                    </div>
                  </Link>
                  <span className="text-[9px] text-[#a0908b] font-sans ml-4">
                    {formatDate(chapter.createdAt)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deletingChapterId === chapter.id}
                    onClick={() => void handleDeleteChapter(chapter)}
                    className="h-7 px-3 text-[9px] tracking-widest uppercase font-sans border-[#c68080] text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] bg-transparent rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingChapterId === chapter.id
                      ? "DELETING..."
                      : "DELETE"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-t border-[#d8cdbd] mb-8" />

        <div className="flex gap-4 pt-4">
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase h-10"
          >
            + ADD CHAPTER
          </Button>
          <Button
            onClick={openEditDialog}
            variant="outline"
            className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent h-10"
          >
            EDIT SERIES
          </Button>
          <Button
            onClick={handleDeleteSeries}
            disabled={isDeleting}
            variant="outline"
            className="border-[#c68080] font-sans text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent h-10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? "DELETING..." : "DELETE SERIES"}
          </Button>
          <Button
            variant="outline"
            className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent h-10"
            onClick={() => navigate("/library")}
          >
            BACK
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md bg-[#FBF9F6] border-[#d8cdbd]">
            <DialogHeader>
              <DialogTitle className="font-serif text-[#4A3D39]">
                Add New Chapter
              </DialogTitle>
              <DialogDescription className="text-[#807068]">
                Create a new chapter for {series?.title}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddChapter} className="space-y-6">
              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  CHAPTER NUMBER
                </label>
                <Input
                  type="number"
                  min="1"
                  value={chapterNumber}
                  onChange={(event) => setChapterNumber(event.target.value)}
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39]"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  CHAPTER TITLE (Optional)
                </label>
                <Input
                  value={chapterTitle}
                  onChange={(event) => setChapterTitle(event.target.value)}
                  placeholder="e.g., The Beginning..."
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0]"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  RAW TEXT *
                </label>
                <Textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Paste the raw chapter text here..."
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] h-[100px] resize-none"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent"
                  disabled={isSubmitting}
                >
                  CANCEL
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !rawText.trim()}
                  className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm text-[10px] tracking-[0.2em] uppercase disabled:bg-[#e8dfcf] disabled:text-[#a0908b] disabled:hover:bg-[#e8dfcf] disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "CREATING..." : "CREATE"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md bg-[#FBF9F6] border-[#d8cdbd]">
            <DialogHeader>
              <DialogTitle className="font-serif text-[#4A3D39]">
                Edit Series
              </DialogTitle>
              <DialogDescription className="text-[#807068]">
                Update series information
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleEditSeries} className="space-y-6">
              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  TITLE *
                </label>
                <Input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39]"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  GENRE
                </label>
                <Input
                  value={editGenre}
                  onChange={(event) => setEditGenre(event.target.value)}
                  placeholder="e.g., Xianxia..."
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0]"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-2">
                  DESCRIPTION
                </label>
                <Textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Series description..."
                  className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] h-[100px] resize-none"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent"
                  disabled={isEditSubmitting}
                >
                  CANCEL
                </Button>
                <Button
                  type="submit"
                  disabled={isEditSubmitting || !editTitle.trim()}
                  className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm text-[10px] tracking-[0.2em] uppercase disabled:bg-[#e8dfcf] disabled:text-[#a0908b] disabled:hover:bg-[#e8dfcf] disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  {isEditSubmitting ? "SAVING..." : "SAVE"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
