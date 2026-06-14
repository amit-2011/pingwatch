import type { AuthUser, ErrorEnvelope, MonitorStatus } from '@pingwatch/shared';

// Re-export the canonical wire-contract types so the rest of the web app uses ONE source of truth.
export type { AuthUser, ErrorEnvelope, MonitorStatus } from '@pingwatch/shared';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface MonitorView {
  id: string;
  projectId: string;
  name: string;
  type: string;
  status: MonitorStatus;
  isActive: boolean;
  intervalSeconds: number;
  retries: number;
  retryIntervalSeconds: number;
  timeoutMs: number;
  config: { url?: string; method?: string; keyword?: string; [k: string]: unknown };
  lastCheckedAt: string | null;
  lastStatusChangeAt: string | null;
  lastResponseTime: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  createdAt: string;
}

export interface Heartbeat {
  status: number;
  responseTime: number | null;
  statusCode: number | null;
  message: string | null;
  important: boolean;
  createdAt: string;
}

export interface ChannelView {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isDefault: boolean;
  lastError: string | null;
  lastTestedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
}

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

function rawFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`/api${path}`, { ...opts, headers, credentials: 'include' });
}

export async function refreshSession(): Promise<{ accessToken: string; user: AuthUser } | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string; user: AuthUser };
  accessToken = data.accessToken;
  return data;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && accessToken) {
    const refreshed = await refreshSession();
    if (refreshed) res = await rawFetch(path, opts);
  }
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const env = body as ErrorEnvelope | undefined;
    throw new ApiError(env?.code ?? 'INTERNAL', env?.message ?? res.statusText, res.status, env?.details);
  }
  return body as T;
}
