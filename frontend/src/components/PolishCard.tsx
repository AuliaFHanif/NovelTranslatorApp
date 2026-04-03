import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CheckCircle2, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface PolishCardProps {
  polish: {
    id: number;
    originalText: string;
    polishedText: string;
    reason: string;
    modelUsed: string;
    isSelected: boolean;
    scope: "act" | "subact";
  };
  onSelect: (polishId: number) => void;
  isLoading?: boolean;
}

export function PolishCard({
  polish,
  onSelect,
  isLoading = false,
}: PolishCardProps) {
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);

  const previewLength = 400;
  const shouldShowExpand = polish.polishedText.length > previewLength;
  const displayText = showFull
    ? polish.polishedText
    : polish.polishedText.slice(0, previewLength);

  const handleCopy = () => {
    navigator.clipboard.writeText(polish.polishedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelect = () => {
    onSelect(polish.id);
  };

  return (
    <Card className="border-[#D8CDBD] bg-gradient-to-br from-[#F2EADC]/50 to-[#FBF8F3] p-4 space-y-3 hover:shadow-md transition-shadow">
      {/* Header: Reason & Score Badge */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-sans text-[#A0908B] uppercase tracking-wider">
            Variation Focus
          </p>
          <p className="text-sm font-serif text-[#4A3D39] font-semibold">
            {polish.reason || "Polish variation"}
          </p>
        </div>
        {polish.isSelected && (
          <Badge className="bg-[#8B2626] text-white flex items-center gap-1">
            <CheckCircle2 size={12} />
            Selected
          </Badge>
        )}
      </div>

      {/* Scope Badge */}
      <div className="flex gap-2">
        <Badge
          variant="outline"
          className="bg-[#F2EADC]/30 border-[#D8CDBD] text-[#8B2626] text-xs"
        >
          {polish.scope === "act" ? "Act-Level" : "SubAct-Level"}
        </Badge>
        <Badge
          variant="outline"
          className="bg-[#F2EADC]/30 border-[#D8CDBD] text-[#8B2626] text-xs"
        >
          {polish.modelUsed.split("/").pop() || "AI Model"}
        </Badge>
      </div>

      {/* Polish Text Preview */}
      <div className="bg-white rounded-sm p-3 border border-[#E5DDD3] min-h-24 max-h-40 overflow-y-auto">
        <p className="text-sm font-serif text-[#4A3D39] leading-relaxed whitespace-pre-wrap">
          {displayText}
          {shouldShowExpand && !showFull && (
            <span className="text-[#A0908B]">…</span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {shouldShowExpand && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFull(!showFull)}
            className="border-[#D8CDBD] text-[#8B2626] hover:bg-[#F2EADC]/50 flex items-center gap-1"
          >
            {showFull ? (
              <>
                <EyeOff size={14} />
                Collapse
              </>
            ) : (
              <>
                <Eye size={14} />
                Expand
              </>
            )}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="border-[#D8CDBD] text-[#8B2626] hover:bg-[#F2EADC]/50 flex items-center gap-1"
        >
          <Copy size={14} />
          {copied ? "Copied" : "Copy"}
        </Button>

        <Button
          onClick={handleSelect}
          disabled={isLoading}
          className={`ml-auto ${
            polish.isSelected
              ? "bg-[#8B2626] text-white hover:bg-[#6B1616]"
              : "bg-[#D8CDBD] text-[#4A3D39] hover:bg-[#C9BDB2]"
          }`}
        >
          {polish.isSelected ? "Selected" : "Select"}
        </Button>
      </div>
    </Card>
  );
}
