import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useLayout } from "./state";
import { C, mono } from "./theme";

export function T({ children, style, dim, small, bold, color, numberOfLines }: {
  children: React.ReactNode; style?: TextStyle | TextStyle[]; dim?: boolean; small?: boolean; bold?: boolean;
  color?: string; numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: color ?? (dim ? C.dim : C.text), fontSize: small ? 12 : 14,
      fontWeight: bold ? "600" : "400" }, mono, style as any]}>{children}</Text>
  );
}

/** Always-visible account-mode indicator. LIVE is unmistakable. */
export function ModeBanner() {
  const { account } = useApp();
  if (!account) return null;
  const live = account.mode === "live";
  const armed = live && account.live_enabled;
  const bg = armed ? C.live : live ? "#5A2A27" : "#12263F";
  const label = armed ? "● LIVE TRADING — REAL MONEY" : live ? "LIVE ACCOUNT — EXECUTION DISABLED" : "PAPER TRADING — SIMULATED";
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, paddingVertical: 5, paddingHorizontal: 12, flexDirection: "row",
      justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color: "#fff", fontSize: 12 }} numberOfLines={1}>
        {account.name}{account.kill_switch ? "  ·  KILL SWITCH ON" : account.halted_reason ? `  ·  HALTED: ${account.halted_reason}` : ""}
      </Text>
    </View>
  );
}

export function Screen({ title, right, children, onRefresh, refreshing, error, scroll = true }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean;
  error?: string | null; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const body = (
    <View style={{ padding: wide ? 20 : 12, gap: 12, paddingBottom: 32 }}>
      {error ? <Notice kind="error" text={error} /> : null}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: wide ? 0 : insets.top }}>
      <ModeBanner />
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{right}</View>
      </View>
      {scroll ? (
        <ScrollView refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.dim} /> : undefined}>
          {body}
        </ScrollView>
      ) : body}
    </View>
  );
}

export function Card({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.card, style]}>
      {title ? (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>{title.toUpperCase()}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Responsive grid: children share a row in `columns` columns on wide screens. */
export function Grid({ children, min = 300 }: { children: React.ReactNode; min?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
    {React.Children.map(children, (c) => c ? <View style={{ flexGrow: 1, flexBasis: min, minWidth: 0 }}>{c}</View> : null)}
  </View>;
}

export function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 0, paddingVertical: 4 }}>
      <Text style={{ color: C.dim, fontSize: 11, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={[{ color: color ?? C.text, fontSize: 19, fontWeight: "600", marginTop: 2 }, mono]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ color: C.faint, fontSize: 11 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}
export const Stats = ({ children }: { children: React.ReactNode }) =>
  <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6 }}>{children}</View>;

export function Badge({ text, color = C.dim }: { text: string; color?: string }) {
  return <View style={{ borderColor: color, borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1, alignSelf: "flex-start" }}>
    <Text style={{ color, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>{text.toUpperCase()}</Text>
  </View>;
}

export function Notice({ kind = "info", text }: { kind?: "info" | "warn" | "error" | "ok"; text: string }) {
  const color = { info: C.info, warn: C.warn, error: C.down, ok: C.up }[kind];
  return <View style={{ borderLeftColor: color, borderLeftWidth: 3, backgroundColor: C.panel2, padding: 10, borderRadius: 3 }}>
    <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>{text}</Text>
  </View>;
}
export const Synthetic = () => <Notice kind="warn" text="SYNTHETIC DATA — generated for software testing. Not market history; results say nothing about real markets." />;

export function Btn({ label, onPress, kind = "default", disabled, busy, small }: {
  label: string; onPress: () => void; kind?: "default" | "primary" | "danger"; disabled?: boolean; busy?: boolean; small?: boolean;
}) {
  const bg = kind === "primary" ? C.accent : kind === "danger" ? C.down : C.panel2;
  const fg = kind === "default" ? C.text : "#0B0F14";
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, borderRadius: 4,
        borderWidth: 1, borderColor: kind === "default" ? C.border : bg, paddingHorizontal: small ? 10 : 14,
        minHeight: small ? 32 : 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6 })}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "600", fontSize: small ? 12 : 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Seg<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: "hidden" }}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: o.value === value }}
            style={{ paddingHorizontal: 12, minHeight: 36, justifyContent: "center", backgroundColor: o.value === value ? C.accent : C.panel }}>
            <Text style={{ color: o.value === value ? "#0B0F14" : C.dim, fontSize: 12, fontWeight: "600" }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export type Col<R> = { key: string; title: string; flex?: number; align?: "left" | "right"; render: (r: R) => React.ReactNode; hideNarrow?: boolean };
export function Table<R>({ rows, cols, empty = "No rows.", onPress, keyOf }: {
  rows: R[]; cols: Col<R>[]; empty?: string; onPress?: (r: R) => void; keyOf?: (r: R, i: number) => string;
}) {
  const { medium } = useLayout();
  const shown = cols.filter((c) => medium || !c.hideNarrow);
  if (!rows.length) return <Text style={{ color: C.dim, paddingVertical: 10 }}>{empty}</Text>;
  const cell = (c: Col<R>, child: React.ReactNode, head = false) => (
    <View key={c.key} style={{ flex: c.flex ?? 1, alignItems: c.align === "right" ? "flex-end" : "flex-start", paddingRight: 8, minWidth: 0 }}>
      {head ? <Text style={{ color: C.faint, fontSize: 10, letterSpacing: 0.5 }} numberOfLines={1}>{c.title.toUpperCase()}</Text>
        : typeof child === "string" || typeof child === "number" ? <Text style={[{ color: C.text, fontSize: 13 }, mono]} numberOfLines={1}>{child}</Text> : child}
    </View>
  );
  return (
    <View>
      <View style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>{shown.map((c) => cell(c, null, true))}</View>
      {rows.map((r, i) => (
        <Pressable key={keyOf ? keyOf(r, i) : String(i)} disabled={!onPress} onPress={() => onPress?.(r)}
          style={({ pressed }) => ({ flexDirection: "row", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: C.border, alignItems: "center", backgroundColor: pressed ? C.panel2 : "transparent" })}>
          {shown.map((c) => cell(c, c.render(r)))}
        </Pressable>
      ))}
    </View>
  );
}

export const Loading = () => <View style={{ padding: 24, alignItems: "center" }}><ActivityIndicator color={C.dim} /></View>;
export const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) =>
  <View style={[{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }, style]}>{children}</View>;
export const KV = ({ k, v, color }: { k: string; v: string; color?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 12 }}>
    <Text style={{ color: C.dim, fontSize: 13 }}>{k}</Text>
    <Text style={[{ color: color ?? C.text, fontSize: 13, flexShrink: 1, textAlign: "right" }, mono]}>{v}</Text>
  </View>
);

const s = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 52 },
  title: { color: C.text, fontSize: 18, fontWeight: "700" },
  card: { backgroundColor: C.panel, borderRadius: 6, borderWidth: 1, borderColor: C.border, padding: 12 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardTitle: { color: C.dim, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
});
