import React, { useState } from "react";
import { View } from "react-native";
import { Switch } from "react-native-paper";
import { api } from "@/api";
import { useApi } from "@/state";
import { C, num } from "@/theme";
import { Badge, Card, Loading, Notice, Row, Screen, Seg, T } from "@/ui";

const ENG = [{ value: "all", label: "All" }, { value: "asia", label: "A · Asian" }, { value: "london", label: "B · London" }, { value: "newyork", label: "C · New York" }];
const vColor = (s: string) => s === "passed" ? C.up : s === "failed" ? C.down : s === "needs_revalidation" ? C.warn : C.dim;

export default function Strategies() {
  const { data, error, loading, reload } = useApi<any[]>("/strategies", 15000);
  const { data: cat } = useApi<any>("/strategies/catalogue");
  const [engine, setEngine] = useState("all");
  const [onlyPassed, setOnlyPassed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = async (c: any, enabled: boolean) => {
    try { await api(`/strategies/${c.id}`, { method: "PATCH", body: { enabled } }); setMsg(null); reload(); }
    catch (e: any) { setMsg(e.message); }
  };
  const rows = (data ?? []).filter((c) => (engine === "all" || c.engine === engine) && (!onlyPassed || c.validation_status === "passed"));
  return (
    <Screen title="Strategies" error={error} onRefresh={reload} refreshing={loading}>
      {msg ? <Notice kind="error" text={msg} /> : null}
      <Row style={{ justifyContent: "space-between" }}>
        <Seg value={engine} options={ENG} onChange={setEngine} />
        <Row><T dim small>Validated only</T><Switch value={onlyPassed} onValueChange={setOnlyPassed} /></Row>
      </Row>
      {!data ? <Loading /> : !data.length ? (
        <Notice text={`No strategy has been researched yet. ${cat ? cat.engines.reduce((n: number, e: any) => n + e.candidates.length, 0) : ""} candidate plans exist across the three session engines; none is assumed profitable. Import data and run research from Backtesting.`} />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {rows.map((c) => (
          <Card key={c.id} style={{ flexGrow: 1, flexBasis: 320, minWidth: 0 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1 }}>
                <T bold>{c.name}</T>
                <T dim small>{c.label} · v{c.version}</T>
              </View>
              <Switch value={c.enabled} onValueChange={(v) => toggle(c, v)} disabled={c.status === "suspended"} />
            </Row>
            <Row style={{ marginVertical: 8 }}>
              <Badge text={c.symbol} color={C.accent} /><Badge text={c.timeframe} /><Badge text={c.engine} />
              <Badge text={c.validation_status.replace("_", " ")} color={vColor(c.validation_status)} />
              {c.validated_on_synthetic ? <Badge text="synthetic data" color={C.warn} /> : null}
              {c.status === "suspended" ? <Badge text="suspended" color={C.down} /> : c.enabled ? <Badge text="enabled" color={C.up} /> : null}
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              {[["Expectancy", c.metrics.expectancy_r === null || c.metrics.expectancy_r === undefined ? "—" : `${num(c.metrics.expectancy_r)}R`],
                ["Profit factor", num(c.metrics.profit_factor)], ["Max DD", c.metrics.max_drawdown_pct === undefined ? "—" : `${num(c.metrics.max_drawdown_pct, 1)}%`],
                ["Trades", String(c.metrics.trades ?? "—")], ["OOS exp.", c.metrics.oos_expectancy_r === null || c.metrics.oos_expectancy_r === undefined ? "—" : `${num(c.metrics.oos_expectancy_r)}R`]].map(([k, v]) => (
                <View key={k}><T dim small>{k}</T><T bold>{v}</T></View>
              ))}
            </Row>
            {c.metrics.failures?.length ? <T dim small style={{ marginTop: 8 }}>Failed: {c.metrics.failures.slice(0, 3).join("; ")}{c.metrics.failures.length > 3 ? ` (+${c.metrics.failures.length - 3})` : ""}</T> : null}
            {c.suspended_reason ? <Notice kind="error" text={`Suspended: ${c.suspended_reason}. Revalidation required.`} /> : null}
            {c.health?.flags?.length && c.status !== "suspended" ? <Notice kind="warn" text={c.health.flags.join("; ")} /> : null}
            {c.enabled && c.validation_status !== "passed" ? <T small color={C.warn} style={{ marginTop: 6 }}>Enabled without a passed validation: paper trading only.</T> : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
