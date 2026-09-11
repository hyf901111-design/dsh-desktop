/** Sidebar PDF rendering uses the same bundled PDF.js assets as Research. */
export function loadSidebarPdfLibrary(win = window) {
  if (win.__sherlockPdfjs?.getDocument) return Promise.resolve(win.__sherlockPdfjs)
  if (win.__sherlockSidebarPdfLoading) return win.__sherlockSidebarPdfLoading
  win.__sherlockSidebarPdfLoading = new Promise((resolve, reject) => {
    const doc = win.document
    let script = doc.querySelector('script[data-sherlock-pdfjs-loader]')
    const fresh = !script
    if (!script) { script = doc.createElement('script'); script.type = 'module'; script.src = '/sherlock-pdfjs/loader.js'; script.dataset.sherlockPdfjsLoader = '' }
    const finish = (error) => {
      win.clearTimeout(timer)
      script.removeEventListener('load', loaded); script.removeEventListener('error', failed)
      if (error) { script.remove(); reject(error) } else resolve(win.__sherlockPdfjs)
    }
    const loaded = () => finish(win.__sherlockPdfjs?.getDocument ? null : Error('PDF 引擎初始化失败'))
    const failed = () => finish(Error('PDF 引擎加载失败'))
    const timer = win.setTimeout(failed, 15000)
    script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', failed, { once: true })
    if (fresh) doc.head.appendChild(script)
  }).catch(error => { win.__sherlockSidebarPdfLoading = null; throw error })
  return win.__sherlockSidebarPdfLoading
}

export function mountSidebarPdfPreview(host, source, loadLibrary = loadSidebarPdfLibrary) {
  const doc = host.ownerDocument, win = doc.defaultView
  let stopped = false, loading, pdf, running = false, generation = 0, width = 0, resizeTimer
  const wanted = new Set(), pages = []
  Object.assign(host.style, { overflow: 'auto', height: '100%', width: '100%', minHeight: '0', overscrollBehavior: 'contain' })
  host.dataset.sidebarPdfViewer = ''
  host.tabIndex = 0
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', 'PDF 文档预览')
  const status = doc.createElement('div')
  status.setAttribute('role', 'status'); status.textContent = '正在加载 PDF…'; status.style.padding = '16px'
  const stack = doc.createElement('div')
  Object.assign(stack.style, { padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' })
  host.replaceChildren(status, stack)
  const release = record => {
    record.task?.cancel(); record.task = null
    if (record.canvas) { record.canvas.width = 1; record.canvas.height = 1; record.canvas.remove(); record.canvas = null }
    record.key = null
  }
  const fail = error => {
    if (stopped) return
    status.hidden = false; status.setAttribute('role', 'alert')
    status.textContent = 'PDF 预览暂时不可用，可通过上方下载按钮查看。'
    status.title = error instanceof Error ? error.message : String(error)
  }
  async function draw() {
    if (running || stopped || !pdf || width < 1 || doc.hidden) return
    running = true
    try {
      for (const index of wanted) {
        const record = pages[index], version = generation
        if (!record || stopped) break
        const key = width
        if (record.key === key) continue
        release(record)
        const page = await pdf.getPage(index + 1)
        if (stopped || generation !== version || !wanted.has(index)) continue
        const natural = page.getViewport({ scale: 1 })
        const scale = width / natural.width, css = page.getViewport({ scale })
        record.height = natural.height / natural.width
        record.shell.style.height = `${css.height}px`
        const ratio = Math.min(win.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (css.width * css.height)))
        const viewport = page.getViewport({ scale: scale * ratio })
        const canvas = doc.createElement('canvas'); record.canvas = canvas
        canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height))
        Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `PDF 第 ${index + 1} 页`)
        record.shell.appendChild(canvas)
        const context = canvas.getContext('2d')
        if (!context) throw Error('Canvas 不可用')
        const task = page.render({ canvasContext: context, viewport, background: '#ffffff' }); record.task = task
        try {
          await task.promise
          if (stopped || generation !== version || !wanted.has(index)) { release(record); continue }
          record.task = null; record.key = key; canvas.dataset.pdfRendered = 'true'
          status.hidden = true
          const text = await page.getTextContent().catch(() => ({ items: [] }))
          if (!stopped && record.canvas === canvas) canvas.setAttribute('aria-label', `第 ${index + 1} 页：${text.items.map(item => item.str || '').join(' ')}`)
        } catch (error) {
          if (error?.name !== 'RenderingCancelledException' && !stopped) throw error
        }
      }
    } catch (error) { fail(error) }
    finally {
      running = false
      if (!stopped && !doc.hidden && pages.some((record, index) => wanted.has(index) && record.key !== width && !record.task) && status.getAttribute('role') !== 'alert') win.requestAnimationFrame(draw)
    }
  }
  const intersect = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const index = Number(entry.target.dataset.pdfPage) - 1
      if (entry.isIntersecting) wanted.add(index)
      else { wanted.delete(index); if (pages[index]) release(pages[index]) }
    }
    void draw()
  }, { root: host, rootMargin: '400px 0px' })
  function resize() {
    const next = Math.floor(host.clientWidth - 24)
    if (next < 1 || next === width) return
    width = next; generation++
    for (const record of pages) { release(record); record.shell.style.height = `${width * record.height}px` }
    win.clearTimeout(resizeTimer); resizeTimer = win.setTimeout(() => void draw(), 80)
  }
  const observer = new win.ResizeObserver(resize); observer.observe(host)
  const visibility = () => {
    if (doc.hidden) { generation++; pages.forEach(release) } else void draw()
  }
  doc.addEventListener('visibilitychange', visibility)
  const ready = (async () => {
    try {
      const library = await loadLibrary(win)
      if (stopped) return
      loading = library.getDocument({ url: source, cMapUrl: '/sherlock-pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/sherlock-pdfjs/standard_fonts/', isEvalSupported: false, useWasm: false, maxImageSize: 16000000 })
      pdf = await loading.promise
      if (stopped) { await pdf.destroy(); return }
      const first = await pdf.getPage(1), natural = first.getViewport({ scale: 1 })
      if (stopped) return
      width = Math.max(1, Math.floor(host.clientWidth - 24))
      for (let index = 0; index < pdf.numPages; index++) {
        const shell = doc.createElement('div'); shell.dataset.pdfPage = String(index + 1)
        const height = natural.height / natural.width
        Object.assign(shell.style, { width: '100%', height: `${width * height}px`, flex: 'none', background: '#fff', boxShadow: '0 1px 5px #0003' })
        pages.push({ shell, height, key: null, canvas: null, task: null }); stack.appendChild(shell); intersect.observe(shell)
      }
      host.dataset.pdfPageCount = String(pdf.numPages)
      // IntersectionObserver chooses visible pages, including after tab restore.
    } catch (error) { fail(error) }
  })()
  return { ready, dispose() {
    stopped = true; generation++; win.clearTimeout(resizeTimer)
    observer.disconnect(); intersect.disconnect(); doc.removeEventListener('visibilitychange', visibility)
    pages.forEach(release); wanted.clear(); void loading?.destroy()?.catch?.(() => {})
    host.replaceChildren(); delete host.dataset.pdfPageCount
  } }
}

