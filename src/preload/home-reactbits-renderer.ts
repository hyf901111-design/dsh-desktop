import type { HomeThemeRenderer } from './home-theme-renderer'
import { createCrtWarpRenderer } from './home-reactbits-crt-pattern'
import { createDitherRenderer } from './home-reactbits-dither-chrome'

/** React Bits originals exported with the approved Figma preview cards. */
const RENDERERS = {
  'crt-warp': createCrtWarpRenderer,
  dither: createDitherRenderer,
} as const

export type ReactBitsThemeId = keyof typeof RENDERERS
export const REACT_BITS_THEME_IDS = Object.keys(RENDERERS) as ReactBitsThemeId[]
export const isReactBitsTheme = (theme: string): theme is ReactBitsThemeId => Object.hasOwn(RENDERERS, theme)
export function createReactBitsRenderer(canvas: HTMLCanvasElement, theme: ReactBitsThemeId, options: { dark: boolean; thumbnail?: boolean }): HomeThemeRenderer | null {
  return RENDERERS[theme](canvas, options)
}
