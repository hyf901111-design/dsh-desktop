import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { galleryExamples, type GalleryExample } from './gallery-examples'
import { galleryTemplateLayers } from './gallery-layout'
import { promptExamples, type PromptExample } from './prompt-gallery'
import { marketingPrompts } from './marketing-prompts'
import { textLayerStyle } from './layers'
import { brandArtwork } from './brand-artwork'
import { iconSource } from './icons'
import type { Size } from './raster'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
export const galleryArtwork = (id: string) => art['./gallery-art/' + id + '.jpg']
const promptCases: PromptExample[] = [
  ...marketingPrompts,
  ...promptExamples,
  ...galleryExamples.flatMap(({ id, title, prompt, format, scenes }) => prompt ? [{ id, title, prompt, format, scenes }] : []),
]
const scrollSpeed = 30
const pageDuration = 260
const wrap = (position: number, width: number) => ((position % width) + width) % width
type T = (zh: string, en: string) => string

const TemplatePreview = memo(function TemplatePreview({ example, size, photo, t }: {
  example: GalleryExample; size: Size; photo?: string; t: T
}) {
  let index = 0
  const layers = galleryTemplateLayers(example, size, t, () => String(index++))
  return <svg className="if-gallery-layout" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
    {photo && <>
      <rect width={size.width} height={size.height} fill="#ffffff"/>
      <image href={photo} width={size.width} height={size.height} preserveAspectRatio="xMidYMid slice"/>
    </>}
    {layers.map(layer => {
      const x = layer.x * size.width, y = layer.y * size.height, width = layer.width * size.width
      if (layer.kind === 'brand') return <image key={layer.id} href={brandArtwork[layer.asset].src}
        x={x} y={y} width={width} height={layer.height * size.height}/>
      if (layer.kind === 'shape') return <rect key={layer.id} x={x} y={y} width={width} height={layer.height * size.height} fill={layer.color}/>
      return <foreignObject key={layer.id} x={x} y={y} width={width} height={Math.max(0, size.height - y)}>
        <div data-template-copy style={{ ...textLayerStyle(layer, size), position: 'static' }}>{layer.text}</div>
      </foreignObject>
    })}
  </svg>
})

