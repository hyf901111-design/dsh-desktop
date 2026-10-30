import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {buildResearchHtmlPreview,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {trustedTypesLineChart} from './fixtures/trusted-types-line-chart'
let browser:any
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.chromium??pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())
async function open(html:string,storage?:{store:ConversationComponentStore;service:any;target:any}){
 const page=await browser.newPage({viewport:{width:700,height:520}}),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/tt-chart',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><iframe id="outer" sandbox="allow-scripts" style="width:660px;height:460px;border:0"></iframe>'}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:process.env.SHERLOCK_TEST_NOTO_FONT||resolve('../../build/fonts/NotoSansSC.woff2')}))
 const snapshot=()=>storage?.store.read('owner',storage.target).node.config as any
 const renderedHtml=storage?String((storage.store.read('owner',storage.target).node.containerSpec as any).html):html
 await page.exposeFunction('commitShared',async(message:any)=>{
  if(!storage)throw Error('Unexpected state save')
  return storage.service.commitHtmlInteraction({...storage.target,expectedRevision:storage.store.read('owner',storage.target).revision,htmlVersion:researchInteractionVersion(renderedHtml),kind:'shared',revision:message.revision,state:message.state})
 })
 await page.goto('http://127.0.0.1/tt-chart')
 await page.evaluate(({preview,saved,htmlVersion}:any)=>{
  const w=window as any,frame=document.querySelector<HTMLIFrameElement>('#outer')!;w.failures=0;w.commits=[];w.saveFailures=[]
  const send=(data:any)=>frame.contentWindow!.postMessage(data,'*')
  addEventListener('message',async event=>{if(event.source!==frame.contentWindow)return;const data=event.data
   if(data?.type==='sherlock-content-failed'){w.failures++;return}
   if(data?.type!=='sherlock-component-send')return;const m=data.message
   if(m.op==='join'){send({type:'sherlock-component-context',shared:false,online:true,readOnly:false,localAck:true,userId:'owner',saved});send({type:'sherlock-interaction-state',state:{version:htmlVersion,events:{}},readOnly:false})}
   if(m.op==='localCommit'){try{await w.commitShared(m);w.commits.push({state:m.state,revision:m.revision});send({type:'sherlock-component-receive',message:{peerId:m.peerId,kind:'local-commit',commitId:m.commitId,ok:true,state:m.state,revision:m.revision}})}catch(error){w.saveFailures.push(String(error));send({type:'sherlock-component-receive',message:{peerId:m.peerId,kind:'local-commit',commitId:m.commitId,ok:false}})}}
  })
  frame.srcdoc=preview
 },{preview:buildResearchHtmlPreview(renderedHtml,'离线趋势','light',{workbench:true,notoFont:'runtime'}),saved:snapshot()?.sharedComponentState,htmlVersion:researchInteractionVersion(renderedHtml)})
 return{page,frame:page.frameLocator('#outer').frameLocator('#preview'),errors,snapshot}
}
it('reproduces the real nested sandbox TrustedHTML failure without weakening its CSP',async()=>{
 // Legacy documents still use the unchanged sandbox; the new gate applies only at creation.
 const f=await open(trustedTypesLineChart(true));try{
  await expect.poll(()=>f.page.evaluate(()=>(window as any).failures)).toBeGreaterThan(0)
  expect(f.errors.some(message=>message.includes('TrustedHTML'))).toBe(true)
  expect(await f.frame.locator('meta[http-equiv="Content-Security-Policy"]').last().getAttribute('content')).toContain("require-trusted-types-for 'script'; trusted-types 'none'")
  expect(await f.page.evaluate(()=>(window as any).commits)).toEqual([])
 }finally{await f.page.close()}
},15000)
it('keeps a DOM-safe line chart visible and saves mouse, Arrow and full-data state through the real service and reopen',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tt-chart-')),file=join(directory,'components.json'),html=trustedTypesLineChart();let store=new ConversationComponentStore(file);await store.load()
 const make=()=>createConversationComponentService({store,owner:()=> 'owner',canReadSession:id=>id==='tt-chart',currentVisibleContext:()=>({ownerAccountId:'owner',sessionId:'tt-chart',mode:'conversation',generation:'window-a'}),nativeQuery:async()=>{throw Error('Unexpected query')},clipboard:()=>undefined,library:()=>undefined})
 let service=make();const receipt=await service.create({artifact:{version:1,type:'html',title:'离线趋势',html}},{ownerAccountId:'owner',sessionId:'tt-chart',turnId:'1',mode:'conversation',windowGeneration:'window-a',current:()=>true},new AbortController().signal,'chart'),target={sessionId:'tt-chart',componentId:receipt.effect.componentId}
 let f=await open(html,{store,service,target});try{
  expect(receipt.effect.state).toBe('saved');await expect.poll(()=>f.frame.locator('#toggle').isEnabled()).toBe(true)
  expect(await f.frame.locator('svg polyline').isVisible()).toBe(true);expect(await f.frame.locator('#readout').textContent()).toBe('当前：周一 · 10 演示值')
  expect(await f.frame.locator('svg polyline').getAttribute('points')).toBe('32,72 160,24 288,48')
  await f.frame.locator('[data-index="1"]').click();await expect.poll(()=>f.snapshot()?.sharedComponentState?.state?.index).toBe(1)
  expect(await f.frame.locator('#readout').textContent()).toBe('当前：周二 · 20 演示值')
  await f.frame.locator('#chart').focus();await f.page.keyboard.press('ArrowRight');await expect.poll(()=>f.snapshot()?.sharedComponentState?.state?.index).toBe(2)
  expect(await f.frame.locator('#readout').textContent()).toBe('当前：周三 · 15 演示值')
  await f.frame.getByRole('button',{name:'查看完整数据',exact:true}).click();await expect.poll(()=>f.snapshot()?.sharedComponentState?.state?.table).toBe(true)
  expect(await f.frame.locator('tbody tr').allTextContents()).toEqual(['周一10','周二20','周三15']);expect(await f.frame.locator('table').isVisible()).toBe(true)
  expect(await f.page.evaluate(()=>(window as any).failures)).toBe(0);expect(await f.page.evaluate(()=>(window as any).saveFailures)).toEqual([]);expect(await f.page.evaluate(()=>(window as any).commits.length)).toBe(3);expect(f.errors).toEqual([]);await f.page.close()
  store=new ConversationComponentStore(file);await store.load();service=make();f=await open(html,{store,service,target});await expect.poll(()=>f.frame.locator('#readout').textContent()).toBe('当前：周三 · 15 演示值');expect(await f.frame.locator('table').isVisible()).toBe(true)
  expect(f.snapshot()?.sharedComponentState?.state).toEqual({index:2,table:true});expect(await f.page.evaluate(()=>(window as any).failures)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.page.close();await rm(directory,{recursive:true,force:true})}
},25000)
