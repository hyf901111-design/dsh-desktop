// @ts-nocheck -- Exposes only private browser-fixture controls; production components remain real.
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import {mountNavigationTitlePreview} from '../../src/preload/navigation-title-preview'
const react=React,react_jsx_runtime=jsxRuntime,_deepseek_ai_dsh_client_ui_primitives=primitives
/* NATIVE_PROJECT_ROWS */
const empty=()=>null,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake
const runtime=window.nativeModules.runtime.factory(modules)
const load=key=>window.nativeModules[key].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?runtime:modules(id))
const native=load('conversation'),commands=load('commands'),events=[]
const popup=new commands.PopupSelectController({consume(){},focusComposer:()=>document.querySelector('textarea')?.focus()})
const shell=new native.SessionInputShell({actx:{get:()=>undefined},defaultSink(){throw Error('Fixture never sends')}})
const use=store=>selector=>selector(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
const t=(key,params)=>({'actions.workspace.aria':'项目菜单','actions.newSession.aria':'新会话','rename':'重命名','openInFinder':'在Finder中打开','delete.workspace':'删除项目','group.ungrouped':'未分组','search.aria':'搜索选项','search.placeholder':'搜索','overlay.aria':'原生二级菜单','listbox.aria':'原生选项','input.send':'发送消息','input.commands':'命令'})[key]||key
const roots=[]
let title='这是一个用于核对项目标题渐隐与悬停完整滚动阅读的非常长的项目名称 / Research Workspace 2026',offPreview
function Projects(){return <><ProjectRowItem group={{workspaceId:'project',key:'project',label:title,cwd:'/qa/project',createdAt:1,expanded:true,containsCurrent:true}} t={t} onToggle={()=>events.push('toggle')} onCreate={()=>events.push('create')} actions={{open:()=>events.push('finder'),rename:()=>events.push('rename'),delete:()=>events.push('delete')}} drag={{start:()=>events.push('drag-start'),end:()=>events.push('drag-end')}}/><ProjectRowItem group={{workspaceId:'short',key:'short',label:'短项目',expanded:false,containsCurrent:false}} t={t} onToggle={()=>events.push('short-toggle')} onCreate={()=>events.push('short-create')}/></>}
function Composer(){const inputBar=<native.__InputBar sessionId="popup-qa" keyboard={shell} inputActions={shell.actions} useInput={use(shell.state)} useNotices={use(shell.notices)} useSession={selector=>selector({running:false,promptError:null,subagent:null,removed:false})} useLexicon={()=>({})} useMenuLauncher={()=>null} useProjection={()=>undefined} draftImages={()=>[]} resolveSubmitMode={()=> 'queue'} t={t} renderSlot={()=>null} overlay={<commands.__Popup popup={popup} t={t}/>}/>
 return <native.ComposerSurface hero={true} inputBar={inputBar} t={t} renderSlot={()=>null} renderSlotChain={(_name,_context,options)=>options.fallback}/>}
const projectRoot=createRoot(document.querySelector('#projects'));roots.push(projectRoot);projectRoot.render(<Projects/>);const composerRoot=createRoot(document.querySelector('#composer'));roots.push(composerRoot);composerRoot.render(<Composer/>);offPreview=mountNavigationTitlePreview(document)
window.probe={events,popup,shell,rename(value){title=value;projectRoot.render(<Projects/>)},open(command='permission',count=3){const options=Array.from({length:count},(_,index)=>({id:'choice-'+index,label:['全访问','按需询问','只读模式'][index]||'Model '+index,detail:'真实原生选项说明'}));popup.open(command,{type:'popupSelect',options:async()=>options,onSelect:async(option)=>{events.push(option.id)}},{sessionId:'popup-qa'})},dispose(){offPreview();popup.dispose();shell.dispose();roots.forEach(root=>root.unmount())}}
