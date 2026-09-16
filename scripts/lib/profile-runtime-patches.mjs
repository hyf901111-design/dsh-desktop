import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

// These packages also exist in the independent plugin dependency tree. Copy
// only the patched entry, and fail on version drift instead of mixing APIs.
const entries = [
  ['@deepseek-ai/dsh-llm', 'function toolImagesAsText(message)'],
  ['@deepseek-ai/dsh-tool-fs', 'The LLM boundary handles text-only model projection.']
]
async function sources(projectRoot, modulesRoot) {
  return Promise.all(entries.map(async ([name, marker]) => {
    const sourceRoot = path.join(projectRoot, 'node_modules', name)
    const targetRoot = path.join(modulesRoot, name)
    const [sourceManifest, targetManifest, source] = await Promise.all([
      readFile(path.join(sourceRoot, 'package.json'), 'utf8'),
      readFile(path.join(targetRoot, 'package.json'), 'utf8'),
      readFile(path.join(sourceRoot, 'lib/index.js'), 'utf8')
    ])
    if (JSON.parse(sourceManifest).version !== JSON.parse(targetManifest).version) throw Error(`Plugin runtime version mismatch: ${name}`)
    if (!source.includes(marker)) throw Error(`Required runtime patch missing: ${name}`)
    return {name, source, target:path.join(targetRoot, 'lib/index.js')}
  }))
}
export async function syncProfileRuntimePatches(projectRoot, profileRoot) {
  const files = await sources(projectRoot, path.join(profileRoot, 'node_modules'))
  const hash = createHash('sha256')
  for (const file of files) {
    await writeFile(file.target, file.source)
    hash.update(file.name + '\0').update(file.source)
  }
  return hash.digest('hex')
}
export async function verifyProfileRuntimePatches(projectRoot, modulesRoot) {
  for (const file of await sources(projectRoot, modulesRoot)) {
    if (await readFile(file.target, 'utf8') !== file.source) throw Error(`Plugin runtime patch parity failed: ${file.name}`)
  }
}
