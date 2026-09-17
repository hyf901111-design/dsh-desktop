import { readFileSync } from 'node:fs'
const icon = name => `data:image/svg+xml;base64,${readFileSync(new URL(`../../build/figma-canvas-icons/tool-${name}.svg`, import.meta.url)).toString('base64')}`
export function componentPlacement(rect, viewport) {
  const width = Math.max(320, rect.width / viewport.scale)
  const height = Math.max(220, rect.height / viewport.scale)
  return { x: (rect.left - viewport.x) / viewport.scale + width / 2, y: (rect.top - viewport.y) / viewport.scale + height / 2, width, height, sizeMode: 'manual' }
}
export function patchCanvasCreationTools(source) {
  source = patchComponentMarquee(source)
  source = patchComponentDraftFocus(source)
  source = patchLinkCanvasFrame(source)
  if (source.includes('/* ODYSSEY_CREATION_TOOLS */')) return installCreationStyle(source)
  const replace = (from, to) => {
    if (!source.includes(from)) throw Error('Canvas creation anchor missing: ' + from.slice(0, 100))
    source = source.replace(from, to)
  }
  replace('const [linkPopoverOpen, setLinkPopoverOpen]', `/* ODYSSEY_CREATION_TOOLS */
      const [canvasTool,setCanvasTool]=(0,react.useState)('select');
      const canvasToolRef=(0,react.useRef)('select'); canvasToolRef.current=sharedReadOnly?'select':canvasTool;
      const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);
      const selectCanvasTool=tool=>{canvasToolRef.current=tool;setCanvasTool(tool);};
      const [linkPopoverOpen, setLinkPopoverOpen]`)
  replace('"data-research-canvas": "",', '"data-research-canvas": "", "data-canvas-tool":sharedReadOnly?"select":canvasTool,')
  replace('const nodeElement = event.target?.closest?.("[data-research-node-id]");\n\t\t\t\t\tconst nodeId', `if(canvasToolRef.current==='component' && !isInteractiveTarget(event.target) && !event.target?.closest?.('[data-research-global-toolbar],[data-research-link-popover]')) {
        event.preventDefault(); root.focus({preventScroll:true}); root.setPointerCapture?.(event.pointerId);
        const bounds=root.getBoundingClientRect(), x=event.clientX-bounds.left, y=event.clientY-bounds.top;
        operationRef.current={kind:'marquee',createComponent:true,pointerId:event.pointerId,startX:x,startY:y,currentX:x,currentY:y,mode:'replace'};
        root.setAttribute('data-research-operation','marquee'); setMarquee(normalizeResearchRect({x,y},{x,y}));return;
      }
      const nodeElement = event.target?.closest?.("[data-research-node-id]");\n\t\t\t\t\tconst nodeId`)
  replace('workspace.updateSelection(researchNodesInMarquee(nodes, current.viewport, rect), operation.mode);', `if(operation.createComponent){ if(canvasToolRef.current==='component') workspace.createContainerDraft((${componentPlacement.toString()})(rect,current.viewport)); }
      else workspace.updateSelection(researchNodesInMarquee(nodes, current.viewport, rect), operation.mode);`)
  replace('workspace.createWebLink(linkInputRef.current?.value ?? linkDraft)', 'workspace.createWebLink(linkInputRef.current?.value ?? linkDraft, linkPlacement)')
  replace('!linkPopoverOpen ? null : (0, react_jsx_runtime.jsxs)("div", {', '!linkPopoverOpen ? null : react_dom.createPortal((0, react_jsx_runtime.jsxs)("div", {')
  replace('children: linkError })]\n\t\t\t\t\t\t})]', 'children: linkError })]\n\t\t\t\t\t\t}), document.body)]')
  // Keep the input anchored to canvas coordinates as the canvas pans and zooms.
  replace('className: "rScV5Q_linkPopover",', `className: "rScV5Q_linkPopover odyssey-link-draft",
      style:linkPlacement?{position:'fixed',left:(rootRef.current?.getBoundingClientRect().left??0)+linkPlacement.x*viewport.scale+viewport.x,top:(rootRef.current?.getBoundingClientRect().top??0)+linkPlacement.y*viewport.scale+viewport.y,transform:'translate(-50%,-50%) scale('+viewport.scale+')',width:400}:undefined,
      "data-research-preview-interactive":"",`)
  replace('setLinkPopoverOpen((open) => !open);', `const current=workspace.getSnapshot(),vp=current.viewport;
      setLinkPlacement({x:((current.canvasSize.availableWidth||current.canvasSize.width||rootRef.current?.getBoundingClientRect().width||800)/2-vp.x)/vp.scale,y:((current.canvasSize.height||rootRef.current?.getBoundingClientRect().height||600)/2-vp.y)/vp.scale,width:400,height:280,sizeMode:'manual'});
      workspace.updateSelection([],'replace'); setLinkPopoverOpen(true); linkInputRef.current?.focus();`)
  replace('"data-research-global-link": "", disabled:', '"data-research-global-link": "", "aria-label":"链接", "data-tool-tooltip":"链接", disabled:')
  // Replace the old one-shot container button and put persistent tools first.
  const start=source.indexOf('}), (0, react_jsx_runtime.jsxs)("button", {\n\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\t"data-research-global-container"')
  const end=source.indexOf('}), (0, react_jsx_runtime.jsx)(ResearchVoiceControl,',start)
  if(start<0||end<0)throw Error('Canvas container toolbar anchor missing')
  source=source.slice(0,start)+source.slice(end)
  const button=(tool,label,attribute,img)=>`(0,react_jsx_runtime.jsx)('button',{type:'button','${attribute}':'','aria-label':'${label}','data-tool-tooltip':'${label}','aria-pressed':canvasTool==='${tool}',disabled:${tool==='component'?'sharedReadOnly || selectionGeneration === void 0 || selectionGeneration.disabled === true':'false'},onClick:()=>selectCanvasTool('${tool}'),children:(0,react_jsx_runtime.jsx)('img',{src:${JSON.stringify(img)},width:20,height:20,alt:'',className:'odyssey-tool-icon'})})`
  replace('"aria-label": "画布全局功能",\n\t\t\t\t\tchildren: [', `"aria-label": "画布全局功能",\n\t\t\t\t\tchildren: [${button('select','选择','data-research-global-select',icon('select'))},${button('component','组件','data-research-global-container',icon('frame'))},`)
  replace('"aria-label": recording ? "结束语音并执行" : "语音",', '"aria-label": recording ? "结束语音并执行" : "语音创建 按住/双击fn", "data-tool-tooltip":"语音创建 按住/双击fn",')
  replace('title: "语音 · 双击 Fn 开始，单按结束发送；长按 Fn 说话，松开发送",', '')
  replace('children: "输入网页地址" }),', 'children: "输入网页地址" }), (0,react_jsx_runtime.jsx)("button",{type:"button",className:"odyssey-link-close","aria-label":"关闭链接输入",onClick:()=>setLinkPopoverOpen(false),children:"×"}),')
  // Labels are kept in markup for older patch compatibility but visually hidden.
  source = patchLinkCanvasFrame(source)
  source = installCreationStyle(source)
  return source
}
function patchLinkCanvasFrame(source) {
  source = source.replace("setCanvasTool(tool);setLinkPopoverOpen(false);", "setCanvasTool(tool);")
  if (!source.includes('/* ODYSSEY_CREATION_TOOLS */') || source.includes('/* ODYSSEY_LINK_CANVAS_FRAME */')) return source
  source = source.replace("(rect,current.viewport)); }", "(rect,current.viewport)); selectCanvasTool('select'); }")
  source = source.replace("const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);", `/* ODYSSEY_LINK_CANVAS_FRAME */
      const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);
      const linkDragRef=(0,react.useRef)(null);`)
  source = source.replace("position:'fixed',left:(rootRef.current?.getBoundingClientRect().left??0)+linkPlacement.x*viewport.scale+viewport.x,top:(rootRef.current?.getBoundingClientRect().top??0)+linkPlacement.y*viewport.scale+viewport.y", "position:'absolute',left:linkPlacement.x*viewport.scale+viewport.x,top:linkPlacement.y*viewport.scale+viewport.y")
  source = source.replace("width:400}:undefined", "width:linkPlacement.width,height:linkPlacement.height}:undefined")
  source = source.replace('}), document.body)]', '}), rootRef.current)]')
  source = source.replace('children: "输入网页地址" }),', `className:"rScV5Q_nodeTitle odyssey-link-title",children: "链接组件",
      onPointerDown:event=>{if(event.button!==0)return;event.stopPropagation();event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);linkDragRef.current={x:event.clientX,y:event.clientY,placement:linkPlacement};},
      onPointerMove:event=>{const drag=linkDragRef.current;if(!drag)return;event.stopPropagation();setLinkPlacement({...drag.placement,x:drag.placement.x+(event.clientX-drag.x)/viewport.scale,y:drag.placement.y+(event.clientY-drag.y)/viewport.scale});},
      onPointerUp:()=>{linkDragRef.current=null;},onPointerCancel:()=>{linkDragRef.current=null;}
    }),`)
  source = source.replace('children: "添加" })]', 'children: "创建" })]')
  source = source.replace('placeholder: "example.com 或完整网址",', '"aria-label":"输入链接", placeholder: "输入网页链接，例如 https://example.com",')
  return source
}
function patchComponentDraftFocus(source) {
  const start = source.indexOf('function ResearchContainerDraft(')
  const end = source.indexOf('function ', start + 10)
  if (start < 0 || end < start) throw Error('Missing component draft renderer')
  const body = source.slice(start, end)
  if (body.includes('ODYSSEY_DRAFT_CANVAS_FOCUS')) return source.replace("if (!inputRef.current?.closest('[data-canvas-tool=\"component\"]')) inputRef.current?.focus({ preventScroll: true });", "/* Canvas drafts receive input focus only on explicit click. */")
  const anchor = 'inputRef.current?.focus({ preventScroll: true });'
  if (!body.includes(anchor)) throw Error('Missing component draft focus')
  return source.slice(0,start) + body.replace(anchor, `/* ODYSSEY_DRAFT_CANVAS_FOCUS */
    /* Canvas drafts receive input focus only on explicit click. */`) + source.slice(end)
}
function patchComponentMarquee(source) {
  if (source.includes('"data-research-component-marquee"')) return source
  const anchor = '"data-research-marquee": "",'
  if (!source.includes(anchor)) throw Error('Missing component marquee')
  return source.replace(anchor, `${anchor}
    "data-research-component-marquee":operationRef.current?.createComponent?"":undefined,
    children:operationRef.current?.createComponent?[(0,react_jsx_runtime.jsx)('span',{className:'odyssey-frame-label',children:'智能组件'},'label'),...['nw','ne','sw','se'].map(corner=>(0,react_jsx_runtime.jsx)('i',{'data-frame-corner':corner},corner))]:undefined,`)
}
function installCreationStyle(source) {
  source = source.replace(/\n;\(\(\)=>\{const id='odyssey-creation-tools-style';[^\n]+\n/g, '\n')
  return source + `\n;(()=>{const id='odyssey-creation-tools-style';document.getElementById(id)?.remove();const style=document.createElement('style');style.id=id;style.textContent=${JSON.stringify(css)};document.head.append(style)})();\n`
}
const css = `
[data-research-component-marquee]{border:1px solid #0d99ff!important;background:transparent!important;overflow:visible!important;pointer-events:none!important;border-radius:0!important}
[data-research-component-marquee] .odyssey-frame-label{position:absolute;left:-1px;bottom:calc(100% + 5px);color:#64c5ff;font:12px/16px sans-serif;white-space:nowrap}
[data-frame-corner]{position:absolute;width:7px;height:7px;box-sizing:border-box;background:white;border:1px solid #0d99ff;pointer-events:none}
[data-frame-corner=nw]{left:-4px;top:-4px}[data-frame-corner=ne]{right:-4px;top:-4px}[data-frame-corner=sw]{left:-4px;bottom:-4px}[data-frame-corner=se]{right:-4px;bottom:-4px}

[data-canvas-tool] [data-research-global-toolbar].rScV5Q_globalToolbar{width:188px!important;height:48px!important;padding:6px!important;gap:4px!important;overflow:visible;display:flex!important;align-items:center}
[data-canvas-tool] [data-research-global-toolbar].rScV5Q_globalToolbar>button,[data-canvas-tool] [data-research-global-toolbar].rScV5Q_globalToolbar .rScV5Q_globalToolSlot>button{position:relative;width:40px!important;height:36px!important;min-width:40px!important;max-width:40px!important;flex:0 0 40px!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;background:transparent!important;border-radius:7px;gap:0;color:var(--odyssey-tool-color,#333)!important}
[data-canvas-tool] [data-research-global-toolbar] button>span:not(.odyssey-global-icon){display:none}
[data-canvas-tool] [data-research-global-toolbar] .rScV5Q_globalToolSlot{width:40px!important;min-width:40px!important;flex:0 0 40px!important;display:flex}
[data-canvas-tool] [data-research-global-toolbar].rScV5Q_globalToolbar button[aria-pressed=true]{background:#0d99ff!important;color:white!important}
.odyssey-tool-icon{width:20px;height:20px;display:block;flex:none;filter:brightness(0) opacity(.8)}body[data-ds-dark-theme] .odyssey-tool-icon{filter:brightness(0) invert(.94)}
[data-canvas-tool] [data-research-global-toolbar] button[aria-pressed=true] .odyssey-tool-icon{filter:brightness(0) invert(1)}
[data-canvas-tool] [data-research-global-toolbar] button[data-tool-tooltip]:hover:after,[data-canvas-tool] [data-research-global-toolbar] button[data-tool-tooltip]:focus-visible:after{content:attr(data-tool-tooltip);position:absolute;bottom:calc(100% + 14px);left:50%;transform:translateX(-50%);padding:6px 9px;border-radius:6px;background:#202124;color:white;font:12px/18px sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px #0003;z-index:100}
[data-research-canvas][data-canvas-tool=component]{cursor:crosshair!important}
[data-canvas-tool=component]>div:not([data-research-global-toolbar]),[data-canvas-tool=component] .rScV5Q_previewShield,[data-canvas-tool=component] [data-research-node-id]:not(:has([data-research-container-draft])){cursor:crosshair!important}
[data-canvas-tool=component] [data-research-node-id]:not(:has([data-research-container-draft])) iframe{pointer-events:none}
[data-canvas-tool] [data-research-global-toolbar] .odyssey-global-icon{display:block!important;width:20px!important;height:20px!important;flex:none;background:currentColor!important;mask-position:center;mask-size:20px 20px;mask-repeat:no-repeat}
[data-canvas-tool] [data-research-global-toolbar] .odyssey-global-link{mask-image:url("${icon('link')}")}
[data-canvas-tool] [data-research-global-toolbar] .odyssey-global-voice{mask-image:url("${icon('voice')}")}
body[data-ds-dark-theme] [data-canvas-tool]{--odyssey-tool-color:#eee}
[data-canvas-tool] [data-research-global-toolbar] button:hover:not([aria-pressed=true]){background:#8882!important}
[data-research-container-draft]{box-sizing:border-box;min-height:0;height:100%;display:flex;flex-direction:column;padding:16px!important;gap:12px}
[data-research-container-draft] textarea{box-sizing:border-box;flex:1;min-height:40px!important;height:auto!important;resize:none}
[data-research-container-draft] .rScV5Q_containerDraftFooter{flex:none;margin-top:0}
[data-research-canvas][data-canvas-tool]{overflow:hidden!important;isolation:isolate}
.rScV5Q_linkPopover.odyssey-link-draft{box-sizing:border-box;bottom:auto!important;right:auto!important;min-height:0;padding:0!important;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:none;display:flex;flex-direction:column;gap:0!important;z-index:20;transform-origin:center;overflow:hidden;color:var(--dsw-alias-label-primary)}
body[data-ds-dark-theme] .rScV5Q_linkPopover.odyssey-link-draft{background:var(--dsw-alias-bg-layer-2);color:#eee}
.odyssey-link-draft .odyssey-link-title{box-sizing:border-box;flex:none;width:100%;height:36px;min-height:36px;margin:0!important;padding:0 42px 0 14px;display:flex;align-items:center;background:var(--dsw-alias-bg-layer-2);font:var(--dsw-font-xs-13);cursor:grab;touch-action:none}
.odyssey-link-draft>div{box-sizing:border-box;flex:1;min-height:0;display:flex!important;flex-direction:column;justify-content:center;align-items:stretch!important;padding:20px;gap:14px!important}
.odyssey-link-draft input{box-sizing:border-box;width:100%;min-width:0;flex:none!important;height:44px!important;padding:12px!important;font-size:14px!important}
.odyssey-link-draft [data-research-link-submit]{align-self:flex-end;flex:none}
.odyssey-link-draft .odyssey-link-close{position:absolute;right:6px;top:4px;width:28px!important;height:28px!important;padding:0!important;border:0!important;background:transparent!important;color:inherit!important;box-shadow:none!important;font-size:20px;cursor:pointer}
.odyssey-link-draft .rScV5Q_linkError{padding:0 20px 12px}
`
