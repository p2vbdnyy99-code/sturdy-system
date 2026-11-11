export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatioCap: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Fraction of decorative trees to draw. */
  treeDensity: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  low: { pixelRatioCap: 1, antialias: false, shadows: false, shadowMapSize: 0, treeDensity: 0.35 },
  medium: { pixelRatioCap: 1.5, antialias: true, shadows: true, shadowMapSize: 1024, treeDensity: 0.7 },
  high: { pixelRatioCap: 2, antialias: true, shadows: true, shadowMapSize: 2048, treeDensity: 1 },
};

/**
 * Best-guess default. Safari does not expose the device model or GPU, so this can only
 * tell "iPad-sized touch device" from "phone" from "desktop". iPads default to medium
 * (sized for an A12 / 3 GB iPad Air 3); phones and desktops to high. Users can override.
 */
export function detectDefaultQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium';
  const touch = navigator.maxTouchPoints > 1;
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  const isPhone = /iPhone|Android.+Mobile/.test(ua);
  if (isIPad) return 'medium';
  if (isPhone) return 'high';
  if (touch) return 'medium';
  return 'high';
}
