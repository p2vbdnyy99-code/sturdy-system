import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { C } from "@/theme";
import { Screen } from "@/ui";
import { NAV } from "./_layout";

export default function More() {
  const router = useRouter();
  return (
    <Screen title="More">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {NAV.filter((n) => !["/", "/markets", "/portfolio", "/journal"].includes(n.path)).map((n) => (
          <Pressable key={n.path} onPress={() => router.replace(n.path as any)} accessibilityRole="link"
            style={{ flexGrow: 1, flexBasis: 150, backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 6, padding: 16, gap: 8, minHeight: 84 }}>
            <Icon name={n.icon as any} size={24} color={C.accent} />
            <Text style={{ color: C.text, fontWeight: "600" }}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
