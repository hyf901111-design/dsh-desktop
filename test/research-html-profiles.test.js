import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import postcss from 'postcss'
import * as host from '../packages/dsh-research-task-runtime/html-artifact.js'

// Happy DOM does not implement cascade layers; use the source profile rules for
// scoped layout/token checks. A real Chromium run covers layer/host integration.
function render(markup, theme = 'light') {
  const window = new Window()
  const css = postcss.parse(host.RESEARCH_COMPONENT_PROFILE_CSS || '')
  css.walkAtRules('layer', rule => rule.replaceWith(rule.nodes))
  window.document.write(`<html data-sherlock-theme="${theme}"><head><style>${host.RESEARCH_COMPONENT_THEME_CSS}
    table{font-size:10px;line-height:16px}tbody tr:nth-child(even){background:var(--sherlock-row-alternate)}
    tbody tr:nth-child(odd){background:var(--sherlock-surface-muted)}
    ${css}</style></head><body>${markup}</body></html>`)
  return { document: window.document, style: selector => window.getComputedStyle(window.document.querySelector(selector)) }
}
const rows = `<table><thead><tr><th>证券</th><th>权重</th><th>基金</th><th>较上期</th><th>拥挤度</th></tr></thead><tbody>
  <tr><td>华芯科技 <span data-sherlock-numeric>S001</span></td><td data-sherlock-numeric>6.42%</td><td>6 / 8</td><td><span data-sherlock-holdings-change="positive">+0.82%</span></td><td>偏高</td></tr>
  <tr><td>恒康医药</td><td>4.86%</td><td>5 / 8</td><td><span data-sherlock-holdings-change="negative">-0.24%</span></td><td>中等</td></tr></tbody></table>`

