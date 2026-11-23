// ============================================================================
// MONOLOOP - HTTP client for the FastAPI backend
//
// The one place the frontend talks to the network. Components never call
// fetch() directly: they use the hooks in src/hooks, which call the typed
// functions in ./endpoints, which call apiRequest() here.
//
//   component → hook (TanStack Query cache) → endpoint → apiRequest → FastAPI
// ============================================================================

import type { ApiResponse } from '@/lib/types';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 15_000;

/** Error carrying the backend's stable error code (e.g. DUPLICATE_EXCHANGE, INSUFFICIENT_STOCK). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(code: string, message: string, status: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Acting organization (demo identity), sent as X-Organization-Id. */
  organizationId?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiResponse<T>['meta'];
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', query, body, organizationId, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (organizationId) headers['X-Organization-Id'] = organizationId;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: withTimeout(signal, timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error; // cancelled by React Query
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiError(
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? 'The server took too long to respond.' : 'Cannot reach the MONOLOOP API. Is the backend running?',
      0
    );
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON (proxy error page, empty body): handled below.
  }

  if (!payload || !payload.success) {
    const err = payload?.error;
    throw new ApiError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed (${response.status}).`,
      response.status,
      err?.details,
      requestId
    );
  }
  return { data: payload.data as T, meta: payload.meta };
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
