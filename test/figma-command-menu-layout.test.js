import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { Fragment } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it } from 'vitest'

const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js', 'utf8')
const baseCss = JSON.parse(source.match(/const css = ("[^\n]+");/)[1])
const shell = readFileSync('src/preload/shell-style.ts', 'utf8')
const imports = [...shell.matchAll(/import (\w+) from '(\.\/[^']+\.css)\?raw'/g)]
const css = shell.match(/style\.textContent = ([^\n]+)/)[1].split('+').map(name => name.trim() === 'desktopShellStyles' ? '' : readFileSync('src/preload/' + imports.find(m => m[1] === name.trim())[2].slice(2), 'utf8')).join('\n')
const fn = name => { const start = source.indexOf(`\t\tfunction ${name}(`); if (start < 0) throw Error('Missing native ' + name); return source.slice(start, source.indexOf('\n\t\t}', start) + '\n\t\t}'.length) }
const translations = runInNewContext(source.slice(source.indexOf('const zh = {'), source.indexOf('\n\t\t};', source.indexOf('const zh = {')) + 6) + '\nzh')
function menuHtml({ group = 'command', count = 7, active = 0, maxHeight = 320, groups, highlight } = {}) {
  const names = ['compact', 'export', 'feedback', 'goal', 'permission', 'plan', 'model']
  const state = { open: true, groups: groups ?? [{ source: group, status: 'ready', items: names.slice(0, count).map(name => ({ name, description: 'Description' })) }], highlight: highlight ?? { source: group, index: active } }
  const MenuView = runInNewContext(fn('optionId') + '\n' + fn('MenuView') + '\nMenuView', {
    react: { Fragment, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useRef: () => ({ current: null }), useEffect() {} },
    react_jsx_runtime: jsxRuntime, MAX_HEIGHT: 320,
    _deepseek_ai_dsh_client_ui_primitives: { useAnchoredMaxHeight: () => maxHeight },
    MenuView_module_css_default: new Proxy({}, { get: (_target, key) => '_3e4SsG_' + String(key) }), clsx: (...values) => values.filter(Boolean).join(' ')
  })
  return renderToStaticMarkup(MenuView({ menu: { subscribe() {}, getSnapshot: () => state }, onPick() {}, onDismiss() {}, t: key => translations[key] ?? key }))
}
let browser
beforeAll(async () => {
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
async function open(dark = false, options = {}) {
  const page = await browser.newPage({ viewport: { width: options.narrow ? 320 : 1380, height: 640 } })
  await page.route('**/*', r => r.abort())
  await page.setContent(`<style>${baseCss}\n${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}><main class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"><div data-composer-card style="position:fixed;left:16px;top:400px;width:780px;height:126px">${menuHtml(options)}</div></div></main></body>`)
  return page
}
for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} native main command menu matches the 360×320 dedicated menu`, async () => {
  const page = await open(dark)
  try {
    const m = await page.locator('._3e4SsG_menu').evaluate(menu => {
      const r = menu.getBoundingClientRect(), title = menu.querySelector('._3e4SsG_groupTitle'), tr = title.getBoundingClientRect()
      return { width: r.width, height: r.height, radius: getComputedStyle(menu).borderRadius, padding: getComputedStyle(menu).padding,
        anchor: document.querySelector('[data-composer-card]').getBoundingClientRect().top - r.bottom,
        title: { height: tr.height, x: tr.left - r.left, y: tr.top - r.top, font: getComputedStyle(title).fontSize, line: getComputedStyle(title).lineHeight, color: getComputedStyle(title).color },
        activeId: menu.getAttribute('aria-activedescendant'), rows: [...menu.querySelectorAll('[role=option]')].map(row => {
          const rect = row.getBoundingClientRect(), name = row.querySelector('._3e4SsG_itemName'), description = row.querySelector('._3e4SsG_itemDescription')
          return { width: rect.width, height: rect.height, x: rect.left - r.left, y: rect.top - r.top, radius: getComputedStyle(row).borderRadius,
            bg: getComputedStyle(row).backgroundColor, name: [getComputedStyle(name).fontSize, getComputedStyle(name).lineHeight, getComputedStyle(name).color],
            desc: [getComputedStyle(description).fontSize, getComputedStyle(description).lineHeight, getComputedStyle(description).color],
            gap: description.getBoundingClientRect().left - name.getBoundingClientRect().right, nowrap: getComputedStyle(description).whiteSpace }
        }) }
    })
    expect(m).toMatchObject({ width: 360, height: 320, radius: '12px', padding: '4px', anchor: 4, activeId: 'dsh-slash-option-command-0' })
    expect(m.title).toEqual({ height: 32, x: 4, y: 4, font: '12px', line: '16px', color: dark ? 'rgb(153, 153, 153)' : 'rgb(122, 122, 122)' })
    expect(m.rows).toHaveLength(7)
    m.rows.forEach((row, i) => {
      expect(row).toMatchObject({ width: 352, height: 40, x: 4, y: 36 + i * 40, radius: '10px', gap: 8, nowrap: 'nowrap',
        name: ['14px', '22px', dark ? 'rgb(230, 230, 230)' : 'rgb(36, 36, 36)'], desc: ['14px', '22px', dark ? 'rgb(153, 153, 153)' : 'rgb(122, 122, 122)'] })
    })
    expect(m.rows[0].bg).toBe(dark ? 'rgb(55, 55, 55)' : 'rgb(240, 240, 240)')
    await page.locator('[role=option]').nth(2).hover()
    expect(await page.locator('[role=option]').nth(2).evaluate(el => getComputedStyle(el).backgroundColor)).toBe(dark ? 'rgb(55, 55, 55)' : 'rgb(240, 240, 240)')
  } finally { await page.close() }
})
it('keeps native limited-height scrolling, narrow clamp and a filtered catalog height', async () => {
  const page = await open(false, { maxHeight: 180, narrow: true })
  try {
    expect(await page.locator('._3e4SsG_menu').evaluate(el => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([288, 180])
    const viewport = page.locator('._3e4SsG_viewport')
    await viewport.evaluate(el => { el.scrollTop = el.scrollHeight })
    expect(await viewport.evaluate(el => el.scrollTop > 0 && el.scrollTop + el.clientHeight === el.scrollHeight)).toBe(true)
    await page.locator('[data-composer-card]').evaluate((el, html) => { el.innerHTML = html }, menuHtml({ count: 2, active: 1 }))
    expect(await page.locator('._3e4SsG_menu').evaluate(el => [el.getBoundingClientRect().height, el.getAttribute('aria-activedescendant')])).toEqual([120, 'dsh-slash-option-command-1'])
  } finally { await page.close() }
})
it('does not restyle other trigger groups, right-side menus or child composer menus', async () => {
  const page = await open()
  try {
    for (const group of ['file', 'skill', 'subagent']) {
      await page.locator('[data-composer-card]').evaluate((el, html) => { el.innerHTML = html }, menuHtml({ group }))
      expect(await page.locator('._3e4SsG_item').first().evaluate(el => getComputedStyle(el).height)).toBe('32px')
    }
    await page.locator('[data-composer-card]').evaluate((el, html) => { el.innerHTML = html }, menuHtml())
    for (const scope of ['aside', 'child']) {
      await page.evaluate(scope => { const card = document.querySelector('[data-composer-card]'); if (scope === 'aside') document.body.append(card); else { document.querySelector('main .wSkVaW_root').append(card); card.setAttribute('data-odyssey-subagent-panel', '') } }, scope)
      expect(await page.locator('._3e4SsG_item').first().evaluate(el => getComputedStyle(el).height)).toBe('32px')
    }
  } finally { await page.close() }
})

for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} mixed catalogs keep command styling and each other group's own rows`, async () => {
  const command = { source: 'command', status: 'ready', items: [{ name: 'compact', description: 'Compact history' }] }
  const skill = { source: 'skill', status: 'ready', items: [{ name: 'review', description: 'Review changes' }] }
  const page = await open(dark, { groups: [command, skill], highlight: { source: 'skill', index: 0 } })
  try {
    const rowStyles = async (source) => page.locator(`[id="dsh-slash-option-${source}-0"]`).evaluate(el => {
      const name = el.querySelector('._3e4SsG_itemName'), desc = el.querySelector('._3e4SsG_itemDescription')
      return { height: el.getBoundingClientRect().height, radius: getComputedStyle(el).borderRadius, background: getComputedStyle(el).backgroundColor,
        name: [getComputedStyle(name).fontSize, getComputedStyle(name).lineHeight, getComputedStyle(name).color],
        desc: [getComputedStyle(desc).fontSize, getComputedStyle(desc).lineHeight, getComputedStyle(desc).color] }
    })
    for (const groups of [[command, skill], [skill, command]]) {
      await page.locator('[data-composer-card]').evaluate((el, html) => { el.innerHTML = html }, menuHtml({ groups, highlight: { source: 'skill', index: 0 } }))
      expect(await page.locator('._3e4SsG_menu').evaluate(el => [el.getBoundingClientRect().width, getComputedStyle(el).borderRadius, el.getAttribute('aria-activedescendant')])).toEqual([360, '12px', 'dsh-slash-option-skill-0'])
      expect(await rowStyles('command')).toMatchObject({ height: 40, radius: '10px', name: ['14px', '22px', dark ? 'rgb(230, 230, 230)' : 'rgb(36, 36, 36)'], desc: ['14px', '22px', dark ? 'rgb(153, 153, 153)' : 'rgb(122, 122, 122)'] })
      expect(await rowStyles('skill')).toMatchObject({ height: 32, radius: '6px', background: dark ? 'rgb(51, 52, 56)' : 'rgb(241, 241, 243)' })
      expect((await rowStyles('skill')).name.slice(0, 2)).toEqual(['13px', '20px'])
      expect((await rowStyles('skill')).desc).toEqual(['12px', '20px', dark ? 'rgb(151, 155, 162)' : 'rgb(125, 130, 138)'])
      const title = source => page.locator(`._3e4SsG_groupTitle[data-source=${source}]`).evaluate(el => [el.getBoundingClientRect().height, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight, getComputedStyle(el).color])
      expect(await title('command')).toEqual([32, '12px', '16px', dark ? 'rgb(153, 153, 153)' : 'rgb(122, 122, 122)'])
      expect(await title('skill')).toEqual([26, '11px', '18px', dark ? 'rgb(151, 155, 162)' : 'rgb(125, 130, 138)'])
      await page.locator('#dsh-slash-option-command-0').hover()
      expect((await rowStyles('command')).background).toBe(dark ? 'rgb(55, 55, 55)' : 'rgb(240, 240, 240)')
    }
  } finally { await page.close() }
})
