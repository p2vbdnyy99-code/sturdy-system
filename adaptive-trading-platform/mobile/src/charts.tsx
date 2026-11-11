import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { C, ist, mono, price as fmtPrice } from "./theme";

function useWidth() {
  const [w, setW] = useState(0);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width)) };
}
const niceTicks = (lo: number, hi: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

export type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };

/** Interactive candlestick chart: drag (or hover on desktop) for a crosshair with OHLC read-out. */
export function CandleChart({ candles, overlays = [], height = 300, symbol = "", levels = [] }: {
  candles: Candle[]; overlays?: { values: (number | null)[]; color: string; label: string }[]; height?: number;
  symbol?: string; levels?: { value: number; color: string; label: string }[];
}) {
  const { w, onLayout } = useWidth();
  const [cursor, setCursor] = useState<number | null>(null);
  const padR = 62, padB = 18, volH = 34;
  const plotW = Math.max(10, w - padR), plotH = height - padB - volH;
  const max = Math.max(20, Math.floor(plotW / 7));
  const data = candles.slice(-max);
  const off = candles.length - data.length;
  const geo = useMemo(() => {
    if (!data.length) return null;
    let lo = Math.min(...data.map((c) => c.l)), hi = Math.max(...data.map((c) => c.h));
    for (const lv of levels) { lo = Math.min(lo, lv.value); hi = Math.max(hi, lv.value); }
    const pad = (hi - lo) * 0.06 || hi * 0.001;
    lo -= pad; hi += pad;
    const step = plotW / data.length;
    const vmax = Math.max(...data.map((c) => c.v), 1);
    return { lo, hi, step, vmax, y: (p: number) => 8 + ((hi - p) / (hi - lo)) * (plotH - 8), x: (i: number) => i * step + step / 2 };
  }, [data, plotW, plotH, levels]);
  if (!candles.length) return <View onLayout={onLayout} style={{ height, justifyContent: "center", alignItems: "center" }}>
    <Text style={{ color: C.dim }}>Market data unavailable</Text></View>;
  const move = (x: number) => geo && setCursor(Math.max(0, Math.min(data.length - 1, Math.floor(x / geo.step))));
  const cur = cursor !== null ? data[cursor] : data[data.length - 1];
  return (
    <View onLayout={onLayout}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4, minHeight: 18 }}>
        <Text style={[{ color: C.dim, fontSize: 11 }, mono]}>{ist(cur.t)}</Text>
        {(["o", "h", "l", "c"] as const).map((k) => (
          <Text key={k} style={[{ color: cur.c >= cur.o ? C.up : C.down, fontSize: 11 }, mono]}>{k.toUpperCase()} {fmtPrice(cur[k], symbol)}</Text>
        ))}
        {overlays.map((o) => <Text key={o.label} style={{ color: o.color, fontSize: 11 }}>{o.label}</Text>)}
      </View>
      {w > 0 && geo ? (
        <View onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => move(e.nativeEvent.locationX)} onResponderMove={(e) => move(e.nativeEvent.locationX)}
          onResponderRelease={() => setCursor(null)}
          {...({ onMouseMove: (e: any) => move(e.nativeEvent.offsetX), onMouseLeave: () => setCursor(null) } as any)}>
          <Svg width={w} height={height}>
            {niceTicks(geo.lo, geo.hi).map((p, i) => (
              <G key={i}>
                <Line x1={0} x2={plotW} y1={geo.y(p)} y2={geo.y(p)} stroke={C.border} strokeWidth={0.5} />
                <SvgText x={plotW + 4} y={geo.y(p) + 3} fill={C.faint} fontSize={10}>{fmtPrice(p, symbol)}</SvgText>
              </G>
            ))}
            {data.map((c, i) => {
              const up = c.c >= c.o, col = up ? C.up : C.down, x = geo.x(i), bw = Math.max(1, geo.step * 0.66);
              const top = geo.y(Math.max(c.o, c.c)), bot = geo.y(Math.min(c.o, c.c));
              return (
                <G key={c.t}>
                  <Line x1={x} x2={x} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={col} strokeWidth={1} />
                  <Rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} />
                  <Rect x={x - bw / 2} y={height - padB - (c.v / geo.vmax) * volH} width={bw} height={(c.v / geo.vmax) * volH} fill={col} opacity={0.35} />
                </G>
              );
            })}
            {overlays.map((o) => {
              let d = "";
              data.forEach((_, i) => {
                const v = o.values[off + i];
                if (v !== null && v !== undefined) d += `${d ? "L" : "M"}${geo.x(i).toFixed(1)},${geo.y(v).toFixed(1)}`;
              });
              return d ? <Path key={o.label} d={d} stroke={o.color} strokeWidth={1.2} fill="none" /> : null;
            })}
            {levels.map((lv) => (
              <G key={lv.label}>
                <Line x1={0} x2={plotW} y1={geo.y(lv.value)} y2={geo.y(lv.value)} stroke={lv.color} strokeWidth={1} strokeDasharray="4 3" />
                <SvgText x={4} y={geo.y(lv.value) - 3} fill={lv.color} fontSize={10}>{lv.label}</SvgText>
              </G>
            ))}
            {cursor !== null ? <Line x1={geo.x(cursor)} x2={geo.x(cursor)} y1={0} y2={height - padB} stroke={C.dim} strokeWidth={0.7} strokeDasharray="3 3" /> : null}
            <SvgText x={0} y={height - 4} fill={C.faint} fontSize={10}>{ist(data[0].t)}</SvgText>
            <SvgText x={plotW} y={height - 4} fill={C.faint} fontSize={10} textAnchor="end">{ist(data[data.length - 1].t)}</SvgText>
          </Svg>
        </View>
      ) : <View style={{ height }} />}
    </View>
  );
}

