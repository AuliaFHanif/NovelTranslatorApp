import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { listSeries, type Series } from "../lib/api";
import { showError } from "../lib/notifications";

export function Library() {
  const [series, setSeries] = useState<Series[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSeries() {
      try {
        setIsLoading(true);
        const data = await listSeries();
        setSeries(data);
      } catch (loadError) {
        await showError(
          "Failed to Load Library",
          loadError instanceof Error
            ? loadError.message
            : "An unexpected error occurred",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadSeries();
  }, []);

  const filteredSeries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return series;
    }

    return series.filter((entry) => {
      const fields = [entry.title, entry.genre, entry.description].filter(
        Boolean,
      ) as string[];
      return fields.some((value) => value.toLowerCase().includes(query));
    });
  }, [search, series]);

  function formatLanguage(value: Series["language"]): string {
    return value === "zh" ? "中文" : "日本語";
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <main className="flex-1 w-full max-w-6xl px-8 mt-32 mx-auto">
      <div className="flex justify-between items-end mb-6">
        <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide">
          LIBRARY
        </h1>
      </div>

      <hr className="border-t border-[#d8cdbd] mb-8" />

      <div className="flex flex-wrap items-center gap-6 mb-12">
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#807068] opacity-70" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9 rounded-sm border-[#d8cdbd] bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] text-[#4A3D39] placeholder:text-[#a0908b] font-sans h-10"
          />
        </div>

        <Badge className="bg-[#2a2422] hover:bg-[#1a1614] text-white rounded-full px-5 py-1.5 font-sans text-[9px] tracking-[0.2em] uppercase cursor-default font-normal border-none">
          BACKEND CONNECTED
        </Badge>
      </div>

      <div className="text-[10px] tracking-[0.3em] text-[#807068] mb-6 uppercase font-sans opacity-80">
        {isLoading
          ? "LOADING..."
          : `${filteredSeries.length} WORK${filteredSeries.length === 1 ? "" : "S"}`}
      </div>

      {!isLoading && filteredSeries.length === 0 && (
        <p className="text-[#807068] font-serif italic mb-6">
          No series found. Create your first translation project.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSeries.map((entry) => (
          <Link to={`/series/${entry.id}`} key={entry.id}>
            <Card className="border-[#d8cdbd] rounded-xl p-6 bg-[#FBF9F6] shadow-sm hover:shadow-md transition-shadow relative cursor-pointer group">
              <div className="flex justify-between items-start mb-8">
                <Badge className="bg-[#e8dfcf] text-[#5c504b] hover:bg-[#e8dfcf] border border-[#d8cdbd] rounded-full px-3 py-1 text-[8px] tracking-[0.2em] uppercase font-sans font-normal shadow-none">
                  {entry.genre || "General"}
                </Badge>
                <span className="text-sm text-[#5c504b] font-serif">
                  {formatLanguage(entry.language)}
                </span>
              </div>

              <h3 className="text-2xl font-serif text-[#2a2422] font-semibold mb-4 group-hover:text-[#8b2626] transition-colors">
                {entry.title}
              </h3>

              <p className="text-xs text-[#807068] font-serif italic mb-4 line-clamp-2 min-h-8">
                {entry.description || "No series description."}
              </p>

              <div className="border-t border-[#d8cdbd] pt-4 flex justify-between items-center opacity-80">
                <span className="text-[9px] tracking-[0.3em] text-[#807068] uppercase font-sans">
                  SERIES
                </span>
                <span className="text-[9px] tracking-[0.1em] text-[#807068] font-sans">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
