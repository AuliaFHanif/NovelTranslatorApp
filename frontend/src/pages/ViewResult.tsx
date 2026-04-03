import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { getSeries, listChapters, deleteChapterResult, type Series, type Chapter } from "../lib/api";
import { showConfirm, showError, showSuccess } from "../lib/notifications";

export function ViewResult() {
  const { seriesId, chapterId } = useParams<{ seriesId: string; chapterId: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        if (!seriesId || !chapterId) return;

        const sId = parseInt(seriesId, 10);
        const cId = parseInt(chapterId, 10);

        const seriesData = await getSeries(sId);
        setSeries(seriesData);

        const chapters = await listChapters(sId);
        const currentChapter = chapters.find((c) => c.id === cId);
        
        if (currentChapter) {
          setChapter(currentChapter);
        } else {
          void showError("Not Found", "Chapter not found in this series.");
        }
      } catch (err) {
        void showError("Load Failed", err instanceof Error ? err.message : "Failed to load result.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadData();
  }, [seriesId, chapterId]);

  const handleDeleteResult = async () => {
    if (!chapter || !series) return;
    
    const confirmed = await showConfirm(
      "Delete Result",
      "Are you sure you want to delete this translation result? This will clear the final text but won't delete the individual acts."
    );
    
    if (!confirmed) return;
    
    try {
      await deleteChapterResult(chapter.id);
      setChapter({ ...chapter, finalText: null });
      await showSuccess("Deleted", "Translation result has been cleared.");
    } catch (err) {
      void showError("Delete Failed", err instanceof Error ? err.message : "Failed to delete result.");
    }
  };

  const handleCopy = async () => {
    if (!chapter?.finalText) return;
    try {
      await navigator.clipboard.writeText(chapter.finalText);
      await showSuccess("Copied", "Translation copied to clipboard.");
    } catch {
      void showError("Copy Failed", "Could not access clipboard.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[#a0908b] font-serif italic">
        Loading translation result...
      </div>
    );
  }

  if (!series || !chapter) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-[#807068] font-serif p-8 text-center">
        <p className="mb-6">Result not found.</p>
        <Link to="/library" className="text-[10px] tracking-[0.2em] font-sans uppercase text-[#8b2626] hover:text-[#701c1c] transition-colors">
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <main className="flex-1 w-full max-w-4xl px-8 mt-32 mx-auto pb-32">
      <div className="mb-12">
        <Link
          to={`/series/${series.id}`}
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
        >
          &larr; {series.title.toUpperCase()}
        </Link>
      </div>

      <header className="mb-16 border-b border-[#d8cdbd] pb-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-4xl font-serif text-[#4A3D39] tracking-tight mb-2">
              Chapter {chapter.number}
              {chapter.title && <span className="text-[#807068] font-light ml-4 opacity-80">/ {chapter.title}</span>}
            </h1>
            <p className="text-[10px] tracking-[0.3em] font-sans text-[#a0908b] uppercase">
              Final Translation Result
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={!chapter.finalText}
              onClick={handleDeleteResult}
              className="border-[#d8cdbd] text-[#c68080] h-9 text-[9px] tracking-[0.2em] rounded-sm px-6 hover:bg-[#ffeaea] hover:text-[#a04040] bg-transparent font-sans uppercase transition-all"
            >
              Delete Result
            </Button>
            <Button
              variant="outline"
              disabled={!chapter.finalText}
              onClick={handleCopy}
              className="border-[#d8cdbd] text-[#807068] h-9 text-[9px] tracking-[0.2em] rounded-sm px-6 hover:bg-[#f2eadc] bg-transparent font-sans uppercase transition-all"
            >
              Copy Text
            </Button>
          </div>
        </div>
      </header>

      <article className="prose prose-stone max-w-none">
        <div className="whitespace-pre-wrap font-serif text-[#3a3331] text-[17px] leading-[2.2] tracking-wide antialiased">
          {chapter.finalText || (
            <div className="text-[#a0908b] italic text-center py-20 border border-dashed border-[#d8cdbd] rounded-sm">
              No final text available. Run "Export Result" in the translation workspace.
            </div>
          )}
        </div>
      </article>

      <footer className="mt-24 pt-12 border-t border-[#d8cdbd] flex justify-center">
        <Link
          to={`/translation?seriesId=${series.id}&chapterId=${chapter.id}`}
          className="text-[9px] tracking-[0.4em] font-sans text-[#a0908b] uppercase hover:text-[#8b2626] transition-colors"
        >
          Return to Workspace &rarr;
        </Link>
      </footer>
    </main>
  );
}
