const marker = '/* sherlock:preload-emoji-custom-elements:v1 */'
const capability = 'typeof customElements !== "undefined" && customElements !== null && typeof customElements.get === "function" && typeof customElements.define === "function"'

// Electron's isolated preload can expose customElements as null. emoji-mart's
// optional top-level registrations must not prevent the notes editor importing.
export function patchPreloadEmojiCustomElements(source, id) {
  if (id.includes('\0')) return null
  const path = id.replaceAll('\\', '/').split('?')[0]
  const distribution = path.match(/\/node_modules\/emoji-mart\/dist\/(main|module|browser)\.js$/)?.[1]
  if (!distribution) return null
  if (source.includes(marker)) return null

  let patched = source
  for (const tag of ['em-emoji', 'em-emoji-picker']) {
    const pattern = distribution === 'browser'
      ? new RegExp(`["']undefined["']\\s*==\\s*typeof customElements\\s*\\|\\|\\s*customElements\\.get\\(["']${tag}["']\\)\\s*\\|\\|\\s*customElements\\.define\\(["']${tag}["'],\\s*([\\w$]+)\\);`, 'g')
      : new RegExp(`if\\s*\\(typeof customElements\\s*!==\\s*["']undefined["']\\s*&&\\s*!customElements\\.get\\(["']${tag}["']\\)\\)\\s*customElements\\.define\\(["']${tag}["'],\\s*([\\w$]+)\\);`, 'g')
    const matches = [...patched.matchAll(pattern)]
    if (matches.length !== 1) {
      throw new Error(`emoji-mart preload registration drift: expected one ${tag} registration in ${path}, found ${matches.length}`)
    }
    patched = patched.replace(pattern, (_match, constructor) => distribution === 'browser'
      ? `(${capability} && !customElements.get("${tag}") && customElements.define("${tag}", ${constructor}));`
      : `if (${capability} && !customElements.get("${tag}")) customElements.define("${tag}", ${constructor});`)
  }
  return `${patched}\n${marker}\n`
}

export function preloadCustomElementsPlugin() {
  return {
    name: 'preload-emoji-custom-elements',
    enforce: 'pre',
    transform(source, id) {
      const code = patchPreloadEmojiCustomElements(source, id)
      return code === null ? null : { code, map: null }
    },
  }
}
