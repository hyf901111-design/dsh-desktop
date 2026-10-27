// @ts-nocheck -- Real native input/menu/drop components; remote catalog and file paths are isolated.
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import {installSkillCommand} from '../../src/preload/integrations/skill-command'
import {installSkillCommandBridge} from '../../src/preload/integrations/skill-command-bridge'
const empty=()=>null,primitives=new Proxy({Tooltip:({children})=>children,useAnchoredMaxHeight:()=>400},{get:(target,key)=>target[key]??empty})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:primitives
const rt=window.nativeModules.runtime.factory(modules),load=key=>window.nativeModules[key].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id))
const native=load('conversation'),commands=load('commands'),fileDrop=load('fileDrop'),sessionId='qa-composer-menu-drop',effects=[],slots=new Map(),probe=window.probe={selections:[],files:[]}
const ctx={get:()=>undefined,effect(start){const stop=start();if(typeof stop==='function')effects.push(stop);return stop},slots:{inject(_name,register){register()},register(options,render){slots.set(options.name,render);return()=>{}}}}
fileDrop.apply(ctx)
const shell=new native.SessionInputShell({actx:ctx,defaultSink:()=>{throw Error('This fixture may not send')}})
const popup=new commands.PopupSelectController({consume:()=>false,focusComposer:()=>document.querySelector('textarea')?.focus()})
let definition
const skills=[{id:'custom:finance',name:'自定义财报分析',description:'分析财务报告与估值'},
 {id:'builtin:ework-equity-research',name:'研报写作',description:'研究报告的完整写作与来源核验'},
 {id:'builtin:other',name:'基础数据源',description:'获取研究数据'},
 {id:'builtin:efund-ppt-maker',name:'PPT制作助手',description:'创建专业演示文稿'},
 {id:'custom:efund-ppt-maker',name:'PPT 自定义技能',description:'用户自己的演示工具'}]
const bridge=installSkillCommandBridge(document,{request:async()=>({type:'snapshot',snapshot:{revision:1,rows:skills.map(skill=>({...skill,kind:'skill',revision:1,enabled:true,status:'已启用'}))}}),useSkill:async input=>{probe.selections.push(input.id);shell.insertReference({source:'ework-managed-skill',ref:JSON.stringify({id:input.id,revision:1,label:input.name,invocationName:'ework-skill-1111111111111111'}),label:input.name,clipboardText:'/'+input.name},{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})}})
effects.push(()=>bridge.dispose(),installSkillCommand({document,command:{register(value){definition=value;return()=>{}}},sessions:{subagentAddress:()=>undefined}}))
window.dshDesktop={drainDroppedPaths:()=>['/qa/外部附件.pdf']}
const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=select=>select(React.useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot))
const session=rt.createSnapshotStore({running:false,promptError:null,subagent:null,removed:false})
function Composer(){
 const input=React.useSyncExternalStore(shell.state.subscribe,shell.state.getSnapshot,shell.state.getSnapshot)
 const props={sessionId,variant:'hero',keyboard:shell,inputActions:shell.actions,useInput:use(shell.state),useNotices:use(shell.notices),useSession,useLexicon:()=>[],useMenuLauncher:()=>undefined,useProjection:()=>undefined,resolveSubmitMode:()=> 'queue',renderSlot:()=>null,t:key=>({'input.commands':'命令','input.send':'发送消息','input.stop':'停止生成'})[key]||key,stop:()=>{},toggleCommandMenu:()=>popup.open('skills',definition.ui,{sessionId})}
 return <native.__ComposerSurface zone={{sessionId,input,inputActions:shell.actions}} hero={true} inputBar={<native.__InputBar {...props}/>} heroWorkspaceRow={<div className="wSkVaW_heroWorkspaceRow">工作区选择</div>} renderSlot={(name,props)=>slots.get(name)?.(props)} renderSlotChain={(_name,_props,options)=>options.fallback} t={key=>key}/>
}
const root=createRoot(document.querySelector('#composer'));root.render(<Composer/>);const menuRoot=createRoot(document.querySelector('#menus'));menuRoot.render(<commands.__Popup popup={popup} t={key=>key}/>)
Object.assign(probe,{shell,popup,setRunning(value){session.set({...session.getSnapshot(),running:value})},open:()=>popup.open('skills',definition.ui,{sessionId}),dispose(){root.unmount();menuRoot.unmount();popup.dismiss();shell.dispose();for(const stop of effects.reverse())stop()}})
