import { Slot, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "@/state";
import { C, paperTheme } from "@/theme";

function Gate() {
  const { ready, user } = useApp();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user && path !== "/login") router.replace("/login");
    if (user && path === "/login") router.replace("/");
  }, [ready, user, path, router]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}><ActivityIndicator color={C.dim} /></View>;
  return <Slot />;
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <AppProvider>
          <StatusBar style="light" />
          <View style={{ flex: 1, backgroundColor: C.bg }}><Gate /></View>
        </AppProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
