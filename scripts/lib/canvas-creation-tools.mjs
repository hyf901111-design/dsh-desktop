import { patchCanvasToolShortcuts } from './canvas-tool-shortcuts.mjs'
import { patchResearchCanvasRenderPerformance } from './research-canvas-render-performance.mjs'
import { readFileSync } from 'node:fs'
const icon = name => `data:image/svg+xml;base64,${readFileSync(new URL(`../../build/figma-canvas-icons/tool-${name}.svg`, import.meta.url)).toString('base64')}`
export function componentPlacement(rect, viewport) {
  // A tiny drag still creates a usable frame at the component minimum. Keep
  // the dragged top-left anchored while expanding the opposite edges.
  const width = Math.max(320, rect.width / viewport.scale)
  const height = Math.max(220, rect.height / viewport.scale)
  return { x: (rect.left - viewport.x) / viewport.scale + width / 2, y: (rect.top - viewport.y) / viewport.scale + height / 2, width, height, sizeMode: 'manual' }
}
// Snap both edges in screen space, including fractional panel offsets. Otherwise
// a thin border can land between device pixels and fade on only one or two sides.
export function marqueeScreenStyle(rect, root) {
  const origin = root?.getBoundingClientRect() ?? { left: 0, top: 0 }
  const dpr = root?.ownerDocument?.defaultView?.devicePixelRatio || 1
  const snap = value => Math.round(value * dpr) / dpr
  const left = snap(origin.left + rect.left), top = snap(origin.top + rect.top)
  const right = snap(origin.left + rect.left + rect.width), bottom = snap(origin.top + rect.top + rect.height)
  return { left: left - origin.left, top: top - origin.top,
    width: Math.max(0, right - left), height: Math.max(0, bottom - top),
    // Chromium quantizes CSS borders before rasterizing fractional display scales.
    // Give those scales an opaque inner pixel instead of an entirely blended line.
    '--odyssey-marquee-stroke': Number.isInteger(dpr) ? `${1 / dpr}px` : '2px' }
}
function patchMarqueeScreenStyle(source) {
  const marker = '/* ODYSSEY_MARQUEE_SCREEN_PIXELS */'
  const replacement = `${marker} style: (${marqueeScreenStyle.toString()})(marquee, rootRef.current)`
  if (source.includes(marker)) {
    const start = source.indexOf(marker), suffix = ')(marquee, rootRef.current)'
    const end = source.indexOf(suffix, start)
    if (end < 0) throw Error('Incomplete marquee screen geometry')
    return source.slice(0, start) + replacement + source.slice(end + suffix.length)
  }
  const anchor = 'style: { left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }'
  if (!source.includes(anchor)) throw Error('Missing marquee screen geometry')
  return source.replace(anchor, replacement)
}
// Keep pointer painting outside React: generation cards must not rerender on every move.
export function patchMarqueeInteraction(source) {
  if (source.includes('/* ODYSSEY_MARQUEE_FRAME */')) return source
  const change = (from, to) => { if (!source.includes(from)) throw Error('Missing marquee interaction: ' + from); source = source.replace(from, to) }
  change('let fileDragDepth = 0;', `/* ODYSSEY_MARQUEE_FRAME */
    let marqueeFrame=0;
    const paintMarquee=()=>{
      marqueeFrame=0;const op=operationRef.current,element=root.querySelector('[data-research-marquee]');
      if(op?.kind!=='marquee'||!element)return;
      const rect=normalizeResearchRect({x:op.startX,y:op.startY},{x:op.currentX,y:op.currentY});
      const style=(${marqueeScreenStyle.toString()})(rect,root);
      for(const [key,value] of Object.entries(style))key.startsWith('--')?element.style.setProperty(key,value):element.style[key]=value+'px';
    };
    const scheduleMarquee=()=>{if(!marqueeFrame)marqueeFrame=window.requestAnimationFrame(paintMarquee);};
    let fileDragDepth = 0;`)
  change('setMarquee(normalizeResearchRect({ x: operation.startX, y: operation.startY }, { x: operation.currentX, y: operation.currentY }));', 'scheduleMarquee();')
  change('if (commitMarquee && operation.kind === "marquee") {', `if(marqueeFrame){window.cancelAnimationFrame(marqueeFrame);marqueeFrame=0;}
    if(commitMarquee && operation.kind==='marquee' && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)){
      const bounds=root.getBoundingClientRect();operation.currentX=event.clientX-bounds.left;operation.currentY=event.clientY-bounds.top;
    }
    if (commitMarquee && operation.kind === "marquee") {`)
  return source
}
export function patchCanvasCreationTools(source) {
  const oldInteractive = 'const isInteractiveTarget = (target) => typeof target?.closest === "function" && target.closest("input,textarea,button,select,a,[contenteditable=true],[data-research-preview-interactive]") !== null;'
  const cardInteractive = `const isInteractiveTarget = (target) => typeof target?.closest === "function" && (target.closest("input,textarea,button,select,a,[contenteditable=true]") !== null || (target.closest("[data-research-preview-interactive]") !== null && !target.closest("[data-research-node-id]")?.querySelector("[data-research-generation-process]")));`
  source = source.replace(oldInteractive, cardInteractive)
  source = source.replace(/\(function componentPlacement\(rect, viewport\) \{[\s\S]*?\}\)\(rect,current\.viewport\)/, `(${componentPlacement.toString()})(rect,current.viewport)`)
  source = source.replace('// Resizing a placeholder must not lock the first finished artifact.', '// Explicit user dimensions remain authoritative after generation.')
  source = source.replace('sizeMode: current.containerSpec === void 0 ? "auto" : current.sizeMode,', 'sizeMode: current.sizeMode,')
  source = patchMarqueeScreenStyle(patchComponentMarquee(source))
  source = patchMarqueeInteraction(source)
  source = patchComponentDraftFocus(source)
  source = patchComponentDraftKeyboard(source)
  source = patchLinkDraftActions(patchNativeLinkDraft(patchLinkSelection(patchLinkDraftChrome(patchLinkCanvasFrame(source)))))
  if (source.includes('/* ODYSSEY_CREATION_TOOLS */')) return patchCanvasToolShortcuts(patchResearchCanvasRenderPerformance(installCreationStyle(source)))
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
  source = patchLinkDraftActions(patchNativeLinkDraft(patchLinkSelection(patchLinkDraftChrome(patchLinkCanvasFrame(source)))))
  source = installCreationStyle(source)
  return patchCanvasToolShortcuts(patchResearchCanvasRenderPerformance(source))
}
function patchNativeLinkDraft(source) {
  if(source.includes('/* ODYSSEY_NATIVE_LINK_DRAFT */')&&!source.includes('/* ODYSSEY_LINK_GEOMETRY */'))source=source.replace('function normalizeResearchCanvasNodeGeometry(node) {', `function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_LINK_GEOMETRY */
    if(node?.containerPrompt==='odyssey:link-draft')return {width:Math.max(320,node.width||400),height:Math.max(177,node.height||177),sizeMode:'manual',resizable:true};`)
  if (!source.includes('/* ODYSSEY_LINK_SELECTION */') || source.includes('/* ODYSSEY_NATIVE_LINK_DRAFT */')) return source
  const change=(from,to)=>{if(!source.includes(from))throw Error('Native link anchor missing: '+from.slice(0,90));source=source.replace(from,to)}
  change('createContainerDraft(placement = null) {', 'createContainerDraft(placement = null, draftKind = "container") {')
  change('containerPrompt: "", containerSizePreset: "small",', 'containerPrompt: draftKind === "link" ? "odyssey:link-draft" : "", ...(draftKind === "link" ? {title:"添加链接"} : {}), containerSizePreset: "small",')
  change('createWebLink(rawUrl, placement = null) {', `completeLinkDraft(nodeId,rawUrl){
    const current=snapshot.artifacts.find(node=>node.id===nodeId&&node.containerPrompt==='odyssey:link-draft');
    const url=normalizeResearchWebUrl(rawUrl);if(!current||!url)return false;
    const node=canonicalResearchCanvasArtifactNode({id:current.id,messageId:current.messageId,kind:'web-link',url,title:researchWebUrlHostname(url),titleMode:'auto',excerpt:url,x:current.x,y:current.y,width:current.width,height:current.height,sizeMode:'manual',stackOrder:current.stackOrder});
    if(!node)return false;
    commitUpdate({artifacts:snapshot.artifacts.map(item=>item.id===nodeId?node:item)},true);return true;
  },
  createWebLink(rawUrl, placement = null) {`)
  // Remove the independent portal. Drafts now live in the same transformed layer as every node.
  const portal=source.indexOf(', !linkPopoverOpen ? null : react_dom.createPortal(')
  const portalEnd=source.indexOf('}), rootRef.current)]',portal)
  if(portal<0||portalEnd<0)throw Error('Missing legacy link portal')
  source=source.slice(0,portal)+']'+source.slice(portalEnd+'}), rootRef.current)]'.length)
  const open=source.indexOf('setLinkPlacement({x:')
  const openEnd=source.indexOf('linkInputRef.current?.focus();',open)
  if(open<0||openEnd<0)throw Error('Missing link toolbar callback')
  let creation=source.slice(open,openEnd+'linkInputRef.current?.focus();'.length)
  creation=creation.slice(0,creation.indexOf(";\n"))+';'
  creation=creation.replace('setLinkPlacement(', 'workspace.createContainerDraft(').replace("sizeMode:'manual'});", "sizeMode:'manual'},'link');")
  source=source.slice(0,open)+creation+source.slice(openEnd+'linkInputRef.current?.focus();'.length)
  change('artifacts.map((node) => (0, react_jsx_runtime.jsx)(ResearchCanvasArtifactCard, {', `artifacts.map((node) => node.containerPrompt==='odyssey:link-draft'&&node.generationStatus==='draft' ? (0,react_jsx_runtime.jsx)(ResearchLinkDraftCard,{node,workspace,selected:selectedIds.has(node.id),readOnly:sharedReadOnly},node.id) : (0, react_jsx_runtime.jsx)(ResearchCanvasArtifactCard, {`)
  change('selectedNodes.every((node) => sherlockBoardsPage.selectionNodeReady(node)', 'selectedNodes.every((node) => node.containerPrompt!=="odyssey:link-draft" && sherlockBoardsPage.selectionNodeReady(node)')
  change('function ResearchContainerDraft(', `/* ODYSSEY_NATIVE_LINK_DRAFT */
  function ResearchLinkDraftCard({node,workspace,selected,readOnly}) {
    const [url,setUrl]=(0,react.useState)('');const [error,setError]=(0,react.useState)(null);
    const submit=()=>{if(readOnly)return;if(!workspace.completeLinkDraft(node.id,url))setError('请输入有效的网页链接');};
    return (0,react_jsx_runtime.jsxs)('div',{
      className:'rScV5Q_richNode odyssey-link-draft', 'data-research-compact-chrome':'','data-research-artifact-card':node.id,'data-research-node-id':node.id,'data-research-link-draft':'','data-selected':selected||undefined,
      style:{position:'absolute',left:node.x,top:node.y,width:node.width,height:node.height,transform:'translate(-50%,-50%)',zIndex:researchCanvasStackOrder(node.stackOrder)},
      onFocusCapture:()=>{if(!selected)workspace.updateSelection([node.id],'replace');},
      children:[(0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_nodeTitle','data-research-node-move-handle':'',children:(0,react_jsx_runtime.jsx)('span',{className:'rScV5Q_nodeTitleText',children:'添加链接'})}),
      (0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_containerDraft','data-research-preview-interactive':'',children:[
        (0,react_jsx_runtime.jsx)('textarea',{'aria-label':'输入链接',placeholder:'输入网页链接，例如 https://example.com',rows:1,inputMode:'url',value:url,disabled:readOnly,onInput:event=>{setUrl(event.currentTarget.value);setError(null);},onKeyDown:event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();submit();}}}),
        (0,react_jsx_runtime.jsx)('div',{className:'rScV5Q_containerDraftFooter',children:(0,react_jsx_runtime.jsx)('button',{'data-research-link-submit':'',disabled:readOnly||!url.trim(),onClick:submit,children:'创建'})}),
        error&&(0,react_jsx_runtime.jsx)('span',{role:'alert',children:error})]})]});
  }
  function ResearchContainerDraft(`)
  change('function normalizeResearchCanvasNodeGeometry(node) {', `function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_LINK_GEOMETRY */
    if(node?.containerPrompt==='odyssey:link-draft')return {width:Math.max(320,node.width||400),height:Math.max(177,node.height||177),sizeMode:'manual',resizable:true};`)
  // Old overlay-only selection listeners must not clear the native node selection.
  const legacy=source.indexOf('/* ODYSSEY_LINK_SELECTION */'), legacyEnd=source.indexOf('const selectCanvasTool=',legacy)
  if(legacy>=0&&legacyEnd>=0)source=source.slice(0,legacy)+source.slice(legacyEnd)
  return source
}
function patchLinkSelection(source) {
  source=source.replace('"data-selected":linkSelected?"true":"false"', '"data-selected":linkSelected?"true":undefined')
  if (!source.includes('/* ODYSSEY_LINK_SHARED_CHROME */') || source.includes('/* ODYSSEY_LINK_SELECTION */')) return source
  source=source.replace('const linkDragRef=(0,react.useRef)(null);', `const linkDragRef=(0,react.useRef)(null);
      /* ODYSSEY_LINK_SELECTION */
      const [linkSelected,setLinkSelected]=(0,react.useState)(false);
      const linkCardRef=(0,react.useRef)(null);
      (0,react.useEffect)(()=>{
        const select=event=>{const inside=linkCardRef.current?.contains(event.target);setLinkSelected(!!inside);if(inside)workspace.updateSelection([],'replace');};
        document.addEventListener('pointerdown',select,true);
        return ()=>document.removeEventListener('pointerdown',select,true);
      },[workspace]);`)
  source=source.replace('className: "rScV5Q_richNode odyssey-link-draft",', `className: "rScV5Q_richNode odyssey-link-draft",ref:linkCardRef,"data-selected":linkSelected?"true":undefined,onFocusCapture:()=>{setLinkSelected(true);workspace.updateSelection([],'replace');},`)
  source=source.replace('setLinkPopoverOpen(true); linkInputRef.current?.focus();','setLinkSelected(true); setLinkPopoverOpen(true); linkInputRef.current?.focus();')
  return source
}
function patchLinkDraftChrome(source) {
  if (!source.includes('/* ODYSSEY_LINK_CANVAS_FRAME */') || source.includes('/* ODYSSEY_LINK_SHARED_CHROME */')) return source
  source=source.replace('className: "rScV5Q_linkPopover odyssey-link-draft",', `/* ODYSSEY_LINK_SHARED_CHROME */
    className: "rScV5Q_richNode odyssey-link-draft", "data-research-compact-chrome":"", "data-research-artifact-card":"",`)
  source=source.replace("width:400,height:280,sizeMode:'manual'", "width:400,height:177,sizeMode:'manual'")
  const start=source.indexOf('/* ODYSSEY_LINK_SHARED_CHROME */'), end=source.indexOf('}), rootRef.current)]',start)
  let block=source.slice(start,end)
  block=block.replace('children: "链接组件",','children: (0,react_jsx_runtime.jsx)("span",{className:"rScV5Q_nodeTitleText",children:"链接组件"}),')
  block=block.replace('children: [(0, react_jsx_runtime.jsx)("input", {','className:"rScV5Q_containerDraft", children: [(0, react_jsx_runtime.jsx)("textarea", {')
  block=block.replace('type: "text", inputMode: "url",','rows:1, inputMode: "url",')
  block=block.replace('(0, react_jsx_runtime.jsx)("button", { type: "button", "data-research-link-submit":', '(0, react_jsx_runtime.jsx)("div", {className:"rScV5Q_containerDraftFooter",children:(0, react_jsx_runtime.jsx)("button", { type: "button", "data-research-link-submit":')
  block=block.replace('children: "创建" })]', 'children: "创建" })})]')
  return source.slice(0,start)+block+source.slice(end)
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
function patchComponentDraftKeyboard(source) {
  const start = source.indexOf('function ResearchContainerDraft(')
  const end = source.indexOf('function ', start + 10)
  if (start < 0 || end < start) throw Error('Missing component draft keyboard renderer')
  const body = source.slice(start, end)
  if (body.includes('ODYSSEY_MANUAL_COMPOSER_ENTER')) return source
  const anchor = 'if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {'
  if (!body.includes(anchor)) throw Error('Missing component draft submit shortcut')
  return source.slice(0,start) + body.replace(anchor, `/* ODYSSEY_MANUAL_COMPOSER_ENTER */
            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229 && event.nativeEvent?.keyCode !== 229) {`) + source.slice(end)
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
  return source.trimEnd() + `\n;(()=>{const id='odyssey-creation-tools-style';document.getElementById(id)?.remove();const style=document.createElement('style');style.id=id;style.textContent=${JSON.stringify(creationToolsCss)};document.head.append(style)})();\n`
}
export const creationToolsCss = `
[data-research-canvas] [data-research-marquee]{border-width:var(--odyssey-marquee-stroke,1px)!important;border-color:#0d99ff!important}
[data-research-component-marquee]{border-style:solid!important;background:transparent!important;overflow:visible!important;pointer-events:none!important;border-radius:0!important}
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
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft]{box-sizing:border-box;min-height:0;height:100%;display:flex;flex-direction:column;padding:18px!important;gap:12px}
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] textarea{box-sizing:border-box;flex:1;min-height:40px!important;height:auto!important;resize:none}
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] textarea{caret-color:#333}
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] textarea:focus{border-color:#333!important;box-shadow:0 0 0 1px #0000001f!important;outline:0}
body[data-ds-dark-theme] [data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] textarea{caret-color:#f5f5f5}
body[data-ds-dark-theme] [data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] textarea:focus{border-color:#f5f5f5!important;box-shadow:0 0 0 1px #ffffff24!important}
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] .rScV5Q_containerDraftFooter{flex:none;margin-top:0}
[data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] .rScV5Q_containerDraftFooter button{box-sizing:border-box;width:92px;height:32px;border-radius:8px;padding:0 12px;background:#191919;color:#fff;border:0}
body[data-ds-dark-theme] [data-research-compact-chrome][data-research-generated-container] [data-research-container-draft] .rScV5Q_containerDraftFooter button{background:#f5f5f5;color:#191919}
[data-research-canvas][data-canvas-tool]{overflow:hidden!important;isolation:isolate}
.odyssey-link-draft{box-sizing:border-box;bottom:auto!important;right:auto!important;min-height:0;padding:0!important;border:1px solid transparent;background:var(--odyssey-content);display:flex;flex-direction:column;gap:0!important;transform-origin:center;overflow:hidden;color:var(--odyssey-card-text)}
.odyssey-link-draft .odyssey-link-title{box-sizing:border-box;flex:none;width:100%;margin:0!important;display:flex;background:var(--odyssey-card);cursor:grab;touch-action:none}
.odyssey-link-draft .rScV5Q_containerDraft{box-sizing:border-box;flex:1;min-height:0!important;height:auto!important;display:flex;flex-direction:column;gap:12px;padding:18px!important}
body [data-research-compact-chrome].odyssey-link-draft .rScV5Q_containerDraft textarea{box-sizing:border-box;width:100%;height:auto!important;min-height:40px!important;flex:1 1 auto;resize:none;white-space:pre-wrap;overflow:auto}
.odyssey-link-draft .rScV5Q_containerDraftFooter{flex:none;display:flex;justify-content:flex-end;margin-top:auto}
body [data-research-compact-chrome].odyssey-link-draft .rScV5Q_containerDraftFooter button{box-sizing:border-box;width:92px!important;height:32px!important;padding:0 12px;border:0;border-radius:8px;background:#191919;color:#fff}
body[data-ds-dark-theme] .odyssey-link-draft .rScV5Q_containerDraftFooter button{background:#f5f5f5;color:#191919}
.odyssey-link-draft .odyssey-link-close{position:absolute;right:12px;top:11px;width:24px!important;height:24px!important;padding:0!important;border:0!important;border-radius:6px;background:transparent!important;color:var(--odyssey-card-muted)!important;box-shadow:none!important;font-size:20px;cursor:pointer}
body [data-research-compact-chrome].odyssey-link-draft{border-radius:12px!important;overflow:hidden!important}
body [data-research-compact-chrome].odyssey-link-draft>.rScV5Q_containerDraft{border-radius:0 0 11px 11px;overflow:hidden}
body [data-research-compact-chrome].odyssey-link-draft[data-selected=true]::after{inset:0;border-radius:inherit}
.odyssey-link-draft .rScV5Q_linkError{padding:0 20px 12px}
[data-research-canvas] [data-research-node-id][data-research-node-id][data-selected=true]{outline:none!important;border-color:transparent!important;box-shadow:none!important}
[data-research-canvas] [data-research-node-id][data-research-node-id][data-selected=true]::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1.5px var(--odyssey-select,#1b77ff),0 0 0 2px #60a5fa66,0 0 20px 3px #3b82f640;pointer-events:none;z-index:50}
[data-research-canvas] [data-research-node-id]:not([data-selected=true]){box-shadow:none!important}
[data-research-canvas] [data-research-marquee]{z-index:25!important;pointer-events:none}
`

// Draft links share the exact frame, hover actions, modal and resize handles.
function patchLinkDraftActions(source) {
  const start=source.indexOf('function ResearchLinkDraftCard('),end=source.indexOf('function ResearchContainerDraft(',start);
  if(start<0)return source;
  if(end<0)throw Error('Link draft frame anchor missing');
  return source.slice(0,start)+`function ResearchLinkDraftCard({node,workspace,selected,readOnly}) {
    const [url,setUrl]=react.useState(''),[error,setError]=react.useState(null),[editing,setEditing]=react.useState(false);
    const submit=()=>{if(readOnly)return;if(!workspace.completeLinkDraft(node.id,url))setError('请输入有效的网页链接');};
    const onFrameAction=(target,action)=>{if(readOnly)return;if(action==='rename')setEditing(true);else if(action==='remove')workspace.removeNodes([target.id]);};
    return react_jsx_runtime.jsx(ResearchCanvasRichNodeFrame,{
      node,selected,onFrameAction:readOnly?undefined:onFrameAction,className:'odyssey-link-draft',titleText:node.title||'添加链接',
      'data-research-artifact-card':node.id,'data-research-link-draft':'',
      title:editing?react_jsx_runtime.jsx(ResearchCanvasInlineTitleEditor,{nodeId:node.id,value:node.title,onCommit:title=>{if(!readOnly)workspace.renameNode(node.id,title);setEditing(false)},onCancel:()=>setEditing(false)}):node.title||'添加链接',
      onFocusCapture:()=>{if(!selected)workspace.updateSelection([node.id],'replace');},
      children:react_jsx_runtime.jsxs('div',{className:'rScV5Q_containerDraft','data-research-preview-interactive':'',children:[
        react_jsx_runtime.jsx('textarea',{'aria-label':'输入链接',placeholder:'输入网页链接，例如 https://example.com',rows:1,inputMode:'url',value:url,disabled:readOnly,onInput:event=>{setUrl(event.currentTarget.value);setError(null)},onKeyDown:event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();submit()}}}),
        react_jsx_runtime.jsx('div',{className:'rScV5Q_containerDraftFooter',children:react_jsx_runtime.jsx('button',{'data-research-link-submit':'',disabled:readOnly||!url.trim(),onClick:submit,children:'创建'})}),
        error&&react_jsx_runtime.jsx('span',{role:'alert',children:error})]})});
  }
  `+source.slice(end);
}
