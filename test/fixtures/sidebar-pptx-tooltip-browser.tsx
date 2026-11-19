import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {IconFolderOpen16,IconDownloadOutline16,IconCheckOutline16} from '@deepseek-ai/dsh-client-ui-primitives'
declare global{interface Window{pptTooltipInput:any;pptTooltipFixture:any}}
const input=window.pptTooltipInput,events:any[]=[];let locale='zh',current:any,publishState:any,options={editable:true,annotationBusy:false,modeBusy:false},renderPath='/work/demo.pptx'
const names=['Fragment','jsx','jsxs','cloneElement','createPortal','useCallback','useEffect','useLayoutEffect','useRef','useState'],values=[jsx.Fragment,jsx.jsx,jsx.jsxs,React.cloneElement,createPortal,React.useCallback,React.useEffect,React.useLayoutEffect,React.useRef,React.useState]
const Tooltip=new Function(...names,'Tooltip_module_css_default',input.tooltip+';return Tooltip')(...values,{bubble:input.tooltipClass})
function Viewer(props:any){React.useEffect(()=>{current={modes:true,mode:'preview',editable:options.editable,modeBusy:false,dirty:false,saveState:'idle',downloadUrl:'/download.pptx',annotations:true,annotationActive:false,annotationBusy:false,annotationIcon:input.assets['mark16-normal']};const publish=(patch:any)=>{current={...current,...patch};props.onToolbarState(current)};publishState=publish;props.onToolbarControls({toggleMode:async()=>{events.push('mode');if(options.modeBusy)return;publish({mode:current.mode==='edit'?'preview':'edit'})},toggleAnnotations:async()=>{events.push('annotations');if(options.annotationBusy)return;publish({annotationActive:!current.annotationActive,annotationIcon:input.assets[!current.annotationActive?'mark16-selected':'mark16-normal']})},save:()=>events.push('save')});publish({});return()=>props.onToolbarControls(null)},[props.path,props.onToolbarControls,props.onToolbarState]);return <div className="preview">公司研究演示文稿</div>}
const empty=()=>null,primitives=new Proxy({Tooltip,IconFolderOpen16,IconDownloadOutline16,IconCheckOutline16},{get:(target,key)=>target[key as keyof typeof target]??empty})
const classes=new Proxy({},{get:(_target,key)=>String(key)})
const t=(key:string)=>({zh:{downloadToView:'下载查看',editorTreeToggle:'打开文件夹',save:'保存',loading:'加载中'},en:{downloadToView:'Download to view',editorTreeToggle:'Toggle file explorer',save:'Save',loading:'Loading'}}[locale as 'zh'|'en'][key]??key)
const Host=new Function('react','react_jsx_runtime','_deepseek_ai_dsh_client_ui_primitives','sidebar_module_css_default','clsx','baseName$1','treeWidthOf','treeOpenOf','clampTreeWidth','EditorPathInput','TreePanel','BinaryDownload','openSidebarFile','patchMeta','mediaUrl','planFirstMatch','t','activeLocale','useKnowledgeEditorSource',input.host+';return EditorHost')(React,jsx,primitives,classes,(...items:any[])=>items.filter(Boolean).join(' '),(path:string)=>path.split('/').at(-1),()=>240,(tab:any)=>!!tab.meta?.treeOpen,(value:number)=>value,()=>null,empty,empty,empty,(_ctx:any,tab:any,patch:any)=>{tab.meta={...tab.meta,...patch};render()},()=>'',()=>({kind:'render',viewer:{id:'office',component:Viewer}}),t,()=>locale,()=>({record:null}))
const ctx={betterSidebar:{matchFileViewer:()=>({})}},store={subscribe:()=>()=>{},getSnapshot:()=>({prefs:{editorExplorer:true}})},scope={sessionId:'session',cwd:'/work'}
let tab:any={id:'editor',path:renderPath,title:'演示文稿',meta:{}}
const root=createRoot(document.getElementById('root')!)
function App(){return <Host ctx={ctx} store={store} scope={scope} tab={tab} expanded={false}/>}
function render(){root.render(<App/>)}render()
window.pptTooltipFixture={events,locale(value:string){locale=value;render()},path(value:string){renderPath=value;tab={...tab,path:value};render()},unavailable(){options.editable=false;tab={...tab,path:'/work/readonly.pptx'};render()},status(patch:any){publishState(patch)},dispose(){root.unmount()}}
