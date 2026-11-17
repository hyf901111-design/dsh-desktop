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

export function BrandAssetLibrary({ t, disabled, insert, dragging, templateCount, showTemplates }: {
  t: Translate; disabled: boolean; insert(asset: BrandAsset): void
  dragging(value: boolean): void; templateCount: number; showTemplates(): void
}) {
  return <div className="if-brand-library" aria-label={t('品牌资产', 'Brand assets')}>
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
  </div>
}
