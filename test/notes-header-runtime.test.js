import {expect,it} from 'vitest'
import {runInNewContext} from 'node:vm'
import {readFile} from 'node:fs/promises'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {patchNotesClient} from '../scripts/lib/notes-client.mjs'
import {notesComposerSource} from '../scripts/lib/notes-composer.mjs'
import {execFileSync} from 'node:child_process'
const activityLocaleHelpers=execFileSync(process.execPath,['--input-type=module','-e',"import {noteActivityLocaleHelpers} from './scripts/lib/notes-activity.mjs';process.stdout.write(noteActivityLocaleHelpers())"],{cwd:process.cwd(),encoding:'utf8'})

// The export menu lives outside the plugin apply closure. Composer helpers must
// remain nested here, exactly as in the shipped conversation module.
const nativeSource = `
function ConversationSessionHeader({sessionId, blank, composerPhase, active}) {
 const homeHeader = blank && composerPhase === "blank" && active?.id === "chat";
 return react.createElement('header',{"data-srb-session-header":"", children:[react.createElement('nav',{key:'tabs'},'Chat Research Notes Trajectory'),react.createElement('div',{key:'utilities',children: renderSlot("conversation.session.header.utilities", {})})]});
}
function boot(){
 ${notesComposerSource.slice(0,notesComposerSource.indexOf('const eworkNotesInputs'))}
 registerResearchCanvasView(slots, t, researchWorkspaces, researchOfficePreview);
}`

it.each(['zh','en'])('renders the complete notes header in %s without relying on composer closure helpers',locale=>{
 const Header=runInNewContext(patchNotesClient(nativeSource)+';ConversationSessionHeader',{
  react:React,react_jsx_runtime:jsx,document:{documentElement:{dataset:{odysseyLocale:locale}}},renderSlot:()=>null,
 })
 let markup=''
 expect(()=>{markup=renderToStaticMarkup(React.createElement(Header,{sessionId:'note',blank:true,composerPhase:'blank',active:{id:'notes'}}))}).not.toThrow()
 expect(markup).toContain('Chat Research Notes Trajectory')
 expect(markup).toContain(locale==='en'?'Export note':'导出笔记')
 expect(markup).toContain('aria-haspopup="menu"')
})

it.each(['preparing','generating','ready','replied','accepted','discarded','failed','stopped'])('renders native note activity in phase %s from the same module scope',async phase=>{
 const rowSource=(await readFile('scripts/lib/notes-activity.mjs','utf8')).match(/export function EWorkNoteConversationRow[\s\S]*?\n\}/)[0].replace(/^export /,'')
 const Row=runInNewContext(patchNotesClient(nativeSource)+'\n'+activityLocaleHelpers+'\n'+rowSource+';EWorkNoteConversationRow',{
  react:React,react_jsx_runtime:jsx,document:{documentElement:{dataset:{odysseyLocale:'en'}}},renderSlot:()=>null,
  UserStyleBubble:()=>null,ExecutionStatusGroup:({entry})=>React.createElement('span',null,entry.noteTask.status),AssistantMarkdown:({blocks})=>React.createElement('p',null,blocks[0].text),
 })
 let markup=''
 markup=renderToStaticMarkup(React.createElement(Row,{row:{requestId:'test',phase,completedSeq:1,prompt:'User content',result:{kind:'text',markdown:'Unchanged body'}},sessionId:'note',t:value=>value}))
 expect(markup).toContain('data-note-task="test"')
 if(phase==='accepted')expect(markup).toContain('Unchanged body')
})

