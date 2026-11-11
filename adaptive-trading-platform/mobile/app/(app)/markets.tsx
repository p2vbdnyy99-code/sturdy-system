import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { CandleChart } from "@/charts";
import { useApi, useApp, useLayout } from "@/state";
import { C, ist, price, signed } from "@/theme";
import { Badge, Card, KV, Loading, Notice, Row, Screen, Seg, Synthetic, T } from "@/ui";

const TFS = ["M1", "M5", "M15", "M30", "H1", "H4"].map((v) => ({ value: v, label: v }));

export default function Markets() {
  const { quotes } = useApp();
  const { wide } = useLayout();
  const { data: rows, error, loading, reload } = useApi<any[]>("/markets", 10000);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [tf, setTf] = useState("M15");
  const { data: cd } = useApi<any>(`/markets/${symbol}/candles?timeframe=${tf}&limit=400`, 30000);
  const { data: an } = useApi<any>(`/markets/${symbol}/analysis?timeframe=${tf === "M1" || tf === "M5" ? "M15" : tf}`, 60000);
  const list = (
    <Card title="Instruments">
      {!rows ? <Loading /> : rows.map((r) => {
        const q = quotes[r.symbol];
        const live = r.live || !!q;
        const px = q ? (q.bid + q.ask) / 2 : r.price;
        return (
          <Pressable key={r.symbol} onPress={() => setSymbol(r.symbol)} accessibilityRole="button"
            style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: r.symbol === symbol ? C.panel2 : "transparent", paddingHorizontal: 6 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row><T bold>{r.symbol}</T><Badge text={r.asset_class.replace("_", " ")} />{r.synthetic ? <Badge text="synthetic" color={C.warn} /> : null}</Row>
              <T bold color={px === null ? C.dim : C.text}>{px === null ? "unavailable" : price(px, r.symbol)}</T>
            </Row>
            <Row style={{ justifyContent: "space-between", marginTop: 2 }}>
              <T dim small>{live ? `bid ${price(q?.bid ?? r.bid, r.symbol)} · ask ${price(q?.ask ?? r.ask, r.symbol)} · spr ${price((q ? q.ask - q.bid : r.spread), r.symbol)}`
                : px === null ? "No market data" : `last stored candle ${ist(r.as_of)} · not live`}</T>
              <Row>
                {r.daily_change_pct !== null ? <T small color={r.daily_change_pct >= 0 ? C.up : C.down}>{signed(r.daily_change_pct, 2, "%")}</T> : null}
                {r.trend ? <Badge text={`trend ${r.trend}`} color={r.trend === "up" ? C.up : r.trend === "down" ? C.down : C.dim} /> : null}
              </Row>
            </Row>
            <T dim small>{r.market_open ? "market open" : "market closed"} · vol {r.volatility ?? "n/a"} · strategies {r.strategies.enabled} on / {r.strategies.validated} validated{r.spec_verified ? "" : " · spec unverified"}</T>
          </Pressable>
        );
      })}
    </Card>
  );
  const chart = (
    <View style={{ gap: 12 }}>
      <Card title={`${symbol} · ${tf}`} right={<Seg value={tf} options={TFS} onChange={setTf} />}>
        {cd?.synthetic ? <Synthetic /> : null}
        {!cd ? <Loading /> : cd.available
          ? <CandleChart candles={cd.candles} symbol={symbol} height={wide ? 380 : 280}
              overlays={[{ values: cd.ema20, color: C.warn, label: "EMA20" }, { values: cd.ema50, color: C.info, label: "EMA50" }]} />
          : <Notice kind="warn" text={cd.message} />}
        {cd?.available ? <T dim small>Source: {cd.source} · stored candles, times in IST. Drag across the chart for values.</T> : null}
      </Card>
      <Card title="Market analysis (rule-based)">
        {!an ? <Loading /> : !an.available ? <Notice kind="warn" text={an.message} /> : (
          <>
            <T>{an.summary}</T>
            <View style={{ marginTop: 8 }}>
              <KV k="Trend / strength" v={`${an.trend} / ${an.trend_strength} (ADX ${an.adx.toFixed(0)})`} />
              <KV k="RSI(14)" v={an.rsi.toFixed(1)} />
              <KV k="Swing structure" v={an.structure} />
              <KV k="Volatility" v={`${an.volatility_state} (ATR pct ${(an.atr_percentile * 100).toFixed(0)}%)`} color={an.unusual_volatility ? C.warn : undefined} />
              <KV k="As of" v={ist(an.as_of)} />
            </View>
            {an.conflicts.map((c: string) => <Notice key={c} kind="warn" text={c} />)}
            <T dim small style={{ marginTop: 6 }}>Computed from stored candles. Not a forecast or a probability.</T>
          </>
        )}
      </Card>
    </View>
  );
  return (
    <Screen title="Markets" error={error} onRefresh={reload} refreshing={loading}>
      {wide ? <View style={{ flexDirection: "row", gap: 12 }}><View style={{ width: 400 }}>{list}</View><View style={{ flex: 1, minWidth: 0 }}>{chart}</View></View>
        : <>{chart}{list}</>}
    </Screen>
  );
}
