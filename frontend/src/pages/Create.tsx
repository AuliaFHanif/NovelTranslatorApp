import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

export function Create() {
  const [type, setType] = useState<"series" | "standalone">("series");

  return (
    <main className="flex-1 w-full max-w-3xl px-8 mt-32 mx-auto pb-24">
      <div className="mb-8">
        <Link
          to="/library"
          className="text-[#a0908b] hover:text-[#4A3D39] text-[10px] tracking-[0.2em] font-sans uppercase flex items-center gap-2 w-fit transition-colors"
        >
          &larr; LIBRARY
        </Link>
      </div>

      <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide mb-8">
        NEW TRANSLATION
      </h1>

      <hr className="border-t border-[#d8cdbd] mb-10" />

      <div className="space-y-10">
        {/* Type */}
        <div>
          <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            TYPE
          </label>
          <div className="flex">
            <Button
              variant={type === "series" ? "default" : "outline"}
              className={`${type === "series" ? "bg-[#1a1614] text-white hover:bg-[#2a2422]" : "border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] bg-transparent"} 
                font-sans text-[10px] tracking-[0.2em] uppercase rounded-r-none h-10 px-8 border-r-0`}
              onClick={() => setType("series")}
            >
              SERIES
            </Button>
            <Button
              variant={type === "standalone" ? "default" : "outline"}
              className={`${type === "standalone" ? "bg-[#1a1614] text-white hover:bg-[#2a2422]" : "border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] bg-transparent"} 
                font-sans text-[10px] tracking-[0.2em] uppercase rounded-l-none h-10 px-8`}
              onClick={() => setType("standalone")}
            >
              STANDALONE
            </Button>
          </div>
          <p className="text-[#807068] text-xs italic font-serif mt-3 opacity-90">
            {type === "series"
              ? "An ongoing series with multiple chapters that you can add over time."
              : "A standalone text with a single chapter."}
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            TITLE *
          </label>
          <Input
            placeholder="Series title..."
            className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] text-base h-12"
          />
        </div>

        {/* Genre & Language */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
              GENRE
            </label>
            <Select defaultValue="xianxia">
              <SelectTrigger className="w-full border-[#d8cdbd] rounded-sm bg-transparent focus:ring-1 focus:ring-[#8b2626] font-serif text-[#4A3D39] h-12">
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent className="bg-[#FBF9F6] border-[#d8cdbd] font-serif">
                <SelectItem value="xianxia">Xianxia</SelectItem>
                <SelectItem value="wuxia">Wuxia</SelectItem>
                <SelectItem value="isekai">Isekai</SelectItem>
                <SelectItem value="dark-fantasy">Dark Fantasy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
              SOURCE LANGUAGE
            </label>
            <Select defaultValue="zh">
              <SelectTrigger className="w-full border-[#d8cdbd] rounded-sm bg-transparent focus:ring-1 focus:ring-[#8b2626] font-serif text-[#4A3D39] h-12">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent className="bg-[#FBF9F6] border-[#d8cdbd] font-serif">
                <SelectItem value="zh">中文 — Chinese</SelectItem>
                <SelectItem value="ja">日本語 — Japanese</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Universe Notes */}
        <div>
          <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            UNIVERSE NOTES
          </label>
          <Textarea
            placeholder="World-building notes, cultivation system, recurring themes..."
            className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] min-h-[120px] resize-none text-base p-4"
          />
          <p className="text-[#807068] text-[11px] font-sans mt-3">
            These notes are available as context during translation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Button
            disabled
            className="bg-[#e8dfcf] text-[#a0908b] font-sans tracking-[0.2em] text-[10px] px-6 rounded-sm uppercase h-10 hover:bg-[#e8dfcf] opacity-80 cursor-not-allowed"
          >
            CREATE SERIES
          </Button>
          <Link to="/library">
            <Button
              variant="outline"
              className="border-[#d8cdbd] font-sans text-[#a0908b] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-6 text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent h-10"
            >
              CANCEL
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
