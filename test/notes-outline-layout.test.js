import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser, script, css
beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {NotesApp} from './src/preload/notes/editor';
      import {alignNotesComposer} from './src/preload/notes/layout';
      import '@blocknote/mantine/style.css'; import './src/preload/notes/style.css';
      window.noteRequests=[];
      const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});return method==='load'?{saved:{title:'浮层位置验收',blocks:[],yjs:'',revision:0,updatedAt:0}}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:method==='generate'?{kind:'text',markdown:'改写后的验收句子。'}:{}},draft:async()=>{}};
      const root=document.querySelector('.en-editor-host');
      createRoot(root).render(<NotesApp sessionId="outline-test" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);
      const surface=document.querySelector('.en-root'),composer=document.querySelector('.en-native-composer-host');
      const align=()=>alignNotesComposer(surface,composer);new ResizeObserver(align).observe(surface);new MutationObserver(align).observe(root,{subtree:true,childList:true});
      document.addEventListener('sherlock:notes-composer-draft',e=>{const input=document.querySelector('#native-input');input.value=e.detail.text;if(e.detail.focus)input.focus({preventScroll:true})});
      document.querySelector('#native-command').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-command',{detail:{sessionId:'outline-test'}}));
      document.querySelector('#native-send').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'outline-test',prompt:document.querySelector('#native-input').value,images:[]}}));
    ` },
    bundle: true, platform: 'browser', conditions: ['browser', 'import', 'style'], format: 'iife', write: false, outfile: 'fixture.js',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
    plugins: [{ name: 'notes-inline-svg', setup(b) {
      b.onResolve({ filter: /\.svg\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -7)), namespace: 'svg' }))
      b.onLoad({ filter: /.*/, namespace: 'svg' }, async a => ({ contents: 'export default ' + JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(await readFile(a.path)).toString('base64')), loader: 'js' }))
    } }]
  })
  script = output.outputFiles.find(f => f.path.endsWith('.js')).text
  css = output.outputFiles.find(f => f.path.endsWith('.css')).text
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })

for (const dark of [false, true]) for (const width of [1380, 900]) it(`outline floats without moving the real editor or native composer (${dark ? 'dark' : 'light'}, ${width})`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage()
  try {
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.route('http://127.0.0.1/notes-outline-fixture', route => route.fulfill({ contentType: 'text/html', body: `<body ${dark ? 'data-ds-dark-theme' : ''}><section class="en-root" data-dark="${dark}" style="left:10px"><div class="en-editor-host"></div><div class="en-native-composer-host sRp_composer" style="height:138px"><textarea id="native-input" aria-label="原生输入框测试接口"></textarea><button id="native-command">命令测试接口</button><button id="native-send">发送测试接口</button></div></section></body>` }))
    await page.goto('http://127.0.0.1/notes-outline-fixture')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    try { await page.locator('.en-title').waitFor({ timeout: 2000 }) } catch (e) { throw Error(errors.join('\n') || e.message) }
    // Paste into the actual BlockNote view to exercise live outline updates.
    await page.evaluate(() => { const node = document.querySelector('.bn-editor'), data = new DataTransfer(); data.setData('text/html', '<h2>本周观察</h2><p>目录展开时正文保持原位。</p><h3>下一步</h3><p>输入框保持原位。</p>'); node.focus(); node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })) })
    await page.getByText('目录展开时正文保持原位。', { exact: true }).waitFor()
    const geometry = () => page.evaluate(() => ['.en-title', '.bn-editor', '.en-native-composer-host'].map(selector => { const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height } }))
    const before = await geometry()
    expect(before[2].x).toBe(before[0].x); expect(before[2].width).toBe(before[0].width)
    expect(await page.locator('.en-document-scroll').evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '文档目录' }).isVisible()).toBe(true)
    expect(await geometry()).toEqual(before)
    expect(await page.getByRole('button', { name: '本周观察', exact: true }).count()).toBe(1)
    await page.getByRole('button', { name: '关闭目录', exact: true }).click()
    expect(await geometry()).toEqual(before)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.keyboard.press('Escape')
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: '展开目录', exact: true }).evaluate(el => el === document.activeElement)).toBe(true)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.locator('.en-title').click()
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    expect(await page.locator('.en-title').evaluate(el => el === document.activeElement)).toBe(true)
    expect(await geometry()).toEqual(before)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    await page.locator('#native-command').click()
    await expect.poll(()=>page.locator('.bn-suggestion-menu').isVisible()).toBe(true)
    await page.keyboard.press('Escape')
    await page.evaluate(()=>{const paragraph=[...document.querySelectorAll('.en-document .bn-inline-content')].find(el=>el.textContent==='目录展开时正文保持原位。');document.querySelector('.en-document .bn-editor').focus();const range=document.createRange();range.selectNodeContents(paragraph);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));paragraph.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})
    await page.getByRole('button',{name:/AI 改写/}).click()
    expect(await page.locator('.en-ai-selection').allTextContents()).toEqual(['目录展开时正文保持原位。'])
    expect(await page.locator('#native-input').evaluate(el=>el===document.activeElement)).toBe(true)
    await page.locator('#native-send').click()
    await page.getByRole('button',{name:'替换所选',exact:true}).click()
    await expect.poll(()=>page.locator('.en-document .bn-editor').textContent()).toContain('改写后的验收句子。')
    expect(await page.locator('.en-document .bn-editor').textContent()).not.toContain('目录展开时正文保持原位。')
    expect(await page.locator('.en-ai-selection').count()).toBe(0)
    expect(await page.evaluate(()=>window.noteRequests.find(r=>r.method==='generate').input.selection)).toBe('目录展开时正文保持原位。')
    expect(errors).toEqual([])
  } finally { await context.close() }
})
