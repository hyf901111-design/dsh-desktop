import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const loadingCopy = '(navigator.language.toLowerCase().startsWith("zh") ? "正在加载插件…" : "Loading plugins…")'

// AppRoot must stay independent of the plugins that are still booting. Desktop
// configures navigator.language from the saved application locale before launch.
export function patchBootBranding(source, file = 'AppRoot') {
  let result = source
  for (const [slot, original, replacement] of [
    ['wordmark', '"HARNESS"', '"EWork Odyssey"'],
    ['hint', '"Loading plugins…"', loadingCopy]
  ]) {
    const prefix = new RegExp(`className:\\s*[\\w$]+\\.${slot},\\s*children:\\s*`, 'g')
    const matches = [...result.matchAll(prefix)].filter(match => {
      const value = result.slice(match.index + match[0].length)
      return value.startsWith(original) || value.startsWith(replacement)
    })
    if (matches.length !== 1) {
      throw new Error(`Unable to brand boot ${slot} in ${file}: expected one display target, found ${matches.length}`)
    }
    const match = matches[0]
    const start = match.index + match[0].length
    if (result.startsWith(original, start)) {
      result = result.slice(0, start) + replacement + result.slice(start + original.length)
    }
  }
  return result
}

export async function installBootBranding(projectRoot) {
  const clientRoot = path.join(projectRoot, 'node_modules', '@deepseek-ai')
  const assets = path.join(clientRoot, 'dsh-web-frontend', 'dist', 'assets')
  const entries = (await readdir(assets)).filter(name => /^index-.*\.js$/.test(name))
  if (entries.length !== 1) throw new Error(`Expected one boot frontend JavaScript asset, found ${entries.length}`)
  const files = [path.join(clientRoot, 'dsh-client-web', 'lib', 'index.js'), path.join(assets, entries[0])]
  // Validate both inputs before changing either, including already branded input.
  const patches = await Promise.all(files.map(async file => ({ file, contents: patchBootBranding(await readFile(file, 'utf8'), file) })))
  for (const { file, contents } of patches) await writeFile(file, contents, 'utf8')
  return files
}
