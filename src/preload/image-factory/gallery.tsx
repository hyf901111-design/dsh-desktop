import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { galleryExamples, type GalleryExample } from './gallery-examples'
import { galleryTemplateLayers } from './gallery-layout'
import { brandArtwork } from './brand-artwork'
import { iconSource } from './icons'
import type { Size } from './raster'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
export const galleryArtwork = (id: string) => art['./gallery-art/' + id + '.jpg']
const scrollSpeed = 30
const pageDuration = 260
const wrap = (position: number, width: number) => ((position % width) + width) % width
type T = (zh: string, en: string) => string

function TemplatePreview({ example, size, t }: { example: GalleryExample; size: Size; t: T }) {
  let index = 0
  const layers = galleryTemplateLayers(example, size, t, () => String(index++))
  return <svg className="if-gallery-layout" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
    {layers.map(layer => {
      const x = layer.x * size.width, y = layer.y * size.height, width = layer.width * size.width
      if (layer.kind === 'brand') return <image key={layer.id} href={brandArtwork[layer.asset].src}
        x={x} y={y} width={width} height={layer.height * size.height}/>
      if (layer.kind === 'shape') return <rect key={layer.id} x={x} y={y} width={width} height={layer.height * size.height} fill={layer.color}/>
      return <text key={layer.id} x={x} y={y + layer.fontSize * .94} fill={layer.color}
        fontFamily={layer.family + ', sans-serif'} fontWeight={layer.weight} fontSize={layer.fontSize}>
        {layer.text.split('\n').map((line, index) => <tspan key={index} x={x} dy={index ? layer.fontSize * 1.2 : 0}>{line}</tspan>)}
      </text>
    })}
  </svg>
}

export const ImageFactoryGallery = memo(function ImageFactoryGallery({ t, busy, onUse, onTemplate }: {
  t: T; busy: boolean; onUse(prompt: string): void; onTemplate(example: GalleryExample): void
}) {
  const [sizes, setSizes] = useState<Record<string, Size>>({})
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
    let position = node.scrollLeft
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
      const stride = cycleWidth / galleryExamples.length
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
  }, [])

  return <div className="if-gallery" role="region" aria-label={t('灵感画廊', 'Inspiration gallery')}>
    <div className="if-gallery-viewport" ref={viewport}>
      <div className="if-gallery-track">
        {[false, true].map(repeated => <div className="if-gallery-cycle" key={String(repeated)}
          ref={repeated ? undefined : firstCycle} data-repeat={repeated} aria-hidden={repeated || undefined}>
          {galleryExamples.map(example => {
            const title = t(...example.title)
            const prompt = t(...example.prompt)
            const size = sizes[example.id]
            const { format } = example
            const useLabel = t('做同款', 'Make something like this')
            const templateLabel = t('可编辑模板', 'Editable template')
            return <article className="if-gallery-card" key={example.id}>
              <button type="button" className="if-gallery-art if-gallery-hover" disabled={busy} tabIndex={repeated ? -1 : undefined}
                aria-label={title + ' · ' + useLabel + ' · ' + templateLabel}
                onClick={() => onTemplate(example)}>
                <img alt="" loading="lazy" decoding="async" src={galleryArtwork(example.id)} draggable={false}
                  onLoad={({ currentTarget }) => {
                    const { naturalWidth: width, naturalHeight: height } = currentTarget
                    if (width && height) setSizes(current => current[example.id] ? current : { ...current, [example.id]: { width, height } })
                  }}/>
                {size && <TemplatePreview example={example} size={size} t={t}/>}
                <span className="if-gallery-template-badge" aria-hidden="true">{t(...example.material)}</span>
                <span className="if-gallery-use">{useLabel}<i className="if-symbol"
                  style={{ maskImage: `url("${iconSource('arrow-up')}")` }} aria-hidden="true"/></span>
              </button>
              <h3><span className="if-gallery-hover">{title}</span></h3>
              <div className="if-gallery-prompt">
                <span className="if-gallery-caption if-gallery-hover">{t('底图提示词', 'Background prompt')}</span>
                <button type="button" className="if-gallery-prompt-button if-gallery-hover" disabled={busy} tabIndex={repeated ? -1 : undefined}
                  onClick={() => onUse(prompt + '\n' + (format === 'A4' ? t('画面为 A4 竖版。', 'Use A4 portrait.')
                    : t('画面比例为 ' + format + '。', 'Aspect ratio: ' + format + '.')))}>{t('复用', 'Reuse')}</button>
              </div>
              <p><span className="if-gallery-hover">{prompt}</span></p>
              <dl>
                <dt><span className="if-gallery-hover">{t('使用场景', 'Use cases')}</span></dt>
                <dd>{t(...example.scenes).split(' · ').map(scene =>
                  <span className="if-gallery-tag if-gallery-hover" key={scene}>{scene}</span>
                )}</dd>
                {size && <>
                  <dt><span className="if-gallery-hover">{t('图像参数', 'Image settings')}</span></dt>
                  <dd>
                    <span className="if-gallery-tag if-gallery-hover">{format}</span>
                    <span className="if-gallery-tag if-gallery-hover">{size.width} × {size.height} px</span>
                  </dd>
                </>}
              </dl>
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