export const ImageFactoryGallery = memo(function ImageFactoryGallery({ t, busy, onUse, onTemplate, onClose, closeRef }: {
  t: T; busy: boolean; onUse(prompt: string): void; onTemplate(example: GalleryExample): void
  onClose?: () => void; closeRef?: RefObject<HTMLButtonElement>
}) {
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const [mode, setMode] = useState<'templates' | 'prompts'>('templates')
  const cardCount = galleryExamples.length
  const viewport = useRef<HTMLDivElement>(null)
  const firstCycle = useRef<HTMLDivElement>(null)
  const page = useRef<(direction: -1 | 1) => void>()
  useEffect(() => {
    const node = viewport.current
    const cycle = firstCycle.current
    const win = node?.ownerDocument.defaultView
    if (!node || !cycle || !win) return
    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)')
    let cycleWidth = 0
    let frame = 0
    let previousTime: number | undefined
    node.scrollLeft = 0
    let position = 0
    let paging: { from: number; to: number; start?: number } | undefined
    let overContent = false
    let keyboardFocus = false

    const move = (now: number) => {
      if (paging) {
        paging.start ??= now
        const progress = Math.min(1, (now - paging.start) / pageDuration)
        const eased = 1 - (1 - progress) ** 3
        position = wrap(paging.from + (paging.to - paging.from) * eased, cycleWidth)
        node.scrollLeft = position
        if (progress < 1) frame = win.requestAnimationFrame(move)
        else {
          paging = undefined
          frame = 0
          previousTime = undefined
          updateMotion()
        }
        return
      }
      if (previousTime !== undefined && cycleWidth > 0) {
        // Keep the fractional offset even when the scroller rounds to whole CSS pixels.
        position = (position + Math.min(now - previousTime, 50) * scrollSpeed / 1000) % cycleWidth
        node.scrollLeft = position
      }
      previousTime = now
      frame = win.requestAnimationFrame(move)
    }

    const updateMotion = () => {
      if (cycleWidth && paging) return
      if (!cycleWidth || reducedMotion.matches || overContent || keyboardFocus) {
        win.cancelAnimationFrame(frame)
        frame = 0
        paging = undefined
        previousTime = undefined
      } else if (!frame) {
        position = node.scrollLeft
        frame = win.requestAnimationFrame(move)
      }
    }

    page.current = direction => {
      if (!cycleWidth || !node.clientWidth) return
      const stride = cycleWidth / cardCount
      const step = stride * Math.max(1, Math.floor(node.clientWidth / stride)) * direction
      if (reducedMotion.matches) {
        const last = node.scrollWidth - node.clientWidth
        node.scrollLeft = direction < 0 && node.scrollLeft <= 1 ? last
          : direction > 0 && node.scrollLeft >= last - 1 ? 0 : node.scrollLeft + step
        return
      }
      win.cancelAnimationFrame(frame)
      const from = wrap(node.scrollLeft, cycleWidth)
      paging = { from, to: from + step }
      frame = win.requestAnimationFrame(move)
    }

    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
          node.scrollHeight > node.clientHeight) return
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientWidth
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
      event.preventDefault()
      node.scrollLeft += event.deltaY * scale
    }

    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const target = event.type === 'pointerout' ? event.relatedTarget : event.target
      const content = target instanceof win.Element ? target.closest('.if-gallery-hover') : null
      const isOverContent = content !== null && node.contains(content)
      if (overContent === isOverContent) return
      overContent = isOverContent
      updateMotion()
    }

    const trackFocus = (event: FocusEvent) => {
      keyboardFocus = event.type === 'focusin' &&
        event.target instanceof win.Element && event.target.matches(':focus-visible')
      updateMotion()
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) cycleWidth = entry.target.getBoundingClientRect().width
      updateMotion()
    })
    observer.observe(cycle)
    node.addEventListener('pointerover', trackPointer)
    node.addEventListener('pointerout', trackPointer)
    node.addEventListener('focusin', trackFocus)
    node.addEventListener('focusout', trackFocus)
    reducedMotion.addEventListener('change', updateMotion)
    node.addEventListener('wheel', wheel, { passive: false })
    return () => {
      page.current = undefined
      win.cancelAnimationFrame(frame)
      observer.disconnect()
      node.removeEventListener('pointerover', trackPointer)
      node.removeEventListener('pointerout', trackPointer)
      node.removeEventListener('focusin', trackFocus)
      node.removeEventListener('focusout', trackFocus)
      reducedMotion.removeEventListener('change', updateMotion)
      node.removeEventListener('wheel', wheel)
    }
  }, [cardCount, mode])

  useEffect(() => {
    const node = viewport.current?.querySelector('.if-gallery-track')
    const motion = viewport.current?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)')
    if (!node || !motion || motion.matches || typeof node.animate !== 'function') return
    const animation = node.animate([{ opacity: .48, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' })
    const reduce = () => { if (motion.matches) animation.cancel() }
    motion.addEventListener('change', reduce)
    return () => { motion.removeEventListener('change', reduce); animation.cancel() }
  }, [mode])

  return <div className="if-gallery" role="region" aria-label={t('灵感画廊', 'Inspiration gallery')}>
    <div className="if-gallery-mode" role="group" aria-label={t('画廊模式', 'Gallery mode')}>
      <button type="button" className="if-button" data-current={mode === 'templates'} aria-pressed={mode === 'templates'}
        onClick={() => setMode('templates')}>{t('基于模板修改', 'Edit a template')}</button>
      <button type="button" className="if-button" data-current={mode === 'prompts'} aria-pressed={mode === 'prompts'}
        onClick={() => setMode('prompts')}>{t('基于提示词生成', 'Generate from a prompt')}</button>
    </div>
    {onClose && <button ref={closeRef} type="button" className="if-button if-gallery-close" aria-label={t('关闭画廊', 'Close gallery')}
      title={t('返回画板 · Esc', 'Return to canvas · Esc')} onClick={onClose}>
      <i className="if-symbol" style={{ '--if-icon': 'url("' + iconSource('close') + '")' } as CSSProperties} aria-hidden="true"/>
    </button>}
    {mode === 'prompts' ? <PromptGallery t={t} busy={busy} onUse={onUse}/> : <>
    <div className="if-gallery-viewport" ref={viewport}>
      <div className="if-gallery-track">
        {[false, true].map(repeated => <div className="if-gallery-cycle" key={String(repeated)}
          ref={repeated ? undefined : firstCycle} data-repeat={repeated} aria-hidden={repeated || undefined}>
          {galleryExamples.map(example => {
            const title = t(...example.title)
            const material = t(...example.material)
            const size = sizes[example.id]
            const photo = galleryArtwork(example.id)
            const useLabel = t('做同款', 'Make something like this')
            const templateLabel = t('可编辑模板', 'Editable template')
            return <article className="if-gallery-card" key={example.id} data-gallery-kind="template">
              <button type="button" className="if-gallery-art if-gallery-hover" disabled={busy} tabIndex={repeated ? -1 : undefined}
                aria-label={title + ' · ' + useLabel + ' · ' + templateLabel} onClick={() => onTemplate(example)}>
                <span className="if-gallery-media" style={{ aspectRatio: size ? size.width + ' / ' + size.height : example.format.replace(':', ' / ') }}>
                  {!size && photo && <img alt="" loading="lazy" decoding="async" src={photo} draggable={false}
                    onLoad={({ currentTarget }) => {
                      const { naturalWidth: width, naturalHeight: height } = currentTarget
                      if (width && height) setSizes(current => ({ ...current, [example.id]: { width, height } }))
                    }}/>}
                  {size && <TemplatePreview example={example} size={size} photo={photo} t={t}/>}
                </span>
                <span className="if-gallery-use">{useLabel}</span>
              </button>
              <h3 className="if-gallery-hover">{material}</h3>
              <p className="if-gallery-hover">{t(...example.subtitle)}</p>
              <div className="if-gallery-details">
                <span className="if-gallery-tag if-gallery-hover">{example.format}</span>
                {size && <span className="if-gallery-tag if-gallery-hover">{size.width} × {size.height} px</span>}
              </div>
            </article>
          })}
        </div>)}
      </div>
    </div>
    <div className="if-gallery-controls">
      {([-1, 1] as const).map(direction => {
        const label = direction < 0 ? t('向左翻页', 'Scroll gallery left') : t('向右翻页', 'Scroll gallery right')
        return <button key={direction} type="button" className="if-gallery-page" data-direction={direction < 0 ? 'left' : 'right'}
          aria-label={label} title={label} onClick={() => page.current?.(direction)}>
          <i className="if-symbol" aria-hidden="true" style={{ '--if-icon': 'url("' + iconSource('chevron') + '")' } as CSSProperties}/>
        </button>
      })}
    </div>
    </>}
  </div>
})

