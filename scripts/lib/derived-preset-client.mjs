import {parseDerivedSpec,derivedOutline} from '../../packages/dsh-research-task-runtime/derived-template-contract.js'
import {WORKBENCH_DISCLOSURE_CSS} from '../../packages/dsh-research-task-runtime/workbench-presentation.js'
export const derivedPresetCss=`
${WORKBENCH_DISCLOSURE_CSS.replaceAll('body ','.ew-derived-preset ')}
.ew-derived-preset{box-sizing:border-box;min-width:0;width:100%;padding:12px;display:flex;flex-direction:column;gap:10px;font:12px/18px DINPro,'Noto Sans SC',sans-serif;color:var(--grid-text,#3c3c3c);overflow-wrap:anywhere;container-type:inline-size;}
.ew-derived-source{font-size:11px;color:var(--grid-muted,#666);min-width:0;}
.ew-derived-source button{border:0;padding:0;font:inherit;color:inherit;background:transparent;cursor:pointer;text-align:left;}
.ew-derived-preset button:focus-visible,.ew-derived-preset textarea:focus{outline:2px solid #168fff;outline-offset:-2px;}
.ew-derived-result{min-width:0;white-space:normal;font:12px/18px DINPro,'Noto Sans SC',sans-serif!important;color:var(--grid-text,#3c3c3c)!important;}
.ew-derived-result *{font-family:inherit!important;font-size:inherit!important;line-height:inherit!important;color:inherit!important;}
.ew-derived-result p{margin:0 0 10px!important;}.ew-derived-result :is(h1,h2,h3){margin:0 0 10px!important;font-weight:700;}.ew-derived-result ul{margin:0 0 10px!important;padding-left:18px!important;}.ew-derived-result li{margin:0 0 4px!important;}.ew-derived-result a{color:var(--grid-accent,#168fff)!important;}
.ew-derived-preset>.rScV5Q_mindMap{flex:none;min-height:220px;max-width:100%;}
.ew-derived-note,.ew-derived-original{font-size:12px;color:var(--grid-muted,#666);}
.ew-derived-source:has(>.ew-derived-original){display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:12px;align-items:start;}
.ew-derived-source .ew-derived-original{display:contents;font-size:11px;}
.ew-derived-source .ew-derived-original summary{grid-column:2;grid-row:1;}
.ew-derived-source .ew-derived-original pre{grid-column:1/-1;margin:8px 0 0;}
.ew-derived-original pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;}
.ew-derived-editor{display:flex;flex-direction:column;gap:10px;min-width:0;}
.ew-derived-editor textarea{box-sizing:border-box;resize:vertical;width:100%;min-height:140px;max-width:100%;font:12px/18px DINPro,'Noto Sans SC',sans-serif;border:1px solid var(--grid-border,#ced2da);border-radius:4px;color:inherit;background:var(--grid-card,#fff);padding:8px;}
.ew-derived-actions{display:flex;gap:8px;flex-wrap:wrap;}.ew-derived-actions button{height:30px;min-width:60px;border:0;border-radius:4px;background:var(--grid-control,#e9ebef);color:inherit;font:12px/18px DINPro,'Noto Sans SC',sans-serif;padding:6px 10px;}
body [data-ework-grid] .rScV5Q_containerContent:has(.ew-derived-preset){padding:0!important;}
body [data-ework-grid] .rScV5Q_artifactBody:has(>.ew-derived-preset){padding:0!important;}
body [data-ework-grid] [data-research-node-id]:has([data-research-derived-preset]) .odyssey-derived-sources{display:none!important;}
`
export function researchLegacyDerivedSpec(node){
 if(!['generated-summary','generated-mind-map'].includes(node?.kind)||node.generationStatus!=='completed'||node.generationSources?.length!==1)return null
 const source=node.generationSources[0]
 if(source.type!=='artifact'||typeof source.text!=='string')return null
 return researchDerivedSpec({version:1,type:node.kind==='generated-summary'?'summary':'mind-map',title:node.title,content:node.excerpt,source:{title:source.title,text:source.text,nodeId:source.id}})
}
export function researchDerivedNodeLabel(value){
 return value.replace(/<br\s*\/?>/gi,'\n').replace(/\*\*|__|`/g,'')
}
export function replaceResearchDerivedNodeLabel(content,line,rawLabel){
 const newline=content.includes('\r\n')?'\r\n':'\n',lines=content.split(/\r?\n/),source=lines[line]
 if(source===undefined||typeof rawLabel!=='string'||!rawLabel.trim())return null
 const prefix=source.match(/^(?:#\s+| *[-*+] )/)?.[0]
 if(!prefix)return null
 if(researchDerivedNodeLabel(source.slice(prefix.length))===rawLabel)return content
 lines[line]=prefix+rawLabel.trim().replace(/\r?\n/g,'<br>')
 return lines.join(newline)
}
export function ResearchDerivedMindMap({nodeId,outline,content,readOnly,onCommit}){
 const ref=react.useRef(null),[editing,setEditing]=react.useState(null)
 react.useEffect(()=>{setEditing(null)},[content,readOnly])
 // Reuse the established node and edge renderers, with the complete validated
 // outline instead of the legacy parser's 48-node and detail-level limits.
 const convert=item=>({label:researchDerivedNodeLabel(item.label),sourceLineIndex:item.line,children:item.children.map(convert)})
 const tree=convert(outline),cancel=()=>setEditing(null),commit=(line,label)=>{setEditing(null);if(!readOnly){const next=replaceResearchDerivedNodeLabel(content,line,label);if(next!==null&&next!==content)onCommit(next)}}
 const props={artifactId:nodeId,editingLineIndex:readOnly?null:editing,onBeginEdit:readOnly?()=>{}:setEditing,onCommit:commit,onCancel:cancel}
 return react_jsx_runtime.jsxs('div',{ref,className:'rScV5Q_mindMap','data-research-mind-map':'','data-research-mind-map-detail':'detailed',role:'group','aria-label':outline.label,children:[
  react_jsx_runtime.jsx(ResearchMindMapConnections,{rootRef:ref,revision:content+'|'+editing}),
  react_jsx_runtime.jsx(ResearchMindMapDisplayNode,{...props,node:tree,depth:0,root:true}),
  react_jsx_runtime.jsx(ResearchMindMapBranches,{...props,nodes:tree.children})
 ]})
}
export function ResearchDerivedPreset({node,sessionId}){
 const spec=node.containerSpec,host=react.useRef(null),editor=react.useRef(null),[editing,setEditing]=react.useState(false),[error,setError]=react.useState('')
 react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
 const readOnly=sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true
 react.useEffect(()=>{if(readOnly)setEditing(false)},[readOnly])
 const open=()=>{if(!readOnly){setError('');setEditing(true)}}
 react.useLayoutEffect(()=>{const element=host.current;if(!element)return;element.__eworkEditDerived=open;return()=>{delete element.__eworkEditDerived}},[readOnly])
 const cancel=()=>{setEditing(false);setError('')},saveContent=content=>{
  if(readOnly)return
  const next=researchDerivedSpec({...spec,content})
  if(!next){setError(spec.type==='mind-map'?'请保留一个根标题及完整缩进列表，普通正文不能被丢弃。':'请填写完整结果，结果和来源快照总长度不能超过64KB。');return}
  if(!researchDerivedSinks.get(sessionId)?.(node.id,spec.content,next)){setError('结果尚未保存，请重试。');return}
  cancel()
 },save=()=>saveContent(editor.current.value)
 const focusSource=e=>{
  e.stopPropagation()
  if(!researchDerivedFocus.get(sessionId)?.(spec.source.nodeId)){setError('来源组件已删除或不可用，完整原文仍保留。');return}
  setError('');host.current?.closest('dialog[open]')?.close()
  window.requestAnimationFrame(()=>host.current?.closest('[data-research-canvas]')?.querySelector('[data-research-node-id="'+CSS.escape(spec.source.nodeId)+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'}))
 }
 const outline=spec.type==='mind-map'?researchDerivedOutline(spec.content):null
 const result=outline?react_jsx_runtime.jsx(ResearchDerivedMindMap,{nodeId:node.id,outline,content:spec.content,readOnly,onCommit:saveContent}):react_jsx_runtime.jsx('div',{className:'ew-derived-result',children:react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.MarkdownText,{text:spec.content,streaming:false})})
 return react_jsx_runtime.jsxs('div',{ref:host,className:'ew-derived-preset','data-research-derived-preset':spec.type,onDoubleClick:e=>{e.stopPropagation();open()},children:[
  spec.asOf&&react_jsx_runtime.jsx('p',{className:'ew-derived-source',children:'数据时点：'+spec.asOf}),
  react_jsx_runtime.jsxs('div',{className:'ew-derived-source',children:[react_jsx_runtime.jsxs('span',{children:['来源组件：',spec.source.nodeId?react_jsx_runtime.jsx('button',{type:'button','data-research-reference-node-id':spec.source.nodeId,onClick:focusSource,onDoubleClick:e=>e.stopPropagation(),children:spec.source.title}):spec.source.title]}),react_jsx_runtime.jsxs('details',{className:'ew-derived-original',onDoubleClick:e=>e.stopPropagation(),children:[react_jsx_runtime.jsx('summary',{children:'查看来源原文'}),react_jsx_runtime.jsx('pre',{children:spec.source.text})]})]}),
  editing?react_jsx_runtime.jsxs('div',{className:'ew-derived-editor',onPointerDown:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),children:[
   react_jsx_runtime.jsx('textarea',{ref:editor,'aria-label':'编辑派生结果',defaultValue:spec.content,autoFocus:true,disabled:readOnly,onKeyDown:e=>{e.stopPropagation();if(e.key==='Escape')cancel();else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent?.isComposing&&e.keyCode!==229){e.preventDefault();save()}}}),
   error&&react_jsx_runtime.jsx('div',{role:'alert',children:error}),
   react_jsx_runtime.jsxs('div',{className:'ew-derived-actions',children:[react_jsx_runtime.jsx('button',{type:'button',disabled:readOnly,onClick:save,children:'保存结果'}),react_jsx_runtime.jsx('button',{type:'button',onClick:cancel,children:'取消'})]})
  ]}):result,
  error&&!editing&&react_jsx_runtime.jsx('div',{role:'alert',children:error}),
  spec.note&&react_jsx_runtime.jsx('details',{className:'ew-derived-original',onDoubleClick:e=>e.stopPropagation(),children:[react_jsx_runtime.jsx('summary',{children:'说明'}),react_jsx_runtime.jsx('pre',{children:spec.note})]}),
  spec.type==='summary'&&react_jsx_runtime.jsx('div',{className:'ew-derived-note',children:'仅根据来源组件内的内容生成。'}),
  react_jsx_runtime.jsx('style',{children:RESEARCH_DERIVED_PRESET_CSS})
 ]})
}
export function patchDerivedPresetClient(source){
 const start='/* ODYSSEY_DERIVED_PRESET_V1 */',end='/* ODYSSEY_DERIVED_PRESET_END */'
 const definitions=`${start}\nconst researchDerivedSinks=new Map(),researchDerivedFocus=new Map(),RESEARCH_DERIVED_PRESET_CSS=${JSON.stringify(derivedPresetCss)};\nconst researchDerivedOutline=${derivedOutline.toString()},researchDerivedSpec=${parseDerivedSpec.toString().replaceAll('derivedOutline(','researchDerivedOutline(')};\n${researchLegacyDerivedSpec.toString()}\n${researchDerivedNodeLabel.toString()}\n${replaceResearchDerivedNodeLabel.toString()}\n${ResearchDerivedMindMap.toString()}\n${ResearchDerivedPreset.toString()}\n${end}`
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('Derived preset definitions boundary missing');source=source.slice(0,a)+definitions+source.slice(b+end.length)}
 else{const anchor='function createResearchWorkspaceSession(storage, sessionId) {';if(source.split(anchor).length!==2)throw Error('Derived preset definitions host missing');source=source.replace(anchor,definitions+'\n'+anchor)}
 const once=(a,b)=>{if(source.includes(b))return;if(source.split(a).length!==2)throw Error('Derived preset anchor missing or ambiguous: '+a.slice(0,90));source=source.replace(a,b)}
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/,match=source.match(types);if(!match)throw Error('Derived native types missing');if(!match[0].includes('"summary"'))source=source.replace(types,s=>s.replace('new Set([','new Set(["summary", '))
 const parse='if(value.type==="summary"||value.type==="mind-map"&&Object.hasOwn(value,"source"))return researchDerivedSpec(value);'
 if(!source.includes(parse))once('if (value.type === "web") {',parse+'\nif (value.type === "web") {')
 once("if (spec.type === 'markdown' || spec.type === 'mind-map') return spec.content;","if (spec.type === 'markdown' || spec.type === 'mind-map' || spec.type === 'summary') return spec.content;")
 const sink=`/* ODYSSEY_DERIVED_SINK_V1 */
 researchDerivedFocus.set(sessionId,nodeId=>{
  const source=[...snapshot.files,...snapshot.artifacts].find(n=>n.id===nodeId);if(!source)return false;
  update({selection:updateResearchSelection(snapshot.selection,[nodeId],'replace',snapshot.files),viewport:researchCanvasFocusViewport(source,snapshot.viewport,snapshot.canvasSize)},true);return true;
 });
 researchDerivedSinks.set(sessionId,(nodeId,expectedContent,spec)=>{
  if(!collaborationCanWrite())return false;
  const node=snapshot.artifacts.find(n=>n.id===nodeId),next=researchDerivedSpec(spec);
  const current=node?.kind==='generated-container'?node.containerSpec:researchLegacyDerivedSpec(node);
  if(!next||!current||current.type!==next.type||current.content!==expectedContent||JSON.stringify(current.source)!==JSON.stringify(next.source))return false;
  return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?(node.kind==='generated-container'?{...n,containerSpec:next}:{...n,excerpt:next.content}):n)},true)!==false;
 });
 /* ODYSSEY_DERIVED_SINK_END */`
 if(source.includes('/* ODYSSEY_DERIVED_SINK_V1 */'))source=source.replace(/\/\* ODYSSEY_DERIVED_SINK_V1 \*\/[\s\S]*?\/\* ODYSSEY_DERIVED_SINK_END \*\//,sink)
 else if(source.includes('researchDerivedSinks.set(sessionId,'))source=source.replace(/researchDerivedSinks\.set\(sessionId,[\s\S]*?(?=const htmlFitStates = new Map\(\);)/,sink+'\n')
 else once('const htmlFitStates = new Map();',sink+'\nconst htmlFitStates = new Map();')
 const body='function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false }) {'
 const branch="if(['summary','mind-map'].includes(node.containerSpec.type)&&node.containerSpec.source)return react_jsx_runtime.jsx(ResearchDerivedPreset,{node,sessionId});"
 if(!source.includes(branch))once(body,body+'\n'+branch)
 const legacy='researchLegacyDerivedSpec(node)?react_jsx_runtime.jsx(ResearchDerivedPreset,{node:{...node,containerSpec:researchLegacyDerivedSpec(node)},sessionId}):'
 if(!source.includes(legacy))once('}) : node.kind === "generated-mind-map" && node.generationStatus === \'completed\' ?','}) : '+legacy+'node.kind === "generated-mind-map" && node.generationStatus === \'completed\' ?')
 return source
}
