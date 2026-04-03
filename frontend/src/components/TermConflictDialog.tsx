import { useState } from "react";
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
import type { ConflictedTerm, ConflictResolution } from "../lib/api";
import { resolveTermConflicts } from "../lib/api";
import { showSuccess, showError } from "../lib/notifications";

interface TermConflictDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictedTerm[];
  onResolved?: (
    resolved: Array<
      ConflictedTerm & {
        resolution: "keep_existing" | "merge" | "create_variant";
      }
    >,
  ) => void;
}

export function TermConflictDialog({
  isOpen,
  onOpenChange,
  conflicts,
  onResolved,
}: TermConflictDialogProps) {
  const [searchParams] = useSearchParams();
  const seriesId = Number(searchParams.get("seriesId") || "0");

  const [resolutions, setResolutions] = useState<
    Record<string, "keep_existing" | "merge" | "create_variant">
  >({});
  const [variantTexts, setVariantTexts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getConflictKey = (conflict: ConflictedTerm) =>
    `${conflict.term}|${conflict.type}`;

  const handleResolutionChange = (
    key: string,
    resolution: "keep_existing" | "merge" | "create_variant",
  ) => {
    setResolutions((prev) => ({
      ...prev,
      [key]: resolution,
    }));
  };

  const handleVariantChange = (key: string, value: string) => {
    setVariantTexts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyResolutions = async () => {
    if (!seriesId) {
      showError("Series Error", "Missing series identification.");
      return;
    }

    setIsSubmitting(true);
    try {
      const resolutionList: ConflictResolution[] = conflicts.map((conflict) => {
        const key = getConflictKey(conflict);
        return {
          existingId: conflict.existingId as number,
          term: conflict.term,
          resolution: (resolutions[key] || "keep_existing") as
            | "keep_existing"
            | "merge"
            | "create_variant",
          termEn: conflict.proposedTranslation || conflict.existingTranslation,
          variantForm: variantTexts[key],
          appearances: conflict.appearances || [],
        };
      });

      const result = await resolveTermConflicts(seriesId, resolutionList);

      const summary = `Resolved ${result.processed} conflicts: ${result.kept} kept, ${result.merged} merged, ${result.created_variants} variants created`;
      void showSuccess("Conflicts Resolved", summary);

      if (onResolved) {
        const resolved = conflicts.map((conflict) => ({
          ...conflict,
          resolution: (resolutions[getConflictKey(conflict)] ||
            "keep_existing") as "keep_existing" | "merge" | "create_variant",
        }));
        onResolved(resolved);
      }

      onOpenChange(false);
    } catch (error) {
      void showError(
        "Resolution Failed",
        error instanceof Error ? error.message : "Error resolving conflicts.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col p-0 overflow-hidden bg-[#FBF9F6] border-[#d8cdbd] rounded-sm">
        <DialogHeader className="p-6 bg-[#f2eadc]/40 border-b border-[#d8cdbd]">
          <DialogTitle className="text-2xl font-serif text-[#4A3D39] tracking-tight">
            TERM CONFLICTS DETECTED
          </DialogTitle>
          <p className="text-[13px] text-[#807068] italic font-serif mt-1">
            {conflicts.length} term(s) already exist in the library with
            different translations. Choose how to resolve each conflict.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {conflicts.map((conflict) => {
            const key = getConflictKey(conflict);
            const resolution = resolutions[key] || "keep_existing";

            return (
              <div
                key={key}
                className="border border-[#e8dfcf] rounded-sm p-4 bg-white hover:bg-[#faf8f4] transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-[#4A3D39] mb-1">
                      {conflict.term}
                      <span className="text-xs text-[#a0908b] ml-2 tracking-wider uppercase">
                        ({conflict.type})
                      </span>
                    </div>
                    <div className="text-xs text-[#a0908b] italic mb-2">
                      {conflict.appearances?.[0]?.context ||
                        "No specific context sample extracted."}
                    </div>
                  </div>
                </div>

                <div className="bg-[#f2eadc]/20 border-l-2 border-[#8b2626] p-3 mb-3 rounded-sm">
                  <div className="text-xs text-[#a0908b] uppercase tracking-wider font-bold mb-1">
                    Existing Translation
                  </div>
                  <div className="text-sm font-serif text-[#4A3D39]">
                    {conflict.existingTranslation || "Not set"}
                  </div>
                  <div className="text-xs text-[#a0908b] mt-1">
                    Status: {conflict.existingStatus} • Confidence:{" "}
                    {Math.round((conflict.confidence || 0) * 100)}%
                  </div>
                </div>

                <div className="bg-[#f2eadc]/10 border-l-2 border-[#807068] p-3 mb-4 rounded-sm">
                  <div className="text-xs text-[#a0908b] uppercase tracking-wider font-bold mb-1">
                    New Candidate
                  </div>
                  <div className="text-sm font-serif text-[#4A3D39]">
                    {conflict.proposedTranslation || conflict.termEn}
                  </div>
                  <div className="text-xs text-[#a0908b] mt-1">
                    Confidence: {Math.round((conflict.confidence || 0.5) * 100)}
                    %
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 rounded-sm hover:bg-[#f2eadc]/20 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${key}`}
                      value="keep_existing"
                      checked={resolution === "keep_existing"}
                      onChange={(e) =>
                        handleResolutionChange(
                          key,
                          e.target.value as "keep_existing",
                        )
                      }
                      className="w-4 h-4 border-[#d8cdbd] accent-[#8b2626]"
                    />
                    <span className="text-sm text-[#4A3D39]">
                      <span className="font-bold">Keep existing</span>
                      <span className="text-xs text-[#a0908b] ml-2">
                        (discard new candidate)
                      </span>
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded-sm hover:bg-[#f2eadc]/20 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${key}`}
                      value="merge"
                      checked={resolution === "merge"}
                      onChange={(e) =>
                        handleResolutionChange(key, e.target.value as "merge")
                      }
                      className="w-4 h-4 border-[#d8cdbd] accent-[#8b2626]"
                    />
                    <span className="text-sm text-[#4A3D39]">
                      <span className="font-bold">Use new translation</span>
                      <span className="text-xs text-[#a0908b] ml-2">
                        (update existing term)
                      </span>
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-2 rounded-sm hover:bg-[#f2eadc]/20 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${key}`}
                      value="create_variant"
                      checked={resolution === "create_variant"}
                      onChange={(e) =>
                        handleResolutionChange(
                          key,
                          e.target.value as "create_variant",
                        )
                      }
                      className="w-4 h-4 border-[#d8cdbd] accent-[#8b2626]"
                    />
                    <span className="text-sm text-[#4A3D39]">
                      <span className="font-bold">Create as variant</span>
                      <span className="text-xs text-[#a0908b] ml-2">
                        (add as alternate form)
                      </span>
                    </span>
                  </label>

                  {resolution === "create_variant" && (
                    <div className="ml-7 mt-2">
                      <Input
                        placeholder="Variant form (optional)"
                        value={variantTexts[key] || ""}
                        onChange={(e) =>
                          handleVariantChange(key, e.target.value)
                        }
                        className="h-8 text-sm bg-white border-[#d8cdbd]"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="p-6 bg-[#f2eadc]/20 border-t border-[#d8cdbd] flex flex-row justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-10 px-8 text-[10px] tracking-[0.2em] font-sans uppercase rounded-sm border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc]/40 hover:text-[#4A3D39]"
          >
            Discard
          </Button>
          <Button
            onClick={() => void handleApplyResolutions()}
            disabled={isSubmitting}
            className="h-10 px-8 bg-[#8b2626] hover:bg-[#701c1c] text-white text-[10px] tracking-[0.2em] font-sans uppercase rounded-sm border-none shadow-sm"
          >
            {isSubmitting ? "Applying..." : "Apply Resolutions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
