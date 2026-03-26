import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Editor from "../components/Editor";
import SeriesSelector from "../components/SeriesSelector";

export default function Translate() {
  const navigate = useNavigate();
  const [rawText, setRawText] = useState("");
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load chapters when series changes
  useEffect(() => {
    if (selectedSeries) {
      fetchChapters(selectedSeries.id);
    }
  }, [selectedSeries]);

  const fetchChapters = async (seriesId) => {
    try {
      const response = await axios.get("/api/chapters", {
        params: { seriesId },
      });
      setChapters(response.data.data || []);
    } catch (err) {
      console.error("Error fetching chapters:", err);
      setChapters([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSeries) {
      setError("Please select a series");
      return;
    }

    if (!rawText.trim()) {
      setError("Please paste some text");
      return;
    }

    setLoading(true);

    try {
      const nextChapterNumber = (chapters.length || 0) + 1;

      const response = await axios.post("/api/chapters", {
        seriesId: selectedSeries.id,
        number: nextChapterNumber,
        title: `Chapter ${nextChapterNumber}`,
        rawText: rawText.trim(),
      });

      setSuccess(
        `Chapter ${nextChapterNumber} created! (ID: ${response.data.data.id})`,
      );
      setRawText("");

      // Reload chapters
      await fetchChapters(selectedSeries.id);

      // Navigate to chapter after a short delay
      setTimeout(() => {
        navigate(`/chapter/${response.data.data.id}`);
      }, 1000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(`Failed to create chapter: ${errorMsg}`);
      console.error("Error creating chapter:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900">
          Phase 1: Paste & Save
        </h1>
        <p className="mt-2 text-slate-600">
          Paste your novel text here. Each paste creates a new chapter in your
          selected series.
        </p>
      </div>

      {/* Series Selector */}
      <SeriesSelector
        selectedSeries={selectedSeries}
        onSeriesChange={setSelectedSeries}
      />

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <p className="font-medium">❌ Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          <p className="font-medium">✓ Success</p>
          <p className="text-sm">{success}</p>
        </div>
      )}

      {/* Form */}
      {selectedSeries && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Text Editor */}
          <div className="space-y-2">
            <label
              htmlFor="text-editor"
              className="block text-sm font-medium text-slate-900"
            >
              Raw Text (Paste your Japanese/Chinese novel text)
            </label>
            <Editor
              value={rawText}
              onChange={setRawText}
              placeholder="Paste your novel text here..."
              className="border border-slate-300 rounded-lg p-4 font-mono text-sm"
              rows={12}
            />
            <p className="text-xs text-slate-500">
              Characters: {rawText.length} | Words:{" "}
              {rawText.split(/\s+/).filter(Boolean).length}
            </p>
          </div>

          {/* Chapters List */}
          {chapters.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <h3 className="text-sm font-medium text-slate-900 mb-3">
                Existing Chapters ({chapters.length})
              </h3>
              <div className="space-y-2">
                {chapters.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => navigate(`/chapter/${ch.id}`)}
                    className="w-full text-left p-2 rounded hover:bg-slate-200 transition text-sm text-slate-700"
                  >
                    Chapter {ch.number}: {ch.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !selectedSeries}
            className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition"
          >
            {loading ? "Creating Chapter..." : "💾 Save as Chapter"}
          </button>
        </form>
      )}
    </div>
  );
}
