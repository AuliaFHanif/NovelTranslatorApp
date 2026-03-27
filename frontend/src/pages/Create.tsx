import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { createSeries, type SourceLanguage } from "../lib/api";
import { showSuccess, showError } from "../lib/notifications";

export function Create() {
  const [type, setType] = useState<"series" | "standalone">("series");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("xianxia");
  const [language, setLanguage] = useState<SourceLanguage>("zh");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      await showError("Validation Error", "Title is required.");
      return;
    }

    try {
      setIsSubmitting(true);

      await createSeries({
        title: title.trim(),
        language,
        genre,
        description: description.trim() || undefined,
      });

      await showSuccess("Success", "Series created successfully!");
      navigate("/library");
    } catch (submitError) {
      await showError(
        "Failed to Create Series",
        submitError instanceof Error
          ? submitError.message
          : "An unexpected error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <form className="space-y-10" onSubmit={handleSubmit}>
        {/* Type */}
        <div>
          <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
            TYPE
          </label>
          <div className="flex">
            <Button
              type="button"
              variant={type === "series" ? "default" : "outline"}
              className={`${type === "series" ? "bg-[#1a1614] text-white hover:bg-[#2a2422]" : "border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc] bg-transparent"} 
                font-sans text-[10px] tracking-[0.2em] uppercase rounded-r-none h-10 px-8 border-r-0`}
              onClick={() => setType("series")}
            >
              SERIES
            </Button>
            <Button
              type="button"
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
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] text-base h-12"
          />
        </div>

        {/* Genre & Language */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] tracking-[0.2em] text-[#b8a8a0] uppercase font-sans mb-3">
              GENRE
            </label>
            <Select defaultValue="xianxia" onValueChange={setGenre}>
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
            <Select
              defaultValue="zh"
              onValueChange={(value) => setLanguage(value as SourceLanguage)}
            >
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
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="border-[#d8cdbd] rounded-sm bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] font-serif text-[#4A3D39] placeholder:text-[#b8a8a0] min-h-[120px] resize-none text-base p-4"
          />
          <p className="text-[#807068] text-[11px] font-sans mt-3">
            These notes are available as context during translation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="bg-[#8b2626] text-white font-sans tracking-[0.2em] text-[10px] px-6 rounded-sm uppercase h-10 hover:bg-[#701c1c] disabled:bg-[#e8dfcf] disabled:text-[#a0908b] disabled:hover:bg-[#e8dfcf] disabled:opacity-80 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? "CREATING..."
              : type === "series"
                ? "CREATE SERIES"
                : "CREATE STANDALONE"}
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
      </form>
    </main>
  );
}
