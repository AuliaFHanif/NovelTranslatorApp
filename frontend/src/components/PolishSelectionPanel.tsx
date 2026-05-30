import { useState, useMemo, useCallback } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { PolishEdit } from "../types/scene";

// --- Types ---

interface PolishSelectionPanelProps {
  edits: PolishEdit[];
  translatedText: string;
  finalText: string;
  onApplyEdits: (appliedEdits: PolishEdit[]) => void;
  onClose: () => void;
}

// --- Category helpers ---

type Category = "Style & Clarity" | "Grammar" | "Terminology" | "Punctuation" | "Other";

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  "Style & Clarity": [
    "style", "clarity", "readability", "flow", "tone", "voice", "natural",
    "awkward", "rephrase", "reword", "smoother", "concise", "verbose",
    "literary", "elegant", "polish", "phrasing", "wordy",
  ],
  Grammar: [
    "grammar", "tense", "subject", "verb", "agreement", "syntax",
    "conjugat", "plural", "singular", "article", "preposition", "modifier",
  ],
  Terminology: [
    "term", "translat", "name", "title", "glossary", "locali",
    "honorific", "meaning", "word choice", "vocabulary", "specific",
  ],
  Punctuation: [
    "punctuat", "comma", "period", "semicolon", "colon", "dash",
    "quote", "quotation", "apostrophe", "ellips", "bracket",
  ],
  Other: [],
};

function categorizeEdit(reason: string): Category {
  const lower = reason.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "Other";
}

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  "Style & Clarity": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  Grammar:           { bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200"  },
  Terminology:       { bg: "bg-sky-50",    text: "text-sky-700",    border: "border-sky-200"    },
  Punctuation:       { bg: "bg-slate-50",  text: "text-slate-600",  border: "border-slate-200"  },
  Other:             { bg: "bg-stone-50",  text: "text-stone-600",  border: "border-stone-200"  },
};

// --- Component ---

