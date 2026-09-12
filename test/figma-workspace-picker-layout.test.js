import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'

const read = path => readFileSync(path, 'utf8')
const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
const frontend = readdirSync(assets).filter(n => /^index-.*\.css$/.test(n)).map(n => read(`${assets}/${n}`)).join('\n')
const compiled = read(`${assets}/${readdirSync(assets).find(n => /^index-.*\.js$/.test(n))}`)
const classes = Object.fromEntries([...compiled.matchAll(/"(_(\w+)_19372_\d+)"/g)].map(m => [m[2], m[1]]))
const shell = read('src/preload/shell-style.ts')
const imports = [...shell.matchAll(/import (\w+) from '(\.\/[^']+\.css)\?raw'/g)]
const css = shell.match(/style\.textContent = ([^\n]+)/)[1].split('+').map(name => name.trim() === 'desktopShellStyles' ? shell.match(/const desktopShellStyles = `([\s\S]*?)`/)[1] : read('src/preload/' + imports.find(m => m[1] === name.trim())[2].slice(2))).join('\n')
const source = read('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js')
const section = name => { const start = source.indexOf(`function ${name}(`); if (start < 0) throw Error(name); return source.slice(start, source.indexOf('\n//#endregion', start)) }
let browser, script
beforeAll(async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import {useRef,useState,useEffect,useLayoutEffect,useCallback} from 'react';
    import {jsx,jsxs} from 'react/jsx-runtime'; import {createPortal} from 'react-dom'; import {createRoot} from 'react-dom/client';
    const clsx=(...v)=>v.filter(Boolean).join(' '),Menu_module_css_default=${JSON.stringify(classes)};
    const IconCheckOutline16=props=>jsx('svg',{...props,width:16,height:16});
    ${section('usePointerGrace')}
    ${section('isSeparator')}
    const root=createRoot(document.getElementById('fixture'));
    window.picks=[]; window.workspaceCloseCount=0;
    window.show=(count=3,workspace=true,busy=false)=>root.render(jsx(Menu,{open:true,portal:true,
      anchor:jsx('button',{children:'Workspace'}),getAnchorRect:()=>({left:435,right:535,top:383,bottom:411}),
      items:[...(workspace?[{type:'label',id:'search',text:jsx('input',{className:'odyssey-workspace-search',placeholder:'搜索工作区…','aria-label':'搜索工作区…'})}]:[]),
        ...(count?Array.from({length:count},(_,i)=>({id:String(i),label:['文件与面板验收 (1)','私有组件验收','验收工作区'][i]??'Workspace '+i,disabled:busy})):[{type:'label',id:'empty',text:'没有匹配的工作区'}])],
      selectedId:'0',footer:[{id:'add',label:'添加工作区…',icon:jsx('svg',{width:16,height:16}),disabled:busy}],
      onSelect:id=>window.picks.push(id),onClose:()=>window.workspaceCloseCount++}));
  ` }, bundle: true, platform: 'browser', format: 'iife', write: false })
  script = bundle.outputFiles[0].text
  const mod = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (mod.default ?? mod).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
async function open(dark = false) {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  await page.route('**/*', r => r.abort())
  await page.setContent(`<style>${frontend}\n${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}><div id="fixture"></div></body>`)
  await page.addScriptTag({ content: script }); await page.evaluate(() => window.show())
  await page.locator('body>[role=menu]').waitFor({ state: 'visible' }); return page
}
async function measure(page) {
  return page.locator('body>[role=menu]').evaluate(menu => {
    const r = menu.getBoundingClientRect(), rect = el => { const b = el.getBoundingClientRect(); return [b.x-r.x,b.y-r.y,b.width,b.height] }, style = el => { const s=getComputedStyle(el);return [s.color,s.fontSize,s.lineHeight,s.fontWeight] }
    const input=menu.querySelector('input'),footer=menu.querySelector('[class*=_footer_]'),s=getComputedStyle(footer,'::before')
    return { size:[r.width,r.height], search:input && rect(input),placeholder:input && getComputedStyle(input,'::placeholder').color,
      rows:[...menu.querySelectorAll('[role=menuitem]')].map(row=>({rect:rect(row),label:rect(row.querySelector('[class*=_itemLabel_]')),style:style(row.querySelector('[class*=_itemLabel_]'))})),
      check:rect(menu.querySelector('[class*=_check_]')),checkColor:getComputedStyle(menu.querySelector('[class*=_check_]')).color,
      footer:rect(footer),line:[s.content,s.left,s.top,s.height,s.backgroundColor],icon:getComputedStyle(footer.querySelector('[class*=_itemIcon_]')).display }
  })
}
for (const dark of [false,true]) it(`${dark?'dark':'light'} real Menu portal/footer matches workspace picker rows and separator`, async () => {
  const page=await open(dark)
  try {
    const m=await measure(page), ink=dark?'rgb(230, 230, 230)':'rgb(36, 36, 36)'
    expect(m.size).toEqual([280,201]); expect(m.search).toEqual([6,6,268,36]); expect(m.placeholder).toBe(ink)
    expect(m.rows.map(r=>r.rect)).toEqual([[6,44,268,34],[6,80,268,34],[6,116,268,34],[6,161,268,34]])
    m.rows.forEach((r,i)=>{expect(r.label.slice(0,2)).toEqual([16,r.rect[1]+7]); expect(r.style).toEqual([ink,'13px','20px',i===0?'500':'400'])})
    expect(await page.locator('[role=menuitem]').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(55, 55, 55)':'rgb(240, 240, 240)');
    expect(m.check).toEqual([248,54,14,14]); expect(m.checkColor).toBe(dark?'rgb(231, 231, 233)':'rgb(41, 43, 47)')
    expect(m.footer).toEqual([6,156,268,39]); expect(m.line).toEqual(['""','6px','0px','1px',dark?'rgb(66, 66, 66)':'rgb(227, 227, 227)']); expect(m.icon).toBe('none')
    await page.getByRole('menuitem',{name:'添加工作区…'}).focus(); await page.keyboard.press('Enter'); expect(await page.evaluate(()=>window.picks)).toEqual(['add'])
    await page.keyboard.press('Escape'); expect(await page.evaluate(()=>window.workspaceCloseCount)).toBe(1)
  } finally {await page.close()}
})
it('keeps filtered/empty heights natural, pinned add reachable and other menu families unchanged',async()=>{
  const page=await open()
  try {
    for(const [count,height] of [[1,129],[0,127],[3,201]]) {
      await page.evaluate(count=>window.show(count),count)
      await expect.poll(()=>page.locator('[role=menu]').evaluate(el=>el.getBoundingClientRect().height)).toBe(height)
    }
    await page.evaluate(()=>window.show(30)); await expect.poll(()=>page.locator('[role=menuitem]').count()).toBe(31); await page.setViewportSize({width:1380,height:640})
    const viewport=page.locator('[class*=_viewport_]');
    await expect.poll(()=>viewport.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop>0 && Math.abs(el.scrollTop+el.clientHeight-el.scrollHeight)<1})).toBe(true)
    await page.getByRole('menuitem',{name:'添加工作区…'}).click(); expect(await page.evaluate(()=>window.picks)).toEqual(['add'])
    await page.evaluate(()=>window.show(3,true,true)); await expect.poll(()=>page.getByRole('menuitem',{name:'添加工作区…'}).isDisabled()).toBe(true);
    await page.getByRole('menuitem',{name:'添加工作区…'}).dispatchEvent('click'); expect(await page.evaluate(()=>window.picks)).toEqual(['add']);
    await page.evaluate(()=>window.show(3,false)); await expect.poll(()=>page.locator('input').count()).toBe(0)
    expect(await page.locator('[class*=_footer_] [class*=_itemIcon_]').evaluate(el=>getComputedStyle(el).display)).not.toBe('none')
    expect(await page.locator('[role=menuitem]').first().evaluate(el=>[el.getBoundingClientRect().height,getComputedStyle(el.querySelector('span')).fontWeight,getComputedStyle(el.querySelector('span')).color])).toEqual([32,'400','rgb(15, 17, 21)'])
  } finally {await page.close()}
})
