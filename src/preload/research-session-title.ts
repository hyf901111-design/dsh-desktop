type TitleNode = {
  name?: string
  title?: string
  kind?: string
  excerpt?: string
  generationStatus?: string
  containerSpec?: { type?: string; title?: string }
}

type TitleWorkspace = {
  getSnapshot(): { artifacts: TitleNode[]; files: TitleNode[] }
  subscribe(fn: () => void): () => void
}

const emptyTitles = new Set(['智能容器', 'Smart container', '研究组件', 'Research component', '页签'])

export function boardComponentTitles({ artifacts, files }: ReturnType<TitleWorkspace['getSnapshot']>) {
  const titles = [...files, ...artifacts].flatMap(node => {
    if (node.containerSpec?.type === 'board-tabs') return []
    if (node.kind === 'generated-container' && !node.containerSpec) return []
    if (node.generationStatus && node.generationStatus !== 'completed' && !node.containerSpec) return []
    const label = node.name ?? node.containerSpec?.title ?? node.title
    const visible = label && !emptyTitles.has(label) ? label : node.excerpt
    const title = visible?.split(/\r?\n/).find(line => line.trim())?.replace(/^\s*#{1,6}\s+/, '').trim().slice(0, 120)
    return title && !emptyTitles.has(title) ? [title] : []
  })
  return [...new Set(titles)].slice(-6)
}

/** Only title-bearing changes need to reach the Host. Geometry and selection are local. */
export function watchResearchSessionTitle(win: Window, sessionId: string, workspace: TitleWorkspace, eligible: () => boolean) {
  if (!win.fetch) return () => {}
  let sent: string | undefined
  let timer: number | undefined
  let active = true
  let busy = false
  let pinned = false
  const payload = () => JSON.stringify({
    sessionId,
    locale: win.document.documentElement.dataset.odysseyLocale === 'en' ? 'en' : 'zh',
    components: boardComponentTitles(workspace.getSnapshot())
  })
  const sync = async () => {
    win.clearTimeout(timer)
    if (busy || pinned || !eligible()) return
    const body = payload()
    if (body === sent) return
    busy = true
    try {
      const response = await win.fetch('/sherlock/research/session-title', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body
      })
      if (response.ok) {
        pinned = (await response.json()).automatic === false
        sent = body
      }
    } catch { /* Retry on the next canvas change or when the board reopens. */ }
    finally {
      busy = false
      if (!pinned && eligible() && payload() !== body) {
        if (active) queue()
        else void sync()
      }
    }
  }
  const queue = () => {
    win.clearTimeout(timer)
    timer = win.setTimeout(sync, 250)
  }
  const off = workspace.subscribe(queue)
  void sync()
  return () => {
    active = false
    off()
    void sync()
  }
}
