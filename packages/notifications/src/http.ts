import { request } from 'undici';

/**
 * Shared HTTP-POST helper for notification providers (P4.4). Collapses the undici `request` +
 * content-type + 10s `AbortSignal.timeout` + status→transient/permanent logic that telegram/slack/
 * email each hand-rolled. Returns the raw status plus lazy `text()`/`json()` so every provider
 * decides success by its own response shape (Discord 204 empty body, Teams 200 body `1`, etc.).
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpErrorKind = 'transient' | 'permanent';

/** 429 (rate-limited) and 5xx (server) are worth retrying; any other non-2xx is the caller's fault. */
export function classifyHttp(statusCode: number): HttpErrorKind {
  return statusCode === 429 || statusCode >= 500 ? 'transient' : 'permanent';
}

export interface HttpResponse {
  statusCode: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

export interface PostOptions {
  headers?: Record<string, string>;
  /** HTTP method override (defaults to POST). */
  method?: string;
  timeoutMs?: number;
}

async function send(
  url: string,
  body: string,
  contentType: string,
  opts: PostOptions,
): Promise<HttpResponse> {
  const res = await request(url, {
    method: opts.method ?? 'POST',
    headers: { 'content-type': contentType, ...opts.headers },
    body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  return {
    statusCode: res.statusCode,
    text: () => res.body.text(),
    json: () => res.body.json(),
  };
}

/** POST a JSON body. */
export function postJson(url: string, body: unknown, opts: PostOptions = {}): Promise<HttpResponse> {
  return send(url, JSON.stringify(body), 'application/json', opts);
}

/** POST an `application/x-www-form-urlencoded` body (Pushover, Twilio). */
export function postForm(
  url: string,
  fields: Record<string, string>,
  opts: PostOptions = {},
): Promise<HttpResponse> {
  return send(url, new URLSearchParams(fields).toString(), 'application/x-www-form-urlencoded', opts);
}
