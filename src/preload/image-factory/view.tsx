import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { iconSource } from './icons'
import { applyRegion, between, canvasFor, canvasPoint, cropRaster, drawCover, encode, loadRaster, providerSize, ratios, validSize,
  type Point, type Raster, type Ratio, type Region } from './raster'
import styles from './style.css?raw'

export const imageFactoryOpenEvent = 'sherlock:image-factory-open'
type Reference = { data: Uint8Array; mediaType: string }
type Bridge = {
  generate(value: { id: string; prompt: string; size: string; reference?: Reference }): Promise<Uint8Array>
  cancel(id: string): Promise<unknown>
  save(value: { action: 'download'; data: Uint8Array; name: string; format: 'png' | 'jpg' }): Promise<{ cancelled?: boolean }>
}
type Version = Raster & { id: number; name: string; title: string; basedOn?: number }
type History = { all: Version[]; path: number[]; cursor: number }
const emptyHistory: History = { all: [], path: [], cursor: -1 }
type Mark = { version: number; rect: Region }
type Panel = 'adjust' | 'crop' | 'resize' | 'type' | 'export'
type Message = {
  id: string; role: 'user' | 'assistant' | 'notice'; body: string; region?: boolean
  reference?: string; version?: number; error?: boolean
}
type T = (zh: string, en: string) => string

function Symbol({ name, size }: { name: string; size?: number }) {
  const src = iconSource(name)
  return src ? <i className="if-symbol" style={{ '--if-icon': 'url("' + src.replaceAll('"', '%22') + '")', '--if-icon-size': size && size + 'px' } as CSSProperties} aria-hidden="true"/> : null
}
function Button({ icon, label, children, onClick, active, disabled, primary, className, type = 'button' }: {
  icon?: string; label?: string; children?: ReactNode; onClick?: () => void; active?: boolean
  disabled?: boolean; primary?: boolean; className?: string; type?: 'button' | 'submit'
}) {
  return <button type={type} className={'if-button ' + (className ?? '')} aria-label={label} title={label} data-current={active}
    aria-pressed={active} data-primary={primary} disabled={disabled} onClick={onClick}>
    {icon && <Symbol name={icon}/>} {children}
  </button>
}

function noticeText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
function titleFromPrompt(prompt: string, t: T) {
  const quoted = prompt.match(/[「“"《]([^」”"》\n]{1,36})[」”"》]/)?.[1]
  return quoted || t('生成图片', 'Generated image')
}
function acceptableFile(file: File, t: T) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)
    throw Error(t('请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。', 'Choose a PNG, JPG, or WebP image up to 20 MB.'))
}
async function referenceFor(doc: Document, raster: Raster, area?: Region): Promise<Reference> {
  const bounds = area ?? { x: 0, y: 0, width: raster.width, height: raster.height }
  const scale = Math.min(1, 2048 / Math.max(bounds.width, bounds.height))
  const { canvas, context } = canvasFor(doc, {
    width: Math.max(1, Math.round(bounds.width * scale)), height: Math.max(1, Math.round(bounds.height * scale)),
  })
  context.drawImage(raster.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height)
  let blob = await encode(canvas)
  if (blob.size > 8 * 1024 * 1024) blob = await encode(canvas, 'image/jpeg', .92)
  return { data: new Uint8Array(await blob.arrayBuffer()), mediaType: blob.type }
}

