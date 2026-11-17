import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { WorkspaceSurfaceHost } from '../workspace-surface-host'
import { mountWorkspaceTopbarStyles } from '../workspace-topbar'
import { findWorkspaceSession, workspaceViewButton, workspaceViews, WorkspaceViewHover, type WorkspacePointerInBar } from '../workspace-view-shortcuts'
import { canvasImageTypes, maximumCanvasLayers, validCanvasScope, brandArtworkIds, type BrandArtworkId, type BrandOverlay, type CanvasImageType, type CanvasScope, type CanvasStorage } from '../../shared/image-factory-canvas'
import { CanvasWorkspace, createImageLayer } from './canvas-workspace'
import { CanvasActionsMenu, type CanvasToolAction } from './actions-menu'
import { brandArtwork } from './brand-artwork'
import { brandDragType, findBrandAsset, moveBrandOverlay, placeBrandAsset, resizeBrandOverlay, type BrandAsset } from './brand-assets'
import { BrandAssetLibrary } from './brand-library'
import { imageFactoryFontFaces } from './fonts'
import { galleryArtwork, ImageFactoryGallery } from './gallery'
import { galleryExamples, type GalleryExample } from './gallery-examples'
import { galleryTemplateLayers } from './gallery-layout'
import { groupLayers, isEditableLayer, layerUnitId, removeLayerUnits, translateLayers, ungroupLayers,
  type EditableLayer } from './layer-groups'
import { ImageTaskTabs, type TaskAction, type TaskTabs } from './task-tabs'
import { iconSource } from './icons'
import { useImageViewport } from './viewport'
import { aiWatermarkColor, aiWatermarkFamily, aiWatermarkLayout, aiWatermarkText, drawAiWatermark } from './watermark'
import { applyRegion, between, canvasFor, canvasPoint, drawFit, encode, loadRaster, preservesRegionTransparency, providerDimensions, providerSize, ratios,
  regionEditBounds, regionEditFrame, requestedImageSize, type Point, type Raster, type Region, type Size } from './raster'
import { drawLayers, imageFonts, moveLayer, resizeTextLayer, textLayerStyle, textResizeHandles, textTopInsideCanvas,
  type CanvasLayer, type ImageScene, type TextLayer, type TextResizeHandle } from './layers'
import styles from './style.css?raw'

export const imageFactoryOpenEvent = 'sherlock:image-factory-open'
type FactoryProject = { sceneId: string; scope: CanvasScope; epoch: number; data: Uint8Array }
type Bridge = {
  workspacePointerInBar?: WorkspacePointerInBar
  storage: CanvasStorage
  saveProject(value: FactoryProject): Promise<unknown>
  save(value: { action: 'download'; data: Uint8Array; name: string; format: 'png' | 'jpg' }): Promise<{ cancelled?: boolean }>
}
type T = (zh: string, en: string) => string
type CanvasJob = { id: string; sessionId: string; scope: CanvasScope; scene?: ImageScene; edit?: { area: Region; frame: Region; preserveTransparency: boolean };
  targets?: { key: number; layer: CanvasLayer }[]; cutout?: boolean; size: Size; title: string; delivering: boolean; release(): void }
type SelectionDraft = { area: Region; text: string; requestId?: string; phase?: 'sending' | 'processing'; error?: string }
type CanvasTool = 'text' | 'region'
type DrawerTab = 'layers' | 'brand'
type ToolbarCommand = CanvasToolAction & { icon?: string; title?: string; iconOnly?: boolean; controls?: string; switch?: boolean }
type ToolbarGroup = { id: string; label?: string; commands: ToolbarCommand[] }
const overlayHandles = ['nw', 'ne', 'sw', 'se'] as const
const workspaceEnglishLabels = { chat: 'Chat', research: 'Research', notes: 'Notes', spreadsheet: 'Spreadsheet' }
const textResizeLabels: Record<TextResizeHandle, [string, string]> = {
  nw: ['左上角缩放文字', 'Scale text from top left'], ne: ['右上角缩放文字', 'Scale text from top right'],
  w: ['调整文字框左边', 'Resize left text edge'], e: ['调整文字框右边', 'Resize right text edge'],
  sw: ['左下角缩放文字', 'Scale text from bottom left'], se: ['右下角缩放文字', 'Scale text from bottom right'],
}

const overlayResizeLabels = {
  nw: ['从左上角调整大小', 'Resize from top left'], ne: ['从右上角调整大小', 'Resize from top right'],
  sw: ['从左下角调整大小', 'Resize from bottom left'], se: ['从右下角调整大小', 'Resize from bottom right'],
} as const

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
function layerBounds(frame: HTMLElement, layer: EditableLayer) {
  const attribute = layer.kind === 'text' ? 'data-canvas-text-id' : 'data-brand-layer-id'
  return frame.querySelector('[' + attribute + '="' + layer.id + '"]')?.getBoundingClientRect()
}

function patchTargetLayer(layer: EditableLayer, patch: Record<string, unknown>): EditableLayer {
  const color = typeof patch.color === 'string' && /^#[a-f0-9]{6}$/iu.test(patch.color) ? patch.color : undefined
  if (layer.kind === 'text') return {
    ...layer, color: color ?? layer.color,
    text: typeof patch.text === 'string' && patch.text.length <= 500 ? patch.text : layer.text,
    fontSize: typeof patch.fontSize === 'number' && patch.fontSize >= 8 && patch.fontSize <= 600 ? patch.fontSize : layer.fontSize,
    weight: typeof patch.weight === 'number' && [400, 500, 600, 700].includes(patch.weight) ? patch.weight : layer.weight,
    align: patch.align === 'left' || patch.align === 'center' || patch.align === 'right' ? patch.align : layer.align,
  }
  if (layer.kind === 'shape' && color) return { ...layer, color }
  if (layer.kind === 'brand' && brandArtworkIds.includes(patch.asset as BrandArtworkId)) return { ...layer, asset: patch.asset as BrandArtworkId }
  return layer
}

function errorLabel(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : fallback
}
function titleFromPrompt(prompt: string, t: T) {
  return prompt.match(/[「“"《]([^」”"》\n]{1,36})[」”"》]/)?.[1] ||
    prompt.split(/[\n。！？；]/u)[0]?.trim().slice(0, 30) || t('生成图片', 'Generated image')
}
function requestGalleryTask(doc: Document): Promise<string | undefined> {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID()
    const done = (result?: string) => {
      clearTimeout(timer)
      doc.removeEventListener('sherlock:image-factory-task-created', receive)
      resolve(result)
    }
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.requestId !== requestId) return
      done(typeof detail.scope === 'string' && validCanvasScope(detail.scope) ? detail.scope : undefined)
    }
    const timer = setTimeout(done, 15_000)
    doc.addEventListener('sherlock:image-factory-task-created', receive)
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-task-action', { detail: { kind: 'new', requestId } }))
  })
}

