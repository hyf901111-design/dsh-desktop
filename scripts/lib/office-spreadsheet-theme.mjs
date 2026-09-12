import { readFileSync } from 'node:fs'

/** Native Univer view adaptation. It never writes workbook/cell data. */
export function createOfficeSpreadsheetTheme(engine, host) {
  const doc = host.ownerDocument
  const state = { dark: doc.body.hasAttribute('data-ds-dark-theme'), sheetRendering: false }
  const owners = createOfficeSpreadsheetTheme.owners ??= new WeakMap()
  let ownership = owners.get(doc)
  if (!ownership) {
    ownership = { count: 0, original: doc.documentElement.classList.contains('univer-dark') }
    owners.set(doc, ownership)
  }
  ownership.count++
  let univer, api, workbook, observer, disposed = false
  const subscriptions = []
  const hooked = new Set()
  const palette = () => state.dark
    ? { text: '#E5E5E5', header: '#393939', grid: '#424242' }
    : { text: '#2B2B2B', header: '#E6E6E6', grid: '#E1E1E1' }
  const theme = () => ({ ...engine.defaultTheme, gray: { ...engine.defaultTheme.gray,
    300: state.dark ? '#E5E5E5' : engine.defaultTheme.gray[300],
    400: state.dark ? '#B3B3B3' : engine.defaultTheme.gray[400],
    800: state.dark ? '#333333' : engine.defaultTheme.gray[800],
    900: state.dark ? '#333333' : '#2B2B2B' } })
  // The engine's default color service transforms every RGB color in dark mode.
  // Keep that native behavior for its internal formula editor, but pass through
  // sheet rendering (including explicit cell/shape colors) unchanged.
  class OfficeSheetThemePlugin extends engine.Plugin {
    static pluginName = 'sherlock-office-sheet-theme'
    constructor(config, injector) { super(); this.injector = injector }
    onStarting() {
      const native = new engine.CanvasColorService(this.injector.get(engine.ThemeService))
      this.disposeWithMe(native)
      this.injector.replace([engine.ICanvasColorService, { useValue: {
        getRenderColor: color => state.sheetRendering ? color : native.getRenderColor(color)
      } }])
    }
  }
  engine.Inject(engine.Injector)(OfficeSheetThemePlugin, undefined, 1)
  function configureSheet(render) {
    const colors = palette()
    const parent = render.engine.getCanvasElement().parentElement
    if (parent) parent.style.backgroundColor = state.dark ? '#333333' : '#FFFFFF'
    const headerStyle = { backgroundColor: colors.header, borderColor: colors.grid, fontColor: colors.text }
    workbook.customizeColumnHeader({ headerStyle })
    workbook.customizeRowHeader({ headerStyle })
    render.components.get(engine.SHEET_VIEW_KEY.LEFT_TOP)?.setProps({ fill: colors.header, stroke: colors.grid })
  }
  function bindRender(render) {
    if (!render || hooked.has(render)) return
    hooked.add(render)
    const sheet = render.unitId === workbook.getId()
    subscriptions.push(render.scene.beforeRender$.subscribe(canvas => {
      if (!canvas) return
      state.sheetRendering = sheet
      if (sheet) {
        const parent = canvas.getCanvasEle().parentElement
        if (parent) parent.style.backgroundColor = state.dark ? '#333333' : '#FFFFFF'
        // Canvas render configuration is transient; worksheet.gridlinesColor,
        // if supplied by the document, retains precedence inside the renderer.
        for (const item of [canvas, ...render.scene.getViewports().map(view => view.canvas)]) {
          if (item) item.getContext().renderConfig.gridlinesColor = palette().grid
        }
      }
    }), render.scene.afterRender$.subscribe(canvas => { if (canvas) state.sheetRendering = false }))
    if (sheet) configureSheet(render)
  }
  function synchronize(force = false) {
    if (disposed) return
    const dark = doc.body.hasAttribute('data-ds-dark-theme')
    if (!force && dark === state.dark) return
    state.dark = dark
    univer.__getInjector().get(engine.ThemeService).setTheme(theme())
    const render = univer.__getInjector().get(engine.IRenderManagerService).getRenderById(workbook.getId())
    if (render) configureSheet(render)
    api.toggleDarkMode(dark)
    if (render) workbook.getActiveSheet()?.refreshCanvas()
  }
  return {
    options: { darkMode: state.dark, theme: theme(), plugins: [OfficeSheetThemePlugin] },
    setEngine(value) { univer = value },
    bind(value, createdWorkbook) {
      api = value
      workbook = createdWorkbook
      const injector = univer.__getInjector()
      subscriptions.push(injector.get(engine.SheetInterceptorService).intercept(engine.INTERCEPTOR_POINT.CELL_CONTENT, {
        effect: engine.InterceptorEffectEnum.Style,
        priority: 0,
        handler(cell, position, next) {
          if (!cell) return next(cell)
          const style = position.workbook.getStyles().getStyleByCell(cell) || {}
          // Explicit foreground/background and rich text retain their own format.
          if (style.cl || style.bg || cell.p) return next(cell)
          return next({ ...cell, s: { ...style, cl: { rgb: palette().text } } })
        }
      }))
      const manager = injector.get(engine.IRenderManagerService)
      subscriptions.push(manager.created$.subscribe(bindRender))
      for (const render of manager.getRenderAll().values()) bindRender(render)
      observer = new doc.defaultView.MutationObserver(() => synchronize())
      observer.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      synchronize(true)
    },
    dispose() {
      if (disposed) return
      disposed = true
      observer?.disconnect()
      let cleanupError
      for (const item of subscriptions) {
        try {
          if (typeof item.unsubscribe === 'function') item.unsubscribe()
          else item.dispose()
        } catch (error) { cleanupError ??= error }
      }
      subscriptions.length = 0
      hooked.clear()
      try { univer?.dispose() } finally {
        ownership.count--
        if (ownership.count === 0) {
          doc.documentElement.classList.toggle('univer-dark', ownership.original)
          owners.delete(doc)
        }
      }
      if (cleanupError) throw cleanupError
    }
  }
}

