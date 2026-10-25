/** Own only the homepage request listener; ThemeRuntime remains the appearance owner. */
export function installHomeThemeAppearance(theme, doc = document) {
  const request = event => {
    const data = event.detail
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'action,requestId' || data.action !== 'toggle' || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128) return
    let reply
    try {
      const previous = theme.getTheme().active.colorScheme
      if (previous !== 'dark' && previous !== 'light') throw Error('Appearance service unavailable')
      const next = previous === 'dark' ? 'light' : 'dark'
      theme.setTheme(next)
      if (theme.getTheme().active.colorScheme !== next) throw Error('Appearance change failed')
      reply = {requestId: data.requestId, ok: true}
    } catch (error) { reply = {requestId: data.requestId, ok: false, error: error instanceof Error ? error.message : 'Appearance change failed'} }
    doc.dispatchEvent(new doc.defaultView.CustomEvent('sherlock:home-appearance-reply', {detail: reply}))
  }
  doc.addEventListener('sherlock:home-appearance-request', request)
  return () => doc.removeEventListener('sherlock:home-appearance-request', request)
}
const anchor = 'ctx.provide("theme", theme);'
const marker = '/* sherlock-home-theme-appearance-v1 */'
const addition = `\n\t\t\t${marker}\n\t\t\tctx.effect(() => installHomeThemeAppearance(theme), "desktop: home appearance bridge");\n\t\t\t/* sherlock-home-theme-appearance-end */`
const definition = `${marker}\n${installHomeThemeAppearance.toString()}\n/* sherlock-home-theme-appearance-definition-end */\n`
export function patchHomeThemeAppearance(source) {
  if (source.includes(marker)) {
    if (source.split(marker).length !== 3 || source.split(definition).length !== 2 || source.split(anchor + addition).length !== 2) throw Error('Home appearance bridge installed source drifted')
    return source
  }
  if (source.split(anchor).length !== 2 || source.includes('installHomeThemeAppearance')) throw Error('Home appearance native service hook drifted')
  return source.replace(anchor, definition + anchor + addition)
}
