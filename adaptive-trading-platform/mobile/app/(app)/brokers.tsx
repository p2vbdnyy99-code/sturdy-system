import React, { useState } from "react";
import { View } from "react-native";
import { TextInput } from "react-native-paper";
import { api, ApiError } from "@/api";
import { useApi, useApp } from "@/state";
import { C, ist } from "@/theme";
import { Badge, Btn, Card, Grid, KV, Loading, Notice, Row, Screen, Seg, T } from "@/ui";

const eColor = (s: string) => s === "ok" ? C.up : s === "blocked" ? C.down : C.warn;
const iColor = (s: string) => s === "tested" ? C.up : s === "not_implemented" ? C.down : C.warn;

export default function Brokers() {
  const { accounts, account, reloadAccounts, selectAccount } = useApp();
  const brokers = useApi<any>("/brokers");
  const conns = useApi<any[]>("/broker-connections", 0);
  const live = accounts.filter((a) => a.mode === "live");
  const [checkId, setCheckId] = useState<number | null>(null);
  const chk = useApi<any>(checkId ? `/accounts/${checkId}/live/checklist` : null, 0);
  const [kind, setKind] = useState("mt5");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [k1, setK1] = useState("");
  const [k2, setK2] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const act = async (name: string, fn: () => Promise<string | void>) => {
    setBusy(name); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ kind: "ok", text: t }); conns.reload(); chk.reload(); await reloadAccounts(); }
    catch (e: any) {
      const d = e instanceof ApiError ? e.detail : null;
      setMsg({ kind: "error", text: d?.reasons ? `${d.message ?? "Blocked."} ${d.reasons.join(" ")}` : e.message });
    } finally { setBusy(null); }
  };
  const isMt5 = kind === "mt5" || kind === "exness_mt5";
  return (
    <Screen title="Broker Connections" error={brokers.error ?? conns.error} onRefresh={() => { brokers.reload(); conns.reload(); }}>
      {msg ? <Notice kind={msg.kind} text={msg.text} /> : null}
      <Notice kind="warn" text={`Declared country of residence: ${brokers.data?.jurisdiction ?? "…"}. Live execution is off by default and stays locked until every check below passes. Eligibility checks are a conservative safeguard, not legal advice.`} />
      <Card title="Brokers and eligibility">
        {!brokers.data ? <Loading /> : brokers.data.brokers.map((b: any) => (
          <View key={b.key} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 }}>
            <Row><T bold>{b.name}</T><Badge text={b.integration_status.replace(/_/g, " ")} color={iColor(b.integration_status)} /></Row>
            <T dim small>{b.notes}</T>
            {Object.values(Object.entries(b.eligibility).reduce((acc: Record<string, any>, [ac, e]: [string, any]) => {
              const k = e.status + e.reasons.join("|");
              (acc[k] ??= { e, classes: [] }).classes.push(ac);
              return acc;
            }, {})).map((g: any) => (
              <View key={g.classes.join()}>
                <Row>{g.classes.map((ac: string) => <Badge key={ac} text={ac.replace("_", " ")} />)}<Badge text={g.e.status.replace("_", " ")} color={eColor(g.e.status)} /></Row>
                {g.e.status !== "ok" ? <T dim small>{g.e.reasons.join(" ")}</T> : null}
              </View>
            ))}
          </View>
        ))}
      </Card>
      <Grid min={340}>
        <Card title="Add connection">
          <Seg value={kind} options={[{ value: "mt5", label: "MT5 bridge" }, { value: "exness_mt5", label: "Exness (MT5)" }, { value: "binance_spot", label: "Binance Spot" }, { value: "binance_usdm", label: "Binance Futures" }]} onChange={setKind} />
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput mode="outlined" dense label="Label" value={label} onChangeText={setLabel} />
            {isMt5 ? <TextInput mode="outlined" dense label="Bridge URL (private network)" value={url} onChangeText={setUrl} autoCapitalize="none" /> : null}
            <TextInput mode="outlined" dense label={isMt5 ? "Bridge shared secret" : "API key"} value={k1} onChangeText={setK1} autoCapitalize="none" secureTextEntry={isMt5} />
            {!isMt5 ? <TextInput mode="outlined" dense label="API secret" value={k2} onChangeText={setK2} autoCapitalize="none" secureTextEntry /> : null}
            <Btn label="Save connection" disabled={!label || !k1} busy={busy === "add"} onPress={() => act("add", async () => {
              await api("/broker-connections", { body: { broker: kind, label, config: isMt5 ? { bridge_url: url } : {},
                credentials: isMt5 ? { bridge_secret: k1 } : { api_key: k1, api_secret: k2 } } });
              setK1(""); setK2(""); return "Saved. Secrets are encrypted on the server and are not kept on this device.";
            })} />
          </View>
          <T dim small style={{ marginTop: 8 }}>Broker passwords are never entered here: MT5 logs in inside the terminal on your Windows machine. Exchange keys must not have withdrawal permission; such keys are refused.</T>
        </Card>
        <Card title="Connections">
          {(conns.data ?? []).length === 0 ? <T dim>No broker connections.</T> : null}
          {(conns.data ?? []).map((c) => (
            <View key={c.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 }}>
              <Row><T bold>{c.label}</T><Badge text={c.broker_name} /><Badge text={c.status} color={c.status === "ok" ? C.up : c.status === "failed" ? C.down : C.warn} /><Badge text={`account: ${c.account_type}`} /></Row>
              {c.last_test_at ? <T dim small>Last test {ist(c.last_test_at)}{c.last_test_result?.error ? ` — ${c.last_test_result.error}` : ""}</T> : <T dim small>Never tested. A connection is only "ok" after a real test passes.</T>}
              <Row>
                <Btn small label="Test connection" busy={busy === `t${c.id}`} onPress={() => act(`t${c.id}`, async () => { const r = await api<any>(`/broker-connections/${c.id}/test`, { method: "POST" }); return `Test result: ${r.status}.`; })} />
                <Btn small label="Create live account record" onPress={() => act(`l${c.id}`, async () => { const r = await api<any>("/accounts/live", { body: { name: `${c.label} (live)`, connection_id: c.id } }); setCheckId(r.id); return "Live account record created. Execution remains disabled."; })} />
                <Btn small label="Delete" onPress={() => act(`d${c.id}`, async () => { await api(`/broker-connections/${c.id}`, { method: "DELETE" }); })} />
              </Row>
            </View>
          ))}
        </Card>
      </Grid>
      <Card title="Live trading activation">
        {live.length === 0 ? <T dim>No live account record exists. Paper trading does not need one.</T> : (
          <Row>{live.map((a) => <Btn key={a.id} small label={`${a.name}${a.live_enabled ? " · LIVE ON" : ""}`} kind={checkId === a.id ? "primary" : "default"} onPress={() => setCheckId(a.id)} />)}</Row>
        )}
        {chk.data ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            {chk.data.items.map((i: any) => (
              <View key={i.key} style={{ paddingVertical: 5 }}>
                <Row><Badge text={i.ok ? "pass" : "fail"} color={i.ok ? C.up : C.down} /><T bold small>{i.title}</T></Row>
                <T dim small>{i.detail}</T>
              </View>
            ))}
            <KV k="Eligible for activation" v={chk.data.eligible ? "yes" : "no"} color={chk.data.eligible ? C.up : C.down} />
            <Row>
              <Btn small label="Run risk-control self-test" busy={busy === "st"} onPress={() => act("st", async () => { const r = await api<any>(`/accounts/${checkId}/live/selftest`, { method: "POST" }); return `Risk self-test ${r.passed ? "passed" : "FAILED"}.`; })} />
              {account?.id !== checkId ? <Btn small label="View this account" onPress={() => selectAccount(checkId!)} /> : null}
              <Btn small label="Disable live" onPress={() => act("off", async () => { await api(`/accounts/${checkId}/live/disable`, { method: "POST" }); })} />
            </Row>
            {chk.data.eligible ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Notice kind="error" text="Step 1 of 2: re-enter your password to receive a one-time code. Step 2: enter the code and type the confirmation phrase. The first live order will still wait for a separate confirmation." />
                <TextInput mode="outlined" dense label="Password" value={pw} onChangeText={setPw} secureTextEntry />
                <Btn small label="Step 1: request code" kind="danger" disabled={!pw} onPress={() => act("arm", async () => { const r = await api<any>(`/accounts/${checkId}/live/arm`, { body: { password: pw } }); return `Confirmation code: ${r.confirmation_code} (valid 5 minutes).`; })} />
                <TextInput mode="outlined" dense label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" />
                <TextInput mode="outlined" dense label={`Type: ${chk.data.confirm_phrase}`} value={phrase} onChangeText={setPhrase} autoCapitalize="characters" />
                <Btn small label="Step 2: ENABLE LIVE TRADING" kind="danger" disabled={!code || phrase !== chk.data.confirm_phrase}
                  onPress={() => act("confirm", async () => { await api(`/accounts/${checkId}/live/confirm`, { body: { code, phrase } }); return "Live trading enabled for this account."; })} />
                {chk.data.live_enabled && !chk.data.first_live_order_confirmed
                  ? <Btn small kind="danger" label="Confirm first live order" disabled={!pw} onPress={() => act("first", async () => { await api(`/accounts/${checkId}/live/confirm-first-order`, { body: { password: pw } }); return "First live order confirmed."; })} /> : null}
              </View>
            ) : <Notice text="Activation controls appear only when every check passes. Live execution is switched off again on every server restart." />}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