function Editor({ doc, bridge, close, t }: { doc: Document; bridge: Bridge; close(): void; t: T }) {
  const [history, setHistory] = useState<History>(emptyHistory)
  const [preview, setPreview] = useState<number>()
  const [ratio, setRatio] = useState<Ratio>('4:5')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [marking, setMarking] = useState(false)
  const [mark, setMark] = useState<Mark>()
  const [draft, setDraft] = useState<Region>()
  const [panel, setPanel] = useState<Panel>()
  const [expanded, setExpanded] = useState(true)
  const [busy, setBusy] = useState(false)
  const [drop, setDrop] = useState(false)
  const [toast, setToast] = useState('')
  const [zoom, setZoom] = useState(1)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const [filters, setFilters] = useState({ brightness: 0, contrast: 0 })
  const [dimensions, setDimensions] = useState({ width: '', height: '' })
  const [caption, setCaption] = useState({ text: '', fontSize: 48, placement: 'upper', color: '#ffffff' })
  const [reference, setReference] = useState<(Raster & { name: string })>()
  const file = useRef<HTMLInputElement>(null), refFile = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null)
  const urls = useRef(new Set<string>()), active = useRef<{ id: string; cancelled: boolean }>()
  const mounted = useRef(true), drag = useRef<{ pointerId: number; start: Point }>()
  const count = useRef(0)
  const selected = history.path[history.cursor]
  const current = history.all.find(version => version.id === selected)
  const shown = history.all.find(version => version.id === preview) ?? current
  const prior = history.all.find(version => version.id === current?.basedOn)
  const region = mark?.version === current?.id ? mark?.rect : undefined
  const drawing = panel === 'crop' || marking
  const fit = shown ? Math.max(.01, Math.min(Math.max(1, bounds.width) / shown.width, Math.max(1, bounds.height) / shown.height, 1)) : 1

  useEffect(() => {
    const allocated = urls.current
    return () => {
      mounted.current = false
      if (active.current) { active.current.cancelled = true; void bridge.cancel(active.current.id).catch(() => {}) }
      for (const url of allocated) URL.revokeObjectURL(url)
      allocated.clear()
    }
  }, [bridge])
  useEffect(() => {
    const target = stage.current
    if (!target) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width && entry.contentRect.height) setBounds({
        width: entry.contentRect.width, height: entry.contentRect.height,
      })
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [Boolean(shown)])
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [messages.length, Boolean(region)])
  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(handle)
  }, [toast])

  function notify(body: string, error = false) {
    if (mounted.current) setMessages(list => [...list, { id: crypto.randomUUID(), role: 'notice', body, error }])
  }
  function clearMark() {
    setMark(undefined); setDraft(undefined); setMarking(false); drag.current = undefined
  }
  function clearReference() {
    if (reference) { URL.revokeObjectURL(reference.url); urls.current.delete(reference.url) }
    setReference(undefined)
  }
  function stop() {
    if (!active.current) return
    active.current.cancelled = true
    void bridge.cancel(active.current.id).catch(() => {})
  }
  function add(raster: Raster, payload: Pick<Version, 'name' | 'title' | 'basedOn'>) {
    const id = ++count.current
    urls.current.add(raster.url)
    const version = { ...raster, ...payload, id }
    setHistory(previous => ({ all: [...previous.all, version],
      path: [...previous.path.slice(0, previous.cursor + 1), id], cursor: previous.cursor + 1 }))
    setPreview(undefined); clearMark(); setPanel(undefined); setZoom(1)
    return version
  }
  function travel(delta: number) {
    if (active.current) return
    clearMark(); setPanel(undefined); setPreview(undefined)
    setHistory(h => ({ ...h, cursor: Math.min(h.path.length - 1, Math.max(0, h.cursor + delta)) }))
  }
  async function operation(work: (job: { id: string; cancelled: boolean }) => Promise<void>) {
    if (active.current) return
    const job = { id: crypto.randomUUID(), cancelled: false }
    active.current = job
    setBusy(true)
    try { await work(job) }
    catch (error) {
      if (!job.cancelled) notify(noticeText(error, t('图片处理失败，请重试。', 'Image processing failed. Please retry.')), true)
    } finally {
      if (active.current === job) active.current = undefined
      if (mounted.current) {
        setBusy(false)
        if (job.cancelled) notify(t('已取消图片任务。', 'Image request canceled.'))
      }
    }
  }
  async function addBlob(blob: Blob, job: { cancelled: boolean }, payload: Pick<Version, 'name' | 'title' | 'basedOn'>) {
    const raster = await loadRaster(doc, blob)
    if (!mounted.current || job.cancelled) { URL.revokeObjectURL(raster.url); return }
    return add(raster, payload)
  }
  function importFile(selectedFile: File | undefined, attached = false) {
    if (!selectedFile) return
    void operation(async job => {
      acceptableFile(selectedFile, t)
      if (attached) {
        const raster = await loadRaster(doc, selectedFile)
        if (!mounted.current || job.cancelled) { URL.revokeObjectURL(raster.url); return }
        clearReference(); clearMark(); setPanel(undefined); urls.current.add(raster.url)
        setReference({ ...raster, name: selectedFile.name }); input.current?.focus()
      } else {
        const title = selectedFile.name.replace(/\.[^.]+$/, '').trim() || t('导入图片', 'Imported image')
        const version = await addBlob(selectedFile, job, { title, name: t('导入图片', 'Imported image'), basedOn: current?.id })
        if (version) notify(t('图片已导入画布。', 'Image imported to the canvas.'))
      }
    })
  }
  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const request = prompt.trim(), base = current, area = region, upload = area ? undefined : reference
    if (!request || active.current || preview !== undefined || panel === 'crop') return
    const target = area ?? base ?? ratios[ratio]
    const referenceImage = base ?? upload
    setExpanded(true); setPanel(undefined)
    setMessages(list => [...list, { id: crypto.randomUUID(), role: 'user', body: request, region: !!area, reference: upload?.name }])
    void operation(async job => {
      const source = area && base ? await referenceFor(doc, base, area)
        : upload ? await referenceFor(doc, upload) : referenceImage ? await referenceFor(doc, referenceImage) : undefined
      if (job.cancelled) return
      const direction = area
        ? t('参考图是原图中截取的选区。保持参考图的取景和相对位置，按下面描述修改选区：', 'The reference is the crop from a larger image. Preserve its framing and positions. Edit this crop as follows: ')
        : source ? t('使用参考图，根据以下描述修改或生成画面：', 'Use the reference image to make the requested image: ')
          : t('请生成一张图片。画面要适合指定比例并避免把关键文字和主体贴近边缘。要求：', 'Generate an image. Compose for the requested aspect ratio, keeping key details away from edges. Request: ')
      const description = direction + request + '\n' + t('目标画面尺寸：', 'Target canvas: ') + target.width + ' × ' + target.height + ' px'
      const data = await bridge.generate({ id: job.id, prompt: description, size: providerSize(target), reference: source })
      if (job.cancelled || !mounted.current) return
      const output = await loadRaster(doc, new Blob([Uint8Array.from(data)], { type: 'image/png' }))
      let blob
      try {
        const size = base ?? ratios[ratio]
        const { canvas, context } = canvasFor(doc, size)
        if (area && base) applyRegion(context, base, output, area)
        else if (base) context.drawImage(output.image, 0, 0, size.width, size.height)
        else drawCover(context, output, { ...size, x: 0, y: 0 })
        blob = await encode(canvas)
      } finally { URL.revokeObjectURL(output.url) }
      const title = base?.title ?? titleFromPrompt(request, t)
      const name = area ? t('局部修改', 'Region edit') : base ? t('对话修改', 'Chat edit') : t('初次生成', 'Generated image')
      const version = await addBlob(blob, job, { title, name, basedOn: base?.id })
      if (!version) return
      clearReference(); setPrompt('')
      setMessages(list => [...list, { id: crypto.randomUUID(), role: 'assistant',
        body: area ? t('已修改选区 1，结果已保存到画布。', 'Edited selection 1 and updated the canvas.')
          : t('图片已放到当前画布。', 'The image is on the current canvas.'), version: version.id }])
    })
  }
  function localEdit(event?: FormEvent) {
    event?.preventDefault()
    if (!current || !panel || panel === 'export') return
    const base = current, action = panel
    void operation(async job => {
      let target = { width: base.width, height: base.height }
      if (action === 'crop') {
        if (!draft || draft.width < 2 || draft.height < 2) throw Error(t('请在画布上拖动选出要保留的范围。', 'Select the area you want to keep.'))
        target = draft
      }
      if (action === 'resize') target = { width: Number(dimensions.width), height: Number(dimensions.height) }
      const { canvas, context } = canvasFor(doc, target)
      let name = ''
      if (action === 'crop' && draft) {
        context.drawImage(base.image, draft.x, draft.y, draft.width, draft.height, 0, 0, draft.width, draft.height)
        name = t('裁剪', 'Cropped')
      } else {
        if (action === 'adjust') {
          context.filter = 'brightness(' + (100 + filters.brightness) + '%) contrast(' + (100 + filters.contrast) + '%)'
        }
        context.drawImage(base.image, 0, 0, target.width, target.height)
        context.filter = 'none'
        if (action === 'adjust') name = t('调整明暗', 'Tone adjusted')
        if (action === 'resize') name = t('调整尺寸', 'Resized')
        if (action === 'type') {
          const position = caption.placement === 'middle' ? .5 : caption.placement === 'lower' ? .83 : .17
          context.font = '600 ' + caption.fontSize + 'px "Noto Sans SC",system-ui,sans-serif'
          context.fillStyle = caption.color; context.textAlign = 'center'; context.textBaseline = 'middle'
          context.fillText(caption.text.trim(), target.width / 2, Math.round(target.height * position), Math.max(1, target.width * .88))
          name = t('添加文字', 'Text added')
        }
      }
      await addBlob(await encode(canvas), job, { title: base.title, name, basedOn: base.id })
    })
  }
  function exportImage(format: 'png' | 'jpg') {
    if (!current) return
    setPanel(undefined); setPreview(undefined)
    const base = current
    void operation(async job => {
      const { canvas, context } = canvasFor(doc, base)
      if (format === 'jpg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, base.width, base.height) }
      context.drawImage(base.image, 0, 0)
      const bytes = new Uint8Array(await (await encode(canvas)).arrayBuffer())
      if (job.cancelled) return
      const name = base.title + '-v' + base.id
      const result = await bridge.save({ action: 'download', data: bytes, format, name })
      if (!result.cancelled && mounted.current && !job.cancelled) setToast(name + '.' + format + t(' 已保存', ' saved'))
    })
  }
  function selectPanel(next: Panel) {
    if (busy || !current) return
    setPreview(undefined); clearMark()
    if (next === 'resize') setDimensions({ width: String(current.width), height: String(current.height) })
    if (next === 'adjust') setFilters({ brightness: 0, contrast: 0 })
    if (next === 'type') setCaption({ text: '', fontSize: Math.min(48, Math.max(8, current.width / 4 | 0)), placement: 'upper', color: '#ffffff' })
    setPanel(p => p === next ? undefined : next)
  }
  function chooseMark() {
    if (busy || !current) return
    setPanel(undefined); setPreview(undefined); setDraft(undefined); setMark(undefined); drag.current = undefined
    setExpanded(true); setMarking(on => !on)
  }
  function onPointer(event: PointerEvent<HTMLDivElement>, step: 'start' | 'move' | 'end' | 'cancel') {
    if (!drawing || !current || busy) return
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), current)
    if (step === 'start') {
      if (event.button !== 0 || drag.current) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointerId: event.pointerId, start: point }
      setMark(undefined); setDraft(undefined)
      return
    }
    if (drag.current?.pointerId !== event.pointerId) return
    const box = between(drag.current.start, point)
    if (step === 'move') { setDraft(box); return }
    drag.current = undefined
    if (step === 'cancel' || box.width < 2 || box.height < 2) { setDraft(undefined); return }
    if (panel === 'crop') { setDraft(box); return }
    setDraft(undefined); setMark({ version: current.id, rect: box })
    input.current?.focus()
  }
  function switchPreview(id: number | undefined) {
    if (busy) return
    clearMark(); setPanel(undefined)
    setPreview(id === selected ? undefined : id)
  }

  const rectangle = draft ?? region
  const noEdits = !current || busy
  const initCaption = t('告诉我想做什么图，或先导入一张图片。生成结果会显示在中间画布。', 'Describe what to make, or import an image. Results appear in the center canvas.')
  const exportLabel = t('导出', 'Export')
  const tools = [
    ['crop', t('裁剪', 'Crop')], ['resize', t('尺寸', 'Resize')], ['adjust', t('调整', 'Adjust')], ['type', t('文字', 'Text')],
  ] as const
  const panelTitle = tools.find(item => item[0] === panel)?.[1]
  const status = region ? t('已添加到对话', 'Added to chat') : ''
  const importLabel = t('导入图片', 'Import image')
  return <div className="if-workplace" style={{ display: 'contents' }} onKeyDown={event => {
    if (event.key !== 'Escape' || (!panel && !marking && !region && preview === undefined)) return
    event.stopPropagation(); setPanel(undefined); clearMark(); setPreview(undefined)
  }}>
    <section className="if-work" aria-label={t('图像工厂画布', 'Image Factory canvas')}>
      <header className="if-top">
        <Button icon="left" label={t('返回对话', 'Back to chat')} onClick={close}/>
        <Symbol name="factory" size={20}/><strong>{t('图像工厂', 'Image Factory')}</strong>
        <span className="if-top-title" title={current?.title}>{current?.title ?? t('未命名画布', 'Untitled canvas')}</span>
        <Button icon="upload" label={importLabel} disabled={busy} onClick={() => file.current?.click()}>{t('导入', 'Import')}</Button>
        <Button icon="download" primary label={exportLabel} disabled={noEdits} onClick={() => selectPanel('export')}>{exportLabel}<Symbol name="chevron" size={12}/></Button>
        {!expanded && <Button icon="right-panel" label={t('展开右侧对话', 'Expand chat')} onClick={() => setExpanded(true)}/>}
      </header>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
        importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''
      }}/>
      <nav className="if-toolbar" aria-label={t('画布编辑工具', 'Canvas tools')}>
        <Button icon="undo" label={t('撤销', 'Undo')} disabled={busy || history.cursor <= 0} onClick={() => travel(-1)}/>
        <Button icon="redo" label={t('重做', 'Redo')} disabled={busy || history.cursor >= history.path.length - 1} onClick={() => travel(1)}/>
        <i className="if-separator"/>
        {tools.map(([key, label]) => <Button key={key} icon={key} active={panel === key} disabled={noEdits} onClick={() => selectPanel(key)}>{label}</Button>)}
        <Button icon="mark" active={marking} disabled={noEdits} onClick={chooseMark}>{t('框选修改', 'Select region')}</Button>
      </nav>
      <div className="if-stage" data-drop={drop} onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; setDrop(!busy)
      }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(false) }}
      onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDrop(false); importFile(event.dataTransfer.files[0]) }}>
        {!shown ? <div className="if-empty">
          <div className="if-empty-logo"><Symbol name="factory" size={37}/></div>
          <h2>{t('开始创作', 'Start creating')}</h2>
          <p>{t('在右侧描述要生成的画面，也可以从已有图片开始。', 'Describe an image in chat, or start with an existing image.')}</p>
          <Button icon="upload" primary disabled={busy} onClick={() => file.current?.click()}>{importLabel}</Button>
          <small>{t('可拖入 PNG、JPG 或 WebP', 'Drop a PNG, JPG, or WebP')}</small>
          <div className="if-ratios"><span>{t('画布比例', 'Canvas ratio')}</span>
            {(Object.keys(ratios) as Ratio[]).map(key => <Button key={key} icon={ratios[key].icon} active={ratio === key} disabled={busy} onClick={() => setRatio(key)}>{key}</Button>)}
          </div>
        </div> : <>
          <div className="if-stage-scroll" ref={stage}>
            <div className="if-raster" data-selecting={drawing} style={{ width: Math.max(1, Math.floor(shown.width * fit * zoom)), height: Math.max(1, Math.floor(shown.height * fit * zoom)) }}
              onPointerDown={e => onPointer(e, 'start')} onPointerMove={e => onPointer(e, 'move')}
              onPointerUp={e => onPointer(e, 'end')} onPointerCancel={e => onPointer(e, 'cancel')} onLostPointerCapture={e => onPointer(e, 'cancel')}>
              <img draggable={false} src={shown.url} alt={shown.title} style={panel === 'adjust' ? { filter: 'brightness(' + (100 + filters.brightness) + '%) contrast(' + (100 + filters.contrast) + '%)' } : undefined}/>
              {rectangle && <div className="if-region" data-dragging={!!drag.current} data-edge={rectangle.x + rectangle.width > shown.width * .72}
                style={{ left: rectangle.x / shown.width * 100 + '%', top: rectangle.y / shown.height * 100 + '%',
                  width: rectangle.width / shown.width * 100 + '%', height: rectangle.height / shown.height * 100 + '%' }}>
                <i/><i/><i/><i/>{region && <><span className="if-number">1</span><span className="if-region-status">{status}</span></>}
              </div>}
            </div>
          </div>
          <div className="if-canvas-status"><span>{shown.width} × {shown.height} px</span>
            {drawing && <span className="if-instruction">{panel === 'crop' ? t('拖动选择保留区域', 'Drag to select the crop') : t('拖动框选图片区域 · Esc 退出', 'Drag to select · Esc to exit')}</span>}
            <div className="if-zoom">
              <Button icon="minus" label={t('缩小', 'Zoom out')} disabled={zoom <= .25} onClick={() => setZoom(z => Math.max(.25, z / 1.25))}/>
              <span>{Math.round(fit * zoom * 100)}%</span>
              <Button icon="plus" label={t('放大', 'Zoom in')} disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.25))}/>
              <Button onClick={() => setZoom(1)}>{t('适合', 'Fit')}</Button>
            </div>
          </div>
        </>}
      </div>
      <footer className="if-history">
        {!!history.all.length && <><div className="if-history-head"><Symbol name="history"/>{t('版本', 'Versions')} · {history.all.length}
          {(prior || preview !== undefined) && <Button icon="compare" disabled={busy} onClick={() => switchPreview(preview === undefined ? prior?.id : undefined)}>
            {preview === undefined ? t('对比 V', 'Compare V') + prior?.id : t('返回 V', 'Back to V') + current?.id}
          </Button>}
        </div><div className="if-versions">
          {history.all.map(version => <button type="button" className="if-version" key={version.id} aria-current={shown?.id === version.id} disabled={busy} onClick={() => switchPreview(version.id)}>
            <img src={version.url} alt=""/><span><b>{version.name}</b><small>V{version.id} · {current?.id === version.id ? t('当前画布', 'Current canvas') : t('可预览', 'Available to preview')}</small></span>
            {shown?.id === version.id && <Symbol name="check" size={15}/>}
          </button>)}
        </div></>}
      </footer>
      {panel && current && <form className="if-pop" data-export={panel === 'export'} onSubmit={localEdit}>
        <div className="if-pop-head"><strong>{panelTitle ?? t('导出当前版本', 'Export current version')}</strong>
          <Button icon="close" label={t('关闭面板', 'Close panel')} onClick={() => { setPanel(undefined); clearMark() }}/>
        </div>
        {panel === 'export' ? <><p>V{current.id} · {current.width} × {current.height} px</p>
          {(['png', 'jpg'] as const).map(format => <button className="if-format" key={format} type="button" onClick={() => exportImage(format)}>
            <Symbol name="download"/>{format.toUpperCase()}<small>{format === 'png' ? t('无损', 'Lossless') : t('体积更小', 'Smaller file')}</small>
          </button>)}</> : <>
          {panel === 'crop' && <p>{draft ? draft.width + ' × ' + draft.height + ' px' : t('拖选需要保留的区域。', 'Select an area to keep.')}</p>}
          {panel === 'adjust' && (['brightness', 'contrast'] as const).map(key => <label key={key}>
            <span className="if-slider-head">{key === 'brightness' ? t('亮度', 'Brightness') : t('对比度', 'Contrast')}<span>{filters[key] > 0 ? '+' : ''}{filters[key]}</span></span>
            <input type="range" min="-80" max="80" value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: Number(e.target.value) }))}/>
          </label>)}
          {panel === 'resize' && <div className="if-dimensions">{(['width', 'height'] as const).map((key, i) => <label key={key}>
            {i ? t('高度（px）', 'Height (px)') : t('宽度（px）', 'Width (px)')}
            <input type="number" min="1" max="4096" value={dimensions[key]} onChange={e => setDimensions(d => ({ ...d, [key]: e.target.value }))}/>
          </label>)}</div>}
          {panel === 'type' && <><label>{t('文字内容', 'Text')}<input value={caption.text} maxLength={100} onChange={e => setCaption(c => ({ ...c, text: e.target.value }))}/></label>
            <div className="if-dimensions"><label>{t('字号（px）', 'Font size (px)')}
              <input type="number" min="8" max="900" value={caption.fontSize} onChange={e => setCaption(c => ({ ...c, fontSize: Number(e.target.value) }))}/>
            </label><label>{t('颜色', 'Color')}<input type="color" value={caption.color} onChange={e => setCaption(c => ({ ...c, color: e.target.value }))}/></label></div>
            <label>{t('位置', 'Placement')}<select value={caption.placement} onChange={e => setCaption(c => ({ ...c, placement: e.target.value }))}>
              <option value="upper">{t('上方居中', 'Top center')}</option><option value="middle">{t('画面居中', 'Center')}</option><option value="lower">{t('下方居中', 'Bottom center')}</option>
            </select></label></>}
          <div className="if-form-actions">
            <Button onClick={() => { setFilters({ brightness: 0, contrast: 0 }); setDimensions({ width: String(current.width), height: String(current.height) }); setDraft(undefined); setCaption(c => ({ ...c, text: '' })) }}>{t('重置', 'Reset')}</Button>
            <Button primary type="submit" disabled={busy || (panel === 'crop' && !draft) ||
              (panel === 'resize' && !validSize(Number(dimensions.width), Number(dimensions.height))) ||
              (panel === 'type' && (!caption.text.trim() || caption.fontSize < 8 || caption.fontSize > 900))}>{t('应用', 'Apply')}</Button>
          </div>
        </>}
      </form>}
      {toast && <div className="if-toast" role="status"><Symbol name="check" size={15}/> {toast}</div>}
    </section>
    <aside className="if-chat" hidden={!expanded} aria-label={t('图像工厂对话', 'Image Factory chat')}>
      <header className="if-chat-top"><span className="if-chat-tab"><Symbol name="spark" size={15}/><strong>{t('对话', 'Chat')}</strong></span>
        <Button icon="right-panel" label={t('收起右侧对话', 'Collapse chat')} onClick={() => setExpanded(false)}/>
      </header>
      <div className="if-context"><Symbol name="image" size={15}/><span>
        {current ? current.title + ' · V' + current.id : t('未命名画布', 'Untitled canvas')}
        {preview !== undefined && t('（预览 V', ' (previewing V') + preview + t('）', ')')}
      </span></div>
      <div className="if-messages" ref={scroll} role="log" aria-live="polite">
        {(!messages.length || !current) && <div className="if-assistant"><Symbol name="spark"/><div><strong>{t('图像助手', 'Image assistant')}</strong><p>{initCaption}</p>
          {!current && <div className="if-suggestions">
            <Button disabled={busy} onClick={() => {
              setPrompt(t('做一张「周末咖啡市集」海报。暖棕色调，右下放一杯咖啡，标题用奶油白。活动为 11 月 21–22 日，地点是南岸仓库。', 'Make a Weekend Coffee Market poster. Use warm browns, place a coffee cup in the lower right, and use an ivory title. Nov 21–22 at Southbank Warehouse.'))
              input.current?.focus()
            }}>{t('制作活动海报', 'Make a poster')}</Button>
            <Button disabled={busy} onClick={() => file.current?.click()}>{t('优化已有图片', 'Improve an image')}</Button>
          </div>}
        </div></div>}
        {messages.map(msg => {
          const version = history.all.find(v => v.id === msg.version)
          if (msg.role === 'user') return <div className="if-user" key={msg.id}>{(msg.region || msg.reference) &&
            <div className="if-reference">{msg.region && <span className="if-number">1</span>}<span>{msg.region ? t('选区 1', 'Selection 1') : msg.reference}</span></div>}<div>{msg.body}</div></div>
          if (msg.role === 'notice') return <div className="if-notice" data-error={msg.error} key={msg.id}>{msg.body}</div>
          return <div className="if-assistant" key={msg.id}><Symbol name="spark"/><div><strong>{t('图像助手', 'Image assistant')}</strong><p>{msg.body}</p>{version &&
            <button type="button" className="if-receipt" onClick={() => switchPreview(version.id)} disabled={busy}><img src={version.url} alt=""/><span>
              <b>{version.name === t('初次生成', 'Generated image') ? version.title : version.name}</b><small>V{version.id} · {version.width} × {version.height} px</small>
            </span></button>}
          </div></div>
        })}
        {region && !busy && <div className="if-notice"><span className="if-number">1</span>{' '}{t('已引用画布上的选区 1', 'Selection 1 attached from canvas')} · V{current?.id}</div>}
        {busy && <div className="if-notice" role="status">{t('正在处理图片…', 'Processing image…')}</div>}
      </div>
      <form className="if-composer" data-region={!!region} onSubmit={send}>
        {(region || reference) && <div className="if-reference">
          {region && <span className="if-number">1</span>}<span>{region ? t('选区 1', 'Selection 1') : reference?.name}</span>
          <Button icon="close" label={t('移除引用', 'Remove reference')} onClick={region ? clearMark : clearReference} disabled={busy}/>
        </div>}
        {!current && !reference && <div className="if-reference"><Symbol name={ratios[ratio].icon} size={14}/>{ratio}</div>}
        <textarea ref={input} value={prompt} maxLength={3600} rows={3} aria-label={t('图片描述', 'Image prompt')}
          placeholder={current ? t('描述想做的修改，或先在画布上框选…', 'Describe an edit, or select a region on the canvas…')
            : t('描述你想生成的画面…', 'Describe the image you want to make…')}
          onChange={e => setPrompt(e.target.value)} disabled={busy} onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send() }
          }}/>
        <div className="if-composer-bottom">
          <input ref={refFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => {
            importFile(e.currentTarget.files?.[0], true); e.currentTarget.value = ''
          }}/>
          <Button icon="paperclip" label={t('附加参考图', 'Attach reference image')} disabled={busy} onClick={() => refFile.current?.click()}/>
          <span>{region ? t('作用于选区 1', 'Applies to selection 1') : current ? t('图像编辑', 'Image editing') : t('生成到当前画布', 'Generate to canvas')}</span>
          {busy ? <Button icon="close" className="if-send" label={t('取消', 'Cancel')} onClick={stop}/>
            : <Button type="submit" icon="arrow-up" primary className="if-send" label={t('发送', 'Send')} disabled={!prompt.trim() || preview !== undefined || panel === 'crop'}/>}
        </div>
      </form>
    </aside>
  </div>
}

export function mountImageFactory(doc: Document, host: WorkspaceSurfaceHost, bridge: Bridge) {
  const root = doc.createElement('div')
  root.className = 'image-factory'
  const style = doc.createElement('style')
  style.textContent = styles
  doc.head.append(style)
  host.register('image-factory', root)
  const react = createRoot(root)
  let identity = 0
  let english = doc.documentElement.dataset.odysseyLocale === 'en'
  const render = () => react.render(<Editor key={identity} doc={doc} bridge={bridge} close={() => host.revealConversation()} t={(zh, en) => english ? en : zh}/>)
  const language = new MutationObserver(() => {
    const now = doc.documentElement.dataset.odysseyLocale === 'en'
    if (now !== english) { english = now; render() }
  })
  language.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  const open = () => host.open('image-factory')
  render()
  return {
    open,
    reset() { identity++; host.close('image-factory'); render() },
    dispose() { language.disconnect(); react.unmount(); root.remove(); style.remove() },
  }
}
