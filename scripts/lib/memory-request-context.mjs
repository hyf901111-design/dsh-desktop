import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MEMORY_REQUEST_CONTEXT_MARKER = '/* ework:memory-request-context:rc7:v1 */'
const anchor = '\t\t\tconst { request, preparedCall } = await this.buildRequest(turn, step, assembly.tools, system, this.session.deriveMessages(), signal);'
const replacement = `\t\t\tconst { request: baseRequest, preparedCall } = await this.buildRequest(turn, step, assembly.tools, system, this.session.deriveMessages(), signal);
\t\t\t${MEMORY_REQUEST_CONTEXT_MARKER}
\t\t\t// Compose only after durable headers; retain the exact prepared adapter and signal.
\t\t\tconst request = markAgentLoopRequest(deepFreeze(await this.dispatch.waterfall("agent/request-context", {
\t\t\t\tturn, step, request: baseRequest,
\t\t\t\tcontextWindow: preparedCall?.context?.contextWindow, signal
\t\t\t}, () => Promise.resolve(baseRequest))));
\t\t\tsignal.throwIfAborted();`

/** A deliberately narrow rc.7 extension: never edits headers, history, or stream routing. */
export function patchMemoryRequestContext(source) {
  if (source.includes(MEMORY_REQUEST_CONTEXT_MARKER)) {
    if (!source.includes(replacement)) throw Error('Memory request context patch is incomplete')
    return source
  }
  if (source.split(anchor).length !== 2) throw Error('Memory request context rc.7 anchor drifted')
  return source.replace(anchor, replacement)
}

/** Used on isolated bundled/profile copies; callers own the target dependency tree. */
export async function applyMemoryRequestContextPatch(modulesRoot) {
  const root = path.join(modulesRoot, '@deepseek-ai/dsh-agent-loop')
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  if (manifest.version !== '0.1.0-rc.7') throw Error('Memory request context requires dsh-agent-loop 0.1.0-rc.7')
  const target = path.join(root, 'lib/index.js')
  const source = await readFile(target, 'utf8'), next = patchMemoryRequestContext(source)
  if (next !== source) await writeFile(target, next)
  return next !== source
}
