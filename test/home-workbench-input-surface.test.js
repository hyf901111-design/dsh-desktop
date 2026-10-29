import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {afterEach,expect,it} from 'vitest'
import {HOME_WORKBENCH_STEPS,HOME_WORKBENCH_PANELS,HOME_WORKBENCH_PROMPT} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'

const require=createRequire(import.meta.url),releases=[]
afterEach(async()=>{for(const release of releases.splice(0))await release()})

function fixture(){
 const win=new Window({url:'https://ework.local'}),document=win.document,cleanups=[],cues=[],fetches=[]
 // The packaged sidebar is a body portal, outside both centerCol AND frame.
 document.body.innerHTML='<main class="pI_x6G_frame"><div class="pI_x6G_centerCol"><header data-srb-session-header data-ework-notes-session="demo"></header><section data-home-guide="run" data-kind="workbench"><div id="guide"><div data-research-canvas></div></div></section></div></main><aside class="t8lSSG_panel" id="right-pane"></aside>'
 document.documentElement.dataset.homeGuidePointerRun='run'
 const shell={snapshot:{draft:'',draftRev:0,imageIds:[],occurrences:[]},setDraft(draft){this.snapshot={...this.snapshot,draft,draftRev:this.snapshot.draftRev+1};for(const input of document.querySelectorAll('textarea[data-odyssey-file-reference-session="demo"]'))input.value=draft},track(){}}
 const resource={owner:null,provider:{},workspace:{getSnapshot:()=>({artifacts:[]}),setViewport(){},setArtifacts(){},persist:()=>true,cancelTransient(){}}}
 const react={useState:()=>[null,()=>{}],useLayoutEffect(){},useEffect(fn){const cleanup=fn();if(cleanup)cleanups.push(cleanup)}}
 const scope={window:win,document,react,CustomEvent:win.CustomEvent,MutationObserver:win.MutationObserver,AbortController:win.AbortController,DOMException:win.DOMException,crypto:win.crypto,HomeWorkbenchSteps:HOME_WORKBENCH_STEPS,HomeWorkbenchPanels:HOME_WORKBENCH_PANELS,HomeWorkbenchPrompt:HOME_WORKBENCH_PROMPT,HomeWorkbenchGenerationStages:new Map(),HomePresentationSubmissions:{watch(){}},HomeWorkbenchNativeDeps:{getHomeGuideSession:()=>({kind:'workbench',cwd:'/study'}),inputHub:{shell:()=>shell}},homeGuideNativeResource:()=>resource,fetch:async(_url,options)=>{fetches.push(JSON.parse(options.body));return{ok:true,json:async()=>({ok:true})}},performance:{now:()=>Date.now()*100},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2)),clearTimeout,setInterval,clearInterval}
 const Portal=runInNewContext('('+require('../scripts/lib/home-guide-workbench-native.mjs').NativeHomeWorkbenchPortal.toString()+')',scope)
 Portal({sessionId:'demo',researchWorkspaces:{}})
 let autoAck=true
 const ack=cue=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run',requestId:cue.requestId,ok:true}}))
 win.addEventListener('sherlock:home-guide-cue',event=>{cues.push(event.detail);if(autoAck)ack(event.detail)})
 const command=(command,extra={})=>new Promise(resolve=>{const requestId=win.crypto.randomUUID(),receive=event=>{if(event.detail.requestId!==requestId)return;win.removeEventListener('sherlock:home-guide-workbench-reply',receive);resolve(event.detail)};win.addEventListener('sherlock:home-guide-workbench-reply',receive);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-workbench-request',{detail:{requestId,runId:'run',sessionId:'demo',hostId:'guide',command,...extra}}))})
 const addInput=(sessionId='demo',parent=document.getElementById('right-pane'))=>{const composer=document.createElement('div');composer.className='uV2eYG_root';const input=document.createElement('textarea');input.dataset.odysseyFileReferenceSession=sessionId;const button=document.createElement('button');button.className='uV2eYG_primary';composer.append(input,button);parent.append(composer);return input}
 const play=()=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'demo',runId:'run',playing:true}}))
 releases.push(async()=>{for(const cleanup of cleanups.reverse())cleanup();await win.happyDOM.close()})
 return{document,shell,cues,fetches,resource,command,addInput,play,ack,setAutoAck:value=>autoAck=value,setDeps:value=>scope.HomeWorkbenchNativeDeps=value,setRegistration:value=>scope.HomeWorkbenchNativeDeps.getHomeGuideSession=()=>value,mount:()=>command('mount',{fresh:true,cwd:'/study'})}
}

it('focuses and types into the same-session native right pane outside the main frame',async()=>{
 const f=fixture(),foreign=f.addInput('another-session'),outside=f.addInput('demo',f.document.body),input=f.addInput()
 expect(input.closest('.pI_x6G_frame')).toBeNull()
 expect(await f.mount()).toMatchObject({ok:true});f.play()
 expect(await f.command('wb-00')).toMatchObject({ok:true})
 expect(f.document.activeElement).toBe(input)
 expect(await f.command('wb-01')).toMatchObject({ok:true})
 expect(f.shell.snapshot.draft).toBe([...HOME_WORKBENCH_PROMPT].slice(0,32).join(''))
 expect(foreign.value).toBe('');expect(f.document.activeElement).not.toBe(outside)
})

