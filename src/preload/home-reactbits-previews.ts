// Exact image fills exported by Figma from the approved React Bits cards.
import type { ReactBitsThemeId } from './home-reactbits-renderer'
import crt_warp_light from './home-theme-assets/react-bits/crt-warp-light.jpg?inline'
import crt_warp_dark from './home-theme-assets/react-bits/crt-warp-dark.jpg?inline'
import pattern_waves_light from './home-theme-assets/react-bits/pattern-waves-light.jpg?inline'
import pattern_waves_dark from './home-theme-assets/react-bits/pattern-waves-dark.jpg?inline'
import gradient_ascii_light from './home-theme-assets/react-bits/gradient-ascii-light.jpg?inline'
import gradient_ascii_dark from './home-theme-assets/react-bits/gradient-ascii-dark.jpg?inline'
import dither_light from './home-theme-assets/react-bits/dither-light.jpg?inline'
import dither_dark from './home-theme-assets/react-bits/dither-dark.jpg?inline'
import faulty_terminal_light from './home-theme-assets/react-bits/faulty-terminal-light.jpg?inline'
import faulty_terminal_dark from './home-theme-assets/react-bits/faulty-terminal-dark.jpg?inline'
import liquid_chrome_light from './home-theme-assets/react-bits/liquid-chrome-light.jpg?inline'
import liquid_chrome_dark from './home-theme-assets/react-bits/liquid-chrome-dark.jpg?inline'

export const REACT_BITS_PREVIEWS: Record<ReactBitsThemeId, { light: string; dark: string }> = {
  'crt-warp': { light: crt_warp_light, dark: crt_warp_dark },
  'pattern-waves': { light: pattern_waves_light, dark: pattern_waves_dark },
  'gradient-ascii': { light: gradient_ascii_light, dark: gradient_ascii_dark },
  'dither': { light: dither_light, dark: dither_dark },
  'faulty-terminal': { light: faulty_terminal_light, dark: faulty_terminal_dark },
  'liquid-chrome': { light: liquid_chrome_light, dark: liquid_chrome_dark },
}
