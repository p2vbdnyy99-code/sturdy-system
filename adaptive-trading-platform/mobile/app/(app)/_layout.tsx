import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useLayout } from "@/state";
import { C } from "@/theme";

export const NAV = [
  { path: "/", label: "Dashboard", icon: "view-dashboard-outline" },
  { path: "/markets", label: "Markets", icon: "chart-line" },
  { path: "/strategies", label: "Strategies", icon: "source-branch" },
  { path: "/backtesting", label: "Backtesting", icon: "history" },
  { path: "/paper", label: "Paper Trading", icon: "flask-outline" },
  { path: "/portfolio", label: "Portfolio", icon: "briefcase-outline" },
  { path: "/journal", label: "Trade Journal", icon: "notebook-outline" },
  { path: "/analytics", label: "Analytics", icon: "chart-bar" },
  { path: "/brokers", label: "Broker Connections", icon: "lan-connect" },
  { path: "/settings", label: "Settings", icon: "cog-outline" },
] as const;
const PHONE_TABS = ["/", "/markets", "/portfolio", "/journal"];

export default function AppLayout() {
  const { wide } = useLayout();
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, account } = useApp();
  if (!user) return null;
  const go = (p: string) => router.replace(p as any);
  if (wide) {
    // iPad landscape / desktop: persistent side rail with all ten sections
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={{ width: 216, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.panel, paddingLeft: insets.left }}>
          <Text style={{ color: C.text, fontWeight: "700", fontSize: 16, padding: 16 }}>Adaptive Trader</Text>
          <ScrollView>
            {NAV.map((n) => {
              const on = path === n.path;
              return (
                <Pressable key={n.path} onPress={() => go(n.path)} accessibilityRole="link" accessibilityState={{ selected: on }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, minHeight: 44,
                    backgroundColor: on ? C.panel2 : "transparent", borderLeftWidth: 3, borderLeftColor: on ? C.accent : "transparent" }}>
                  <Icon name={n.icon as any} size={18} color={on ? C.accent : C.dim} />
                  <Text style={{ color: on ? C.text : C.dim, fontSize: 14 }}>{n.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ color: C.faint, fontSize: 11 }} numberOfLines={1}>{user.email}</Text>
            <Text style={{ color: account?.mode === "live" ? C.live : C.paper, fontSize: 11, fontWeight: "700" }}>{(account?.mode ?? "").toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}><Slot /></View>
      </View>
    );
  }
  const tabs = [...NAV.filter((n) => PHONE_TABS.includes(n.path)), { path: "/more", label: "More", icon: "dots-horizontal" }];
  const inMore = !PHONE_TABS.includes(path);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}><Slot /></View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel,
        paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        {tabs.map((n) => {
          const on = n.path === "/more" ? inMore : path === n.path;
          return (
            <Pressable key={n.path} onPress={() => go(n.path)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 2 }}>
              <Icon name={n.icon as any} size={22} color={on ? C.accent : C.dim} />
              <Text style={{ color: on ? C.accent : C.dim, fontSize: 10 }} numberOfLines={1}>{n.label.replace("Trade ", "")}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