function startsNewImage(prompt: string) {
  const text = prompt.trim()
  return /^(?:请(?:帮我)?|帮我)?\s*(?:(?:另|从头|从零)(?:生成|制作|设计|创建|做|画)\s*一[张幅]|(?:生成|制作|设计|创建|做|画)\s*一[张幅]\s*(?:全新的?|新的))/u.test(text) ||
    /^(?:please\s+)?(?:generate|create|make|draw|design)\s+a\s+(?:brand[- ]new|new)\s+(?:(?:square|landscape|portrait|\d+:\d+)\s+)?(?:image|poster|illustration|cover|graphic)\b/iu.test(text)
}
function blobData(doc: Document, blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new doc.defaultView!.FileReader()
    reader.onload = () => { const data = String(reader.result).split(',')[1]; if (data) resolve(data); else reject(Error('Invalid image data')) }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
async function referenceData(doc: Document, raster: Raster, region?: { frame: Region; size: Size }) {
  const bounds = region?.frame ?? { x: 0, y: 0, width: raster.width, height: raster.height }
  const scale = Math.min(1, 1536 / Math.max(raster.width, raster.height))
  const { canvas, context } = canvasFor(doc, region?.size ?? {
    width: Math.max(1, Math.round(raster.width * scale)), height: Math.max(1, Math.round(raster.height * scale)),
  })
  context.drawImage(raster.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height)
  let blob = await encode(canvas)
  if (blob.size > 5 * 1024 * 1024) blob = await encode(canvas, 'image/jpeg', .92)
  return { data: await blobData(doc, blob), mediaType: blob.type }
}

function TextControls({ layer, change, t }: { layer: TextLayer; change(patch: Partial<TextLayer>): void; t: T }) {
  const [fontDraft, setFontDraft] = useState<string>()
  return <div className="if-text-format" role="group" aria-label={t('文本样式', 'Text formatting')}>
    <label><span>{t('字体', 'Font')}</span><select aria-label={t('字体', 'Font')} value={layer.family} onChange={e => change({ family: e.target.value as TextLayer['family'] })}>
      {imageFonts.map(font => <option key={font.family} value={font.family}>{t(font.label, font.english)}</option>)}
    </select></label>
    <label><span>{t('字号', 'Size')}</span><input type="number" min="8" max="600" step="1" aria-label={t('字号', 'Font size')}
      value={fontDraft ?? layer.fontSize} onChange={e => {
        setFontDraft(e.currentTarget.value)
        const value = e.currentTarget.valueAsNumber
        if (value >= 8 && value <= 600) change({ fontSize: value })
      }} onBlur={() => setFontDraft(undefined)}/></label>
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

function Editor({ doc, bridge, workspace, close, revealConversation, t }: {
  doc: Document; bridge: Bridge; workspace: CanvasWorkspace; close(): void; revealConversation(): void; t: T
}) {
  const { scope, scene, status, save: saveStatus, canUndo, canRedo } = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  const previousCanvas = useRef({ scope, sceneId: scene?.id })
  const [galleryScope, setGalleryScope] = useState<CanvasScope>()
  const galleryOpen = galleryScope === scope
  const setGalleryOpen = (value: boolean) => setGalleryScope(value ? scope : undefined)
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const [tool, setTool] = useState<CanvasTool>()
  const marking = tool === 'region', placingText = tool === 'text'
  const [rubberband, setRubberband] = useState<Region>()
  const [marquee, setMarquee] = useState<Region>()
  const [commentPos, setCommentPos] = useState<Point>()
  const [drawer, setDrawer] = useState<DrawerTab>()
  const layersOpen = drawer === 'layers'
  const brandOpen = drawer === 'brand'
  const [brandDragging, setBrandDragging] = useState(false)
  const [placedLayerIds, setPlacedLayerIds] = useState<string[]>([])
  const creatingTemplate = useRef(false)
  const toolbar = useRef<HTMLElement>(null)
  const [visibleToolbarGroups, setVisibleToolbarGroups] = useState(Infinity)
  const galleryClose = useRef<HTMLButtonElement>(null)
  const returnFocusToDrawer = useRef(false)
  useLayoutEffect(() => {
    if (galleryOpen) { galleryClose.current?.focus({ preventScroll: true }); return }
    if (!returnFocusToDrawer.current) return
    returnFocusToDrawer.current = false
    focusDrawerToggle(drawer ?? 'layers')
  }, [galleryOpen, drawer])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined
  const setSelectedId = (id?: string) => setSelectedIds(id ? [id] : [])
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [textBox, setTextBox] = useState<{ id: string; height: number }>()
  const [editing, setEditing] = useState<string>()
  const [dropTarget, setDropTarget] = useState<{ id: string; above: boolean }>()
  const [, redrawBusy] = useState(0)
  const uiOperations = useRef(new Set<CanvasScope>())
  const [toast, setToast] = useState('')
  const [tasks, setTasks] = useState<TaskTabs>()
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const file = useRef<HTMLInputElement>(null), scroll = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null)
  const imageFrame = useRef<HTMLDivElement>(null), commentBubble = useRef<HTMLDivElement>(null)
  const layersPanel = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null), workspaceToggle = useRef<HTMLButtonElement>(null)
  const workspaceHover = useRef<WorkspaceViewHover>()
  const rectangleDrag = useRef<{ pointer: number; start: Point }>()
  const marqueeDrag = useRef<{ pointer: number; start: Point; additive: boolean; selection: string[]; moved: boolean }>()
  const suppressMarqueeClick = useRef(false)
  const canvasLayerDrag = useRef<{ layer: EditableLayer; moving?: EditableLayer[]; pointer: number; start: Point; moved: boolean; height: number; handle?: TextResizeHandle }>()
  const layerDrag = useRef<{ id: string; pointer: number; start: Point; dragging: boolean }>()
  const active = useRef(new Map<string, CanvasJob>())
  const selectionDrafts = useRef(new Map<string, SelectionDraft>())
  const cutouts = useRef(new Map<CanvasScope, string>())
  const refreshBusy = () => redrawBusy(value => value + 1)
  const isBusy = (key: CanvasScope) => uiOperations.current.has(key) ||
    [...active.current.values()].some(job => job.scope === key || job.sessionId === key)
  const setScene = (change: (old?: ImageScene) => ImageScene | undefined, persist = true, editKey?: string) => workspace.change(scope, change, persist, editKey)
  const mounted = useRef(true)
  const creating = tasks?.creating !== undefined
  const canvasSelected = tasks?.active !== undefined && !tasks.busy
  const current = galleryOpen || !canvasSelected ? undefined : scene
  const showOpening = !creating && (tasks?.busy || tasks?.active !== undefined &&
    (status === 'loading' || status === 'idle') && !(scope !== null && tasks?.fresh === scope))
  const { zoom, pan, reset: resetViewport, stepZoom, spaceHeld, panning, panPointer, panBy, canZoomIn, canZoomOut } =
    useImageViewport(doc, scroll, imageFrame, Boolean(current) && status === 'ready')
  const selectionDraft = current && selectionDrafts.current.get(current.id)
  const area = selectionDraft?.area
  const commentPending = !!selectionDraft?.phase
  const cutoutPending = cutouts.current.has(scope) || [...active.current.values()].some(job => job.cutout && job.sessionId === scope)
  const busy = creatingTemplate.current || !canvasSelected || status !== 'ready' || isBusy(scope) || commentPending || cutoutPending
  useLayoutEffect(() => {
    const bar = toolbar.current
    if (!bar) return
    const groups = [...bar.querySelectorAll<HTMLElement>(':scope > .if-toolbar-entry')]
    const overflow = bar.querySelector<HTMLElement>(':scope > .if-toolbar-overflow')
    if (!overflow) return
    const measure = () => {
      const win = bar.ownerDocument.defaultView
      if (!win || !bar.clientWidth) return
      const style = win.getComputedStyle(bar)
      const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const gap = parseFloat(style.columnGap) || 0
      const available = bar.clientWidth - horizontalPadding
      const widths = groups.map(group => group.getBoundingClientRect().width + gap)
      const total = widths.reduce((sum, width) => sum + width, 0) - gap
      let count = groups.length
      if (total > available) {
        let remaining = available - overflow.getBoundingClientRect().width
        count = 0
        for (const width of widths) {
          remaining -= width
          if (remaining < 0) break
          count++
        }
      }
      const focused = doc.activeElement
      setVisibleToolbarGroups(count)
      if (groups.slice(count).some(group => group.contains(focused))) {
        win.requestAnimationFrame(() => overflow.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }))
      } else if (count === groups.length && overflow.contains(focused)) {
        win.requestAnimationFrame(() => groups.at(-1)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }))
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    observer.observe(overflow)
    groups.forEach(group => observer.observe(group))
    return () => observer.disconnect()
  }, [Boolean(current), doc])
  const selection = current?.layers.filter(isEditableLayer).filter(
    layer => selectedIds.includes(layerUnitId(layer)) || selectedIds.includes(layer.id)) ?? []
  const selectedGroups = selection.flatMap(layer => layer.groupId && selectedIds.includes(layer.groupId) ? [layer.groupId] : [])
  const canGroup = new Set(selection.map(layerUnitId)).size >= 2
  const canUngroup = selectedGroups.length > 0
  const raster = current?.layers.find((layer): layer is Extract<CanvasLayer, { kind: 'image' }> => layer.kind === 'image')
  const selectedText = current?.layers.find((layer): layer is TextLayer => layer.kind === 'text' && layer.id === selectedId)
  const fit = current ? Math.max(.01, Math.min(Math.max(1, bounds.width) / current.width, Math.max(1, bounds.height) / current.height, 1)) : 1
  const displayScale = fit * zoom
  const resizableText = !tool && !area && !busy && !editing ? selectedText : undefined
  const resizableOverlay = !tool && !area && !busy && !editing ? current?.layers.find(
    (layer): layer is BrandOverlay => (layer.kind === 'brand' || layer.kind === 'shape') && layer.id === selectedId) : undefined
  const [selectionBox, setSelectionBox] = useState<Region>()
  useLayoutEffect(() => {
    const frame = imageFrame.current
    if (!frame || !current || selection.length < 2) return
    const base = frame.getBoundingClientRect()
    const boxes = selection.map(layer => layerBounds(frame, layer)).filter((box): box is DOMRect => !!box)
    if (!boxes.length) return
    const left = Math.min(...boxes.map(box => box.left)) - base.left
    const top = Math.min(...boxes.map(box => box.top)) - base.top
    const width = Math.max(...boxes.map(box => box.right)) - base.left - left
    const height = Math.max(...boxes.map(box => box.bottom)) - base.top - top
    setSelectionBox(previous => previous?.x === left && previous.y === top && previous.width === width && previous.height === height
      ? previous : { x: left, y: top, width, height })
  })
  const textBoxHeight = resizableText && textBox?.id === resizableText.id ? textBox.height : 0
  const inside = current && resizableText && textBoxHeight > 0 ? {
    x: Math.max(0, Math.min(1 - resizableText.width, resizableText.x)),
    y: textTopInsideCanvas(resizableText.y, textBoxHeight / displayScale, current.height),
  } : undefined
  const textOutside = inside && resizableText && (inside.x !== resizableText.x || inside.y !== resizableText.y)

  useLayoutEffect(() => {
    const showCanvas = () => setGalleryScope(undefined)
    doc.addEventListener('sherlock:image-factory-show-canvas', showCanvas)
    return () => doc.removeEventListener('sherlock:image-factory-show-canvas', showCanvas)
  }, [doc])
  useLayoutEffect(() => {
    const receive = (event: Event) => setTasks((event as CustomEvent<TaskTabs>).detail)
    const fail = (event: Event) => setToast((event as CustomEvent<{ message: string }>).detail.message)
    doc.addEventListener('sherlock:image-factory-task-state', receive)
    doc.addEventListener('sherlock:image-factory-task-error', fail)
    doc.dispatchEvent(new Event('sherlock:image-factory-request-task-state'))
    return () => {
      doc.removeEventListener('sherlock:image-factory-task-state', receive)
      doc.removeEventListener('sherlock:image-factory-task-error', fail)
    }
  }, [doc])
  useEffect(() => {
    if (scene) doc.dispatchEvent(new CustomEvent('sherlock:image-factory-task-title', { detail: { scope, title: scene.title } }))
  }, [doc, scope, scene?.title])
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
    const previous = previousCanvas.current
    previousCanvas.current = { scope, sceneId: scene?.id }
    if (scope === previous.scope) return
    setDrawer(drawer => drawer === 'layers' ? drawer : undefined)
    setExpandedGroups([])
    setBrandDragging(false)
    if (previous.scope === null && scene?.id && scene.id === previous.sceneId) {
      setGalleryScope(value => value === null ? scope : value)
      return
    }
    setGalleryScope(undefined)
    setSelectedId(undefined); setEditing(undefined); resetViewport()
    resetSelectionGesture()
    canvasLayerDrag.current = undefined; layerDrag.current = undefined; setDropTarget(undefined)
  }, [scope, scene?.id, resetViewport])
  useLayoutEffect(() => {
    if (!scroll.current) return
    const observer = new ResizeObserver(([entry]) => { if (entry) setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }) })
    observer.observe(scroll.current)
    return () => observer.disconnect()
  }, [Boolean(current)])
  useLayoutEffect(() => {
    if (!resizableText) return
    const { id } = resizableText
    const element = imageFrame.current?.querySelector<HTMLElement>('[data-canvas-text-id="' + id + '"]')
    const measure = () => {
      const height = element?.getBoundingClientRect().height || resizableText.fontSize * 1.2 * displayScale
      setTextBox(previous => previous?.id === id && previous.height === height ? previous : { id, height })
    }
    measure()
    if (!element) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [resizableText, displayScale])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])
  useLayoutEffect(() => {
    if (!area || !current || commentPending) return
    const outer = stage.current, frame = imageFrame.current, scroller = scroll.current
    if (!outer || !frame || !scroller) return
    const locate = () => {
      const view = outer.getBoundingClientRect(), image = frame.getBoundingClientRect()
      const left = image.left - view.left + area.x / current.width * image.width
      const top = image.top - view.top + area.y / current.height * image.height
      const right = left + area.width / current.width * image.width, bottom = top + area.height / current.height * image.height
      const popWidth = commentBubble.current?.offsetWidth ?? Math.min(320, view.width - 20)
      const popHeight = commentBubble.current?.offsetHeight ?? 178
      const x = right + popWidth + 14 <= view.width ? right + 10 : left - popWidth - 10 >= 10 ? left - popWidth - 10 : left
      const y = x === left ? (bottom + popHeight + 44 <= view.height ? bottom + 10 : top - popHeight - 10) : top
      setCommentPos({ x: Math.max(10, Math.min(view.width - popWidth - 10, x)), y: Math.max(10, Math.min(view.height - popHeight - 44, y)) })
    }
    locate()
    const observer = new ResizeObserver(locate); observer.observe(outer)
    if (commentBubble.current) observer.observe(commentBubble.current)
    scroller.addEventListener('scroll', locate, { passive: true })
    return () => { observer.disconnect(); scroller.removeEventListener('scroll', locate) }
  }, [area, current?.id, current?.width, current?.height, commentPending, displayScale, pan, scope])

  const focusComment = !!area && !!commentPos && !commentPending && !selectionDraft?.error
  useLayoutEffect(() => {
    if (focusComment) commentBubble.current?.querySelector('textarea')?.focus({ preventScroll: true })
  }, [area, focusComment])

  useLayoutEffect(() => {
    const abort = () => {
      if (!rectangleDrag.current) return
      rectangleDrag.current = undefined
      setRubberband(undefined)
    }
    if (!marking || !current || busy) { abort(); return }
    const update = (event: globalThis.PointerEvent, released: boolean) => {
      const drag = rectangleDrag.current, frame = imageFrame.current
      if (drag?.pointer !== event.pointerId || !frame) return
      const point = canvasPoint(event.clientX, event.clientY, frame.getBoundingClientRect(), current)
      const selection = between(drag.start, point)
      if (!released) { if (event.buttons & 1) setRubberband(selection); return }
      if (event.buttons & 1) return
      abort()
      if (selection.width < 2 || selection.height < 2) return
      setTool(undefined)
      setSelectionDraft(current.id, { area: selection, text: '' })
    }
    const move = (event: globalThis.PointerEvent) => update(event, false)
    const end = (event: globalThis.PointerEvent) => update(event, true)
    const cancel = (event: globalThis.PointerEvent) => { if (rectangleDrag.current?.pointer === event.pointerId) abort() }
    const surfaceChanged = () => { if (doc.body.dataset.workspaceSurface !== 'image-factory') abort() }
    // Pointer capture can be lost before Chromium dispatches pointerup to a neighboring element.
    doc.addEventListener('pointermove', move, true)
    doc.addEventListener('pointerup', end, true)
    doc.addEventListener('pointercancel', cancel, true)
    doc.addEventListener('sherlock:workspace-surface-change', surfaceChanged)
    doc.defaultView?.addEventListener('blur', abort)
    return () => {
      doc.removeEventListener('pointermove', move, true)
      doc.removeEventListener('pointerup', end, true)
      doc.removeEventListener('pointercancel', cancel, true)
      doc.removeEventListener('sherlock:workspace-surface-change', surfaceChanged)
      doc.defaultView?.removeEventListener('blur', abort)
    }
  }, [doc, marking, current, busy])

  useLayoutEffect(() => {
    if (!current || busy) { cancelMarquee(); return }
    const update = (event: globalThis.PointerEvent, released: boolean) => {
      const drag = marqueeDrag.current, viewport = scroll.current, frame = imageFrame.current
      if (!drag || drag.pointer !== event.pointerId || !viewport || !frame) return
      if (released === Boolean(event.buttons & 1)) return
      const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) {
        if (released) {
          cancelMarquee()
          if (!drag.additive) setSelectedIds([])
          doc.dispatchEvent(new CustomEvent('sherlock:image-factory-reference-clear'))
        }
        return
      }
      if (!drag.moved && !released) viewport.setPointerCapture(event.pointerId)
      drag.moved = true
      event.preventDefault()
      const bounds = viewport.getBoundingClientRect()
      const end = { x: Math.max(bounds.left, Math.min(bounds.right, event.clientX)),
        y: Math.max(bounds.top, Math.min(bounds.bottom, event.clientY)) }
      const box = between(drag.start, end)
      if (!released) {
        setMarquee({ ...box, x: box.x - bounds.left + viewport.scrollLeft, y: box.y - bounds.top + viewport.scrollTop })
        return
      }
      suppressMarqueeClick.current = true
      cancelMarquee()
      if (box.width < 2 || box.height < 2) return
      const ids = new Set(drag.additive ? drag.selection : [])
      for (const layer of current.layers) {
        if (!isEditableLayer(layer)) continue
        const rect = layerBounds(frame, layer)
        // The outline must cover the element. A narrow drag over a full-width
        // layout block can still select the text and logo above it.
        if (rect && rect.width > 0 && rect.height > 0 &&
            rect.left >= box.x - 1 && rect.top >= box.y - 1 &&
            rect.right <= box.x + box.width + 1 && rect.bottom <= box.y + box.height + 1) ids.add(layerUnitId(layer))
      }
      setSelectedIds([...ids])
      frame.focus({ preventScroll: true })
      doc.dispatchEvent(new CustomEvent('sherlock:image-factory-reference-clear'))
    }
    const move = (event: globalThis.PointerEvent) => update(event, false)
    const end = (event: globalThis.PointerEvent) => update(event, true)
    const cancel = (event: globalThis.PointerEvent) => { if (marqueeDrag.current?.pointer === event.pointerId) cancelMarquee() }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !marqueeDrag.current) return
      event.preventDefault()
      event.stopPropagation()
      cancelMarquee()
    }
    const surfaceChanged = () => { if (doc.body.dataset.workspaceSurface !== 'image-factory') cancelMarquee() }
    doc.addEventListener('pointermove', move, true)
    doc.addEventListener('pointerup', end, true)
    doc.addEventListener('pointercancel', cancel, true)
    doc.addEventListener('keydown', escape, true)
    doc.addEventListener('sherlock:workspace-surface-change', surfaceChanged)
    doc.defaultView?.addEventListener('blur', cancelMarquee)
    return () => {
      doc.removeEventListener('pointermove', move, true)
      doc.removeEventListener('pointerup', end, true)
      doc.removeEventListener('pointercancel', cancel, true)
      doc.removeEventListener('keydown', escape, true)
      doc.removeEventListener('sherlock:workspace-surface-change', surfaceChanged)
      doc.defaultView?.removeEventListener('blur', cancelMarquee)
    }
  }, [doc, current, busy])

  function cancelMarquee() {
    if (!marqueeDrag.current) return
    marqueeDrag.current = undefined
    setMarquee(undefined)
  }
  function startMarquee(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    suppressMarqueeClick.current = false
    if (!current || busy || area || editing || tool || event.pointerType === 'touch') return
    const target = event.target as Element
    if (target !== event.currentTarget && target !== imageFrame.current && !target.classList.contains('if-image-layer')) return
    marqueeDrag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY },
      additive: event.shiftKey, selection: selectedIds.filter(id => id !== raster?.id), moved: false }
  }

  function setSelectionDraft(id: string, draft?: SelectionDraft) {
    if (draft) selectionDrafts.current.set(id, draft)
    else if (!selectionDrafts.current.delete(id)) return
    if (mounted.current) refreshBusy()
  }
  function resetSelectionGesture() {
    cancelMarquee()
    rectangleDrag.current = undefined; setTool(undefined); setRubberband(undefined)
    setCommentPos(undefined)
  }
  function clearSelection() {
    if (current && selectionDrafts.current.get(current.id)?.phase) return
    if (current) setSelectionDraft(current.id)
    resetSelectionGesture()
  }
  function patchLayer(id: string, patch: Partial<TextLayer>, persist = true) {
    setScene(old => old && {
      ...old, layers: old.layers.map(layer => layer.id === id && layer.kind === 'text' ? { ...layer, ...patch } : layer),
    }, persist, editing === id ? id : undefined)
  }
  function patchOverlay(id: string, patch: Partial<Pick<BrandOverlay, 'x' | 'y' | 'width' | 'height'>> & { color?: string }, persist = true) {
    setScene(old => old && {
      ...old, layers: old.layers.map(layer => layer.id === id && (layer.kind === 'shape' || layer.kind === 'brand') ? { ...layer, ...patch } : layer),
    }, persist)
  }
  function overlayName(layer: BrandOverlay) {
    return layer.kind === 'brand' ? t(...brandArtwork[layer.asset].label) : t('版式色块', 'Layout block')
  }
  function focusDrawerToggle(tab?: DrawerTab) {
    if (!tab) return
    const visibleToggle = toolbar.current?.querySelector<HTMLButtonElement>('.if-toolbar-entry:not([data-overflow]) [data-drawer-tab="' + tab + '"]')
    const trigger = visibleToggle ?? toolbar.current?.querySelector<HTMLButtonElement>('.if-toolbar-more:not(:disabled)') ??
      header.current?.querySelector<HTMLButtonElement>('.if-more')
    trigger?.focus({ preventScroll: true })
  }
  function closeDrawer() {
    const tab = drawer
    setDrawer(undefined)
    setBrandDragging(false)
    focusDrawerToggle(tab)
  }
  function chooseDrawer(tab: DrawerTab) {
    if (drawer === tab) closeDrawer()
    else {
      setDrawer(tab)
      setBrandDragging(false)
    }
  }
  function chooseSelection(id: string, toggle: boolean) {
    if (!toggle) { setSelectedId(id); return }
    setSelectedIds(previous => {
      const editable = previous.filter(item => item !== raster?.id)
      if (editable.includes(id)) return editable.filter(item => item !== id)
      const members = current?.layers.filter(layer => layerUnitId(layer) === id)
      return [...editable.filter(item => !members?.some(layer => layer.id === item)), id]
    })
  }
  function changeGroup(ungroup: boolean) {
    if (!current || busy || (ungroup ? !canUngroup : !canGroup)) return
    releaseText()
    clearSelection()
    if (ungroup) {
      const groups = [...new Set(selectedGroups)]
      setScene(old => old && { ...old, layers: ungroupLayers(old.layers, groups) })
      setSelectedIds(selection.map(layer => layer.id))
      return
    }
    const id = crypto.randomUUID()
    setScene(old => old && { ...old, layers: groupLayers(old.layers, selection.map(layerUnitId), id) })
    setSelectedId(id)
    setExpandedGroups(previous => [...previous, id])
  }
  function changeHistory(redo: boolean) {
    if (!current || busy) return
    if (editing) imageFrame.current?.focus({ preventScroll: true })
    releaseText()
    clearSelection()
    canvasLayerDrag.current = undefined
    if (redo ? workspace.redo(scope) : workspace.undo(scope)) setSelectedId()
  }
  function historyShortcut(event: KeyboardEvent) {
    if (!current || busy || event.defaultPrevented || event.isComposing || event.altKey ||
        !(event.metaKey || event.ctrlKey) || event.metaKey && event.ctrlKey) return
    const target = event.target as Element | null
    const root = toolbar.current?.closest('.if-work')
    if (!target || (target !== doc.body && !root?.contains(target)) ||
        target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])') ||
        doc.body.dataset.workspaceSurface !== 'image-factory') return
    const key = event.key.toLowerCase()
    if (!['z', 'y', 'g'].includes(key)) return
    if (key === 'g' && !(event.shiftKey ? canUngroup : canGroup)) return
    event.preventDefault()
    event.stopPropagation()
    if (key === 'g') changeGroup(event.shiftKey)
    else changeHistory(key === 'y' || event.shiftKey)
  }
  useEffect(() => {
    doc.addEventListener('keydown', historyShortcut, true)
    return () => doc.removeEventListener('keydown', historyShortcut, true)
  })
  function insertBrandAsset(asset: BrandAsset, point?: Point) {
    if (!current || busy) return
    if (current.layers.length + asset.parts.length > maximumCanvasLayers) {
      setToast(t('画布图层已达到上限。', 'The canvas has reached the layer limit.'))
      return
    }
    releaseText()
    clearSelection()
    const layers = placeBrandAsset(asset, current, point ?? { x: current.width / 2, y: current.height / 2 }, label => t(...label))
    if (setScene(old => old && { ...old, layers: [...old.layers, ...layers] })) {
      setSelectedId(layers.find(layer => layer.kind === 'text')?.id ?? layers.at(-1)?.id)
      setPlacedLayerIds(layers.map(layer => layer.id))
    }
  }
  function brandDrop(event: DragEvent<HTMLDivElement>, dropped: boolean) {
    if (!event.dataTransfer.types.includes(brandDragType)) return
    event.stopPropagation()
    event.preventDefault()
    if (!dropped) {
      event.dataTransfer.dropEffect = brandOpen && !busy ? 'copy' : 'none'
      return
    }
    setBrandDragging(false)
    if (!brandOpen || !current || busy) return
    const asset = findBrandAsset(event.dataTransfer.getData(brandDragType))
    if (asset) insertBrandAsset(asset, canvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), current))
  }
  function releaseText(id = editing) {
    if (!id) return
    setEditing(undefined)
    setScene(old => {
      if (!old?.layers.some(layer => layer.id === id && layer.kind === 'text' && !layer.text.trim())) return old
      return { ...old, layers: removeLayerUnits(old.layers, [id]) }
    }, true, id)
    workspace.finishEdit(scope)
  }
  function activateTool(next: CanvasTool) {
    releaseText()
    setSelectedId(undefined)
    clearSelection()
    if (tool === next || next === 'region' && area) return
    setTool(next)
    imageFrame.current?.focus({ preventScroll: true })
  }
  function appendText(point: Point) {
    if (!current || busy) return
    setTool(undefined)
    if (current.layers.length >= maximumCanvasLayers) { setToast(t('画布图层已达到上限。', 'The canvas has reached the layer limit.')); return }
    const fontSize = Math.max(8, Math.min(96, Math.round(current.width / 13)))
    const x = Math.min(point.x, Math.max(0, current.width - fontSize)) / current.width
    const y = textTopInsideCanvas(point.y / current.height, Math.ceil(fontSize * 1.2), current.height)
    const id = crypto.randomUUID()
    const layer: TextLayer = { id, kind: 'text', x, y, width: Math.min(.72, 1 - x), text: '', fontSize,
      color: '#ffffff', family: 'system-ui', weight: 600, align: 'left' }
    setScene(old => old && { ...old, layers: [...old.layers, layer] }, false)
    setSelectedId(id); setEditing(id)
  }
  function canvasLayerName(layer: CanvasLayer) {
    return layer.kind === 'image' ? t('图片', 'Image') :
      layer.kind === 'text' ? layer.text.trim() || t('文本', 'Text') : overlayName(layer)
  }
  function referenceLayer(layer: CanvasLayer) {
    if (!current || busy) return
    const label = canvasLayerName(layer).replace(/[\p{Cc}]/gu, ' ').trim().slice(0, 64).trim()
    if (!label) return
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-reference-layer', {
      detail: { scope, sceneId: current.id, layerId: layer.id, label },
    }))
  }
  function selectLayer(layer: CanvasLayer, toggle = false, id = layerUnitId(layer), group = false) {
    releaseText()
    clearSelection()
    chooseSelection(id, toggle && isEditableLayer(layer))
    if (!toggle && !group) referenceLayer(layer)
    if (layer.kind === 'image' || toggle) return
    const selector = layer.kind === 'text' ? 'data-canvas-text-id' : 'data-brand-layer-id'
    const box = imageFrame.current?.querySelector('[' + selector + '="' + layer.id + '"]')?.getBoundingClientRect()
    const viewport = scroll.current?.getBoundingClientRect()
    if (!box || !viewport?.width || !viewport.height) return

    // Leave enough of a selected off-screen text layer exposed to grab it again.
    const panel = layersPanel.current?.getBoundingClientRect()
    const overlapsPanel = panel && box.bottom > panel.top && box.top < panel.bottom && box.left < panel.right
    const left = overlapsPanel ? Math.min(panel.right, viewport.left + viewport.width * .65) : viewport.left
    const visibleWidth = Math.min(box.right, viewport.right) - Math.max(box.left, left)
    const visibleHeight = Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top)
    const dx = visibleWidth < Math.min(24, box.width) ? (left + viewport.right - box.left - box.right) / 2 : 0
    const dy = visibleHeight < Math.min(16, box.height) ? (viewport.top + viewport.bottom - box.top - box.bottom) / 2 : 0
    if (dx || dy) panBy(dx, dy)
  }
  function layerMove(id: string, target: string, above: boolean) {
    setScene(old => old && { ...old, layers: moveLayer(old.layers, id, target, above) })
  }
  function layerPointer(event: PointerEvent<HTMLElement>, phase: 'start' | 'move' | 'end' | 'cancel') {
    if (phase === 'start') {
      if (!event.isPrimary || event.button !== 0) return
      layerDrag.current = undefined
      setDropTarget(undefined)
      const handle = (event.target as Element).closest<HTMLButtonElement>('.if-layer-name')
      const id = handle?.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
      if (!handle || !id || busy) return
      layerDrag.current = { id, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false }
      handle.setPointerCapture(event.pointerId)
      return
    }
    const drag = layerDrag.current
    if (!drag || drag.pointer !== event.pointerId) return
    if (phase === 'cancel') { layerDrag.current = undefined; setDropTarget(undefined); return }
    if (phase === 'move' && !(event.buttons & 1)) return
    if (!drag.dragging && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) >= 4) {
      drag.dragging = true
      doc.getSelection()?.removeAllRanges()
    }
    if (!drag.dragging) { if (phase === 'end') layerDrag.current = undefined; return }
    const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-id]')
    const bounds = target?.getBoundingClientRect()
    const targetId = target?.dataset.layerId
    const destination = bounds && targetId && targetId !== drag.id && event.currentTarget.contains(target ?? null)
      ? { id: targetId, above: event.clientY < bounds.top + bounds.height / 2 } : undefined
    if (phase === 'move') setDropTarget(destination)
    else {
      if (!busy && destination) layerMove(drag.id, destination.id, destination.above)
      layerDrag.current = undefined
      setDropTarget(undefined)
    }
  }
  function deleteLayers(ids: string[]) {
    if (busy) return
    releaseText()
    clearSelection()
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-reference-clear'))
    setSelectedIds(previous => previous.filter(id => !ids.includes(id)))
    setScene(old => old && { ...old, layers: removeLayerUnits(old.layers, ids) })
  }
  function canvasLayerPointer(event: PointerEvent<HTMLElement>, phase: 'start' | 'move' | 'end' | 'cancel', layer?: TextLayer | BrandOverlay, handle?: TextResizeHandle) {
    if (!current) return
    if (phase === 'start') {
      if (!layer || !event.isPrimary || event.button !== 0 || tool || area || editing || busy) return
      const unit = layerUnitId(layer)
      if (event.shiftKey && !handle) {
        chooseSelection(unit, true)
        return
      }
      const directChild = selectedId === layer.id
      const selected = selection.some(item => item.id === layer.id)
      let moving: EditableLayer[] | undefined
      if (!handle && !directChild) {
        moving = selected ? selection : current.layers.filter(isEditableLayer).filter(item => layerUnitId(item) === unit)
      }
      if (!selected || handle) setSelectedId(handle ? layer.id : unit)
      event.currentTarget.setPointerCapture(event.pointerId)
      const pixels = layer.kind !== 'text' ? layer.height * current.height * displayScale :
        handle ? textBoxHeight : event.currentTarget.getBoundingClientRect().height
      const height = Math.max(1, Math.ceil(pixels / displayScale))
      canvasLayerDrag.current = { layer, moving, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, moved: false, height, handle }
      return
    }
    const drag = canvasLayerDrag.current
    if (!drag || drag.pointer !== event.pointerId) return
    if (phase === 'cancel') {
      canvasLayerDrag.current = undefined
      if (drag.moved) workspace.commit(scope)
      return
    }
    const released = phase === 'end'
    if (released) canvasLayerDrag.current = undefined
    else if (!(event.buttons & 1)) return
    const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y
    if (!drag.moved && Math.hypot(dx, dy) < 3) {
      if (released && !drag.handle) referenceLayer(drag.layer)
      return
    }
    drag.moved = true
    if (drag.moving && drag.moving.length > 1) {
      moveSelection(drag.moving, dx / (current.width * displayScale), dy / (current.height * displayScale), released)
      return
    }
    if (drag.layer.kind !== 'text') {
      const patch = drag.handle ? resizeBrandOverlay(drag.layer, current, drag.handle, dx / displayScale, dy / displayScale) :
        moveBrandOverlay(drag.layer, current, dx / displayScale, dy / displayScale)
      patchOverlay(drag.layer.id, patch, released)
      return
    }
    const patch = drag.handle ? resizeTextLayer(drag.layer, current, drag.height, drag.handle, dx / displayScale, dy / displayScale) : {
      x: drag.layer.x + dx / (current.width * displayScale),
      y: drag.layer.y + dy / (current.height * displayScale),
    }
    patchLayer(drag.layer.id, patch, released)
  }
  function moveSelection(layers: EditableLayer[], dx: number, dy: number, persist = true) {
    const moved = new Map(translateLayers(layers, dx, dy).map(layer => [layer.id, layer]))
    setScene(old => old && { ...old, layers: old.layers.map(layer => moved.get(layer.id) ?? layer) }, persist)
  }
  function startCanvasTool(event: PointerEvent<HTMLDivElement>) {
    if ((!marking && !placingText) || !current || busy || !event.isPrimary || event.button !== 0) return
    const start = canvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), current)
    if (placingText) {
      event.preventDefault()
      event.stopPropagation()
      appendText(start)
      return
    }
    if (rectangleDrag.current) return
    rectangleDrag.current = { pointer: event.pointerId, start }
    event.currentTarget.setPointerCapture(event.pointerId)
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
      const stored = workspace.change(scope, old => ({ id, width: layer.raster.width, height: layer.raster.height,
        title: image.name.replace(/\.[^.]+$/, '').trim().slice(0, 255) || t('导入图片', 'Imported image'), layers: [layer],
        ...(old?.aiWatermark && { aiWatermark: old.aiWatermark }) }))
      if (!stored) URL.revokeObjectURL(layer.raster.url)
      if (stored && workspace.getSnapshot().scope === scope) {
        clearSelection(); setSelectedId(undefined); setEditing(undefined); setGalleryOpen(false); resetViewport()
      }
    } catch (error) { if (mounted.current) setToast(errorLabel(error, t('图片无法读取。', 'Image could not be read.'))) }
    finally { uiOperations.current.delete(scope); release(); if (mounted.current) refreshBusy() }
  }
  async function renderImage(scene: ImageScene, opaque = false) {
    const { canvas, context } = canvasFor(doc, scene)
    if (opaque) { context.fillStyle = '#fff'; context.fillRect(0, 0, scene.width, scene.height) }
    await drawLayers(context, scene)
    if (scene.aiWatermark) drawAiWatermark(context, scene)
    return new Uint8Array(await (await encode(canvas)).arrayBuffer())
  }

  async function exportImage(format: 'png' | 'jpg') {
    if (!current || busy || uiOperations.current.has(scope)) return
    uiOperations.current.add(scope); refreshBusy()
    try {
      const data = await renderImage(current, format === 'jpg')
      const result = await bridge.save({ action: 'download', data, format, name: current.title })
      if (!result.cancelled && mounted.current) setToast(t('图片已导出。', 'Image exported.'))
    } catch (error) { if (mounted.current) setToast(errorLabel(error, t('图片导出失败。', 'Image export failed.'))) }
    finally { uiOperations.current.delete(scope); if (mounted.current) refreshBusy() }
  }

  async function saveToKnowledge() {
    if (!current || busy || uiOperations.current.has(scope)) return
    const release = workspace.retain(scope)
    uiOperations.current.add(scope); refreshBusy()
    try {
      const epoch = await workspace.flush(scope, current)
      const data = await renderImage(current)
      if (!mounted.current) return
      await bridge.saveProject({ scope, sceneId: current.id, epoch, data })
      if (mounted.current) setToast(t('已保存至知识库 · 我的图像', 'Saved to Knowledge · My Images'))
    } catch (error) { if (mounted.current) setToast(errorLabel(error, t('图像未能保存至知识库。', 'Could not save the image to Knowledge.'))) }
    finally { uiOperations.current.delete(scope); release(); if (mounted.current) refreshBusy() }
  }

  function finishCutout(id: string, error?: string) {
    for (const [owner, request] of cutouts.current) {
      if (request !== id) continue
      cutouts.current.delete(owner)
      if (mounted.current) {
        refreshBusy()
        if (error && workspace.getSnapshot().scope === owner) setToast(error)
      }
      break
    }
  }
  function removeBackground() {
    if (!raster || busy || cutouts.current.has(scope)) return
    releaseText()
    clearSelection()
    const id = crypto.randomUUID()
    cutouts.current.set(scope, id)
    refreshBusy()
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    const request = new CustomEvent('sherlock:image-factory-cutout', {
      cancelable: true, detail: { id, prompt: t('去除当前图片的背景，保留主体。', 'Remove the background from the current image and keep the subject.') }
    })
    if (doc.dispatchEvent(request)) finishCutout(id, t('对话服务尚未就绪，请重试。', 'Chat is not ready. Try again.'))
  }
  useLayoutEffect(() => {
    const emit = (name: string, data: object) => doc.dispatchEvent(new CustomEvent('sherlock:image-factory-' + name, { detail: data }))
    const release = (job: CanvasJob) => {
      if (!active.current.delete(job.id)) return
      job.release(); if (mounted.current) refreshBusy()
    }
    const prepare = async (event: Event) => {
      const { id, sessionId, scope: requestedScope, prompt, uploaded, region, cutout, layers } = (event as CustomEvent).detail ?? {}
      if (doc.body.dataset.workspaceSurface !== 'image-factory' || typeof id !== 'string' ||
          typeof sessionId !== 'string' || !validCanvasScope(sessionId) || typeof prompt !== 'string') return
      const reply = (data: object) => emit('prepared', { id, ...data })
      if ((requestedScope !== null && requestedScope !== sessionId) || requestedScope !== workspace.getSnapshot().scope)
        return reply({ error: t('当前工作区已变化。', 'The active workspace changed.') })
      const pendingCutout = cutouts.current.get(requestedScope)
      if (isBusy(requestedScope) || pendingCutout && (!cutout || pendingCutout !== id))
        return reply({ error: t('请等待当前图片任务处理完成。', 'Wait for the current image action to finish.') })
      uiOperations.current.add(requestedScope); refreshBusy()
      const hold = workspace.retain(requestedScope)
      let job: CanvasJob | undefined
      try {
        const ready = await workspace.ready(requestedScope)
        if (!mounted.current || doc.body.dataset.workspaceSurface !== 'image-factory' || workspace.getSnapshot().scope !== requestedScope)
          throw Error(t('当前工作区已变化。', 'The active workspace changed.'))
        const newImage = !layers && !region && !cutout && (galleryScope === requestedScope || startsNewImage(prompt))
        const base = newImage ? undefined : ready
        const targets: CanvasJob['targets'] = layers?.map((reference: { sceneId: string; layerId: string; key: number; label: string }) => {
          const layer = base?.id === reference.sceneId ? base.layers.find(item => item.id === reference.layerId) : undefined
          if (!layer) throw Error(t('引用的图层已变化，请重新选择。', 'A referenced layer changed. Select it again.'))
          return { key: reference.key, layer }
        })
        const image = (targets ? targets.map(item => item.layer) : base?.layers)?.find(item => item.kind === 'image')
        const draft = base && selectionDrafts.current.get(base.id)
        const selection = region && draft?.requestId === id && draft.phase === 'sending' ? draft.area : undefined
        if (region && (!selection || !image)) throw Error(t('选区已变化，请重新框选。', 'The selection changed. Select the area again.'))
        if (cutout && (pendingCutout !== id || !image || galleryScope === requestedScope))
          throw Error(t('当前图片已变化，请重试。', 'The current image changed. Try again.'))
        const size = (selection || cutout || targets ? undefined : requestedImageSize(prompt)) ?? base ?? ratios['4:5']
        const title = base?.title ?? titleFromPrompt(prompt, t)
        const target = selection ?? size
        const output = providerSize(target)
        const outputSize = providerDimensions[output]
        const edit = selection && image ? {
          area: selection, frame: regionEditFrame(selection, outputSize, image.raster),
          preserveTransparency: preservesRegionTransparency(prompt),
        } : undefined
        job = { id, sessionId, scope: requestedScope, scene: base, edit, targets, cutout: cutout === true, size, title, delivering: false, release: hold }
        active.current.set(id, job)
        let reference
        if (cutout && image) {
          const byteLimit = 7 * 1024 * 1024
          let blob = new Blob([new Uint8Array(image.data)], { type: image.mediaType })
          if (blob.size > byteLimit) {
            const { canvas, context } = canvasFor(doc, image.raster)
            context.drawImage(image.raster.image, 0, 0)
            blob = await encode(canvas, 'image/webp', .95)
          }
          if (blob.size > byteLimit) throw Error(t('图片过大，请缩小后再去背景。', 'The image is too large. Resize it before removing its background.'))
          reference = { data: await blobData(doc, blob), mediaType: blob.type }
        } else reference = image
          ? await referenceData(doc, image.raster, edit && { frame: edit.frame, size: outputSize })
          : undefined
        if (!active.current.has(id) || !mounted.current || doc.body.dataset.workspaceSurface !== 'image-factory' ||
            workspace.getSnapshot().scope !== requestedScope) throw Error(t('当前工作区已变化。', 'The active workspace changed.'))
        const targetLayers = targets?.map(({ key, layer }, index) => {
          const description = layer.kind === 'text' ? JSON.stringify({ text: layer.text, color: layer.color,
            fontSize: layer.fontSize, weight: layer.weight, align: layer.align }) : layer.kind === 'shape' ? layer.color :
            layer.kind === 'brand' ? layer.asset : ''
          return { key, kind: layer.kind, label: layers[index].label, description: description.slice(0, 1800) }
        })
        reply({ operation: targets ? 'layer' : cutout ? 'cutout' : edit ? 'region' : reference || uploaded ? 'edit' : 'generate', size: output,
          width: target.width, height: target.height, title, reference, targetLayers, editBounds: edit && regionEditBounds(edit.area, edit.frame) })
      } catch (error) {
        if (job) release(job); else hold()
        reply({ error: errorLabel(error, t('无法读取画布。', 'Could not read the canvas.')) })
      } finally {
        uiOperations.current.delete(requestedScope)
        if (mounted.current) refreshBusy()
      }
    }
    const failSelection = (job: CanvasJob, error: string) => {
      if (!job.edit || !job.scene || !mounted.current) return
      const draft = selectionDrafts.current.get(job.scene.id)
      if (draft?.requestId === job.id) setSelectionDraft(job.scene.id, { ...draft, phase: undefined, error })
    }
    const settled = (event: Event) => {
      const job = active.current.get((event as CustomEvent).detail?.id)
      if (!job || job.delivering) return
      failSelection(job, t('这次没有收到可应用的图片。', 'No image was received for this edit.'))
      if (job.cutout) finishCutout(job.id)
      release(job)
    }
    const commentResult = (event: Event) => {
      const { id, error } = (event as CustomEvent).detail ?? {}
      if (typeof id !== 'string') return
      for (const [sceneId, draft] of selectionDrafts.current) {
        if (draft.requestId !== id) continue
        if (typeof error === 'string' && error) setSelectionDraft(sceneId, { ...draft, phase: undefined, error })
        else if (draft.phase === 'sending') setSelectionDraft(sceneId, { ...draft, phase: 'processing' })
        break
      }
    }
    const cutoutResult = (event: Event) => {
      const { id, error } = (event as CustomEvent).detail ?? {}
      if (typeof id === 'string' && typeof error === 'string' && error) finishCutout(id, error)
    }
    const deliverLayers = async (event: Event) => {
      const { id, sessionId, edits, url, imageKey, imageError } = (event as CustomEvent).detail ?? {}
      const job = active.current.get(id)
      const blobUrl = typeof url === 'string' && url.startsWith('blob:') ? url : undefined
      if (!job?.targets || job.sessionId !== sessionId || job.delivering) {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        return
      }
      job.delivering = true
      const holdTarget = workspace.retain(job.sessionId)
      const replacements = new Map<CanvasLayer, CanvasLayer>()
      let output: Raster | undefined
      let pendingRaster: Raster | undefined
      let failedImage = imageError === true
      try {
        await workspace.ready(job.sessionId)
        const patches = new Map<number, Record<string, unknown>>(edits.map(({ key, patch }: { key: number; patch: Record<string, unknown> }) => [key, patch]))
        for (const { key, layer } of job.targets) {
          const patch = patches.get(key)
          if (layer.kind !== 'image') {
            if (patch) replacements.set(layer, patchTargetLayer(layer, patch))
            continue
          }
          if (!blobUrl || key !== imageKey) continue
          try {
            const response = await fetch(blobUrl)
            if (!response.ok) throw Error('Image attachment unavailable')
            output = await loadRaster(doc, await response.blob())
            const { canvas, context } = canvasFor(doc, job.size)
            drawFit(context, output, job.size)
            const next = await createImageLayer(doc, await encode(canvas), job.id, layer.id, 'image/png')
            pendingRaster = next.raster
            replacements.set(layer, next)
          } catch { failedImage = true }
        }
        if (!mounted.current || active.current.get(id) !== job) return
        const changed = workspace.change(job.sessionId, live => {
          if (!replacements.size || !live || live.id !== job.scene?.id || job.targets!.some(({ layer }) => !live.layers.includes(layer))) return live
          return { ...live, layers: live.layers.map(layer => replacements.get(layer) ?? layer) }
        })
        if (changed) pendingRaster = undefined
        if (workspace.getSnapshot().scope === job.sessionId) {
          setToast(failedImage ? changed
            ? t('其他图层已更新。图片修改未完成，已保留原图。', 'Other layers updated. The image edit did not complete, so the original was kept.')
            : t('图片修改未完成，已保留原图。', 'The image edit did not complete, so the original was kept.')
            : changed ? t('引用的图层已更新。', 'Referenced layers updated.')
            : t('图层已变化或没有可应用的修改。', 'Layers changed or no applicable edits were returned.'))
        }
      } catch (error) {
        if (mounted.current && workspace.getSnapshot().scope === job.sessionId)
          setToast(errorLabel(error, t('图层未能更新。', 'Could not update the layers.')))
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        if (output) URL.revokeObjectURL(output.url)
        if (pendingRaster) URL.revokeObjectURL(pendingRaster.url)
        holdTarget()
        release(job)
      }
    }
    const deliver = async (event: Event) => {
      const info = (event as CustomEvent).detail
      const job = active.current.get(info?.id)
      const url = typeof info?.url === 'string' && info.url.startsWith('blob:') ? info.url : undefined
      if (!job || info.sessionId !== job.sessionId || !url || job.delivering || job.targets) {
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
        if (job.edit && previous) applyRegion(context, previous.raster, output, job.edit.area, job.edit.frame, job.edit.preserveTransparency)
        else if (job.cutout) context.drawImage(output.image, 0, 0, canvas.width, canvas.height)
        else drawFit(context, output, job.size)
        const png = await encode(canvas)
        const layer = await createImageLayer(doc, png, job.id, previous?.id ?? crypto.randomUUID(), 'image/png')
        newRaster = layer.raster
        if (!mounted.current || active.current.get(job.id) !== job) return
        const others = job.scene?.layers ?? []
        const layers = previous ? others.map(item => item.id === previous.id ? layer : item) : [layer, ...others]
        const nextScene: ImageScene = { id: job.scene?.id ?? job.id, title: job.title, width: layer.raster.width, height: layer.raster.height, layers,
          ...(job.scene?.aiWatermark && { aiWatermark: job.scene.aiWatermark }),
        }
        if (!workspace.change(job.sessionId, () => nextScene)) throw Error(t('图片没能放到画布。', 'Could not place the image on the canvas.'))
        newRaster = undefined
        emit('task-title', { scope: job.sessionId, title: nextScene.title })
        if (job.scene) setSelectionDraft(job.scene.id)
        if (workspace.getSnapshot().scope === job.sessionId) {
          resetSelectionGesture(); setGalleryScope(undefined); if (!job.scene) resetViewport()
        }
      } catch (error) {
        const reason = errorLabel(error, t('图片没能放到画布。', 'Could not place the image on the canvas.'))
        if (job.edit) failSelection(job, reason)
        else if (mounted.current && workspace.getSnapshot().scope === job.sessionId) setToast(reason)
      } finally {
        if (info.revoke) URL.revokeObjectURL(url)
        if (output) URL.revokeObjectURL(output.url)
        if (newRaster) URL.revokeObjectURL(newRaster.url)
        holdTarget()
        if (job.cutout) finishCutout(job.id)
        release(job)
      }
    }
    const action = (event: Event) => {
      if (doc.body.dataset.workspaceSurface === 'image-factory' && (event as CustomEvent).detail?.kind === 'import' && !busy) file.current?.click()
    }
    const publish = () => emit('state', { current: !!current, busy })
    const events = { prepare, settled, deliver, 'deliver-layers': deliverLayers, action, 'comment-result': commentResult, 'cutout-result': cutoutResult, 'request-state': publish }
    for (const [event, callback] of Object.entries(events)) doc.addEventListener('sherlock:image-factory-' + event, callback)
    publish()
    return () => { for (const [event, callback] of Object.entries(events)) doc.removeEventListener('sherlock:image-factory-' + event, callback) }
  }, [doc, t, bridge, workspace, scope, galleryScope, current, busy])
  function sendComment() {
    if (!current || busy) return
    const draft = selectionDrafts.current.get(current.id)
    const value = draft?.text.trim()
    if (!draft || !value || draft.phase) return
    const id = crypto.randomUUID()
    setSelectionDraft(current.id, { ...draft, requestId: id, phase: 'sending', error: undefined })
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    const admission = new CustomEvent('sherlock:image-factory-comment', { cancelable: true, detail: { id, prompt: value } })
    if (doc.dispatchEvent(admission)) {
      setSelectionDraft(current.id, { ...draft, error: t('对话服务尚未就绪，请重试。', 'Chat is not ready. Try again.') })
    }
  }
  function showGallery() {
    releaseText()
    clearSelection()
    setBrandDragging(false)
    setGalleryOpen(true)
  }
  function closeGallery() {
    setGalleryOpen(false)
    returnFocusToDrawer.current = true
  }
  const useGalleryPrompt = useCallback((prompt: string) => {
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-use-prompt', { detail: { prompt }, cancelable: true }))
  }, [doc])
  async function openGalleryTemplate(example: GalleryExample) {
    if (busy || creatingTemplate.current) return
    const inImages = () => mounted.current && doc.body.dataset.workspaceSurface === 'image-factory'
    creatingTemplate.current = true
    refreshBusy()
    let background: Awaited<ReturnType<typeof createImageLayer>> | undefined
    try {
      const source = galleryArtwork(example.id)
      if (!source) throw Error(t('模板底图不可用。', 'The template background is unavailable.'))
      const id = crypto.randomUUID()
      const result = await fetch(source)
      if (!result.ok) throw Error(t('模板底图无法读取。', 'The template background could not be loaded.'))
      background = await createImageLayer(doc, await result.blob(), id, crypto.randomUUID(), 'image/jpeg')
      if (!inImages() || workspace.getSnapshot().scope !== scope) return
      const target = await requestGalleryTask(doc)
      if (!target) throw Error(t('未能打开新的图片任务。', 'Could not open a new image task.'))
      await workspace.ready(target)
      if (!inImages() || workspace.getSnapshot().scope !== target) return
      const { width, height } = background.raster
      const layers: CanvasLayer[] = [background,
        ...galleryTemplateLayers(example, { width, height }, t, () => crypto.randomUUID())]
      if (!workspace.change(target, old => old ?? { id, width, height, title: t(...example.title), layers }))
        throw Error(t('未能将模板放到画布。', 'Could not place the template on the canvas.'))
      background = undefined
      setGalleryOpen(false)
      resetViewport()
      setSelectedId(undefined)
      setEditing(undefined)
      setDrawer('layers')
    } catch (error) {
      if (inImages()) setToast(errorLabel(error, t('模板暂时无法打开，请重试。', 'The template could not be opened. Try again.')))
    } finally {
      if (background) URL.revokeObjectURL(background.raster.url)
      creatingTemplate.current = false
      if (mounted.current) refreshBusy()
    }
  }
  function taskAction(detail: TaskAction) {
    if (detail.kind === 'select' || detail.kind === 'new' || detail.kind === 'close' || detail.kind === 'restore') releaseText()
    doc.dispatchEvent(new CustomEvent('sherlock:image-factory-task-action', { detail }))
  }
  function openWorkspaceView(view: string) {
    const sessionId = findWorkspaceSession(doc)?.dataset.eworkNotesSession
    if (!sessionId) { if (view === 'chat') revealConversation(); return }
    const button = workspaceViewButton(doc, sessionId, view)
    if (!button?.isConnected || button.disabled) {
      setToast(t('此会话视图暂不可用。', 'This conversation view is unavailable.')); return
    }
    revealConversation()
    workspaceViewButton(doc, sessionId, view)?.click()
  }

  const rectangle = rubberband ?? area
  const hasWorkspaceSession = workspaceExpanded && !!findWorkspaceSession(doc)
  const tabsLabel = workspaceExpanded ? t('收起工作区页签', 'Collapse workspace tabs') : t('展开工作区页签', 'Expand workspace tabs')
  const watermark = current?.aiWatermark ? aiWatermarkLayout(current, displayScale) : undefined
  function renderLayerRows(canvas: ImageScene) {
    const units = new Map<string, CanvasLayer[]>()
    for (const layer of [...canvas.layers].reverse()) {
      const id = layerUnitId(layer)
      const members = units.get(id)
      if (members) members.push(layer)
      else units.set(id, [layer])
    }
    const order = [...units.keys()]
    const row = (layer: CanvasLayer, id: string, name: string, child = false, count = 0) => {
      const group = count > 1
      const expanded = expandedGroups.includes(id)
      const active = selectedIds.includes(id)
      return <div key={id} className="if-layer-row" data-layer-id={id} data-child={child}
        data-current={active} data-drop={dropTarget?.id === id ? dropTarget.above ? 'above' : 'below' : undefined}>
        {group && <button type="button" className="if-layer-disclosure" aria-expanded={expanded}
          aria-label={expanded ? t('折叠编组', 'Collapse group') : t('展开编组', 'Expand group')}
          onClick={() => setExpandedGroups(previous => expanded ? previous.filter(item => item !== id) : [...previous, id])}>
          <Icon name="chevron" size={14}/>
        </button>}
        <button type="button" className="if-layer-name" aria-pressed={active} title={name}
          onClick={event => selectLayer(layer, event.shiftKey, event.shiftKey ? layerUnitId(layer) : id, group)}
          onDoubleClick={() => {
            if (!busy && !group && layer.kind === 'text') { setSelectedId(layer.id); setEditing(layer.id) }
          }}
          onKeyDown={event => {
            if (busy || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
            const above = event.key === 'ArrowUp'
            const target = order[order.indexOf(layerUnitId(layer)) + (above ? -1 : 1)]
            if (target) { event.preventDefault(); layerMove(id, target, above) }
          }}>
          {!group && <Icon name="grip" size={13}/>}
          <Icon name={group ? 'group' : layer.kind === 'text' ? 'type' : layer.kind === 'shape' ? 'square' : layer.kind === 'brand' ? 'brand' : 'image'} size={15}/>
          <span>{name}</span>
        </button>
        <Button icon="trash" label={t('删除图层 ', 'Delete layer ') + name} disabled={busy} onClick={() => deleteLayers([id])}/>
      </div>
    }
    const name = (layer: CanvasLayer) => layer.kind === 'image' ? t('图片', 'Image') :
      layer.kind === 'text' ? layer.text.trim() || t('文本', 'Text') : overlayName(layer)
    return [...units].flatMap(([id, members]) => {
      const first = members[0]!
      if (members.length === 1) return [row(first, first.id, name(first))]
      return [
        row(first, id, t('编组', 'Group') + ' · ' + members.length, false, members.length),
        ...(expandedGroups.includes(id) ? members.map(layer => row(layer, layer.id, name(layer), true)) : []),
      ]
    })
  }
  const toolbarGroups: ToolbarGroup[] = [
    { id: 'if-history-buttons', label: t('编辑历史', 'Edit history'), commands: [
      { id: 'undo', icon: 'undo', label: t('上一步', 'Undo'), title: t('上一步 · ⌘Z / Ctrl+Z', 'Undo · ⌘Z / Ctrl+Z'),
        iconOnly: true, shortcut: 'Meta+Z Control+Z', disabled: busy || !canUndo, run: () => changeHistory(false) },
      { id: 'redo', icon: 'redo', label: t('下一步', 'Redo'), title: t('下一步 · ⇧⌘Z / Ctrl+Y', 'Redo · ⇧⌘Z / Ctrl+Y'),
        iconOnly: true, shortcut: 'Meta+Shift+Z Control+Shift+Z Control+Y', disabled: busy || !canRedo, run: () => changeHistory(true) },
    ] },
    { id: 'if-drawer-tabs', label: t('画板侧栏', 'Canvas sidebar'),
      commands: ([['layers', '图层', 'Layers'], ['brand', '品牌资产', 'Brand assets']] as const).map(([id, zh, en]) =>
        ({ id, icon: id, label: t(zh, en), controls: 'image-factory-drawer', checked: drawer === id, run: () => chooseDrawer(id) })) },
    { id: 'text', commands: [{ id: 'text', icon: 'type', label: t('添加文本', 'Add text'),
      checked: placingText, disabled: busy, run: () => activateTool('text') }] },
    { id: 'export', commands: [{ id: 'export', label: t('导出', 'Export'),
      disabled: busy || !current?.layers.length, exporting: exportImage }] },
    { id: 'save-project', commands: [{ id: 'save-project', icon: 'bookmark', label: t('保存至知识库', 'Save to Knowledge'),
      disabled: busy || !current?.layers.length, run: saveToKnowledge }] },
    { id: 'region', commands: [{ id: 'region', icon: 'mark', label: t('框选修改', 'Edit selected area'),
      checked: marking || !!area, disabled: busy || !raster, run: () => activateTool('region') }] },
    { id: 'cutout', commands: [{ id: 'cutout', icon: 'spark', disabled: busy || !raster, run: removeBackground,
      label: cutoutPending ? t('正在去背景…', 'Removing background…') : t('去背景', 'Remove background') }] },
    { id: 'watermark', commands: [{ id: 'watermark', label: t('AI 水印', 'AI watermark'), switch: true,
      checked: Boolean(current?.aiWatermark), disabled: busy,
      run: () => setScene(old => old && { ...old, aiWatermark: old.aiWatermark ? undefined : true }) }] },
  ]
  const overflowActions = current ? toolbarGroups.slice(visibleToolbarGroups).flatMap(group => group.commands) : []
  return <section className="if-work" aria-label={t('图像画布', 'Images canvas')} onKeyDown={event => {
    const target = event.target as Element
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length && !tool && !area && !busy &&
        !event.defaultPrevented && !event.nativeEvent.isComposing &&
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
        !target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])')) {
      event.preventDefault()
      event.stopPropagation()
      deleteLayers(selectedIds)
      return
    }
    if (event.key !== 'Escape' || commentPending) return
    if (galleryOpen && scene) {
      event.preventDefault()
      event.stopPropagation()
      closeGallery()
      return
    }
    if (drawer && (!editing && !tool && !area || target.closest('.if-drawer'))) {
      event.preventDefault()
      event.stopPropagation()
      closeDrawer()
      return
    }
    if (!editing && !tool && !area) return
    event.stopPropagation()
    clearSelection()
    if (editing) imageFrame.current?.focus({ preventScroll: true })
    releaseText()
  }}>
    <header className="if-top eb-tabs workspace-app-topbar" data-crowded={!!tasks && tasks.tabs.length > 6} ref={header} onKeyDown={event => {
      if (event.key !== 'Escape' || !workspaceExpanded) return
      event.preventDefault(); event.stopPropagation(); workspaceHover.current?.setExpanded(false); workspaceToggle.current?.focus()
    }}>
      <button type="button" className="workspace-back-button t8lSSG_toggleButton" aria-label={t('返回工作区', 'Back to workspace')}
        title={t('返回工作区', 'Back to workspace')} onClick={close}><i className="workspace-back-icon" aria-hidden="true"/></button>
      <div className="workspace-app-title"><Icon name="factory" size={18}/><span>{t('图像', 'Images')}</span></div>
      <div className="eb-workspace-controls">
        <button type="button" className="eb-workspace-toggle" ref={workspaceToggle} aria-label={tabsLabel} title={tabsLabel}
          aria-expanded={workspaceExpanded} aria-controls="image-factory-workspace-tabs" onClick={() => workspaceHover.current?.setExpanded(!workspaceExpanded)}><i aria-hidden="true"/></button>
        <nav id="image-factory-workspace-tabs" className="eb-workspace-tabs" aria-label={t('工作区视图', 'Workspace views')} aria-hidden={!workspaceExpanded}>
          {workspaceViews.map(([view, label]) => <button key={view} type="button" tabIndex={workspaceExpanded ? 0 : -1}
            aria-label={t('切换到', 'Switch to ') + t(label, workspaceEnglishLabels[view])}
            disabled={!hasWorkspaceSession && view !== 'chat'} onClick={() => openWorkspaceView(view)}>{t(label, workspaceEnglishLabels[view])}</button>)}
        </nav>
      </div>
      {tasks?.tabs.length ? <ImageTaskTabs doc={doc} header={header} state={tasks} current={scope}
        title={scene?.title} t={t} action={taskAction}/>
        : <span className="if-top-title" title={current?.title}>{current?.title}</span>}
      <CanvasActionsMenu doc={doc} t={t} canExport={!!current?.layers.length && !busy} exporting={exportImage}
        galleryAction={scene && !busy ? galleryOpen ? { label: t('返回画布', 'Return to canvas'), run: closeGallery }
          : { label: t('打开灵感画廊', 'Open inspiration gallery'), run: showGallery } : undefined}/>
    </header>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
      void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''
    }}/>
    {current && <nav ref={toolbar} className="if-toolbar" aria-label={t('画布编辑工具', 'Canvas tools')}>
      {toolbarGroups.map((group, index) => {
        const overflow = index >= visibleToolbarGroups
        return <div key={group.id} className={'if-toolbar-entry ' + (group.label ? group.id : '')}
          role={group.label ? 'group' : undefined} aria-label={group.label} data-overflow={overflow || undefined}
          aria-hidden={overflow || undefined}>
          {group.commands.map(command => command.exporting
            ? <CanvasActionsMenu key={command.id} doc={doc} t={t} canExport={!command.disabled} exporting={command.exporting} exportOnly />
            : <button key={command.id} type="button" data-tool={command.id}
            className={'if-button' + (command.switch ? ' if-watermark-switch' : '')}
            role={command.switch ? 'switch' : undefined} aria-checked={command.switch ? command.checked : undefined}
            aria-label={command.iconOnly ? command.label : undefined} aria-keyshortcuts={command.shortcut}
            aria-pressed={command.switch ? undefined : command.checked} data-current={command.switch ? undefined : command.checked}
            aria-controls={command.controls} data-drawer-tab={command.controls ? command.id : undefined}
            disabled={command.disabled} title={command.title} onClick={command.run}>
            {command.switch ? <i aria-hidden="true"/> : command.icon && <Icon name={command.icon}/>}
            {!command.iconOnly && (command.id === 'cutout' && cutoutPending ? <span role="status">{command.label}</span> : command.label)}
          </button>)}
        </div>
      })}
      <div className="if-toolbar-overflow" data-empty={!overflowActions.length || undefined}>
        <CanvasActionsMenu doc={doc} t={t} toolActions={overflowActions}/>
      </div>
    </nav>}
    <div id="image-factory-task-workspace" className="if-stage" data-drawer-open={!!drawer && !!current} data-brand-dragging={brandDragging} ref={stage}>
      {showOpening ? <div className="if-canvas-message" role="status">{t('正在打开画布…', 'Opening canvas…')}</div>
        : !creating && status === 'error' ? <div className="if-canvas-message" role="alert">
          <span>{t('画布暂时无法读取。', 'The canvas could not be opened.')}</span>
          <Button onClick={() => workspace.select(scope)}>{t('重新打开', 'Try again')}</Button>
        </div> : !current ? <ImageFactoryGallery t={t} busy={busy} onUse={useGalleryPrompt} onTemplate={openGalleryTemplate}
          onClose={galleryOpen && !!scene ? closeGallery : undefined} closeRef={galleryClose}/> : <>
        <div className="if-stage-scroll" data-pan-ready={spaceHeld} data-panning={panning} ref={scroll}
          onPointerDownCapture={event => {
            panPointer(event, 'start')
            if (!event.isPropagationStopped()) startMarquee(event)
          }}
          onClickCapture={event => {
            if (!event.detail || !suppressMarqueeClick.current) return
            suppressMarqueeClick.current = false
            event.preventDefault(); event.stopPropagation()
          }}
          onPointerMoveCapture={event => panPointer(event, 'move')}
          onPointerUpCapture={event => panPointer(event, 'end')}
          onPointerCancelCapture={event => panPointer(event, 'cancel')}
          onPointerMove={event => canvasLayerPointer(event, 'move')}
          onPointerUp={event => canvasLayerPointer(event, 'end')}
          onPointerCancel={event => canvasLayerPointer(event, 'cancel')}
          onLostPointerCapture={event => panPointer(event, 'cancel')} onPointerDown={event => {
          if (marqueeDrag.current) return
          if (event.target === event.currentTarget && placingText && event.button === 0) event.preventDefault()
          if (event.target === event.currentTarget || event.target === imageFrame.current && !tool) {
            releaseText(); setSelectedId(undefined); doc.dispatchEvent(new CustomEvent('sherlock:image-factory-reference-clear')); if (area && !commentPending) clearSelection()
          }
        }}>
          <div ref={imageFrame} className="if-raster" data-selecting={marking} data-placing-text={placingText && !busy} tabIndex={-1}
            style={{ width: Math.max(1, current.width * displayScale), height: Math.max(1, current.height * displayScale),
              transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px)' }}
            onPointerDownCapture={event => { if (event.isPrimary) canvasLayerPointer(event, 'cancel') }}
            onPointerDown={startCanvasTool}
            onDragOver={event => brandDrop(event, false)} onDrop={event => brandDrop(event, true)}
            onKeyDown={event => {
              if (placingText && event.target === event.currentTarget && event.key === 'Enter') {
                event.preventDefault()
                appendText({ x: current.width / 2, y: current.height / 2 })
              }
            }}>
            <div className="if-raster-artwork">
              {current.layers.map(layer => {
                if (layer.kind === 'image') return <img key={layer.id} className="if-image-layer" draggable={false} src={layer.raster.url} alt={current.title}
                  onClick={event => { if (!tool && !area && !busy && !event.shiftKey) selectLayer(layer) }}/>
                if (layer.kind !== 'text') return <div key={layer.id} className="if-brand-layer" data-brand-layer-id={layer.id} data-just-placed={placedLayerIds.includes(layer.id)}
                  data-selected={selectedIds.includes(layer.id) || selectedIds.includes(layerUnitId(layer))} tabIndex={tool || area || busy ? -1 : 0} role="button"
                  aria-label={overlayName(layer)} aria-pressed={selectedIds.includes(layer.id) || selectedIds.includes(layerUnitId(layer))}
                  onClick={event => { if (!tool && !area && !busy && event.detail === 0) selectLayer(layer, event.shiftKey) }}
                  onPointerDown={event => canvasLayerPointer(event, 'start', layer)}
                  onKeyDown={event => {
                    if (tool || area || busy) return
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLayer(layer, event.shiftKey); return }
                    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
                    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                    if (!dx && !dy) return
                    event.preventDefault()
                    const step = event.shiftKey ? 24 : 4
                    const unit = layerUnitId(layer)
                    if (selectedId !== layer.id && unit !== layer.id) {
                      setSelectedId(unit)
                      moveSelection(current.layers.filter(isEditableLayer).filter(item => layerUnitId(item) === unit),
                        dx * step / current.width, dy * step / current.height)
                    } else {
                      setSelectedId(layer.id)
                      patchOverlay(layer.id, moveBrandOverlay(layer, current, dx * step, dy * step))
                    }
                  }}
                  style={{ left: layer.x * 100 + '%', top: layer.y * 100 + '%', width: layer.width * 100 + '%',
                    height: layer.height * 100 + '%', backgroundColor: layer.kind === 'shape' ? layer.color : undefined }}>
                  {layer.kind === 'brand' && <img draggable={false} alt="" src={brandArtwork[layer.asset].src}/>}
                </div>
                const style = { ...textLayerStyle(layer, current), transform: 'scale(' + displayScale + ')',
                  transformOrigin: 'top left', outlineWidth: 1 / displayScale }
                return editing === layer.id ? <textarea key={layer.id} ref={element => {
                  if (!element) return
                  element.style.height = '0px'; element.style.height = element.scrollHeight + 'px'
                }} className="if-text-layer" data-canvas-text-id={layer.id} data-selected="true" aria-label={t('编辑画布文本', 'Edit canvas text')}
                  autoFocus rows={1} spellCheck={false} value={layer.text} maxLength={500}
                  style={style} placeholder={t('输入文本', 'Enter text')} onChange={e => patchLayer(layer.id, { text: e.target.value })}
                  onKeyDown={event => {
                    if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter' || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    imageFrame.current?.focus({ preventScroll: true })
                    releaseText(layer.id)
                  }}
                  onBlur={event => { if (!event.relatedTarget?.closest('.if-text-format')) releaseText(layer.id) }}/>
                  : <div key={layer.id} className="if-text-layer" data-canvas-text-id={layer.id} data-just-placed={placedLayerIds.includes(layer.id)} data-selected={selectedIds.includes(layer.id) || selectedIds.includes(layerUnitId(layer))} style={style}
                    tabIndex={tool || busy ? -1 : 0} role="button" aria-label={layer.text}
                    onClick={event => { if (!tool && !area && !busy && event.detail === 0) selectLayer(layer, event.shiftKey) }}
                    onDoubleClick={() => { if (!tool && !area && !busy) { setSelectedId(layer.id); setEditing(layer.id) } }}
                    onKeyDown={event => { if (!busy && (event.key === 'Enter' || event.key === 'F2')) { setSelectedId(layer.id); setEditing(layer.id) } }}
                    onPointerDown={event => canvasLayerPointer(event, 'start', layer)}>{layer.text}</div>
              })}
              {watermark && <span className="if-watermark" style={{
                right: watermark.inset, bottom: watermark.inset,
                maxWidth: `calc(100% - ${watermark.inset * 2}px)`,
                fontFamily: aiWatermarkFamily, fontSize: watermark.fontSize, lineHeight: watermark.height + 'px',
                color: aiWatermarkColor,
              }}>{aiWatermarkText}</span>}
              {rectangle && <div className="if-region" aria-hidden="true" data-dragging={!!rubberband} data-processing={commentPending} style={{
                left: rectangle.x / current.width * 100 + '%', top: rectangle.y / current.height * 100 + '%',
                width: rectangle.width / current.width * 100 + '%', height: rectangle.height / current.height * 100 + '%',
              }}>{!commentPending && <><i/><i/><i/><i/></>}</div>}
            </div>
            {selection.length > 1 && !tool && !area && !busy && selectionBox && <div className="if-group-bounds"
              aria-hidden="true" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }}/>}
            {resizableOverlay && <div className="if-text-bounds" role="group" aria-label={t('调整品牌图层大小', 'Resize brand layer')}
              style={{ left: resizableOverlay.x * 100 + '%', top: resizableOverlay.y * 100 + '%',
                width: resizableOverlay.width * 100 + '%', height: resizableOverlay.height * 100 + '%' }}>
              {overlayHandles.map(handle => <button key={handle} type="button" className="if-text-handle" data-text-resize-handle={handle}
                aria-label={t(overlayResizeLabels[handle][0], overlayResizeLabels[handle][1])} onPointerDown={event => canvasLayerPointer(event, 'start', resizableOverlay, handle)}
                onKeyDown={event => {
                  const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
                  const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                  if (!dx && !dy) return
                  event.preventDefault()
                  const step = event.shiftKey ? 24 : 4
                  patchOverlay(resizableOverlay.id, resizeBrandOverlay(resizableOverlay, current, handle, dx * step, dy * step))
                }}/>)}
            </div>}
            {resizableText && textBoxHeight > 0 && <div className="if-text-bounds" role="group" aria-label={t('调整文字图层大小', 'Resize text layer')}
              style={{ left: resizableText.x * 100 + '%', top: resizableText.y * 100 + '%', width: resizableText.width * 100 + '%', height: textBoxHeight }}>
              {textResizeHandles.map(handle => <button key={handle} type="button" className="if-text-handle" data-text-resize-handle={handle}
                aria-label={t(...textResizeLabels[handle])} onPointerDown={event => canvasLayerPointer(event, 'start', resizableText, handle)}
                onKeyDown={event => {
                  const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
                  const dy = handle.length === 1 ? 0 : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                  if (!dx && !dy) return
                  event.preventDefault()
                  const step = event.shiftKey ? 24 : 4
                  const patch = resizeTextLayer(resizableText, current, textBoxHeight / displayScale, handle, dx * step, dy * step)
                  patchLayer(resizableText.id, patch)
                }}/>)}
            </div>}
          </div>
          {marquee && <div className="if-marquee" aria-hidden="true"
            style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}/>}
        </div>
        {placingText && !busy && <div className="if-mark-hint" role="status">{t('点击图像放置文本 · Esc 取消', 'Click the image to place text · Esc to cancel')}</div>}
        {selectionDraft && !commentPending && <div ref={commentBubble} className="if-comment"
          style={commentPos ? { left: commentPos.x, top: commentPos.y } : { visibility: 'hidden' }}>
          <form role="dialog" aria-label={t('修改选区', 'Edit selected area')} onSubmit={event => { event.preventDefault(); sendComment() }}>
            <div className="if-float-header"><strong>{t('修改选区', 'Edit selected area')}</strong><Button icon="close" label={t('取消框选', 'Cancel selection')} onClick={clearSelection}/></div>
            <textarea aria-label={t('修改意见', 'Edit instructions')} placeholder={t('描述要怎么修改这个区域…', 'Describe how to edit this area…')}
              ref={element => { if (element && commentPos && !selectionDraft.text && doc.activeElement === doc.body) element.focus({ preventScroll: true }) }}
              value={selectionDraft.text} maxLength={3600}
              onChange={event => setSelectionDraft(current.id, { ...selectionDraft, text: event.target.value })}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendComment() }
              }}/>
            {selectionDraft.error && <p className="if-comment-error" role="alert">{selectionDraft.error}</p>}
            <div className="if-comment-footer"><Button onClick={clearSelection}>{t('删除选区', 'Remove selection')}</Button>
              <Button type="submit" primary disabled={!selectionDraft.text.trim() || busy}>
                {selectionDraft.error ? t('重试', 'Retry') : t('发送', 'Send')}
              </Button>
            </div>
          </form>
        </div>}
        {resizableOverlay?.kind === 'shape' && <div className="if-text-format" role="group" aria-label={t('色块样式', 'Block style')}>
          <label><span>{t('填充色', 'Fill')}</span><input type="color" aria-label={t('色块填充色', 'Block fill color')}
            value={resizableOverlay.color} onChange={event => patchOverlay(resizableOverlay.id, { color: event.target.value })}/></label>
        </div>}
        {selectedText && !tool && !area && !busy && <TextControls key={selectedText.id} layer={selectedText} change={patch => patchLayer(selectedText.id, patch)} t={t}/>}
        {drawer && <aside className="if-drawer" id="image-factory-drawer" aria-label={t('画板侧栏', 'Canvas sidebar')}>
          <header className="if-drawer-header">
            <strong>{drawer === 'layers' ? t('图层', 'Layers') : t('品牌资产', 'Brand assets')}</strong>
            <Button icon="close" label={t('关闭侧栏', 'Close sidebar')} onClick={closeDrawer}/>
          </header>
          {brandOpen && <BrandAssetLibrary t={t} disabled={busy} insert={insertBrandAsset} dragging={setBrandDragging}
            templateCount={galleryExamples.length} showTemplates={showGallery}/>}
          {layersOpen && <div ref={layersPanel} className="if-layers" role="region" aria-label={t('图层列表', 'Layer list')}
            onPointerDown={event => layerPointer(event, 'start')}
            onPointerMove={event => layerPointer(event, 'move')}
            onPointerUp={event => layerPointer(event, 'end')}
            onPointerCancel={event => layerPointer(event, 'cancel')}
            onPointerLeave={event => { if (!event.buttons) layerPointer(event, 'cancel') }}
            onLostPointerCapture={event => {
              if (event.buttons) layerPointer(event, 'cancel')
            }}>
            <div className="if-float-header">
              {textOutside && <button type="button" className="if-button if-return-text" onClick={event => {
                event.currentTarget.closest('.if-layers')
                  ?.querySelector<HTMLButtonElement>('.if-layer-name[aria-pressed="true"]')?.focus({ preventScroll: true })
                patchLayer(resizableText.id, inside)
                resetViewport()
              }}>{t('移回画框', 'Move inside')}</button>}
            </div>
            {!current.layers.length && <p>{t('画布上还没有图层。', 'The canvas has no layers.')}</p>}
            {renderLayerRows(current)}
          </div>}
        </aside>}
        <div className="if-canvas-status"><div className="if-canvas-readout"><span>{current.width} × {current.height} px</span>
          {saveStatus === 'saving' && <span role="status">{t('保存中…', 'Saving…')}</span>}
          {saveStatus === 'saved' && <span role="status">{t('已保存', 'Saved')}</span>}
          {saveStatus === 'error' && <Button onClick={() => workspace.commit(scope)}>{t('保存失败，重试', 'Save failed. Retry')}</Button>}
        </div><div className="if-zoom">
          <Button icon="minus" label={t('缩小', 'Zoom out')} disabled={!canZoomOut} onClick={() => stepZoom(1 / 1.25)}/>
          <span>{Math.round(displayScale * 100)}%</span>
          <Button icon="plus" label={t('放大', 'Zoom in')} disabled={!canZoomIn} onClick={() => stepZoom(1.25)}/>
          <Button onClick={resetViewport}>{t('适合', 'Fit')}</Button>
        </div></div>
      </>}
    </div>
    {(creatingTemplate.current || toast) && <div className="if-toast" role="status">
      {creatingTemplate.current ? t('正在打开模板…', 'Opening template…') : toast}
    </div>}
  </section>
}

