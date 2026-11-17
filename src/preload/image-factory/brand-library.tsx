import type { ReactNode } from 'react'
import { brandArtwork } from './brand-artwork'
import { artworkHeight, brandAssetSections, brandDragType, type BrandAsset } from './brand-assets'

type Translate = (zh: string, en: string) => string

function AssetPreview({ asset, t }: { asset: BrandAsset; t: Translate }) {
  return <span className="if-brand-preview" data-dark={asset.darkPreview}>
    <svg viewBox={`0 0 ${asset.width} ${asset.height}`} aria-hidden="true">
      {asset.parts.map((part, index) => {
        if (part.kind === 'brand') return <image key={index} href={brandArtwork[part.asset].src}
          x={part.x} y={part.y} width={part.width} height={artworkHeight(part.asset, part.width)}/>
        if (part.kind === 'shape') return <rect key={index} x={part.x} y={part.y} width={part.width} height={part.height} fill={part.color}/>
        return <text key={index} x={part.x} y={part.y + part.fontSize * .92} fontSize={part.fontSize} fontWeight={part.weight}
          fill={part.color}>{t(...part.label).split('\n')[0]}</text>
      })}
    </svg>
  </span>
}

export function BrandAssetLibrary({ t, close, disabled, insert, dragging, closeIcon, templateCount, showTemplates }: {
  t: Translate; close(): void; disabled: boolean; insert(asset: BrandAsset): void; dragging(value: boolean): void; closeIcon: ReactNode; templateCount: number; showTemplates(): void
}) {
  return <aside className="if-brand-library" id="image-factory-brand-library" aria-labelledby="image-factory-brand-heading">
    <div className="if-brand-header">
      <div>
        <strong id="image-factory-brand-heading">{t('品牌资产', 'Brand assets')}</strong>
        <p>{t('易方达 · 视觉识别系统', 'E Fund · Visual identity')}</p>
      </div>
      <button type="button" className="if-button" onClick={close} aria-label={t('关闭品牌资产', 'Close brand assets')}>{closeIcon}</button>
    </div>
    <div className="if-brand-body">
      <button type="button" className="if-brand-templates" onClick={showTemplates} disabled={disabled}>
        <span>{t('宣传物料模板', 'Marketing templates')}</span><span>{templateCount} <i aria-hidden="true">›</i></span>
      </button>
      <p className="if-brand-hint">{t('拖到画布，或点击添加。', 'Drag onto the canvas, or click to add.')}</p>
      {brandAssetSections.map(section => <section className="if-brand-section" key={section.label[1]}>
        <h3>{t(...section.label)}</h3>
        <div className="if-brand-grid">
          {section.assets.map(asset => <button type="button" key={asset.id} className="if-brand-card" data-brand-asset={asset.id}
            title={t(...asset.label)} disabled={disabled} draggable={!disabled} onClick={() => insert(asset)} onDragStart={event => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData(brandDragType, asset.id)
              dragging(true)
            }} onDragEnd={() => dragging(false)}>
            <AssetPreview asset={asset} t={t}/>
            <span>{t(...asset.label)}</span>
          </button>)}
        </div>
      </section>)}
    </div>
  </aside>
}
