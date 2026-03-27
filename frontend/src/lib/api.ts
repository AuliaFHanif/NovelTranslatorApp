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
