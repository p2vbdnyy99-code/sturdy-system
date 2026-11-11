import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { TextInput } from "react-native-paper";
import { api } from "@/api";
import { Report } from "@/report";
import { useApi } from "@/state";
import { C, ist, num, price, signed, pnlColor } from "@/theme";
import { Badge, Btn, Card, Grid, KV, Loading, Notice, Row, Screen, Seg, Synthetic, T, Table } from "@/ui";

const ENG = [{ value: "", label: "All engines" }, { value: "asia", label: "Asian" }, { value: "london", label: "London" }, { value: "newyork", label: "New York" }];
const SYMS = ["XAUUSD", "BTCUSD", "BTCUSDT", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD"];

export default function Backtesting() {
  const ds = useApi<any[]>("/data/datasets", 0);
  const runs = useApi<any[]>("/backtests", 4000);
  const [source, setSource] = useState("");
  const [engine, setEngine] = useState("");
  const [symbol, setSymbol] = useState("");
  const [balance, setBalance] = useState("300");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const detail = useApi<any>(openId ? `/backtests/${openId}?include_trades=true` : null, 0, [runs.data?.find((r) => r.id === openId)?.status]);
  const sources = Array.from(new Set((ds.data ?? []).map((d) => d.source)));
  useEffect(() => { if (!source && sources.length) setSource(sources.find((s) => !s.startsWith("synthetic")) ?? sources[0]); }, [sources, source]);
  const available = SYMS.filter((s) => (ds.data ?? []).some((d) => d.symbol === s && d.source === source));

  const run = async (kind: "backtests" | "research") => {
    setBusy(kind); setMsg(null);
    try {
      const r = await api<any>(`/${kind}`, { body: { source, engine: engine || null, symbols: symbol ? [symbol] : available,
        initial_balance: Number(balance) || 300 } });
      setOpenId(r.id); runs.reload();
    } catch (e: any) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(null); }
  };
  const importBinance = async () => {
    setBusy("binance"); setMsg(null);
    try {
      const r = await api<any>("/data/import/binance", { body: { symbol: "BTCUSDT", timeframe: "M5", days: 365 } });
      setMsg({ kind: "ok", text: `Imported ${r.candles} real BTCUSDT M5 candles from Binance.` }); ds.reload();
    } catch (e: any) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(null); }
  };
  const importCsv = async (sym: string) => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const f = res.assets[0];
    const form = new FormData();
    form.append("symbol", sym);
    form.append("source_name", f.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "import");
    if (Platform.OS === "web" && (f as any).file) form.append("file", (f as any).file);
    else form.append("file", { uri: f.uri, name: f.name, type: f.mimeType ?? "text/csv" } as any);
    setBusy("csv"); setMsg(null);
    try {
      const r = await api<any>("/data/import/csv", { form });
      setMsg({ kind: "ok", text: `Imported ${r.candles} ${r.symbol} ${r.timeframe} candles as ${r.source}.` }); ds.reload();
    } catch (e: any) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(null); }
  };

  const d = detail.data;
  return (
    <Screen title="Backtesting" error={ds.error ?? runs.error} onRefresh={() => { ds.reload(); runs.reload(); }}>
      {msg ? <Notice kind={msg.kind} text={msg.text} /> : null}
      <Grid min={340}>
        <Card title="Historical data">
          <Table rows={ds.data ?? []} empty="No candles stored yet. Import real history below." keyOf={(r: any) => r.symbol + r.timeframe + r.source} cols={[
            { key: "s", title: "Symbol", render: (r: any) => r.symbol },
            { key: "t", title: "TF", flex: 0.5, render: (r: any) => r.timeframe },
            { key: "src", title: "Source", flex: 1.4, render: (r: any) => <Row><T small>{r.source}</T>{r.synthetic ? <Badge text="synthetic" color={C.warn} /> : null}</Row> },
            { key: "n", title: "Candles", align: "right", render: (r: any) => r.candles.toLocaleString() },
            { key: "r", title: "Range", flex: 1.6, hideNarrow: true, render: (r: any) => `${r.start.slice(0, 10)} → ${r.end.slice(0, 10)}` },
          ]} />
          <Row style={{ marginTop: 10 }}>
            <Btn small label="Import BTCUSDT (Binance, 1y M5)" onPress={importBinance} busy={busy === "binance"} />
            <Btn small label={`Import CSV for ${symbol || "EURUSD"}`} onPress={() => importCsv(symbol || "EURUSD")} busy={busy === "csv"} />
          </Row>
          <T dim small style={{ marginTop: 8 }}>CSV: generic time,open,high,low,close[,volume][,spread] or a MetaTrader 5 history export. Forex and gold history comes from your MT5 terminal (File → Export) or the MT5 bridge.</T>
        </Card>
        <Card title="Run">
          <T dim small>Data source</T>
          <Seg value={source} options={sources.map((s) => ({ value: s, label: s }))} onChange={setSource} />
          {source.startsWith("synthetic") ? <View style={{ marginTop: 8 }}><Synthetic /></View> : null}
          <T dim small style={{ marginTop: 8 }}>Session engine</T>
          <Seg value={engine} options={ENG} onChange={setEngine} />
          <T dim small style={{ marginTop: 8 }}>Instrument</T>
          <Seg value={symbol} options={[{ value: "", label: "All with data" }, ...available.map((s) => ({ value: s, label: s }))]} onChange={setSymbol} />
          <TextInput mode="outlined" dense label="Initial balance (USD)" value={balance} onChangeText={setBalance} keyboardType="numeric" style={{ marginTop: 10 }} />
          <Row style={{ marginTop: 10 }}>
            <Btn label="Backtest portfolio" kind="primary" onPress={() => run("backtests")} busy={busy === "backtests"} disabled={!source} />
            <Btn label="Research & validate" onPress={() => run("research")} busy={busy === "research"} disabled={!source} />
          </Row>
          <T dim small style={{ marginTop: 8 }}>Research selects parameters on training data only, then runs walk-forward, Monte Carlo and cost-stress tests and one out-of-sample confirmation. Most candidates are expected to fail.</T>
        </Card>
      </Grid>
      <Card title="Runs">
        <Table rows={runs.data ?? []} empty="No runs yet." onPress={(r: any) => setOpenId(r.id)} keyOf={(r: any) => String(r.id)} cols={[
          { key: "id", title: "#", flex: 0.4, render: (r: any) => String(r.id) },
          { key: "k", title: "Kind", render: (r: any) => <Row><T small>{r.kind}</T>{r.synthetic ? <Badge text="synthetic" color={C.warn} /> : null}</Row> },
          { key: "st", title: "Status", render: (r: any) => <Badge text={r.status === "running" ? `running ${(r.progress * 100).toFixed(0)}%` : r.status}
              color={r.status === "done" ? C.up : r.status === "failed" ? C.down : C.warn} /> },
          { key: "src", title: "Source", hideNarrow: true, render: (r: any) => r.data_source },
          { key: "w", title: "When", hideNarrow: true, render: (r: any) => ist(r.created_at) },
          { key: "res", title: "Result", flex: 1.4, align: "right", render: (r: any) => !r.summary ? "—" : r.kind === "research"
              ? `${r.summary.passed}/${r.summary.candidates} passed` : <T color={pnlColor(r.summary.net_profit)}>{signed(r.summary.net_profit)} · {r.summary.trades} tr</T> },
        ]} />
      </Card>
      {openId && !d ? <Loading /> : null}
      {d ? (
        <View style={{ gap: 12 }}>
          <Row><T bold>Run #{d.id} · {d.kind}</T><Badge text={d.status} /><T dim small>{d.data_source} · code {d.code_version}</T></Row>
          {d.synthetic ? <Synthetic /> : null}
          {d.error ? <Notice kind="error" text={d.error.split("\n")[0]} /> : null}
          {d.kind === "backtest" && d.report ? (
            <>
              <Report rep={d.report} initial={d.request.initial_balance} />
              <Card title="Assumptions and rejected signals">
                <KV k="Data range" v={d.report.data_range ? `${d.report.data_range[0].slice(0, 10)} → ${d.report.data_range[1].slice(0, 10)}` : "—"} />
                <KV k="Signals generated" v={String(d.report.signals_total)} />
                {Object.entries(d.report.rejections ?? {}).map(([k, v]) => <KV key={k} k={`Rejected: ${k}`} v={String(v)} />)}
                {Object.entries(d.report.assumptions ?? {}).map(([k, v]) => <KV key={k} k={k} v={String(v)} />)}
              </Card>
              <Card title={`Trade journal (${d.trades?.length ?? 0})`}>
                <Table rows={(d.trades ?? []).slice(-200).reverse()} keyOf={(t: any, i) => t.entry_time + i} cols={[
                  { key: "t", title: "Entry (IST)", flex: 1.3, render: (t: any) => ist(t.entry_time) },
                  { key: "s", title: "Symbol", render: (t: any) => <Row><T small>{t.symbol}</T><Badge text={t.side} color={t.side === "buy" ? C.up : C.down} /></Row> },
                  { key: "st", title: "Strategy", flex: 1.5, hideNarrow: true, render: (t: any) => `${t.strategy} ${t.timeframe}` },
                  { key: "e", title: "Entry", align: "right", hideNarrow: true, render: (t: any) => price(t.entry, t.symbol) },
                  { key: "x", title: "Exit", align: "right", hideNarrow: true, render: (t: any) => price(t.exit, t.symbol) },
                  { key: "why", title: "Reason", hideNarrow: true, render: (t: any) => t.exit_reason.replace("_", " ") },
                  { key: "seg", title: "Segment", hideNarrow: true, render: (t: any) => t.segment.replace(/_/g, " ") },
                  { key: "r", title: "R", align: "right", flex: 0.6, render: (t: any) => <T color={pnlColor(t.r)}>{signed(t.r)}</T> },
                  { key: "p", title: "P&L", align: "right", render: (t: any) => <T color={pnlColor(t.pnl)}>{signed(t.pnl)}</T> },
                ]} />
              </Card>
            </>
          ) : null}
          {d.kind === "research" ? (
            <Card title={`Candidates (${d.candidates.length}) — selection used training data only`}>
              <Table rows={d.candidates} empty={d.status === "running" ? "Research is running…" : "No candidates."} keyOf={(c: any) => c.plan_id} cols={[
                { key: "p", title: "Plan", flex: 2.4, render: (c: any) => <View><T small bold>{c.plan_id}</T>{c.failures.length ? <T dim small numberOfLines={2}>{c.failures.join("; ")}</T> : null}</View> },
                { key: "v", title: "Verdict", render: (c: any) => <Badge text={c.verdict} color={c.verdict === "passed" ? C.up : C.down} /> },
                { key: "tn", title: "Train n", align: "right", hideNarrow: true, render: (c: any) => String(c.train.trades) },
                { key: "te", title: "Train R", align: "right", render: (c: any) => <T color={pnlColor(c.train.expectancy_r)}>{signed(c.train.expectancy_r)}</T> },
                { key: "pf", title: "Train PF", align: "right", hideNarrow: true, render: (c: any) => num(c.train.profit_factor) },
                { key: "ps", title: "Stability", align: "right", hideNarrow: true, render: (c: any) => num(c.param_stability) },
                { key: "on", title: "OOS n", align: "right", hideNarrow: true, render: (c: any) => String(c.out_of_sample.trades) },
                { key: "oe", title: "OOS R", align: "right", render: (c: any) => <T color={pnlColor(c.out_of_sample.expectancy_r)}>{signed(c.out_of_sample.expectancy_r)}</T> },
              ]} />
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
