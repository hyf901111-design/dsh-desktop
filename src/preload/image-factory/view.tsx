import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { mountWorkspaceTopbarStyles } from '../workspace-topbar'
import { findWorkspaceSession, workspaceViewButton, workspaceViews, WorkspaceViewHover, type WorkspacePointerInBar } from '../workspace-view-shortcuts'
import { canvasImageTypes, maximumCanvasLayers, validCanvasScope, type CanvasImageType, type CanvasScope, type CanvasStorage } from '../../shared/image-factory-canvas'
import { CanvasWorkspace, createImageLayer } from './canvas-workspace'
import { CanvasActionsMenu } from './actions-menu'
import { ImageFactoryGallery } from './gallery'
import { iconSource } from './icons'
import { applyRegion, between, canvasFor, canvasPoint, drawFit, encode, loadRaster, providerSize, ratios, requestedImageSize, type Point, type Raster, type Region, type Size } from './raster'
import { drawLayers, imageFonts, moveLayer, textLayerStyle, type CanvasLayer, type ImageScene, type TextLayer } from './layers'
import styles from './style.css?raw'

export const imageFactoryOpenEvent = 'sherlock:image-factory-open'
type FactoryAsset = { id: string; sessionId: string; epoch: number; name: string; data: Uint8Array }
type Bridge = {
  workspacePointerInBar?: WorkspacePointerInBar
  storage: CanvasStorage
  archive(value: FactoryAsset): Promise<unknown>
  save(value: { action: 'download'; data: Uint8Array; name: string; format: 'png' | 'jpg' }): Promise<{ cancelled?: boolean }>
}
type T = (zh: string, en: string) => string
type CanvasJob = { id: string; sessionId: string; scope: CanvasScope; scene?: ImageScene; area?: Region; size: Size; title: string; delivering: boolean; release(): void }
const workspaceEnglishLabels = { chat: 'Chat', research: 'Research', notes: 'Notes', spreadsheet: 'Spreadsheet' }

