import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchFigmaAboutUpdates} from '../scripts/lib/figma-updates-client.mjs'
let browser,source,script
beforeAll(async()=>{
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 source=patchFigmaAboutUpdates(await readFile('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js','utf8')).replace('exports.apply = apply;','exports.SherlockAboutSection = SherlockAboutSection;exports.apply = apply;')
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import { updateReleaseNoteBlocks } from './src/preload/update-view';
 import React from 'react';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});window.__ModuleLoader__={load:value=>window.descriptor=value};
 window.mountAbout=locale=>{let status={phase:'idle',currentVersion:'1.3.2',manual:true},listener;window.checks=0;window.downloads=0;window.installs=0;
  window.setUpdate=next=>{status={...status,availableVersion:'1.3.3',...next};listener?.(status)};
  window.sherlockAbout={getInfo:async()=>({version:'1.3.2',productName:'EWork Odyssey',releaseNotes:[]}),getUpdateStatus:async()=>status,getUpdateReleaseNotes:notes=>updateReleaseNoteBlocks(notes,locale),onUpdateStatusChanged:fn=>{listener=fn;return()=>{}},checkForUpdates:async()=>{window.checks++;window.setUpdate({phase:'downloading',percent:42,releaseNotes:'## 中文\\n- 新增趋势图\\n## English\\n- New trend chart'});return status},downloadUpdate:async()=>{window.downloads++;return status},installUpdate:async()=>{window.installs++;window.setUpdate({phase:'installing',installStage:'restarting'})}};
  const mod=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:fake),en={'about.nav':'About','about.check':'Check for updates','about.downloadingButton':'Downloading {percent}%','about.downloadStatus':'Downloading update','about.verifyingButton':'Preparing…','about.verifying':'Verifying update files'},zh={'about.nav':'关于','about.check':'检查更新','about.downloadingButton':'下载中 {percent}%','about.downloadStatus':'正在下载更新','about.verifyingButton':'准备中…','about.verifying':'正在校验更新文件'};
  createRoot(document.querySelector('#root')).render(React.createElement(mod.SherlockAboutSection,{t:key=>(locale==='en'?en:zh)[key]??key}));
 };
 `},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
})
afterAll(async()=>{await browser?.close()})
for(const locale of ['en','zh'])it(`keeps manual download, preparation and the explicit ready action inside About (${locale})`,async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});await page.addScriptTag({content:source});await page.evaluate(locale=>window.mountAbout(locale),locale)
  await page.getByRole('button',{name:locale==='en'?'Check for updates':'检查更新',exact:true}).click()
  const action=page.locator('.sherlock-about-check');await page.waitForFunction(()=>document.querySelector('[data-about-update-phase="downloading"]'))
  expect(await action.textContent()).toContain('42%');expect(await action.isDisabled()).toBe(true)
  const notes=page.locator('[data-about-update-notes]')
  expect(await notes.locator('summary').textContent()).toContain('1.3.3')
  expect(await notes.locator('li').allTextContents()).toEqual([locale==='en'?'New trend chart':'新增趋势图'])
  await page.evaluate(()=>window.setUpdate({phase:'preparing',installStage:'preparing'}));await page.waitForFunction(()=>document.querySelector('[data-about-update-phase="preparing"]'))
  expect(await action.isDisabled()).toBe(true);expect(await page.locator('.sherlock-about-check-state').textContent()).toContain(locale==='en'?'Verifying and extracting':'正在校验并解压')
  await page.evaluate(()=>window.setUpdate({phase:'downloaded',installStage:undefined}));await page.waitForFunction(()=>document.querySelector('[data-about-update-phase="downloaded"]'))
  expect(await action.textContent()).toBe(locale==='en'?'Restart and update':'重启更新');expect(await action.isEnabled()).toBe(true)
  await action.click();expect(await page.evaluate(()=>({checks:window.checks,downloads:window.downloads,installs:window.installs}))).toEqual({checks:1,downloads:0,installs:1});expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
