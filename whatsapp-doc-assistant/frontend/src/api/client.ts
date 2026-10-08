// The one place that knows how to talk to the backend: CSRF header
// attachment, JSON handling, and centralized 401 handling. Every other
// api/*.ts module calls request() rather than fetch() directly — no
// component should ever call fetch() itself.
//
// CSRF: the backend's double-submit cookie (src/bidpilot/auth/cookies.js /
// csrf.js) puts a JS-readable token in the `bidpilot_csrf` cookie on login.
// It must be echoed back as `x-csrf-token` on state-changing requests —
// matching the backend's own safe-method list exactly (GET/HEAD/OPTIONS are
// exempt there, so POST/PUT/PATCH/DELETE get the header here, not "anything
// non-GET").
const CSRF_COOKIE_NAME = 'bidpilot_csrf';
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Fired on any 401 response — SessionProvider listens for this rather than
 *  every call site handling auth expiry individually. */
export const SESSION_EXPIRED_EVENT = 'tenderlytic:session-expired';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  let body: string | FormData | undefined;

  if (isFormData(options.body)) {
    // Never set content-type manually for multipart — the browser must
    // generate the boundary itself (used by uploadTender()'s file upload).
    body = options.body;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (CSRF_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }

  const res = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body,
    credentials: 'same-origin',
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }

  // 204/empty responses (none exist yet, but a future logout-style endpoint
  // might) shouldn't attempt to parse JSON.
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
      ? data.error
      : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}
