import { MD3DarkTheme } from "react-native-paper";

export const C = {
  bg: "#0B0F14", panel: "#121821", panel2: "#18202B", border: "#232D3A", text: "#E6EDF3", dim: "#8B98A9",
  faint: "#5B6777", up: "#26C281", down: "#EF5350", warn: "#F5A524", info: "#4C9AFF", live: "#FF3B30",
  paper: "#4C9AFF", accent: "#7AA2F7",
};

export const paperTheme = {
  ...MD3DarkTheme,
  roundness: 2,
  colors: {
    ...MD3DarkTheme.colors, primary: C.accent, background: C.bg, surface: C.panel, surfaceVariant: C.panel2,
    outline: C.border, onSurface: C.text, onSurfaceVariant: C.dim, error: C.down, onPrimary: "#0B0F14",
    secondaryContainer: C.panel2, onSecondaryContainer: C.text, elevation: { ...MD3DarkTheme.colors.elevation, level3: C.panel2 },
  },
};

export const mono = { fontVariant: ["tabular-nums" as const] };

export function money(v: number | null | undefined, ccy = "USD", digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? "−" : ""}${ccy === "USD" ? "$" : ""}${s}${ccy === "USD" ? "" : " " + ccy}`;
}
export function signed(v: number | null | undefined, digits = 2, suffix = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}${suffix}`;
}
export function num(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits);
}
export function price(v: number | null | undefined, symbol = ""): string {
  if (v === null || v === undefined) return "—";
  const d = symbol.includes("JPY") ? 3 : symbol.startsWith("BTC") || symbol.startsWith("XAU") ? 2 : 5;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function pnlColor(v: number | null | undefined): string {
  return !v ? C.dim : v > 0 ? C.up : C.down;
}
/** All times are displayed in IST (Asia/Kolkata). */
export function ist(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  try {
    return d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit",
      ...(withDate ? { day: "2-digit", month: "short" } : {}) }) + " IST";
  } catch {
    const t = new Date(d.getTime() + 330 * 60000).toISOString();
    return (withDate ? t.slice(5, 10) + " " : "") + t.slice(11, 16) + " IST";
  }
}
