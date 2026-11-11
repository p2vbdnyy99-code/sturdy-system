import { Platform } from "react-native";
import { getItem, setItem } from "./storage";

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : detail?.message ?? JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

let baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
let access: string | null = null;
let refresh: string | null = null;
let onSignedOut: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export function defaultServer(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const o = window.location.origin;
    return o.includes(":8081") || o.includes(":19006") ? "http://localhost:8000" : o;
  }
  return "http://localhost:8000";
}
export const getServer = () => baseUrl;
export const getAccessToken = () => access;

export async function init(signedOut: () => void): Promise<boolean> {
  onSignedOut = signedOut;
  baseUrl = (await getItem("server")) || defaultServer();
  refresh = await getItem("refresh");
  if (!refresh) return false;
  return doRefresh();
}
export async function setServer(url: string) {
  baseUrl = url.replace(/\/+$/, "");
  await setItem("server", baseUrl);
}
async function setTokens(t: { access_token: string; refresh_token: string } | null) {
  access = t?.access_token ?? null;
  refresh = t?.refresh_token ?? null;
  await setItem("refresh", refresh);
}
async function doRefresh(): Promise<boolean> {
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }) });
        if (!r.ok) { if (r.status === 401) await setTokens(null); return false; }
        await setTokens(await r.json());
        return true;
      } catch { return false; } finally { refreshing = null; }
    })();
  }
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (access) headers.Authorization = `Bearer ${access}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(`${baseUrl}/api/v1${path}`, { method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${baseUrl}`);
  }
  if (r.status === 401 && retry && refresh && !path.startsWith("/auth/login")) {
    if (await doRefresh()) return api<T>(path, opts, false);
    onSignedOut?.();
  }
  if (r.status === 204) return undefined as T;
  let data: any = null;
  try { data = await r.json(); } catch { /* non-JSON body */ }
  if (!r.ok) throw new ApiError(r.status, data?.detail ?? `HTTP ${r.status}`);
  return data as T;
}

export async function signIn(email: string, password: string, register = false) {
  const d = await api<any>(register ? "/auth/register" : "/auth/login", { body: { email, password } }, false);
  await setTokens(d);
  return d.user;
}
export async function signOut() {
  try { await api("/auth/logout", { method: "POST" }, false); } catch { /* already signed out */ }
  await setTokens(null);
}
export function wsUrl(): string | null {
  return access ? `${baseUrl.replace(/^http/, "ws")}/api/v1/ws?token=${encodeURIComponent(access)}` : null;
}
