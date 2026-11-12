export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatioCap: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Fraction of decorative trees to draw. */
  treeDensity: number;
  /** Whether decorative trees cast shadows (thousands of trees double the shadow pass cost). */
  treeShadows: boolean;
  /**
   * 'dynamic': the shadow map follows the camera and is redrawn every frame (sharp up close).
   * 'static': one shadow map covers the whole map and is redrawn only when the city changes,
   * so moving the camera costs no shadow pass (iPad Air 3 run 2: shadows were the largest cost).
   */
  shadowMode: 'dynamic' | 'static';
  /** Soft (PCFSoft) filtering samples more per pixel than plain PCF. */
  softShadows: boolean;
}

// Medium was set from iPad Air 3 run 3 (docs/AUDIT.md §11): per-pixel cost dominates on the A12,
// so Medium renders at 1x with shadows off by default (60 FPS floor measured); shadows remain a
// separate setting for players who prefer them over frame rate.
export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  low: { pixelRatioCap: 1, antialias: false, shadows: false, shadowMapSize: 2048, treeDensity: 0.35, treeShadows: false, shadowMode: 'static', softShadows: false },
  medium: { pixelRatioCap: 1, antialias: true, shadows: false, shadowMapSize: 2048, treeDensity: 0.7, treeShadows: false, shadowMode: 'static', softShadows: false },
  high: { pixelRatioCap: 2, antialias: true, shadows: true, shadowMapSize: 2048, treeDensity: 1, treeShadows: true, shadowMode: 'dynamic', softShadows: true },
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
