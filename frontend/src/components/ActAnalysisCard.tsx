import { Badge } from "./ui/badge";

interface AnalysisProps {
  linguistic: any;
  narrative: any;
}

export function ActAnalysisCard({ linguistic, narrative }: AnalysisProps) {
  if (!linguistic && !narrative) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-[#A0908B] italic text-sm text-center border border-dashed border-[#D8CDBD] rounded-sm">
        No analysis data available yet. Run Pass 2 (Analyze) to see details
        here.
      </div>
    );
  }

  const isJa = linguistic?.language === "ja";
  const isZh = linguistic?.language === "zh";
  const topicFrequency =
    isZh && typeof linguistic?.topicProminence?.frequency === "number"
      ? linguistic.topicProminence.frequency
      : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Linguistic Analysis section */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-sans font-bold text-[#8B2626] uppercase tracking-[0.2em] border-b border-[#D8CDBD] pb-1">
          Linguistic Profile
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
              Structure
            </span>
            <div className="text-sm font-serif text-[#4A3D39]">
              <Badge
                variant="outline"
                className="bg-[#F2EADC]/30 border-[#D8CDBD] text-[#8B2626]"
              >
                {linguistic?.sentenceStructure || "Unknown"}
              </Badge>
            </div>
          </div>

          {isJa && (
            <div className="space-y-1">
              <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
                Pro-Drop Frequency
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-[#D8CDBD]/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8B2626]"
                    style={{
                      width: `${(linguistic?.proDrop?.frequency || 0) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-sans text-[#4A3D39]">
                  {Math.round((linguistic?.proDrop?.frequency || 0) * 100)}%
                </span>
              </div>
            </div>
          )}

          {isZh && (
            <div className="space-y-1">
              <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
                Topic Prominence
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-[#D8CDBD]/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#8B2626]"
                    style={{ width: `${(topicFrequency ?? 0) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-sans text-[#4A3D39]">
                  {topicFrequency === null
                    ? "No data"
                    : `${Math.round(topicFrequency * 100)}%`}
                </span>
              </div>
              {topicFrequency === null && (
                <span className="text-[9px] font-sans text-[#A0908B] italic">
                  Awaiting analysis output.
                </span>
              )}
            </div>
          )}
        </div>

        {/* Idioms / Onomatopoeia Tags */}
        <div className="space-y-2">
          <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
            {isJa ? "Onomatopoeia (Sensory)" : "Four-Character Idioms"}
          </span>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {isJa &&
              (linguistic?.onomatopoeia?.gitaigo || []).map(
                (item: any, idx: number) => (
                  <div
                    key={idx}
                    className="px-2 py-1 bg-white border border-[#E8DFCF] rounded-sm text-[#4A3D39] shadow-sm flex flex-col gap-0.5"
                  >
                    <span className="font-bold">{item.term}</span>
                    <span className="text-[9px] text-[#A0908B] italic">
                      {item.meaning}
                    </span>
                  </div>
                ),
              )}
            {isZh &&
              (linguistic?.fourCharacterIdioms || []).map(
                (item: any, idx: number) => (
                  <div
                    key={idx}
                    className="px-2 py-1 bg-white border border-[#E8DFCF] rounded-sm text-[#4A3D39] shadow-sm flex flex-col gap-0.5"
                  >
                    <span className="font-bold">{item.idiom}</span>
                    <span className="text-[9px] text-[#A0908B] italic">
                      {item.contextualMeaning}
                    </span>
                  </div>
                ),
              )}
            {(isJa
              ? linguistic?.onomatopoeia?.gitaigo?.length || 0
              : linguistic?.fourCharacterIdioms?.length || 0) === 0 && (
              <span className="text-[10px] italic text-[#A0908B]">
                None identified.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Narrative Analysis section */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-sans font-bold text-[#8B2626] uppercase tracking-[0.2em] border-b border-[#D8CDBD] pb-1">
          Narrative Dynamics
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
              Pacing (Pattern)
            </span>
            <div className="text-xs font-serif text-[#4A3D39] flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-[#F2EADC]/30 border-[#D8CDBD]"
              >
                {narrative?.pacingPattern || "Mixed"}
              </Badge>
              {narrative?.kuaiMan && (
                <span className="text-[10px] text-[#A0908B]">
                  ({narrative.kuaiMan.dominantPattern})
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
              Emotional Intensity
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-[#D8CDBD]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400"
                  style={{
                    width: `${(narrative?.emotionalIntensity || 0) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-sans text-[#4A3D39]">
                {Math.round((narrative?.emotionalIntensity || 0) * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-[#F2EADC]/20 border border-[#E8DFCF] rounded-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider">
              Primary Emotion
            </span>
            <span className="text-xs font-serif font-bold text-[#8B2626]">
              {narrative?.primaryEmotion || "Neutral"}
            </span>
          </div>
          {isZh && narrative?.faceSystem?.lossOfFaceEvents?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#E8DFCF]/50">
              <span className="text-[9px] font-sans text-[#A0908B] uppercase tracking-wider block mb-1">
                Loss of Face (面子)
              </span>
              <div className="space-y-1">
                {narrative.faceSystem.lossOfFaceEvents.map(
                  (evt: any, i: number) => (
                    <div
                      key={i}
                      className="text-[10px] text-[#4A3D39] flex items-center gap-2"
                    >
                      <span className="text-[#8B2626]">•</span>
                      <span>
                        {evt.type} ({evt.severity})
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          {isJa && narrative?.emotionalTone && (
            <div className="mt-2 pt-2 border-t border-[#E8DFCF]/50 grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 text-[#4A3D39]">
                <span>Intensity:</span>
                <span className="font-bold">
                  {(narrative.emotionalTone.intensity * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[#4A3D39]">
                {narrative.emotionalTone.amae && (
                  <Badge variant="outline" className="h-4 text-[8px]">
                    Amae
                  </Badge>
                )}
                {narrative.emotionalTone.enryo && (
                  <Badge variant="outline" className="h-4 text-[8px]">
                    Enryo
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