const helperSource = readFileSync(new URL(import.meta.url), 'utf8')
const runtimeSource = helperSource.slice(helperSource.indexOf('export function createOfficeSpreadsheetTheme('), helperSource.indexOf('\nconst helperSource =')).replace(/^export /, '').trim()

export const OFFICE_SPREADSHEET_THEME_MARKER = '/* sherlock:office-spreadsheet-theme:v1 */'
export function patchOfficeSpreadsheetTheme(source) {
  if (source.includes(OFFICE_SPREADSHEET_THEME_MARKER)) return source
  function replace(before, after) {
    if (source.split(before).length !== 2) throw new Error('Office spreadsheet theme source anchor drifted')
    source = source.replace(before, after)
  }
  replace('\t\tfunction XlsxView(props) {', `${OFFICE_SPREADSHEET_THEME_MARKER}\n${runtimeSource}\n\t\tfunction XlsxView(props) {`)
  replace('const { createUniver, LocaleType, mergeLocales } = await Promise.resolve().then(() => (init_es$17(), es_exports$1));', 'const univerCore = await Promise.resolve().then(() => (init_es$17(), es_exports$1));\n\t\t\t\t\t\tconst { createUniver, LocaleType, mergeLocales } = univerCore;')
  replace('const { UniverSheetsCorePreset } = await Promise.resolve().then(() => (init_es(), es_exports));', 'const spreadsheetEngine = await Promise.resolve().then(() => (init_es(), es_exports));\n\t\t\t\t\t\tconst { UniverSheetsCorePreset } = spreadsheetEngine;')
  replace('const { univer, univerAPI } = createUniver({\n\t\t\t\t\t\t\tlocale,', 'const spreadsheetTheme = createOfficeSpreadsheetTheme({ ...univerCore, ...spreadsheetEngine }, host);\n\t\t\t\t\t\tif (!lifecycle.attach(spreadsheetTheme)) return;\n\t\t\t\t\t\tconst { univer, univerAPI } = createUniver({\n\t\t\t\t\t\t\t...spreadsheetTheme.options,\n\t\t\t\t\t\t\tlocale,')
  replace('if (!lifecycle.attach(univer)) return;', 'spreadsheetTheme.setEngine(univer);')
  replace('univerAPI.createWorkbook(workbookData);', 'const workbook = univerAPI.createWorkbook(workbookData);\n\t\t\t\t\t\tspreadsheetTheme.bind(univerAPI, workbook);')
  replace('univerRef.current = null;\n\t\t\t\t\tif (host !== null) host.innerHTML = "";', 'univerRef.current = null;\n\t\t\t\t\t// Univer owns its React root; do not clear it before deferred unmount.');
  return source
}
