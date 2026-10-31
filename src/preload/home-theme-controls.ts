import type {HomeTheme} from '../shared/home-themes'

export type HomeThemePreview = {
  canvas: HTMLCanvasElement
  resize(width: number, height: number): void
  render(seconds: number, dark: boolean): boolean
  dispose(): void
}

export type HomeThemeController = {
  getSelected(): HomeTheme
  select(id: HomeTheme): void
  getThumbnail(id: HomeTheme): string | null
  /** A transient view of the real wallpaper renderer; callers own its lifetime. */
  createPreview?(id: HomeTheme): HomeThemePreview | null
  subscribe(listener: () => void): () => void
}

const pending = new WeakMap<Document, Promise<void>>()
let sequence = 0

/** Ask the native appearance owner; the preload never writes presentation attributes. */
export function toggleHomeAppearance(doc: Document = document): Promise<void> {
  const existing = pending.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win) return Promise.reject(new Error('Appearance service unavailable'))
  const requestId = `${Date.now()}:${++sequence}`
  let begin!: () => void
  const promise = new Promise<void>((resolve, reject) => {
    let timer = 0
    const finish = (error?: Error) => {
      win.clearTimeout(timer)
      doc.removeEventListener('sherlock:home-appearance-reply', reply)
      win.removeEventListener('pagehide', departed)
      if (error) reject(error)
      else resolve()
    }
    const departed = () => finish(new Error('Appearance request cancelled'))
    const reply = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (!data || data.requestId !== requestId || typeof data.ok !== 'boolean') return
      finish(data.ok ? undefined : new Error(typeof data.error === 'string' ? data.error : 'Appearance change failed'))
    }
    begin = () => {
      doc.addEventListener('sherlock:home-appearance-reply', reply)
      win.addEventListener('pagehide', departed, {once: true})
      timer = win.setTimeout(() => finish(new Error('Appearance service unavailable')), 5000)
      try { doc.dispatchEvent(new win.CustomEvent('sherlock:home-appearance-request', {detail: {requestId, action: 'toggle'}})) }
      catch (error) { finish(error instanceof Error ? error : new Error('Appearance request failed')) }
    }
  })
  pending.set(doc, promise)
  void promise.then(() => {if (pending.get(doc) === promise) pending.delete(doc)}, () => {if (pending.get(doc) === promise) pending.delete(doc)})
  begin()
  return promise
}
