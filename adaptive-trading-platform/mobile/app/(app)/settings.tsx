import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Switch, TextInput } from "react-native-paper";
import { api, getServer } from "@/api";
import { registerPush } from "@/push";
import { useApi, useApp } from "@/state";
import { C, ist } from "@/theme";
import { Btn, Card, Grid, KV, Loading, Notice, Row, Screen, Seg, T, Table } from "@/ui";

export default function Settings() {
  const { account, user, signOut, reloadAccounts } = useApp();
  const st = useApi<any>("/settings");
  const notes = useApi<any[]>("/notifications?limit=30", 15000);
  const [risk, setRisk] = useState<Record<string, string>>({});
  const [country, setCountry] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const rc = account?.risk_config;
  useEffect(() => {
    if (rc) setRisk({ risk_per_trade: String(rc.risk_per_trade * 100), max_daily_loss: String(rc.max_daily_loss * 100),
      max_positions: String(rc.max_positions), max_consecutive_losses: String(rc.max_consecutive_losses), min_rr: String(rc.min_rr) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, JSON.stringify(rc)]);
  const act = async (fn: () => Promise<string | void>) => {
    setMsg(null);
    try { const t = await fn(); setMsg({ kind: "ok", text: t || "Saved." }); st.reload(); await reloadAccounts(); }
    catch (e: any) { setMsg({ kind: "error", text: e.message }); }
  };
  const s = st.data;
  return (
    <Screen title="Settings" error={st.error} onRefresh={st.reload}>
      {msg ? <Notice kind={msg.kind} text={msg.text} /> : null}
      {!s ? <Loading /> : (
        <Grid min={340}>
          <Card title="Risk limits (this account)">
            {account ? (
              <View style={{ gap: 8 }}>
                {[["risk_per_trade", "Risk per trade (% of equity)"], ["max_daily_loss", "Maximum daily loss (%)"], ["max_positions", "Maximum simultaneous positions"],
                  ["max_consecutive_losses", "Maximum consecutive losses"], ["min_rr", "Minimum reward/risk (net of costs)"]].map(([k, label]) => (
                  <TextInput key={k} mode="outlined" dense label={label} value={risk[k] ?? ""} keyboardType="numeric" onChangeText={(v) => setRisk({ ...risk, [k]: v })} />
                ))}
                <Btn label="Save risk limits" onPress={() => act(async () => {
                  await api(`/accounts/${account.id}/risk`, { method: "PATCH", body: { risk_per_trade: Number(risk.risk_per_trade) / 100,
                    max_daily_loss: Number(risk.max_daily_loss) / 100, max_positions: Number(risk.max_positions),
                    max_consecutive_losses: Number(risk.max_consecutive_losses), min_rr: Number(risk.min_rr) } });
                })} />
                <T dim small>Hard bounds are enforced by the server (risk per trade at most 2%). Position size never increases after losses; martingale and grid sizing do not exist in this system.</T>
              </View>
            ) : <T dim>No account.</T>}
          </Card>
          <Card title="Trading sessions (displayed in IST)">
            {s.sessions.map((x: any) => <KV key={x.key} k={x.name} v={`${x.ist_start}–${x.ist_end} IST${x.tz !== "Asia/Kolkata" ? ` (${x.start}–${x.end} ${x.tz})` : ""}`} color={x.active ? C.up : undefined} />)}
            <View style={{ height: 8 }} />
            <Seg value={s.sessions[1].tz === "Asia/Kolkata" ? "ist_fixed" : "dst_anchored"}
              options={[{ value: "ist_fixed", label: "Fixed IST windows" }, { value: "dst_anchored", label: "Follow London/New York DST" }]}
              onChange={(v) => act(async () => { await api("/settings", { method: "PATCH", body: { session_preset: v } }); })} />
            <T dim small style={{ marginTop: 8 }}>India has no daylight saving; London and New York do, so their opens move by an hour in IST during the year. Choose whether windows stay fixed in IST or follow the market clocks.</T>
          </Card>
          <Card title="Notifications">
            {Object.entries(s.notification_kinds).map(([k, label]: [string, any]) => (
              <Row key={k} style={{ justifyContent: "space-between" }}>
                <T>{label}</T>
                <Switch value={s.notifications[k]} onValueChange={(v) => act(async () => { await api("/settings", { method: "PATCH", body: { notifications: { [k]: v } } }); })} />
              </Row>
            ))}
            <View style={{ height: 8 }} />
            <Btn small label="Enable push on this device" onPress={() => act(async () => registerPush())} />
          </Card>
          <Card title="Residency and account">
            <KV k="Signed in as" v={`${user?.email} (${user?.role})`} />
            <KV k="Server" v={getServer()} />
            <KV k="Declared country of residence" v={s.jurisdiction} />
            <Row style={{ marginTop: 6 }}>
              <View style={{ flex: 1 }}><TextInput mode="outlined" dense label="ISO country code (e.g. IN)" value={country} onChangeText={setCountry} autoCapitalize="characters" maxLength={2} /></View>
              <Btn small label="Declare" disabled={country.length !== 2} onPress={() => act(async () => { await api("/settings", { method: "PATCH", body: { jurisdiction: country, confirm_residency: true } }); return "Residency declaration recorded in the audit log."; })} />
            </Row>
            <T dim small style={{ marginTop: 6 }}>This declaration drives the broker eligibility gate and is audit-logged. A false declaration does not make a transaction lawful.</T>
            <View style={{ height: 10 }} />
            <Btn label="Sign out" onPress={signOut} />
          </Card>
        </Grid>
      )}
      <Card title="Recent notifications" right={<Btn small label="Mark read" onPress={async () => { await api("/notifications/read", { method: "POST" }); notes.reload(); }} />}>
        <Table rows={notes.data ?? []} empty="No notifications." keyOf={(n: any) => String(n.id)} cols={[
          { key: "t", title: "Time", render: (n: any) => ist(n.created_at) },
          { key: "k", title: "Type", flex: 1.3, render: (n: any) => <T small bold={!n.read}>{n.title}</T> },
          { key: "b", title: "Message", flex: 3, render: (n: any) => <T small dim numberOfLines={2}>{n.body}</T> },
          { key: "p", title: "Push", align: "right", hideNarrow: true, render: (n: any) => n.push_status.replace(/_/g, " ") },
        ]} />
      </Card>
    </Screen>
  );
}
