// These renderers use the existing workspace actions. Draft presentation must
// never turn a link into a model task or replace the node receiving its result.
function ResearchContainerDraft({node,onSubmit,onCancel,readOnly=false}) {
 const inputRef=react.useRef(null),[prompt,setPrompt]=react.useState(node.containerPrompt??'');
 /* ODYSSEY_DRAFT_CANVAS_FOCUS */
 // Canvas drafts receive input focus only on explicit click.
 const submit=()=>{const value=prompt.trim();if(!readOnly&&value&&typeof onSubmit==='function')onSubmit(node,value)};
 return react_jsx_runtime.jsxs('div',{className:'rScV5Q_containerDraft','data-research-container-draft':'','data-research-template-draft':'smart',children:[
  react_jsx_runtime.jsx('strong',{className:'ew-draft-heading',children:onCancel?'编辑组件需求':'描述要创建的内容'}),
  react_jsx_runtime.jsx('textarea',{ref:inputRef,'data-research-container-prompt':'','aria-label':'描述要创建的组件内容',placeholder:'描述想创建的内容，例如：交互活动页、专业用户体验地图、月度趋势图或对比表格…',value:prompt,maxLength:RESEARCH_CONTAINER_MAX_PROMPT,disabled:readOnly,onInput:event=>setPrompt(event.currentTarget.value),onKeyDown:event=>{
   event.stopPropagation();if(event.key==='Escape'&&onCancel){event.preventDefault();onCancel();return}
   /* ODYSSEY_MANUAL_COMPOSER_ENTER */
   if(event.key==='Enter'&&!event.shiftKey&&!event.altKey&&!event.isComposing&&!event.nativeEvent?.isComposing&&event.keyCode!==229&&event.nativeEvent?.keyCode!==229){event.preventDefault();submit()}
  }}),
  react_jsx_runtime.jsxs('div',{className:'rScV5Q_containerDraftFooter',children:[
   react_jsx_runtime.jsx('span',{className:'ew-draft-hint',children:'Enter 创建 · Shift Enter 换行'}),
   onCancel&&react_jsx_runtime.jsx('button',{type:'button','data-research-container-cancel':'',onClick:onCancel,children:'取消'}),
   react_jsx_runtime.jsx('button',{type:'button','data-research-container-submit':'',disabled:readOnly||!prompt.trim()||typeof onSubmit!=='function',onClick:submit,children:onCancel?'更新组件':'创建'})
  ]}),
  react_jsx_runtime.jsx('p',{className:'ew-draft-note',children:'结果将作为独立组件保留在当前工作台。'})
 ]});
}
function ResearchLinkDraftCard({node,workspace,selected,readOnly}) {
 const [url,setUrl]=react.useState(''),[error,setError]=react.useState(null),[editing,setEditing]=react.useState(false);
 const submit=()=>{if(readOnly)return;if(!workspace.completeLinkDraft(node.id,url))setError('请输入有效的网页链接')};
 const onFrameAction=(target,action)=>{if(readOnly)return;if(action==='rename')setEditing(true);else if(action==='remove')workspace.removeNodes([target.id])};
 return react_jsx_runtime.jsx(ResearchCanvasRichNodeFrame,{
  node,selected,onFrameAction:readOnly?undefined:onFrameAction,className:'odyssey-link-draft',titleText:node.title||'添加链接',
  'data-research-artifact-card':node.id,'data-research-link-draft':'',
  title:editing?react_jsx_runtime.jsx(ResearchCanvasInlineTitleEditor,{nodeId:node.id,value:node.title,onCommit:title=>{if(!readOnly)workspace.renameNode(node.id,title);setEditing(false)},onCancel:()=>setEditing(false)}):node.title||'添加链接',
  onFocusCapture:()=>{if(!selected)workspace.updateSelection([node.id],'replace')},
  children:react_jsx_runtime.jsxs('div',{className:'rScV5Q_containerDraft','data-research-preview-interactive':'','data-research-template-draft':'link',children:[
   react_jsx_runtime.jsx('strong',{className:'ew-draft-heading',children:'添加网页链接'}),
   react_jsx_runtime.jsx('textarea',{'aria-label':'输入链接',placeholder:'粘贴网页或文章链接…',rows:2,inputMode:'url',value:url,disabled:readOnly,onInput:event=>{setUrl(event.currentTarget.value);setError(null)},onKeyDown:event=>{
    event.stopPropagation();if(event.key==='Enter'&&!event.shiftKey&&!event.altKey&&!event.isComposing&&!event.nativeEvent?.isComposing&&event.keyCode!==229&&event.nativeEvent?.keyCode!==229){event.preventDefault();submit()}
   }}),
   react_jsx_runtime.jsxs('div',{className:'ew-link-draft-status',children:[
    react_jsx_runtime.jsx('svg',{viewBox:'0 0 24 24',width:24,height:24,fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true,children:react_jsx_runtime.jsx('path',{d:'M8.5 15.5l7-7M9 7l2-2a4.25 4.25 0 016 6l-2 2M15 17l-2 2a4.25 4.25 0 01-6-6l2-2',strokeLinecap:'round',strokeLinejoin:'round'})}),
    react_jsx_runtime.jsx('strong',{children:'网页内容在这里呈现'}),
    react_jsx_runtime.jsx('p',{children:'添加后自动读取标题，并按组件宽度展示。'})
   ]}),
   react_jsx_runtime.jsxs('div',{className:'rScV5Q_containerDraftFooter',children:[
    react_jsx_runtime.jsx('span',{className:'ew-draft-hint',children:'支持网页与文章链接'}),
    react_jsx_runtime.jsx('button',{type:'button','data-research-link-submit':'',disabled:readOnly||!url.trim(),onClick:submit,children:'添加链接'})
   ]}),
   error&&react_jsx_runtime.jsx('span',{className:'ew-draft-error',role:'alert',children:error})
  ]})
 });
}
export function patchCanvasDraftTemplates(source) {
 const linkStart=source.indexOf('function ResearchLinkDraftCard('),smartStart=source.indexOf('function ResearchContainerDraft(',linkStart),end=source.indexOf('const RESEARCH_CONTAINER_CHART_COLORS',smartStart);
 if(linkStart<0||smartStart<0||end<0)throw Error('Canvas draft template renderer anchors missing');
 source=source.slice(0,linkStart)+ResearchLinkDraftCard.toString()+'\n'+ResearchContainerDraft.toString()+'\n\t\t'+source.slice(end);
 // The frame already knows shared-board permissions; forward them to its input.
 const anchor='onSubmit: onSubmitContainer\n';
 source=source.replace(anchor,'onSubmit: onSubmitContainer, readOnly\n');
 // Only new toolbar links receive the design default. Existing user geometry
 // and the shared grid minimum remain authoritative.
 source=source.replace("width:320,height:220,sizeMode:'manual'},'link'", "width:485,height:400,sizeMode:'manual'},'link'");
 return source;
}
// Important rules belong to the same cascade layer as the canvas card rules.
// Otherwise existing layered padding/control overrides win even at higher
// selector specificity, causing a second inset and clipped focus borders.
export const canvasDraftTemplatesCss=`
@layer ework-workbench {
 body [data-research-canvas][data-ework-grid] [data-research-node-id] :is([data-research-preview-body],[data-research-artifact-content],.rScV5Q_generatedContainer,.rScV5Q_containerContent):has([data-research-template-draft]){padding:0!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft]{box-sizing:border-box!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;padding:10px!important;display:grid!important;align-content:start!important;gap:10px!important;overflow:auto!important;background:var(--grid-card)!important;color:var(--grid-text)!important;font:13px/19px var(--ds-font-sans,Arial,sans-serif)!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft=smart]{grid-template-rows:auto minmax(40px,196px) auto auto!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft=link]{grid-template-rows:auto 60px minmax(90px,180px) auto auto!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] :is(.ew-draft-heading,.ew-draft-hint,.ew-draft-note,.ew-draft-error){min-width:0!important;margin:0!important;font-size:12px!important;line-height:18px!important;overflow-wrap:anywhere!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-draft-heading{font-weight:700!important;color:var(--grid-text)!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] :is(.ew-draft-note,.ew-draft-hint){color:var(--grid-muted)!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] textarea{box-sizing:border-box!important;display:block!important;width:100%!important;height:100%!important;min-width:0!important;min-height:40px!important;flex:none!important;margin:0!important;padding:12px!important;border:1px solid var(--grid-border)!important;border-radius:4px!important;resize:none!important;background:var(--grid-control,var(--grid-card))!important;color:var(--grid-text)!important;caret-color:var(--grid-text)!important;font-family:inherit!important;font-size:13px!important;line-height:19px!important;white-space:pre-wrap!important;overflow:auto!important;box-shadow:none!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] textarea::placeholder{color:var(--grid-muted)!important;opacity:1!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] textarea:focus{outline:2px solid var(--grid-accent,#0d99ff)!important;outline-offset:-2px!important;border-color:var(--grid-accent,#0d99ff)!important;box-shadow:none!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .rScV5Q_containerDraftFooter{display:flex!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;min-width:0!important;gap:8px!important;margin:0!important;padding:0!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-draft-hint{flex:1 1 120px!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .rScV5Q_containerDraftFooter button{box-sizing:border-box!important;flex:0 0 104px!important;width:104px!important;height:32px!important;min-height:32px!important;margin:0!important;padding:0 8px!important;border:0!important;border-radius:4px!important;background:var(--grid-text)!important;color:var(--grid-card)!important;font-size:12px!important;line-height:18px!important;white-space:nowrap!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] button:disabled{opacity:.4!important;cursor:default!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-link-draft-status{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:0!important;min-height:90px!important;text-align:center!important;color:var(--grid-muted)!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-link-draft-status strong{font-size:14px!important;line-height:20px!important;color:var(--grid-text)!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-link-draft-status p{margin:0!important;max-width:100%!important;font-size:13px!important;line-height:20px!important;overflow-wrap:anywhere!important}
 body [data-research-canvas][data-ework-grid] [data-research-template-draft] .ew-draft-error{color:var(--grid-error,#dc2626)!important}
}
`;
