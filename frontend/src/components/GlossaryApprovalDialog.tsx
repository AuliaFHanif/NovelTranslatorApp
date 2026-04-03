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
import type { GlossaryCandidate, ConflictedTerm } from "../lib/api";
import { bulkApproveTerms } from "../lib/api";
import { showSuccess, showError } from "../lib/notifications";
import { TermConflictDialog } from "./TermConflictDialog";

interface GlossaryApprovalDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  terms: GlossaryCandidate[];
  onApproved?: () => void;
}

interface CategoryizedTerms {
  newTerms: GlossaryCandidate[];
  existingTerms: GlossaryCandidate[];
  conflictTerms: ConflictedTerm[];
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
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [categorized, setCategorized] = useState<CategoryizedTerms>({
    newTerms: [],
    existingTerms: [],
    conflictTerms: [],
  });

  // Helper to get unique key for a candidate
  const getCandidateKey = (cand: GlossaryCandidate | ConflictedTerm) =>
    `${cand.term}|${cand.type}`;

  useEffect(() => {
    if (isOpen && terms.length > 0) {
      // Initially just treat all as new terms until we submit
      setCategorized({
        newTerms: terms,
        existingTerms: [],
        conflictTerms: [],
      });
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
      const allTerms = [...categorized.newTerms, ...categorized.existingTerms];
      const selectedTerms = allTerms
        .filter((t) => selectedKeys.has(getCandidateKey(t)))
        .map((t) => ({
          ...t,
          termEn: editValues[getCandidateKey(t)],
        }));

      const result = await bulkApproveTerms(seriesId, selectedTerms);

      // Check if there are conflicts to resolve
      if (
        result.categorized?.conflictTerms &&
        result.categorized.conflictTerms.length > 0
      ) {
        setCategorized(result.categorized);
        setShowConflictDialog(true);
      } else {
        const totalSaved = result.created + result.updated;
        void showSuccess(
          "Glossary Updated",
          `Successfully added ${totalSaved} terms to the library.`,
        );
        if (onApproved) onApproved();
        onOpenChange(false);
      }
    } catch (error) {
      void showError(
        "Approval Failed",
        error instanceof Error ? error.message : "Error saving terms.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConflictResolved = async (
    _resolved: Array<ConflictedTerm & { resolution: string }>,
  ) => {
    // Backend has already processed the resolutions via endpoint
    // Just confirm completion and close dialogs
    setShowConflictDialog(false);
    if (onApproved) onApproved();
    onOpenChange(false);
  };

  const TermSection = ({
    title,
    terms: sectionTerms,
    editable = true,
    section = "new",
  }: {
    title: string;
    terms: (GlossaryCandidate | ConflictedTerm)[];
    editable?: boolean;
    section?: "new" | "existing" | "conflict";
  }) => {
    if (sectionTerms.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="text-[11px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-3 pb-2 border-b border-[#e8dfcf] px-2 font-bold">
          {title} ({sectionTerms.length})
        </div>
        <div className="flex flex-col gap-1">
          {sectionTerms.map((term) => {
            const key = getCandidateKey(term);
            const isExisting = section === "existing";
            const isConflict = section === "conflict";
            const opacity = editable ? "" : "opacity-60";

            return (
              <div
                key={key}
                className={`flex items-start text-sm font-serif px-2 py-4 rounded-sm transition-colors border-b border-[#f2eadc] last:border-0 ${
                  editable ? "hover:bg-[#f2eadc]/20" : "bg-[#f2eadc]/10"
                } ${opacity}`}
              >
                <div className="w-8 pt-1">
                  {editable && (
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => handleToggle(key)}
                      className="w-4 h-4 rounded border-[#d8cdbd] accent-[#8b2626] outline-none cursor-pointer"
                    />
                  )}
                  {!editable && (
                    <div className="w-4 h-4 rounded border border-[#d8cdbd] bg-[#e8dfcf] flex items-center justify-center text-[8px]">
                      ✓
                    </div>
                  )}
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
                  {isExisting && (
                    <div className="text-sm text-[#4A3D39] p-2 bg-[#f2eadc]/20 rounded-sm">
                      <div className="font-bold">
                        {(term as any).existingTranslation}
                      </div>
                      <div className="text-[9px] text-[#a0908b] mt-1">
                        Already in library • Status:{" "}
                        {(term as any).existingStatus}
                      </div>
                    </div>
                  )}
                  {isConflict && (
                    <div className="text-sm text-[#4A3D39] p-2 bg-[#fff5f5] rounded-sm border border-[#f5e6e6]">
                      <div className="text-[9px] text-[#a0908b] mb-1">New:</div>
                      <div className="font-bold text-[#4A3D39]">
                        {term.proposedTranslation}
                      </div>
                    </div>
                  )}
                  {editable && !isExisting && !isConflict && (
                    <>
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
                          Confidence:{" "}
                          {Math.round((term.confidence || 0.5) * 100)}%
                        </span>
                        <span className="text-[9px] tracking-wider text-[#a0908b] uppercase font-sans">
                          | Type: {term.type || "term"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen && !showConflictDialog} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 overflow-hidden bg-[#FBF9F6] border-[#d8cdbd] rounded-sm">
          <DialogHeader className="p-6 bg-[#f2eadc]/40 border-b border-[#d8cdbd]">
            <DialogTitle className="text-2xl font-serif text-[#4A3D39] tracking-tight">
              LEXICOGRAPHER: TERM REVIEW
            </DialogTitle>
            <p className="text-[13px] text-[#807068] italic font-serif mt-1">
              New terminology identified. Refine and approve terms to integrate
              them into future translation passes.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
            <TermSection
              title="NEW TERMS"
              terms={categorized.newTerms}
              editable
              section="new"
            />

            <TermSection
              title="ALREADY IN LIBRARY"
              terms={categorized.existingTerms}
              editable={false}
              section="existing"
            />

            <TermSection
              title="CONFLICTS"
              terms={categorized.conflictTerms}
              editable={false}
              section="conflict"
            />
          </div>

          <DialogFooter className="p-6 bg-[#f2eadc]/20 border-t border-[#d8cdbd] flex flex-row justify-between items-center gap-4">
            <div className="text-[10px] text-[#a0908b] uppercase tracking-[0.2em] font-bold">
              {selectedKeys.size} of{" "}
              {categorized.newTerms.length + categorized.existingTerms.length}{" "}
              EDITABLE
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

      <TermConflictDialog
        isOpen={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        conflicts={categorized.conflictTerms}
        onResolved={handleConflictResolved}
      />
    </>
  );
}