/** Line / area series (equity curve, drawdown). An optional split marks where out-of-sample begins. */
export function LineChart({ points, height = 180, color = C.accent, baseline, format = (v) => v.toFixed(0), splitIndex, fill }: {
  points: number[]; height?: number; color?: string; baseline?: number; format?: (v: number) => string; splitIndex?: number | null; fill?: boolean;
}) {
  const { w, onLayout } = useWidth();
  const padR = 56;
  if (points.length < 2) return <View onLayout={onLayout} style={{ height, justifyContent: "center" }}><Text style={{ color: C.dim }}>Not enough data to chart.</Text></View>;
  let lo = Math.min(...points, baseline ?? Infinity), hi = Math.max(...points, baseline ?? -Infinity);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pw = Math.max(10, w - padR), ph = height - 8;
  const x = (i: number) => (i / (points.length - 1)) * pw, y = (v: number) => 4 + ((hi - v) / (hi - lo)) * (ph - 4);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {niceTicks(lo, hi, 3).map((p, i) => (
            <G key={i}>
              <Line x1={0} x2={pw} y1={y(p)} y2={y(p)} stroke={C.border} strokeWidth={0.5} />
              <SvgText x={pw + 4} y={y(p) + 3} fill={C.faint} fontSize={10}>{format(p)}</SvgText>
            </G>
          ))}
          {baseline !== undefined ? <Line x1={0} x2={pw} y1={y(baseline)} y2={y(baseline)} stroke={C.dim} strokeWidth={0.8} strokeDasharray="4 3" /> : null}
          {fill ? <Path d={`${d}L${pw},${y(baseline ?? lo)}L0,${y(baseline ?? lo)}Z`} fill={color} opacity={0.15} /> : null}
          <Path d={d} stroke={color} strokeWidth={1.6} fill="none" />
          {splitIndex !== null && splitIndex !== undefined && splitIndex > 0 ? (
            <G>
              <Line x1={x(splitIndex)} x2={x(splitIndex)} y1={0} y2={ph} stroke={C.warn} strokeWidth={1} strokeDasharray="5 3" />
              <SvgText x={x(splitIndex) + 4} y={12} fill={C.warn} fontSize={10}>out-of-sample →</SvgText>
              <SvgText x={x(splitIndex) - 4} y={12} fill={C.dim} fontSize={10} textAnchor="end">← in-sample</SvgText>
            </G>
          ) : null}
        </Svg>
      ) : <View style={{ height }} />}
    </View>
  );
}

export function BarChart({ bars, height = 150, format = (v) => v.toFixed(1) }: {
  bars: { label: string; value: number }[]; height?: number; format?: (v: number) => string;
}) {
  const { w, onLayout } = useWidth();
  if (!bars.length) return <View onLayout={onLayout}><Text style={{ color: C.dim }}>No data.</Text></View>;
  const m = Math.max(...bars.map((b) => Math.abs(b.value)), 1e-9);
  const ph = height - 30, mid = 12 + ph / 2, bw = w / bars.length;
  const every = Math.ceil(bars.length / Math.max(1, Math.floor(w / 56)));
  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={mid} y2={mid} stroke={C.border} />
          {bars.map((b, i) => {
            const h = (Math.abs(b.value) / m) * (ph / 2 - 2);
            return (
              <G key={b.label + i}>
                <Rect x={i * bw + bw * 0.15} y={b.value >= 0 ? mid - h : mid} width={bw * 0.7} height={Math.max(1, h)} fill={b.value >= 0 ? C.up : C.down} />
                {bw > 44 ? <SvgText x={i * bw + bw / 2} y={b.value >= 0 ? mid - h - 3 : mid + h + 11} fill={C.dim} fontSize={9} textAnchor="middle">{format(b.value)}</SvgText> : null}
                {i % every === 0 ? <SvgText x={i * bw + bw / 2} y={height - 3} fill={C.faint} fontSize={9} textAnchor="middle">{b.label}</SvgText> : null}
              </G>
            );
          })}
        </Svg>
      ) : <View style={{ height }} />}
    </View>
  );
}
