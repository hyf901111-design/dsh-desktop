import type { Deck } from '../../main/presentation/store'

const editorOrigin = 'odyssey-presentation://editor'

/** Parse with the same sandboxed PPTist importer before registering an editable session. */
export function parsePresentationFile(document: Document, bytes: Uint8Array, title: string, signal?: AbortSignal): Promise<Deck> {
  signal?.throwIfAborted()
  const win = document.defaultView!
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  frame.hidden = true
  frame.inert = true
  frame.src = editorOrigin + '/index.html?host=' + encodeURIComponent(win.location.origin)
  const importId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (result?: Deck, reason = '演示文件解析失败。') => {
      win.clearTimeout(timer)
      win.removeEventListener('message', receive)
      document.removeEventListener('sherlock:knowledge-identity-changed', cancel)
      signal?.removeEventListener('abort', abort)
      frame.remove()
      if (result) resolve(result)
      else reject(new Error(reason))
    }
    const abort = () => finish(undefined, '演示导入已取消。')
    const cancel = () => finish(undefined, '当前账号已变化，请重新打开文件。')
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== frame.contentWindow || event.origin !== editorOrigin || data?.channel !== 'odyssey-presentation') return
      if (data.type === 'ready') {
        frame.contentWindow?.postMessage({ channel: data.channel, type: 'import', importId, parseOnly: true, revision: 0, bytes, title }, editorOrigin)
      } else if (data.importId === importId) {
        if (data.type === 'save') finish(data.deck)
        if (data.type === 'import-error') finish()
      }
    }
    const timer = win.setTimeout(() => finish(undefined, '演示文件解析超时。'), 120_000)
    win.addEventListener('message', receive)
    document.addEventListener('sherlock:knowledge-identity-changed', cancel)
    signal?.addEventListener('abort', abort, { once: true })
    document.body.append(frame)
  })
}
