// CRT retains its approved Figma fill; Dither is captured from the live card renderer.
// Regenerate the last two themes with scripts/capture-home-theme-previews.mjs.
import type { ReactBitsThemeId } from './home-reactbits-renderer'
import crt_warp_light from './home-theme-assets/react-bits/crt-warp-light.jpg?inline'
import crt_warp_dark from './home-theme-assets/react-bits/crt-warp-dark.jpg?inline'
import dither_light from './home-theme-assets/react-bits/dither-light.jpg?inline'
import dither_dark from './home-theme-assets/react-bits/dither-dark.jpg?inline'

export const REACT_BITS_PREVIEWS: Record<ReactBitsThemeId, { light: string; dark: string }> = {
  'crt-warp': { light: crt_warp_light, dark: crt_warp_dark },
  'dither': { light: dither_light, dark: dither_dark },
}
