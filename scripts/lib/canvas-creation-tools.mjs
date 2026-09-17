import { readFileSync } from 'node:fs'
const icon = name => `data:image/svg+xml;base64,${readFileSync(new URL(`../../build/figma-canvas-icons/tool-${name}.svg`, import.meta.url)).toString('base64')}`
export function componentPlacement(rect, viewport) {
  const width = Math.max(320, rect.width / viewport.scale)
  const height = Math.max(220, rect.height / viewport.scale)
  return { x: (rect.left - viewport.x) / viewport.scale + width / 2, y: (rect.top - viewport.y) / viewport.scale + height / 2, width, height, sizeMode: 'manual' }
}
export function patchCanvasCreationTools(source) {
  if (source.includes('/* ODYSSEY_CREATION_TOOLS */')) return source
  const replace = (from, to) => {
    if (!source.includes(from)) throw Error('Canvas creation anchor missing: ' + from.slice(0, 100))
    source = source.replace(from, to)
  }
  replace('const [linkPopoverOpen, setLinkPopoverOpen]', `/* ODYSSEY_CREATION_TOOLS */
      const [canvasTool,setCanvasTool]=(0,react.useState)('select');
      const canvasToolRef=(0,react.useRef)('select'); canvasToolRef.current=sharedReadOnly?'select':canvasTool;
      const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);
      const selectCanvasTool=tool=>{canvasToolRef.current=tool;setCanvasTool(tool);setLinkPopoverOpen(false);};
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
  source += `\n;(()=>{const id='odyssey-creation-tools-style';document.getElementById(id)?.remove();const style=document.createElement('style');style.id=id;style.textContent=${JSON.stringify(css)};document.head.append(style)})();\n`
  return source
}
const css = `
[data-research-global-toolbar].rScV5Q_globalToolbar{width:188px;height:48px;padding:6px;gap:4px;overflow:visible}
[data-research-global-toolbar].rScV5Q_globalToolbar>button,[data-research-global-toolbar].rScV5Q_globalToolbar .rScV5Q_globalToolSlot>button{position:relative;width:40px;height:36px;min-width:40px;background:transparent;border-radius:7px;gap:0}
[data-research-global-toolbar] button>span:not(.odyssey-global-icon){display:none}
[data-research-global-toolbar] .rScV5Q_globalToolSlot{width:40px}
[data-research-global-toolbar].rScV5Q_globalToolbar button[aria-pressed=true]{background:#0d99ff;color:white}
.odyssey-tool-icon{width:20px;height:20px}body[data-ds-dark-theme] .odyssey-tool-icon{filter:invert(.9)}
[data-research-global-toolbar] button[aria-pressed=true] .odyssey-tool-icon{filter:brightness(0) invert(1)}
[data-research-global-toolbar] button[data-tool-tooltip]:hover:after,[data-research-global-toolbar] button[data-tool-tooltip]:focus-visible:after{content:attr(data-tool-tooltip);position:absolute;bottom:calc(100% + 14px);left:50%;transform:translateX(-50%);padding:6px 9px;border-radius:6px;background:#202124;color:white;font:12px/18px sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px #0003;z-index:100}
[data-canvas-tool=component]{cursor:crosshair}
[data-canvas-tool=component] [data-research-node-id]:not(:has([data-research-container-draft])) iframe{pointer-events:none}
[data-research-container-draft]{box-sizing:border-box;min-height:0;height:100%;display:flex;flex-direction:column;padding:16px!important;gap:12px}
[data-research-container-draft] textarea{box-sizing:border-box;flex:1;min-height:40px!important;height:auto!important;resize:none}
[data-research-container-draft] .rScV5Q_containerDraftFooter{flex:none;margin-top:0}
.rScV5Q_linkPopover.odyssey-link-draft{box-sizing:border-box;bottom:auto!important;right:auto!important;min-height:180px;padding:20px;border:1px solid #0d99ff;border-radius:10px;background:var(--odyssey-card-bg,#fff);box-shadow:0 8px 28px #0002;display:flex;flex-direction:column;justify-content:center;gap:16px;z-index:20;transform-origin:center}
body[data-ds-dark-theme] .rScV5Q_linkPopover.odyssey-link-draft{background:#242424;color:#eee}
.odyssey-link-close{position:absolute;right:10px;top:8px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}
.odyssey-link-draft input{min-width:0;flex:1;font-size:14px}
`
