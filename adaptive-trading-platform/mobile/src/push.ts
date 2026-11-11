import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

/** Registers this device for push notifications. Requires a physical iPhone/iPad and an EAS project id. */
export async function registerPush(): Promise<string> {
  if (Platform.OS === "web") return "Push notifications are delivered to the iPhone/iPad app, not the browser.";
  if (!Device.isDevice) return "Push notifications need a physical device (not a simulator).";
  const cur = await Notifications.getPermissionsAsync();
  const status = cur.status === "granted" ? cur.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "Notification permission was not granted in iOS Settings.";
  const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  if (!projectId) return "This build has no EAS project id; run `eas init` and rebuild to enable push.";
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api("/push-tokens", { body: { token, platform: Platform.OS === "ios" ? "ios" : "android" } });
  return "Push notifications enabled on this device.";
}