function Icon({ name, size }: { name: string; size?: number }) {
  const src = iconSource(name)
  return src ? <i className="if-symbol" style={{ '--if-icon': 'url("' + src.replaceAll('"', '%22') + '")', '--if-icon-size': size && size + 'px' } as CSSProperties} aria-hidden="true"/> : null
}
function Button({ icon, label, children, onClick, active, disabled, primary, type = 'button' }: {
  icon?: string; label?: string; children?: ReactNode; onClick?: () => void; active?: boolean
  disabled?: boolean; primary?: boolean; type?: 'button' | 'submit'
}) {
  return <button type={type} className="if-button" aria-label={label} title={label}
    aria-pressed={active} data-current={active} data-primary={primary} disabled={disabled} onClick={onClick}>
    {icon && <Icon name={icon}/>} {children}
  </button>
}
function errorLabel(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
function titleFromPrompt(prompt: string, t: T) {
  return prompt.match(/[「“"《]([^」”"》\n]{1,36})[」”"》]/)?.[1] ||
    prompt.split(/[\n。！？；]/u)[0]?.trim().slice(0, 30) || t('生成图片', 'Generated image')
}
function blobData(doc: Document, blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new doc.defaultView!.FileReader()
    reader.onload = () => { const data = String(reader.result).split(',')[1]; if (data) resolve(data); else reject(Error('Invalid image data')) }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
async function referenceData(doc: Document, raster: Raster, area?: Region) {
  const bounds = area ?? { x: 0, y: 0, width: raster.width, height: raster.height }
  const scale = Math.min(1, 1536 / Math.max(bounds.width, bounds.height))
  const { canvas, context } = canvasFor(doc, {
    width: Math.max(1, Math.round(bounds.width * scale)), height: Math.max(1, Math.round(bounds.height * scale)),
  })
  context.drawImage(raster.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height)
  let blob = await encode(canvas)
  if (blob.size > 5 * 1024 * 1024) blob = await encode(canvas, 'image/jpeg', .92)
  return { data: await blobData(doc, blob), mediaType: blob.type }
}

function TextControls({ layer, change, t }: { layer: TextLayer; change(patch: Partial<TextLayer>): void; t: T }) {
  return <div className="if-text-format" role="group" aria-label={t('文本样式', 'Text formatting')}>
    <label><span>{t('字体', 'Font')}</span><select aria-label={t('字体', 'Font')} value={layer.family} onChange={e => change({ family: e.target.value as TextLayer['family'] })}>
      {imageFonts.map(font => <option key={font.family} value={font.family}>{t(font.label, font.english)}</option>)}
    </select></label>
    <label><span>{t('字号', 'Size')}</span><input type="number" min="8" max="600" step="1" aria-label={t('字号', 'Font size')}
      defaultValue={layer.fontSize} onChange={e => { const value = e.target.valueAsNumber; if (value >= 8 && value <= 600) change({ fontSize: value }) }}
      onBlur={e => { e.target.value = String(layer.fontSize) }}/></label>
    <label><span>{t('字重', 'Weight')}</span><select aria-label={t('字重', 'Weight')} value={layer.weight} onChange={e => change({ weight: Number(e.target.value) })}>
      <option value="400">{t('常规', 'Regular')}</option><option value="500">{t('中等', 'Medium')}</option>
      <option value="600">{t('半粗', 'Semibold')}</option><option value="700">{t('粗体', 'Bold')}</option>
    </select></label>
    <label><span>{t('对齐', 'Align')}</span><select aria-label={t('对齐', 'Align')} value={layer.align} onChange={e => change({ align: e.target.value as TextLayer['align'] })}>
      <option value="left">{t('左对齐', 'Left')}</option><option value="center">{t('居中', 'Center')}</option><option value="right">{t('右对齐', 'Right')}</option>
    </select></label>
    <label><span>{t('颜色', 'Color')}</span><input type="color" aria-label={t('文字颜色', 'Text color')} value={layer.color} onChange={e => change({ color: e.target.value })}/></label>
  </div>
}

function Editor({ doc, bridge, workspace, close, t }: { doc: Document; bridge: Bridge; workspace: CanvasWorkspace; close(): void; t: T }) {
  const { scope, scene, status, save: saveStatus } = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  const [galleryScope, setGalleryScope] = useState<CanvasScope>()
  const galleryOpen = galleryScope === scope
  const setGalleryOpen = (value: boolean) => setGalleryScope(value ? scope : undefined)
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const [marking, setMarking] = useState(false)
  const [area, setArea] = useState<Region>()
  const [rubberband, setRubberband] = useState<Region>()
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentPos, setCommentPos] = useState<Point>()
  const [layersOpen, setLayersOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const [dropTarget, setDropTarget] = useState<{ id: string; above: boolean }>()
  const [, redrawBusy] = useState(0)
  const uiOperations = useRef(new Set<CanvasScope>())
  const [toast, setToast] = useState('')
  const [zoom, setZoom] = useState(1)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const file = useRef<HTMLInputElement>(null), scroll = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null)
  const imageFrame = useRef<HTMLDivElement>(null), commentForm = useRef<HTMLFormElement>(null)
  const header = useRef<HTMLElement>(null), workspaceToggle = useRef<HTMLButtonElement>(null)
  const workspaceHover = useRef<WorkspaceViewHover>()
  const rectangleDrag = useRef<{ pointer: number; start: Point }>()
  const textDrag = useRef<{ id: string; pointer: number; start: Point; moved: boolean; x: number; y: number }>()
  const layerDrag = useRef<{ id: string; pointer: number; start: Point; dragging: boolean }>()
  const active = useRef(new Map<string, CanvasJob>())
  const commentCapture = useRef<{ id: string; sceneId: string; area: Region }>()
  const refreshBusy = () => redrawBusy(value => value + 1)
  const isBusy = (key: CanvasScope) => uiOperations.current.has(key) ||
    [...active.current.values()].some(job => job.scope === key || job.sessionId === key)
  const busy = status !== 'ready' || isBusy(scope)
  const setScene = (change: (old?: ImageScene) => ImageScene | undefined, persist = true) => workspace.change(scope, change, persist)
  const mounted = useRef(true)
  const current = galleryOpen ? undefined : scene
  const raster = current?.layers.find((layer): layer is Extract<CanvasLayer, { kind: 'image' }> => layer.kind === 'image')
  const selectedText = current?.layers.find((layer): layer is TextLayer => layer.kind === 'text' && layer.id === selectedId)
  const fit = current ? Math.max(.01, Math.min(Math.max(1, bounds.width) / current.width, Math.max(1, bounds.height) / current.height, 1)) : 1
  const displayScale = fit * zoom

  useLayoutEffect(() => {
    const showCanvas = () => setGalleryScope(undefined)
    doc.addEventListener('sherlock:image-factory-show-canvas', showCanvas)
    return () => doc.removeEventListener('sherlock:image-factory-show-canvas', showCanvas)
  }, [doc])

  useLayoutEffect(() => {
    const bar = header.current
    if (!bar) return
    const hover = new WorkspaceViewHover(bar, () => bar, setWorkspaceExpanded, bridge.workspacePointerInBar)
    workspaceHover.current = hover
    const closeWhenHidden = () => { if (doc.body.dataset.workspaceSurface !== 'image-factory') hover.setExpanded(false) }
    doc.addEventListener('sherlock:workspace-surface-change', closeWhenHidden)
    return () => { doc.removeEventListener('sherlock:workspace-surface-change', closeWhenHidden); hover.dispose() }
  }, [bridge, doc])
  useEffect(() => () => {
    mounted.current = false
    for (const job of active.current.values()) job.release()
    active.current.clear()
  }, [])
  useLayoutEffect(() => {
    setGalleryScope(undefined)
    setSelectedId(undefined); setEditing(undefined); setZoom(1); setLayersOpen(false)
    setCommentSending(false); clearSelection()
    textDrag.current = undefined; layerDrag.current = undefined; setDropTarget(undefined)
  }, [scope])
  useLayoutEffect(() => {
    if (!scroll.current) return
    const observer = new ResizeObserver(([entry]) => { if (entry) setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }) })
    observer.observe(scroll.current)
    return () => observer.disconnect()
  }, [Boolean(current)])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])
  useLayoutEffect(() => {
    if (!area || !current) return
    const outer = stage.current, frame = imageFrame.current, scroller = scroll.current
    if (!outer || !frame || !scroller) return
    const locate = () => {
      const view = outer.getBoundingClientRect(), image = frame.getBoundingClientRect()
      const left = image.left - view.left + area.x / current.width * image.width
      const top = image.top - view.top + area.y / current.height * image.height
      const right = left + area.width / current.width * image.width, bottom = top + area.height / current.height * image.height
      const popWidth = Math.min(320, view.width - 20), popHeight = commentForm.current?.offsetHeight ?? 178
      const x = right + popWidth + 14 <= view.width ? right + 10 : left - popWidth - 10 >= 10 ? left - popWidth - 10 : left
      const y = x === left ? (bottom + popHeight + 44 <= view.height ? bottom + 10 : top - popHeight - 10) : top
      setCommentPos({ x: Math.max(10, Math.min(view.width - popWidth - 10, x)), y: Math.max(10, Math.min(view.height - popHeight - 44, y)) })
    }
    locate()
    const observer = new ResizeObserver(locate); observer.observe(outer)
    if (commentForm.current) observer.observe(commentForm.current)
    scroller.addEventListener('scroll', locate, { passive: true })
    return () => { observer.disconnect(); scroller.removeEventListener('scroll', locate) }
  }, [area, current?.id, current?.width, current?.height, displayScale])

  function clearSelection() {
    rectangleDrag.current = undefined; setMarking(false); setArea(undefined); setRubberband(undefined)
    setComment(''); setCommentError(''); setCommentPos(undefined)
  }
  function patchLayer(id: string, patch: Partial<TextLayer>, persist = true) {
    setScene(old => old && { ...old, layers: old.layers.map(layer => layer.id === id && layer.kind === 'text' ? { ...layer, ...patch } : layer) }, persist)
  }
  function releaseText(id = editing) {
    if (!id) return
    setEditing(undefined)
    setScene(old => {
      if (!old?.layers.some(layer => layer.id === id && layer.kind === 'text' && !layer.text.trim())) return old
      return { ...old, layers: old.layers.filter(layer => layer.id !== id) }
    })
  }
  function appendText() {
    if (!current || busy) return
    if (current.layers.length >= maximumCanvasLayers) { setToast(t('画布图层已达到上限。', 'The canvas has reached the layer limit.')); return }
    clearSelection(); releaseText()
    const id = crypto.randomUUID()
    const layer: TextLayer = { id, kind: 'text', x: .14, y: .2, width: .72, text: '', fontSize: Math.max(8, Math.min(96, Math.round(current.width / 13))),
      color: '#ffffff', family: 'system-ui', weight: 600, align: 'center' }
    setScene(old => old && { ...old, layers: [...old.layers, layer] })
    setSelectedId(id); setEditing(id)
  }
  function layerMove(id: string, target: string, above: boolean) {
    setScene(old => old && { ...old, layers: moveLayer(old.layers, id, target, above) })
  }
  function layerPointer(event: PointerEvent<HTMLDivElement>, id: string, phase: 'start' | 'move' | 'end' | 'cancel') {
    if (phase === 'start') {
      const target = event.target as Element
      if (busy || event.button !== 0 || target.closest('.if-layer-row > .if-button')) return
      layerDrag.current = { id, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false }
      target.setPointerCapture(event.pointerId)
      return
    }
    const drag = layerDrag.current
    if (!drag || drag.id !== id || drag.pointer !== event.pointerId) return
    if (phase === 'cancel') { layerDrag.current = undefined; setDropTarget(undefined); return }
    if (phase === 'move' && !drag.dragging) {
      if (!event.buttons || Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4) return
      drag.dragging = true
      doc.getSelection()?.removeAllRanges()
    }
    if (!drag.dragging) { if (phase === 'end') layerDrag.current = undefined; return }
    const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-id]')
    const bounds = target?.getBoundingClientRect()
    const targetId = target?.dataset.layerId
    const destination = bounds && targetId && targetId !== id ? { id: targetId, above: event.clientY < bounds.top + bounds.height / 2 } : undefined
    if (phase === 'move') setDropTarget(destination)
    else {
      if (!busy && destination) layerMove(id, destination.id, destination.above)
      layerDrag.current = undefined
      setDropTarget(undefined)
    }
  }
  function deleteLayer(id: string) {
    if (busy) return
    clearSelection()
    if (editing === id) setEditing(undefined)
    if (selectedId === id) setSelectedId(undefined)
    setScene(old => old && { ...old, layers: old.layers.filter(layer => layer.id !== id) })
  }
  function textPointer(event: PointerEvent<HTMLElement>, layer: TextLayer, phase: 'start' | 'move' | 'end') {
    if (marking || area || editing || busy || !current || phase === 'start' && event.button !== 0) return
    if (phase === 'start') {
      setSelectedId(layer.id)
      event.currentTarget.setPointerCapture(event.pointerId)
      textDrag.current = { id: layer.id, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, moved: false, x: layer.x, y: layer.y }
      return
    }
    const drag = textDrag.current
    if (!drag || drag.id !== layer.id || drag.pointer !== event.pointerId) return
    if (phase === 'end') {
      if (drag.moved) workspace.commit(scope)
      textDrag.current = undefined; return
    }
    const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y
    if (!drag.moved && Math.hypot(dx, dy) < 3) return
    drag.moved = true
    patchLayer(layer.id, {
      x: Math.min(1 - layer.width, Math.max(0, drag.x + dx / (current.width * displayScale))),
      y: Math.min(Math.max(0, 1 - layer.fontSize * 1.2 / current.height), Math.max(0, drag.y + dy / (current.height * displayScale))),
    }, false)
  }
  function onRectanglePointer(event: PointerEvent<HTMLDivElement>, phase: 'start' | 'move' | 'end' | 'cancel') {
    if (!marking || !current || busy) return
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), current)
    if (phase === 'start') {
      if (event.button !== 0 || rectangleDrag.current) return
      rectangleDrag.current = { pointer: event.pointerId, start: point }
      event.currentTarget.setPointerCapture(event.pointerId)
      setRubberband(undefined)
      return
    }
    if (rectangleDrag.current?.pointer !== event.pointerId) return
    const selection = between(rectangleDrag.current.start, point)
    if (phase === 'move') { setRubberband(selection); return }
    rectangleDrag.current = undefined; setRubberband(undefined)
    if (phase === 'end' && selection.width >= 2 && selection.height >= 2) {
      setMarking(false); setArea(selection)
    }
  }
  async function importFile(image?: File) {
    if (!image || busy) return
    const release = workspace.retain(scope)
    uiOperations.current.add(scope); refreshBusy()
    try {
      if (!canvasImageTypes.includes(image.type as CanvasImageType) || image.size > 20 * 1024 * 1024)
        throw Error(t('请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。', 'Choose a PNG, JPG, or WebP image up to 20 MB.'))
      const id = crypto.randomUUID()
      const layer = await createImageLayer(doc, image, id, crypto.randomUUID(), image.type as CanvasImageType)
      const stored = workspace.change(scope, () => ({ id, width: layer.raster.width, height: layer.raster.height,
        title: image.name.replace(/\.[^.]+$/, '').trim().slice(0, 255) || t('导入图片', 'Imported image'), layers: [layer] }))
      if (!stored) URL.revokeObjectURL(layer.raster.url)
      if (stored && workspace.getSnapshot().scope === scope) {
        clearSelection(); setSelectedId(undefined); setEditing(undefined); setGalleryOpen(false); setZoom(1)
      }
    } catch (error) { if (mounted.current) setToast(errorLabel(error, t('图片无法读取。', 'Image could not be read.'))) }
    finally { uiOperations.current.delete(scope); release(); if (mounted.current) refreshBusy() }
  }
  async function exportImage(format: 'png' | 'jpg') {
    if (!current || busy) return
    uiOperations.current.add(scope); refreshBusy()
    try {
      const { canvas, context } = canvasFor(doc, current)
      if (format === 'jpg') { context.fillStyle = '#fff'; context.fillRect(0, 0, current.width, current.height) }
      await drawLayers(context, current)
      const data = new Uint8Array(await (await encode(canvas)).arrayBuffer())
      const result = await bridge.save({ action: 'download', data, format, name: current.title })
      if (!result.cancelled && mounted.current) setToast(t('图片已保存。', 'Image saved.'))
    } catch (error) { if (mounted.current) setToast(errorLabel(error, t('图片导出失败。', 'Image export failed.'))) }
    finally { uiOperations.current.delete(scope); if (mounted.current) refreshBusy() }
  }
  useLayoutEffect(() => {
    const emit = (name: string, data: object) => doc.dispatchEvent(new CustomEvent('sherlock:image-factory-' + name, { detail: data }))
    const release = (job: CanvasJob) => {
      if (!active.current.delete(job.id)) return
      job.release(); if (mounted.current) refreshBusy()
    }
    const prepare = async (event: Event) => {
      const { id, sessionId, scope: requestedScope, prompt, uploaded, region } = (event as CustomEvent).detail ?? {}
      if (doc.body.dataset.workspaceSurface !== 'image-factory' || typeof id !== 'string' ||
          typeof sessionId !== 'string' || !validCanvasScope(sessionId) || typeof prompt !== 'string') return
      const reply = (data: object) => emit('prepared', { id, ...data })
      if ((requestedScope !== null && requestedScope !== sessionId) || requestedScope !== workspace.getSnapshot().scope)
        return reply({ error: t('当前工作区已变化。', 'The active workspace changed.') })
      if (isBusy(requestedScope)) return reply({ error: t('请等待当前图片任务处理完成。', 'Wait for the current image action to finish.') })
      uiOperations.current.add(requestedScope); refreshBusy()
      const hold = workspace.retain(requestedScope)
      let job: CanvasJob | undefined
      try {
        const ready = await workspace.ready(requestedScope)
        if (!mounted.current || doc.body.dataset.workspaceSurface !== 'image-factory' || workspace.getSnapshot().scope !== requestedScope)
          throw Error(t('当前工作区已变化。', 'The active workspace changed.'))
        const base = galleryScope === requestedScope ? undefined : ready
        const image = base?.layers.find(layer => layer.kind === 'image')
        const captured = commentCapture.current
        const selection = region && captured?.sceneId === base?.id ? captured?.area : undefined
        if (region && (!selection || !image)) throw Error(t('选区已变化，请重新框选。', 'The selection changed. Select the area again.'))
        const size = (selection ? undefined : requestedImageSize(prompt)) ?? base ?? ratios['4:5']
        const title = (selection ? base?.title : undefined) || titleFromPrompt(prompt, t)
        job = { id, sessionId, scope: requestedScope, scene: base, area: selection, size, title, delivering: false, release: hold }
        active.current.set(id, job)
        const reference = image && (selection || !uploaded) ? await referenceData(doc, image.raster, selection) : undefined
        if (!active.current.has(id) || !mounted.current || doc.body.dataset.workspaceSurface !== 'image-factory' ||
            workspace.getSnapshot().scope !== requestedScope) throw Error(t('当前工作区已变化。', 'The active workspace changed.'))
        const target = selection ?? size
        reply({ operation: selection ? 'region' : reference || uploaded ? 'edit' : 'generate', size: providerSize(target),
          width: target.width, height: target.height, title, reference })
      } catch (error) {
        if (job) release(job); else hold()
        reply({ error: errorLabel(error, t('无法读取画布。', 'Could not read the canvas.')) })
      } finally {
        uiOperations.current.delete(requestedScope)
        if (mounted.current) refreshBusy()
      }
    }
    const settled = (event: Event) => {
      const job = active.current.get((event as CustomEvent).detail?.id)
      if (job && !job.delivering) release(job)
    }
    const deliver = async (event: Event) => {
      const info = (event as CustomEvent).detail
      const job = active.current.get(info?.id)
      const url = typeof info?.url === 'string' && info.url.startsWith('blob:') ? info.url : undefined
      if (!job || info.sessionId !== job.sessionId || !url || job.delivering) {
        if (url && info.revoke) URL.revokeObjectURL(url)
        return
      }
      job.delivering = true
      const holdTarget = workspace.retain(job.sessionId)
      let output: Raster | undefined
      let newRaster: Raster | undefined
      try {
        await workspace.ready(job.sessionId)
        const response = await fetch(url)
        if (!response.ok) throw Error(t('图片结果无法读取。', 'Could not read the generated image.'))
        output = await loadRaster(doc, await response.blob())
        const { canvas, context } = canvasFor(doc, job.size)
        const previous = job.scene?.layers.find(layer => layer.kind === 'image')
        if (job.area && previous) applyRegion(context, previous.raster, output, job.area)
        else drawFit(context, output, job.size)
        const png = await encode(canvas)
        const layer = await createImageLayer(doc, png, job.id, previous?.id ?? crypto.randomUUID(), 'image/png')
        newRaster = layer.raster
        if (!mounted.current || active.current.get(job.id) !== job) return
        const others = job.scene?.layers ?? []
        const layers = previous ? others.map(item => item.id === previous.id ? layer : item) : [layer, ...others]
        const nextScene = { id: job.id, title: job.title, width: layer.raster.width, height: layer.raster.height, layers }
        if (!workspace.change(job.sessionId, () => nextScene)) return
        newRaster = undefined
        if (workspace.getSnapshot().scope === job.sessionId) {
          clearSelection(); setGalleryScope(undefined); if (!job.scene) setZoom(1)
        }
        try {
          let data = layer.data
          if (layers.some(item => item.kind === 'text' && item.text.trim())) {
            const flattened = canvasFor(doc, nextScene)
            await drawLayers(flattened.context, nextScene)
            data = new Uint8Array(await (await encode(flattened.canvas)).arrayBuffer())
          }
          const epoch = workspace.epoch(job.sessionId)
          if (!mounted.current || active.current.get(job.id) !== job || epoch === undefined) return
          await bridge.archive({ id: job.id, sessionId: job.sessionId, epoch, name: job.title, data })
        }
        catch { if (mounted.current && workspace.getSnapshot().scope === job.sessionId) setToast(t('画布已更新。知识库将从会话记录补收生成结果。', 'Canvas updated. The library will collect the generated result from chat history.')) }
      } catch (error) {
        if (mounted.current && workspace.getSnapshot().scope === job.sessionId) setToast(errorLabel(error, t('图片没能放到画布。', 'Could not place the image on the canvas.')))
      } finally {
        if (info.revoke) URL.revokeObjectURL(url)
        if (output) URL.revokeObjectURL(output.url)
        if (newRaster) URL.revokeObjectURL(newRaster.url)
        holdTarget()
        release(job)
      }
    }
    const action = (event: Event) => {
      if (doc.body.dataset.workspaceSurface === 'image-factory' && (event as CustomEvent).detail?.kind === 'import' && !busy) file.current?.click()
    }
    const publish = () => emit('state', { current: !!current, busy })
    const events = { prepare, settled, deliver, action, 'request-state': publish }
    for (const [event, callback] of Object.entries(events)) doc.addEventListener('sherlock:image-factory-' + event, callback)
    publish()
    return () => { for (const [event, callback] of Object.entries(events)) doc.removeEventListener('sherlock:image-factory-' + event, callback) }
  }, [doc, t, bridge, workspace, scope, galleryScope, current, busy])
  function sendComment() {
    const value = comment.trim()
    if (!value || busy || commentSending || !area || !current) return
    const id = crypto.randomUUID()
    commentCapture.current = { id, sceneId: current.id, area }
    setCommentSending(true); setCommentError('')
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    const finish = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (data?.id !== id) return
      doc.removeEventListener('sherlock:image-factory-comment-result', finish)
      if (!mounted.current || commentCapture.current?.id !== id) return
      commentCapture.current = undefined
      setCommentSending(false)
      if (data.error) setCommentError(data.error)
      else { setComment(''); setArea(undefined) }
    }
    const admission = new CustomEvent('sherlock:image-factory-comment', { cancelable: true, detail: { id, prompt: value } })
    doc.addEventListener('sherlock:image-factory-comment-result', finish)
    if (doc.dispatchEvent(admission)) finish(new CustomEvent('sherlock:image-factory-comment-result', {
      detail: { id, error: t('对话服务尚未就绪，请重试。', 'Chat is not ready. Try again.') },
    }))
  }
  function useGalleryPrompt(prompt: string) {
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-use-prompt', { detail: { prompt }, cancelable: true }))
  }
  function openWorkspaceView(view: string) {
    const sessionId = findWorkspaceSession(doc)?.dataset.eworkNotesSession
    if (!sessionId) { if (view === 'chat') close(); return }
    const button = workspaceViewButton(doc, sessionId, view)
    if (!button?.isConnected || button.disabled) {
      setToast(t('此会话视图暂不可用。', 'This conversation view is unavailable.')); return
    }
    close()
    workspaceViewButton(doc, sessionId, view)?.click()
  }

  const rectangle = rubberband ?? area
  const hasWorkspaceSession = workspaceExpanded && !!findWorkspaceSession(doc)
  const tabsLabel = workspaceExpanded ? t('收起工作区页签', 'Collapse workspace tabs') : t('展开工作区页签', 'Expand workspace tabs')
  return <section className="if-work" aria-label={t('图像工厂画布', 'Image Factory canvas')} onKeyDown={event => {
    if (event.key !== 'Escape' || commentSending || (!editing && !marking && !area)) return
    event.stopPropagation(); clearSelection(); releaseText()
  }}>
    <header className="if-top workspace-app-topbar" ref={header} onKeyDown={event => {
      if (event.key !== 'Escape' || !workspaceExpanded) return
      event.preventDefault(); event.stopPropagation(); workspaceHover.current?.setExpanded(false); workspaceToggle.current?.focus()
    }}>
      <Button icon="left" label={t('返回对话', 'Back to chat')} onClick={close}/>
      <div className="workspace-app-title"><Icon name="factory" size={18}/><span>{t('图像工厂', 'Image Factory')}</span></div>
      <div className="eb-workspace-controls">
        <button type="button" className="eb-workspace-toggle" ref={workspaceToggle} aria-label={tabsLabel} title={tabsLabel}
          aria-expanded={workspaceExpanded} aria-controls="image-factory-workspace-tabs" onClick={() => workspaceHover.current?.setExpanded(!workspaceExpanded)}><i aria-hidden="true"/></button>
        <nav id="image-factory-workspace-tabs" className="eb-workspace-tabs" aria-label={t('工作区视图', 'Workspace views')} aria-hidden={!workspaceExpanded}>
          {workspaceViews.map(([view, label]) => <button key={view} type="button" tabIndex={workspaceExpanded ? 0 : -1}
            aria-label={t('切换到', 'Switch to ') + t(label, workspaceEnglishLabels[view])}
            disabled={!hasWorkspaceSession && view !== 'chat'} onClick={() => openWorkspaceView(view)}>{t(label, workspaceEnglishLabels[view])}</button>)}
        </nav>
      </div>
      <span className="if-top-title" title={current?.title}>{current?.title}</span>
      <CanvasActionsMenu doc={doc} t={t} canExport={!!current?.layers.length && !busy} exporting={exportImage}
        galleryAction={scene && !busy ? galleryOpen ? { label: t('返回画布', 'Return to canvas'), run: () => setGalleryOpen(false) }
          : { label: t('打开灵感画廊', 'Open inspiration gallery'), run: () => { releaseText(); clearSelection(); setGalleryOpen(true) } } : undefined}/>
    </header>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
      void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''
    }}/>
    {current && <nav className="if-toolbar" aria-label={t('画布编辑工具', 'Canvas tools')}>
      <Button icon="mark" active={marking || !!area} disabled={busy || !raster} onClick={() => {
        releaseText(); setSelectedId(undefined); clearSelection(); if (!marking && !area) setMarking(true)
      }}>{t('框选修改', 'Edit selected area')}</Button>
      <Button icon="type" active={!!editing} disabled={busy} onClick={appendText}>{t('添加文本', 'Add text')}</Button>
      <Button icon="layers" active={layersOpen} onClick={() => setLayersOpen(value => !value)}>{t('图层', 'Layers')}</Button>
    </nav>}
    <div className="if-stage" data-layers-open={layersOpen} ref={stage}>
      {status === 'loading' || status === 'idle' ? <div className="if-canvas-message" role="status">{t('正在打开画布…', 'Opening canvas…')}</div>
        : status === 'error' ? <div className="if-canvas-message" role="alert">
          <span>{t('画布暂时无法读取。', 'The canvas could not be opened.')}</span>
          <Button onClick={() => workspace.select(scope)}>{t('重新打开', 'Try again')}</Button>
        </div> : !current ? <ImageFactoryGallery t={t} busy={busy} onUse={useGalleryPrompt}/> : <>
        <div className="if-stage-scroll" data-layers-open={layersOpen} ref={scroll} onPointerDown={event => {
          if (event.target === event.currentTarget || event.target === imageFrame.current && !marking) {
            releaseText(); setSelectedId(undefined); if (area && !commentSending) clearSelection()
          }
        }}>
          <div ref={imageFrame} className="if-raster" data-selecting={marking} style={{ width: Math.max(1, current.width * displayScale), height: Math.max(1, current.height * displayScale) }}
            onPointerDown={event => onRectanglePointer(event, 'start')} onPointerMove={event => onRectanglePointer(event, 'move')}
            onPointerUp={event => onRectanglePointer(event, 'end')} onPointerCancel={event => onRectanglePointer(event, 'cancel')}
            onLostPointerCapture={event => onRectanglePointer(event, 'cancel')}>
            {current.layers.map(layer => {
              if (layer.kind === 'image') return <img key={layer.id} draggable={false} src={layer.raster.url} alt={current.title}/>
              const style = { ...textLayerStyle(layer, current), transform: 'scale(' + displayScale + ')',
                transformOrigin: 'top left', outlineWidth: 1 / displayScale }
              return editing === layer.id ? <textarea key={layer.id} ref={element => {
                if (!element) return
                element.style.height = '0px'; element.style.height = element.scrollHeight + 'px'
              }} className="if-text-layer" data-selected="true" aria-label={t('编辑画布文本', 'Edit canvas text')}
                autoFocus rows={1} spellCheck={false} value={layer.text} maxLength={500}
                style={style} placeholder={t('输入文本', 'Enter text')} onChange={e => patchLayer(layer.id, { text: e.target.value })}
                onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); releaseText(layer.id) } }}
                onBlur={event => { if (!event.relatedTarget?.closest('.if-text-format')) releaseText(layer.id) }}/>
                : <div key={layer.id} className="if-text-layer" data-selected={selectedId === layer.id} style={style}
                  tabIndex={marking || busy ? -1 : 0} role="button" aria-label={layer.text}
                  onClick={() => { if (!marking && !area) setSelectedId(layer.id) }}
                  onDoubleClick={() => { if (!marking && !area && !busy) { setSelectedId(layer.id); setEditing(layer.id) } }}
                  onKeyDown={event => { if (!busy && (event.key === 'Enter' || event.key === 'F2')) { setSelectedId(layer.id); setEditing(layer.id) } }}
                  onPointerDown={event => textPointer(event, layer, 'start')} onPointerMove={event => textPointer(event, layer, 'move')}
                  onPointerUp={event => textPointer(event, layer, 'end')} onLostPointerCapture={event => textPointer(event, layer, 'end')}>{layer.text}</div>
            })}
            {rectangle && <div className="if-region" data-dragging={!!rubberband} style={{
              left: rectangle.x / current.width * 100 + '%', top: rectangle.y / current.height * 100 + '%',
              width: rectangle.width / current.width * 100 + '%', height: rectangle.height / current.height * 100 + '%',
            }}><i/><i/><i/><i/></div>}
          </div>
        </div>
        {marking && <div className="if-mark-hint" role="status">{t('在图上拖出要修改的区域 · Esc 取消', 'Drag over the area to edit · Esc to cancel')}</div>}
        {area && <form ref={commentForm} className="if-comment" role="dialog" aria-label={t('修改选区', 'Edit selected area')}
          style={commentPos ? { left: commentPos.x, top: commentPos.y } : { visibility: 'hidden' }} onSubmit={event => { event.preventDefault(); sendComment() }}>
          <div className="if-float-header"><strong>{t('修改选区', 'Edit selected area')}</strong><Button icon="close" label={t('取消框选', 'Cancel selection')} disabled={commentSending} onClick={clearSelection}/></div>
          <textarea autoFocus aria-label={t('修改意见', 'Edit instructions')} placeholder={t('描述要怎么修改这个区域…', 'Describe how to edit this area…')}
            ref={element => { if (element && commentPos && !comment && !commentSending && doc.activeElement === doc.body) element.focus({ preventScroll: true }) }}
            value={comment} maxLength={3600} disabled={commentSending} onChange={event => setComment(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendComment() }
            }}/>
          {commentError && <p className="if-comment-error" role="alert">{commentError}</p>}
          <div className="if-comment-footer"><Button onClick={clearSelection} disabled={commentSending}>{t('删除选区', 'Remove selection')}</Button>
            <Button type="submit" primary disabled={!comment.trim() || busy || commentSending}>{commentSending ? t('发送中…', 'Sending…') : t('发送', 'Send')}</Button></div>
        </form>}
        {selectedText && !marking && !area && !busy && <TextControls key={selectedText.id} layer={selectedText} change={patch => patchLayer(selectedText.id, patch)} t={t}/>}
        {layersOpen && <aside className="if-layers" aria-label={t('图层', 'Layers')}>
          <div className="if-float-header"><strong>{t('图层', 'Layers')}</strong><Button icon="close" label={t('关闭图层', 'Close layers')} onClick={() => setLayersOpen(false)}/></div>
          {!current.layers.length && <p>{t('画布上还没有图层。', 'The canvas has no layers.')}</p>}
          {[...current.layers].reverse().map(layer => {
            const name = layer.kind === 'image' ? t('图片', 'Image') : layer.text.trim() || t('文本', 'Text')
            return <div key={layer.id} className="if-layer-row" data-layer-id={layer.id}
              data-current={selectedId === layer.id} data-drop={dropTarget?.id === layer.id ? dropTarget.above ? 'above' : 'below' : undefined}
              onPointerDown={event => layerPointer(event, layer.id, 'start')}
              onPointerMove={event => layerPointer(event, layer.id, 'move')}
              onPointerUp={event => layerPointer(event, layer.id, 'end')}
              onPointerCancel={event => layerPointer(event, layer.id, 'cancel')}
              onLostPointerCapture={event => layerPointer(event, layer.id, 'cancel')}>
              <button type="button" className="if-layer-name" aria-pressed={selectedId === layer.id} title={name}
                onClick={() => { releaseText(); clearSelection(); setSelectedId(layer.id) }}
                onDoubleClick={() => { if (layer.kind === 'text' && !busy) setEditing(layer.id) }}
                onKeyDown={event => {
                  if (busy || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                  const above = event.key === 'ArrowUp', index = current.layers.findIndex(item => item.id === layer.id)
                  const target = current.layers[index + (above ? 1 : -1)]
                  if (target) { event.preventDefault(); layerMove(layer.id, target.id, above) }
                }}>
                <Icon name="grip" size={13}/><Icon name={layer.kind === 'text' ? 'type' : 'image'} size={15}/><span>{name}</span>
              </button>
              <Button icon="trash" label={t('删除图层 ', 'Delete layer ') + name} disabled={busy} onClick={() => deleteLayer(layer.id)}/>
            </div>
          })}
        </aside>}
        <div className="if-canvas-status"><div className="if-canvas-readout"><span>{current.width} × {current.height} px</span>
          {saveStatus === 'saving' && <span role="status">{t('保存中…', 'Saving…')}</span>}
          {saveStatus === 'saved' && <span role="status">{t('已保存', 'Saved')}</span>}
          {saveStatus === 'error' && <Button onClick={() => workspace.commit(scope)}>{t('保存失败，重试', 'Save failed. Retry')}</Button>}
        </div><div className="if-zoom">
          <Button icon="minus" label={t('缩小', 'Zoom out')} disabled={zoom <= .25} onClick={() => setZoom(z => Math.max(.25, z / 1.25))}/>
          <span>{Math.round(displayScale * 100)}%</span>
          <Button icon="plus" label={t('放大', 'Zoom in')} disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.25))}/>
          <Button onClick={() => setZoom(1)}>{t('适合', 'Fit')}</Button>
        </div></div>
      </>}
    </div>
    {toast && <div className="if-toast" role="status">{toast}</div>}
  </section>
}

