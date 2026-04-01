export type SourceLanguage = "ja" | "zh";

export interface PolishEdit {
  id?: number;
  original: string;
  replacement: string;
  reason: string;
  applied?: boolean;
}

export interface Polish {
  id: number;
  actId: number;
  modelUsed: string | null;
  content: string;
  editCount: number;
  appliedCount: number;
  isActive: boolean;
  Edits?: PolishEdit[];
  createdAt: string;
  updatedAt: string;
}

export interface Series {
  id: number;
  title: string;
  genre: string | null;
  description: string | null;
  language: SourceLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: number;
  seriesId: number;
  number: number;
  title: string;
  rawText: string;
  finalText: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TranslationPassState =
  | "idle"
  | "pass1_done"
  | "pass2_done"
  | "pass3_done"
  | "pass4_done";

export interface Act {
  id: number;
  chapterId: number;
  sequence: number;
  label: string;
  rawText: string;
  anatomyProfile?: {
    legacyAnalysis?: string;
    draftTranslation?: string;
    finalTranslation?: string;
    linguistic?: any;
    narrative?: any;
    pass4Edits?: PolishEdit[];
    pass4Polished?: string;
    termExtractionStatus?: string;
    actAnalysisStatus?: string;
  };
  pass4Edits?: PolishEdit[];
  pass4Polished?: string;
  PolishEdits?: PolishEdit[];
  Polishes?: Polish[];
  translatedText: string | null;

  status: string;
  lastRunAt: string | null;
  llmMeta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationChapter extends Chapter {
  status: string;
  Series: Pick<Series, "id" | "title" | "language" | "genre">;
}

export interface TranslationProgress {
  totalActs: number;
  pass1Done: number;
  pass2Done: number;
  pass3Done: number;
  pass4Done: number;
}

export interface GlossaryTerm {
  id: number;
  seriesId: number;
  canonicalForm: string;
  termJa?: string;
  termZh?: string;
  termEn: string;
  type: string;
  definition?: string;
  metadata: Record<string, any>;
  status: "pending" | "approved" | "rejected";
  confidence?: number;
  createdAt: string;
  updatedAt: string;
  Appearances?: Array<{
    contextSentence: string;
    confidence: number;
  }>;
}

export type DetailedGlossaryTerm = GlossaryTerm;

export interface TermAppearance {
  id: number;
  termId: number;
  actId: number;
  contextSentence: string;
  confidence: number;
  extractedAt: string;
}

export interface GlossaryCandidate {
  term: string;
  type: string;
  proposedTranslation: string;
  confidence: number;
  existingId: number | null;
  appearances: Array<{
    actId: number;
    actLabel: string;
    context: string;
    confidence: number;
  }>;
}

export interface AnalysisResult {
  success: boolean;
  chapterId: number;
  processed: number;
  failed: any[];
  glossary: {
    created: number;
    merged: number;
    appearances: number;
  };
  pendingGlossary: number;
  terms?: GlossaryCandidate[];
}

export interface TranslationBootstrapResponse {
  chapter: TranslationChapter;
  acts: Act[];
  progress: TranslationProgress;
}

export interface TranslationPassResult {
  act: Act;
  pass: 1 | 2 | 3 | 4;
  output: string;
}

export interface ChapterPassResult {
  pass: 1 | 2 | 3 | 4;
  completed: number;