function PromptGallery({ t, busy, onUse }: { t: T; busy: boolean; onUse(prompt: string): void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = entry.contentRect.width
      setColumns(width >= 1280 ? 4 : width >= 650 ? 3 : width >= 340 ? 2 : 1)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const lanes = Array.from({ length: columns }, (_, column) => promptCases.filter((_, index) => index % columns === column))
  return <div className="if-prompt-gallery" ref={viewport} role="region" aria-label={t('提示词图片画廊', 'Prompt image gallery')}>
    {lanes.map((examples, column) => <div key={column} className="if-prompt-lane" style={{ '--if-prompt-count': examples.length } as CSSProperties}>
      <div className="if-prompt-track">
        {[false, true].map(repeated => <div key={String(repeated)} className="if-prompt-cycle"
          data-repeat={repeated} aria-hidden={repeated || undefined}>
          {examples.map(({ id, title, prompt, format }) => <button type="button" className="if-gallery-art if-prompt-image" key={id}
            tabIndex={repeated ? -1 : undefined} disabled={busy}
            aria-label={t(...title) + ' · ' + t('用同款提示词', 'Use this prompt')}
            onClick={() => onUse(t(...prompt) + '\n' + t('画面比例为 ' + format + '。', 'Aspect ratio: ' + format + '.'))}>
            <img alt="" src={galleryArtwork(id)} draggable={false} decoding="async"/>
            <span className="if-gallery-use" aria-hidden="true">{t('做同款', 'Make something like this')}</span>
          </button>)}
        </div>)}
      </div>
    </div>)}
  </div>
}