export function patchSidebarPdfPreview(source) {
  const marker = '/* sherlock:sidebar-pdfjs:v1 */'
  if (source.includes(marker)) return source
  const anchor = 'function PdfView(props) {'
  if (source.split(anchor).length !== 2) throw Error('Sidebar PDF component anchor drifted')
  const before = /load\.status === "ready" && \/\* @__PURE__ \*\/ \(0, react_jsx_runtime\.jsx\)\("iframe", \{\s+ref: frameRef,\s+className: clsx\(sidebar_module_css_default\.editorPdfFrame, interactionBlocked && sidebar_module_css_default\.editorPdfFrameBlocked\),\s+src: load\.url,\s+title\s+\}\)/g
  if ([...source.matchAll(before)].length !== 1) throw Error('Sidebar PDF frame anchor drifted')
  source = source.replace(before, `load.status === "ready" && (0, react_jsx_runtime.jsx)("div", {ref:frameRef,className:clsx(sidebar_module_css_default.editorPdfFrame,interactionBlocked&&sidebar_module_css_default.editorPdfFrameBlocked),children:(0,react_jsx_runtime.jsx)(SherlockSidebarPdfPreview,{url:load.url,title})})`)
  return source.replace(anchor, `${marker}\n${loadSidebarPdfLibrary.toString()}\n${mountSidebarPdfPreview.toString()}\nfunction SherlockSidebarPdfPreview({url,title}){const ref=(0,react.useRef)(null);(0,react.useEffect)(()=>{const view=mountSidebarPdfPreview(ref.current,url);return()=>view.dispose()},[url]);return(0,react_jsx_runtime.jsx)('div',{ref,'aria-label':title,style:{height:'100%',minHeight:0,width:'100%'}})}\n${anchor}`)
}
