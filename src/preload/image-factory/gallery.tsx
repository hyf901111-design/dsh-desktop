import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { galleryExamples, type GalleryExample } from './gallery-examples'
import type { GalleryCategory } from './enterprise-gallery'
import { galleryTemplateLayers } from './gallery-layout'
import { promptExamples, type PromptExample } from './prompt-gallery'
import { textLayerStyle } from './layers'
import { brandArtwork } from './brand-artwork'
import { iconSource } from './icons'
import type { Size } from './raster'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
export const galleryArtwork = (id: string) => art['./gallery-art/' + id + '.jpg']
export const templatePhoto = (example: GalleryExample) => example.enterprise ? example.enterprise.photo : example.id
const categories = [
  ['all', '全部', 'All'], ['efund', '易方达品牌', 'E Fund'], ['enterprise', '企业通用', 'Enterprise'],
  ['events', '会议活动', 'Events'], ['brand', '品牌传播', 'Brand'], ['social', '社交媒体', 'Social'],
  ['team', '内部沟通', 'Team'], ['report', '报告与洞察', 'Reports'], ['operations', '业务运营', 'Operations'],
] as const satisfies readonly (readonly [GalleryCategory | 'all' | 'efund' | 'enterprise', string, string])[]
const promptCases: PromptExample[] = [
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
    {photo && <image href={photo} width={size.width} height={size.height} preserveAspectRatio="xMidYMid slice"/>}
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
  const [category, setCategory] = useState<typeof categories[number][0]>('all')
  const templates = galleryExamples.filter(example => {
    if (category === 'all') return true
    if (category === 'efund') return !example.enterprise
    if (category === 'enterprise') return !!example.enterprise
    return example.enterprise?.category === category
  })
  const cardCount = mode === 'templates' ? templates.length : promptCases.length
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
  }, [cardCount, mode, category])

  return <div className="if-gallery" role="region" aria-label={t('灵感画廊', 'Inspiration gallery')}>
    <div className="if-gallery-heading">
      <div className="if-gallery-mode" role="group" aria-label={t('画廊模式', 'Gallery mode')}>
        <button type="button" className="if-button" data-current={mode === 'templates'} aria-pressed={mode === 'templates'}
          onClick={() => setMode('templates')}>{t('基于模板修改', 'Edit a template')}</button>
        <button type="button" className="if-button" data-current={mode === 'prompts'} aria-pressed={mode === 'prompts'}
          onClick={() => setMode('prompts')}>{t('基于提示词生成', 'Generate from a prompt')}</button>
      </div>
      {onClose && <button ref={closeRef} type="button" className="if-button if-gallery-close" aria-label={t('关闭模板页', 'Close gallery')}
        title={t('返回画板 · Esc', 'Return to canvas · Esc')} onClick={onClose}>
        <i className="if-symbol" style={{ '--if-icon': 'url("' + iconSource('close') + '")' } as CSSProperties} aria-hidden="true"/>
        {t('关闭', 'Close')}
      </button>}
      {mode === 'templates' && <div className="if-gallery-filters" role="group" aria-label={t('模板分类', 'Template categories')}>
        {categories.map(([id, zh, en]) => <button key={id} type="button" className="if-button" data-current={category === id}
          aria-pressed={category === id} onClick={() => setCategory(id)}>{t(zh, en)}</button>)}
      </div>}
    </div>
    <div className="if-gallery-viewport" ref={viewport}>
      <div className="if-gallery-track">
        {[false, true].map(repeated => <div className="if-gallery-cycle" key={String(repeated)}
          ref={repeated ? undefined : firstCycle} data-repeat={repeated} aria-hidden={repeated || undefined}>
          {mode === 'templates' ? templates.map(example => {
            const title = t(...example.title)
            const material = t(...example.material)
            const size = example.enterprise ?? sizes[example.id]
            const photo = galleryArtwork(templatePhoto(example) ?? '')
            const useLabel = t('做同款', 'Make something like this')
            const templateLabel = t('可编辑模板', 'Editable template')
            return <article className="if-gallery-card" key={example.id} data-gallery-kind="template">
              <button type="button" className="if-gallery-art if-gallery-hover" disabled={busy} tabIndex={repeated ? -1 : undefined}
                aria-label={title + ' · ' + useLabel + ' · ' + templateLabel} onClick={() => onTemplate(example)}>
                <span className="if-gallery-media">
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
          }) : promptCases.map(example => {
            const title = t(...example.title)
            const prompt = t(...example.prompt)
            const useLabel = t('用同款提示词', 'Use this prompt')
            return <article className="if-gallery-card" key={example.id} data-gallery-kind="prompt">
              <button type="button" className="if-gallery-art if-gallery-hover" disabled={busy} tabIndex={repeated ? -1 : undefined}
                aria-label={title + ' · ' + useLabel}
                onClick={() => onUse(prompt + '\n' + t('画面比例为 ' + example.format + '。', 'Aspect ratio: ' + example.format + '.'))}>
                <span className="if-gallery-media">
                  <img alt="" loading="lazy" decoding="async" src={galleryArtwork(example.id)} draggable={false}/>
                </span>
                <span className="if-gallery-use">{useLabel}</span>
              </button>
              <h3 className="if-gallery-hover">{title}</h3>
              <p className="if-gallery-hover">{prompt}</p>
              <div className="if-gallery-details">
                <span className="if-gallery-tag if-gallery-hover">{example.format}</span>
                {example.scenes && t(...example.scenes).split(' · ').map(scene =>
                  <span className="if-gallery-tag if-gallery-hover" key={scene}>{scene}</span>)}
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
  </div>
})
