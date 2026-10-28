import {afterAll, beforeAll, expect, it} from 'vitest'
import {dirname, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {build, type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'

const root = resolve('.')
const entry = '\0notes-production-runtime-fixture'
const peerRoot = mkdtempSync(resolve(tmpdir(), 'notes-react-peer-'))
let browser: any, script = '', owners: string[] = []
const evidence = process.env.SHERLOCK_NOTES_RUNTIME_EVIDENCE
const source = `
import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};
import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
window.notesCalls=[];
const bridge={request:async(method,input)=>{
 window.notesCalls.push({method,input});
 if(method==='load')return{owner:'fixture-owner',saved:window.noteSaved};
 if(method==='save'){window.noteSaved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.noteSaved};}
 if(method==='library-list')return[];
 return{};
},draft:async input=>{window.noteDraft=input}};
const host=new WorkspaceSurfaceHost(document);
let mounted=mountNotes(document,bridge,host);
window.notesFixture={flush:()=>mounted.flushCurrent(),reopen:()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)}};
`

beforeAll(async () => {
  // A reused dependency can own a second physical React even with a flat npm
  // install in this checkout. Keep that regression reproducible on clean CI.
  mkdirSync(resolve(peerRoot, 'node_modules'), {recursive: true})
  cpSync(dirname(createRequire(import.meta.url).resolve('react/package.json')), resolve(peerRoot, 'node_modules/react'), {recursive: true})
  const peer = resolve(peerRoot, 'peer.mjs')
  writeFileSync(peer, "import React from 'react'; export default React;\n")
  const config = (await resolveConfig({configFile: resolve('electron.vite.config.ts'), logLevel: 'silent'}, 'build', 'production')).config!.preload!
  const probe: Plugin = {
    name: 'notes-production-runtime-fixture',
    resolveId(id) { if (id === entry) return entry },
    load(id) { if (id === entry) return source + `\nimport peerReact from ${JSON.stringify(peer)}; window.notesPeerReact=peerReact;` },
    generateBundle(_options, bundle) {
      owners = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk'
        ? Object.keys(chunk.modules).filter(id => /\/react\/cjs\/react\.production\.min\.js$/u.test(id)) : []))]
    }
  }
  const output = await build({...config, root, configFile: false,
    plugins: [...(config.plugins || []), probe],
    build: {...config.build, write: false, rollupOptions: {...config.build?.rollupOptions, input: entry}}
  })
  const chunks = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : [])
  script = chunks.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  if (evidence) writeFileSync(resolve(evidence, 'react-module-owners.json'), JSON.stringify({root, owners}, null, 2))
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const {chromium} = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
}, 90000)
afterAll(async () => { await browser?.close(); rmSync(peerRoot, {recursive: true, force: true}) })

const cases = [
  {name: 'blank', title: '', blocks: []},
  {name: 'default', title: '', blocks: [{id: 'empty', type: 'paragraph'}]},
  {name: 'existing', title: '已有研究笔记', blocks: [{id: 'existing', type: 'paragraph', content: '用户保存的研究正文。'}]}
]

it.each(cases)('mounts, edits, saves and reopens $name notes through the production preload bundle', async initial => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}})
  const page = await context.newPage(), errors: string[] = []
  page.on('pageerror', (error: Error) => errors.push(error.message))
  page.setDefaultTimeout(5000)
  try {
    await page.route('http://127.0.0.1/notes-runtime', (route: any) => route.fulfill({contentType: 'text/html', body:
      '<!doctype html><html data-odyssey-locale="zh"><title>Notes production preload fixture</title><body><header data-ework-notes-session="bundled-note"></header><div data-ework-note-view="bundled-note"></div></body></html>'}))
    await page.goto('http://127.0.0.1/notes-runtime')
    await page.evaluate((value: any) => { (window as any).noteSaved = {...value, yjs: '', revision: 0} }, initial)
    // Execute the CJS output from the same Vite configuration, browser conditions,
    // custom-elements guard and sandbox wrapper used by the shipped preload.
    await page.addScriptTag({content: `var exports={};\n${script}`})
    await expect.poll(async () => errors.length || await page.locator('.en-title').count()).toBeGreaterThan(0)
    if (evidence) writeFileSync(resolve(evidence, `${initial.name}-errors.json`), JSON.stringify({owners, errors}, null, 2))
    expect(errors, JSON.stringify({owners, errors})).toEqual([])
    expect(owners, 'one React dispatcher must own every bundled hook').toHaveLength(1)
    await page.locator('.bn-editor').waitFor()
    expect(await page.locator('.en-title').inputValue()).toBe(initial.title)
    // Existing collaborative notes carry a saved Yjs document. Create that
    // snapshot through the actual editor instead of inventing an invalid blob.
    if (initial.name === 'existing') {
      await page.locator('.bn-inline-content').first().click()
      await page.keyboard.type('用户保存的研究正文。')
      await page.evaluate(() => (window as any).notesFixture.flush())
      await page.evaluate(() => (window as any).notesFixture.reopen())
      await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('用户保存的研究正文。')
    }
    await page.locator('.en-title').fill('生产预加载保存验证')
    const body = page.locator('.bn-inline-content').first()
    await body.click()
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.type('新增编辑内容。')
    await page.evaluate(() => { document.documentElement.dataset.odysseyLocale = 'en' })
    await expect.poll(() => page.locator('.en-title').getAttribute('placeholder')).toBe('Untitled document')
    await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('新增编辑内容。')
    expect(await page.locator('.en-title').inputValue()).toBe('生产预加载保存验证')
    await page.evaluate(() => (window as any).notesFixture.flush())
    expect(await page.evaluate(() => (window as any).noteSaved.title)).toBe('生产预加载保存验证')
    expect(await page.evaluate(() => (window as any).noteSaved.yjs.length)).toBeGreaterThan(0)
    await page.evaluate(() => (window as any).notesFixture.reopen())
    await expect.poll(() => page.locator('.en-title').inputValue()).toBe('生产预加载保存验证')
    await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('新增编辑内容。')
    if (initial.name === 'existing') expect(await page.locator('.bn-editor').textContent()).toContain('用户保存的研究正文。')
    if (evidence) await page.screenshot({path: resolve(evidence, `${initial.name}-mounted.png`)})
    expect(errors).toEqual([])
  } finally { await context.close() }
}, 20000)
