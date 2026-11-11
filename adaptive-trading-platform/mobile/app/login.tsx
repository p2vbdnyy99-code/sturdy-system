import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { TextInput } from "react-native-paper";
import { getServer, setServer } from "@/api";
import { useApp } from "@/state";
import { C } from "@/theme";
import { Btn, Notice } from "@/ui";

export default function Login() {
  const { signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setSrv] = useState(getServer());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (register: boolean) => {
    setBusy(true); setError(null);
    try { await setServer(server.trim()); await signIn(email.trim(), password, register); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 12 }}>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: "700" }}>Adaptive Trader</Text>
          <Text style={{ color: C.dim, marginBottom: 8 }}>Algorithmic trading control. Accounts start in PAPER mode.</Text>
          {error ? <Notice kind="error" text={error} /> : null}
          <TextInput mode="outlined" label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={() => go(false)} />
          <TextInput mode="outlined" label="Server URL" value={server} onChangeText={setSrv} autoCapitalize="none" dense />
          <Btn label="Sign in" kind="primary" onPress={() => go(false)} busy={busy} disabled={!email || !password} />
          <Btn label="Create account" onPress={() => go(true)} disabled={busy || !email || !password} />
          <Text style={{ color: C.faint, fontSize: 12 }}>Passwords need 10+ characters with an upper-case letter and a digit.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
