import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  getSeriesGlossaryDetailed,
  updateGlossaryTerm,
  type DetailedGlossaryTerm,
} from "../lib/api";
import { showError, showSuccess } from "../lib/notifications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Input } from "../components/ui/input";

export function ContextLibrary() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [terms, setTerms] = useState<DetailedGlossaryTerm[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const seriesId = Number(searchParams.get("seriesId") || "1");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRendering, setEditRendering] = useState("");
  const [editType, setEditType] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const termTypes = [
    "character",
    "organization",
    "location",
    "item",
    "concept",
    "technique",
  ];

  useEffect(() => {
    loadTerms();
  }, [seriesId]);

  async function loadTerms() {
    setIsLoading(true);
    try {
      const data = await getSeriesGlossaryDetailed(seriesId);
      setTerms(data);
    } catch (err) {
      console.error(err);
      void showError(
        "Failed to Load Glossary",
        "Could not load the terms for this series.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReject(termId: number) {
    try {
      // Backend now DELETES the record if status is 'rejected'
      await updateGlossaryTerm(termId, { status: "rejected" });
      void showSuccess(
        "Term Deleted",
        `The term has been removed from the library.`,
      );
      setTerms((prev) => prev.filter((t) => t.id !== termId));
    } catch (err) {
      console.error(err);
      void showError("Delete Failed", "Could not remove the term.");
    }
  }

  function startEditing(term: DetailedGlossaryTerm) {
    setEditingId(term.id);
    setEditRendering(term.termEn);
    setEditType(term.type);
  }

  async function handleUpdate(termId: number) {
    setIsUpdating(true);
    try {
      await updateGlossaryTerm(termId, {
        termEn: editRendering,
        type: editType as any,
      });
      setTerms((prev) =>
        prev.map((t) =>
          t.id === termId ? { ...t, termEn: editRendering, type: editType } : t,
        ),
      );
      setEditingId(null);
      void showSuccess(
        "Term Updated",
        "Successfully saved the dictionary entry.",
      );
    } catch (err) {
      console.error(err);
      void showError("Update Failed", "Could not save the changes.");
    } finally {
      setIsUpdating(false);
    }
  }

  const activeTerms = useMemo(() => {
    // Sort alphabetically by canonicalForm
    return [...terms].sort((a, b) =>
      a.canonicalForm.localeCompare(b.canonicalForm),
    );
  }, [terms]);

  return (
    <main className="flex-1 w-full max-w-5xl px-8 mt-32 mx-auto pb-24">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors p-0 h-auto"
        >
          &larr; BACK
        </Button>
      </div>

      <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide mb-2">
        CONTEXT LIBRARY
      </h1>
      <p className="text-[#807068] italic font-serif mb-8">
        Series Active Dictionary ({activeTerms.length} Entries)
      </p>

      {/* Info Box */}
      <div className="bg-[#f2eadc]/60 border border-[#d8cdbd] rounded-sm p-6 mb-8 text-[13px] leading-relaxed font-serif text-[#5c504b]">
        Glossary entries are injected into every{" "}
        <strong>translation prompt</strong> to ensure consistency. These are the
        terms you have approved via the <strong>Analyze Pass (Pass 2)</strong>.
      </div>

      {/* Dictionary Section */}
      <div className="w-full border border-[#d8cdbd] rounded-sm bg-[#FBF9F6] overflow-hidden shadow-sm">
        <div className="bg-[#f2eadc]/40 px-6 py-4 flex justify-between items-center border-b border-[#d8cdbd]">
          <div className="flex items-center gap-4">
            <span className="text-[11px] tracking-[0.3em] font-sans text-[#4A3D39] uppercase font-semibold">
              ACTIVE DICTIONARY
            </span>
          </div>
        </div>

        <div className="p-6 pt-4">
          <div className="flex text-[9px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-4 pb-2 border-b border-[#e8dfcf] px-2">
            <div className="w-1/4">SOURCE TERM</div>
            <div className="w-1/4">TYPE</div>
            <div className="flex-1">RENDERING (EN)</div>
            <div className="w-24 text-right">ACTION</div>
          </div>

          <div className="flex flex-col gap-1">
            {activeTerms.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start text-sm font-serif px-2 py-3 hover:bg-[#ffeaea]/10 rounded-sm transition-colors group border-b border-[#f2eadc] last:border-0"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1 flex flex-col pr-4">
                      <span className="text-[#4A3D39] font-bold text-base mb-0.5">
                        {entry.canonicalForm}
                      </span>
                      {entry.definition && (
                        <span className="text-[#5c504b] text-[11px] leading-relaxed">
                          <span className="font-semibold text-[#4A3D39]">
                            Def:
                          </span>{" "}
                          {entry.definition}
                        </span>
                      )}
                      <span className="text-[#a0908b] text-[9px] italic truncate mt-1">
                        {entry.Appearances?.[0]?.contextSentence ||
                          "No context recorded"}
                      </span>
                    </div>
                    <div className="w-1/4">
                      {editingId === entry.id ? (
                        <Select value={editType} onValueChange={setEditType}>
                          <SelectTrigger className="h-8 w-32 border-[#d8cdbd] bg-white text-[10px] font-sans uppercase">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-[#d8cdbd]">
                            {termTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                <span className="text-[10px] font-sans uppercase">
                                  {type}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[10px] tracking-widest uppercase font-sans text-[#807068] border border-[#d8cdbd] px-3 py-1 rounded-full bg-[#f2eadc]/20">
                          {entry.type}
                        </span>
                      )}
                    </div>
                    <div className="w-1/4 text-[#4A3D39] font-medium pr-4">
                      {editingId === entry.id ? (
                        <Input
                          value={editRendering}
                          onChange={(e) => setEditRendering(e.target.value)}
                          className="h-8 bg-white border-[#d8cdbd] text-sm focus-visible:ring-[#8b2626]/20"
                        />
                      ) : (
                        entry.termEn
                      )}
                    </div>
                    <div className="w-48 text-right flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId === entry.id ? (
                        <Button
                          onClick={() => void handleUpdate(entry.id)}
                          disabled={isUpdating}
                          className="h-7 px-3 bg-[#8b2626] hover:bg-[#701c1c] text-white text-[9px] tracking-widest font-sans uppercase rounded-sm border-none shadow-none min-w-[100px]"
                        >
                          {isUpdating ? "Saving..." : "Finish Editing"}
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={() => startEditing(entry)}
                            variant="outline"
                            className="h-7 px-3 border-[#d8cdbd] text-[#807068] hover:bg-[#f2eadc] hover:text-[#4A3D39] text-[9px] tracking-widest font-sans uppercase rounded-sm transition-all bg-transparent"
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={() => void handleReject(entry.id)}
                            variant="outline"
                            className="h-7 px-3 border-[#c68080] text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] text-[9px] tracking-widest font-sans uppercase rounded-sm transition-all bg-transparent"
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {activeTerms.length === 0 && (
              <div className="py-8 text-center text-[#a0908b] italic text-sm">
                {isLoading
                  ? "Loading library..."
                  : "No active dictionary entries. Run Analysis to begin."}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
