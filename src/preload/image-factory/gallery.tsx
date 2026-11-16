import { useState, type ReactNode } from 'react'
import { galleryExamples, galleryTopics, type GalleryTopic } from './gallery-examples'
import type { Ratio } from './raster'

const art = import.meta.glob('./gallery-art/*.jpg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>
type T = (zh: string, en: string) => string
const topics = Object.keys(galleryTopics) as GalleryTopic[]

export function ImageFactoryGallery({ t, actions, ratios, busy, onUse }: {
  t: T
  actions: ReactNode
  ratios: ReactNode
  busy: boolean
  onUse(prompt: string, ratio: Ratio): boolean
}) {
  const [topic, setTopic] = useState<GalleryTopic | 'all'>('all')
  const [picked, setPicked] = useState<string>()
  const localized = (copy: readonly [string, string]) => t(copy[0], copy[1])
  const shown = topic === 'all' ? galleryExamples : galleryExamples.filter(example => example.topic === topic)
  return <div className="if-gallery" aria-label={t('图像工厂首页', 'Image Factory home')}>
    <div className="if-gallery-content">
      <header className="if-gallery-intro">
        <div>
          <h1>{t('今天想做什么图？', 'What would you like to create?')}</h1>
          <p>{t('从下方示例取用提示词，或直接在右侧描述想做的图。', 'Use a prompt below, or describe what you want in the chat.')}</p>
        </div>
        <div className="if-gallery-actions">{actions}</div>
      </header>
      <div className="if-gallery-tools">
        <nav aria-label={t('示例分类', 'Example categories')}>
          <button type="button" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>{t('全部示例', 'All examples')}</button>
          {topics.map(value => <button type="button" key={value} aria-pressed={topic === value}
            onClick={() => setTopic(value)}>{localized(galleryTopics[value])}</button>)}
        </nav>
        {ratios}
      </div>
      <ul className="if-gallery-grid">
        {shown.map((example, index) => <li key={example.id}>
          <button type="button" className="if-gallery-card" data-picked={picked === example.id} data-topic={example.topic} disabled={busy}
            aria-label={t(...example.title) + ' · ' + t('使用提示词', 'Use prompt')}
            onClick={() => { if (onUse(t(...example.prompt), example.ratio)) setPicked(example.id) }}>
            <span className="if-gallery-media">
              <img className="if-gallery-art" alt="" src={art['./gallery-art/' + example.id + '.jpg']}
                loading={index < 6 ? 'eager' : 'lazy'} draggable={false}/>
              <span className="if-gallery-use">{picked === example.id ? t('已填入提示词', 'Prompt added') : t('使用提示词', 'Use prompt')} <span aria-hidden="true">↗</span></span>
            </span>
            <span className="if-gallery-caption">
              <strong>{t(...example.title)}</strong><span>{localized(galleryTopics[example.topic])}</span>
            </span>
          </button>
        </li>)}
      </ul>
    </div>
  </div>
}
