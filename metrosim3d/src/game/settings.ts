import { detectDefaultQuality, Quality } from '../render/quality';

export interface Settings {
  quality: Quality;
  showPerf: boolean;
  /** 'auto' follows the quality preset. */
  shadows: 'auto' | 'on' | 'off';
}

const KEY = 'metrosim3d.settings.v1';

export function loadSettings(): Settings {
  const fallback: Settings = { quality: detectDefaultQuality(), showPerf: false, shadows: 'auto' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : fallback.quality,
      showPerf: !!s.showPerf,
      shadows: s.shadows === 'on' || s.shadows === 'off' ? s.shadows : 'auto',
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}

export function shadowPref(s: Settings): boolean | null {
  return s.shadows === 'auto' ? null : s.shadows === 'on';
}
