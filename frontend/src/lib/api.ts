import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Project } from '../data/mock';

// --- Auth tokens ---

const TOKENS = 'sw:tokens';
type Tokens = { access: string; refresh: string };

const readTokens = (): Tokens | null => {
  try { return JSON.parse(localStorage.getItem(TOKENS) ?? 'null'); } catch { return null; }
};
export const saveTokens = (t: Tokens) => { try { localStorage.setItem(TOKENS, JSON.stringify(t)); } catch { /* ignore */ } };
export const clearTokens = () => { try { localStorage.removeItem(TOKENS); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(firstError(data) ?? `Request failed (${status})`);
  }
}

// DRF errors look like {"field": ["msg"]} or {"detail": "msg"}; show the first message.
function firstError(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return firstError(data[0]);
  if (data && typeof data === 'object') for (const v of Object.values(data)) { const m = firstError(v); if (m) return m; }
}

async function refresh(): Promise<boolean> {
  const t = readTokens();
  if (!t) return false;
  const res = await fetch('/api/v1/auth/token/refresh/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: t.refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  saveTokens({ access: data.access, refresh: data.refresh ?? t.refresh });
  return true;
}

/** fetch() for the backend API: adds the token, refreshes it once on 401, sends to login if that fails. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = readTokens()?.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api/v1${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });

  if (res.status === 401 && token && retry && await refresh()) return api<T>(path, init, false);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearTokens();
    window.location.assign('/auth/login');
  }
  const data = res.status === 204 || res.status === 205 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Downloads a file from the backend API (with the auth token) and saves it in the browser. */
export async function downloadFile(path: string, fallbackName: string, retry = true): Promise<void> {
  const token = readTokens()?.access;
  const res = await fetch(`/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && token && retry && await refresh()) return downloadFile(path, fallbackName, false);
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const name = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Projects ---

export type ApiLabel = { id: number; name: string; color: string };
export type ApiProject = {
  id: number; name: string; description: string; color: string; owner: string; labels: ApiLabel[];
  thumbnail: string | null; dataset_name: string; dataset_format: string; image_count: number;
  annotated_count: number; is_labeled: boolean; created_at: string; updated_at: string;
};
export type ApiAnnotation = { id?: number; label: number; kind: string; points: [number, number][]; source?: string };
// video / frame_index / frame_time are set when the image is a frame extracted from a video
export type ApiImage = {
  id: number; url: string; original_name: string; width: number; height: number;
  video: string; frame_index: number | null; frame_time: number | null; annotations: ApiAnnotation[];
};

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  const [n, unit] = s < 3600 ? [s / 60, 'minute'] : s < 86400 ? [s / 3600, 'hour'] : [s / 86400, 'day'];
  const v = Math.floor(n);
  return `${v} ${unit}${v === 1 ? '' : 's'} ago`;
}

/** Adapts a backend project to the shape the pages already use. */
export const toProject = (p: ApiProject): Project => ({
  id: p.id, name: p.name, owner: p.owner, updated: timeAgo(p.updated_at), labels: p.labels,
  description: p.description || undefined, color: p.color, thumbnail: p.thumbnail ?? undefined,
  images: p.image_count, annotated: p.annotated_count, created: p.created_at,
  datasetFormat: p.dataset_format || undefined, isLabeled: p.is_labeled,
});

export const fetchProjects = () => api<ApiProject[]>('/projects/').then((l) => l.map(toProject));

/** All images of a project with their annotations (follows pagination). */
export async function fetchImages(projectId: number) {
  const images: ApiImage[] = [];
  let page = 1;
  for (;;) {
    const res = await api<{ next: string | null; results: ApiImage[] }>(`/projects/${projectId}/images/?page_size=200&page=${page}`);
    images.push(...res.results);
    if (!res.next) return images;
    page++;
  }
}

// Cache so moving between a project's tabs doesn't refetch or flash empty.
const cache = new Map<number, Project>();
export const cacheProject = (p: Project) => cache.set(p.id, p);
export const uncacheProject = (id: number) => cache.delete(id);

/** The project in the URL: undefined while loading, null if it doesn't exist. */
export function useProject(): Project | null | undefined {
  const id = Number(useParams().id);
  const [state, setState] = useState<{ id: number; p: Project | null | undefined }>({ id, p: cache.get(id) });
  useEffect(() => {
    let live = true;
    api<ApiProject>(`/projects/${id}/`)
      .then((p) => { const v = toProject(p); cacheProject(v); if (live) setState({ id, p: v }); })
      .catch(() => { if (live) setState({ id, p: null }); });
    return () => { live = false; };
  }, [id]);
  return state.id === id ? state.p : cache.get(id);
}

// --- Training ---

export type ApiTrainingJob = {
  id: number; name: string; architecture: string; architecture_label: string; train_split: number;
  epochs: number; batch_size: number; use_pretrained: boolean; base_job: number | null; base_job_name: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; cancel_requested: boolean;
  progress: number; current_epoch: number; train_images: number; val_images: number; class_names: string[];
  metrics: Record<string, number>; history: Record<string, number | null>[]; error: string;
  has_checkpoint: boolean; created_at: string; started_at: string | null; finished_at: string | null;
};
export type ApiTrainingSummary = {
  total_images: number; annotated_images: number; remaining_images: number; annotated_percent: number;
  usable_images: number; split: number; train_images: number; val_images: number;
  classes: { id: number; name: string; color: string; annotation_count: number; image_count: number }[];
  architectures: { value: string; label: string }[]; default_epochs: number; max_epochs: number;
  active_job: ApiTrainingJob | null;
};

/** Same rule as the backend: training keeps >= 1 image, validation >= 1 when there are 2+. */
export function splitCounts(n: number, split: number): [number, number] {
  if (n <= 0) return [0, 0];
  if (n === 1) return [1, 0];
  const train = Math.min(Math.max(Math.round((n * split) / 100), 1), n - 1);
  return [train, n - train];
}
