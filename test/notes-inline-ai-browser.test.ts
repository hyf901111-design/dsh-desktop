import {afterAll,beforeAll,expect,it} from 'vitest'
import {dirname,resolve} from 'node:path'
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
let browser:any,script='',syncOwners:string[]=[]
const entry='\0notes-inline-ai-fixture',evidence=process.env.SHERLOCK_NOTES_INLINE_EVIDENCE,peerRoot=mkdtempSync(resolve(tmpdir(),'notes-y-prosemirror-peer-'))
function packageRoot(name:string){
 let path=dirname(createRequire(import.meta.url).resolve(name==='y-protocols'?'y-protocols/awareness':name))
 while(!existsSync(resolve(path,'package.json'))||JSON.parse(readFileSync(resolve(path,'package.json'),'utf8')).name!==name){const parent=dirname(path);if(parent===path)throw Error('Package root not found: '+name);path=parent}
 return path
}
beforeAll(async()=>{
 // Reused BlockNote peers can own a second physical y-prosemirror even with a
 // flat install. Force the same import boundary that broke the APFS integration.
 mkdirSync(resolve(peerRoot,'node_modules'),{recursive:true})
 cpSync(packageRoot('y-prosemirror'),resolve(peerRoot,'node_modules/y-prosemirror'),{recursive:true})
 for(const name of ['yjs','lib0','y-protocols','prosemirror-state','prosemirror-model','prosemirror-view'])symlinkSync(packageRoot(name),resolve(peerRoot,'node_modules',name))
 const peer=resolve(peerRoot,'peer.mjs')
 writeFileSync(peer,"export {absolutePositionToRelativePosition,relativePositionToAbsolutePosition,prosemirrorToYXmlFragment,ySyncPluginKey} from 'y-prosemirror';\n")
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-inline-ai-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
 window.calls=[];window.jobs={};window.replies=[];
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{owner:'fixture-owner',saved:window.saved};if(method==='save'){window.saved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.saved}}if(method==='generate')return new Promise((resolve,reject)=>{window.jobs[input.requestId]={input,resolve,reject}});if(method==='library-list')return[];if(method==='capability-reply')window.replies.push(input);return{}},draft:async input=>window.draft=input};
 const host=new WorkspaceSurfaceHost(document);let mounted=mountNotes(document,bridge,host);window.fixture={flush:()=>mounted.flushCurrent(),reopen:()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)}};
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor; const slashMenu = useMemo');if(id.endsWith('/preload/notes/inline-ai.ts'))return code.replace(/from (['"])y-prosemirror\1/gu,'from '+JSON.stringify(peer)).replace(/return\s*\{\s*documentId,\s*blockId,\s*position:/u,'return window.lastInlineAnchor={documentId,blockId,position:')+`\nwindow.inlineAnchorDiagnostics=()=>{const e=window.editor,state=e._tiptapEditor.state,b=ySyncPluginKey.getState(state)?.binding,a=window.lastInlineAnchor;if(!b)return{missing:true};const relative=a?.position||Y.relativePositionToJSON(absolutePositionToRelativePosition(state.selection.from,b.type,b.mapping)),position=relativePositionToAbsolutePosition(b.type.doc,b.type,Y.createRelativePositionFromJSON(relative),b.mapping),ancestors=[];if(position!==null){const p=state.doc.resolve(position);for(let d=p.depth;d>=0;d--)ancestors.push({type:p.node(d).type.name,id:p.node(d).attrs.id})}return{block:e.getTextCursorPosition().block,selection:state.selection.toJSON(),fragmentLength:b.type.length,fragment:b.type.toString(),relative,position,ancestors,anchor:a}};window.inlineBindingDiagnostics=()=>{const state=window.editor._tiptapEditor.state;return{importedKey:ySyncPluginKey.key,importedState:!!ySyncPluginKey.getState(state)?.binding,installed:state.plugins.filter(p=>/^y-sync\\$/u.test(p.key.replace(/\\d+$/u,''))).map(p=>({key:p.key,binding:!!p.getState(state)?.binding}))}};`},generateBundle(_options,bundle){syncOwners=[...new Set(Object.values(bundle).flatMap(chunk=>chunk.type==='chunk'?Object.keys(chunk.modules).filter(id=>/\/y-prosemirror\/src\/plugins\/keys\.js$/u.test(id)):[]))]}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 const chunks=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]);script=chunks.filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 if(evidence)writeFileSync(resolve(evidence,'inline-module-owners.json'),JSON.stringify({root:resolve('.'),syncOwners},null,2))
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>{await browser?.close();rmSync(peerRoot,{recursive:true,force:true})})
async function open(width=1280,dark=false,newDocument=false){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(4000);page.on('pageerror',(e:Error)=>{errors.push(e.message);if(evidence)writeFileSync(resolve(evidence,'inline-pageerrors.json'),JSON.stringify(errors,null,2))})
 await page.route('http://127.0.0.1/notes-inline', (route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body><header data-ework-notes-session="inline-note"></header><div data-ework-note-view="inline-note"></div></body></html>'}));await page.goto('http://127.0.0.1/notes-inline')
 await page.evaluate(({dark,newDocument}:any)=>{(window as any).saved={title:newDocument?'':'行内 AI 验证',blocks:newDocument?[]:[{id:'before',type:'paragraph',content:'原有前段'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'原有后段'}],yjs:'',revision:0};if(dark)document.body.dataset.dsDarkTheme='true'},{dark,newDocument})
 await page.addScriptTag({content:`var exports={};\n${script}`});await page.locator('.en-title').waitFor();if(!newDocument)await page.evaluate(()=>{const w=window as any;w.editor.replaceBlocks(w.editor.document,w.saved.blocks)});return{context,page,errors}
}
async function cursor(page:any,id='anchor',end=false){await page.evaluate(({id,end}:any)=>{const editor=(window as any).editor;editor.focus();editor.setTextCursorPosition(id,end?'end':'start')},{id,end})}
async function launch(page:any,prompt='写一段关于核验来源的正文'){await cursor(page);await page.keyboard.press('Space');await page.getByRole('textbox',{name:'行内 AI 需求'}).fill(prompt);await page.keyboard.press('Enter');await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1)}
async function finish(page:any,result:any){await page.evaluate((result:any)=>(Object.values((window as any).jobs)[0] as any).resolve(result),result)}
async function inlineMenuLayer(page:any,selector:string){
 await page.locator(selector).waitFor()
 await expect.poll(()=>page.locator(selector).evaluate((element:HTMLElement)=>{for(let current:HTMLElement|null=element;current;current=current.parentElement)if(Number(getComputedStyle(current).opacity)<1)return false;return true})).toBe(true)
 return page.evaluate((selector:string)=>{
  const menu=document.querySelector<HTMLElement>(selector)!,popup=document.querySelector<HTMLElement>('.en-space-ai')!,a=menu.getBoundingClientRect(),b=popup.getBoundingClientRect(),left=Math.max(a.left,b.left),right=Math.min(a.right,b.right),top=Math.max(a.top,b.top),bottom=Math.min(a.bottom,b.bottom),x=(left+right)/2,y=(top+bottom)/2,hit=document.elementFromPoint(x,y)
  const chain=(element:HTMLElement)=>{const result:any[]=[];for(let current:HTMLElement|null=element;current;current=current.parentElement){const style=getComputedStyle(current);result.push({tag:current.tagName,class:current.className,z:style.zIndex,position:style.position,overflow:style.overflow,transform:style.transform})}return result}
  return{overlap:{width:right-left,height:bottom-top,x,y},menuTop:!!hit&&menu.contains(hit),hit:hit?.outerHTML.slice(0,300),menu:chain(menu),popup:chain(popup)}
 },selector)
}

it('opens only at a blank paragraph start without changing the document; Escape restores its cursor and slash remains usable',async()=>{
 const f=await open();try{
  const binding=await f.page.evaluate(()=>(window as any).inlineBindingDiagnostics());if(evidence)writeFileSync(resolve(evidence,'inline-binding-identity.json'),JSON.stringify(binding,null,2));expect(binding.importedState,JSON.stringify({binding,syncOwners})).toBe(true);expect(syncOwners).toHaveLength(1)
  await cursor(f.page);expect(await f.page.locator('.bn-block-outer[data-id="anchor"] .bn-block-content').evaluate((el:Element)=>getComputedStyle(el,':after').content)).toBe('"按 space（空格）以启用 AI，或按“/”启用命令"');const original=await f.page.evaluate(()=>JSON.stringify((window as any).editor.document));await f.page.keyboard.press('Space')
  await f.page.getByRole('textbox',{name:'行内 AI 需求'}).waitFor();expect(await f.page.evaluate(()=>JSON.stringify((window as any).editor.document))).toBe(original)
  expect(await f.page.locator('.en-space-ai-avatar svg').count()).toBe(1)
  await f.page.keyboard.press('Escape');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(await f.page.evaluate(()=>JSON.stringify((window as any).editor.document))).toBe(original)
  await f.page.keyboard.type('/');await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.some((call:any)=>call.method==='menu-sync'))).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('keeps ordinary spaces in nonempty paragraphs, headings, code, selected text, IME and read-only editors',async()=>{
 const f=await open();try{
  await cursor(f.page,'before',true);await f.page.keyboard.press('Space');expect(await f.page.locator('.en-space-ai').count()).toBe(0)
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'head',type:'heading'},{id:'code',type:'codeBlock'}],'after','after')})
  for(const id of ['head','code']){await cursor(f.page,id);await f.page.keyboard.press('Space');expect(await f.page.locator('.en-space-ai').count()).toBe(0)}
  await cursor(f.page);await f.page.locator('.bn-editor').dispatchEvent('keydown',{key:' ',code:'Space',isComposing:true});expect(await f.page.locator('.en-space-ai').count()).toBe(0)
  await cursor(f.page,'before');await f.page.keyboard.press('Shift+ArrowRight');await f.page.keyboard.press('Space');expect(await f.page.locator('.en-space-ai').count()).toBe(0)
  await f.page.evaluate(()=>{(window as any).editor.isEditable=false});await cursor(f.page);await f.page.keyboard.press('Space');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('sends through the real generation bridge with a stable document/block anchor and inserts rich paragraphs there after unrelated edits, then saves and reopens',async()=>{
 const f=await open();try{
  await launch(f.page);const input=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  expect(input).toMatchObject({sessionId:'inline-note',entryPoint:'inline',mode:'write',insertionAnchor:{blockId:'anchor'},capabilityContext:{documentId:input.insertionAnchor.documentId}})
  await f.page.evaluate(()=>{const e=(window as any).editor;e.updateBlock('after',{content:'用户更新后段'});e.setTextCursorPosition('after','end')})
  await finish(f.page,{kind:'text',markdown:'### 来源核验\n\n保留**证据**与时间。'})
  await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.id))).not.toContain('anchor');await expect.poll(()=>f.page.locator('.bn-editor').evaluate((el:Element)=>el===document.activeElement)).toBe(true)
  expect(await f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>[b.type,b.content?.map((s:any)=>s.text||'').join('')]))).toEqual([['paragraph','原有前段'],['heading','来源核验'],['paragraph','保留证据与时间。'],['paragraph','用户更新后段']])
  await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('保留证据与时间。');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户更新后段');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('preserves a newly edited anchor, rejects a deleted anchor and ignores cancelled or hidden-session late results without losing the prompt',async()=>{
 const f=await open();try{
  await launch(f.page,'插入来源核验段落');await f.page.evaluate(()=>(window as any).editor.updateBlock('anchor',{content:'用户的新段落'}));await finish(f.page,{kind:'text',markdown:'生成段落'})
  await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('生成段落用户的新段落')
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'anchor2',type:'paragraph'}],'after','before')});await cursor(f.page,'anchor2');await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('保留这次需求');await f.page.keyboard.press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(2)
  await f.page.evaluate(()=>{const w=window as any;w.editor.removeBlocks(['anchor2']);(Object.values(w.jobs)[1] as any).resolve({kind:'text',markdown:'不得出现在末尾'})})
  await expect.poll(()=>f.page.locator('.en-space-ai [role="alert"]').textContent()).toContain('插入位置');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe('保留这次需求');expect(await f.page.locator('.bn-editor').textContent()).not.toContain('不得出现在末尾')
  await f.page.keyboard.press('Escape');await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'anchor3',type:'paragraph'}],'after','before')});await cursor(f.page,'anchor3');await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('取消中的需求');await f.page.keyboard.press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(3);await f.page.keyboard.press('Escape')
  await f.page.evaluate(()=>(Object.values((window as any).jobs)[2] as any).resolve({kind:'text',markdown:'取消后迟到内容'}));await new Promise(resolve=>setTimeout(resolve,30));expect(await f.page.locator('.bn-editor').textContent()).not.toContain('取消后迟到内容')
  await cursor(f.page,'anchor3');await f.page.keyboard.press('Space');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe('取消中的需求');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('places real client-capability component creation at the captured paragraph, with the existing generator and saved result',async()=>{
 const f=await open();try{
  await launch(f.page,'创建表格，列为项目和值，来源为用户数据：A=2');const request=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  await f.page.evaluate((request:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-note',generationId:request.requestId,requestId:'create-inline-component',context:{documentId:request.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'创建表格，列为项目和值，用户数据A=2'}}})),request)
  await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((j:any)=>j.input.entryPoint==='component').length)).toBe(1)
  expect(await f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.type))).toEqual(['paragraph','research','paragraph','paragraph'])
  await f.page.evaluate(()=>{const w=window as any;(Object.values(w.jobs).find((j:any)=>j.input.entryPoint==='component') as any).resolve({kind:'component',node:{id:'fixture-result',kind:'generated-container',title:'用户数据',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'用户数据',columns:['项目','值'],rows:[['A',2]]}}})})
  await expect.poll(()=>f.page.evaluate(()=>(window as any).replies.find((r:any)=>r.requestId==='create-inline-component'&&r.result)?.result.status)).toBe('succeeded')
  await finish(f.page,{kind:'conversation',markdown:'已根据用户数据创建表格。'});await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.evaluate(()=>JSON.parse((window as any).editor.document.find((b:any)=>b.type==='research').props.payload).containerSpec.rows)).toEqual([['A',2]]);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it.each([{width:1280,dark:false},{width:620,dark:true}])('keeps multiline input inside the note width at $width px and reuses processing UI',async({width,dark})=>{
 const f=await open(width,dark);try{
  await cursor(f.page);await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求'});await input.fill('第一行');await f.page.keyboard.press('Shift+Enter');await f.page.keyboard.type('第二行');expect(await input.inputValue()).toBe('第一行\n第二行')
  const box=await f.page.locator('.en-space-ai').boundingBox(),body=await f.page.locator('.en-document').boundingBox();expect(box.x).toBeGreaterThanOrEqual(body.x-1);expect(box.x+box.width).toBeLessThanOrEqual(body.x+body.width+1);await expect.poll(async()=>{const after=await f.page.locator('.bn-block-outer[data-id="after"]').boundingBox(),composer=await f.page.locator('.en-space-ai').boundingBox();return after.y-composer.y-composer.height}).toBeGreaterThanOrEqual(0)
  if(evidence)await f.page.screenshot({path:resolve(evidence,`inline-${width}-${dark?'dark':'light'}.png`)})
  await f.page.keyboard.press('Enter');await f.page.locator('.en-space-ai .en-ai-loading .en-ai-spinner').waitFor();expect(await f.page.locator('.en-ai-loading').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})

it('invalidates a deleted and recreated paragraph even when it reuses the block ID',async()=>{
 const f=await open();try{
  await launch(f.page);await f.page.evaluate(()=>{const e=(window as any).editor;e.removeBlocks(['anchor']);e.insertBlocks([{id:'anchor',type:'paragraph'}],'after','before')});await finish(f.page,{kind:'text',markdown:'不得落入替代段落'});await expect.poll(()=>f.page.locator('.en-space-ai [role="alert"]').textContent()).toContain('插入位置');expect(await f.page.locator('.bn-editor').textContent()).not.toContain('不得落入替代段落')
 }finally{await f.context.close()}
})
it('retains the original request and prompt if Space is pressed in another blank paragraph during generation',async()=>{
 const f=await open();try{
  await launch(f.page,'原需求');await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'second',type:'paragraph'}],'after','after')});await cursor(f.page,'second');await f.page.keyboard.press('Space');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).count()).toBe(0);expect(await f.page.locator('.en-space-ai .en-ai-loading').count()).toBe(1);expect(await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input.prompt)).toBe('原需求');expect(await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input.insertionAnchor.blockId)).toBe('anchor');await finish(f.page,{kind:'text',markdown:'回到原位置'});await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.content?.map((i:any)=>i.text).join('')||''))).toEqual(['原有前段','回到原位置','原有后段',' '])
 }finally{await f.context.close()}
})
it('does not apply a child component model result after the originating paragraph was deleted',async()=>{
 const f=await open();try{
  await launch(f.page,'创建数据表格');const request=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input);await f.page.evaluate((request:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-note',generationId:request.requestId,requestId:'child-after-delete',context:{documentId:request.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'创建数据表格 A=2'}}})),request);await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((j:any)=>j.input.entryPoint==='component').length)).toBe(1)
  await f.page.evaluate(()=>{const w=window as any;w.editor.removeBlocks(['anchor']);(Object.values(w.jobs).find((j:any)=>j.input.entryPoint==='component') as any).resolve({kind:'component',node:{id:'late',kind:'generated-container',title:'过期组件',containerSpec:{version:1,type:'table',title:'过期组件',columns:['A'],rows:[[2]]}}})});await expect.poll(()=>f.page.evaluate(()=>(window as any).replies.some((r:any)=>r.requestId==='child-after-delete'&&r.result))).toBe(true);expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').some((b:any)=>JSON.parse(b.props.payload).containerSpec))).toBe(false)
 }finally{await f.context.close()}
})
it('keeps the demand through a transport failure, supports IME Enter and retries at the same position',async()=>{
 const f=await open();try{
  await launch(f.page,'保留并重试的需求');await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).reject(Error('模型临时不可用')));await f.page.locator('.en-space-ai [role="alert"]').waitFor();const input=f.page.getByRole('textbox',{name:'行内 AI 需求'});expect(await input.inputValue()).toBe('保留并重试的需求');await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});expect(await f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1);await input.dispatchEvent('compositionend');await f.page.getByRole('button',{name:'发送行内 AI 需求'}).click();await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(2)
  await f.page.evaluate(()=>(Object.values((window as any).jobs)[1] as any).resolve({kind:'component',node:{id:'fixture-direct',kind:'generated-container',title:'原位组件',containerSpec:{version:1,type:'table',title:'原位组件',columns:['A'],rows:[[2]]}}}));await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.type))).toEqual(['paragraph','research','paragraph']);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('ignores a late result after switching to a different note document',async()=>{
 const f=await open();try{
  await launch(f.page,'旧笔记需求');await f.page.evaluate(()=>{const w=window as any;w.saved={title:'另一份笔记',blocks:[],yjs:'',revision:0};document.querySelector('header')!.setAttribute('data-ework-notes-session','other-note');document.querySelector('[data-ework-note-view]')!.setAttribute('data-ework-note-view','other-note')});await expect.poll(()=>f.page.locator('.en-title').inputValue()).toBe('另一份笔记');await finish(f.page,{kind:'text',markdown:'旧请求迟到内容'});await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((c:any)=>c.method==='stop').length)).toBeGreaterThan(0);expect(await f.page.locator('.bn-editor').textContent()).not.toContain('旧请求迟到内容');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('keeps referenced component data and authorized attachment identity in the real inline generation request',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'source-table',type:'research',props:{payload:JSON.stringify({id:'note-component-source',kind:'generated-container',title:'证据表',containerSpec:{version:1,type:'table',title:'证据表',columns:['收入'],rows:[[123]]}})}},{id:'source-file',type:'attachment',props:{payload:JSON.stringify({id:'note-file-fixture',name:'证据.txt',authorizationId:'fixture-grant',importStatus:'ready'})}}],'after','after')});await launch(f.page,'根据笔记中的数据和附件写总结');const input=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  expect(JSON.parse(input.context.components.find((c:any)=>c.blockId==='source-table').content).spec.rows).toEqual([[123]]);expect(input.context.components.find((c:any)=>c.blockId==='source-file').file).toEqual({nodeId:'note-file-fixture',authorizationId:'fixture-grant'});expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('keeps Space in existing smart and link component inputs even when ProseMirror retains an empty paragraph selection',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks(['smart','link'].map(id=>({id:'draft-'+id,type:'research',props:{payload:JSON.stringify({id:'note-component-'+id,kind:'generated-container',title:id,noteDraft:id,containerPrompt:'已有需求',generationStatus:'draft'})}})),'after','after')})
  for(const id of ['smart','link']){
   await cursor(f.page);const input=f.page.locator('.bn-block-outer[data-id="draft-'+id+'"] textarea');await input.click();expect(await f.page.evaluate(()=>{const s=(window as any).editor._tiptapEditor.state.selection;return s.empty&&s.$from.parent.type.name==='paragraph'&&s.$from.parent.content.size===0})).toBe(true)
   await f.page.keyboard.press('End');await f.page.keyboard.press('Space');expect(await input.inputValue()).toBe('已有需求 ');expect(await f.page.locator('.en-space-ai').count()).toBe(0)
  }
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})