describe('opt-in Figma fund72 HTML profiles', () => {
  it.each([
    ['light', '#f7f8f9', '#f7f8f9', '#ffffff', '#b84343', '#292b2f'],
    ['dark', '#242424', '#242424', '#171717', '#ff9d9d', '#e7e7e9']
  ])('uses the %s AG Grid surface while retaining holdings change semantics', (theme, header, stripe, surface, positive, negative) => {
    const { style } = render(`<main data-sherlock-profile="fund72-holdings">${rows}</main>`, theme)
    expect(style('thead th').backgroundColor).toBe(header)
    expect(style('tbody tr:first-child td').backgroundColor).toBe(stripe)
    expect(style('tbody tr:last-child td').backgroundColor).toBe(surface)
    expect(style('tbody tr:first-child').backgroundColor).toBe('transparent')
    expect(style('tbody tr:last-child').backgroundColor).toBe('transparent')
    expect(style('[data-sherlock-holdings-change="positive"]').color).toBe(positive)
    expect(style('[data-sherlock-holdings-change="negative"]').color).toBe(negative)
    expect(host.RESEARCH_COMPONENT_PALETTES[theme]['holdings-change-positive']).not.toBe(host.RESEARCH_COMPONENT_PALETTES[theme]['market-positive'])
  })

  it('uses the holdings 9/18 and left-aligned DIN 500 profile without changing ordinary tables', () => {
    const { style } = render(`<main data-sherlock-profile="fund72-holdings">${rows}</main><section id="ordinary">${rows}</section>`)
    expect(style('main td').fontSize).toBe('9px')
    expect(style('main td').lineHeight).toBe('18px')
    expect(style('main th').height).toBe('25px')
    expect(style('main th').lineHeight).toBe('17px')
    expect(style('main td').height).toBe('34px')
    expect(style('main [data-sherlock-numeric]').textAlign).toBe('left')
    expect(style('main [data-sherlock-numeric]').fontWeight).toBe('500')
    expect(style('main td:first-child').fontWeight).toBe('700')
    expect(style('main td:first-child').fontFamily).toBe('"Noto Sans SC", sans-serif')
    expect(style('#ordinary table').fontSize).toBe('10px')
    expect(style('#ordinary table').lineHeight).toBe('16px')
    expect(style('#ordinary td').backgroundColor).toBe('')
  })

  it.each([
    ['light', '#005096', '#1eb9e1'],
    ['dark', '#0078b4', '#1eb9e1']
  ])('uses the paired %s industry colors independently from the generic chart palette', (theme, first, second) => {
    const { style } = render(`<main data-sherlock-profile="fund72-industry"><div class="research-industry-rows">
      <div class="research-industry-row"><div class="research-industry-track"><div class="research-industry-bar"></div></div></div>
      <div class="research-industry-row"><div class="research-industry-track"><div class="research-industry-bar"></div></div></div>
    </div></main>`, theme)
    expect(style('.research-industry-row:first-child .research-industry-bar').backgroundColor).toBe(first)
    expect(style('.research-industry-row:last-child .research-industry-bar').backgroundColor).toBe(second)
    expect(host.RESEARCH_COMPONENT_PALETTES.dark['chart-1']).toBe('#1eb9e1')
    expect(host.RESEARCH_COMPONENT_PALETTES.dark['chart-2']).toBe('#b3ebff')
  })

  it('provides separate KPI and industry geometry without hiding or fixing content height', () => {
    const { style } = render(`<main data-sherlock-profile="fund72-kpi"><div class="research-metrics"><div class="research-metric"><div class="research-metric-label">穿透基金</div><div class="research-metric-value">8<span data-sherlock-unit>只</span></div><div class="research-metric-detail">基金池 · 权益核心组</div></div></div></main>
      <section data-sherlock-profile="fund72-industry"><div class="research-industry-row"><span class="research-industry-label">电子</span><div class="research-industry-track"><div class="research-industry-bar" style="width:82%"></div></div><span class="research-industry-value">24.6%</span></div><p class="research-footer">已披露权益持仓 · 行业权重合计100%</p></section>`)
    expect(style('.research-metric').borderRadius).toBe('5px')
    expect(style('.research-metric').minHeight).toBe('64px')
    expect(style('.research-metric-value').fontSize).toBe('23px')
    expect(style('.research-metric-value').lineHeight).toBe('26px')
    expect(style('[data-sherlock-unit]').fontWeight).toBe('400')
    expect(style('.research-metric-detail').fontSize).toBe('8px')
    expect(style('.research-industry-track').height).toBe('7px')
    expect(style('.research-industry-track').borderRadius).toBe('2px')
    expect(style('.research-industry-value').textAlign).toBe('right')
    expect(style('.research-industry-value').fontSize).toBe('10px')
    expect(style('.research-footer').lineHeight).toBe('14px')
    expect(style('main').height).toBe('auto')
  })

  it('preserves regular auxiliary Chinese while explicit numeric fragments use DIN Medium', () => {
    const { style } = render(`<main data-sherlock-profile="fund72-kpi"><div class="research-metric-detail">其余<span data-sherlock-numeric>7.4%</span>暂未披露</div></main>
      <section data-sherlock-profile="fund72-industry"><div class="research-callout"><span data-sherlock-status="warning">电子超配 +<span data-sherlock-numeric>8.2%</span></span><span class="research-benchmark">基准<span data-sherlock-numeric>16.4%</span></span></div><p class="research-footer">行业权重合计<span data-sherlock-numeric>100%</span></p></section>`)
    for (const selector of ['.research-metric-detail', '[data-sherlock-status]', '.research-benchmark', '.research-footer']) {
      expect(style(selector).fontWeight).toBe('400')
      expect(style(`${selector} [data-sherlock-numeric]`).fontWeight).toBe('500')
      expect(style(`${selector} [data-sherlock-numeric]`).fontFamily).toBe('"EWork Profile Punctuation", "EWork DIN Pro", "Noto Sans SC", sans-serif')
    }
  })

  it('places opt-in profiles after the AG Grid controls layer and keeps field geometry fixed', () => {
    expect(host.RESEARCH_COMPONENT_PROFILE_CSS).toContain('@layer sherlock-component-profiles')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('height:27px!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('border-radius:3px!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('font-size:var(--sherlock-control-font-size,12px)!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('input.research-filter-search{--sherlock-control-padding-left:29px;padding-left:29px!important')
    expect(host.RESEARCH_COMPONENT_PROFILE_CSS).not.toMatch(/(?:display:none|overflow:hidden|text-overflow:ellipsis)/)
  })

  it('keeps existing mixed numeric text intact while selecting the fixed regular punctuation face', () => {
    const { document, style } = render(`<main data-sherlock-profile="fund72-holdings"><table><tbody><tr><td>证券 S<span data-sherlock-numeric>001</span></td><td><span data-sherlock-numeric>6 / 8</span></td><td><span data-sherlock-holdings-change="positive"><span data-sherlock-numeric>+0.82%</span></span></td></tr></tbody></table><p class="research-footer">来源 · 合成数据</p></main>`)
    expect(style('[data-sherlock-holdings-change] [data-sherlock-numeric]').fontFamily).toContain('"EWork Profile Punctuation"')
    expect(style('[data-sherlock-holdings-change] [data-sherlock-numeric]').fontWeight).toBe('500')
    expect(style('.research-footer').fontFamily).toContain('"EWork Profile Punctuation"')
    expect(document.querySelector('[data-sherlock-holdings-change]').textContent).toBe('+0.82%')
    expect(document.querySelectorAll('[data-sherlock-numeric]')).toHaveLength(3)
  })

  it('uses the source neutral dropdown arrow without replacing native selects', () => {
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('select:not([multiple]):not([size])')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('appearance:none!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('background-size:10px 6px!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain('background-position:right 11px center!important')
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain("stroke-width='1.2'")
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain("viewBox='-1 -1 10 6'")
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain("stroke-linecap='round'")
    expect(host.RESEARCH_COMPONENT_CONTROLS_CSS).toContain("d='M0 0L4 4L8 0'")
  })
})
