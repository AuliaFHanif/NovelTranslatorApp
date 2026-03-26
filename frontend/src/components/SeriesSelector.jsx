import { useState, useEffect } from "react";
import axios from "axios";

export default function SeriesSelector({ selectedSeries, onSeriesChange }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewSeriesForm, setShowNewSeriesForm] = useState(false);
  const [newSeriesData, setNewSeriesData] = useState({
    title: "",
    language: "ja",
    genre: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSeries();
  }, []);

  const fetchSeries = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/series");
      setSeries(response.data.data || []);
    } catch (err) {
      setError("Failed to load series");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSeries = async (e) => {
    e.preventDefault();
    if (!newSeriesData.title.trim()) {
      setError("Series title is required");
      return;
    }

    setCreating(true);
    try {
      const response = await axios.post("/api/series", newSeriesData);
      const newSeries = response.data.data;
      setSeries([newSeries, ...series]);
      onSeriesChange(newSeries);
      setNewSeriesData({
        title: "",
        language: "ja",
        genre: "",
        description: "",
      });
      setShowNewSeriesForm(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create series");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Select a Series</h2>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Loading series...</p>
      ) : (
        <>
          {series.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {series.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSeriesChange(s)}
                  className={`p-4 rounded-lg border-2 transition text-left ${
                    selectedSeries?.id === s.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="font-medium text-slate-900">{s.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.language === "ja" ? "🇯🇵 Japanese" : "🇨🇳 Chinese"} •{" "}
                    {s.genre || "No genre"}
                  </p>
                </button>
              ))}
            </div>
          )}

          {series.length === 0 && !showNewSeriesForm && (
            <p className="text-slate-600">
              No series found. Create one to get started.
            </p>
          )}

          {/* Create Series Form */}
          {showNewSeriesForm ? (
            <form
              onSubmit={handleCreateSeries}
              className="p-4 rounded-lg border border-slate-300 bg-slate-50 space-y-3"
            >
              <h3 className="font-medium text-slate-900">Create New Series</h3>

              <input
                type="text"
                placeholder="Series Title"
                value={newSeriesData.title}
                onChange={(e) =>
                  setNewSeriesData({ ...newSeriesData, title: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500"
                required
              />

              <select
                value={newSeriesData.language}
                onChange={(e) =>
                  setNewSeriesData({
                    ...newSeriesData,
                    language: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500"
              >
                <option value="ja">Japanese (日本語)</option>
                <option value="zh">Chinese (中文)</option>
              </select>

              <input
                type="text"
                placeholder="Genre (optional)"
                value={newSeriesData.genre}
                onChange={(e) =>
                  setNewSeriesData({ ...newSeriesData, genre: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500"
              />

              <textarea
                placeholder="Description (optional)"
                value={newSeriesData.description}
                onChange={(e) =>
                  setNewSeriesData({
                    ...newSeriesData,
                    description: e.target.value,
                  })
                }
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 resize-none"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-400 font-medium"
                >
                  {creating ? "Creating..." : "Create Series"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewSeriesForm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowNewSeriesForm(true)}
              className="w-full px-4 py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 font-medium"
            >
              + Create New Series
            </button>
          )}
        </>
      )}
    </div>
  );
}