  failed: number;
  failures: Array<{
    actId: number;
    status: number;
    error: string;
    message?: string;
  }>;
  acts: Act[];
}

export interface ArchitectResult {
  success?: boolean;
  chapterId: number;
  actsCreated: number;
  segmentationSource: "ai" | "fallback";
  pass1Diagnostics?: {
    paragraphCount: number;
    boundaryCount: number;
    lastBoundary: number;
    coveredParagraphs: number;
    coveragePercent: number;
    gapCount: number;
  };
  acts: Array<{
    id: number;
    label: string;
    sequence: number;
    status: string;
  }>;
}

export interface Genre {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel {
  id: number;
  name: string;
  modelId: string;
  provider: "lm-studio" | "openai" | "claude" | "other";
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiListResponse<T> {
  success: boolean;
  count: number;
  data: T[];
}

interface ApiItemResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  backend?: {
    status: string;
    port: number;
  };
  services?: {
    lmStudio?: {
      status: "connected" | "disconnected";
      url: string;
      message: string;
    };
  };
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
export const LLM_PROXY_ENDPOINT = `${API_BASE_URL}/llm`;

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const body = await response
    .json()
    .catch(() => ({}) as Record<string, unknown>);

  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export async function listSeries(): Promise<Series[]> {
  const result = await requestJson<ApiListResponse<Series>>("/series");
  return result.data;
}

export async function getSeries(id: number): Promise<Series> {
  const result = await requestJson<ApiItemResponse<Series>>(`/series/${id}`);
  return result.data;
}

export async function listChapters(seriesId: number): Promise<Chapter[]> {
  const result = await requestJson<ApiListResponse<Chapter>>(
    `/chapters?seriesId=${seriesId}`,
  );
  return result.data;
}

export async function createChapter(payload: {
  seriesId: number;
  number: number;
  title?: string;
  rawText: string;
}): Promise<Chapter> {
  const result = await requestJson<ApiItemResponse<Chapter>>("/chapters", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function createSeries(payload: {
  title: string;
  language: SourceLanguage;
  genre?: string;
  description?: string;
}): Promise<Series> {
  const result = await requestJson<ApiItemResponse<Series>>("/series", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function updateSeries(
  id: number,
  payload: {
    title?: string;
    language?: SourceLanguage;
    genre?: string;
    description?: string;
  },
): Promise<Series> {
  const result = await requestJson<ApiItemResponse<Series>>(`/series/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function deleteSeries(id: number): Promise<void> {
  await requestJson<ApiItemResponse<void>>(`/series/${id}`, {
    method: "DELETE",
  });
}

export async function deleteChapter(id: number): Promise<void> {
  await requestJson<ApiItemResponse<void>>(`/chapters/${id}`, {
    method: "DELETE",
  });
}

export async function getHealthStatus(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

export async function getTranslationChapter(
  seriesId: number,
  chapterId: number,
): Promise<TranslationBootstrapResponse> {
  const result = await requestJson<
    ApiItemResponse<TranslationBootstrapResponse>
  >(`/translation/translate/${seriesId}/chapter/${chapterId}`);
  return result.data;
}

export async function streamActTranslation(
  actId: number,
  model: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const url = `${API_BASE_URL}/translation/acts/${actId}/stream?model=${encodeURIComponent(model)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to start stream: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.content) {
              onChunk(data.content);
            }
          } catch (e) {
            // Partial chunk or parse error
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getActTranslationPrompt(
  actId: number,
  model: string,
): Promise<{ messages: Array<{ role: string; content: string }> }> {
  const result = await requestJson<
    ApiItemResponse<{ messages: Array<{ role: string; content: string }> }>
  >(`/translation/acts/${actId}/prompt?model=${encodeURIComponent(model)}`);
  return result.data;
}

export async function runActPass(
  actId: number,
  pass: 1 | 2 | 3 | 4,
  options?: {
    force?: boolean;
    model?: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  },
): Promise<TranslationPassResult> {
  const result = await requestJson<ApiItemResponse<TranslationPassResult>>(
    `/translation/acts/${actId}/pass`,
    {
      method: "POST",
      body: JSON.stringify({ pass, ...(options || {}) }),
    },
  );

  return result.data;
}

export async function runChapterPass(
  chapterId: number,
  pass: 1 | 2 | 3 | 4,
  options?: {
    force?: boolean;
    model?: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  },
): Promise<ChapterPassResult> {
  const result = await requestJson<ApiItemResponse<ChapterPassResult>>(
    `/translation/chapters/${chapterId}/pass`,
    {
      method: "POST",
      body: JSON.stringify({ pass, ...(options || {}) }),
    },
  );

  return result.data;
}

export async function runArchitectPhase(
  chapterId: number,
): Promise<ArchitectResult> {
  const result = await requestJson<ApiItemResponse<ArchitectResult>>(
    `/chapters/${chapterId}/architect`,
    {
      method: "POST",
    },
  );

  return result.data;
}

export async function updateAct(
  actId: number,
  payload: {
    rawText?: string;
    draftTranslation?: string;
    translation?: string;
  },
): Promise<Act> {
  const result = await requestJson<ApiItemResponse<Act>>(
    `/translation/acts/${actId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

/**
 * LEXICOGRAPHER & GLOSSARY API FUNCTIONS
 */

export async function runChapterAnalysis(
  chapterId: number,
  options?: {
    model?: string;
    temperature?: number;
    task?: "all" | "terms" | "narrative";
  },
): Promise<AnalysisResult> {
  const result = await requestJson<ApiItemResponse<AnalysisResult>>(
    `/chapters/${chapterId}/analyze`,
    {
      method: "POST",
      body: JSON.stringify(options || {}),
    },
  );
  return result.data;
}

export async function runActAnalysis(
  actId: number,
  options?: {
    model?: string;
    temperature?: number;
    task?: "all" | "terms" | "narrative";
  },
): Promise<AnalysisResult> {
  const result = await requestJson<ApiItemResponse<AnalysisResult>>(
    `/acts/${actId}/analyze`,
    {
      method: "POST",
      body: JSON.stringify(options || {}),
    },
  );
  return result.data;
}

export async function getSeriesGlossaryDetailed(
  seriesId: number,
): Promise<GlossaryTerm[]> {
  const result = await requestJson<any>(
    `/series/${seriesId}/glossary/detailed`,
  );

  if (Array.isArray(result)) return result;

  // The backend might return { success: true, data: { entries: [...] } }
  // OR might return a direct list response.
  const data = result.data || result;
  return data.entries || (Array.isArray(data) ? data : []);
}

export async function updateGlossaryTerm(
  termId: number,
  payload: {
    termEn?: string;
    type?: string;
    status?: "pending" | "approved" | "rejected";
    definition?: string;
  },
): Promise<GlossaryTerm> {
  const result = await requestJson<ApiItemResponse<GlossaryTerm>>(
    `/glossary-terms/${termId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  return result.data;
}

export async function bulkApproveTerms(
  seriesId: number,
  terms: Array<Partial<GlossaryCandidate> & { termEn: string }>,
): Promise<{ created: number; updated: number; appearances: number }> {
  const result = await requestJson<
    ApiItemResponse<{ created: number; updated: number; appearances: number }>
  >(`/series/${seriesId}/glossary/bulk-approve`, {
    method: "POST",
    body: JSON.stringify({ terms }),
  });
  return result.data;
}

export async function deleteAllActs(
  chapterId: number,
): Promise<{ deletedCount: number }> {
  const result = await requestJson<ApiItemResponse<{ deletedCount: number }>>(
    `/translation/chapters/${chapterId}/acts`,
    {
      method: "DELETE",
    },
  );
  return result.data ?? result;
}

export async function exportChapterResult(chapterId: number): Promise<Chapter> {
  const result = await requestJson<ApiItemResponse<Chapter>>(
    `/translation/chapters/${chapterId}/export`,
    {
      method: "POST",
    },
  );
  return result.data;
}

export async function deleteChapterResult(chapterId: number): Promise<void> {
  await requestJson<ApiItemResponse<void>>(
    `/translation/chapters/${chapterId}/export`,
    {
      method: "DELETE",
    },
  );
}

export async function togglePolishEdit(
  editId: number,
  applied: boolean,
): Promise<PolishEdit> {
  const result = await requestJson<ApiItemResponse<PolishEdit>>(
    `/translation/polish-edits/${editId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ applied }),
    },
  );
  return result.data;
}

/**
 * GENRE API FUNCTIONS
 */

export async function listGenres(): Promise<Genre[]> {
  const result = await requestJson<ApiListResponse<Genre>>("/settings/genres");
  return result.data;
}

export async function createGenre(payload: {
  name: string;
  description?: string;
}): Promise<Genre> {
  const result = await requestJson<ApiItemResponse<Genre>>("/settings/genres", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function updateGenre(
  id: number,
  payload: {
    name?: string;
    description?: string;
  },
): Promise<Genre> {
  const result = await requestJson<ApiItemResponse<Genre>>(
    `/settings/genres/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function deleteGenre(id: number): Promise<void> {
  await requestJson<ApiItemResponse<void>>(`/settings/genres/${id}`, {
    method: "DELETE",
  });
}

/**
 * AI MODEL API FUNCTIONS
 */

export async function listAIModels(): Promise<AIModel[]> {
  const result = await requestJson<ApiListResponse<AIModel>>(
    "/settings/ai-models",
  );
  return result.data;
}

export async function createAIModel(payload: {
  name: string;
  modelId: string;
  provider?: "lm-studio" | "openai" | "claude" | "other";
  description?: string;
  isActive?: boolean;
}): Promise<AIModel> {
  const result = await requestJson<ApiItemResponse<AIModel>>(
    "/settings/ai-models",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function updateAIModel(
  id: number,
  payload: {
    name?: string;
    modelId?: string;
    provider?: "lm-studio" | "openai" | "claude" | "other";
    description?: string;
    isActive?: boolean;
  },
): Promise<AIModel> {
  const result = await requestJson<ApiItemResponse<AIModel>>(
    `/settings/ai-models/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function deleteAIModel(id: number): Promise<void> {
  await requestJson<ApiItemResponse<void>>(`/settings/ai-models/${id}`, {
    method: "DELETE",
  });
}
