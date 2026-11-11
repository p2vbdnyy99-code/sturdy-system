import React, { useState } from "react";
import { api } from "@/api";
import { Report } from "@/report";
import { useApi, useApp } from "@/state";
import { Btn, Card, Loading, Notice, Row, Screen, Synthetic, T } from "@/ui";

export default function Analytics() {
  const { account } = useApp();
  const { data, error, loading, reload } = useApi<any>(account ? `/accounts/${account.id}/analytics` : null, 20000);
  const [weekly, setWeekly] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  if (!account) return <Screen title="Analytics"><Notice text="No account." /></Screen>;
  const loadWeekly = async (narrate: boolean) => {
    setBusy(true);
    try { setWeekly(await api(`/accounts/${account.id}/reports/weekly?narrate=${narrate}`)); } catch (e: any) { setWeekly({ summary: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <Screen title="Analytics" error={error} onRefresh={reload} refreshing={loading}>
      {data?.synthetic ? <Synthetic /> : null}
      {account.feed?.type === "replay" ? <Notice kind="warn" text="This account's history was produced by replaying stored candles, not by real-time paper trading." /> : null}
      {!data ? <Loading /> : !data.summary.trades ? <Notice text="No closed trades on this account yet. Performance statistics appear once trades have closed." />
        : <Report rep={data} initial={account.initial_balance} />}
      <Card title="Weekly report">
        <Row>
          <Btn small label="Generate" onPress={() => loadWeekly(false)} busy={busy} />
          <Btn small label="Generate with AI wording" onPress={() => loadWeekly(true)} disabled={busy} />
        </Row>
        {weekly ? (
          <>
            <T style={{ marginTop: 8 }}>{weekly.summary}</T>
            {weekly.deteriorating_strategies?.map((d: any) => <Notice key={d.plan_id} kind="error" text={`${d.plan_id}: ${d.reason}`} />)}
            {weekly.narrative ? <Notice text={`${weekly.narrative.text}\n\n${weekly.narrative.notice}`} /> : null}
          </>
        ) : null}
        <T dim small style={{ marginTop: 8 }}>Figures are computed from the journal. AI wording is optional, requires a server-side API key, and only rephrases these figures.</T>
      </Card>
    </Screen>
  );
}
