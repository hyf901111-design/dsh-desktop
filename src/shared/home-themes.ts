export const HOME_THEMES = ['default', 'berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue', 'crt-warp', 'dither', 'koi-pond'] as const
export type HomeTheme = typeof HOME_THEMES[number]
export type HomeThemeSelection = HomeTheme | 'random'
export function isHomeThemeSelection(value: unknown): value is HomeThemeSelection { return value === 'random' || isHomeTheme(value) }
export const HOME_THEME_STORAGE_KEY = 'ework.home-background.v1'

export function isHomeTheme(value: unknown): value is HomeTheme {
  return typeof value === 'string' && HOME_THEMES.includes(value as HomeTheme)
}

export function normalizeHomeTheme(value: unknown): HomeThemeSelection | null {
  if (isHomeThemeSelection(value)) return value
  return typeof value === 'string' && ['emreturan', 'abramovdesign', 'pattern-waves', 'gradient-ascii', 'faulty-terminal', 'liquid-chrome'].includes(value)
    ? 'default'
    : null
}

export type HomeThemePreferences = {
  get(): unknown
  set(theme: HomeThemeSelection): boolean
}
