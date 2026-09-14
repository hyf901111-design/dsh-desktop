import { readFileSync } from 'node:fs'
const fileIcon = 'data:image/svg+xml;base64,' + readFileSync(new URL('../../docs/figma-file-web-evidence/figma-file.svg', import.meta.url)).toString('base64')
const linkIcon = 'data:image/svg+xml;base64,' + readFileSync(new URL('../../docs/figma-file-web-evidence/figma-link.svg', import.meta.url)).toString('base64')
const startMarker = '/* ODYSSEY_FILE_PREVIEW_START */'
const endMarker = '/* ODYSSEY_FILE_PREVIEW_END */'
function replaceOnce(source, anchor, replacement) {
  const first = source.indexOf(anchor)
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) throw Error('Figma file preview anchor missing or ambiguous: ' + anchor.slice(0, 80))
  return source.slice(0, first) + replacement + source.slice(first + anchor.length)
}

export function patchFigmaFilePreview(source) {
  source=source.replaceAll('authorizationId: descriptor.authorizationId, contentType: descriptor.contentType }', 'authorizationId: descriptor.authorizationId, contentType: descriptor.contentType, ...(descriptor.previewEligible === false ? {previewEligible:false} : {}) }');
  source=source.replace("if(kind!=='image'&&kind!=='assistant')return", "if(kind!=='generic'&&kind!=='image'&&kind!=='assistant')return");
  {
    const start=source.indexOf('function ResearchCanvasFrameMenu('),end=source.indexOf('function ResearchCanvasRichNodeFrame(',start);
    if(start>=0&&end>start)source=source.slice(0,start)+source.slice(start,end).replace('}),document.body) : null]', "}),rootRef.current?.closest('dialog[open]') || document.fullscreenElement || document.body) : null]")+source.slice(end);
  }
  source=source.replace('"data-research-link-input": "",\n\t\t\t\t\t\t\t\t\ttype: "url",', '"data-research-link-input": "",\n\t\t\t\t\t\t\t\t\ttype: "text", inputMode: "url",');
  source=source.replace('placeholder: "https://example.com",','placeholder: "example.com 或完整网址",');
  if(!source.includes('/* ODYSSEY_WEB_ADDRESS_COMPLETION */')) {
    source=replaceOnce(source,'const url = new Url(source);',`/* ODYSSEY_WEB_ADDRESS_COMPLETION */
        let address=source;
        if(address.startsWith('//'))address='https:'+address;
        else if(!/^[a-z][a-z0-9+.-]*:/i.test(address) || /^(?:localhost|[^/:]+\\.[^/:]+):[0-9]+(?:[/?#]|$)/i.test(address)) {
          const host=address.split(/[/?#]/)[0];
          if(!host.includes('.')&&!/^localhost(?::[0-9]+)?$/i.test(host))return null;
          address='https://'+address;
        }
        const url = new Url(address);`);
    source=source.replace('请输入有效的 http 或 https 地址','请输入有效的网站地址，例如 baidu.com');
  }

  if(!source.includes('/* ODYSSEY_FRAME_SOURCE_MENU */')) {
    const start=source.indexOf('function ResearchCanvasFrameMenu('),end=source.indexOf('function ResearchCanvasRichNodeFrame(',start);
    if(start<0||end<start)throw Error('Frame sources menu boundary drifted');
    let part=source.slice(start,end);
    part=replaceOnce(part,'const menuId = (0, react.useId)();',`const menuId = (0, react.useId)();
      /* ODYSSEY_FRAME_SOURCE_MENU */
      const [showSources,setShowSources]=(0,react.useState)(false);`);
    part=replaceOnce(part,'setOpen(false); if (focus)', 'setOpen(false); setShowSources(false); if (focus)');
    part=replaceOnce(part,'children: actions.map(([action, label])', 'children: [actions.map(([action, label])');
    part=replaceOnce(part,'}, action))',`}, action)),(node.sourceNodeIds?.length>0) && (0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-research-frame-sources':'','aria-expanded':showSources,onClick:event=>{event.stopPropagation();setShowSources(!showSources);},children:'来源信息'}),showSources && (0,react_jsx_runtime.jsx)(ResearchDerivedSources,{node,embedded:true})]`);
    part=part.replace('[open,present]);','[open,present,showSources]);');
    source=source.slice(0,start)+part+source.slice(end);
  }

  source=source.replace('},[open,present]);','},[open,present,showSources]);');
  if(!source.includes('/* ODYSSEY_FRAME_MENU_PORTAL */')) {
    const start=source.indexOf('function ResearchCanvasFrameMenu('),end=source.indexOf('function ResearchCanvasRichNodeFrame(',start);
    if(start<0||end<start)throw Error('Frame menu boundary drifted');
    let part=source.slice(start,end);
    part=replaceOnce(part,'const menuId = (0, react.useId)();',`const menuId = (0, react.useId)();
      /* ODYSSEY_FRAME_MENU_PORTAL */
      const menuRef=(0,react.useRef)(null);
      const [menuStyle,setMenuStyle]=(0,react.useState)({visibility:'hidden'});
      (0,react.useLayoutEffect)(()=>{
        if(!open||!present)return;
        const place=()=>{const r=rootRef.current?.querySelector('button')?.getBoundingClientRect();if(!r)return;
          const width=Math.min(248,window.innerWidth-24),height=menuRef.current?.offsetHeight||118;
          const below=window.innerHeight-r.bottom-20,above=r.top-20,up=below<height&&above>below;
          setMenuStyle({position:'fixed',left:Math.max(12,Math.min(r.right-width,window.innerWidth-width-12)),width,top:up?'auto':r.bottom+8,bottom:up?window.innerHeight-r.top+8:'auto',maxHeight:Math.max(0,up?above:below)});
        };place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
        return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
      },[open,present,showSources]);`);
    part=part.replaceAll(`rootRef.current?.querySelector('[role="menuitem"]')`,`menuRef.current?.querySelector('[role="menuitem"]')`).replaceAll(`rootRef.current.querySelectorAll('[role="menuitem"]')`,`menuRef.current.querySelectorAll('[role="menuitem"]')`);
    part=replaceOnce(part,'if (!rootRef.current?.contains(event.target)) close();','if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close();');
    part=replaceOnce(part,'present ? (0, react_jsx_runtime.jsx)("div", {','present ? react_dom.createPortal((0, react_jsx_runtime.jsx)("div", {');
    part=replaceOnce(part,'id: menuId, role: "menu",','ref:menuRef,style:menuStyle,"data-odyssey-container-menu":"",id: menuId, role: "menu",');
    part=replaceOnce(part,'}) : null]',"}),rootRef.current?.closest('dialog[open]') || document.fullscreenElement || document.body) : null]");
    source=source.slice(0,start)+part+source.slice(end);
  }

  // Source state must exist before portal effects evaluate their dependency arrays.
  {
    const start=source.indexOf('function ResearchCanvasFrameMenu('),end=source.indexOf('function ResearchCanvasRichNodeFrame(',start);
    let part=source.slice(start,end);
    const declaration='const [showSources,setShowSources]=(0,react.useState)(false);';
    const anchor='const menuId = (0, react.useId)();';
    if(part.indexOf(declaration)>part.indexOf(anchor)) {
      part=replaceOnce(part,declaration,'');
      part=replaceOnce(part,anchor,declaration+'\n      '+anchor);
      source=source.slice(0,start)+part+source.slice(end);
    }
  }

  if(!source.includes('/* ODYSSEY_CURRENT_LINK_PAGE */')) {
    const start=source.indexOf('function ResearchCanvasStandardWebFrame('),end=source.indexOf('function ResearchCanvasWebFrame(',start);
    let part=source.slice(start,end);
    part=replaceOnce(part,'const [attempt, setAttempt]',`/* ODYSSEY_CURRENT_LINK_PAGE */
      const navigationUrlRef=(0,react.useRef)(node.url);
      (0,react.useEffect)(()=>{navigationUrlRef.current=node.url;},[node.url]);
      const [attempt, setAttempt]`);
    part=part.replace('url: node.url }).then','url: navigationUrlRef.current }).then');
    part=part.replace('if (inspection === null) return;', 'if (inspection === null) return; navigationUrlRef.current=normalizeResearchWebUrl(inspection.url)||navigationUrlRef.current;');
    source=source.slice(0,start)+part+source.slice(end);
  }

  source=source.replace('return hostname === "feishu.cn" || hostname.endsWith(".feishu.cn") ? `${RESEARCH_WEB_FRAME_SANDBOX} allow-same-origin` : RESEARCH_WEB_FRAME_SANDBOX;', 'return new Url(url).protocol === "https:" && !["localhost","127.0.0.1","[::1]"].includes(hostname) ? `${RESEARCH_WEB_FRAME_SANDBOX} allow-same-origin` : RESEARCH_WEB_FRAME_SANDBOX;');

  if(!source.includes('/* ODYSSEY_LINK_BASE_ACTIONS */')) {
    source=replaceOnce(source,'function ResearchContainerMenu({ node, editingPrompt, onEdit, onRefresh, onSetRefresh })','function ResearchContainerMenu({ node, editingPrompt, onEdit, onRefresh, onSetRefresh, onFrameAction })');
    // Keep the menu role during exit so shared styling remains stable until unmount.
    source=source.replace('role: open ? "menu" : void 0','role: "menu"');
  }
  if(!source.includes('/* ODYSSEY_INLINE_LINK_MENU */')) {
    source=replaceOnce(source,'children: selectionCreated ? [',`/* ODYSSEY_INLINE_LINK_MENU */
      children: node.kind==='web-link' ? [
        (0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-research-link-refresh':'',onClick:()=>choose(()=>onRefresh?.(node)),children:'刷新'}),
        (0,react_jsx_runtime.jsx)('a',{role:'menuitem',href:node.url,target:'_blank',rel:'noreferrer noopener',onClick:()=>close(),children:'浏览器打开'})
      ] : selectionCreated ? [`);
    source=replaceOnce(source,'titleActions: node.kind === "generated-container"',`titleActions: node.kind==='web-link' ? (0,react_jsx_runtime.jsx)(ResearchContainerMenu,{node,onRefresh:()=>contentRef.current?.querySelector('.rScV5Q_webFrameControls button')?.click()}) : node.kind === "generated-container"`);
  }

  if(!source.includes('/* ODYSSEY_LINK_BASE_ACTIONS */')) {
    source=replaceOnce(source,"children: node.kind==='web-link' ? [",`children: node.kind==='web-link' ? [
      /* ODYSSEY_LINK_BASE_ACTIONS */
      ...[['rename','修改名称'],...(researchCanvasArtifactContentEditable(node)?[['edit','编辑内容']]:[]),['remove','从画布移除']].map(([action,label])=>(0,react_jsx_runtime.jsx)('button',{type:'button',role:'menuitem','data-research-frame-action':action,onClick:()=>choose(()=>onFrameAction?.(node,action)),children:label},action)),`);
    source=replaceOnce(source,'ResearchContainerMenu,{node,onRefresh:()=>contentRef', 'ResearchContainerMenu,{node,onFrameAction,onRefresh:()=>contentRef');
  }
  if(!source.includes('/* ODYSSEY_CURRENT_BROWSER_ACTION */')) {
    source=replaceOnce(source,'onSetRefresh, onFrameAction })','onSetRefresh, onFrameAction, onOpenBrowser })');
    source=replaceOnce(source,"onClick:()=>close(),children:'浏览器打开'","onClick:event=>{close();if(onOpenBrowser){event.preventDefault();onOpenBrowser();}},children:'浏览器打开'");
    source=replaceOnce(source,'ResearchContainerMenu,{node,onFrameAction,onRefresh:',`ResearchContainerMenu,{node,onFrameAction,/* ODYSSEY_CURRENT_BROWSER_ACTION */onOpenBrowser:async()=>{let url=node.url;try{url=(await window.dshDesktop?.researchLinkFrame?.inspect?.({sessionId,nodeId:node.id}))?.url||url;}catch{}window.open(url,'_blank');},onRefresh:`);
  }
  if (!source.includes('/* ODYSSEY_PDF_HIDDEN_READER_SIZE */')) source = replaceOnce(source,
    'const width = Math.floor(body.clientWidth);\n\t\t\t\t\tconst height = Math.floor(body.clientHeight);',
    '/* ODYSSEY_PDF_HIDDEN_READER_SIZE */\n                    if(body.closest("[data-research-original-reader]")?.hidden)return;\n                    const width = Math.floor(body.clientWidth);\n\t\t\t\t\tconst height = Math.floor(body.clientHeight);')
  // Preserve genuine page metadata separately from entry sizing; it must not re-enable PDF aspect-locked cards.
  if (!source.includes('/* ODYSSEY_FILE_RATIO_METADATA */')) source = replaceOnce(source, 'function researchCanvasPersistedGeometry(node) {', `function researchCanvasPersistedGeometry(node) {
    /* ODYSSEY_FILE_RATIO_METADATA */
    if(researchCanvasNodeKind(node)==='pdf'&&Number.isFinite(node.aspectRatio)&&node.aspectRatio>0){const geometry=normalizeResearchCanvasNodeGeometry(node);return {width:geometry.width,height:geometry.height,sizeMode:geometry.sizeMode,aspectRatio:node.aspectRatio};}
`)

  if (!source.includes('/* ODYSSEY_GENERATED_WEB_ENTRY */')) {
    source = replaceOnce(source, 'if (spec.type === "web") return (0, react_jsx_runtime.jsx)(ResearchCanvasWebFrame, { node: { ...node, url: spec.url }, sessionId, visible });', `/* ODYSSEY_GENERATED_WEB_ENTRY */
    if (spec.type === "web") return (0,react_jsx_runtime.jsx)(ResearchFilePreviewPresentation,{node,children:(0,react_jsx_runtime.jsx)(ResearchCanvasWebFrame,{node:{...node,url:spec.url},sessionId,visible})});`)
    source = replaceOnce(source, 'onEdit: () => setEditingContainerPrompt(true)', `onEdit: () => {setEditingContainerPrompt(true);if(node.containerSpec?.type==='web'){const frame=contentRef.current?.closest('[data-research-node-id]');if(frame&&!frame.open)frame.querySelector('[data-research-container-expand]')?.click();}}`)
  }
  source = source.replace('children: [researchFigmaFilePreviewKind(node) ? (0,react_jsx_runtime.jsx)(ResearchFilePreviewPresentation', "children: [researchFigmaFilePreviewKind(node)&&node.kind!=='generated-container' ? (0,react_jsx_runtime.jsx)(ResearchFilePreviewPresentation")
  const payload = `${startMarker}\nconst odysseyFileEntryIcons=${JSON.stringify({file:fileIcon,web:linkIcon})};\n${runtimeSource}\n${styleInstaller()}\n${endMarker}\n`
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker)
  if (start >= 0 || end >= 0) {
    if (start < 0 || end < start || source.indexOf(startMarker, start + 1) >= 0 || source.indexOf(endMarker, end + 1) >= 0) throw Error('Figma file preview marker mismatch')
    return source.slice(0, start) + payload + source.slice(end + endMarker.length + 1)
  }
  source = replaceOnce(source, 'function ResearchCanvasRichNodeFrame({', payload + 'function ResearchCanvasRichNodeFrame({')
  source = replaceOnce(source, 'children: [children, (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: "rScV5Q_previewShield",', 'children: [researchFigmaFilePreviewKind(node)&&node.kind!=="generated-container" ? (0,react_jsx_runtime.jsx)(ResearchFilePreviewPresentation,{node,expanded,children}) : children, (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: "rScV5Q_previewShield",')
  source = replaceOnce(source, '"data-research-compact-chrome": compact || void 0,', '"data-research-compact-chrome": compact || void 0, "data-research-file-presentation": researchFigmaFilePreviewKind(node) || void 0,')
  source = replaceOnce(source, 'const policy = RESEARCH_CANVAS_NODE_POLICIES[kind];\n\t\t\tif (!policy.resizable)', `const policy = RESEARCH_CANVAS_NODE_POLICIES[kind];
            if(kind!=='generic'&&kind!=='image'&&kind!=='assistant')return {width:Number.isFinite(node?.width)&&node.width>0?Math.min(RESEARCH_CANVAS_MAX_NODE_SIZE,node.width):320,height:Number.isFinite(node?.height)&&node.height>0?Math.min(RESEARCH_CANVAS_MAX_NODE_SIZE,node.height):220,sizeMode:node?.sizeMode==='manual'?'manual':'auto',resizable:policy.resizable};
\t\t\tif (!policy.resizable)`)
  source = replaceOnce(source, 'const policy = RESEARCH_CANVAS_NODE_POLICIES[researchCanvasNodeKind(node)];', `const originalPolicy = RESEARCH_CANVAS_NODE_POLICIES[researchCanvasNodeKind(node)];
            const policy = researchFigmaFilePreviewKind(node)&&researchCanvasNodeKind(node)!=='assistant'?{...originalPolicy,minWidth:160,minHeight:100}:originalPolicy;`)
  const pdfStart = source.indexOf('function researchPdfGeometryForPage('), pdfEnd = source.indexOf('function resizeResearchCanvasNode(', pdfStart)
  if (pdfStart < 0 || pdfEnd < pdfStart) throw Error('Figma PDF geometry anchor missing')
  source = source.slice(0, pdfStart) + `function researchPdfGeometryForPage(node,pageWidth,pageHeight) {
    if(!Number.isFinite(pageWidth)||!Number.isFinite(pageHeight)||pageWidth<=0||pageHeight<=0||researchCanvasNodeKind(node)!=='pdf'||node?.sizeMode==='manual')return null;
    const aspectRatio=pageWidth/pageHeight;
    if(Number.isFinite(node.aspectRatio)&&Math.abs(node.aspectRatio-aspectRatio)<1e-6)return null;
    return {...researchCanvasPersistedGeometry(node),aspectRatio};
}\n\t\t` + source.slice(pdfEnd)
  source = replaceOnce(source, 'style: layout.logicalWidth === null ? void 0 : { width: `${layout.logicalWidth}px`, height: `${100 / layout.scale}%`, transform: `scale(${layout.scale})`, transformOrigin: "0 0" },', 'style: { width: "100%", height: "100%", transform: "none" },')
  return source
}

