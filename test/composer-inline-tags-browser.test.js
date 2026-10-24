import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchFigmaInlineReferences} from '../scripts/lib/figma-inline-references-client.mjs'
import {patchSkillCommandPopup} from '../scripts/lib/skill-command-menu.mjs'

let browser,bootstrap
const conversation=patchFigmaInlineReferences(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).split('\n//# sourceMappingURL=')[0].replace('exports.SessionInputShell = SessionInputShell;','exports.InputBarForTest = InputBar;\nexports.SessionInputShell = SessionInputShell;')
const commands=patchSkillCommandPopup(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.PopupSelectController = PopupSelectController;','exports.PopupSelectViewForTest = PopupSelectView;\nexports.PopupSelectController = PopupSelectController;')
const native=[...conversation.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.uV2eYG_chip')).join('\n')
beforeAll(async()=>{
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import * as JSX from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 const descriptors=[];window.__ModuleLoader__={load:descriptor=>descriptors.push(descriptor)};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const store=value=>{const listeners=new Set();return {getSnapshot:()=>value,set:next=>{value=next;for(const listener of listeners)listener()},subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}};
 const primitives=new Proxy({Tooltip:({children})=>children,useAnchoredMaxHeight:()=>1000},{get:(target,key)=>target[key]??fake});
 const require=id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?ReactDOM:id==='react-dom/client'?{createRoot}:id==='@deepseek-ai/dsh-client-runtime/client'?{createSnapshotStore:store}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake;
 window.mountComposer=()=>{
  const client=descriptors[0].factory(require),shell=new client.SessionInputShell({actx:{},defaultSink:()=>{}});
  const seed=()=>{
   shell.setDraft('前');
   const insert=reference=>shell.insertReference(reference,{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev});
   insert({source:'ework-managed-skill',ref:'skill-one',label:'/skill-one',clipboardText:'/skill-one'});
   insert({source:'ework-managed-skill',ref:'skill-two',label:'/skill-two',clipboardText:'/skill-two'});
   shell.insertFilePaths(['/work/材料.md']);
   insert({source:'research-artifact',ref:JSON.stringify({id:'component-one',messageId:'message-one',title:'研究组件',excerpt:'组件内容'}),label:'研究组件',clipboardText:'研究组件'});
   insert({source:'conversation-component',ref:JSON.stringify({version:1,kind:'conversation-component',sessionId:'current',componentId:'component-two',revision:1,title:'对话组件'}),label:'对话组件',clipboardText:'对话组件'});
   shell.insertText('尾',{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev});
  };seed();
  const useInput=selector=>selector(React.useSyncExternalStore(shell.state.subscribe,shell.state.getSnapshot));
  const useSession=selector=>selector({subagent:null,running:false,removed:false});const useLexicon=selector=>selector(new Map());
  const root=createRoot(document.querySelector('#fixture'));root.render(React.createElement(client.InputBarForTest,{useInput,useSession,inputActions:shell.actions,keyboard:shell,useNotices:selector=>selector(null),useLexicon,useMenuLauncher:selector=>selector(null),useProjection:()=>undefined,sessionId:'current',variant:'hero',renderSlot:()=>null,t:key=>key,resolveSubmitMode:()=> 'queue',researchArtifactReferences:[],eworkNotes:true}));
  window.fixture={shell,seed,root};
 };
 window.mountPopup=()=>{
  const client=descriptors[1].factory(require),popup=new client.PopupSelectController({consume:()=>{},focusComposer:()=>{}});
  let finish,fail,calls=0;
  popup.open('skills',{options:async()=>Array.from({length:4},(_,index)=>({id:String(index),label:'技能 '+index,detail:'完整描述'})),onSelect:()=>{calls++;return new Promise((resolve,reject)=>{finish=resolve;fail=reject})}},{sessionId:'current'},{via:'menu',span:{start:0,end:0,draftRev:1}});
  const root=createRoot(document.querySelector('#fixture'));root.render(React.createElement(client.PopupSelectViewForTest,{popup,t:key=>key}));window.fixture={popup,finish:()=>finish(),fail:()=>fail(Error('技能暂时不可用')),calls:()=>calls,root};
 };
 `},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(kind='composer'){
 const page=await browser.newPage({viewport:{width:800,height:400}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent(`<style>${native}\n${readFileSync('src/preload/figma-inline-references.css','utf8')}body{margin:24px;--dsw-font-family:system-ui;--dsh-composer-side-clearance:0;--dsh-composer-card-max-width:700px}.uV2eYG_card{font:16px/24px system-ui;padding:12px}.uV2eYG_grow{width:100%}</style><main id="fixture"></main>`)
 await page.addScriptTag({content:bootstrap});await page.addScriptTag({content:conversation});await page.addScriptTag({content:commands})
 await page.evaluate(kind=>kind==='composer'?window.mountComposer():window.mountPopup(),kind)
 await page.waitForSelector(kind==='composer'?'[data-figma-inline-ready]':'[role=option]')
 expect(errors).toEqual([])
 return {page,errors}
}
it.each([0,1,2,3,4])('selects native chip %i by mouse with exact projected offsets and deletes only that occurrence',async index=>{
 const {page,errors}=await fixture();try{
  const before=await page.evaluate(()=>window.fixture.shell.snapshot)
  const chip=page.locator('[data-decoration=chip]').nth(index);await chip.click()
  await expect.poll(()=>chip.getAttribute('data-selected')).toBe('true')
  const input=page.locator('textarea'),range=[before.occurrences[index].offset,before.occurrences[index].offset+1]
  expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual(range)
  await input.press('ArrowRight');expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([range[1],range[1]])
  await input.press('ArrowLeft');expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual(range)
  await expect.poll(()=>chip.getAttribute('data-selected')).toBe('true')
  await input.press(index%2?'Backspace':'Delete')
  await expect.poll(()=>page.evaluate(()=>window.fixture.shell.snapshot.occurrences.map(item=>item.ref))).toEqual(before.occurrences.filter((_,at)=>at!==index).map(item=>item.ref))
  expect(await page.evaluate(()=>window.fixture.shell.snapshot.draft)).toBe(before.draft.slice(0,before.occurrences[index].offset)+before.draft.slice(before.occurrences[index].offset+1));expect(errors).toEqual([])
 }finally{await page.close()}
})
it('uses unmodified arrows to enter and leave a chip while preserving native text, modified arrows and IME',async()=>{
 const {page}=await fixture();try{
  const input=page.locator('textarea');await input.focus();await input.evaluate(el=>el.setSelectionRange(2,2));await input.press('ArrowLeft')
  await expect.poll(()=>page.locator('[data-selected]').getAttribute('data-occurrence')).toBe('1')
  expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([1,2])
  await input.press('ArrowLeft');expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([1,1]);await expect.poll(()=>page.locator('[data-selected]').count()).toBe(0)
  await input.press('ArrowLeft');expect(await input.evaluate(el=>el.selectionStart)).toBe(0)
  await input.evaluate(el=>el.setSelectionRange(1,1));await input.press('ArrowRight');expect(await input.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([1,2])
  expect(await input.evaluate(el=>{const event=new KeyboardEvent('keydown',{key:'ArrowLeft',metaKey:true,cancelable:true,bubbles:true});el.dispatchEvent(event);return event.defaultPrevented})).toBe(false)
  expect(await input.evaluate(el=>{const event=new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,cancelable:true,bubbles:true});el.dispatchEvent(event);return event.defaultPrevented})).toBe(false)
  expect(await input.evaluate(el=>{const event=new KeyboardEvent('keydown',{key:'Backspace',isComposing:true,cancelable:true,bubbles:true});el.dispatchEvent(event);return event.defaultPrevented})).toBe(false)
 }finally{await page.close()}
})
it('replaces a selected chip through native text and IME input, then leaves external focus alone',async()=>{
 const {page,errors}=await fixture();try{
  const input=page.locator('textarea');await page.locator('[data-decoration=chip]').first().click()
  await page.keyboard.insertText('😀文')
  await expect.poll(()=>page.evaluate(()=>window.fixture.shell.snapshot.draft.startsWith('前😀文 '))).toBe(true)
  expect(await page.evaluate(()=>window.fixture.shell.snapshot.occurrences.length)).toBe(4)
  await page.locator('[data-decoration=chip]').first().click()
  await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})))
  await page.keyboard.insertText('你好')
  await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{data:'你好',bubbles:true})))
  await expect.poll(()=>page.evaluate(()=>window.fixture.shell.snapshot.draft.startsWith('前😀文 你好 '))).toBe(true)
  expect(await page.evaluate(()=>window.fixture.shell.snapshot.occurrences.length)).toBe(3)
  await page.evaluate(()=>{const button=document.createElement('button');button.id='external';button.textContent='外部焦点';document.body.append(button);button.focus()})
  await page.waitForTimeout(40);expect(await page.evaluate(()=>document.activeElement.id)).toBe('external');expect(errors).toEqual([])
 }finally{await page.close()}
})
it('uses the current textarea range for deletion even before a stale chip selection has rerendered',async()=>{
 const {page}=await fixture();try{
  await page.locator('[data-decoration=chip]').last().click()
  await expect.poll(()=>page.locator('[data-selected]').count()).toBe(1)
  const prevented=await page.locator('textarea').evaluate(el=>{el.setSelectionRange(0,el.value.length);const event=new KeyboardEvent('keydown',{key:'Backspace',cancelable:true,bubbles:true});el.dispatchEvent(event);return event.defaultPrevented})
  expect(prevented).toBe(false)
  await page.locator('textarea').press('Meta+A');await page.locator('textarea').press('Backspace')
  await expect.poll(()=>page.evaluate(()=>window.fixture.shell.snapshot.draft)).toBe('');expect(await page.locator('[data-decoration=chip]').count()).toBe(0)
 }finally{await page.close()}
})
it('keeps the actual skill popup geometry stable while its asynchronous selection settles',async()=>{
 const {page}=await fixture('popup');try{
  await page.addStyleTag({content:'.mufS8W_card{box-sizing:border-box;width:360px;padding:8px;border:1px solid}.mufS8W_search{height:28px;box-sizing:border-box}.mufS8W_row{box-sizing:border-box;height:44px}.mufS8W_status{height:30px}body{margin:0}#fixture{height:100vh}'} )
  await page.setViewportSize({width:800,height:245});await page.waitForTimeout(50)
  const geometry=()=>page.locator('[data-ework-command=skills]').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,columns:getComputedStyle(el.querySelector('[role=listbox]')).gridTemplateColumns}))
  const before=await geometry();await page.locator('[role=option]').first().click();await page.waitForTimeout(50)
  expect(await page.evaluate(()=>window.fixture.popup.state.getSnapshot().submitting)).toBe(true)
  expect(await geometry()).toEqual(before)
  expect(await page.locator('[data-ework-command=skills]').getAttribute('aria-busy')).toBe('true')
  await page.evaluate(()=>window.fixture.popup.select(1));expect(await page.evaluate(()=>window.fixture.calls())).toBe(1)
  await page.evaluate(()=>window.fixture.finish());await expect.poll(()=>page.locator('[data-ework-command=skills]').count()).toBe(0)
 }finally{await page.close()}
})
it('keeps a failed skill selection readable and permits one explicit retry',async()=>{
 const {page}=await fixture('popup');try{
  await page.locator('[role=option]').first().click();await page.evaluate(()=>window.fixture.fail())
  await expect.poll(()=>page.locator('[role=alert]').textContent()).toContain('技能暂时不可用')
  expect(await page.evaluate(()=>window.fixture.popup.state.getSnapshot().open)).toBe(true)
  expect(await page.locator('[data-ework-command=skills]').getAttribute('aria-busy')).toBeNull()
  await page.locator('[role=option]').first().click();expect(await page.evaluate(()=>window.fixture.calls())).toBe(2)
  await page.evaluate(()=>window.fixture.finish());await expect.poll(()=>page.locator('[role=option]').count()).toBe(0)
 }finally{await page.close()}
})
it('settles repeated native full-draft deletion without residual references, pointer capture or font registrations',async()=>{
 const {page,errors}=await fixture();try{
  const input=page.locator('textarea');await page.evaluate(()=>{window.captures=0;document.addEventListener('gotpointercapture',()=>window.captures++)})
  for(let index=0;index<20;index++){
   if(index)await page.evaluate(()=>window.fixture.seed())
   await expect.poll(()=>page.locator('[data-decoration=chip]').count()).toBe(5)
   await input.focus();await input.press('Meta+A');await input.press(index%2?'Delete':'Backspace')
   await expect.poll(()=>page.evaluate(()=>window.fixture.shell.snapshot.draft)).toBe('')
   expect(await page.evaluate(()=>window.fixture.shell.snapshot.occurrences.length)).toBe(0)
  }
  expect(await page.evaluate(()=>({pointerLock:document.pointerLockElement!==null,captures:window.captures}))).toEqual({pointerLock:false,captures:0})
  await page.evaluate(()=>window.fixture.root.unmount());expect(await page.evaluate(()=>[...document.fonts].filter(face=>face.family.startsWith('Sherlock')).length)).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
