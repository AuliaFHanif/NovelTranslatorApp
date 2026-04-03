import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { RefreshCw, AlertCircle } from "lucide-react";

interface PolishSelectorProps {
  actPolishes?: Array<{
    id: number;
    reason: string;
    isSelected: boolean;
  }>;
  onGeneratePolishes: (count?: number) => Promise<void>;
  onSelectActPolish: (polishId: number) => void;
  isGenerating?: boolean;
}

export function PolishSelector({
  actPolishes = [],
  onGeneratePolishes,
  onSelectActPolish,
  isGenerating = false,
}: PolishSelectorProps) {
  const selectedPolish = actPolishes.find((p) => p.isSelected);

  const handleGeneratePolishes = async () => {
    await onGeneratePolishes(3);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h4 className="text-sm font-serif font-semibold text-[#4A3D39]">
          Polish Variations
        </h4>
        <p className="text-xs text-[#A0908B] mt-1">
          Generate multiple polish options and select your preferred version
        </p>
      </div>

      {/* Generate Button */}
      {actPolishes.length === 0 ? (
        <Card className="border-[#D8CDBD] bg-[#FBF8F3]/50 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto text-[#A0908B]" size={32} />
          <div>
            <h4 className="text-sm font-serif font-semibold text-[#4A3D39]">
              No polish generated yet
            </h4>
            <p className="text-xs text-[#A0908B] mt-1">
              Generate variations to improve the translation quality
            </p>
          </div>
          <Button
            onClick={handleGeneratePolishes}
            disabled={isGenerating}
            className="bg-[#8B2626] text-white hover:bg-[#6B1616] mx-auto"
          >
            {isGenerating ? (
              <>
                <RefreshCw size={14} className="mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Polish Variations (3)"
            )}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-serif font-semibold text-[#4A3D39]">
              Available Variations
            </h5>
            <Badge className="bg-[#8B2626] text-white">
              {actPolishes.length} options
            </Badge>
          </div>

          {/* Currently Selected */}
          {selectedPolish && (
            <div className="bg-[#E8DECC]/30 border border-[#D8CDBD] rounded-sm p-3">
              <p className="text-xs font-sans font-semibold text-[#8B2626] uppercase tracking-wider">
                ✓ Currently Selected
              </p>
              <p className="text-sm font-serif text-[#4A3D39]">
                {selectedPolish.reason}
              </p>
            </div>
          )}

          {/* Polish Variation Cards */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {actPolishes.map((polish) => (
              <Card
                key={polish.id}
                className={`border p-3 cursor-pointer transition-all ${
                  polish.isSelected
                    ? "border-[#8B2626] bg-[#F2EADC]/50"
                    : "border-[#D8CDBD] bg-[#FBF8F3] hover:bg-[#F2EADC]/30"
                }`}
                onClick={() => onSelectActPolish(polish.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-serif font-semibold text-[#4A3D39]">
                      {polish.reason}
                    </p>
                  </div>
                  {polish.isSelected && (
                    <div className="text-[#8B2626] font-bold text-lg">✓</div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Regenerate Button */}
          <Button
            variant="outline"
            onClick={handleGeneratePolishes}
            disabled={isGenerating}
            className="w-full border-[#D8CDBD] text-[#8B2626] hover:bg-[#F2EADC]/50"
          >
            {isGenerating ? "Generating..." : "Regenerate Variations"}
          </Button>
        </div>
      )}

      {/* Info Section */}
      <Card className="border-[#D8CDBD] bg-[#F2EADC]/20 p-3">
        <p className="text-xs font-sans text-[#A0908B]">
          <strong>Tip:</strong> Polish variations are generated in a single LLM
          call for efficiency. Each variation offers a different approach to
          refining your translation.
        </p>
      </Card>
    </div>
  );
}
