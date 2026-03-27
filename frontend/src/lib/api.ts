export type SourceLanguage = "ja" | "zh";

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
  | "pass3_done";

export interface Act {
  id: number;
  chapterId: number;
  order: number;
  rawActText: string | null;
  pass1Analysis: string | null;
  pass2Draft: string | null;
  pass3Final: string | null;
  currentPass: TranslationPassState;
  lastRunAt: string | null;
  llmMeta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationChapter extends Chapter {
  translationStatus: TranslationPassState;
  lastTranslatedAt: string | null;
  Series: Pick<Series, "id" | "title" | "language" | "genre">;
}

export interface TranslationProgress {
  totalActs: number;
  pass1Done: number;
  pass2Done: number;
  pass3Done: number;
}

export interface TranslationBootstrapResponse {
  chapter: TranslationChapter;
  acts: Act[];
  progress: TranslationProgress;
}

export interface TranslationPassResult {
  act: Act;
  pass: 1 | 2 | 3;
  output: string;
}

export interface ChapterPassResult {
  pass: 1 | 2 | 3;
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

export async function runActPass(
  actId: number,
  pass: 1 | 2 | 3,
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
  pass: 1 | 2 | 3,
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

export async function updateAct(
  actId: number,
  payload: {
    rawActText?: string;
    pass2Draft?: string;
    pass3Final?: string;
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
