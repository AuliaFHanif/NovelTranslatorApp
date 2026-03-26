import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

export default function Chapter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [finalText, setFinalText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchChapter();
  }, [id]);

  const fetchChapter = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/chapters/${id}`);
      setChapter(response.data.data);
      setFinalText(response.data.data.finalText || "");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load chapter");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranslation = async () => {
    try {
      setSaving(true);
      await axios.patch(`/api/chapters/${id}`, {
        finalText: finalText,
      });
      setError(null);
      await fetchChapter();
    } catch (err) {
      setError("Failed to save translation");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-600">Loading chapter...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
        <p className="font-medium">Error</p>
        <p className="text-sm mb-4">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Chapter not found</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/")}
            className="mb-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Translator
          </button>
          <h1 className="text-3xl font-bold text-slate-900">{chapter.title}</h1>
          <p className="mt-1 text-slate-600">
            Series: {chapter.Series?.title} • Chapter {chapter.number}
          </p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Raw Text Column */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Original Text
          </h2>
          <div className="p-4 rounded-lg border border-slate-300 bg-slate-50 h-96 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-slate-800">
            {chapter.rawText}
          </div>
          <p className="text-xs text-slate-500">
            {chapter.rawText.length} characters
          </p>
        </div>

        {/* Translation Column */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Translation</h2>
          <textarea
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            placeholder="Generated translation or manual notes will appear here..."
            className="w-full h-96 p-4 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono text-sm resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {finalText.length} characters
            </p>
            <button
              onClick={handleSaveTranslation}
              disabled={saving}
              className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-400 font-medium"
            >
              {saving ? "Saving..." : "💾 Save Translation"}
            </button>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-sm">
        <p>
          <span className="font-medium text-slate-900">Created:</span>
          <span className="ml-2 text-slate-600">
            {new Date(chapter.createdAt).toLocaleString()}
          </span>
        </p>
        <p>
          <span className="font-medium text-slate-900">Updated:</span>
          <span className="ml-2 text-slate-600">
            {new Date(chapter.updatedAt).toLocaleString()}
          </span>
        </p>
      </div>
    </div>
  );
}
