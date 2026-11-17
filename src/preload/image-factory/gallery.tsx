import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { galleryExamples } from './gallery-examples'
import { iconSource } from './icons'
import type { Size } from './raster'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
const scrollSpeed = 30
const pageDuration = 260
const wrap = (position: number, width: number) => ((position % width) + width) % width
type T = (zh: string, en: string) => string

function imageRatio({ width, height }: Size) {
  let a = width, b = height
  while (b) [a, b] = [b, a % b]
  return (width / a) + ':' + (height / a)
}

export function ImageFactoryGallery({ t, busy, onUse }: { t: T; busy: boolean; onUse(prompt: string): void }) {
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
      if (!cycleWidth || reducedMotion.matches || node.matches(':hover, :focus-within')) {
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

    const observer = new ResizeObserver(([entry]) => {
      if (entry) cycleWidth = entry.target.getBoundingClientRect().width
      updateMotion()
    })
    observer.observe(cycle)
    const motionEvents = ['pointerenter', 'pointerleave', 'focusin', 'focusout']
    for (const event of motionEvents) node.addEventListener(event, updateMotion)
    reducedMotion.addEventListener('change', updateMotion)
    node.addEventListener('wheel', wheel, { passive: false })
    return () => {
      page.current = undefined
      win.cancelAnimationFrame(frame)
      observer.disconnect()
      for (const event of motionEvents) node.removeEventListener(event, updateMotion)
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
            const ratio = size && imageRatio(size)
            const useLabel = t('做同款', 'Make something like this')
            return <article className="if-gallery-card" key={example.id}>
              <button type="button" className="if-gallery-art" disabled={busy} tabIndex={repeated ? -1 : undefined}
                aria-label={title + ' · ' + useLabel}
                onClick={() => onUse(ratio ? prompt + '\n' + t('画面比例为 ' + ratio + '。', 'Aspect ratio: ' + ratio + '.') : prompt)}>
                <img alt="" src={art['./gallery-art/' + example.id + '.jpg']} draggable={false}
                  onLoad={({ currentTarget }) => {
                    const { naturalWidth: width, naturalHeight: height } = currentTarget
                    if (width && height) setSizes(current => current[example.id] ? current : { ...current, [example.id]: { width, height } })
                  }}/>
                <span className="if-gallery-use">{useLabel}<i className="if-symbol"
                  style={{ maskImage: `url("${iconSource('arrow-up')}")` }} aria-hidden="true"/></span>
              </button>
              <h3>{title}</h3>
              <span className="if-gallery-caption">{t('提示词', 'Prompt')}</span>
              <p>{prompt}</p>
              <dl>
                <dt>{t('使用场景', 'Use cases')}</dt><dd>{t(...example.scenes)}</dd>
                {size && <><dt>{t('图像参数', 'Image settings')}</dt><dd>{ratio} · {size.width} × {size.height} px</dd></>}
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
}
