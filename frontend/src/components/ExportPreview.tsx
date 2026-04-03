import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Download, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface TextSegment {
  id: number;
  subActId: number;
  sequence: number;
  text: string;
  source: "act_polish" | "subact_polish" | "translation";
  polishReason?: string;
}

interface ExportPreviewProps {
  segments: TextSegment[];
  actLabel: string;
  chapterNumber: number;
  onExport: () => Promise<void>;
  isExporting?: boolean;
}

export function ExportPreview({
  segments,
  actLabel,
  chapterNumber,
  onExport,
  isExporting = false,
}: ExportPreviewProps) {
  const [showExpanded, setShowExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const finalText = segments.map((s) => s.text).join("\n\n");

  const sourceStats = {
    actPolish: segments.filter((s) => s.source === "act_polish").length,
    subActPolish: segments.filter((s) => s.source === "subact_polish").length,
    translation: segments.filter((s) => s.source === "translation").length,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(finalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSourceColor = (source: TextSegment["source"]) => {
    const colors = {
      act_polish: "bg-[#E8D7CA] border-l-4 border-[#8B2626]",
      subact_polish: "bg-[#F2EADC] border-l-4 border-[#C97070]",
      translation: "bg-[#FBF8F3] border-l-4 border-[#D8CDBD]",
    };
    return colors[source];
  };

  const getSourceLabel = (source: TextSegment["source"]) => {
    const labels = {
      act_polish: "Act Polish",
      subact_polish: "SubAct Polish",
      translation: "Translation",
    };
    return labels[source];
  };

  const getSourceBadgeColor = (source: TextSegment["source"]) => {
    const colors = {
      act_polish: "bg-[#8B2626] text-white",
      subact_polish: "bg-[#C97070] text-white",
      translation: "bg-[#D8CDBD] text-[#4A3D39]",
    };
    return colors[source];
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <Card className="border-[#D8CDBD] bg-gradient-to-r from-[#F2EADC]/50 to-[#FBF8F3] p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-serif font-semibold text-[#4A3D39]">
              Chapter {chapterNumber}, Act {actLabel}
            </h3>
            <p className="text-xs text-[#A0908B] mt-1">
              Final export preview with applied polish
            </p>
          </div>
          <Badge
            variant="outline"
            className="bg-white border-[#D8CDBD] text-[#8B2626]"
          >
            {segments.length} segments
          </Badge>
        </div>

        {/* Polish composition stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {sourceStats.actPolish > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-[#8B2626]" />
              <span className="text-[#4A3D39]">
                {sourceStats.actPolish} Act Polish
              </span>
            </div>
          )}
          {sourceStats.subActPolish > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-[#C97070]" />
              <span className="text-[#4A3D39]">
                {sourceStats.subActPolish} SubAct Polish
              </span>
            </div>
          )}
          {sourceStats.translation > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-[#D8CDBD]" />
              <span className="text-[#4A3D39]">
                {sourceStats.translation} Raw
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Legend */}
      <Card className="border-[#D8CDBD] bg-[#FBF8F3] p-3">
        <div className="space-y-2">
          <p className="text-xs font-sans font-semibold text-[#8B2626] uppercase tracking-wider">
            Polish hierarchy
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 mt-0.5 flex-shrink-0 bg-[#8B2626] border-l-4 border-[#8B2626]" />
              <div>
                <p className="font-semibold text-[#8B2626]">Act Polish</p>
                <p className="text-[#A0908B]">Highest priority</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 mt-0.5 flex-shrink-0 bg-[#F2EADC] border-l-4 border-[#C97070]" />
              <div>
                <p className="font-semibold text-[#C97070]">SubAct Polish</p>
                <p className="text-[#A0908B]">Segment override</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 mt-0.5 flex-shrink-0 bg-[#FBF8F3] border-l-4 border-[#D8CDBD]" />
              <div>
                <p className="font-semibold text-[#8B7B76]">Translation</p>
                <p className="text-[#A0908B]">Fallback</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Preview content */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-serif font-semibold text-[#4A3D39]">
            Preview
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExpanded(!showExpanded)}
            className="text-[#8B2626] text-xs"
          >
            {showExpanded ? (
              <>
                <EyeOff size={14} className="mr-1" />
                Collapse
              </>
            ) : (
              <>
                <Eye size={14} className="mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>

        {showExpanded ? (
          // Expanded view: Show each segment color-coded
          <div className="space-y-2 max-h-96 overflow-y-auto bg-white border border-[#D8CDBD] rounded-sm p-3">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className={`p-3 rounded-sm ${getSourceColor(segment.source)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge
                    className={`text-xs ${getSourceBadgeColor(segment.source)}`}
                  >
                    {getSourceLabel(segment.source)}
                  </Badge>
                  <span className="text-xs text-[#A0908B]">
                    Seg. {segment.sequence}
                  </span>
                </div>
                {segment.polishReason && (
                  <p className="text-xs text-[#8B2626] font-semibold mb-1">
                    Focus: {segment.polishReason}
                  </p>
                )}
                <p className="text-sm font-serif text-[#4A3D39] leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {segment.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          // Collapsed view: Full text with subtle background
          <Card className="border-[#D8CDBD] bg-white p-4">
            <p className="text-sm font-serif text-[#4A3D39] leading-relaxed whitespace-pre-wrap line-clamp-8">
              {finalText}
            </p>
            <p className="text-xs text-[#A0908B] mt-2">
              {finalText.length} characters |{" "}
              {Math.ceil(finalText.split(" ").length / 4.7)} estimated tokens
            </p>
          </Card>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleCopy}
          className="border-[#D8CDBD] text-[#8B2626] hover:bg-[#F2EADC]/50 flex items-center gap-1"
        >
          <Copy size={14} />
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
        <Button
          onClick={onExport}
          disabled={isExporting}
          className="ml-auto bg-[#8B2626] text-white hover:bg-[#6B1616] flex items-center gap-1"
        >
          <Download size={14} />
          {isExporting ? "Exporting..." : "Export Final"}
        </Button>
      </div>

      {/* Info about composition */}
      <Card className="border-[#D8CDBD] bg-[#FBF8F3]/50 p-3 text-xs text-[#A0908B]">
        <p>
          <strong>Polish hierarchy:</strong> Each SubAct uses SubAct polish if
          available, otherwise falls back to Act polish, otherwise raw
          translation. This ensures granular control while maintaining
          consistency.
        </p>
      </Card>
    </div>
  );
}
