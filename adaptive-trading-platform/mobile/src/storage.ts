import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Tokens live in the iOS Keychain (expo-secure-store). On web the build is an admin
// console and falls back to sessionStorage. Broker secrets are never stored on the device.
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
export async function setItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof sessionStorage === "undefined") return;
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
