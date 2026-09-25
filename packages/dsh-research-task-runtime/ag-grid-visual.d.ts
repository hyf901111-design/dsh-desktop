export type AgGridVisualColors = {
  accent: string
  background: string
  border: string
  foreground: string
  header: string
  muted: string
  alternate: string
  hover: string
}

export const AG_GRID_VISUAL: Readonly<{
  light: Readonly<AgGridVisualColors>
  dark: Readonly<AgGridVisualColors>
}>

export const AG_GRID_HTML_SURFACE_CSS: string
