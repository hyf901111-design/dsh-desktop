import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {installConversationComponentHandlers} from '../src/main/conversation-components/ipc'
import {installNotesService} from '../src/main/notes/service'
import {NotesStore} from '../src/main/notes/store'
import {ResearchCanvasClipboard} from '../src/main/state/research-canvas-clipboard'
import {ComponentLibraryStore} from '../src/main/state/component-library'
import {normalizeConversationComponentArtifact} from '../packages/dsh-research-task-runtime/conversation-component-contract.js'

vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const evidence='/tmp/sherlock-component-retained-menus-20261029',sessionId='retained-actions',owner='retained-owner',entry='\0retained-component-actions'
let browser:any,script=''
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
 const source=notesResidentProductionSource({conversation:true}).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__RetainedNoteViews=EWorkNoteComponentViews;exports.__RetainedConversation=ConversationComponentCard;exports.__RetainedOwner=value=>sherlockBoardsAdapter=value;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'retained-component-actions',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {NotesApp} from ${JSON.stringify(resolve('src/preload/notes/editor.tsx'))};import {createConversationComponentsBridge} from ${JSON.stringify(resolve('src/preload/conversation-components.ts'))};
 import noteCss from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};import blockCss from '@blocknote/mantine/style.css?inline';
 import gridCss from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};import financialCss from ${JSON.stringify(resolve('scripts/lib/financial-widget.css')+'?inline')};import paletteCss from ${JSON.stringify(resolve('scripts/lib/workbench-style.css')+'?inline')};
 const style=document.createElement('style');style.textContent=[gridCss,financialCss,paletteCss,blockCss,noteCss].join(String.fromCharCode(10));document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 library.__RetainedOwner({getState:()=>({account:{generation:1,user:{userId:${JSON.stringify(owner)}}}}),getView:()=>({connection:'online',permissions:{edit:true}}),subscribe:()=>()=>{}});
 const invoke=async(channel,...args)=>{const response=await fetch('/retained-actions-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,args})}),value=await response.json();if(value.error)throw Error(value.error);return value.result};
 const bridge={request:(method,input)=>invoke('notes:request',method,{...input,owner:${JSON.stringify(owner)}}),draft:input=>invoke('notes:request','draft',{...input,owner:${JSON.stringify(owner)}})};
 window.dshDesktop={conversationComponents:createConversationComponentsBridge(invoke)};window.frameLoads=0;document.addEventListener('load',event=>{if(event.target?.matches?.('iframe[data-research-html-artifact]'))window.frameLoads++},true);
 let root,flush=async()=>{};const saveBinding={ready:value=>{flush=value},dispose:value=>{if(flush===value)flush=async()=>{}}};
 window.mountRetained=()=>{root=createRoot(document.querySelector('#retained'));root.render(window.retainedSurface==='notes'?React.createElement(NotesApp,{sessionId:${JSON.stringify(sessionId)},bridge,dark:false,active:true,saveBinding,navigate:()=>{}}):React.createElement(library.__RetainedConversation,{sessionId:${JSON.stringify(sessionId)},manifest:window.retainedManifest}))};
 window.flushRetained=()=>flush();window.reopenRetained=async()=>{await flush();root.unmount();await new Promise(resolve=>setTimeout(resolve,30));window.mountRetained()};
 if(window.retainedSurface==='notes')createRoot(document.querySelector('#portals')).render(React.createElement(library.__RetainedNoteViews,{sessionId:${JSON.stringify(sessionId)},active:true}));window.mountRetained();
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.retainedEditor=editor;window.retainedDoc=doc;window.retainedProposals=proposals; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())

const chart={version:1,type:'chart',variant:'line',title:'三条演示数据',labels:['十月一日','十月二日','十月三日'],series:[{name:'演示值',values:[10,20,15]}]}
const table={version:1,type:'table',title:'长表演示记录',columns:['记录名称','演示值'],rows:Array.from({length:80},(_,i)=>['真实记录 '+String(i+1).padStart(2,'0'),[10,20,15][i%3]])}
async function artifact(kind:string){return kind==='html'?{version:1,type:'html',title:'原位图表验收二',html:await readFile(resolve('test/fixtures/notes-offline-shared-chart.html'),'utf8')}:kind==='table'?table:chart}
async function open(surface:'notes'|'conversation',kind='chart',{readOnly=false,noAdapters=false}={}){
 const root=await mkdtemp(join(evidence,surface+'-'+kind+'-')),libraryFile=join(root,'library.json'),library=new ComponentLibraryStore(libraryFile);await library.load()
 let clipboardText='',clipboardHtml='';const clips=new ResearchCanvasClipboard({userDataPath:root,registry:{} as any,revealFile:()=>{},clipboard:{availableFormats:()=>[],readBuffer:()=>Buffer.alloc(0),readText:()=>clipboardText,readHTML:()=>clipboardHtml,readImage:()=>({isEmpty:()=>true,toPNG:()=>Buffer.alloc(0),getSize:()=>({width:0,height:0})}),write:value=>{clipboardText=value.text;clipboardHtml=value.html}}})
 const handlers=new Map<string,any>(),webContents={mainFrame:{processId:1,routingId:2},send:()=>{}},hostWindow={isDestroyed:()=>false,webContents},event={sender:webContents,senderFrame:webContents.mainFrame},ipcMain={handle:(channel:string,handler:any)=>handlers.set(channel,handler),removeHandler:(channel:string)=>{handlers.delete(channel)}}
 const calls:any[]=[],exports:string[]=[],dialogs:any[]=[],files={showSaveDialog:async(options:any)=>{dialogs.push(options);const format=options.filters[0].extensions[0],filePath=join(root,'export-'+String(exports.length+1)+'.'+format);exports.push(filePath);return{canceled:false,filePath}},writeFile}
 const data:any=await artifact(kind),normalized=normalizeConversationComponentArtifact({artifact:data}),noteStore=new NotesStore(join(root,'notes')),conversationFile=join(root,'conversation.json'),conversationStore=new ConversationComponentStore(conversationFile);await conversationStore.load()
 let manifest:any,target:any,dispose:()=>void
 if(surface==='notes'){
  const node={id:'retained-node',kind:'generated-container',noteLibrary:true,title:normalized.title,generationStatus:'completed',width:normalized.preferredSize.width,height:normalized.preferredSize.height,containerSpec:normalized.containerSpec}
  noteStore.save(owner,sessionId,0,{title:'真实保留操作验收',blocks:[{id:'before',type:'paragraph',content:'用户既有市场观察，必须保留。'},{id:'component',type:'research',props:{payload:JSON.stringify(node)}},{id:'anchor',type:'paragraph'}],yjs:''})
  dispose=installNotesService({ipcMain,getWindow:()=>hostWindow,root:join(root,'notes'),owner:()=>owner,canRead:id=>id===sessionId,canWrite:()=>!readOnly,runtimeUrl:()=>undefined,clipboard:()=>noAdapters?undefined:clips,library:()=>noAdapters?undefined:library,...noAdapters?{}:{exportFiles:files}})
 }else{
  const service=createConversationComponentService({store:conversationStore,owner:()=>owner,canReadSession:id=>id===sessionId,canWriteSession:()=>!readOnly,currentVisibleContext:()=>({ownerAccountId:owner,sessionId,mode:'conversation',generation:'window'}),nativeQuery:async()=>{throw Error('No real provider is used in retained-action fixtures')},clipboard:()=>noAdapters?undefined:clips,library:()=>noAdapters?undefined:library,...noAdapters?{}:{exportFiles:files}})
  // Seeding is a trusted fixture action; readonly is enabled for the rendered host afterwards.
  const seed=await conversationStore.create({artifact:data},{ownerAccountId:owner,sessionId,turnId:'fixture',mode:'conversation',windowGeneration:'window',current:()=>true},'seed')
  target={sessionId,componentId:seed.effect.componentId};manifest=seed.data.renderManifest;dispose=installConversationComponentHandlers({ipcMain,getWindow:()=>hostWindow,service})
 }
 const context=await browser.newContext({viewport:{width:1100,height:950}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(7000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('http://127.0.0.1/retained-actions',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><body style="margin:0;background:#edf0f3"><header data-ework-notes-session="${sessionId}"></header><section class="${surface==='notes'?'en-root':''}" data-dark="false" style="position:relative;width:900px;min-height:850px;margin:20px auto"><div id="retained" class="${surface==='notes'?'en-editor-host':''}" style="width:100%;height:850px"></div></section><div id="portals"></div></body></html>`}))
 await page.route('**/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.route('http://127.0.0.1/retained-actions-api',async(route:any)=>{const packet=route.request().postDataJSON();calls.push(packet);try{const handler=handlers.get(packet.channel);if(!handler)throw Error('Unexpected IPC '+packet.channel);const result=await handler(event,...packet.args);packet.outcome=packet.args[0]==='component-menu-capabilities'?result:{status:result?.status,ok:true};await route.fulfill({contentType:'application/json',body:JSON.stringify({result})})}catch(error){packet.outcome={error:(error as Error).message};await route.fulfill({contentType:'application/json',body:JSON.stringify({error:(error as Error).message})})}})
 await page.goto('http://127.0.0.1/retained-actions');await page.evaluate((value:any)=>Object.assign(window,{retainedSurface:value.surface,retainedManifest:value.manifest,retainedSeed:value.seed}),{surface,manifest,seed:surface==='notes'?noteStore.load(owner,sessionId).saved:undefined});await page.addScriptTag({content:'var exports={};\n'+script})
 if(surface==='notes'){await page.locator('.en-title').waitFor();await page.evaluate(async()=>{const w=window as any;w.retainedEditor.replaceBlocks(w.retainedEditor.document,w.retainedSeed.blocks);await w.flushRetained()})}
 const card=page.locator(surface==='notes'?'.en-document-scroll .bn-editor [data-id="component"] .en-native-component':'.ew-conversation-component')
 try{await card.waitFor();await card.getByRole('button',{name:'组件更多操作',exact:true}).waitFor()}catch(error){await page.screenshot({path:join(root,'open-error.png'),fullPage:true});await writeFile(join(root,'open-error.html'),await page.content());await writeFile(join(root,'open-errors.json'),JSON.stringify({errors,calls},null,2));await context.close();dispose();throw error}
 const readView=()=>surface==='notes'?JSON.parse((noteStore.load(owner,sessionId).saved.blocks.find((block:any)=>block.id==='component') as any).props.payload):conversationStore.read(owner,target).node
 const readDisk=async()=>{if(surface==='notes')return new NotesStore(join(root,'notes')).load(owner,sessionId).saved;const store=new ConversationComponentStore(conversationFile);await store.load();return store.read(owner,target)}
 return{root,surface,page,card,errors,clips,library,libraryFile,dialogs,exports,calls,readView,readDisk,readSaved:()=>noteStore.load(owner,sessionId).saved,frame:page.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview'),close:async()=>{await page.screenshot({path:join(root,'final.png'),fullPage:true});await context.close();dispose()}}
}
async function menu(f:any){await f.card.getByRole('button',{name:'组件更多操作',exact:true}).click();const menu=f.page.getByRole('menu',{name:'组件更多操作',exact:true});try{await menu.waitFor()}catch(error){await writeFile(join(f.root,'menu-error.json'),JSON.stringify({errors:f.errors,calls:f.calls.map((call:any)=>({channel:call.channel,method:call.args[0],outcome:call.outcome})),dom:await f.card.evaluate((element:HTMLElement)=>({html:element.outerHTML.slice(0,2000),menus:[...document.querySelectorAll('[role=menu]')].map(menu=>({text:menu.textContent,display:getComputedStyle(menu).display}))}))},null,2));throw error}return menu}
async function choose(f:any,label:string){await (await menu(f)).getByRole('menuitem',{name:label,exact:true}).click()}
async function exportAs(f:any,format:string){const before=f.exports.length,m=await menu(f);await m.getByRole('menuitem',{name:'导出',exact:true}).click();await f.page.getByRole('menu',{name:'导出格式',exact:true}).getByRole('menuitem',{name:format.toUpperCase(),exact:true}).click();await expect.poll(()=>f.exports.length).toBe(before+1);await expect.poll(async()=>{try{return(await readFile(f.exports.at(-1))).length}catch{return 0}}).toBeGreaterThan(30);await expect.poll(()=>f.page.getByRole('menu',{name:'组件更多操作',exact:true}).count()).toBe(0);return f.exports.at(-1) as string}
async function pixels(page:any,file:string){
 const type=file.endsWith('.jpg')?'image/jpeg':file.endsWith('.svg')?'image/svg+xml':'image/png',src='data:'+type+';base64,'+(await readFile(file)).toString('base64')
 return page.evaluate(async(src:string)=>{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Exported image is not decodable'));image.src=src});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set<number>();let visible=0,dark=0;for(let i=0;i<data.length;i+=4){if(data[i+3]!>30){visible++;if(Math.min(data[i]!,data[i+1]!,data[i+2]!)<170)dark++;colors.add((data[i]!>>3)*1024+(data[i+1]!>>3)*32+(data[i+2]!>>3))}}return{width:canvas.width,height:canvas.height,colors:colors.size,visible,dark}},src)
}

it.each(['notes','conversation'] as const)('uses real %s clipboard, reopens the saved library and exports a durable renamed card',async surface=>{
 const f=await open(surface);try{
  await choose(f,'重命名');const rename=f.page.getByRole('dialog',{name:'重命名组件',exact:true});await rename.getByRole('textbox',{name:'组件名称',exact:true}).fill('真实保留的新名称');await rename.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>f.readView().title).toBe('真实保留的新名称')
  await choose(f,'复制组件');await expect.poll(async()=>(await f.clips.read()).kind).toBe('components');const copied=await f.clips.read();if(copied.kind!=='components')throw Error('Expected actual component clipboard');expect(copied.nodes[0]).toMatchObject({title:'真实保留的新名称',displayName:'真实保留的新名称',containerSpec:f.readView().containerSpec})
  await choose(f,'添加至组件库');await expect.poll(()=>f.library.list().length).toBe(1);const reopened=new ComponentLibraryStore(f.libraryFile);await reopened.load();expect(reopened.list()[0]?.name).toBe('真实保留的新名称');expect((await f.readDisk() as any).node?.title??JSON.parse((await f.readDisk() as any).blocks.find((block:any)=>block.id==='component').props.payload).title).toBe('真实保留的新名称')
  const path=await exportAs(f,'svg'),content=await readFile(path,'utf8');expect(f.dialogs.at(-1).defaultPath).toBe('真实保留的新名称.svg');expect(content).toContain('<svg');expect(content).toMatch(/<(?:path|polyline|circle)\b/);expect(content).toContain('十月');expect((await pixels(f.page,path)).dark).toBeGreaterThan(100)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)

it.each(['notes','conversation'] as const)('exports real %s long-table data and nonempty decoded PNG/JPG pixels',async surface=>{
 const f=await open(surface,'table');try{
  await f.card.getByText('真实记录 01',{exact:true}).waitFor();const svg=await exportAs(f,'svg');expect(await readFile(svg,'utf8')).toContain('真实记录 01')
  for(const format of ['png','jpg']){const path=await exportAs(f,format),stats=await pixels(f.page,path);expect(stats.width).toBeGreaterThan(100);expect(stats.height).toBeGreaterThan(100);expect(stats.colors).toBeGreaterThan(12);expect(stats.dark).toBeGreaterThan(500);await writeFile(join(f.root,format+'-pixels.json'),JSON.stringify(stats,null,2))}
  const last=f.card.getByText('真实记录 80',{exact:true});await last.scrollIntoViewIfNeeded();expect(await last.isVisible()).toBe(true);const end=await exportAs(f,'svg');expect(await readFile(end,'utf8')).toContain('真实记录 80');expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)

it.each(['notes','conversation'] as const)('keeps the same %s iframe/document while enlarged and persists native details plus semantic input after closing/reopening',async surface=>{
 const f=await open(surface,'html');try{
  const input=f.frame.locator('#accept-note');await input.waitFor();if(surface==='notes')await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  await f.page.locator('iframe[data-research-html-artifact]').evaluate((frame:HTMLIFrameElement)=>{(window as any).retainedFrame=frame});await f.frame.locator('body').evaluate((body:HTMLElement)=>{body.dataset.retainedIdentity='same-document'})
  await choose(f,'放大阅读');await expect.poll(()=>f.card.getAttribute('data-component-reading')).toBe('true');await input.fill('放大阅读中写下的真实持久备注');await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(()=>f.readView().config?.sharedComponentState?.state?.note).toBe('放大阅读中写下的真实持久备注');await expect.poll(()=>Object.keys(f.readView().config?.interactionState?.events??{}).length).toBeGreaterThan(0)
  expect(await f.page.evaluate(()=>(window as any).retainedFrame===document.querySelector('iframe[data-research-html-artifact]'))).toBe(true);expect(await f.frame.locator('body').getAttribute('data-retained-identity')).toBe('same-document')
  const exported=await exportAs(f,'svg'),text=await readFile(exported,'utf8');expect(text).toContain('10月1日');expect(text).toContain('放大阅读中写下的真实持久备注');expect(text).toMatch(/<(?:path|polyline|circle)\b/)
  for(const format of ['svg','png','jpg']){const path=format==='svg'?exported:await exportAs(f,format),stats=await pixels(f.page,path);expect(stats.colors).toBeGreaterThan(12);expect(stats.dark).toBeGreaterThan(100);await writeFile(join(f.root,format+'-pixels.json'),JSON.stringify(stats,null,2))}
  await f.page.getByRole('button',{name:'关闭放大阅读',exact:true}).click();await expect.poll(()=>f.card.getAttribute('data-component-reading')).toBeNull();expect(await f.frame.locator('body').getAttribute('data-retained-identity')).toBe('same-document')
  await f.page.evaluate(()=>(window as any).reopenRetained());await input.waitFor();await expect.poll(()=>input.inputValue()).toBe('放大阅读中写下的真实持久备注');expect(await f.frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},50000)

it.each(['notes','conversation'] as const)('keeps real %s readonly reads/copy/export and hides absent host adapters',async surface=>{
 const f=await open(surface,'chart',{readOnly:true});try{const m=await menu(f);expect(await m.getByRole('menuitem',{name:'复制组件',exact:true}).count()).toBe(1);expect(await m.getByRole('menuitem',{name:'导出',exact:true}).count()).toBe(1);expect(await m.getByRole('menuitem',{name:'重命名',exact:true}).count()).toBe(0);expect(await m.getByRole('menuitem',{name:'添加至组件库',exact:true}).count()).toBe(0);await m.getByRole('menuitem',{name:'复制组件',exact:true}).click();expect((await f.clips.read()).kind).toBe('components');expect((await pixels(f.page,await exportAs(f,'png'))).dark).toBeGreaterThan(100);expect(f.library.list()).toEqual([]);expect(f.errors).toEqual([])}finally{await f.close()}
 const absent=await open(surface,'chart',{noAdapters:true});try{const m=await menu(absent);for(const name of ['复制组件','添加至组件库','导出'])expect(await m.getByRole('menuitem',{name,exact:true}).count()).toBe(0);expect(absent.errors).toEqual([])}finally{await absent.close()}
},45000)

it.each(['notes','conversation'] as const)('contains keyboard focus in real %s snapshot and rename dialogs and closes them with Escape',async surface=>{
 const f=await open(surface);try{
  await choose(f,'数据源与自动更新');const data=f.page.getByRole('dialog',{name:'组件数据源与自动更新',exact:true}),close=data.getByRole('button',{name:'关闭数据源与自动更新',exact:true});await data.waitFor()
  await expect.poll(()=>data.evaluate((element:HTMLElement)=>element.contains(document.activeElement))).toBe(true)
  expect(await close.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  for(const key of ['Tab','Shift+Tab','Tab']){await f.page.keyboard.press(key);expect(await data.evaluate((element:HTMLElement)=>element.contains(document.activeElement))).toBe(true)}
  await f.page.keyboard.press('Escape');await expect.poll(()=>data.count()).toBe(0)
  await choose(f,'重命名');const rename=f.page.getByRole('dialog',{name:'重命名组件',exact:true}),input=rename.getByRole('textbox',{name:'组件名称',exact:true}),save=rename.getByRole('button',{name:'保存',exact:true});await rename.waitFor()
  expect(await input.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  expect(await input.evaluate((element:HTMLInputElement)=>element.selectionStart===0&&element.selectionEnd===element.value.length)).toBe(true)
  await f.page.keyboard.press('Shift+Tab');expect(await save.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  await f.page.keyboard.press('Tab');expect(await input.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  await rename.focus();await f.page.keyboard.press('Shift+Tab');expect(await save.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  await rename.focus();await f.page.keyboard.press('Tab');expect(await input.evaluate((element:HTMLElement)=>element===document.activeElement)).toBe(true)
  await f.page.keyboard.press('Escape');await expect.poll(()=>rename.count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)

it('marks a real BlockNote/Yjs AI result dirty after manual menu rename and preserves it through proposal undo and disk reopen',async()=>{
 const f=await open('notes');try{
  await f.page.evaluate(()=>{const w=window as any,e=w.retainedEditor,p=w.retainedProposals,b=e.getBlock('component'),node=JSON.parse(b.props.payload);p.begin('retained-owned-result','测试已有AI结果的人工重命名',{blockId:'anchor'});p.run(()=>e.updateBlock(b,{props:{payload:JSON.stringify({...node,title:'AI生成的初始名称'})}}));p.finish('retained-owned-result',false,'已生成1个组件','component')})
  await writeFile(join(f.root,'ledger-dom.json'),JSON.stringify(await f.page.evaluate(()=>[...document.querySelectorAll('.en-native-component')].map(element=>({parent:element.parentElement?.className,block:element.closest('[data-id]')?.getAttribute('data-id'),display:getComputedStyle(element).display,visible:element.getBoundingClientRect().height,html:element.outerHTML.slice(0,600)}))),null,2))
  await expect.poll(()=>f.card.locator(':scope > header').textContent()).toContain('AI生成的初始名称');await f.page.evaluate(()=>(window as any).flushRetained())
  await menu(f);await f.page.keyboard.press('Escape');await expect.poll(()=>f.page.getByRole('menu',{name:'组件更多操作',exact:true}).count()).toBe(0)
  await f.card.locator(':scope > header .en-native-component-title').click();await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor()
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).focus();await f.page.keyboard.press('Escape');await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0)
  await menu(f);await f.page.keyboard.press('Escape');await expect.poll(()=>f.page.getByRole('menu',{name:'组件更多操作',exact:true}).count()).toBe(0)
  await f.card.locator(':scope > header .en-native-component-title').click();await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor()
  expect(await f.page.evaluate(()=>(window as any).retainedProposals.canUndoBlock('retained-owned-result','component'))).toBe(true)
  await choose(f,'重命名');const dialog=f.page.getByRole('dialog',{name:'重命名组件',exact:true});await dialog.getByRole('textbox',{name:'组件名称',exact:true}).fill('用户人工命名必须保留');await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>f.readView().title).toBe('用户人工命名必须保留')
  expect(await f.page.evaluate(()=>(window as any).retainedProposals.canUndoBlock('retained-owned-result','component'))).toBe(false)
  expect(await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).isDisabled()).toBe(true)
  const result=await f.page.evaluate(()=>{const w=window as any;return w.retainedProposals.undo('retained-owned-result')});expect(result.retained).toBe(1);await f.page.evaluate(()=>(window as any).flushRetained());const saved:any=await f.readDisk();expect(JSON.parse(saved.blocks.find((block:any)=>block.id==='component').props.payload).title).toBe('用户人工命名必须保留');expect(JSON.stringify(saved.blocks)).toContain('用户既有市场观察，必须保留。');expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)
