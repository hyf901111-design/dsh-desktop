import type { HomeThemeRenderer } from './home-theme-renderer'
import { createCrtWarpRenderer, createPatternWavesRenderer } from './home-reactbits-crt-pattern'
import { createGradientAsciiRenderer, createFaultyTerminalRenderer } from './home-reactbits-ascii-terminal'
import { createDitherRenderer, createLiquidChromeRenderer } from './home-reactbits-dither-chrome'

/** React Bits originals exported with the approved Figma preview cards. */
const RENDERERS = {
  'crt-warp': createCrtWarpRenderer,
  'pattern-waves': createPatternWavesRenderer,
  'gradient-ascii': createGradientAsciiRenderer,
  dither: createDitherRenderer,
  'faulty-terminal': createFaultyTerminalRenderer,
  'liquid-chrome': createLiquidChromeRenderer
} as const

export type ReactBitsThemeId = keyof typeof RENDERERS
export const REACT_BITS_THEME_IDS = Object.keys(RENDERERS) as ReactBitsThemeId[]
export const isReactBitsTheme = (theme: string): theme is ReactBitsThemeId => Object.hasOwn(RENDERERS, theme)
export function createReactBitsRenderer(canvas: HTMLCanvasElement, theme: ReactBitsThemeId, options: { dark: boolean; thumbnail?: boolean }): HomeThemeRenderer | null {
  return RENDERERS[theme](canvas, options)
}