export function PolishSelectionPanel({
  edits,
  translatedText,
  finalText: _finalText,
  onApplyEdits,
  onClose,
}: PolishSelectionPanelProps) {
  const [selected, setSelected] = useState<boolean[]>(() => edits.map(() => true));
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const selectedCount = selected.filter(Boolean).length;

  // Group edits by category
  const groupedEdits = useMemo(() => {
    const groups: Record<Category, { edit: PolishEdit; index: number }[]> = {
      "Style & Clarity": [],
      Grammar: [],
      Terminology: [],
      Punctuation: [],
      Other: [],
    };
    edits.forEach((edit, index) => {
      const cat = categorizeEdit(edit.reason);
      groups[cat].push({ edit, index });
    });
    // Filter empty groups
    return Object.entries(groups).filter(([, items]) => items.length > 0) as [
      Category,
      { edit: PolishEdit; index: number }[],
    ][];
  }, [edits]);

  // Compute live preview text
  const previewText = useMemo(() => {
    let result = translatedText;
    edits.forEach((edit, i) => {
      if (selected[i]) {
        result = result.replace(edit.original, edit.replacement);
      }
    });
    return result;
  }, [translatedText, edits, selected]);

  const handleToggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(edits.map(() => true));
  }, [edits]);

  const handleDeselectAll = useCallback(() => {
    setSelected(edits.map(() => false));
  }, [edits]);

  const handleApply = useCallback(() => {
    const appliedEdits = edits.map((edit, i) => ({
      ...edit,
      applied: selected[i],
    }));
    onApplyEdits(appliedEdits);
  }, [edits, selected, onApplyEdits]);

  // Circular progress indicator
  const progressPercent = edits.length > 0 ? (selectedCount / edits.length) * 100 : 0;
  const circleRadius = 14;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  if (!isExpanded) {
    return (
      <div className="flex-0 border-t border-[#d8cdbd] bg-[#f9f7f4]">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-[#f2eadc]/40 transition-all group"
        >
          <div className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
              <circle
                cx="18" cy="18" r={circleRadius}
                fill="none" stroke="#d8cdbd" strokeWidth="2.5"
              />
              <circle
                cx="18" cy="18" r={circleRadius}
                fill="none" stroke="#2f7a46" strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 18 18)"
                className="transition-all duration-500"
              />
              <text
                x="18" y="19" textAnchor="middle" dominantBaseline="middle"
                className="fill-[#4A3D39] text-[9px] font-sans font-bold"
              >
                {selectedCount}
              </text>
            </svg>
            <span className="text-[9px] font-bold uppercase text-[#8B2626] tracking-[0.2em] font-sans">
              Polish Edits
            </span>
            <Badge
              variant="outline"
              className="h-4 text-[7px] border-[#d8cdbd] text-[#807068] px-1.5"
            >
              {selectedCount}/{edits.length} SELECTED
            </Badge>
          </div>
          <span className="text-[9px] text-[#a0908b] group-hover:text-[#4A3D39] transition-colors font-sans uppercase tracking-widest">
            ▲ EXPAND
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-0 border-t border-[#d8cdbd] bg-[#f9f7f4] flex flex-col max-h-[420px] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#d8cdbd]/50 shrink-0">
        <div className="flex items-center gap-3">
          {/* Circular Progress */}
          <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
            <circle
              cx="18" cy="18" r={circleRadius}
              fill="none" stroke="#d8cdbd" strokeWidth="2.5"
            />
            <circle
              cx="18" cy="18" r={circleRadius}
              fill="none" stroke="#2f7a46" strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 18 18)"
              className="transition-all duration-500"
            />
            <text
              x="18" y="19" textAnchor="middle" dominantBaseline="middle"
              className="fill-[#4A3D39] text-[9px] font-sans font-bold"
            >
              {selectedCount}
            </text>
          </svg>

          <div className="flex flex-col gap-0.5">
            <h4 className="text-[9px] font-bold uppercase text-[#8B2626] tracking-[0.2em] font-sans">
              Polish Edits
            </h4>
            <span className="text-[8px] text-[#a0908b] font-sans">
              {edits.length} edit{edits.length !== 1 ? "s" : ""} available, {selectedCount} selected
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Select/Deselect All Toolbar */}
          <div className="flex bg-white/60 rounded-sm border border-[#d8cdbd]/50 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-5 text-[7px] tracking-widest px-2 font-sans uppercase text-[#2f7a46] hover:bg-[#ebf5ed]/60"
            >
              ALL ({edits.length})
            </Button>
            <div className="w-[1px] h-3 bg-[#d8cdbd] self-center mx-0.5" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              className="h-5 text-[7px] tracking-widest px-2 font-sans uppercase text-[#807068] hover:bg-[#f2eadc]/60"
            >
              NONE
            </Button>
          </div>

          {/* Preview Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((p) => !p)}
            className={`h-5 text-[7px] tracking-widest px-2 font-sans uppercase transition-all ${
              showPreview
                ? "text-[#8B2626] bg-[#8B2626]/5"
                : "text-[#a0908b] hover:text-[#4A3D39]"
            }`}
          >
            {showPreview ? "HIDE PREVIEW" : "PREVIEW"}
          </Button>

          {/* Collapse */}
          <button
            onClick={() => setIsExpanded(false)}
            className="text-[9px] text-[#a0908b] hover:text-[#4A3D39] transition-colors font-sans uppercase tracking-widest ml-1"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
        {showPreview ? (
          /* Live Preview */
          <div>
            <div className="text-[8px] font-sans font-bold uppercase tracking-[0.2em] text-[#a0908b] mb-2">
              Live Preview
            </div>
            <div className="bg-white rounded-sm border border-[#d8cdbd]/40 p-4 shadow-sm">
              <div className="text-[13px] font-serif leading-relaxed text-[#4A3D39] whitespace-pre-wrap">
                {previewText}
              </div>
            </div>
          </div>
        ) : (
          /* Category-Grouped Edits */
          <div className="space-y-4">
            {groupedEdits.map(([category, items]) => {
              const colors = CATEGORY_COLORS[category];
              return (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="outline"
                      className={`h-4 text-[7px] px-1.5 font-medium ${colors.bg} ${colors.text} ${colors.border}`}
                    >
                      {category.toUpperCase()}
                    </Badge>
                    <span className="text-[7px] text-[#a0908b] font-sans">
                      {items.filter((it) => selected[it.index]).length}/{items.length}
                    </span>
                    <div className="flex-1 h-[1px] bg-[#d8cdbd]/30" />
                  </div>

                  {/* Edits in this category */}
                  <div className="space-y-2">
                    {items.map(({ edit, index }) => (
                      <div
                        key={index}
                        className={`group rounded-sm border transition-all duration-200 ${
                          selected[index]
                            ? "border-[#d8cdbd] bg-white shadow-sm"
                            : "border-[#d8cdbd]/30 bg-[#f2eadc]/10 opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-3 p-3">
                          {/* Checkbox */}
                          <button
                            onClick={() => handleToggle(index)}
                            className={`mt-0.5 shrink-0 w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all duration-200 ${
                              selected[index]
                                ? "bg-[#2f7a46] border-[#2f7a46]"
                                : "border-[#d8cdbd] hover:border-[#807068] bg-white"
                            }`}
                          >
                            {selected[index] && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path
                                  d="M2 5L4 7L8 3"
                                  stroke="white"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>

                          {/* Side-by-side Diff */}
                          <div className="flex-1 min-w-0">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              {/* Original */}
                              <div className="bg-[#8B2626]/[0.03] rounded-sm p-2 border border-[#8B2626]/10">
                                <div className="text-[7px] font-sans font-bold uppercase tracking-widest text-[#8B2626]/60 mb-1">
                                  Original
                                </div>
                                <div className="text-[11px] font-serif leading-relaxed text-[#4A3D39] line-through decoration-[#8B2626]/40">
                                  {edit.original}
                                </div>
                              </div>

                              {/* Replacement */}
                              <div className="bg-[#2f7a46]/[0.03] rounded-sm p-2 border border-[#2f7a46]/10">
                                <div className="text-[7px] font-sans font-bold uppercase tracking-widest text-[#2f7a46]/60 mb-1">
                                  Replacement
                                </div>
                                <div className="text-[11px] font-serif leading-relaxed text-[#4A3D39]">
                                  {edit.replacement}
                                </div>
                              </div>
                            </div>

                            {/* Reason */}
                            <p className="text-[9px] font-serif italic text-[#807068] leading-relaxed pl-1">
                              {edit.reason}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center px-5 py-2.5 border-t border-[#d8cdbd]/50 shrink-0 bg-[#f2eadc]/20">
        <div className="text-[8px] font-sans text-[#a0908b] tracking-widest uppercase">
          {selectedCount} of {edits.length} edits will be applied
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 text-[9px] tracking-widest text-[#a0908b] hover:text-[#4A3D39] font-sans uppercase px-4"
          >
            Discard All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleApply}
            disabled={selectedCount === 0}
            className="h-7 text-[9px] tracking-widest bg-[#2f7a46] hover:bg-[#1a4d2e] border-none text-white font-sans uppercase px-5 rounded-sm shadow-sm disabled:opacity-40"
          >
            Apply {selectedCount} Edit{selectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
