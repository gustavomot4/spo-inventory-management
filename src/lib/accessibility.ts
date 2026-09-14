export const FONT_SCALES = [87.5, 100, 112.5, 125] as const
export type FontScale = (typeof FONT_SCALES)[number]
export type ThemePreference = 'light' | 'dark' | 'system'
export interface AccessibilityPreferences {
  fontScale: FontScale
  theme: ThemePreference
}

export const FONT_STORAGE_KEY = 'spo_font_scale_v1'
export const THEME_STORAGE_KEY = 'spo_theme_v1'
export const DEFAULT_PREFERENCES: AccessibilityPreferences = { fontScale: 100, theme: 'system' }

export function parseFontScale(value: string | null): FontScale {
  return FONT_SCALES.find(scale => String(scale) === value) ?? 100
}

export function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function readPreferences(): AccessibilityPreferences {
  // Storage may be unavailable in private mode or blocked by browser policy.
  let fontScale: FontScale = 100
  let theme: ThemePreference = 'system'
  try { fontScale = parseFontScale(localStorage.getItem(FONT_STORAGE_KEY)) } catch {}
  try { theme = parseTheme(localStorage.getItem(THEME_STORAGE_KEY)) } catch {}
  return { fontScale, theme }
}

export function applyPreferences(preferences: AccessibilityPreferences, systemDark: boolean) {
  document.documentElement.style.fontSize = `${preferences.fontScale}%`
  document.documentElement.dataset.theme = preferences.theme === 'system'
    ? (systemDark ? 'dark' : 'light')
    : preferences.theme
}

// Self-contained, synchronous head script: runs before the body is painted.
// Only fixed application constants are interpolated; no user content is executable.
export const ACCESSIBILITY_INIT_SCRIPT = `(() => {
  let scale = '100', theme = 'system';
  try { const value = localStorage.getItem('${FONT_STORAGE_KEY}');
    if (${JSON.stringify(FONT_SCALES.map(String))}.includes(value)) scale = value;
  } catch {}
  try { const value = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (value === 'light' || value === 'dark') theme = value;
  } catch {}
  document.documentElement.style.fontSize = scale + '%';
  document.documentElement.dataset.theme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
})();`