const runtimeSource = String.raw`
function researchFigmaFilePreviewKind(node) {
  if(node?.kind==='web-link'||node?.kind==='generated-container'&&node.containerSpec?.type==='web')return 'web';
  const kind=researchCanvasNodeKind(node);
  return typeof node?.name==='string'&&kind!=='image'&&kind!=='assistant'&&kind!=='generic'?kind:null;
}
function researchFigmaFileEntryCopy(node,reader) {
  const kind=researchFigmaFilePreviewKind(node);
  const labels={pdf:'PDF',docx:'Word',xlsx:'Excel',pptx:'PPT',html:'HTML',markdown:'Markdown',text:'文本',web:'网页'};
  const rawUrl=kind==='web'?(node.url??node.containerSpec?.url):'';
  const url=rawUrl?normalizeResearchWebUrl(rawUrl)||'':'';
  const failure=reader?.querySelector('[data-research-preview-unavailable],[data-research-pdf-error],[data-research-web-error],[data-sherlock-office-preview-unavailable]');
  const loading=reader?.querySelector('[data-research-preview-loading],[data-research-offscreen-placeholder]');
  const generationStatus=node.kind==='generated-container'?(RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus)?'正在刷新，当前内容继续可用':typeof node.refreshError==='string'?node.refreshError:''):'';
  const status=generationStatus||failure?.textContent?.trim()||loading?.textContent?.trim()||(kind!=='web'&&typeof node.authorizationId!=='string'?'预览不可用':'');
  const nativeText=reader?.querySelector('[data-research-markdown-preview],[data-research-text-preview]')?.textContent;
  const existing=typeof node.description==='string'?node.description:typeof node.excerpt==='string'?node.excerpt:'';
  const text=String(nativeText||existing||'').replace(/\s+/g,' ').trim();
  return {kind,label:labels[kind]??'',url,status,text:text===url?'':text};
}
function researchFigmaFitEntryText(text,width,rows,context) {
  if(!text||rows<1||width<1)return {text:'',lines:0};
  let line=1,used=0,result='';
  const chars=Array.from(text),ellipsisWidth=context?.measureText('…').width??13;
  for(let index=0;index<chars.length;index++){
    const char=chars[index],next=context?.measureText(char).width??(char.charCodeAt(0)<128?7:13);
    if(used+next+(index<chars.length-1?ellipsisWidth:0)>width){if(line>=rows)return {text:result.trimEnd()+'…',lines:line};line++;used=0;}
    result+=char;used+=next;
  }
  return {text:result,lines:line};
}
function ResearchFilePreviewPresentation({node,expanded:explicitExpanded,children}) {
  const [containerExpanded,setContainerExpanded]=(0,react.useState)(false);
  const expanded=typeof explicitExpanded==='boolean'?explicitExpanded:containerExpanded;
  const inlinePreview=true,readerVisible=true;
  const ref=(0,react.useRef)(null),readerRef=(0,react.useRef)(null),entryRef=(0,react.useRef)(null);
  (0,react.useLayoutEffect)(()=>{if(typeof explicitExpanded==='boolean')return;const frame=ref.current?.closest('[data-research-node-id]');if(!frame)return;const update=()=>setContainerExpanded(frame.open===true);update();const Observer=frame.ownerDocument.defaultView?.MutationObserver,observer=Observer?new Observer(update):null;observer?.observe(frame,{attributes:true,attributeFilter:['open']});return()=>observer?.disconnect();},[node.id,explicitExpanded]);
  const [visited,setVisited]=(0,react.useState)(readerVisible),[copy,setCopy]=(0,react.useState)(()=>researchFigmaFileEntryCopy(node,null));
  const [readerViewport,setReaderViewport]=(0,react.useState)(null);
  const [layout,setLayout]=(0,react.useState)({text:'',url:'',status:'',compact:false,hideKind:false,measured:false});
  (0,react.useLayoutEffect)(()=>{if(readerVisible)setVisited(true);},[readerVisible]);
  // Electron OOPIFs lose their document scroll offset if hidden at the closed card size.
  // Keep only visited web-link reader layout stable inside a zero-size, inert clip.
  (0,react.useLayoutEffect)(()=>{
    if(!expanded||inlinePreview||copy.kind!=='web')return;
    const reader=readerRef.current;if(!reader)return;
    const measure=()=>{if(!reader.closest('[data-research-node-id]')?.open)return;const width=reader.clientWidth,height=reader.clientHeight;if(width<1||height<1)return;setReaderViewport(old=>old?.width===width&&old?.height===height?old:{width,height});};
    measure();const Observer=reader.ownerDocument.defaultView?.ResizeObserver,observer=Observer?new Observer(measure):null;observer?.observe(reader);return()=>observer?.disconnect();
  },[expanded,inlinePreview,copy.kind,node.id]);
  (0,react.useLayoutEffect)(()=>{
    const reader=readerRef.current,update=()=>{const next=researchFigmaFileEntryCopy(node,reader);setCopy(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};
    update();const Observer=reader?.ownerDocument.defaultView?.MutationObserver,observer=Observer?new Observer(update):null;
    if(reader)observer?.observe(reader,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-research-preview-loading','data-research-preview-unavailable']});
    return()=>observer?.disconnect();
  },[node.id,node.name,node.authorizationId,node.excerpt,node.description,node.url,node.containerSpec?.url,node.generationStatus,node.refreshError,visited]);
  (0,react.useLayoutEffect)(()=>{
    const entry=entryRef.current;if(!entry||expanded)return;
    const measure=()=>{
      const width=entry.clientWidth,height=entry.clientHeight;if(width<1||height<1)return;
      const compact=height<100,availableWidth=Math.max(1,width-(compact?24:34));
      const context=entry.ownerDocument.createElement('canvas').getContext('2d'),hideKind=height<64&&!!copy.status,gap=compact?4:12;
      let availableHeight=Math.max(0,height-(compact?12:15)-(hideKind?0:20)),hasContent=!hideKind;
      const fit=(text,fontSize,lineHeight,maxLines)=>{if(context)context.font=fontSize+'px "EWork DIN Pro","Noto Sans SC",sans-serif';const rows=Math.min(maxLines,Math.floor((availableHeight-(hasContent?gap:0))/lineHeight));const result=researchFigmaFitEntryText(text,availableWidth,rows,context);if(result.lines){availableHeight-=result.lines*lineHeight+(hasContent?gap:0);hasContent=true;}return result.text;};
      const status=fit(copy.status,13,21,2),url=fit(copy.url,11,19,2),text=fit(copy.text,13,21,100);
      const next={text,url,status,compact,hideKind,measured:true};setLayout(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    measure();const Observer=entry.ownerDocument.defaultView?.ResizeObserver,observer=Observer?new Observer(measure):null;observer?.observe(entry);entry.ownerDocument.fonts?.ready.then(measure);return()=>observer?.disconnect();
  },[copy,expanded,node.width,node.height]);
  return (0,react_jsx_runtime.jsxs)('div',{ref,className:'odyssey-file-presentation','data-research-reader-open':expanded,children:[
    (0,react_jsx_runtime.jsxs)('div',{ref:entryRef,className:'odyssey-file-entry','data-research-file-entry':copy.kind,'data-entry-compact':layout.compact,hidden:readerVisible,children:[
      !layout.hideKind?(0,react_jsx_runtime.jsxs)('span',{className:'odyssey-file-kind',children:[(0,react_jsx_runtime.jsx)('img',{src:odysseyFileEntryIcons[copy.kind==='web'?'web':'file'],width:16,height:16,alt:'','aria-hidden':true}),copy.label]}):null,
      (layout.measured?layout.status:copy.status)?(0,react_jsx_runtime.jsx)('span',{className:'odyssey-file-status',role:'status',title:copy.status,children:layout.measured?layout.status:copy.status}):null,
      (layout.measured?layout.url:copy.url)?(0,react_jsx_runtime.jsx)('span',{className:'odyssey-file-source',title:copy.url,children:layout.measured?layout.url:copy.url}):null,
      layout.text?(0,react_jsx_runtime.jsx)('p',{className:'odyssey-file-excerpt',children:layout.text}):null]}),
    (0,react_jsx_runtime.jsx)('div',{ref:readerRef,className:'odyssey-file-reader','data-research-original-reader':'','data-research-retained-viewport':readerViewport&&!inlinePreview&&copy.kind==='web'?true:void 0,style:readerViewport?{'--odyssey-reader-width':readerViewport.width+'px','--odyssey-reader-height':readerViewport.height+'px'}:void 0,hidden:!readerVisible,inert:!readerVisible?'':void 0,'aria-hidden':!readerVisible?true:void 0,children:readerVisible||visited?children:null})]});
}
`

