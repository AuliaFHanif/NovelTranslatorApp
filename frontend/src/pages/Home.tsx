import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router-dom";

export function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-4 mt-6 pt-32">
      <div className="flex items-center justify-center w-full max-w-[400px] mb-12 opacity-60">
        <div className="flex-1 border-t border-[#d8cdbd]"></div>
        <span className="mx-6 tracking-[0.3em] font-sans text-[9px] uppercase text-[#887870]">
          Literary Translation Studio
        </span>
        <div className="flex-1 border-t border-[#d8cdbd]"></div>
      </div>

      <div className="mb-10 text-center w-full flex flex-col items-center">
        <h1 className="text-[#8b2626] text-[140px] font-normal tracking-wide mb-14 leading-none font-serif">
          東西
        </h1>

        <div className="relative flex items-center justify-center w-full max-w-[500px] mx-auto opacity-70">
          <div className="absolute w-full border-t border-[#d8cdbd]"></div>
          <span className="bg-[#FBF9F6] px-8 tracking-[0.4em] font-sans text-[10px] text-[#887870] uppercase z-10">
            Web Novel Translator
          </span>
        </div>
      </div>

      <p
        className="text-center max-w-[500px] mb-12 text-[#5c504b] leading-8 italic text-lg mx-auto"
        style={{ fontFamily: "Georgia, serif" }}
      >
        Two-pass AI translation for Chinese and Japanese web novels — with
        genre-aware prompting, series context, and a full chapter archive.
      </p>

      <div className="flex gap-4 mb-20 justify-center">
        <Link to="/create">
          <Button className="bg-[#8b2626] hover:bg-[#701c1c] font-sans text-white rounded-sm px-8 py-6 text-[10px] tracking-[0.2em] uppercase transition-all shadow-sm h-12">
            Start New Translation
          </Button>
        </Link>
        <Link to="/library">
          <Button
            variant="outline"
            className="border-[#d8cdbd] font-sans text-[#786860] hover:bg-[#f2eadc] hover:text-[#4A3D39] rounded-sm px-8 py-6 text-[10px] tracking-[0.2em] uppercase transition-all bg-transparent h-12"
          >
            View Library
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap justify-center gap-3 opacity-70 max-w-[500px] mx-auto">
        {["Xianxia", "Wuxia", "Isekai", "Dark Fantasy", "Romance", "Pulp"].map(
          (genre) => (
            <Badge
              key={genre}
              variant="outline"
              className="rounded-full border-[#d8cdbd] text-[#807068] px-5 py-1.5 text-[9px] font-sans tracking-[0.25em] uppercase hover:bg-[#f2eadc] hover:text-[#4A3D39] transition-colors cursor-default bg-transparent font-normal"
            >
              {genre}
            </Badge>
          ),
        )}
      </div>
    </main>
  );
}
