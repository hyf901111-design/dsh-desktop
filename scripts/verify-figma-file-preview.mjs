// Production Research frame/readers with controlled local documents and bridge replies.
// No application build, real attachment authorization, account, or external request.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { patchFigmaFilePreview } from './lib/figma-file-preview-client.mjs'

const electronReader = process.argv.includes('--electron-reader')
const crossOriginReader = process.argv.includes('--cross-origin-reader') || electronReader
const interactionOnly = process.argv.includes('--interaction-only') || crossOriginReader
const root = process.cwd(), out = join(root, 'output/figma-file-preview-20260910', ...(electronReader ? ['reader-electron-focus'] : crossOriginReader ? ['reader-cross-origin-focus'] : interactionOnly ? ['reader-interaction'] : []))
const clientSource = patchFigmaFilePreview(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
const entry = String.raw`
import React from 'react';import {MarkdownText} from '@deepseek-ai/dsh-client-ui-primitives';import * as jsx from 'react/jsx-runtime';import * as reactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
function fake(){let value;value=new Proxy(function(){},{get:()=>value,apply:()=>value,construct:()=>({})});return value}
const root=createRoot(document.getElementById('host'));let client,current;
window.requests=[];window.submitted=[];window.dshDesktop={researchPreview:{restore:async request=>{window.requests.push(request);await new Promise(resolve=>setTimeout(resolve,current.delay??80));return current.fail?null:{authorizationId:request.authorizationId,capabilityToken:'local-fixture',url:(current.format==='html'&&window.crossOriginReader?location.origin.replace('127.0.0.1','reader.localhost'):location.origin)+'/document/'+current.format}},release:()=>{}},researchLinkFrame:{authorize:async request=>{window.requests.push(request);await new Promise(resolve=>setTimeout(resolve,current.delay??80));return current.fail?null:{url:request.url,frameName:'sherlock-research-link-'+('a'.repeat(32))}},release:()=>{},inspect:async()=>({scrollWidth:1800,clientWidth:320})}};
function render(){root.render(React.createElement(current.node.kind?client.ResearchCanvasArtifactCard:client.ResearchCanvasFileCard,{key:current.node.id,node:current.node,sessionId:'file-visual-qa',visible:true,onNaturalSize:(w,h)=>{const next=client.researchPdfGeometryForPage(current.node,w,h);if(next){current.node={...current.node,...next};render()}},onSubmitContainer:(node,prompt)=>window.submitted.push({id:node.id,prompt}),onSetContainerRefresh:(node,minutes)=>{current.node={...current.node,refreshMinutes:minutes};render()},onFrameAction:()=>{}}))}
window.showFile=(format,options={})=>{const id='local-'+Date.now()+'-'+Math.random();const isWeb=format==='web';current={format,fail:!!options.fail,delay:options.delay,node:{id,name:'指数研究报告.'+format,displayName:'指数研究报告',source:'computer',authorizationId:'local-fixture-authorization',contentType:format==='txt'?'text/plain':format==='md'?'text/markdown':format==='pdf'?'application/pdf':format==='html'?'text/html':'application/octet-stream',x:350,y:260,...(isWeb?{kind:'web-link',messageId:id,title:'市场概览与成交结构分析',url:location.origin+'/document/web',excerpt:'近期走势与成交结构。关注核心指标、历史变化和数据明细。',width:656,height:220}:{}),...options.node}};render();return id};
window.__ModuleLoader__={load:descriptor=>{client=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?reactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?{MarkdownText}:fake());window.showFile('pdf')}};
`
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, outdir: 'output/figma-file-preview-harness', loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' } })
function samplePdf() {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>']
  for (let page = 0; page < 3; page++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4 + page * 2} 0 R >>`)
    const stream = `BT /F1 14 Tf 30 380 Td (Research report - page ${page + 1}) Tj 0 -30 Td /F1 12 Tf (Original PDF document content.) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let pdf = '%PDF-1.4\n', offsets = [0]
  for (let i = 1; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
}
const paragraph = '保留原始文件正文与现有阅读交互，不将完整内容缩小到卡片尺寸。'
const webDocument = `<!doctype html><meta charset="utf-8"><style>body{margin:24px;background:white;color:#222;font:17px/28px sans-serif}p{max-width:1000px}input,button{font:inherit}</style><h1>原始完整网页</h1><input value="原始输入"><button id="count">0</button><script src="/document/events.js"></script>${Array.from({ length: 45 }, (_, index) => `<p>${index + 1}. ${paragraph}</p>`).join('')}<p id="reader-end">END</p>`
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/harness.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text) }
    else if (path === '/harness.css') { res.setHeader('Content-Type', 'text/css'); res.end(bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '') }
    else if (path === '/client.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(clientSource) }
    else if (path === '/document/pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(samplePdf()) }
    else if (path === '/document/events.js') { res.setHeader('Content-Type', 'application/javascript'); res.end("document.getElementById('count').addEventListener('click',function(){this.textContent=Number(this.textContent)+1})") }
    else if (path === '/document/html' || path === '/document/web') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors http://127.0.0.1:*"); res.end(webDocument) }
    else if (path === '/document/txt' || path === '/document/md') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(Array.from({ length: 80 }, (_, index) => `${index + 1}. 第 ${index + 1} 条：${paragraph}`).join('\n')) }
    else if (path.startsWith('/sherlock-pdfjs/') && !path.includes('..')) { res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'); res.end(await readFile(join(root, 'node_modules/@deepseek-ai/dsh-web-frontend/dist', path))) }
    else if (path === '/fonts/NotoSansSC.woff2') { res.setHeader('Content-Type', 'font/woff2'); res.end(await readFile(join(root, 'build/fonts/NotoSansSC.woff2'))) }
    else if (path === '/') res.end(`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:'Noto Sans SC';src:url('/fonts/NotoSansSC.woff2');font-weight:100 900}body{margin:0;background:#eee}body[data-ds-dark-theme]{background:#242424}#host{height:900px;position:relative}</style><link rel="stylesheet" href="/harness.css"><main id="host"></main><script>window.crossOriginReader=${crossOriginReader}</script><script src="/harness.js"></script><script src="/client.js"></script>`)
    else { res.statusCode = 404; res.end() }
  } catch (error) { res.statusCode = 500; res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
await mkdir(out, { recursive: true })
let browser, page
if (electronReader) {
  const bootstrap = join(out, 'electron-reader-harness.cjs')
  await writeFile(bootstrap, `const {app,BrowserWindow}=require('electron');const path=require('node:path');app.setPath('userData',path.join(require('node:os').tmpdir(),'odyssey-reader-qa-'+process.pid));app.commandLine.appendSwitch('site-per-process');app.commandLine.appendSwitch('host-resolver-rules','MAP reader.localhost 127.0.0.1');app.whenReady().then(()=>{const w=new BrowserWindow({width:1380,height:900,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadURL(process.env.EWORK_READER_TEST_URL)});app.on('window-all-closed',()=>app.quit());`)
  browser = await (playwright._electron ?? playwright.default._electron).launch({ executablePath: createRequire(import.meta.url)('electron'), args: [bootstrap], env: {...process.env,EWORK_READER_TEST_URL:`http://127.0.0.1:${server.address().port}`} })
  page = await browser.firstWindow()
} else {
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), ...(crossOriginReader ? { args: ['--site-per-process', '--host-resolver-rules=MAP reader.localhost 127.0.0.1'] } : {}) })
  page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
}
const errors = []; page.on('pageerror', error => errors.push(error.message))
const metrics = [], readers = [], fonts = []
const cdp = await page.context().newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
await mkdir(out, { recursive: true })
async function showFile(format, options = {}) {
  const id = await page.evaluate(({ format, options }) => window.showFile(format, options), { format, options })
  await page.waitForFunction(id => document.querySelector('[data-research-node-id]')?.getAttribute('data-research-node-id') === id, id)
}
async function toggleReader() {
  const card = page.locator('[data-research-file-presentation]')
  if (await card.getAttribute('open') === null) await card.hover()
  await page.locator('[data-research-container-expand]').click()
}
async function snapshot(name) {
  await page.mouse.click(0, 0)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.rScV5Q_nodeTitleActions')).opacity === '0', null, { timeout: 3000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => !document.querySelector('[data-research-file-entry]') || document.querySelector('[data-research-file-entry]')?.clientHeight > 0)
  const value = await page.locator('[data-research-file-presentation]').evaluate(element => {
    const entry = element.querySelector('[data-research-file-entry]'), title = element.querySelector('.rScV5Q_nodeTitleText'), box = element.getBoundingClientRect(), label = title.getBoundingClientRect()
    const style = getComputedStyle(element), actions = getComputedStyle(element.querySelector('.rScV5Q_nodeTitleActions'));
    return { material: { background: style.backgroundColor, borderColor: style.borderColor, radius: style.borderRadius, shadow: style.boxShadow }, actionsOpacity: actions.opacity, active: document.activeElement?.outerHTML?.slice(0, 240), hovered: element.matches(':hover'), focusWithin: element.matches(':focus-within'), open: element.open, width: box.width, height: box.height, entryClient: [entry.clientWidth, entry.clientHeight], entryScroll: [entry.scrollWidth, entry.scrollHeight], title: { x: label.x - box.x, y: label.y - box.y, font: getComputedStyle(title).font }, text: entry.innerText, visibleReaders: [...element.querySelectorAll('iframe,[data-research-pdf-scroll],[data-research-text-preview]')].filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden').length }
  })
  assert.deepEqual(value.entryScroll, value.entryClient, name + ' closed entry must fit semantically')
  assert.equal(value.visibleReaders, 0)
  assert.equal(value.actionsOpacity, '0', name + ' normal entry has no persistent hover toolbar: ' + JSON.stringify(value))
  assert.equal(value.material.background, name.startsWith('light-') ? 'rgb(255, 255, 255)' : 'rgb(41, 42, 45)')
  assert.equal(value.material.radius, '12px'); assert.equal(value.material.shadow, 'none')
  assert.equal(value.title.x, 18); assert.equal(value.title.y, 16)
  if (name.endsWith('-pdf-entry')) {
    const { root } = await cdp.send('DOM.getDocument');
    for (const selector of ['.odyssey-file-kind', '.rScV5Q_nodeTitleText']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const rendered = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
      assert(rendered.some(font => font.isCustomFont && (selector.includes('kind') ? /DIN/i.test(font.familyName) : /Noto Sans SC/i.test(font.familyName))), selector + ' actual custom font');
      fonts.push({ state: name, selector, rendered });
    }
  }
  metrics.push({ name, ...value })
  await page.screenshot({ path: join(out, `${name}.png`) })
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.locator('[data-research-file-entry]').waitFor()
  if (interactionOnly) {
    const interactionMetrics = []; let focusLifecycle
    for (const format of (crossOriginReader ? ['html'] : ['html', 'pdf', 'web', 'txt', 'md'])) {
      await showFile(format); await toggleReader()
      const iframeSelector = format === 'html' ? '[data-research-html-preview]' : format === 'web' ? '[data-research-web-frame]' : null
      const scrollSelector = format === 'pdf' ? '[data-research-pdf-scroll]' : format === 'txt' ? '[data-research-text-preview]' : '[data-research-markdown-scroll]'
      if (format === 'pdf') await page.locator('[data-research-pdf-rendered-page="1"]').waitFor({ timeout: 20000 })
      const frame = iframeSelector ? page.frameLocator(iframeSelector) : null
      if (frame) await frame.locator('#reader-end').waitFor()
      else await page.locator(scrollSelector).waitFor()
      // Reproduce the real canvas ancestor that can retain modifier state when a dialog opens.
      await page.evaluate(() => { const host = document.getElementById('host'); host.classList.add('rScV5Q_root'); host.setAttribute('data-command-pressed', 'true') })
      const hit = await page.locator('[data-research-original-reader]').evaluate(reader => {
        const box = reader.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2), shield = reader.closest('[data-research-node-id]').querySelector('[data-research-preview-shield]')
        return { readerHit: reader === target || reader.contains(target), target: target?.className, shieldDisplay: getComputedStyle(shield).display, shieldPointerEvents: getComputedStyle(shield).pointerEvents, center: [box.x + box.width / 2, box.y + box.height / 2] }
      })
      assert.equal(hit.shieldDisplay, 'none'); assert.equal(hit.shieldPointerEvents, 'none'); assert.equal(hit.readerHit, true)
      if (frame) {
        await frame.locator('input').click(); await frame.locator('input').fill('关闭后保留87.5%')
        await frame.locator('#count').click(); assert.equal(await frame.locator('#count').innerText(), '1')
        if (crossOriginReader) await frame.locator('input').click()
      }
      const scrollState = async () => frame
        ? await frame.locator('html').evaluate(e => { const s = e.ownerDocument.scrollingElement; return { top: s.scrollTop, client: s.clientHeight, height: s.scrollHeight } })
        : await page.locator(scrollSelector).evaluate(e => ({ top: e.scrollTop, client: e.clientHeight, height: e.scrollHeight }))
      await page.mouse.move(...hit.center); await page.mouse.wheel(0, 100000)
      const deadline = Date.now() + 5000
      let end = await scrollState()
      while (Date.now() < deadline && end.top + end.client < end.height - 2) { await page.waitForTimeout(50); end = await scrollState() }
      assert(end.height > end.client && end.top > 0 && end.top + end.client >= end.height - 2, format + ' real wheel must reach document END: ' + JSON.stringify(end))
      if (frame) {
        const endVisible = await frame.locator('#reader-end').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
        assert.equal(endVisible, true)
      }
      await page.screenshot({ path: join(out, format + '-reader-wheel-end.png') })
      if (crossOriginReader) {
        const frameState = () => frame.locator('html').evaluate(e => ({active:e.ownerDocument.activeElement?.tagName,top:e.ownerDocument.scrollingElement.scrollTop,width:innerWidth,height:innerHeight}))
        const beforeClose = await frameState()
        await page.locator('[data-research-container-expand]').dispatchEvent('click'); await page.waitForTimeout(1800)
        const hidden = await frameState()
        const clip = await page.locator('[data-research-original-reader]').evaluate(e => ({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,inert:e.hasAttribute('inert'),ariaHidden:e.getAttribute('aria-hidden'),visibility:getComputedStyle(e).visibility,bodyClient:[e.parentElement.parentElement.clientWidth,e.parentElement.parentElement.clientHeight],bodyScroll:[e.parentElement.parentElement.scrollWidth,e.parentElement.parentElement.scrollHeight]}))
        assert.equal(clip.width, 0); assert.equal(clip.height, 0); assert.equal(clip.inert, true); assert.equal(clip.ariaHidden, 'true'); assert.equal(clip.visibility, 'hidden'); assert.deepEqual(clip.bodyScroll, clip.bodyClient)
        const {root:domRoot}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:domRoot.nodeId,selector:iframeSelector})
        const accessibility = await cdp.send('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:false})
        assert(accessibility.nodes.length > 0 && accessibility.nodes.every(node=>node.ignored), 'closed reader must stay excluded from the accessibility tree')
        assert.equal(hidden.width,beforeClose.width); assert.equal(hidden.height,beforeClose.height); assert.equal(hidden.top,beforeClose.top)
        await page.locator('[data-research-container-expand]').dispatchEvent('click'); await page.waitForTimeout(300)
        focusLifecycle={beforeClose,hidden,reopened:await scrollState(),clip,closedReaderIgnoredByAX:true,targets:(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe').map(t=>({type:t.type,url:t.url}))}
        assert(focusLifecycle.targets.some(t=>t.url.includes('reader.localhost')), 'the test must use an actual cross-site OOPIF')
        console.log(JSON.stringify(focusLifecycle))
      } else { await toggleReader(); await toggleReader() }
      const reopened = await scrollState(); assert.equal(reopened.top, end.top)
      if (crossOriginReader) await page.screenshot({ path: join(out, format + '-reader-reopened-end.png') })
      if (frame) { assert.equal(await frame.locator('input').inputValue(), '关闭后保留87.5%'); assert.equal(await frame.locator('#count').innerText(), '1') }
      interactionMetrics.push({ format, hit, end, reopened, physicalWheelReachedEnd: true, interactionPreserved: true })
      await toggleReader(); await page.evaluate(() => document.getElementById('host').removeAttribute('data-command-pressed'))
    }
    assert.deepEqual(errors, [])
    await writeFile(join(out, 'results.json'), JSON.stringify({ evidence: (electronReader ? 'isolated Electron; cross-site OOPIF' : 'controlled Chromium') + '; production frame/CSS and original readers; real pointer and wheel under retained canvas command state; local HTML uses external script under CSP excluding inline scripts', runtime:electronReader?'isolated Electron '+createRequire(import.meta.url)('electron/package.json').version:'Chromium',focusLifecycle,interactionMetrics,errors }, null, 2))
    console.log(JSON.stringify({ passed: true, output: out, readers: interactionMetrics.length, physicalWheelReachedEnd: true, errors }, null, 2))
  } else {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => theme === 'dark' ? document.body.setAttribute('data-ds-dark-theme', '') : document.body.removeAttribute('data-ds-dark-theme'), theme)
    await showFile('pdf'); await snapshot(`${theme}-pdf-entry`)
    await page.locator('[data-research-file-presentation]').hover(); await page.screenshot({ path: join(out, `${theme}-pdf-hover.png`) })
    assert.equal(await page.evaluate(() => window.requests.length), theme === 'light' ? 0 : 1)
    await toggleReader()
    await page.locator('[data-research-pdf-rendered-page="1"]').waitFor({ timeout: 20000 })
    const pdf = await page.locator('[data-research-pdf-scroll]').evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight, pages: element.querySelectorAll('[data-research-pdf-page]').length }))
    assert.equal(pdf.pages, 3); assert(pdf.scroll > pdf.client)
    await page.screenshot({ path: join(out, `${theme}-pdf-reader.png`) })
    await page.locator('[data-research-pdf-scroll]').evaluate(element => { element.scrollTop = 350 })
    const before = await page.locator('[data-research-pdf-scroll]').evaluate(element => { window.originalPdfScroll = element; return element.scrollTop })
    await toggleReader(); await toggleReader()
    assert.equal(await page.locator('[data-research-pdf-scroll]').evaluate(element => element === window.originalPdfScroll && element.scrollTop === 350), true)
    readers.push({ theme, kind: 'pdf', ...pdf, preservedScroll: before })
    await toggleReader()
  }
  for (const format of ['html', 'web', 'txt', 'md']) {
    await showFile(format); await snapshot(`dark-${format}-entry`)
    await toggleReader()
    if (format === 'html' || format === 'web') {
      const selector = format === 'web' ? '[data-research-web-frame]' : '[data-research-html-preview]'
      await page.locator(selector).waitFor()
      const frame = page.frameLocator(selector)
      await frame.locator('#count').click(); await frame.locator('input').fill('保留的阅读交互')
      assert.equal(await frame.locator('body').evaluate(element => getComputedStyle(element).fontSize), '17px')
      assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).transform), 'none')
      const sourceUrl = await page.locator(selector).getAttribute('src')
      await page.screenshot({ path: join(out, `dark-${format}-reader.png`) })
      await toggleReader(); await toggleReader()
      assert.equal(await frame.locator('#count').innerText(), '1'); assert.equal(await frame.locator('input').inputValue(), '保留的阅读交互')
      readers.push({ kind: format, sourceUrl, fontSize: '17px', transform: 'none', preservedInteraction: true })
    } else {
      const selector = format === 'txt' ? '[data-research-text-preview]' : '[data-research-markdown-scroll]'
      await page.locator(selector).waitFor()
      const text = await page.locator(selector).evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight, fullText: element.textContent.includes('第 80 条') }))
      assert(text.scroll > text.client); assert(text.fullText)
      await page.screenshot({ path: join(out, `dark-${format}-reader.png`) }); readers.push({ kind: format, ...text })
    }
    await toggleReader(); await snapshot(`dark-${format}-returned`)
  }
  const generated = { kind: 'generated-container', generationStatus: 'completed', refreshMinutes: 0, containerPrompt: '原始网页需求', width: 656, height: 456, containerSpec: { version: 1, type: 'web', title: '市场概览', url: page.url() + 'document/web' } }
  await showFile('web', { node: generated }); await snapshot('dark-generated-web-entry')
  await page.locator('[data-research-file-presentation]').hover(); await page.locator('[data-research-container-more]').click(); await page.locator('[data-research-container-edit]').click()
  await page.locator('[data-research-container-prompt]').fill('实际修改后的网页需求')
  assert.equal(await page.locator('[data-research-file-presentation]').getAttribute('open'), '')
  await page.waitForFunction(() => [...document.querySelectorAll('.rScV5Q_containerMenuPopup')].every(node => getComputedStyle(node).opacity === '0'))
  await page.frameLocator('[data-research-web-frame]').locator('#count').waitFor()
  await page.screenshot({ path: join(out, 'dark-generated-web-edit-reader.png') })
  await page.locator('[data-research-container-submit]').click()
  assert.equal(await page.evaluate(() => window.submitted.at(-1)?.prompt), '实际修改后的网页需求')
  await toggleReader(); await snapshot('dark-generated-web-returned')
  await showFile('web', { node: { ...generated, generationStatus: 'running', width: 656, height: 220 } }); await snapshot('dark-generated-web-refreshing')
  assert((await page.locator('[data-research-file-entry]').innerText()).includes('正在刷新'))
  await showFile('web', { node: { ...generated, width: 320, height: 220, refreshError: '真实刷新失败，保留上次结果。'.repeat(35) } }); await snapshot('dark-generated-web-refresh-error')
  assert((await page.locator('[data-research-file-entry]').innerText()).includes('真实刷新失败'))
  await showFile('txt', { node: { width: 220, height: 100, sizeMode: 'manual', excerpt: '长摘要'.repeat(300) } }); await snapshot('dark-manual-small-summary')
  await showFile('web', { node: { excerpt: '真实网页长摘要。'.repeat(300), url: page.url() + 'document/web?' + 'long-source='.repeat(40) } }); await snapshot('dark-long-web-summary')
  await showFile('pdf', { fail: true, delay: 700 }); await toggleReader(); await page.locator('[data-research-preview-loading]').waitFor(); await page.screenshot({ path: join(out, 'dark-pdf-loading-reader.png') }); await page.locator('[data-research-pdf-error]').waitFor(); await page.screenshot({ path: join(out, 'dark-pdf-unavailable-reader.png') }); await toggleReader(); await snapshot('dark-pdf-unavailable-entry')
  assert.deepEqual(errors, [])
  await writeFile(join(out, 'results.json'), JSON.stringify({ evidence: 'controlled Chromium; production file/web frames and original PDF.js/HTML/web/text readers; Office adapter covered separately by focused identity tests', metrics, readers, fonts, generatedWeb: { editingSubmitted: true, closedRefreshAndErrorVisible: true, automaticRefresh: 'original controller verified in focused tests' }, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, output: out, closedStates: metrics.length, readers, errors }, null, 2))
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
