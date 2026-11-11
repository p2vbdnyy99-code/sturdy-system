import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import * as Api from "./api";
import { getItem, setItem } from "./storage";

export type Account = {
  id: number; name: string; mode: "paper" | "live"; currency: string; balance: number; equity: number;
  initial_balance: number; margin_used: number; free_margin: number; open_positions: number; drawdown_pct: number;
  kill_switch: boolean; halted_reason: string | null; streak_locked: boolean; consecutive_losses: number;
  trading_enabled: boolean; live_enabled: boolean; feed: any; risk_config: any; daily_pnl: number;
};
type Ctx = {
  ready: boolean; user: any | null; accounts: Account[]; account: Account | null;
  selectAccount: (id: number) => void; reloadAccounts: () => Promise<void>;
  signIn: (e: string, p: string, register?: boolean) => Promise<void>; signOut: () => Promise<void>;
  quotes: Record<string, { bid: number; ask: number; ts: string; source: string }>;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<Ctx["quotes"]>({});

  const reloadAccounts = useCallback(async () => {
    const list = await Api.api<Account[]>("/accounts");
    setAccounts(list);
  }, []);

  const afterAuth = useCallback(async () => {
    setUser(await Api.api("/auth/me"));
    await reloadAccounts();
    const saved = await getItem("account");
    if (saved) setSelected(Number(saved));
  }, [reloadAccounts]);

  useEffect(() => {
    (async () => {
      try { if (await Api.init(() => setUser(null))) await afterAuth(); } catch { /* stay signed out */ }
      setReady(true);
    })();
  }, [afterAuth]);

  // live quote / notification stream
  useEffect(() => {
    if (!user) return;
    const url = Api.wsUrl();
    if (!url) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let timer: any;
    const connect = () => {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data));
          if (m.type === "quote") setQuotes((q) => ({ ...q, [m.symbol]: m }));
        } catch { /* ignore malformed frame */ }
      };
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 5000); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [user]);

  // PAPER is always the default selection; a live account is never auto-selected.
  const account = accounts.find((a) => a.id === selected && a.mode === "paper")
    ?? accounts.find((a) => a.id === selected) ?? accounts.find((a) => a.mode === "paper") ?? null;

  const value: Ctx = {
    ready, user, accounts, account, quotes, reloadAccounts,
    selectAccount: (id) => { setSelected(id); setItem("account", String(id)); },
    signIn: async (e, p, register) => { await Api.signIn(e, p, register); await afterAuth(); },
    signOut: async () => { await Api.signOut(); setUser(null); setAccounts([]); },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Polling data hook. Errors are surfaced to the screen, never swallowed. */
export function useApi<T = any>(path: string | null, intervalMs = 0, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await Api.api<T>(path);
      if (alive.current) { setData(d); setError(null); }
    } catch (e: any) {
      if (alive.current) setError(e.message ?? String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    alive.current = true;
    setLoading(!!path);
    load();
    const t = intervalMs ? setInterval(load, intervalMs) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, intervalMs, path]);
  return { data, error, loading, reload: load };
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;                       // iPad landscape / desktop: side rail + multi-column
  const medium = width >= 600;                     // iPad portrait / large phones in landscape
  return { width, height, wide, medium, landscape: width > height, columns: wide ? 3 : medium ? 2 : 1 };
}
