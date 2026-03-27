import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

export function ContextLibrary() {
  const [scope, setScope] = useState<"series" | "chapter">("chapter");

  const entries = [
    { source: "专属客服", translation: "" },
    { source: "刑渊", translation: "" },
    { source: "白枫", translation: "" },
    { source: "王菌群", translation: "" },
    { source: "日本", translation: "" },
    { source: "修罗班", translation: "" },
    { source: "幽灵之血", translation: "" },
    { source: "小姐", translation: "" },
  ];

  return (
    <main className="flex-1 w-full max-w-5xl px-8 mt-32 mx-auto pb-24">
      <div className="mb-6">
        <Link
          to="/translation"
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
        >
          &larr; RENQUE
        </Link>
      </div>

      <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide mb-2">
        CONTEXT LIBRARY
      </h1>
      <p className="text-[#807068] italic font-serif mb-8">Renque</p>

      {/* Info Box */}
      <div className="bg-[#f2eadc]/60 border border-[#d8cdbd] rounded-sm p-6 mb-8 text-[13px] leading-relaxed font-serif text-[#5c504b]">
        Context entries are injected into every{" "}
        <strong>translation prompt</strong> for this series.{" "}
        <strong>Series context</strong> applies to all chapters.{" "}
        <strong>Chapter context</strong> is scoped to a specific chapter &mdash;
        useful for temporary overrides and Pass 1 extractions. Entries added
        here use{" "}
        <strong>
          source word &rarr; <span className="italic">English rendering</span>
        </strong>{" "}
        format.
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10 pb-4 border-b border-[#d8cdbd]">
        <div className="flex items-center gap-6">
          <div className="flex">
            <Button
              variant={scope === "series" ? "default" : "outline"}
              className={`${scope === "series" ? "bg-[#1a1614] text-white hover:bg-[#2a2422]" : "border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] bg-transparent"} 
                font-sans text-[10px] tracking-[0.2em] uppercase rounded-r-none h-9 px-6 border-r-0`}
              onClick={() => setScope("series")}
            >
              SERIES
            </Button>
            <Button
              variant={scope === "chapter" ? "default" : "outline"}
              className={`${scope === "chapter" ? "bg-[#1a1614] text-white hover:bg-[#2a2422]" : "border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] bg-transparent"} 
                font-sans text-[10px] tracking-[0.2em] uppercase rounded-l-none h-9 px-6`}
              onClick={() => setScope("chapter")}
            >
              CHAPTER
            </Button>
          </div>

          {scope === "chapter" && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                CHAPTER
              </span>
              <Select defaultValue="1">
                <SelectTrigger className="w-16 h-9 border-[#d8cdbd] rounded-sm bg-transparent focus:ring-1 focus:ring-[#8b2626] font-sans text-[10px]">
                  <SelectValue placeholder="1" />
                </SelectTrigger>
                <SelectContent className="bg-[#FBF9F6] border-[#d8cdbd]">
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c8a080]"></div>
            <span className="text-[10px] tracking-[0.2em] font-sans text-[#c8a080] uppercase">
              ANALYSED
            </span>
          </div>

          <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
            91 ENTRIES
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-4 h-9 text-[9px] tracking-[0.1em] uppercase transition-all bg-transparent font-sans"
          >
            PROMOTE ALL &rarr; SERIES
          </Button>
          <Button
            variant="outline"
            className="border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-4 h-9 text-[9px] tracking-[0.1em] uppercase transition-all bg-transparent font-sans"
          >
            OPEN IN EDITOR &nearr;
          </Button>
          <Button
            variant="outline"
            className="border-[#d8cdbd] text-[#c68080] hover:bg-[#ffeaea] hover:text-[#a04040] rounded-sm px-4 h-9 text-[9px] tracking-[0.1em] uppercase transition-all bg-transparent font-sans"
          >
            CLEAR ALL
          </Button>
        </div>
      </div>

      {/* Dictionary Section */}
      <div className="w-full border border-[#d8cdbd] rounded-sm bg-[#FBF9F6] overflow-hidden">
        {/* Section Header */}
        <div className="bg-[#f2eadc]/40 px-6 py-4 flex justify-between items-center border-b border-[#d8cdbd] cursor-pointer hover:bg-[#f2eadc]/60 transition-colors">
          <div className="flex items-center gap-4">
            <span className="text-[11px] tracking-[0.3em] font-sans text-[#c8a080] uppercase font-semibold">
              CHARACTERS
            </span>
            <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
              13 ENTRIES
            </span>
          </div>
          <span className="text-[8px] text-[#4A3D39]">&#9650;</span>
        </div>

        {/* Table Structure */}
        <div className="p-6 pt-4">
          <div className="flex text-[9px] tracking-[0.2em] font-sans text-[#a0908b] uppercase mb-4 pb-2 border-b border-[#e8dfcf] px-2">
            <div className="w-1/3">SOURCE</div>
            <div className="flex-1">TRANSLATION / RENDERING</div>
          </div>

          <div className="flex flex-col gap-1">
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center text-sm font-serif px-2 py-3 hover:bg-[#f2eadc]/30 rounded-sm transition-colors group"
              >
                <div className="w-1/3 text-[#4A3D39]">{entry.source}</div>
                <div className="flex-1 flex items-center gap-6 text-[#a0908b]">
                  <span className="text-[#d8cdbd] text-xs font-sans">
                    &rarr;
                  </span>
                  <input
                    type="text"
                    placeholder="translation / rendering"
                    defaultValue={entry.translation}
                    className="bg-transparent border-none outline-none focus:ring-0 w-full text-[#a0908b] placeholder:text-[#d0c0b8] placeholder:italic"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
