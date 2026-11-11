import React, { useState } from "react";
import { View } from "react-native";
import { useApi, useApp } from "@/state";
import { C, ist, pnlColor, price, signed } from "@/theme";
import { Badge, Card, Notice, Row, Screen, Seg, T, Table } from "@/ui";

const opt = (xs: string[], all: string) => [{ value: "", label: all }, ...xs.map((v) => ({ value: v, label: v }))];
const DAYS = [{ value: "", label: "All dates" }, { value: "1", label: "Today" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }];

export default function Journal() {
  const { account } = useApp();
  const [view, setView] = useState<"signals" | "trades">("signals");
  const [symbol, setSymbol] = useState("");
  const [session, setSession] = useState("");
  const [tf, setTf] = useState("");
  const [outcome, setOutcome] = useState("");
  const [result, setResult] = useState("");
  const [days, setDays] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const strategies = useApi<any[]>("/strategies");
  const [plan, setPlan] = useState("");
  const q = new URLSearchParams();
  if (symbol) q.set("symbol", symbol);
  if (session) q.set("session", session);
  if (tf) q.set("timeframe", tf);
  if (plan) q.set("plan_id", plan);
  if (days) q.set("start", new Date(Math.floor(Date.now() / 3600000) * 3600000 - Number(days) * 86400000).toISOString());
  if (view === "signals" && outcome) q.set("outcome", outcome);
  if (view === "trades" && result) q.set("result", result);
  const path = account ? `/accounts/${account.id}/${view === "signals" ? "journal" : "trades"}?limit=300&${q.toString()}` : null;
  const { data, error, loading, reload } = useApi<any>(path, 10000);
  if (!account) return <Screen title="Trade Journal"><Notice text="No account." /></Screen>;
  const items: any[] = data?.items ?? [];
  const plans = Array.from(new Set((strategies.data ?? []).map((s) => s.plan_id)));
  return (
    <Screen title="Trade Journal" error={error} onRefresh={reload} refreshing={loading}>
      <Card>
        <View style={{ gap: 8 }}>
          <Seg value={view} options={[{ value: "signals", label: "Signals & rejections" }, { value: "trades", label: "Closed trades" }]} onChange={setView} />
          <Seg value={symbol} options={opt(["XAUUSD", "BTCUSD", "BTCUSDT", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD"], "All instruments")} onChange={setSymbol} />
          <Row>
            <Seg value={session} options={opt(["asia", "london", "newyork"], "All sessions")} onChange={setSession} />
            <Seg value={tf} options={opt(["M1", "M5", "M15", "M30", "H1", "H4"], "All TF")} onChange={setTf} />
          </Row>
          <Row>
            <Seg value={days} options={DAYS} onChange={setDays} />
            {view === "signals"
              ? <Seg value={outcome} options={opt(["executed", "rejected"], "All outcomes")} onChange={setOutcome} />
              : <Seg value={result} options={[{ value: "", label: "Profit & loss" }, { value: "win", label: "Winners" }, { value: "loss", label: "Losers" }]} onChange={setResult} />}
          </Row>
          {plans.length ? <Seg value={plan} options={opt(plans, "All strategies")} onChange={setPlan} /> : null}
        </View>
      </Card>
      <Card title={`${data?.total ?? 0} ${view === "signals" ? "signals" : "trades"}`}>
        {view === "signals" ? (
          <>
            <Table rows={items} empty="No signals recorded for these filters." keyOf={(s: any) => String(s.id)} onPress={(s: any) => setOpen(open === s.id ? null : s.id)} cols={[
              { key: "t", title: "Candle (IST)", flex: 1.2, render: (s: any) => ist(s.candle_ts) },
              { key: "s", title: "Symbol", flex: 1.2, render: (s: any) => <Row><T small bold>{s.symbol}</T><Badge text={s.side} color={s.side === "buy" ? C.up : C.down} /></Row> },
              { key: "p", title: "Strategy", flex: 2, hideNarrow: true, render: (s: any) => s.plan_id },
              { key: "pr", title: "Price", align: "right", hideNarrow: true, render: (s: any) => price(s.price, s.symbol) },
              { key: "o", title: "Outcome", flex: 1.5, render: (s: any) => <View><Badge text={s.outcome} color={s.outcome === "executed" ? C.up : s.outcome === "rejected" ? C.warn : C.dim} />
                {s.rejection ? <T dim small numberOfLines={1}>{s.rejection.reasons.join(", ")}</T> : null}</View> },
            ]} />
            {open ? items.filter((s) => s.id === open).map((s) => (
              <View key={s.id} style={{ marginTop: 10, gap: 6 }}>
                <Notice kind={s.rejection ? "warn" : "ok"} text={s.explanation} />
                {s.synthetic ? <Notice kind="warn" text="This signal was generated from SYNTHETIC data." /> : null}
                {s.rejection?.detail?.risk_budget_usd !== undefined ? <T dim small>Risk budget {s.rejection.detail.risk_budget_usd} USD · risk per lot {s.rejection.detail.risk_per_lot_usd} USD{s.rejection.detail.min_lot_risk_usd ? ` · minimum lot would risk ${s.rejection.detail.min_lot_risk_usd} USD` : ""}</T> : null}
              </View>
            )) : <T dim small style={{ marginTop: 8 }}>Tap a row for the explanation of why it was traded or rejected.</T>}
          </>
        ) : (
          <Table rows={items} empty="No closed trades for these filters." keyOf={(t: any) => String(t.id)} cols={[
            { key: "t", title: "Closed (IST)", flex: 1.2, render: (t: any) => ist(t.closed_at) },
            { key: "s", title: "Symbol", flex: 1.2, render: (t: any) => <Row><T small bold>{t.symbol}</T><Badge text={t.side} color={t.side === "buy" ? C.up : C.down} /></Row> },
            { key: "p", title: "Strategy", flex: 2, hideNarrow: true, render: (t: any) => t.plan_id },
            { key: "e", title: "Entry", align: "right", hideNarrow: true, render: (t: any) => price(t.entry_price, t.symbol) },
            { key: "x", title: "Exit", align: "right", hideNarrow: true, render: (t: any) => price(t.exit_price, t.symbol) },
            { key: "w", title: "Reason", hideNarrow: true, render: (t: any) => t.exit_reason.replace(/_/g, " ") },
            { key: "r", title: "R", align: "right", flex: 0.6, render: (t: any) => <T color={pnlColor(t.r_multiple)}>{signed(t.r_multiple)}</T> },
            { key: "pnl", title: "P&L", align: "right", render: (t: any) => <T color={pnlColor(t.pnl)}>{signed(t.pnl)}</T> },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
