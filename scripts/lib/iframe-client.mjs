import {readFileSync} from 'node:fs'
import {parseIframeSpec} from '../../packages/dsh-research-task-runtime/iframe-template-contract.js'
const plus='data:image/svg+xml;base64,'+readFileSync(new URL('../../build/figma-iframe-icons/add.svg',import.meta.url)).toString('base64')
const css=`
.ew-iframe-preset{--iframe-control:#e9ebef;position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;color:var(--grid-text,#252a33);font-size:12px;line-height:16px;}
body[data-ds-dark-theme] .ew-iframe-preset{--iframe-control:#25242a;}
body [data-ework-grid][data-workbench-style=dark] .ew-iframe-preset{--iframe-control:#25242a;}
body [data-ework-grid][data-workbench-style=light] .ew-iframe-preset{--iframe-control:#e9ebef;}
body [data-ework-grid][data-workbench-style=enterprise] .ew-iframe-preset{--iframe-control:#e9ebef;}
.ew-iframe-empty{display:flex;flex:1;min-height:0;min-width:0;flex-direction:column;align-items:center;justify-content:safe center;gap:15px;padding:12px 10px;box-sizing:border-box;overflow:auto;}
.ew-iframe-empty>*{flex-shrink:0;}
.ew-iframe-empty strong{font-size:14px;line-height:16px;}
.ew-iframe-hint{max-width:405px;text-align:center;color:var(--grid-muted,#666);overflow-wrap:anywhere;}
.ew-iframe-preset button,.ew-iframe-preset input{font:inherit;box-sizing:border-box;}
.ew-iframe-preset button{min-height:30px;border:0;border-radius:4px;background:var(--iframe-control);color:inherit;padding:7px 14px;cursor:pointer;}
body [data-ework-grid] .ew-iframe-preset button{background:var(--iframe-control)!important;color:var(--grid-text,#252a33)!important;}
body [data-ework-grid] .ew-iframe-preset .rScV5Q_previewPlaceholder{background:var(--grid-card,#fff)!important;color:var(--grid-muted,#666)!important;}
.ew-iframe-preset button:disabled{cursor:default;opacity:.5;}
.ew-iframe-add{display:flex;align-items:center;justify-content:center;gap:6px;width:115px;height:30px;}
.ew-iframe-add-icon{display:inline-block;width:14px;height:14px;flex:none;background:currentColor;mask:center/14px 14px no-repeat url("${plus}");}
.ew-iframe-form{display:flex;flex-direction:column;gap:10px;align-items:stretch;width:min(405px,100%);padding:2px;box-sizing:border-box;}
.ew-iframe-form input{width:100%;min-width:0;min-height:30px;padding:6px 8px;border:1px solid var(--grid-muted,#667085);border-radius:4px;background:var(--grid-card,#fff);color:inherit;}
.ew-iframe-preset input:focus,.ew-iframe-preset button:focus-visible{outline:2px solid #168fff;outline-offset:-2px;}
.ew-iframe-form-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
.ew-iframe-error{color:var(--grid-text,#252a33);overflow-wrap:anywhere;}
body [data-ework-grid] .rScV5Q_containerContent:has(.ew-iframe-preset){padding:0!important;overflow:hidden!important;}
body [data-ework-grid] .odyssey-component-content:has(.ew-iframe-preset),body [data-ework-grid] .odyssey-component-primary:has(.ew-iframe-preset){height:100%;min-height:0;min-width:0;overflow:hidden;}
.ew-iframe-preset>[data-research-native-web],.ew-iframe-preset>.rScV5Q_webFrame{flex:1;min-height:0;height:100%;}
`
export function ResearchIframePreset({node,sessionId,visible}){
 const spec=node.containerSpec,ref=react.useRef(null),inputRef=react.useRef(null)
 const [editing,setEditing]=react.useState(false),[error,setError]=react.useState('')
 react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
 const readOnly=sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true
 react.useLayoutEffect(()=>{const host=ref.current;if(!host)return;host.__eworkEditIframe=()=>{if(!readOnly){setEditing(true);setError('')}};return()=>{delete host.__eworkEditIframe}},[readOnly])
 const open=()=>{if(!readOnly){setError('');setEditing(true)}}
 const submit=e=>{
  e.preventDefault();e.stopPropagation();if(readOnly)return
  const url=inputRef.current.value.trim()||null,next=researchIframeSpec({...spec,url})
  if(!next){setError('请输入不含账号密码的完整 HTTP 或 HTTPS 网址。');return}
  try{if(!researchIframeSinks.get(sessionId)?.(node.id,spec.url,next)){setError('网址尚未保存，请重试。');return}setEditing(false);setError('')}catch(error){setError(error?.message??'网址尚未保存，请重试。')}
 }
 const children=[]
 if(spec.url&&!editing)children.push(react_jsx_runtime.jsx(ResearchCanvasWebFrame,{node:{...node,url:spec.url},sessionId,visible}))
 else children.push(react_jsx_runtime.jsxs('div',{className:'ew-iframe-empty',children:[
  react_jsx_runtime.jsx('strong',{children:editing?'添加或修改网址':'尚未添加网址'}),
  react_jsx_runtime.jsx('div',{className:'ew-iframe-hint',children:'请为嵌入网页组件添加网址。页面允许嵌入时，内容将在组件内显示。'}),
  editing?react_jsx_runtime.jsxs('form',{className:'ew-iframe-form',onSubmit:submit,onPointerDown:e=>e.stopPropagation(),children:[
   react_jsx_runtime.jsx('input',{ref:inputRef,type:'url','aria-label':'网页网址',defaultValue:spec.url??'',placeholder:'https://',autoFocus:true,disabled:readOnly,onKeyDown:e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent?.isComposing&&e.keyCode!==229)submit(e)}}),
   error&&react_jsx_runtime.jsx('div',{className:'ew-iframe-error',role:'alert',children:error}),
   react_jsx_runtime.jsxs('div',{className:'ew-iframe-form-actions',children:[react_jsx_runtime.jsx('button',{type:'submit',disabled:readOnly,children:'保存网址'}),react_jsx_runtime.jsx('button',{type:'button',onClick:()=>{setEditing(false);setError('')},children:'取消'})]})
  ]}):react_jsx_runtime.jsxs('button',{className:'ew-iframe-add',type:'button','data-iframe-add':'',disabled:readOnly,onPointerDown:e=>e.stopPropagation(),onClick:open,children:[react_jsx_runtime.jsx('span',{className:'ew-iframe-add-icon','aria-hidden':true}),react_jsx_runtime.jsx('span',{children:'添加网址'})]})
 ]}))
 children.push(react_jsx_runtime.jsx('style',{children:RESEARCH_IFRAME_CSS}))
 return react_jsx_runtime.jsxs('div',{ref,className:'ew-iframe-preset','data-research-iframe-preset':'',children})
}
export function patchIframeClient(source){
 const start='/* ODYSSEY_IFRAME_PRESET_V1 */',end='/* ODYSSEY_IFRAME_PRESET_END */'
 const definitions=`${start}\nconst researchIframeSinks=new Map(),RESEARCH_IFRAME_CSS=${JSON.stringify(css)};\nconst researchIframeSpec=${parseIframeSpec.toString()};\n${ResearchIframePreset.toString()}\n${end}`
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('Iframe definitions boundary missing');source=source.slice(0,a)+definitions+source.slice(b+end.length)}
 else{const anchor='function createResearchWorkspaceSession(storage, sessionId) {';if(source.split(anchor).length!==2)throw Error('Iframe definitions host missing');source=source.replace(anchor,definitions+'\n'+anchor)}
 const once=(a,b)=>{if(source.includes(b))return;if(source.split(a).length!==2)throw Error('Iframe anchor missing or ambiguous: '+a.slice(0,90));source=source.replace(a,b)}
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[/;if(!types.test(source))throw Error('Iframe native types anchor missing');if(!/new Set\(\["iframe",/.test(source))source=source.replace(types,m=>m+'"iframe", ')
 once('if (value.type === "web") {','if (value.type === "iframe") return researchIframeSpec(value);\n\t\t\tif (value.type === "web") {')
 once("if (spec === null || spec.type === 'web') return '';","if (spec === null || spec.type === 'web' || spec.type === 'iframe') return '';")
 once("node.containerSpec?.type === 'web' ? normalizeResearchWebUrl(node.containerSpec.url)","['web','iframe'].includes(node.containerSpec?.type) ? normalizeResearchWebUrl(node.containerSpec.url)")
 once("artifact.containerSpec.type === 'web' ? artifact.sourceText","['web','iframe'].includes(artifact.containerSpec.type) ? artifact.sourceText")
 once('const htmlFitStates = new Map();',`researchIframeSinks.set(sessionId,(nodeId,expectedUrl,spec)=>{
  if(!collaborationCanWrite())return false;
  const node=snapshot.artifacts.find(n=>n.id===nodeId),next=researchIframeSpec(spec);
  if(node?.kind!=='generated-container'||node.containerSpec?.type!=='iframe'||node.containerSpec.url!==expectedUrl||!next)return false;
  return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerSpec:next,sourceText:undefined,sourceTitle:undefined,sourceUpdatedAt:undefined}:n)},true)!==false;
 });\nconst htmlFitStates = new Map();`)
 const body='function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false }) {'
 once(body,body+"\nif(node.containerSpec.type==='iframe')return react_jsx_runtime.jsx(ResearchIframePreset,{node,sessionId,visible});")
 return source
}
