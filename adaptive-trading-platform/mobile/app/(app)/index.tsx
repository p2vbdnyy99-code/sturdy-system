import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "@/api";
import { useApi, useApp } from "@/state";
import { C, ist, money, pnlColor, price, signed } from "@/theme";
import { Badge, Btn, Card, Grid, KV, Loading, Notice, Row, Screen, Stat, Stats, T, Table } from "@/ui";

export default function Dashboard() {
  const { account, reloadAccounts } = useApp();
  const { data: d, error, loading, reload } = useApi<any>(account ? `/dashboard?account_id=${account.id}` : null, 5000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!account) return <Screen title="Dashboard"><Notice text="No account available." /></Screen>;
  const a = d?.account ?? account;
  const stop = async () => {
    setBusy(true);
    try { const r = await api<any>("/emergency-stop", { method: "POST" }); setMsg(r.note); await reloadAccounts(); reload(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen title="Dashboard" error={error} onRefresh={reload} refreshing={loading}
      right={<Btn small kind="danger" label="EMERGENCY STOP" onPress={stop} busy={busy} />}>
      {msg ? <Notice kind="warn" text={msg} /> : null}
      {!d ? <Loading /> : (
        <>
          <Card title="Account">
            <Stats>
              <Stat label="Balance" value={money(a.balance)} />
              <Stat label="Equity" value={money(a.equity)} />
              <Stat label="Available margin" value={money(a.free_margin)} />
              <Stat label="Drawdown" value={`${a.drawdown_pct.toFixed(2)}%`} color={a.drawdown_pct > 1 ? C.down : C.text} />
              <Stat label="Daily P&L" value={signed(d.pnl.daily)} color={pnlColor(d.pnl.daily)} />
              <Stat label="Weekly P&L" value={signed(d.pnl.weekly)} color={pnlColor(d.pnl.weekly)} />
              <Stat label="Monthly P&L" value={signed(d.pnl.monthly)} color={pnlColor(d.pnl.monthly)} />
              <Stat label="Open positions" value={String(a.open_positions)} sub={`limit ${a.risk_config.max_positions}`} />
            </Stats>
          </Card>
          <Grid>
            <Card title="Opportunities">
              {d.opportunities.length ? d.opportunities.map((o: any) => (
                <View key={o.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Row><T bold>{o.symbol}</T><Badge text={o.side} color={o.side === "buy" ? C.up : C.down} /><T dim small>{o.timeframe} · {ist(o.candle_ts)}</T><Badge text={o.outcome} /></Row>
                  <T dim small>{o.plan_id} — {o.reason}</T>
                </View>
              )) : (
                <View style={{ paddingVertical: 18, alignItems: "center" }}>
                  <Text style={{ color: C.warn, fontWeight: "700", fontSize: 16, letterSpacing: 1 }}>{d.opportunity_message}</Text>
                  <T dim small style={{ marginTop: 6, textAlign: "center" }}>Standing aside is a valid decision. Nothing passed strategy and risk checks in the last 6 hours.</T>
                </View>
              )}
              {d.rejected_recent.length ? <T dim small style={{ marginTop: 8 }}>Recently rejected: {d.rejected_recent.map((r: any) => `${r.symbol} (${r.reasons.join(", ")})`).join("; ")}</T> : null}
            </Card>
            <Card title="Sessions (IST)" right={<T small dim>{d.ist_time.slice(11, 16)} IST</T>}>
              {d.sessions.map((s: any) => (
                <View key={s.key} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                  <T>{s.name}</T>
                  <Row><T dim small>{s.ist_start}–{s.ist_end}</T><Badge text={s.active ? "active" : "closed"} color={s.active ? C.up : C.faint} /></Row>
                </View>
              ))}
              <KV k="Market data" v={d.market_status.data_live ? "live" : `no live feed (${d.market_status.feed})`} color={d.market_status.data_live ? C.up : C.warn} />
              <KV k="Automation" v={d.market_status.automation ? "running" : "off"} />
            </Card>
            <Card title="Strategy health">
              <Stats>
                <Stat label="Enabled" value={String(d.strategy_health.enabled)} />
                <Stat label="Validated" value={`${d.strategy_health.validated}/${d.strategy_health.total}`} />
                <Stat label="Suspended" value={String(d.strategy_health.suspended)} color={d.strategy_health.suspended ? C.down : C.text} />
              </Stats>
              {d.strategy_health.warnings.map((w: any) => <Notice key={w.plan_id} kind="warn" text={`${w.plan_id}: ${w.flags.join("; ")}`} />)}
              {!d.strategy_health.total ? <T dim small>No strategies researched yet. Import data and run research in Backtesting.</T> : null}
            </Card>
          </Grid>
          <Card title="Open positions">
            <Table rows={d.positions} empty="No open positions." keyOf={(p: any) => String(p.id)} cols={[
              { key: "s", title: "Symbol", render: (p: any) => <Row><T bold>{p.symbol}</T><Badge text={p.side} color={p.side === "buy" ? C.up : C.down} /></Row> },
              { key: "v", title: "Size", align: "right", render: (p: any) => String(p.volume) },
              { key: "e", title: "Entry", align: "right", render: (p: any) => price(p.entry_price, p.symbol), hideNarrow: true },
              { key: "sl", title: "SL", align: "right", render: (p: any) => price(p.sl, p.symbol), hideNarrow: true },
              { key: "tp", title: "TP", align: "right", render: (p: any) => price(p.tp, p.symbol), hideNarrow: true },
              { key: "p", title: "P&L", align: "right", render: (p: any) => <T color={pnlColor(p.floating_pnl)}>{signed(p.floating_pnl)}</T> },
            ]} />
          </Card>
        </>
      )}
    </Screen>
  );
}
