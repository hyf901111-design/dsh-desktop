import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'

for (const dark of [false, true]) it(`model search-empty geometry and palette (${dark ? 'dark' : 'light'}) remain local`, async () => {
  const win = new Window(), doc = win.document
  doc.head.innerHTML = `<style>:root{--odyssey-font-ui:sans-serif}._7KE1Ra_empty{padding:10px;font:13px/20px sans-serif;color:#888}${readFileSync('src/preload/figma-refinements.css', 'utf8')}</style>`
  if (dark) doc.body.setAttribute('data-ds-dark-theme', '')
  doc.body.innerHTML = '<div role="menu" class="odyssey-model-menu" id="empty"><input class="odyssey-model-search"><div class="_7KE1Ra_groups"><div class="_7KE1Ra_empty odyssey-model-empty"><div class="odyssey-model-empty-title">未找到匹配的模型</div><div class="odyssey-model-empty-description">尝试其他关键词，或前往模型设置。</div></div></div><button role="menuitem" class="odyssey-model-footer">管理模型…</button></div><div class="odyssey-model-menu" id="unconfigured"><div class="_7KE1Ra_empty">没有可用的模型。</div><button class="odyssey-model-footer">管理模型…</button></div><div id="other" class="_7KE1Ra_empty">无关空态</div>'
  const style = (selector: string) => win.getComputedStyle(doc.querySelector(selector)!)
  try {
    expect(style('.odyssey-model-empty').height).toBe('64px')
    expect(style('.odyssey-model-empty').padding).toBe('7px 10px')
    expect(style('.odyssey-model-empty').color).toBe(dark ? '#6b6b6b' : '#a6a6a6')
    expect(style('.odyssey-model-empty-title').lineHeight).toBe('20px')
    expect(style('.odyssey-model-empty-description').fontSize).toBe('11px')
    expect(style('.odyssey-model-empty-description').lineHeight).toBe('18px')
    expect(style('.odyssey-model-empty-description').marginTop).toBe('3px')
    expect(style('#empty ._7KE1Ra_groups').marginTop).toBe('2px')
    expect(style('#empty .odyssey-model-footer').marginTop).toBe('11px')
    expect(style('#empty .odyssey-model-footer').color).toBe(dark ? '#e6e6e6' : '#242424')
    expect(style('#unconfigured .odyssey-model-footer').marginTop).toBe('6px')
    expect(style('#unconfigured ._7KE1Ra_empty').padding).toBe('10px')
    expect(style('#other').color).toBe('#888')
  } finally { await win.happyDOM.close() }
})
