import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'

const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js', 'utf8')
const vendorCssText = source.match(/const css\$3 = ("(?:[^"\\]|\\.)*");/)?.[1]
if (!vendorCssText) throw new Error('Model settings stylesheet anchor drifted')
const vendorCss = JSON.parse(vendorCssText)
const settingsCss = readFileSync('src/preload/figma-settings.css', 'utf8')
const menuCss = readFileSync('src/preload/figma-refinements.css', 'utf8')

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  async function fixture(check: (style: (selector: string) => CSSStyleDeclaration) => void) {
    const win = new Window(), doc = win.document
    doc.head.innerHTML = `<style>:root{--dsw-alias-label-primary:${dark ? '#f9fafb' : '#0f1115'};--odyssey-text:${dark ? '#e5e5e5' : '#252525'}}[role=menuitem]{color:var(--dsw-alias-label-primary)}${vendorCss}${settingsCss}${menuCss}</style>`
    if (dark) doc.body.setAttribute('data-ds-dark-theme', '')
    // The real provider picker wraps the first action; the custom button is its sibling.
    doc.body.innerHTML = `<div class="VOzbGW_overlay"><section class="zGbnIq_section"><span class="zGbnIq_rowName">本地视觉验收</span><div class="zGbnIq_addActions"><span class="odyssey-provider-directory"><button id="add" class="zGbnIq_addButton">添加提供方</button></span><button id="custom" class="zGbnIq_addButton">添加自定义提供方</button></div></section></div><div role="menu" id="provider"><input class="odyssey-provider-search"><button role="menuitem" id="normal"><span class="odyssey-provider-option"><span>openai</span></span></button><button role="menuitem" id="disabled" disabled><span class="odyssey-provider-option"><span>本地视觉验收</span><small>已添加</small></span></button></div><div role="menu" id="other"><button role="menuitem">无关菜单</button></div>`
    try { check(selector => win.getComputedStyle(doc.querySelector(selector)!) as unknown as CSSStyleDeclaration) }
    finally { await win.happyDOM.close() }
  }
  it(`${theme}: keeps model text and default add controls on the settings palette`, async () => fixture(style => {
    expect(style('.zGbnIq_rowName').color).toBe(dark ? '#e5e5e5' : '#252525')
    expect(style('#add').color).toBe(dark ? '#e5e5e5' : '#252525')
    expect(style('#custom').backgroundColor.match(/[\d.]+/g)?.map(Number)).toEqual([255, 255, 255, dark ? 0.09 : 0.9])
  }))
  it(`${theme}: preserves the custom action width after the first action gains a menu wrapper`, async () => fixture(style => {
    expect(style('#add').minWidth).toBe('140px')
    expect(style('#custom').minWidth).toBe('174px')
    expect(style('#custom').height).toBe('28px')
    expect(style('.zGbnIq_addActions').gap).toBe('8px')
  }))
  it(`${theme}: scopes the provider search, normal, disabled and added colors to that menu`, async () => fixture(style => {
    expect(style('#normal').color).toBe(dark ? '#e6e6e6' : '#242424')
    expect(style('.odyssey-provider-search').color).toBe(dark ? '#e6e6e6' : '#242424')
    expect(style('#disabled').color).toBe(dark ? '#6b6b6b' : '#a6a6a6')
    expect(style('#disabled').opacity).toBe('1')
    expect(style('#disabled small').color).toBe(dark ? '#9c9c9c' : '#757575')
    expect(style('#other button').color).toBe(dark ? '#f9fafb' : '#0f1115')
  }))
}
