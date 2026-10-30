import {afterAll, beforeAll, expect, it} from 'vitest'
import {dirname, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {build, type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'

const root = resolve('.')
const entry = '\0notes-production-runtime-fixture'
const peerRoot = mkdtempSync(resolve(tmpdir(), 'notes-react-peer-'))
let browser: any, script = '', owners: string[] = [], yjsOwners: string[] = [], tableOwners: string[] = []
const evidence = process.env.SHERLOCK_NOTES_RUNTIME_EVIDENCE
const source = `
import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};
import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
import * as Y from 'yjs';
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
window.notesDiagnostics=()=>{
 const fragment=encoded=>{const doc=new Y.Doc();try{if(encoded)Y.applyUpdate(doc,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));return doc.getXmlFragment('note').toString()}finally{doc.destroy()}};
 return{dom:document.querySelector('.bn-editor')?.textContent,savedFragment:fragment(window.noteSaved.yjs),draftFragment:fragment(window.noteDraft?.content?.yjs),saved:window.noteSaved,draft:window.noteDraft};
};
`

beforeAll(async () => {
  // A reused dependency can own second physical React/Yjs packages even with
  // a flat npm install. Keep both singleton regressions reproducible on CI.
  mkdirSync(resolve(peerRoot, 'node_modules'), {recursive: true})
  cpSync(dirname(createRequire(import.meta.url).resolve('react/package.json')), resolve(peerRoot, 'node_modules/react'), {recursive: true})
  cpSync(dirname(createRequire(import.meta.url).resolve('yjs/package.json')), resolve(peerRoot, 'node_modules/yjs'), {recursive: true})
  cpSync(dirname(dirname(createRequire(import.meta.url).resolve('prosemirror-tables'))), resolve(peerRoot, 'node_modules/prosemirror-tables'), {recursive: true})
  for (const name of ['prosemirror-keymap', 'prosemirror-model', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view']) {
    symlinkSync(dirname(dirname(createRequire(import.meta.url).resolve(name))), resolve(peerRoot, 'node_modules', name))
  }
  symlinkSync(dirname(createRequire(import.meta.url).resolve('lib0/package.json')), resolve(peerRoot, 'node_modules/lib0'))
  const peer = resolve(peerRoot, 'peer.mjs')
  writeFileSync(peer, "import React from 'react'; import * as Y from 'yjs'; import {CellSelection} from 'prosemirror-tables'; export {Y,CellSelection}; export default React;\n")
  const config = (await resolveConfig({configFile: resolve('electron.vite.config.ts'), logLevel: 'silent'}, 'build', 'production')).config!.preload!
  const probe: Plugin = {
    name: 'notes-production-runtime-fixture',
    resolveId(id) { if (id === entry) return entry },
    load(id) { if (id === entry) return source + `\nimport peerReact, {Y as peerY,CellSelection as peerCellSelection} from ${JSON.stringify(peer)}; window.notesPeerReact=peerReact; window.notesPeerY=peerY; window.notesPeerCellSelection=peerCellSelection;` },
    generateBundle(_options, bundle) {
      owners = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk'
        ? Object.keys(chunk.modules).filter(id => /\/react\/cjs\/react\.production\.min\.js$/u.test(id)) : []))]
      yjsOwners = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk'
        ? Object.keys(chunk.modules).filter(id => /\/yjs\/dist\/yjs\.(?:mjs|cjs)$/u.test(id)) : []))]
      tableOwners = [...new Set(Object.values(bundle).flatMap(chunk => chunk.type === 'chunk'
        ? Object.keys(chunk.modules).filter(id => /\/prosemirror-tables\/dist\/index\.(?:js|cjs)$/u.test(id)) : []))]
    }
  }
  const output = await build({...config, root, configFile: false,
    plugins: [...(config.plugins || []), probe],
    build: {...config.build, write: false, rollupOptions: {...config.build?.rollupOptions, input: entry}}
  })
  const chunks = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : [])
  script = chunks.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  if (evidence) writeFileSync(resolve(evidence, 'react-module-owners.json'), JSON.stringify({root, owners, yjsOwners}, null, 2))
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const {chromium} = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
}, 90000)
afterAll(async () => { await browser?.close(); rmSync(peerRoot, {recursive: true, force: true}) })

const cases = [
  {name: 'blank', title: '', blocks: []},
  {name: 'default', title: '', blocks: [{id: 'empty', type: 'paragraph'}]},
  {name: 'existing', title: '已有研究笔记', blocks: []}
]