export const filePreviewCss = `
[data-research-file-presentation]{background:var(--odyssey-card)!important}
[data-research-file-presentation]:not([data-selected=true]){border-color:var(--odyssey-card-border)!important}
body[data-ds-dark-theme] [data-research-file-presentation]{--odyssey-card-text:#e7e7e9!important;--odyssey-card-muted:#989aa0!important}

.odyssey-file-presentation,.odyssey-file-reader{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;width:100%;height:100%}
.odyssey-file-entry{box-sizing:border-box;display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;height:100%;padding:0 17px 15px;gap:12px;color:var(--odyssey-card-text,#292b2f);font:13px/21px "EWork DIN Pro","Noto Sans SC",sans-serif;overflow-wrap:anywhere}
[data-research-file-presentation=html] [data-research-original-reader] .rScV5Q_htmlPreview{background:#fff!important}
/* Compact Word previews reflow the page content; expanded reading retains the document's page geometry and zoom. */
[data-research-file-presentation=docx]:not([open]) [data-research-original-reader]{container-type:inline-size}
[data-research-file-presentation=docx]:not([open]) .docx-wrapper{background:transparent;padding:0}
[data-research-file-presentation=docx]:not([open]) [class*=editorDocxWrap]{box-sizing:border-box;padding:0}
@container (max-width:500px){
  [data-research-file-presentation=docx]:not([open]) [class*=editorDocxWrap]{width:100%;zoom:1!important}
  [data-research-file-presentation=docx]:not([open]) section.docx{width:100%!important;min-height:0!important;padding:16px!important;margin:0;box-shadow:none}
  [data-research-file-presentation=docx]:not([open]) [class*=editorDocxZoom]{display:none}
  [data-research-file-presentation=docx]:not([open]) [class*=editorDocxViewport]{box-sizing:border-box;padding:0;border:0;overflow:hidden}
}

.rScV5Q_webFrameControls{display:none!important}\n.rScV5Q_containerMenuPopup a[role=menuitem]{display:flex;align-items:center;min-height:30px;padding:6px 9px;box-sizing:border-box;color:inherit;font:inherit;text-decoration:none;border-radius:6px}.rScV5Q_containerMenuPopup a[role=menuitem]:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.odyssey-file-entry[hidden],.odyssey-file-reader[hidden]{display:none!important}
.odyssey-file-reader[hidden][data-research-retained-viewport]{display:block!important;position:absolute;top:0;left:0;flex:none;width:0!important;height:0!important;min-width:0!important;min-height:0!important;overflow:hidden!important;visibility:hidden;pointer-events:none}
.odyssey-file-reader[hidden][data-research-retained-viewport]>*{flex:none!important;width:var(--odyssey-reader-width)!important;height:var(--odyssey-reader-height)!important;min-height:var(--odyssey-reader-height)!important;max-width:none!important;max-height:none!important}
/* Expanded RichNodeFrame readers own interaction even when the background canvas retains a gesture modifier. */
.rScV5Q_richNode[open]>.rScV5Q_previewBody>.rScV5Q_previewShield{display:none!important;pointer-events:none!important}
.odyssey-file-entry[data-entry-compact=true]{padding:6px 12px;gap:4px}
.odyssey-file-kind{display:flex;align-items:center;gap:8px;height:20px;flex:none;color:var(--odyssey-card-muted,#81858c);font:11px/19px "EWork DIN Pro","Noto Sans SC",sans-serif}.odyssey-file-kind>img{flex:none;width:16px;height:16px}
.odyssey-file-excerpt{margin:0;font:inherit}.odyssey-file-source{color:var(--odyssey-card-muted,#81858c);font:11px/19px "EWork DIN Pro","Noto Sans SC",sans-serif}.odyssey-file-status{font:inherit}
[data-research-file-presentation][data-research-generated-container]:not([open]) .rScV5Q_containerNotice{display:none}
[data-research-file-presentation][data-research-generated-container]:not([open]) :is(.rScV5Q_generatedContainer,.rScV5Q_containerContent){background:transparent!important}
[data-research-file-presentation][data-research-generated-container] .rScV5Q_artifactBody{height:100%;min-height:0;padding:0!important}
[data-research-file-presentation][data-research-generated-container] .rScV5Q_containerContent{flex:1;min-height:0;padding:0!important}
.odyssey-file-reader>.rScV5Q_artifactBody{height:100%;min-height:0;padding:0!important}.odyssey-file-reader>.rScV5Q_artifactBody:has(.rScV5Q_webFrameShell){display:flex;flex-direction:column}.odyssey-file-reader .rScV5Q_webFrameShell{flex:1;min-height:0}
[data-research-file-presentation]:not([open])>.rScV5Q_previewBody{overflow:hidden!important}
[data-research-file-presentation]:not([open])>.rScV5Q_nodeTitle{height:54px!important;min-height:54px!important;flex-basis:54px!important;padding:15px 17px!important;align-items:center!important}
[data-research-file-presentation]:not([open])>.rScV5Q_previewBody{height:calc(100% - 54px)}
[data-research-file-presentation] .rScV5Q_nodeTitleText{font:500 15px/23px "Noto Sans SC",sans-serif!important}
[data-research-file-presentation=web]:not([open]) .rScV5Q_pageIndicator{display:none}
[data-research-file-presentation] [data-research-preview-loading]:before{content:'';display:inline-block;width:14px;height:14px;box-sizing:border-box;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:odyssey-file-loading .9s linear infinite}
@keyframes odyssey-file-loading{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){[data-research-file-presentation] [data-research-preview-loading]:before{animation:none}}
`
function styleInstaller() {
  return `if(typeof document!=='undefined'&&!document.querySelector('style[data-sherlock-figma-file-preview]')){const style=document.createElement('style');style.dataset.sherlockFigmaFilePreview='';style.textContent=${JSON.stringify(filePreviewCss)};document.head.appendChild(style);}`
}