export function mountImageFactory(doc: Document, host: WorkspaceSurfaceHost, bridge: Bridge) {
  mountWorkspaceTopbarStyles(doc)
  const root = doc.createElement('div')
  root.className = 'image-factory'
  const style = doc.createElement('style')
  const welcomeIcons = ['adjust', 'spark', 'image', 'upload'].map(name => {
    const src = iconSource(name)
    return src ? `[data-mode-welcome="image-factory"] [data-if-welcome-icon="${name}"]{--if-icon:url("${src.replaceAll('"', '%22')}");--if-icon-size:16px}` : ''
  })
  style.textContent = [imageFactoryFontFaces, styles, ...welcomeIcons].join('\n')
  doc.head.append(style)
  host.register('image-factory', root)
  const react = createRoot(root)
  let identity = 0
  let workspace = new CanvasWorkspace(doc, bridge.storage)
  let session: CanvasScope | undefined
  const activeHere = () => host.current()?.surface === 'image-factory'
  const select = (event: Event) => {
    const scope = (event as CustomEvent).detail?.sessionId
    if (scope !== undefined && !validCanvasScope(scope)) return
    session = scope
    if (scope !== undefined && activeHere()) workspace.select(scope)
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
  const render = () => react.render(<Editor key={identity} doc={doc} bridge={bridge} workspace={workspace}
    close={() => host.back()} revealConversation={() => host.revealConversation()} t={(zh, en) => english ? en : zh}/>)
  const language = new MutationObserver(() => {
    const now = doc.documentElement.dataset.odysseyLocale === 'en'
    if (now !== english) { english = now; render() }
  })
  language.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  const open = (reopen?: string) => {
    host.open('image-factory')
    if (activeHere()) {
      doc.dispatchEvent(new CustomEvent('sherlock:image-factory-request-session', { detail: { reopen, entry: true } }))
      if (session !== undefined) workspace.select(session)
      doc.dispatchEvent(new CustomEvent('sherlock:image-factory-show-chat'))
    }
  }
  render()
  return {
    open: () => open(),
    async openSessionCanvas(id: string, activateSession: () => Promise<boolean>, expectedCanvasId?: string) {
      if (!validCanvasScope(id)) throw Error('来源会话已不可用。')
      const origin = host.current()
      const owner = workspace
      const stillCurrent = () => owner === workspace && host.current() === origin
      const release = owner.retain(id)
      try {
        const scene = await owner.ready(id)
        if (!stillCurrent()) return
        if (!scene || expectedCanvasId && scene.id !== expectedCanvasId) throw Error('来源会话没有对应的画布。')
        const intent = new CustomEvent('sherlock:image-factory-canvas-intent', { detail: id })
        doc.dispatchEvent(intent)
        if (!await activateSession()) throw Error('来源会话已不可用。')
        if (!stillCurrent()) return
        doc.dispatchEvent(new CustomEvent('sherlock:image-factory-request-session', { detail: { reopen: id } }))
        if (session !== id) throw Error('来源会话已切换，请重试。')
        doc.dispatchEvent(new Event('sherlock:image-factory-show-canvas'))
        open(id)
      } finally {
        doc.dispatchEvent(new CustomEvent('sherlock:image-factory-canvas-intent-ended', { detail: id }))
        release()
      }
    },
    reset() {
      identity++; host.close('image-factory'); workspace.dispose()
      workspace = new CanvasWorkspace(doc, bridge.storage)
      session = undefined
      doc.dispatchEvent(new Event('sherlock:image-factory-reset')); render()
    },
    dispose() {
      doc.removeEventListener('sherlock:image-factory-session', select)
      doc.removeEventListener('sherlock:image-factory-adopt', adopt)
      language.disconnect(); react.unmount(); workspace.dispose(); root.remove(); style.remove()
    },
  }
}