it.each(cases)('mounts, edits, saves and reopens $name notes through the production preload bundle', async initial => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}})
  const page = await context.newPage(), errors: string[] = [], warnings: string[] = []
  page.on('pageerror', (error: Error) => errors.push(error.message))
  page.on('console', (message: any) => { if (['warning','error'].includes(message.type())) warnings.push(message.text()) })
  const capture = async (stage: string) => { if (evidence) writeFileSync(resolve(evidence, `${initial.name}-${stage}.json`), JSON.stringify({owners, yjsOwners, errors, warnings, runtime: await page.evaluate(() => (window as any).notesDiagnostics())}, null, 2)) }
  page.setDefaultTimeout(5000)
  try {
    await page.route('http://127.0.0.1/notes-runtime', (route: any) => route.fulfill({contentType: 'text/html', body:
      '<!doctype html><html data-odyssey-locale="zh"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>Notes production preload fixture</title><body><header data-ework-notes-session="bundled-note"></header><div data-ework-note-view="bundled-note"></div></body></html>'}))
    await page.goto('http://127.0.0.1/notes-runtime')
    await page.evaluate((value: any) => { (window as any).noteSaved = {...value, yjs: '', revision: 0} }, initial)
    // Execute the CJS output from the same Vite configuration, browser conditions,
    // custom-elements guard and sandbox wrapper used by the shipped preload.
    await page.addScriptTag({content: `var exports={};\n${script}`})
    await expect.poll(async () => errors.length || await page.locator('.en-title').count()).toBeGreaterThan(0)
    if (evidence) writeFileSync(resolve(evidence, `${initial.name}-errors.json`), JSON.stringify({owners, errors}, null, 2))
    expect(errors, JSON.stringify({owners, tableOwners, errors})).toEqual([])
    expect(owners, 'one React dispatcher must own every bundled hook').toHaveLength(1)
    expect(yjsOwners, 'one Yjs constructor family must own editor transactions and saved snapshots').toHaveLength(1)
    expect(tableOwners, 'one table-selection registry must own native table commands').toHaveLength(1)
    await page.locator('.bn-editor').waitFor()
    expect(await page.locator('.en-title').inputValue()).toBe(initial.title)
    // Existing collaborative notes carry a saved Yjs document. Create that
    // snapshot through the actual editor instead of inventing an invalid blob.
    if (initial.name === 'existing') {
      await page.locator('.bn-inline-content').first().click()
      await page.keyboard.type('用户保存的研究正文。')
      await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('用户保存的研究正文。')
      expect(await page.locator('.bn-editor').textContent()).toBe('用户保存的研究正文。')
      await capture('seed-typed')
      await page.evaluate(() => (window as any).notesFixture.flush())
      await capture('seed-saved')
      expect(await page.evaluate(() => (window as any).notesDiagnostics().savedFragment)).toContain('用户保存的研究正文。')
      await page.evaluate(() => (window as any).notesFixture.reopen())
      await capture('seed-reopened')
      await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('用户保存的研究正文。')
    }
    await page.locator('.en-title').fill('生产预加载保存验证')
    const body = page.locator('.bn-inline-content').first()
    await body.click()
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.type('新增编辑内容。')
    await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('新增编辑内容。')
    await expect.poll(() => page.evaluate(() => (window as any).notesDiagnostics().draftFragment)).toContain('新增编辑内容。')
    await capture('typed')
    await page.evaluate(() => { document.documentElement.dataset.odysseyLocale = 'en' })
    await capture('locale')
    await expect.poll(() => page.locator('.en-title').getAttribute('placeholder')).toBe('Untitled document')
    await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('新增编辑内容。')
    expect(await page.evaluate(() => (window as any).notesDiagnostics().draftFragment)).toContain('新增编辑内容。')
    expect(await page.locator('.en-title').inputValue()).toBe('生产预加载保存验证')
    await page.evaluate(() => (window as any).notesFixture.flush())
    expect(await page.evaluate(() => (window as any).notesDiagnostics().savedFragment)).toContain('新增编辑内容。')
    expect(await page.evaluate(() => (window as any).noteSaved.title)).toBe('生产预加载保存验证')
    expect(await page.evaluate(() => (window as any).noteSaved.yjs.length)).toBeGreaterThan(0)
    await page.evaluate(() => (window as any).notesFixture.reopen())
    await expect.poll(() => page.locator('.en-title').inputValue()).toBe('生产预加载保存验证')
    await expect.poll(() => page.locator('.bn-editor').textContent()).toContain('新增编辑内容。')
    expect(await page.evaluate(() => (window as any).notesDiagnostics().savedFragment)).toContain('新增编辑内容。')
    if (initial.name === 'existing') expect(await page.locator('.bn-editor').textContent()).toContain('用户保存的研究正文。')
    if (evidence) await page.screenshot({path: resolve(evidence, `${initial.name}-mounted.png`)})
    expect(errors).toEqual([])
    expect(warnings.filter(message => /Yjs was already imported|Not same Y\.Doc/u.test(message))).toEqual([])
  } finally { await context.close() }
}, 20000)
