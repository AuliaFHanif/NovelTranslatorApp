import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { GlossaryCandidate } from "../lib/api";
import { bulkApproveTerms } from "../lib/api";
import { showSuccess, showError } from "../lib/notifications";

interface GlossaryApprovalDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  terms: GlossaryCandidate[];
  onApproved?: () => void;
}

export function GlossaryApprovalDialog({
  isOpen,
  onOpenChange,
  terms,
  onApproved,
}: GlossaryApprovalDialogProps) {
  const [searchParams] = useSearchParams();
  const seriesId = Number(searchParams.get("seriesId") || "0");
  
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to get unique key for a candidate
  const getCandidateKey = (cand: GlossaryCandidate) => `${cand.term}|${cand.type}`;

  useEffect(() => {
    if (isOpen && terms.length > 0) {
      setSelectedKeys(new Set(terms.map(getCandidateKey)));
      const initialEdits: Record<string, string> = {};
      terms.forEach((t) => {
        initialEdits[getCandidateKey(t)] = t.proposedTranslation || "";
      });
      setEditValues(initialEdits);
    }
  }, [isOpen, terms]);

  const handleToggle = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const handleApproveSelected = async () => {
    if (selectedKeys.size === 0) return;
    if (!seriesId) {
        showError("Series Error", "Missing series identification.");
        return;
    }
    
    setIsSubmitting(true);
    try {
      const selectedTerms = terms
        .filter((t) => selectedKeys.has(getCandidateKey(t)))
        .map(t => ({
            ...t,
            termEn: editValues[getCandidateKey(t)]
        }));

      await bulkApproveTerms(seriesId, selectedTerms);
      
      void showSuccess("Glossary Updated", `Successfully added ${selectedTerms.length} terms to the library.`);
      if (onApproved) onApproved();
      onOpenChange(false);
    } catch (error) {
      void showError("Approval Failed", error instanceof Error ? error.message : "Error saving terms.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 overflow-hidden bg-[#FBF9F6] border-[#d8cdbd] rounded-sm">
        <DialogHeader className="p-6 bg-[#f2eadc]/40 border-b border-[#d8cdbd]">
          <DialogTitle className="text-2xl font-serif text-[#4A3D39] tracking-tight">
            LEXICOGRAPHER: TERM REVIEW
          </DialogTitle>
          <p className="text-[13px] text-[#807068] italic font-serif mt-1">
            New terminology identified. Refine and approve terms to integrate them into future translation passes.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="flex text-[9px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-4 pb-2 border-b border-[#e8dfcf] px-2 font-bold">
            <div className="w-8"></div>
            <div className="w-1/3">SOURCE / CONTEXT</div>
            <div className="flex-1">RECOMMENDED RENDERING</div>
          </div>

          <div className="flex flex-col gap-1">
            {terms.map((term) => {
              const key = getCandidateKey(term);
              return (
                <div
                  key={key}
                  className="flex items-start text-sm font-serif px-2 py-4 hover:bg-[#f2eadc]/20 rounded-sm transition-colors border-b border-[#f2eadc] last:border-0"
                >
                  <div className="w-8 pt-1">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => handleToggle(key)}
                      className="w-4 h-4 rounded border-[#d8cdbd] accent-[#8b2626] outline-none cursor-pointer"
                    />
                  </div>
                  <div className="w-1/3 flex flex-col pr-6">
                    <span className="text-[#4A3D39] font-bold text-[15px] mb-1 leading-tight">
                      {term.term}
                    </span>
                    <span className="text-[#a0908b] text-[11px] leading-snug italic line-clamp-3">
                      {term.appearances?.[0]?.context ||
                        "No specific context sample extracted."}
                    </span>
                  </div>
                  <div className="flex-1">
                    <Input
                      value={editValues[key] || ""}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="h-9 bg-white border-[#d8cdbd] text-[#4A3D39] text-sm focus-visible:ring-[#8b2626]/20"
                      placeholder="Enter English rendering..."
                    />
                    <div className="mt-1 flex gap-2">
                      <span className="text-[9px] tracking-wider text-[#a0908b] uppercase font-sans">
                        Confidence: {Math.round((term.confidence || 0.5) * 100)}%
                      </span>
                      <span className="text-[9px] tracking-wider text-[#a0908b] uppercase font-sans">
                        | Type: {term.type || "term"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="p-6 bg-[#f2eadc]/20 border-t border-[#d8cdbd] flex flex-row justify-between items-center gap-4">
          <div className="text-[10px] text-[#a0908b] uppercase tracking-[0.2em] font-bold">
            {selectedKeys.size} of {terms.length} CANDIDATES
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 px-8 text-[10px] tracking-[0.2em] font-sans uppercase rounded-sm border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc]/40 hover:text-[#4A3D39]"
            >
              Discard All
            </Button>
            <Button
              onClick={() => void handleApproveSelected()}
              disabled={isSubmitting || selectedKeys.size === 0}
              className="h-10 px-8 bg-[#8b2626] hover:bg-[#701c1c] text-white text-[10px] tracking-[0.2em] font-sans uppercase rounded-sm border-none shadow-sm min-w-[160px]"
            >
              {isSubmitting ? "Processing..." : "Save to Library"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
