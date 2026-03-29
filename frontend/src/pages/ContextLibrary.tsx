import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { getSeriesGlossaryDetailed, updateGlossaryTerm, type DetailedGlossaryTerm } from "../lib/api";
import { showError, showSuccess } from "../lib/notifications";

export function ContextLibrary() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [terms, setTerms] = useState<DetailedGlossaryTerm[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editValues, setEditValues] = useState<Record<number, string>>({});
  
  // Use a fixed seriesId mapped from translation or 1 for demo purposes
  const seriesId = Number(searchParams.get("seriesId") || "1");

  useEffect(() => {
    loadTerms();
  }, [seriesId]);

  async function loadTerms() {
    setIsLoading(true);
    try {
      const data = await getSeriesGlossaryDetailed(seriesId);
      setTerms(data);
      // Initialize edit values
      const initialEdits: Record<number, string> = {};
      data.forEach(t => { initialEdits[t.id] = t.termEn || ""; });
      setEditValues(initialEdits);
    } catch (err) {
      console.error(err);
      void showError("Failed to Load Glossary", "Could not load the terms for this series.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(termId: number) {
    const value = editValues[termId]?.trim();
    if (!value) {
      void showError("Validation Error", "English translation is required before approving.");
      return;
    }

    try {
      await updateGlossaryTerm(termId, { termEn: value, status: "approved" });
      void showSuccess("Term Approved", `The term translation has been saved.`);
      setTerms(prev => prev.map(t => t.id === termId ? { ...t, status: "approved", termEn: value } : t));
    } catch (err) {
      console.error(err);
      void showError("Update Failed", "Could not approve the term.");
    }
  }

  const pendingTerms = useMemo(() => terms.filter(t => t.status === "pending" || !t.status), [terms]);
  const approvedTerms = useMemo(() => terms.filter(t => t.status === "approved"), [terms]);

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
      <p className="text-[#807068] italic font-serif mb-8">Series Workflow (Pending: {pendingTerms.length})</p>

      {/* Info Box */}
      <div className="bg-[#f2eadc]/60 border border-[#d8cdbd] rounded-sm p-6 mb-8 text-[13px] leading-relaxed font-serif text-[#5c504b]">
        Context entries are injected into every <strong>translation prompt</strong> for this series.
        When you run Pass 1, AI extracts new terms and places them here for your review as <strong>Pending</strong>.
        Provide an appropriate reading or English equivalent and approve them to integrate them globally.
      </div>

      {/* Pending Section */}
      <div className="w-full border border-[#d8cdbd] rounded-sm bg-[#FBF9F6] overflow-hidden mb-8">
        <div className="bg-[#f2eadc]/40 px-6 py-4 flex justify-between items-center border-b border-[#d8cdbd]">
          <div className="flex items-center gap-4">
            <span className="text-[11px] tracking-[0.3em] font-sans text-[#a04040] uppercase font-semibold">
              PENDING REVIEW
            </span>
            <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
              {pendingTerms.length} EXTRACTED TERMS
            </span>
          </div>
        </div>

        <div className="p-6 pt-4">
          <div className="flex text-[9px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-4 pb-2 border-b border-[#e8dfcf] px-2">
            <div className="w-1/3">SOURCE / CONTEXT</div>
            <div className="flex-1">TRANSLATION / RENDERING</div>
            <div className="w-24 text-right">ACTION</div>
          </div>

          <div className="flex flex-col gap-1">
            {pendingTerms.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center text-sm font-serif px-2 py-3 hover:bg-[#ffeaea]/30 rounded-sm transition-colors group border-b border-[#f2eadc] last:border-0"
              >
                <div className="w-1/3 flex flex-col pr-4">
                  <span className="text-[#4A3D39] font-bold text-base mb-1">{entry.canonicalForm}</span>
                  <span className="text-[#a0908b] text-[10px] leading-snug italic line-clamp-2">
                    {entry.TermAppearances?.[0]?.contextSentence || "No context found"}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center text-[#a0908b]">
                  <input
                    type="text"
                    placeholder="Enter final translation..."
                    value={editValues[entry.id] || ""}
                    onChange={(e) => setEditValues(prev => ({...prev, [entry.id]: e.target.value}))}
                    className="bg-white border border-[#d8cdbd] rounded-sm px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#c8a080] w-full max-w-sm text-[#4A3D39]"
                  />
                  <span className="text-[9px] font-sans uppercase mt-1">Suggested: {entry.termEn}</span>
                </div>
                <div className="w-24 text-right">
                  <Button 
                    onClick={() => void handleApprove(entry.id)}
                    className="h-7 px-3 bg-[#4A3D39] hover:bg-[#2a2422] text-white text-[9px] tracking-widest font-sans uppercase rounded-sm"
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
            {pendingTerms.length === 0 && (
              <div className="py-8 text-center text-[#a0908b] italic text-sm">
                {isLoading ? "Loading..." : "No pending terms. Run Pass 1 (Lexicographer) to extract new terms."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approved Section */}
      <div className="w-full border border-[#d8cdbd] rounded-sm bg-[#FBF9F6] overflow-hidden opacity-90">
        <div className="bg-[#f2eadc]/40 px-6 py-4 flex justify-between items-center border-b border-[#d8cdbd] cursor-pointer hover:bg-[#f2eadc]/60 transition-colors">
          <div className="flex items-center gap-4">
            <span className="text-[11px] tracking-[0.3em] font-sans text-[#2f7a46] uppercase font-semibold">
              APPROVED DICTIONARY
            </span>
            <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
              {approvedTerms.length} ACTIVE ENTRIES
            </span>
          </div>
        </div>

        <div className="p-6 pt-4">
          <div className="flex text-[9px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-4 pb-2 border-b border-[#e8dfcf] px-2">
            <div className="w-1/3">SOURCE</div>
            <div className="flex-1">TRANSLATION / RENDERING</div>
          </div>

          <div className="flex flex-col gap-1">
            {approvedTerms.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center text-sm font-serif px-2 py-2 hover:bg-[#f2eadc]/30 rounded-sm transition-colors group"
              >
                <div className="w-1/3 text-[#4A3D39] font-medium">{entry.canonicalForm}</div>
                <div className="flex-1 flex items-center gap-6 text-[#a0908b]">
                  <span className="text-[#d8cdbd] text-xs font-sans">
                    &rarr;
                  </span>
                  <span className="text-[#4A3D39]">{entry.termEn}</span>
                </div>
              </div>
            ))}
            {approvedTerms.length === 0 && (
              <div className="py-4 text-[#a0908b] italic text-sm">
                {isLoading ? "" : "No approved terms yet."}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
