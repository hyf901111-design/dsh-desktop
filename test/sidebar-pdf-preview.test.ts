import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSidebarPdfLibrary, mountSidebarPdfPreview, patchSidebarPdfPreview } from '../scripts/lib/sidebar-pdf-preview.mjs'

const windows: Window[] = []
afterEach(async () => { for (const win of windows.splice(0)) await win.happyDOM.close() })
function fixture() {
  const win = new Window({ url: 'http://127.0.0.1:4310/' }); windows.push(win)
  const host = win.document.createElement('div'); win.document.body.append(host)
  let width = 340, intersection: (entries: any[]) => void = () => {}, resized = () => {}
  Object.defineProperty(host, 'clientWidth', { get: () => width })
  Object.defineProperty(win.document, 'hidden', { value: false, configurable: true })
  Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', { value: () => ({}) })
  const disconnect = vi.fn()
  Object.assign(win, {
    IntersectionObserver: class { constructor(callback: typeof intersection) { intersection = callback } observe() {} disconnect = disconnect },
    ResizeObserver: class { constructor(callback: () => void) { resized = callback } observe() {} disconnect = disconnect }
  })
  const rendered: number[] = [], tasks: { cancel: () => void; promise: Promise<void> }[] = []
  let paused = false
  const pdf = {
    numPages: 8, destroy: vi.fn(async () => {}),
    getPage: vi.fn(async (index: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 300 * scale, height: 420 * scale }),
      getTextContent: async () => ({ items: [{ str: `Original page ${index}` }] }),
      render: () => {
        rendered.push(index)
        let reject: (reason: Error) => void = () => {}
        const promise = paused ? new Promise<void>((_resolve, no) => { reject = no }) : Promise.resolve()
        const task = { promise, cancel: vi.fn(() => reject(Object.assign(Error('cancelled'), { name: 'RenderingCancelledException' }))) }
        tasks.push(task); return task
      }
    }))
  }
  const loading = { promise: Promise.resolve(pdf), destroy: pdf.destroy }
  const getDocument = vi.fn(() => loading)
  const view = mountSidebarPdfPreview(host as unknown as HTMLElement, 'blob:local-pdf', async () => ({ getDocument }))
  const visible = (index: number, isIntersecting = true) => intersection([{ target: host.querySelector(`[data-pdf-page="${index}"]`), isIntersecting }])
  return { win, host, view, pdf, getDocument, rendered, tasks, disconnect, visible, resize: (value: number) => { width = value; resized() }, pause: () => { paused = true } }
}

describe('sidebar PDF preview lifecycle', () => {
  it('renders only nearby pages and releases offscreen canvases while keeping document access scoped', async () => {
    const f = fixture(); await f.view.ready
    expect(f.rendered).toEqual([])
    f.visible(1); await vi.waitFor(() => expect(f.host.querySelector('[data-pdf-rendered]')).not.toBeNull())
    expect(f.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:local-pdf', isEvalSupported: false }))
    expect(f.host.querySelector('canvas')?.getAttribute('aria-label')).toContain('Original page 1')
    f.visible(1, false); f.visible(8)
    await vi.waitFor(() => expect(f.host.querySelector('[data-pdf-page="8"] canvas[data-pdf-rendered]')).not.toBeNull())
    expect(f.host.querySelectorAll('canvas')).toHaveLength(1)
    expect(f.rendered).toEqual([1, 8])
    f.view.dispose(); expect(f.pdf.destroy).toHaveBeenCalledOnce(); expect(f.disconnect).toHaveBeenCalledTimes(2)
    expect(f.host.children).toHaveLength(0)
  })

  it('cancels stale renders during resize and when closing a document', async () => {
    const f = fixture(); await f.view.ready; f.pause(); f.visible(1)
    await vi.waitFor(() => expect(f.tasks).toHaveLength(1))
    f.resize(520); expect(f.tasks[0]!.cancel).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(f.tasks).toHaveLength(2))
    expect(f.host.querySelector('canvas')?.width).toBe(496)
    f.view.dispose(); expect(f.tasks[1]!.cancel).toHaveBeenCalledOnce()
    await Promise.resolve(); expect(f.host.children).toHaveLength(0)
  })

  it('shows an explicit download fallback instead of a blank preview on engine failure', async () => {
    const win = new Window(); windows.push(win)
    const host = win.document.createElement('div')
    const view = mountSidebarPdfPreview(host as unknown as HTMLElement, 'blob:broken', async () => { throw Error('Invalid PDF') })
    await view.ready
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('下载按钮')
    view.dispose()
  })

  it('shares one library load and retries after a failed module request', async () => {
    const win = new Window({ url: 'http://127.0.0.1:4310/' }); windows.push(win)
    const append = win.document.head.appendChild.bind(win.document.head)
    vi.spyOn(win.document.head, 'appendChild').mockImplementation((node: any) => { node.type = 'application/fixture'; return append(node) })
    const first = loadSidebarPdfLibrary(win as unknown as globalThis.Window)
    const failed = expect(first).rejects.toThrow('加载失败')
    expect(loadSidebarPdfLibrary(win as unknown as globalThis.Window)).toBe(first)
    win.document.querySelector('script')!.dispatchEvent(new win.Event('error')); await failed
    const second = loadSidebarPdfLibrary(win as unknown as globalThis.Window)
    const library = { getDocument: vi.fn() }; Object.assign(win, { __sherlockPdfjs: library })
    win.document.querySelector('script')!.dispatchEvent(new win.Event('load'))
    expect(await second).toBe(library)
  })

  it('patches the real sidebar PDF component once and refuses an upstream component drift', async () => {
    const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
    const patched = patchSidebarPdfPreview(source)
    expect(patchSidebarPdfPreview(patched)).toBe(patched)
    expect(patched).toContain('SherlockSidebarPdfPreview,{url:load.url,title}')
    const pdf = patched.slice(patched.indexOf('function PdfView(props)'), patched.indexOf('//#region src/client/builtins/viewers.tsx'))
    expect(pdf).not.toContain('jsx)("iframe"')
    expect(pdf).toContain('URL.revokeObjectURL(objectUrl)')
    expect(() => patchSidebarPdfPreview('function PdfView(props) {}')).toThrow('frame anchor drifted')
  })
})
