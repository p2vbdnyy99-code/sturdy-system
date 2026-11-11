import React from "react";
import { View } from "react-native";
import { BarChart, LineChart } from "./charts";
import { C, money, num, pnlColor, signed } from "./theme";
import { Card, Grid, Stat, Stats, T, Table } from "./ui";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(0)}%`);

export function SummaryStats({ s }: { s: any }) {
  if (!s) return null;
  return (
    <Stats>
      <Stat label="Net profit" value={signed(s.net_profit)} color={pnlColor(s.net_profit)} sub={s.return_pct !== undefined ? `${signed(s.return_pct, 2, "%")}` : undefined} />
      <Stat label="Trades" value={String(s.trades)} />
      <Stat label="Win rate" value={pct(s.win_rate)} />
      <Stat label="Profit factor" value={num(s.profit_factor)} />
      <Stat label="Expectancy" value={s.expectancy_r === null || s.expectancy_r === undefined ? "—" : `${signed(s.expectancy_r)}R`} color={pnlColor(s.expectancy_r)} />
      <Stat label="Avg R win/loss" value={num(s.avg_rr_realized)} />
      <Stat label="Max drawdown" value={`${num(s.max_drawdown_pct, 1)}%`} sub={money(s.max_drawdown_usd)} />
      <Stat label="Sharpe" value={num(s.sharpe)} />
      <Stat label="Sortino" value={num(s.sortino)} />
      <Stat label="Max losing streak" value={String(s.max_consecutive_losses ?? "—")} />
      <Stat label="Avg hold" value={s.avg_hold_minutes ? `${(s.avg_hold_minutes / 60).toFixed(1)}h` : "—"} />
      <Stat label="Costs paid" value={money(s.total_costs)} />
    </Stats>
  );
}

function Breakdown({ title, rows, k }: { title: string; rows: any[]; k: string }) {
  return (
    <Card title={title}>
      <Table rows={rows ?? []} empty="No trades." keyOf={(r: any) => String(r[k])} cols={[
        { key: "k", title: k.replace("_", " "), flex: 2.2, render: (r: any) => String(r[k]) },
        { key: "n", title: "Trades", align: "right", render: (r: any) => String(r.trades) },
        { key: "w", title: "Win", align: "right", render: (r: any) => pct(r.win_rate), hideNarrow: true },
        { key: "pf", title: "PF", align: "right", render: (r: any) => num(r.profit_factor), hideNarrow: true },
        { key: "e", title: "Exp R", align: "right", render: (r: any) => <T color={pnlColor(r.expectancy_r)}>{signed(r.expectancy_r)}</T> },
        { key: "p", title: "Net", align: "right", render: (r: any) => <T color={pnlColor(r.net_profit)}>{signed(r.net_profit)}</T> },
      ]} />
    </Card>
  );
}

/** Shared performance report (backtests and live/paper analytics). */
export function Report({ rep, initial }: { rep: any; initial: number }) {
  const eq: any[] = rep.equity_curve ?? [];
  const split = eq.findIndex((p) => p.segment === "out_of_sample");
  return (
    <View style={{ gap: 12 }}>
      <Card title="Performance (net of spread, slippage, commission, financing)"><SummaryStats s={rep.summary} /></Card>
      {rep.in_sample ? (
        <Grid>
          <Card title="In-sample"><SummaryStats s={rep.in_sample} /></Card>
          <Card title="Out-of-sample"><SummaryStats s={rep.out_of_sample} /></Card>
        </Grid>
      ) : null}
      <Grid min={340}>
        <Card title="Equity curve">
          <LineChart points={[initial, ...eq.map((p) => p.equity)]} baseline={initial} color={C.accent} splitIndex={split > 0 ? split + 1 : null} />
        </Card>
        <Card title="Drawdown %">
          <LineChart points={[0, ...eq.map((p) => -p.drawdown_pct)]} baseline={0} color={C.down} fill format={(v) => `${v.toFixed(1)}%`} />
        </Card>
      </Grid>
      <Grid min={340}>
        <Card title="Monthly returns %"><BarChart bars={(rep.monthly ?? []).map((m: any) => ({ label: m.period.slice(2), value: m.return_pct ?? 0 }))} /></Card>
        <Card title="Daily P&L"><BarChart bars={(rep.daily ?? []).slice(-60).map((m: any) => ({ label: m.period.slice(5), value: m.pnl }))} format={(v) => v.toFixed(0)} /></Card>
      </Grid>
      <Grid min={340}>
        <Breakdown title="Strategy comparison" rows={rep.by_strategy} k="plan_id" />
        <Breakdown title="Session comparison" rows={rep.by_session} k="engine" />
        <Breakdown title="Instrument comparison" rows={rep.by_instrument} k="symbol" />
        {rep.by_vol_regime?.some((r: any) => r.vol_regime !== "n/a") ? <Breakdown title="Volatility regime" rows={rep.by_vol_regime} k="vol_regime" /> : null}
      </Grid>
    </View>
  );
}
