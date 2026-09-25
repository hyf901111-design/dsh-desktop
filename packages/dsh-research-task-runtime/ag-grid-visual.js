// Shared workbench colors follow the AG Grid Quartz themes used by the native table.
// Non-tabular components use these roles without pretending to be grid instances.
export const AG_GRID_VISUAL = Object.freeze({
  light: Object.freeze({
    accent: '#2675d6', background: '#ffffff', border: '#e1e1e1',
    foreground: '#292b2f', header: '#f1f2f4', muted: '#81858c',
    alternate: '#f7f8f9', hover: '#eaf2ff',
  }),
  dark: Object.freeze({
    accent: '#4b9cff', background: '#171717', border: '#424242',
    foreground: '#e7e7e9', header: '#292a2d', muted: '#989aa0',
    alternate: '#242424', hover: '#303744',
  }),
})

export const AG_GRID_HTML_SURFACE_CSS = `@layer sherlock-ag-surface{body :is(.market-metric,.research-metric,.market-tile){border-radius:0!important}}`