it('waits for a late native composer instead of rejecting the new session during mount',async()=>{
 const f=fixture();let settled=false
 const pending=f.mount().then(result=>{settled=true;return result})
 await new Promise(resolve=>setTimeout(resolve,15));expect(settled).toBe(false)
 const input=f.addInput();expect(await pending).toMatchObject({ok:true});f.play()
 expect(await f.command('wb-00')).toMatchObject({ok:true});expect(f.document.activeElement).toBe(input)
})

it('does not use foreign, subagent, inert, readonly or hidden inputs when the native composer is unavailable',async()=>{
 const f=fixture();f.addInput('another-session');f.addInput('demo',f.document.body)
 for(const attribute of ['inert','hidden','data-odyssey-subagent-panel']){const holder=f.document.createElement('div');holder.setAttribute(attribute,'');f.document.getElementById('right-pane').append(holder);f.addInput('demo',holder)}
 const readonly=f.addInput();readonly.readOnly=true
 const hidden=f.addInput();hidden.parentElement.style.display='none'
 const disabled=f.addInput();disabled.disabled=true
 const result=await f.mount();expect(result).toMatchObject({ok:false});expect(result.message).toContain('右侧输入框尚未就绪')
 expect(f.shell.snapshot.draft).toBe('');expect(f.cues).toEqual([])
})

it('waits until the same-session composer leaves inert state',async()=>{
 const f=fixture(),input=f.addInput();input.parentElement.inert=true;let settled=false
 const pending=f.mount().then(result=>{settled=true;return result})
 await new Promise(resolve=>setTimeout(resolve,15));expect(settled).toBe(false)
 input.parentElement.inert=false;expect(await pending).toMatchObject({ok:true});f.play()
 expect(await f.command('wb-00')).toMatchObject({ok:true});expect(f.document.activeElement).toBe(input)
})

it('rechecks input ownership after a pending cue and never types into a newly inert composer',async()=>{
 const f=fixture(),input=f.addInput();expect(await f.mount()).toMatchObject({ok:true});f.play();f.setAutoAck(false)
 const pending=f.command('wb-00');await new Promise(resolve=>setTimeout(resolve,10));expect(f.cues).toHaveLength(1)
 input.parentElement.inert=true;f.ack(f.cues[0]);expect(await pending).toMatchObject({ok:false});expect(f.shell.snapshot.draft).toBe('')
})

it('cancels a pending composer wait when the selected native session changes',async()=>{
 const f=fixture(),pending=f.mount();await new Promise(resolve=>setTimeout(resolve,10))
 f.document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='another-session';f.addInput()
 expect(await pending).toMatchObject({ok:false});expect(f.shell.snapshot.draft).toBe('');expect(f.cues).toEqual([])
})

it('does not guess between two editable native composers owned by the same session',async()=>{
 const f=fixture();f.addInput();f.addInput()
 expect(await f.mount()).toMatchObject({ok:false});expect(f.shell.snapshot.draft).toBe('');expect(f.cues).toEqual([])
})

it.each([
 ['HWB_HOST_MISSING',f=>f.document.getElementById('guide').remove()],
 ['HWB_RUN_MISSING',f=>f.document.querySelector('[data-home-guide]').removeAttribute('data-home-guide')],
 ['HWB_RUN_MISMATCH',f=>f.document.querySelector('[data-home-guide]').dataset.homeGuide='other-run'],
 ['HWB_HEADER_MISSING',f=>f.document.querySelector('[data-srb-session-header]').remove()],
 ['HWB_SESSION_MISMATCH',f=>f.document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='other-session'],
 ['HWB_DEPS_UNAVAILABLE',f=>f.setDeps(null)],
 ['HWB_DEPS_UNAVAILABLE',f=>f.setDeps({})],
 ['HWB_REGISTRATION_UNAVAILABLE',f=>f.setRegistration(undefined)],
 ['HWB_REGISTRATION_KIND_MISMATCH',f=>f.setRegistration({kind:'ppt',cwd:'/study'})],
 ['HWB_DIRECTORY_MISMATCH',f=>f.setRegistration({kind:'workbench',cwd:'/another-study'})]
])('reports guard diagnostic %s before any Host request',async(reason,invalidate)=>{
 const f=fixture();f.addInput();invalidate(f)
 const result=await f.mount();expect(result).toMatchObject({ok:false});expect(result.message).toContain('['+reason+']')
 expect(f.fetches).toEqual([]);expect(f.shell.snapshot.draft).toBe('')
})

it('accepts valid mount registration without a guard diagnostic',async()=>{
 const f=fixture();f.addInput();const result=await f.mount()
 expect(result).toMatchObject({ok:true});expect(result.message).toBeUndefined()
 expect(f.fetches.map(request=>request.action)).toEqual(['prepare','playback'])
})

it('reports an actual workspace ownership mismatch without consuming the next stage',async()=>{
 const f=fixture();f.addInput();expect(await f.mount()).toMatchObject({ok:true})
 f.resource.owner={};const result=await f.command('wb-00')
 expect(result).toMatchObject({ok:false});expect(result.message).toContain('[HWB_WORKSPACE_OWNER_MISMATCH]')
 expect(f.shell.snapshot.draft).toBe('');expect(f.cues).toEqual([])
})