export function mountImageFactory(doc: Document, host: WorkspaceSurfaceHost, bridge: Bridge) {
  mountWorkspaceTopbarStyles(doc)
  const root = doc.createElement('div')
  root.className = 'image-factory'
  const style = doc.createElement('style')
  style.textContent = styles
  doc.head.append(style)
  host.register('image-factory', root)
  const react = createRoot(root)
  let identity = 0
  let workspace = new CanvasWorkspace(doc, bridge.storage)
  let session: CanvasScope = null
  const activeHere = () => host.current()?.surface === 'image-factory'
  const select = (event: Event) => {
    const scope = (event as CustomEvent).detail?.sessionId
    if (!validCanvasScope(scope)) return
    session = scope
    if (activeHere()) workspace.select(scope)
  }
  const adopt = (event: Event) => {
    const id = (event as CustomEvent).detail?.sessionId
    if (typeof id !== 'string' || !validCanvasScope(id)) return
    const reply = (error?: unknown) => doc.dispatchEvent(new CustomEvent('sherlock:image-factory-adopted', {
      detail: { sessionId: id, error: error && errorLabel(error, '画布未能绑定到会话。') },
    }))
    void workspace.adopt(id).then(() => reply(), reply)
  }
  doc.addEventListener('sherlock:image-factory-session', select)
  doc.addEventListener('sherlock:image-factory-adopt', adopt)
  let english = doc.documentElement.dataset.odysseyLocale === 'en'
  const render = () => react.render(<Editor key={identity} doc={doc} bridge={bridge} workspace={workspace} close={() => host.revealConversation()} t={(zh, en) => english ? en : zh}/>)
  const language = new MutationObserver(() => {
    const now = doc.documentElement.dataset.odysseyLocale === 'en'
    if (now !== english) { english = now; render() }
  })
  language.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  const open = () => {
    host.open('image-factory')
    if (activeHere()) {
      doc.dispatchEvent(new Event('sherlock:image-factory-request-session'))
      workspace.select(session)
      doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    }
  }
  render()
  return {
    open,
    async openSessionCanvas(id: string, activateSession: () => Promise<boolean>) {
      if (!validCanvasScope(id)) throw Error('来源会话已不可用。')
      const origin = host.current()
      const owner = workspace
      const stillCurrent = () => owner === workspace && host.current() === origin
      const release = owner.retain(id)
      try {
        const scene = await owner.ready(id)
        if (!stillCurrent()) return
        if (!scene) throw Error('来源会话没有已保存的画布，图片仍可在知识库预览。')
        if (!await activateSession()) throw Error('来源会话已不可用。')
        if (!stillCurrent()) return
        doc.dispatchEvent(new Event('sherlock:image-factory-request-session'))
        if (session !== id) throw Error('来源会话已切换，请重试。')
        doc.dispatchEvent(new Event('sherlock:image-factory-show-canvas'))
        open()
      } finally { release() }
    },
    reset() {
      identity++; host.close('image-factory'); workspace.dispose()
      workspace = new CanvasWorkspace(doc, bridge.storage)
      session = null
      doc.dispatchEvent(new Event('sherlock:image-factory-reset')); render()
    },
    dispose() {
      doc.removeEventListener('sherlock:image-factory-session', select)
      doc.removeEventListener('sherlock:image-factory-adopt', adopt)
      language.disconnect(); react.unmount(); workspace.dispose(); root.remove(); style.remove()
    },
  }
}
