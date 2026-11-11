import React, { useState } from "react";
import { View } from "react-native";
import { TextInput } from "react-native-paper";
import { api } from "@/api";
import { useApi, useApp } from "@/state";
import { C, ist, money, pnlColor, signed } from "@/theme";
import { Badge, Btn, Card, Grid, KV, Notice, Row, Screen, Seg, Stat, Stats, T, Table } from "@/ui";

export default function Paper() {
  const { account, accounts, selectAccount, reloadAccounts } = useApp();
  const ds = useApi<any[]>("/data/datasets");
  const ev = useApi<any[]>(account ? `/accounts/${account.id}/risk-events?limit=15` : null, 8000);
  const rep = useApi<any>(account ? `/accounts/${account.id}/reports/daily` : null, 15000);
  const [bal, setBal] = useState("300");
  const [src, setSrc] = useState("");
  const [tf, setTf] = useState("M15");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  if (!account) return <Screen title="Paper Trading"><Notice text="No account." /></Screen>;
  const paper = account.mode === "paper";
  const act = async (name: string, fn: () => Promise<string | void>) => {
    setBusy(name); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ kind: "ok", text: t }); await reloadAccounts(); ev.reload(); rep.reload(); }
    catch (e: any) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(null); }
  };
  const sources = Array.from(new Set((ds.data ?? []).map((d) => d.source)));
  const source = src || sources[0] || "";
  const symbols = Array.from(new Set((ds.data ?? []).filter((d) => d.source === source).map((d) => d.symbol)));
  const rc = account.risk_config;
  return (
    <Screen title="Paper Trading" error={ev.error} onRefresh={() => { reloadAccounts(); ev.reload(); }}>
      {msg ? <Notice kind={msg.kind} text={msg.text} /> : null}
      <Card title="Accounts">
        <Row>
          {accounts.map((a) => (
            <Btn key={a.id} small label={`${a.name} · ${a.mode.toUpperCase()}`} kind={a.id === account.id ? "primary" : "default"} onPress={() => selectAccount(a.id)} />
          ))}
        </Row>
        <Stats>
          <Stat label="Balance" value={money(account.balance)} sub={`started ${money(account.initial_balance)}`} />
          <Stat label="Equity" value={money(account.equity)} />
          <Stat label="Today" value={signed(account.daily_pnl)} color={pnlColor(account.daily_pnl)} />
          <Stat label="Losing streak" value={`${account.consecutive_losses} / ${rc.max_consecutive_losses}`} color={account.streak_locked ? C.down : C.text} />
        </Stats>
      </Card>
      <Grid min={340}>
        <Card title="Automation (real-time feed)">
          <KV k="Status" v={account.trading_enabled ? "running" : "stopped"} color={account.trading_enabled ? C.up : C.dim} />
          <KV k="Feed" v={account.feed?.type ?? "none"} />
          {account.halted_reason ? <Notice kind="error" text={`Halted: ${account.halted_reason}. New orders are blocked.`} /> : null}
          <Row style={{ marginTop: 8 }}>
            <Btn small label="Start on Binance feed" disabled={!paper || account.trading_enabled}
              onPress={() => act("on", async () => { await api(`/accounts/${account.id}/trading`, { body: { enabled: true, feed: "binance" } }); return "Paper automation started on live Binance quotes (BTCUSDT)."; })} busy={busy === "on"} />
            <Btn small label="Stop" disabled={!account.trading_enabled}
              onPress={() => act("off", async () => { await api(`/accounts/${account.id}/trading`, { body: { enabled: false } }); })} busy={busy === "off"} />
          </Row>
          <T dim small style={{ marginTop: 8 }}>Runs every enabled strategy on each closed candle through the same risk engine used for live orders. Forex/gold quotes require the MT5 bridge feed. If the feed stops, trading halts; prices are never estimated.</T>
        </Card>
        <Card title="Replay stored candles (forward simulation)">
          <Seg value={source} options={sources.map((s) => ({ value: s, label: s }))} onChange={setSrc} />
          <View style={{ height: 8 }} />
          <Seg value={tf} options={["M5", "M15", "M30", "H1"].map((v) => ({ value: v, label: v }))} onChange={setTf} />
          <Row style={{ marginTop: 8 }}>
            <Btn small label={`Replay ${symbols.join(", ") || "—"}`} disabled={!paper || !symbols.length} busy={busy === "replay"}
              onPress={() => act("replay", async () => {
                const r = await api<any>(`/accounts/${account.id}/replay`, { body: { symbols, timeframe: tf, source } });
                return `Replayed ${r.bars.toLocaleString()} candles, ${r.signals} signals. Balance ${money(r.balance)}.${r.synthetic ? " SYNTHETIC data." : ""}`;
              })} />
          </Row>
          <T dim small style={{ marginTop: 8 }}>Feeds history bar by bar through the paper engine (journal, risk checks, notifications). Replayed results never count as forward-test evidence for live trading.</T>
        </Card>
        <Card title="Kill switch">
          <KV k="State" v={account.kill_switch ? "ON — new orders blocked" : "off"} color={account.kill_switch ? C.down : C.up} />
          <KV k="Policy for open positions" v={rc.kill_switch_policy} />
          <Row style={{ marginTop: 8 }}>
            <Btn small kind="danger" label="Activate" disabled={account.kill_switch} busy={busy === "kill"}
              onPress={() => act("kill", async () => { const r = await api<any>(`/accounts/${account.id}/kill-switch`, { body: { on: true } });
                return `Kill switch on. Closed ${r.closed.length}, pending ${r.pending.length}.`; })} />
            <Btn small label="Release" disabled={!account.kill_switch} onPress={() => act("unkill", async () => { await api(`/accounts/${account.id}/kill-switch`, { body: { on: false } }); })} />
          </Row>
          <Seg value={rc.kill_switch_policy} options={[{ value: "hold", label: "Hold" }, { value: "close_all", label: "Close all" }, { value: "tighten_stops", label: "Stops to breakeven" }]}
            onChange={(v) => act("pol", async () => { await api(`/accounts/${account.id}/risk`, { method: "PATCH", body: { kill_switch_policy: v } }); })} />
          <T dim small style={{ marginTop: 8 }}>A close is attempted, never assumed: positions that cannot be closed (no price, broker down) stay flagged and are reported.</T>
        </Card>
        <Card title="Reset paper account">
          <TextInput mode="outlined" dense label="Starting balance (USD)" value={bal} onChangeText={setBal} keyboardType="numeric" />
          <View style={{ height: 8 }} />
          <Btn small label="Reset and clear journal" disabled={!paper} busy={busy === "reset"}
            onPress={() => act("reset", async () => { await api(`/accounts/${account.id}/reset`, { body: { name: account.name, initial_balance: Number(bal) || 300 } }); return "Paper account reset."; })} />
        </Card>
      </Grid>
      <Grid min={340}>
        <Card title="Today (IST)"><T>{rep.data?.summary ?? "—"}</T></Card>
        <Card title="Risk events">
          <Table rows={ev.data ?? []} empty="No risk events." keyOf={(r: any) => String(r.id)} cols={[
            { key: "t", title: "Time", render: (r: any) => ist(r.created_at) },
            { key: "k", title: "Event", render: (r: any) => <Badge text={r.kind.replace(/_/g, " ")} color={r.severity === "crit" ? C.down : C.warn} /> },
            { key: "m", title: "Detail", flex: 2.4, hideNarrow: true, render: (r: any) => r.message },
          ]} />
        </Card>
      </Grid>
    </Screen>
  );
}
