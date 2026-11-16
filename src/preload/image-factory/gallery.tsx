import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { galleryExamples } from './gallery-examples'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
type T = (zh: string, en: string) => string

export function ImageFactoryGallery({ t, busy, onUse }: { t: T; busy: boolean; onUse(prompt: string): void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(3)
  useLayoutEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = entry.contentRect.width
      setColumnCount(width >= 1280 ? 4 : width >= 650 ? 3 : width >= 340 ? 2 : 1)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const lanes = Array.from({ length: columnCount }, (_, column) =>
    galleryExamples.filter((_, index) => index % columnCount === column))
  return <div className="if-gallery" ref={viewport} aria-label={t('灵感画廊', 'Inspiration gallery')}>
    {lanes.map((lane, column) => <div className="if-gallery-lane" key={column}
      style={{ '--if-gallery-count': lane.length } as CSSProperties}>
      <div className="if-gallery-track">
        {[false, true].map(repeated => <div className="if-gallery-cycle" key={String(repeated)}
          data-repeat={repeated} aria-hidden={repeated || undefined}>
          {lane.map(example => <button type="button" className="if-gallery-card" key={example.id} disabled={busy}
            tabIndex={repeated ? -1 : undefined}
            aria-label={t(...example.title) + ' · ' + t('使用提示词', 'Use prompt')}
            onClick={() => onUse(t(...example.prompt) + '\n' + t('画面比例为 ' + example.ratio + '。', 'Aspect ratio: ' + example.ratio + '.'))}>
            <img alt="" src={art['./gallery-art/' + example.id + '.jpg']} draggable={false}/>
          </button>)}
        </div>)}
      </div>
    </div>)}
  </div>
}