it.each(['pristine','save-after-capture','save-reopen','persisted-only-paragraph'])('submits inline AI in a new note with its only blank paragraph through %s lifecycle',async lifecycle=>{
 const f=await open(1280,false,true);try{
  if(lifecycle==='persisted-only-paragraph')await f.page.evaluate(()=>{const e=(window as any).editor;e.replaceBlocks(e.document,[{id:'only',type:'paragraph'}])})
  if(lifecycle==='save-reopen'){await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await f.page.locator('.en-title').waitFor()}
  const id=await f.page.evaluate(()=>(window as any).editor.document[0].id);await cursor(f.page,id);const before=await f.page.evaluate(()=>(window as any).inlineAnchorDiagnostics());await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).waitFor()
  if(lifecycle==='save-after-capture')await f.page.evaluate(()=>(window as any).fixture.flush());const captured=await f.page.evaluate(()=>(window as any).inlineAnchorDiagnostics());if(evidence)writeFileSync(resolve(evidence,`new-note-${lifecycle}.json`),JSON.stringify({before,captured},null,2))
  await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('插入一个行情组件');await f.page.keyboard.press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1);expect(await f.page.locator('.en-space-ai [role="alert"]').count()).toBe(0)
  await finish(f.page,{kind:'text',markdown:'原位测试段落'});await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('原位测试段落');await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('原位测试段落');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('shows a compact inline input with only its own caret and restores the body caret after Escape',async()=>{
 const f=await open();try{
  await cursor(f.page);const body=f.page.locator('.bn-block-outer[data-id="anchor"] .bn-inline-content'),before=await body.evaluate((el:Element)=>getComputedStyle(el).caretColor),other=await f.page.locator('.bn-block-outer[data-id="before"] .bn-inline-content').evaluate((el:Element)=>getComputedStyle(el).caretColor);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).waitFor();expect(await f.page.locator('.en-space-ai footer').count()).toBe(0);expect(await body.evaluate((el:Element)=>getComputedStyle(el).caretColor)).toBe('rgba(0, 0, 0, 0)');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).evaluate((el:Element)=>getComputedStyle(el).caretColor)).not.toBe('rgba(0, 0, 0, 0)');expect(await f.page.locator('.bn-block-outer[data-id="before"] .bn-inline-content').evaluate((el:Element)=>getComputedStyle(el).caretColor)).toBe(other);if(evidence)await f.page.screenshot({path:resolve(evidence,'compact-inline-caret.png')});await f.page.keyboard.press('Escape');expect(await body.evaluate((el:Element)=>getComputedStyle(el).caretColor)).toBe(before);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('creates a real component capability at the new note’s first paragraph and saves it without invalidating the anchor',async()=>{
 const f=await open(1280,false,true);try{
  const id=await f.page.evaluate(()=>(window as any).editor.document[0].id);await cursor(f.page,id);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('插入一个行情组件');await f.page.keyboard.press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1);const request=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  await f.page.evaluate((request:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-note',generationId:request.requestId,requestId:'new-note-component',context:{documentId:request.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'创建用户提供的行情表 A=2'}}})),request);await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).some((j:any)=>j.input.entryPoint==='component'))).toBe(true)
  await f.page.evaluate(()=>(Object.values((window as any).jobs).find((j:any)=>j.input.entryPoint==='component') as any).resolve({kind:'component',node:{id:'fixture-first-component',kind:'generated-container',title:'用户行情',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'用户行情',columns:['项目','值'],rows:[['A',2]]}}}));await expect.poll(()=>f.page.evaluate(()=>(window as any).replies.find((r:any)=>r.requestId==='new-note-component'&&r.result)?.result.status)).toBe('succeeded');await finish(f.page,{kind:'conversation',markdown:'已创建。',capabilityReceipts:[{requestId:'new-note-component',capability:'notes.components.create',status:'succeeded'}]});await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0);await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.evaluate(()=>JSON.parse((window as any).editor.document.find((b:any)=>b.type==='research').props.payload).containerSpec.rows)).toEqual([['A',2]]);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('keeps new-note materialization out of undo and still rejects deletion followed by reuse of the initial block ID',async()=>{
 const f=await open(1280,false,true);try{
  const prior=await f.page.evaluate(()=>{const e=(window as any).editor,s=e._tiptapEditor.state,u=s.plugins.find((p:any)=>p.key.startsWith('y-undo'))?.getState(s).undoManager;return{document:JSON.stringify(e.document),undo:u.undoStack.length,redo:u.redoStack.length,id:e.document[0].id}});await cursor(f.page,prior.id);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).waitFor();expect(await f.page.evaluate(()=>{const e=(window as any).editor,s=e._tiptapEditor.state,u=s.plugins.find((p:any)=>p.key.startsWith('y-undo'))?.getState(s).undoManager;return{document:JSON.stringify(e.document),undo:u.undoStack.length,redo:u.redoStack.length,id:e.document[0].id}})).toEqual(prior)
  await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('保留初始段落需求');await f.page.evaluate((id:string)=>{const e=(window as any).editor;e.insertBlocks([{id:'survivor',type:'paragraph',content:'保留的用户正文'}],id,'after');e.removeBlocks([id]);e.insertBlocks([{id,type:'paragraph'}],'survivor','before')},prior.id);await f.page.getByRole('button',{name:'发送行内 AI 需求'}).click();await expect.poll(()=>f.page.locator('.en-space-ai [role="alert"]').textContent()).toContain('原插入位置');expect(await f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(0);expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe('保留初始段落需求');expect(await f.page.locator('.bn-editor').textContent()).toContain('保留的用户正文');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it('replaces a submitted multiline draft with one compact processing row and retains it through failure and stop',async()=>{
 const f=await open();try{
  const prompt=Array.from({length:12},(_,i)=>'第'+(i+1)+'行需求').join('\n');await cursor(f.page);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill(prompt);await f.page.getByRole('button',{name:'发送行内 AI 需求'}).click();await f.page.locator('.en-space-ai .en-ai-loading .en-ai-spinner').waitFor();expect(await f.page.locator('.en-space-ai textarea').count()).toBe(0);expect(await f.page.locator('.en-space-ai footer').count()).toBe(0);expect((await f.page.locator('.en-space-ai').boundingBox()).height).toBeLessThan(70);expect(await f.page.getByRole('button',{name:'停止',exact:true}).isVisible()).toBe(true);expect(await f.page.locator('.en-space-ai-avatar,.en-space-ai-send').count()).toBe(0);expect(await f.page.locator('.en-space-ai .en-ai-loading').textContent()).toContain('正在工作…');expect(await f.page.locator('.bn-block-outer[data-id="anchor"] .bn-inline-content').evaluate((el:Element)=>getComputedStyle(el).caretColor)).toBe('rgba(0, 0, 0, 0)');if(evidence)await f.page.screenshot({path:resolve(evidence,'compact-working.png')})
  await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).reject(Error('临时失败')));await expect.poll(()=>f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe(prompt);expect(await f.page.locator('.en-space-ai .en-ai-loading').count()).toBe(0);await f.page.getByRole('button',{name:'发送行内 AI 需求'}).click();await f.page.getByRole('button',{name:'停止',exact:true}).click();expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe(prompt);expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).evaluate((el:Element)=>el===document.activeElement)).toBe(true);expect(await f.page.locator('.en-space-ai .en-ai-loading').count()).toBe(0);await f.page.keyboard.press('Escape');expect(await f.page.locator('.en-space-ai').count()).toBe(0);await cursor(f.page);await f.page.keyboard.press('Space');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe(prompt);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it.each([false,true])('keeps the real paragraph color submenu and formatting toolbar above inline AI in dark=%s',async dark=>{
 const f=await open(1280,dark);try{
  await cursor(f.page);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求'}).fill('保留行内需求')
  const inspect=async(selector:string,name:string)=>{const layer=await inlineMenuLayer(f.page,selector);if(evidence){writeFileSync(resolve(evidence,`${name}-${dark?'dark':'light'}.json`),JSON.stringify(layer,null,2));await f.page.screenshot({path:resolve(evidence,`${name}-${dark?'dark':'light'}.png`)})}expect(layer.overlap.width).toBeGreaterThan(20);expect(layer.overlap.height).toBeGreaterThan(5);expect.soft(layer.menuTop,JSON.stringify(layer)).toBe(true)}
  const colors=async(name='color-menu')=>{await f.page.locator('.bn-block-outer[data-id="before"]').hover();await f.page.getByRole('button',{name:'打开菜单',exact:true}).click();await f.page.getByRole('menuitem',{name:'颜色',exact:true}).hover();await inspect('.bn-color-picker-dropdown',name)}
  await colors()
  await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();await cursor(f.page,'after');await f.page.keyboard.press('Shift+End');await inspect('.bn-formatting-toolbar','format-toolbar')
  await f.page.locator('.bn-block-outer[data-id="before"] .bn-inline-content').click();await f.page.locator('.bn-block-outer[data-id="before"]').hover();await f.page.getByRole('button',{name:'段落操作',exact:true}).click();await inspect('.en-block-menu','paragraph-menu')
  await f.page.locator('.bn-block-outer[data-id="before"] .bn-inline-content').click();await f.page.locator('.en-document-scroll').evaluate((element:HTMLElement)=>element.scrollTop=60);await colors('color-menu-scrolled');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求'}).inputValue()).toBe('保留行内需求');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