it('keeps the native export menu usable after mode and live language switches',async()=>{
 const {build}=await import('esbuild'),{pathToFileURL}=await import('node:url')
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const script=(await build({stdin:{contents:`
 import React from 'react';import * as react_dom from 'react-dom';import {createRoot} from 'react-dom/client';import * as react_jsx_runtime from 'react/jsx-runtime';
 const react=React,renderSlot=()=>null;
 ${patchNotesClient(nativeSource)}
 function App(){const [view,setView]=React.useState('chat');return React.createElement('main',null,React.createElement('nav',null,...['chat','research','notes','trajectory'].map(id=>React.createElement('button',{key:id,onClick:()=>setView(id)},id))),React.createElement(ConversationSessionHeader,{sessionId:'note',blank:true,composerPhase:'blank',active:{id:view}}))}
 window.exports=[];document.addEventListener('sherlock:notes-export',e=>window.exports.push(e.detail));createRoot(document.querySelector('#root')).render(React.createElement(App));
 `,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 const browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.setContent('<html data-odyssey-locale="zh"><body><div id="root"></div></body></html>');await page.addScriptTag({content:script})
  for(const locale of ['zh','en','zh']){
   await page.evaluate(locale=>document.documentElement.dataset.odysseyLocale=locale,locale)
   for(const view of ['notes','research','notes','chat','notes','trajectory','notes']){
    await page.getByRole('button',{name:view,exact:true}).click()
    if(view!=='notes')continue
    const button=page.getByRole('button',{name:locale==='en'?'Export note':'导出笔记',exact:true});await button.click()
    expect(await page.getByRole('menuitem').allTextContents()).toEqual(['Word','PDF','Markdown'])
    await page.getByRole('menuitem',{name:'PDF',exact:true}).click()
    expect((await page.evaluate(()=>window.exports)).at(-1)).toEqual({sessionId:'note',format:'pdf'})
   }
  }
  // The same mounted header must rerender its labels without being remounted.
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await page.getByRole('button',{name:'Export note',exact:true}).press('ArrowDown')
  expect(await page.getByRole('menu').getAttribute('aria-label')).toBe('Note export format')
  await page.getByRole('menuitem',{name:'Word',exact:true}).press('Escape')
  expect(await page.getByRole('menu').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await browser.close()}
},30000)

it('localizes replayed capability receipts live without translating model text or mutating stored history',async()=>{
 const {build}=await import('esbuild'),{pathToFileURL}=await import('node:url')
 const {chromium}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const rowSource=(await readFile('scripts/lib/notes-activity.mjs','utf8')).match(/export function EWorkNoteConversationRow[\s\S]*?\n\}/)[0].replace(/^export /,'')
 const script=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import React from 'react';import {createRoot}from'react-dom/client';import*as react_dom from'react-dom';import*as react_jsx_runtime from'react/jsx-runtime';const react=React,renderSlot=()=>null;
 ${patchNotesClient(nativeSource)}
 ${activityLocaleHelpers}
 ${rowSource}
 const props={t:key=>key,UserBubble:({content})=>React.createElement('p',null,content?.[0]?.text),Progress:({entry})=>React.createElement('span',null,entry.noteTask.status),Markdown:({blocks})=>React.createElement('p',null,blocks.map(b=>b.text).join(''))};
 window.rows=[{requestId:'receipt',phase:'replied',completedSeq:1,prompt:'用户的中文指令',result:{kind:'conversation',markdown:'旧的中文程序回执',capabilityReceipts:[{capability:'notes.components.style',status:'succeeded',effect:{state:'saved',changedBlockIds:['r']},message:'已保存 1 个组件的样式。'},{capability:'notes.export',status:'succeeded',path:'/tmp/用户的中文文件.pdf'}]}},{requestId:'model',phase:'replied',completedSeq:2,result:{kind:'conversation',markdown:'智能组件、已完成：这是模型的中文正文，必须原样保留。'}}];window.before=JSON.stringify(window.rows);
 createRoot(document.querySelector('#root')).render(React.createElement('main',null,...window.rows.map(row=>React.createElement(EWorkNoteConversationRow,{...props,key:row.requestId,row}))));
 `},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 const browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<html data-odyssey-locale="zh"><div id="root"></div></html>');await page.addScriptTag({content:script})
  for(const locale of ['zh','en','zh']){
   await page.evaluate(locale=>document.documentElement.dataset.odysseyLocale=locale,locale)
   await expect.poll(()=>page.locator('[data-note-task="receipt"]').innerText()).toContain(locale==='en'?'Component style: Completed':'组件样式：已完成')
   expect(await page.locator('[data-note-task="receipt"]').innerText()).toContain('/tmp/用户的中文文件.pdf')
   expect(await page.locator('[data-note-task="model"]').innerText()).toContain('智能组件、已完成：这是模型的中文正文，必须原样保留。')
   expect(await page.evaluate(()=>JSON.stringify(window.rows)===window.before)).toBe(true)
  }
  expect(errors).toEqual([])
 }finally{await browser.close()}
},30000)
