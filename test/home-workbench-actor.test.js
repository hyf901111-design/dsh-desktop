import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
import {homeWorkbenchPreparedArtifact} from '../packages/dsh-research-task-runtime/home-workbench-runtime.js'
import {HOME_WORKBENCH_PANELS,HOME_WORKBENCH_PROMPT} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client')
it('executes all 25 native actor stages through the real workspace and keeps all three completed tabs after dispose',async()=>{
 const win=new Window({url:'https://guide.test',width:1500,height:1000}),doc=win.document,previous=new Map(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 for(const[k,v]of Object.entries({window:win,document:doc,navigator:win.navigator,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,k,{value:v,configurable:true})
 doc.body.innerHTML='<main class="pI_x6G_frame"><div class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="demo"></header></div><section data-home-guide="run-a" data-kind="workbench"><div id="guide-host"></div></section></div></main><aside class="t8lSSG_panel"><div class="uV2eYG_root"><textarea data-odyssey-file-reference-session="demo"></textarea><button class="uV2eYG_primary">发送</button></div></aside>'
 expect(doc.querySelector('textarea').closest('.pI_x6G_frame')).toBeNull()
 Object.defineProperty(win.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 1360}});Object.defineProperty(win.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return 980}})
 win.HTMLElement.prototype.getBoundingClientRect=function(){const card=this.hasAttribute('data-research-node-id'),w=card?parseFloat(this.style.width)||320:1360,h=card?parseFloat(this.style.height)||220:980,left=card?(parseFloat(this.style.left)||160)-w/2:0,top=card?(parseFloat(this.style.top)||110)-h/2:0;return{x:left,y:top,left,top,right:left+w,bottom:top+h,width:w,height:h,toJSON(){return{left,top,width:w,height:h}}}}
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
 let descriptor;win.__ModuleLoader__={load:d=>descriptor=d};win.dshDesktop={componentLibrary:{request:async()=>[]}}
 const requests=[],fetcher=async(_url,request)=>{const data=JSON.parse(request.body);requests.push(data);let result={ok:true};if(data.action==='prepare')result.brief=HOME_WORKBENCH_PROMPT;if(data.action==='panel'){const p=HOME_WORKBENCH_PANELS.find(p=>p.tab===data.tab&&p.role===data.role);result.task={taskId:'task-'+data.tab+'-'+data.role,state:'completed',canvasNodeId:data.nodeId,createdAt:Date.now(),finalOutput:JSON.stringify(homeWorkbenchPreparedArtifact('demo',p))}}return{ok:true,json:async()=>result}};win.fetch=fetcher
 let source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const actorStart=source.indexOf('function NativeHomeWorkbenchPortal('),actorEnd=source.indexOf('\nfunction NativeHomeWorkbenchGenerationProcess(',actorStart);if(actorStart<0||actorEnd<actorStart)throw Error('Installed native actor boundary is missing')
 const holdAnchor='let left=ms,last=performance.now();',acceleratedHold='let left=Math.min(ms,1),last=performance.now();',actorSource=require('../scripts/lib/home-guide-workbench-native.mjs').NativeHomeWorkbenchPortal.toString()
 // Accelerate only this actor's presentation pauses; never silently hit a
 // similarly named hold in another installed SDK module. Keep all 25 stages.
 expect(actorSource.split(holdAnchor)).toHaveLength(2)
 source=source.slice(0,actorStart)+actorSource.replace(holdAnchor,acceleratedHold)+source.slice(actorEnd)
 source=source.replace('exports.NativeHomeWorkbenchPortal = NativeHomeWorkbenchPortal;','exports.NativeHomeWorkbenchPortal = NativeHomeWorkbenchPortal;exports.__setWorkbenchDeps=value=>HomeWorkbenchNativeDeps=value;exports.__setPage=value=>sherlockBoardsAdapter=value;')
 runInNewContext(source,{window:win,document:doc,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),matchMedia:win.matchMedia,performance:win.performance,fetch:fetcher,structuredClone,AbortController,TextDecoder,TextEncoder,crypto,setTimeout,clearTimeout,setInterval,clearInterval,console})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),native=descriptor.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):fake),registry=new native.ResearchWorkspaceRegistry(win.localStorage),workspace=registry.for('demo'),entry={kind:'workbench',sessionId:'demo',cwd:'/examples/workbench',title:'白酒龙头研究工作台（演示案例）'}
 expect(native.NativeHomeWorkbenchPortal.toString()).toContain(acceleratedHold)
 expect(native.NativeHomeWorkbenchPortal.toString()).not.toContain(holdAnchor)
 const pendingReused=new Map(),applyWorkbench=workspace.applyWorkbench.bind(workspace)
 workspace.applyWorkbench=plan=>{
  const result=applyWorkbench(plan)
  const reused=workspace.getSnapshot().artifacts.filter(node=>HOME_WORKBENCH_PANELS.some(panel=>panel.reused&&node.id==='hwb:demo:'+panel.tab+':'+panel.role)&&node.generationStatus==='queued'&&!pendingReused.has(node.id))
  for(const node of reused)pendingReused.set(node.id,{generationError:node.generationError,excerpt:node.excerpt})
  // The native pending factory already carries generationError. Exercise the
  // same terminal cleanup contract with a retained failed-refresh message too.
  if(reused.length)workspace.setArtifacts(workspace.getSnapshot().artifacts.map(node=>reused.some(pending=>pending.id===node.id)?{...node,refreshError:'历史刷新失败'}:node))
  return result
 }
 native.__setPage(new Proxy({getState:()=>({account:{status:'ready',user:{userId:'test-owner'}},favorites:[],boards:[],notifications:{}}),getHomeGuideSession:id=>id==='demo'?entry:undefined,homeGuideSessionsReady:()=>true,version:()=>0,subscribe:()=>()=>{}},{get:(target,key)=>target[key]??(()=>undefined)}))
 const shell={snapshot:{draft:'',draftRev:0,occurrences:[],imageIds:[]},setDraft(text){this.snapshot={...this.snapshot,draft:text,draftRev:this.snapshot.draftRev+1};doc.querySelector('textarea').value=text},track(){}}
 native.__setWorkbenchDeps({getHomeGuideSession:()=>entry,inputHub:{shell:()=>shell},sessions:{binding:()=>({})}});doc.querySelector('button.uV2eYG_primary').addEventListener('click',()=>shell.setDraft(''))
 const host=doc.createElement('div');doc.body.append(host);const root=createRoot(host);let sequence=0
 const command=async command=>{let result,done=false;const d={requestId:'req-'+(++sequence),runId:'run-a',sessionId:'demo',hostId:'guide-host',cwd:entry.cwd,fresh:true,kind:'workbench',command},receive=e=>{if(e.detail?.requestId!==d.requestId)return;result=e.detail;done=true;win.removeEventListener('sherlock:home-guide-workbench-reply',receive)};await React.act(async()=>{win.addEventListener('sherlock:home-guide-workbench-reply',receive);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-workbench-request',{detail:d}))});const deadline=Date.now()+6000;while(!done){if(Date.now()>deadline)throw Error('Actor did not reply: '+command);await React.act(async()=>{await new Promise(r=>setTimeout(r,10))})}expect(result,command+': '+result?.message).toMatchObject({ok:true});return result}
 try{
  await React.act(async()=>root.render(React.createElement(native.NativeHomeWorkbenchPortal,{sessionId:'demo',researchWorkspaces:registry})))
  await React.act(async()=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'demo',runId:'run-a',playing:true}})))
  await command('mount');for(let i=0;i<25;i++){
   await command('wb-'+String(i).padStart(2,'0'))
   if(i===15||i===20){const id='hwb:demo:'+(i===15?'valuation':'documents')+':watchlist',node=workspace.getSnapshot().artifacts.find(node=>node.id===id)
    expect(pendingReused.get(id)).toEqual({generationError:'任务未启动，请重试。',excerpt:'正在准备任务…'})
    expect(node.generationStatus).toBe('completed');expect(node.generationError).toBeUndefined();expect(node.refreshError).toBeUndefined()
    expect(node.generationEvents).toBeUndefined();expect(node.generationPartialText).toBeUndefined();expect(node.generationTaskId).toBeUndefined()
    expect(JSON.parse(node.excerpt)).toEqual(node.containerSpec);expect(node.lastSuccessfulAt).toBe(node.generationCompletedAt)
   }
  }
  const nodes=workspace.getSnapshot().artifacts,nav=nodes.find(n=>n.containerSpec?.type==='board-tabs');expect(nodes).toHaveLength(16);expect(nodes.every(n=>n.generationStatus==='completed')).toBe(true);expect(nav.containerSpec.tabs.map(tab=>tab.nodeIds.length)).toEqual([5,5,5]);expect(requests.filter(r=>r.action==='panel')).toHaveLength(13);expect(doc.querySelectorAll('[data-board-tab]')).toHaveLength(3);expect(doc.querySelectorAll('[data-research-node-id]')).toHaveLength(15);expect(doc.querySelector('textarea').value).toBe('');await command('flush');await command('dispose');expect(doc.querySelectorAll('[data-research-node-id],[data-home-workbench-native]')).toHaveLength(0);expect(workspace.getSnapshot().artifacts).toHaveLength(16);expect(workspace.getSnapshot().artifacts.every(n=>n.generationStatus==='completed')).toBe(true)
  const restored=new native.ResearchWorkspaceRegistry(win.localStorage).for('demo').getSnapshot().artifacts
  expect(pendingReused.size).toBe(2)
  for(const node of restored.filter(node=>pendingReused.has(node.id))){expect(node.generationError).toBeUndefined();expect(node.refreshError).toBeUndefined();expect(JSON.parse(node.excerpt)).toEqual(node.containerSpec)}
 }finally{await React.act(async()=>root.unmount());await win.happyDOM.abort();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
// Full native CSS plus all three retained tabs makes HappyDOM recompute table
// styles on each stage (~32s here); the real Chromium playback is covered by
// home-workbench-browser.test.js. Bound this case without changing the suite.
},60000)
