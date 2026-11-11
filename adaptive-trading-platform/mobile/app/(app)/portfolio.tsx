import React, { useState } from "react";
import { api } from "@/api";
import { useApi, useApp } from "@/state";
import { C, ist, money, pnlColor, price, signed } from "@/theme";
import { Badge, Btn, Card, Notice, Row, Screen, Stat, Stats, T, Table } from "@/ui";

export default function Portfolio() {
  const { account, reloadAccounts } = useApp();
  const pos = useApi<any[]>(account ? `/accounts/${account.id}/positions` : null, 4000);
  const [msg, setMsg] = useState<string | null>(null);
  if (!account) return <Screen title="Portfolio"><Notice text="No account." /></Screen>;
  const rows = pos.data ?? [];
  const risk = rows.reduce((s, p) => s + p.risk_usd, 0);
  const floating = rows.reduce((s, p) => s + p.floating_pnl, 0);
  const close = async (p: any) => {
    try { await api(`/positions/${p.id}/close`, { method: "POST" }); setMsg(null); pos.reload(); reloadAccounts(); }
    catch (e: any) { setMsg(e.message); }
  };
  return (
    <Screen title="Portfolio" error={pos.error} onRefresh={pos.reload} refreshing={pos.loading}>
      {msg ? <Notice kind="error" text={msg} /> : null}
      <Card title="Exposure">
        <Stats>
          <Stat label="Open positions" value={`${rows.length} / ${account.risk_config.max_positions}`} />
          <Stat label="Floating P&L" value={signed(floating)} color={pnlColor(floating)} />
          <Stat label="Open risk" value={money(risk)} sub={account.equity ? `${((risk / account.equity) * 100).toFixed(2)}% of equity` : undefined} />
          <Stat label="Margin used" value={money(account.margin_used)} sub={`free ${money(account.free_margin)}`} />
          <Stat label="Risk / trade" value={`${(account.risk_config.risk_per_trade * 100).toFixed(2)}%`} />
          <Stat label="Daily loss limit" value={`${(account.risk_config.max_daily_loss * 100).toFixed(1)}%`} />
        </Stats>
      </Card>
      <Card title="Open positions">
        <Table rows={rows} empty="No open positions." keyOf={(p: any) => String(p.id)} cols={[
          { key: "s", title: "Symbol", flex: 1.3, render: (p: any) => <Row><T bold>{p.symbol}</T><Badge text={p.side} color={p.side === "buy" ? C.up : C.down} />{p.status === "closing" ? <Badge text="close pending" color={C.warn} /> : null}</Row> },
          { key: "v", title: "Size", align: "right", render: (p: any) => String(p.volume) },
          { key: "e", title: "Entry", align: "right", render: (p: any) => price(p.entry_price, p.symbol), hideNarrow: true },
          { key: "c", title: "Current", align: "right", render: (p: any) => price(p.last_price, p.symbol) },
          { key: "sl", title: "Stop", align: "right", render: (p: any) => price(p.sl, p.symbol), hideNarrow: true },
          { key: "tp", title: "Target", align: "right", render: (p: any) => price(p.tp, p.symbol), hideNarrow: true },
          { key: "r", title: "Risk", align: "right", render: (p: any) => money(p.risk_usd), hideNarrow: true },
          { key: "o", title: "Opened", flex: 1.2, render: (p: any) => ist(p.opened_at), hideNarrow: true },
          { key: "p", title: "P&L", align: "right", render: (p: any) => <T color={pnlColor(p.floating_pnl)}>{signed(p.floating_pnl)}</T> },
          { key: "x", title: "", align: "right", render: (p: any) => account.mode === "paper" ? <Btn small label="Close" onPress={() => close(p)} /> : null },
        ]} />
        <T dim small style={{ marginTop: 8 }}>Manual close needs a current market price. Without one the request is refused rather than filled at a stale price.</T>
      </Card>
    </Screen>
  );
}
