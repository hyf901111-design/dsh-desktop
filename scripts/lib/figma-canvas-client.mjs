import { readFileSync } from 'node:fs'
const iconData = Object.fromEntries(['branch','chevron','summary','plus','check','more'].map(name=>[name,'data:image/svg+xml;base64,'+readFileSync(new URL('../../build/figma-canvas-icons/'+name+'.svg',import.meta.url)).toString('base64')]));
const bentoSource = readFileSync(new URL('../../packages/dsh-research-task-runtime/bento-layout.js', import.meta.url), 'utf8').replace(/^export /gm, '').replace(/^\/\/[^\n]*\n/,'')
function exact(source, anchor, replacement) {
  const start = source.indexOf(anchor)
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0) throw Error('Figma canvas anchor missing or ambiguous: ' + anchor.slice(0, 90))
  return source.slice(0, start) + replacement + source.slice(start + anchor.length)
}
function block(source, startAnchor, endAnchor, replacement) {
  const start = source.indexOf(startAnchor), end = source.indexOf(endAnchor, start)
  if (start < 0 || end < start) throw Error('Figma canvas block missing: ' + startAnchor)
  return source.slice(0, start) + replacement + '\n' + source.slice(end)
}
export function patchFigmaFinalCanvas(source) {
  for(const [icon,key] of [['IconBranchOutline16','branch'],['IconChevronDownOutline14','chevron'],['IconListPenOutline16','summary']]) {
    const old='(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.'+icon+', { size: '+(key==='chevron'?14:16)+' })';
    const start=source.indexOf('\"aria-label\": \"选中组件操作\"');
    if(start>=0){const end=source.indexOf('createSelection === null ? null',start);const section=source.slice(start,end).replace(old, "(0,react_jsx_runtime.jsx)('img',{src:"+JSON.stringify(iconData[key])+",width:"+(key==='chevron'?10:14)+",height:"+(key==='chevron'?10:14)+",alt:'','aria-hidden':true,className:'odyssey-canvas-icon'})");source=source.slice(0,start)+section+source.slice(end);}
  }

  source=source.replace('children: [(0, react_jsx_runtime.jsx)("strong", { children: option.label }), (0, react_jsx_runtime.jsx)("span", { children: option.description })]', `children: [(0, react_jsx_runtime.jsx)("strong", { children: option.label }), (0, react_jsx_runtime.jsx)("span", { children: option.description }),option.value==='standard'?(0,react_jsx_runtime.jsx)('img',{src:${JSON.stringify(iconData.check)},width:16,height:16,alt:'',className:'odyssey-detail-check'}):null]`);
  source=source.replace('children: "···"', "children:(0,react_jsx_runtime.jsx)('img',{src:"+JSON.stringify(iconData.more)+",width:13,height:13,alt:'',className:'odyssey-canvas-icon'})");
  source=source.replace(' || growths >= 3 || Date.now() - startedAt > 8000 || current.node?.sizeMode === "manual" || current.node?.containerSpec?.html !== spec.html', ' || current.node?.containerSpec?.html !== spec.html');
  source=source.replace("card?.toggleAttribute('data-research-content-overflow', dimensions.width>656 || dimensions.height>456);", "card?.toggleAttribute('data-research-content-overflow', dimensions.width>(current.node?.sizeMode==='manual'?current.node.width:656) || dimensions.height>(current.node?.sizeMode==='manual'?current.node.height:456));\n                    if(current.node?.sizeMode==='manual'||growths>=3||Date.now()-startedAt>8000)return;");
  const chartStart=source.indexOf('function ResearchContainerChart({ spec }) {'),chartEnd=source.indexOf('function readResearchComponentTheme(',chartStart);
  if(chartStart>=0&&chartEnd>chartStart){let chart=source.slice(chartStart,chartEnd);
    chart=chart.replace('function ResearchContainerChart({ spec }) {', `function ResearchContainerChart({ spec }) {
            /* SHERLOCK_RESPONSIVE_NATIVE_CHART */
            const svgRef=(0,react.useRef)(null),[plotSize,setPlotSize]=(0,react.useState)({width:640,height:290});
            (0,react.useLayoutEffect)(()=>{const svg=svgRef.current;if(!svg)return;const measure=()=>{if(svg.clientWidth>0&&svg.clientHeight>0)setPlotSize(previous=>previous.width===svg.clientWidth&&previous.height===svg.clientHeight?previous:{width:svg.clientWidth,height:svg.clientHeight});};measure();const Observer=svg.ownerDocument.defaultView?.ResizeObserver;if(!Observer)return;const observer=new Observer(measure);observer.observe(svg);return()=>observer.disconnect();},[]);`);
    if(source.includes('/* SHERLOCK_RESPONSIVE_NATIVE_CHART */'))chart=source.slice(chartStart,chartEnd);
    chart=chart.replace('const width = 540;', 'const width = Math.max(100,plotSize.width-left-18);').replace('const height = 230;', 'const height = Math.max(40,plotSize.height-top-30);').replace('viewBox: "0 0 640 290",', 'ref:svgRef,viewBox: "0 0 "+plotSize.width+" "+plotSize.height,').replace('y: 274, textAnchor:', 'y: top+height+22, textAnchor:');
    source=source.slice(0,chartStart)+chart+source.slice(chartEnd);
  }
  source=source.replace(/const RESEARCH_CANVAS_GRID_SIZE = [\d.]+;/, 'const RESEARCH_CANVAS_GRID_SIZE = 13.71;');
  source=source.replace('backgroundPosition: `${viewport.x - gridSize / 2 + 1}px ${viewport.y - gridSize / 2 + 1}px`', 'backgroundPosition: `${viewport.x + 12.5499 * viewport.scale}px ${viewport.y + 7.6871 * viewport.scale}px`');
  source=source.replace('"data-research-global-toolbar": "",\n', '"data-research-global-toolbar": "", style:{left:(snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width)/2},\n');
  source=source.replace('right: (canvasSize.width - 12 - x) / scale, top: (12 - y) / scale, bottom: (canvasSize.height - 12 - y) / scale', 'right: (researchCanvasVisibleArea(context).width - 32 - x) / scale, top: (32 - y) / scale, bottom: (researchCanvasVisibleArea(context).height - 32 - y) / scale');
  source=source.replace('const interactivePreview = event.target?.closest?.("[data-research-selection-actions],[data-research-create-popover]")', 'const interactivePreview = event.target?.closest?.("[data-research-selection-actions],[data-research-create-popover],[data-research-voice-feedback],[data-research-global-toolbar]")');
  source=source.replace('workspace.setCanvasSize({ width: bounds.width, height: bounds.height });', `const panel=root.ownerDocument.querySelector('.t8lSSG_panel:has([data-research-active=true])');
                    const panelBounds=panel?.getBoundingClientRect();
                    const availableWidth=panelBounds&&panelBounds.width>0&&panelBounds.left>bounds.left&&panelBounds.left<bounds.right&&panelBounds.bottom>bounds.top?Math.max(0,panelBounds.left-bounds.left-8):bounds.width;
                    workspace.setCanvasSize({ width: bounds.width, height: bounds.height, availableWidth });`);
  // One viewport contract is used by the floating toolbar, drafts, and automatic growth.
  source=block(source,source.includes('function researchCanvasVisibleArea(')?'function researchCanvasVisibleArea(':'function researchCanvasViewportPlacement(', 'function researchCanvasGeneratedPlacement(', placementSource);
  source=source.replace('function researchGenerationSizedNode(node, geometry) {','function researchGenerationSizedNode(node, geometry, snapshot = null) {');
  source=source.replaceAll('researchGenerationSizedNode(next, geometry);','researchGenerationSizedNode(next, geometry, snapshot);');
  source=source.replace('researchGenerationSizedNode(node, geometry) :','researchGenerationSizedNode(node, geometry, snapshot) :');
  source=source.replace('researchCanvasContainedAutoNode(snapshot,{...current,containerSizePreset:researchContainerPromptPreset(prompt),...RESEARCH_BENTO_SIZES[researchContainerPromptPreset(prompt)]})','researchContainerPlannedGeometry(snapshot,current,prompt)');
  const sizedStart=source.indexOf('function researchGenerationSizedNode('),sizedEnd=source.indexOf('function researchGenerationAutoGeometry(',sizedStart);
  if(sizedStart>=0&&sizedEnd>sizedStart){const sized=source.slice(sizedStart,sizedEnd).replace('return next;', 'return researchCanvasContainedAutoNode(snapshot,next);').replace('// Selection outputs grow', "if(node.sizeMode!=='manual'&&['generated-summary','generated-mind-map'].includes(node.kind)){next.width=Math.min(656,next.width);next.height=Math.min(456,next.height); }\n            // Figma derived outputs grow");source=source.slice(0,sizedStart)+sized+source.slice(sizedEnd);}
  source=source.replace('...queued, containerSizePreset: researchComponentSize(current), ...(current.containerSpec || current.sizeMode === "manual" ? {} : { width: RESEARCH_BENTO_SIZES[researchComponentSize(current)].width, height: RESEARCH_BENTO_SIZES[researchComponentSize(current)].height }),', '...queued, ...(current.containerSpec || current.sizeMode === "manual" ? {} : researchContainerPlannedGeometry(snapshot,current,prompt)),');
  source=source.replace('...queued, containerSizePreset: researchComponentSize(current), ...(current.containerSpec || current.sizeMode === "manual" ? {} : { width: 720, height: RESEARCH_COMPONENT_SIZES[researchComponentSize(current)] }),', '...queued, ...(current.containerSpec || current.sizeMode === "manual" ? {} : researchContainerPlannedGeometry(snapshot,current,prompt)),');
  source=source.replace('onCancel: onCancelGeneration\n', 'onCancel: onCancelGeneration, onExpand: onExpandGeneration\n');
  source=source.replace('onActivate, onAutoHeight, onWebInspection', 'onActivate, onAutoHeight, onExpandGeneration, onWebInspection');
  if(!source.includes('onExpandGeneration:()=>'))source=source.replace('onAutoHeight: (_artifact, height) => workspace.updateNodeGeometry(node.id, { height, sizeMode: "auto" }),', 'onAutoHeight: (_artifact, height) => workspace.updateNodeGeometry(node.id, { height, sizeMode: "auto" }), onExpandGeneration:()=>{if(node.height<456)workspace.updateNodeGeometry(node.id,{width:656,height:456,sizeMode:"auto"});},');
  source=source.replace('if(node.height<456)workspace.updateNodeGeometry', 'if(node.height!==456||node.width!==656)workspace.updateNodeGeometry');

  source=source.replace(`}) : node.kind === "pasted-text" || node.kind === "assistant-result" || node.kind === "generated-summary" && node.generationStatus === 'completed' ?`, `}) : node.kind === 'generated-summary'&&node.generationStatus==='completed'?(0,react_jsx_runtime.jsx)(ResearchDerivedSummary,{node,onUpgradeSize:onExpandGeneration}):node.kind === "pasted-text" || node.kind === "assistant-result" ?`);
  source=block(source,source.includes('function ResearchDerivedSummary(')?'function ResearchDerivedSummary(':'function ResearchMindMap({', 'function researchGenerationPresentation(',derivedSource);
  const displayStart=source.indexOf('function ResearchMindMapDisplayNode('),displayEnd=source.indexOf('function ResearchMindMapBranches(',displayStart);
  if(displayStart>=0&&displayEnd>displayStart){const display=source.slice(displayStart,displayEnd).replace('children: node.label', 'children: node.displayLabel ?? node.label');source=source.slice(0,displayStart)+display+source.slice(displayEnd);}
  source=source.replace('observer?.observe(root);\n\t\t\t\twindow.addEventListener("resize", scheduleSync);', 'observer?.observe(root);\n                for(const panel of document.querySelectorAll(".t8lSSG_panel"))observer?.observe(panel);\n\t\t\t\twindow.addEventListener("resize", scheduleSync);');
  source=block(source,'const syncSize = () => {','const cancelScheduledSync = () => {', `const syncSize = () => {
                    if(!active)return;
                    const bounds=root.getBoundingClientRect();
                    const panel=root.ownerDocument.querySelector('.t8lSSG_panel:has([data-research-active=true])'),panelBounds=panel?.getBoundingClientRect();
                    const availableWidth=panelBounds&&panelBounds.width>0&&panelBounds.left>bounds.left&&panelBounds.left<bounds.right&&panelBounds.bottom>bounds.top?Math.max(0,panelBounds.left-bounds.left-8):bounds.width;
                    if(panel!==observedPanel){if(observedPanel)observer?.unobserve(observedPanel);if(panel)observer?.observe(panel);observedPanel=panel;}
                    const previous=workspace.getSnapshot().canvasSize;
                    if(previous.width!==bounds.width||previous.height!==bounds.height||previous.availableWidth!==availableWidth)workspace.setCanvasSize({width:bounds.width,height:bounds.height,availableWidth});
                    publishRegion(bounds,document.visibilityState!=="hidden");
                };
                `);
  source=source.replace('syncSize();\n\t\t\t\tconst observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);', 'let observedPanel=null;\n                const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);\n                syncSize();');
  source=source.replace('for(const panel of document.querySelectorAll(".t8lSSG_panel"))observer?.observe(panel);', `const panelMutations=typeof MutationObserver==='undefined'?null:new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'?record.target?.closest?.('.t8lSSG_panel'):[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches?.('.t8lSSG_panel')||node.closest?.('.t8lSSG_panel')||node.querySelector?.('.t8lSSG_panel')))))scheduleSync();});
                if(document.body)panelMutations?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-research-active','class','style']});`);
  source=source.replace('observer?.disconnect();\n\t\t\t\t\twindow.removeEventListener("resize", scheduleSync);','observer?.disconnect();panelMutations?.disconnect();\n\t\t\t\t\twindow.removeEventListener("resize", scheduleSync);');
  source=source.replace("(0,react_jsx_runtime.jsxs)('details',{children:", "(0,react_jsx_runtime.jsxs)('details',{onToggle:event=>{const details=event.currentTarget,card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open){details.open=false;card?.querySelector('[data-research-container-expand]')?.click();card?.ownerDocument.defaultView?.requestAnimationFrame(()=>{if(card.open)details.open=true;});}},children:");
  source=source.replaceAll("card=details.closest('[data-research-compact-chrome]');if(details.open&&!card?.open)","card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open)");
  source=source.replace('function ResearchGeneratedContainer({ node, sessionId, visible, onGenerate, onHtmlSize, editingPrompt', 'function ResearchGeneratedContainer({ node, sessionId, visible, onGenerate, onHtmlSize, onUpgradeSize, editingPrompt');
  source=source.replace('jsx)(ResearchContainerContent, { node, sessionId, visible, onHtmlSize })', 'jsx)(ResearchContainerContent, { node, sessionId, visible, onHtmlSize, onUpgradeSize })');
  source=source.replace('onGenerate: onSubmitContainer,\n', 'onGenerate: onSubmitContainer, onUpgradeSize:onExpandGeneration,\n');
  source=source.replace('children: spec.items.map((item, index) => (0, react_jsx_runtime.jsxs)("div", { children:', 'children: spec.items.map((item, index) => (0, react_jsx_runtime.jsxs)("div", { style:{gridColumn:item.fullWidth?"1 / -1":undefined}, children:');
  source=source.replace('const usableHeight = Math.max(100, canvasSize.height - 180);','const usableHeight = Math.max(100, canvasSize.height); const availableWidth=canvasSize.availableWidth>0?Math.min(canvasSize.width,canvasSize.availableWidth):canvasSize.width;');
  source=source.replace('Math.max(1, canvasSize.width - 64) / (right - left)', 'Math.max(1, availableWidth - 64) / (right - left)');
  source=source.replace('return { scale, x: canvasSize.width / 2 - (left + right) / 2 * scale, y: usableHeight / 2', 'return { scale, x: availableWidth / 2 - (left + right) / 2 * scale, y: usableHeight / 2');
  source=source.replace('workspace.organizeCanvas(researchCanvasMeasureForArrange(rootRef.current, canvasNodes));', 'if(workspace.organizeCanvas(researchCanvasMeasureForArrange(rootRef.current, canvasNodes)))setClipboardFeedback({state:"success",kind:"arrange",message:"已整理 "+canvasNodes.length+" 个组件"});');
  source=source.replace('"data-research-clipboard-feedback": "", "data-state": clipboardFeedback.state,', '"data-research-clipboard-feedback": "", "data-research-arrange-feedback":clipboardFeedback.kind==="arrange"?"":undefined, "data-state": clipboardFeedback.state,');
  source=source.replace("pointerEvents: 'none' }, children: clipboardFeedback.message", `pointerEvents: 'none' }, children: clipboardFeedback.kind==='arrange'?(0,react_jsx_runtime.jsxs)('span',{className:'odyssey-arrange-toast',children:[(0,react_jsx_runtime.jsx)('img',{src:${JSON.stringify(iconData.check)},width:16,height:16,alt:''}),clipboardFeedback.message]}):clipboardFeedback.message`);
  source=block(source,'function researchCanvasMeasureForArrange(',source.includes('/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */')?'const RESEARCH_BENTO_SIZES':'function researchCanvasOrganizedLayout(',`function researchCanvasMeasureForArrange(root,nodes) {
    return new Map(nodes.filter(n=>n.kind==='generated-container').map(n=>{const size=researchBentoSize(n);const {width,height}=RESEARCH_BENTO_SIZES[size];return [n.id,{width,height,sizeMode:'manual'}];}));
  }`);
  source=source.replace('[selectionToolbarWidth, setSelectionToolbarWidth] = (0, react.useState)(420)', '[selectionToolbarWidth, setSelectionToolbarWidth] = (0, react.useState)(320)');
  source=source.replace('snapshot.canvasSize.width - selectionToolbarWidth / 2 - 8', '(snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width) - selectionToolbarWidth / 2 - 8');
  source=source.replace('left: Math.max(12, Math.min(snapshot.canvasSize.width - 372, createSelection.position.left - 180))', 'left: Math.max(12, Math.min((snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width) - 432, createSelection.position.left - 210))');
  source=source.replace('createSelection.position.top + 8)), width: 360', 'createSelection.position.top + 8)), width: 420');
  const creationStart=source.indexOf("'data-research-selection-create': ''");
  const plusStart=source.indexOf("(0, react_jsx_runtime.jsx)('svg', { width: 16",creationStart);
  const plusEnd=source.indexOf(", '基于所选创建']",plusStart);
  if(creationStart>=0&&plusStart>=0&&plusEnd>plusStart&&plusEnd-plusStart<1500)source=source.slice(0,plusStart)+"(0,react_jsx_runtime.jsx)('img',{src:"+JSON.stringify(iconData.plus)+",width:14,height:14,alt:'',className:'odyssey-canvas-icon'})"+source.slice(plusEnd);
  if (source.includes('/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */')) {
    source=block(source,'const RESEARCH_BENTO_SIZES', 'function researchCanvasOrganizedLayout(',bentoSource.slice(bentoSource.indexOf('const RESEARCH_BENTO_SIZES')));
    source=block(source,'function ResearchGenerationProcess(', 'function isResearchWechatArticleUrl(',generationSource);
    source=block(source,'function ResearchContainerContent(props) {', 'function ResearchContainerBody(',responsiveSource);
    const marker=source.indexOf('/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */');
    const start=source.indexOf("if(typeof document",marker),end=source.indexOf('\n',start);
    if(start<0||end<0)throw Error('Figma canvas stylesheet missing');
    return capDerivedNodes(source.slice(0,start)+canvasStyleInstaller()+source.slice(end));
  }
  source=exact(source,'assistant: Object.freeze({ width: 520, height: 300, minWidth: 360, minHeight: 120, resizable: true })','assistant: Object.freeze({ width: 320, height: 220, minWidth: 320, minHeight: 220, resizable: true })');
  source = exact(source, 'const RESEARCH_CANVAS_ORGANIZE_PADDING = 48;', 'const RESEARCH_CANVAS_ORGANIZE_PADDING = 32;')
  source = exact(source, 'const RESEARCH_CANVAS_ORGANIZE_NODE_GAP = 32;', 'const RESEARCH_CANVAS_ORGANIZE_NODE_GAP = 16;')
  source = block(source, 'function researchCanvasOrganizedLayout(', 'function researchCanvasVisibleArea(', `${bentoSource}
function researchCanvasOrganizedLayout(files, artifacts, canvasSize, measured = new Map()) {
  const nodes = [...files, ...artifacts].filter(n => typeof n?.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y));
  if (!nodes.length) return null;
  const packed = researchBentoLayout(nodes, canvasSize, measured);
  const byId = new Map(packed.nodes.map(n => [n.id, { ...n, x:n.x+n.width/2, y:n.y+n.height/2, sizeMode:'manual' }]));
  return { files:files.map(n=>byId.get(n.id)??n), artifacts:artifacts.map(n=>byId.get(n.id)??n), viewport:packed.viewport };
}`)
  source = block(source, 'const RESEARCH_COMPONENT_SIZES =', 'function researchCanvasReflowGrowth(', `const RESEARCH_COMPONENT_SIZES = { small:220, medium:220, large:456 };
function researchComponentSize(node) { return researchBentoSize(node); }
function researchComponentPrompt(node, prompt) {
  const size=researchComponentSize(node), dimensions=RESEARCH_BENTO_SIZES[size];
  return prompt+'\\n组件初始尺寸 '+dimensions.width+'×'+dimensions.height+'px；S 320×220、M 656×220、L 656×456。按内容密度先选规格；内容不足以容纳时升级规格，超过 L 则呈现摘要或拆分组件，完整内容通过放大阅读。数字英文 DINPro，中文 Noto Sans SC，标题15px、主指标24px、正文13px。按容器宽高重排，不缩小字号、字形，不使用组件内滚动条，不用 overflow:hidden 隐藏有效内容。窄框指标2列，中框4列，宽框图表与表格可并排。';
}
function researchAlignComponentPresets(artifacts, top = 32, canvasSize) {
  const packed=researchBentoLayout(artifacts.filter(n=>n.kind==='generated-container'),canvasSize);
  const replacements=new Map(packed.nodes.map(n=>[n.id,{...n,x:n.x+n.width/2,y:top+n.y+n.height/2,sizeMode:'auto'}]));
  return artifacts.map(n=>replacements.get(n.id)??n);
}`)
  source = block(source, '                    // Normalize component row sizes first,', '\n\t\t\t\t\tcommitUpdate(organized, true);', `                    const organized = researchCanvasOrganizedLayout(snapshot.files, snapshot.artifacts, snapshot.canvasSize, measured);
                    if (organized === null) return false;`)
  source = source.replaceAll('width: 720, height: RESEARCH_COMPONENT_SIZES[researchComponentSize(current)]', 'width: RESEARCH_BENTO_SIZES[researchComponentSize(current)].width, height: RESEARCH_BENTO_SIZES[researchComponentSize(current)].height')
  source = source.replace('kind === "generated-container" ? { width: 520, height: 300 }', 'kind === "generated-container" ? { width: 656, height: 220 }')
  source = exact(source, 'const width = 520;\n\t\t\tconst height = 300;', 'const width = kind === "summary" ? 320 : 656;\n\t\t\tconst height = kind === "summary" ? 220 : 456;')
  source = block(source, 'function researchContainerFinalGeometry(', 'function researchContainerRefreshDue(', `function researchContainerFinalGeometry(node, spec) {
  if(node?.sizeMode==='manual'||spec===null)return null;
  const {width,height}=RESEARCH_BENTO_SIZES[researchBentoSize({...node,containerSpec:spec})];
  return {width,height};
}`)
  source = block(source, 'function researchGenerationFinalGeometry(', 'function researchContainerFinalGeometry(', `function researchGenerationFinalGeometry(node,text) {
  if(node?.sizeMode==='manual')return null;
  const size=node.kind==='generated-mind-map'?'large':(text?.length??0)>160?'large':'small';
  const {width,height}=RESEARCH_BENTO_SIZES[size]; return {width,height};
}`)
  // Generated components choose a grid specification; intrinsic content cannot grow beyond L.
  source = exact(source, 'if (node.sizeMode === "manual" || node.kind === "web-link" || node.kind === "generated-container" && node.containerSpec?.type === "html"', 'if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link" || node.kind === "generated-container" && node.containerSpec?.type === "html"')
  source = exact(source, 'const width = Math.max(before.width, dimensions.width);\n\t\t\tconst height = Math.min(RESEARCH_CANVAS_MAX_AUTO_HEIGHT, Math.max(before.height, dimensions.height));', `const fitting=RESEARCH_BENTO_SIZES[researchBentoSize(node,dimensions)];
            const width = Math.max(Math.min(before.width,656),fitting.width);
            const height = Math.max(Math.min(before.height,456),fitting.height);`)
  source = exact(source, 'if (researchHtmlAutoGeometry(current.node, dimensions) === null) return;', `card?.toggleAttribute('data-research-content-overflow', dimensions.width>(current.node?.sizeMode==='manual'?current.node.width:656) || dimensions.height>(current.node?.sizeMode==='manual'?current.node.height:456));
                    if(current.node?.sizeMode==='manual'||growths>=3||Date.now()-startedAt>8000)return;
                    if (researchHtmlAutoGeometry(current.node, dimensions) === null) return;`)
  source = block(source, 'function ResearchGenerationProcess(', 'function isResearchWechatArticleUrl(', generationSource)
  source = block(source, 'function ResearchContainerContent(props) {', 'function ResearchContainerBody(', responsiveSource)
  source = exact(source, 'minWidth: Math.max(420, spec.columns.length * 128)', 'minWidth: 0')
  for(const [before,after] of [['不超过 3 层，高度概括','保留核心主题'],['平衡阅读效率与内容理解','覆盖重点与主要关系'],['充分展开内容关系细节','展开细节与依据']])source=exact(source, before, after)
  source=exact(source, 'onKeyDown: (event) => { event.stopPropagation(); if (event.key === \'Escape\') closeSelectedCreate(); },', `onKeyDown: (event) => { event.stopPropagation(); if(event.key==='Escape')closeSelectedCreate(); if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(!createPreparing&&createPrompt.trim())void startSelectedCreate();} },`)
  source=exact(source, "children: [\n\t\t\t\t\t(0, react_jsx_runtime.jsx)('textarea', { ref: createInputRef", `children: [
                    (0,react_jsx_runtime.jsxs)('div',{className:'odyssey-create-heading',children:[(0,react_jsx_runtime.jsx)('strong',{children:'基于所选创建'}),(0,react_jsx_runtime.jsx)('button',{type:'button',onClick:closeSelectedCreate,children:'Esc 关闭'})]}),
                    (0,react_jsx_runtime.jsx)('p',{className:'odyssey-create-count',children:'已选择 '+createSelection.ids.length+' 个组件'}),
                    (0, react_jsx_runtime.jsx)('textarea', { ref: createInputRef`)
  source=exact(source, "className: 'rScV5Q_containerDraftFooter', style: { display: 'flex', justifyContent: 'flex-end', marginTop: 10 }, children: (0, react_jsx_runtime.jsx)('button', { type: 'button', 'data-research-create-submit'", "className: 'rScV5Q_containerDraftFooter', style: { display: 'flex', justifyContent: 'flex-end', marginTop: 10 }, children: (0, react_jsx_runtime.jsx)('button', { type: 'button', title:'⌘ Enter 创建', 'data-research-create-submit'")
  source=exact(source, `children: [(0, react_jsx_runtime.jsx)("span", { children: node.generationError ?? '生成失败，请重试。' }),`, `children: [(0,react_jsx_runtime.jsx)('strong',{children:node.generationStatus==='failed'?'暂时未能完成生成':'已停止生成'}),(0,react_jsx_runtime.jsx)('span',{children:node.generationStatus==='failed'?'未获取到有效内容，已保留你的生成要求。':'已保留需求与已获取的信息，可以重新生成。'}),(0,react_jsx_runtime.jsxs)('details',{onToggle:event=>{const details=event.currentTarget,card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open){details.open=false;card?.querySelector('[data-research-container-expand]')?.click();card?.ownerDocument.defaultView?.requestAnimationFrame(()=>{if(card.open)details.open=true;});}},children:[(0,react_jsx_runtime.jsx)('summary',{children:node.generationStatus==='failed'?'查看失败详情':'查看已有过程'}),(0,react_jsx_runtime.jsx)('p',{children:node.generationError||researchGenerationLog(node).slice(-3).map(row=>row.text).join('；')})]}),`)
  source=source.replace(' ? "应用结果" : "重试"]', ' ? "应用结果" : "重新生成"]')
  return capDerivedNodes(source)+`\n/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */\n${canvasStyleInstaller()}\n`
}

function capDerivedNodes(source) {
  if(source.includes("includes(node.kind)){if(node.height>456||node.width>656)onAutoHeight"))return source;
  source=source.replace('if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link"', `if(node.sizeMode!=='manual'&&['generated-summary','generated-mind-map'].includes(node.kind)){if(node.height>456||node.width>656)onAutoHeight?.(node,Math.min(456,node.height));return;}
                if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link"`);
  return source;
}
// Plugin CSS and compact chrome are loaded after the client module. Keep the final
// design override last for those two sources, including lazy loading and reloads.
function canvasStyleInstaller() {
  return `if(typeof document!=='undefined'){const style=document.createElement('style');style.dataset.sherlockFigmaCanvas='';style.textContent=${JSON.stringify(canvasCss)};document.head.appendChild(style);const Observer=document.defaultView?.MutationObserver;if(Observer){const observer=new Observer(records=>{if(!style.isConnected){observer.disconnect();return;}if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&node.matches?.('style[data-research-compact-style],style[data-plugin-css="@deepseek-ai/dsh-client-ui-conversation/ResearchCanvas.module.css"]')&&(style.compareDocumentPosition(node)&4))))document.head.appendChild(style);});observer.observe(document.head,{childList:true});}}`;
}
const placementSource = `function researchCanvasVisibleArea(snapshot) {
  const size=snapshot?.canvasSize??{};
  return {width:size.availableWidth>0?Math.min(size.width,size.availableWidth):size.width,height:Math.max(0,(size.height??0)-88)};
}
function researchCanvasContainedAutoNode(snapshot,node) {
  if(!snapshot||node.sizeMode==='manual'||node.workbenchId||!['generated-container','generated-summary','generated-mind-map'].includes(node.kind))return node;
  const area=researchCanvasVisibleArea(snapshot),view=snapshot.viewport??{x:0,y:0,scale:1},scale=view.scale>0?view.scale:1;
  if(!(area.width>64&&area.height>64))return node;
  const clamp=(center,size,offset,extent)=>{const min=(32-offset)/scale+size/2,max=(extent-32-offset)/scale-size/2;return max>=min?Math.max(min,Math.min(max,center)):(extent/2-offset)/scale;};
  return {...node,x:clamp(node.x,node.width,view.x,area.width),y:clamp(node.y,node.height,view.y,area.height)};
}
function researchContainerPromptPreset(prompt) {
  const text=String(prompt);
  const large=text.length>280||/看板|概览|综合|多维|仪表|分布|热力|相关|复杂|K线|candlestick|dashboard|overview/i.test(text);
  const small=/核心指标|单一指标|当前价格|最新价格|市值|短结论|文件入口|一句话|KPI/i.test(text)&&!/[，、；;].*(趋势|图表|对比|表格)/.test(text);
  return researchBentoSize({type:large?'chart':small?'kpi':/短表|表格|趋势|走势|对比|比较|trend|table|compare/i.test(text)?'table':'chart'});
}
function researchContainerPlannedGeometry(snapshot,node,prompt) {
  const preset=researchContainerPromptPreset(prompt),dimensions=RESEARCH_BENTO_SIZES[preset];
  const placed=researchCanvasContainedAutoNode(snapshot,{...node,width:dimensions.width,height:dimensions.height});
  return {containerSizePreset:preset,width:placed.width,height:placed.height,x:placed.x,y:placed.y};
}
function researchCanvasViewportPlacement(snapshot, kind, cascadeIndex = 0) {
  const dimensions=kind==='web-link'?{width:720,height:480}:kind==='generated-container'?{width:656,height:220}:null;
  if(!dimensions)return null;
  const viewport=snapshot?.viewport??{scale:1,x:0,y:0},area=researchCanvasVisibleArea(snapshot),scale=viewport.scale>0?viewport.scale:1;
  const center=researchCanvasWorldPoint(viewport,{x:(area.width>0?area.width:1200)/2,y:(area.height>0?area.height:712)/2});
  const offset=Math.min(3,Math.max(0,Number.isFinite(cascadeIndex)?Math.floor(cascadeIndex):0))*24/scale;
  const placement=researchCanvasContainedAutoNode(snapshot,{kind,x:center.x+offset,y:center.y+offset,...dimensions,sizeMode:'auto'});
  const {kind:_kind,...geometry}=placement;return geometry;
}
`;

const derivedSource = `function ResearchDerivedSummary({node,onUpgradeSize}) {
  const spec={version:1,type:'markdown',title:node.title,content:node.excerpt};
  return (0,react_jsx_runtime.jsx)('div',{'data-research-derived-summary':'',className:'odyssey-derived-summary',children:(0,react_jsx_runtime.jsx)(ResearchContainerContent,{node:{...node,height:Math.max(100,node.height-24),containerSpec:spec},onUpgradeSize})});
}
function researchMindMapFitTree(tree,budget,labelLimit) {
  let remaining=Math.max(1,budget)-1,shortened=false;
  const copy=node=>{const label=String(node.label),limit=node===tree?labelLimit*2:labelLimit;const displayLabel=label.length>limit?label.slice(0,Math.max(1,limit-1))+'…':label;if(displayLabel!==label)shortened=true;return {...node,sourceLineIndex:node.sourceLineIndex,displayLabel,children:[]};};
  const result=copy(tree),queue=[{source:tree,target:result}];
  while(queue.length){const {source,target}=queue.shift();for(const child of source.children){if(remaining<=0){shortened=true;continue;}remaining--;const next=copy(child);target.children.push(next);queue.push({source:child,target:next});}}
  return {tree:result,shortened};
}
function ResearchMindMap({nodeId,text,detail='standard',onNodeLabelCommit}) {
  const [editingLineIndex,setEditingLineIndex]=(0,react.useState)(null),[layout,setLayout]=(0,react.useState)({width:620,height:360,expanded:false}),[budget,setBudget]=(0,react.useState)(24),ref=(0,react.useRef)(null);
  (0,react.useLayoutEffect)(()=>{const element=ref.current,card=element?.closest('[data-research-compact-chrome]');if(!element||!card)return;const update=()=>{const expanded=card.open;setLayout(previous=>{const next={width:element.clientWidth||previous.width,height:element.clientHeight||previous.height,expanded};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});};const View=element.ownerDocument.defaultView,observer=new View.ResizeObserver(update),mutation=new View.MutationObserver(update);observer.observe(element);mutation.observe(card,{attributes:true,attributeFilter:['open']});update();return()=>{observer.disconnect();mutation.disconnect();};},[nodeId]);
  const columns=layout.width<440?1:layout.width<700?3:4;
  (0,react.useLayoutEffect)(()=>setBudget(Math.max(1,Math.floor((layout.height-70)/42)*columns)),[text,layout.width,layout.height,columns]);
  (0,react.useLayoutEffect)(()=>{const element=ref.current;if(!element||layout.expanded||editingLineIndex!==null)return;let active=true;const measure=()=>{if(active&&element.clientHeight>0&&(element.scrollHeight>element.clientHeight+1||element.scrollWidth>element.clientWidth+1))setBudget(Math.max(1,Math.floor(budget*.75)));};measure();element.ownerDocument.fonts?.ready.then(measure);return()=>{active=false;};},[budget,layout.expanded,layout.width,layout.height,editingLineIndex]);
  const normalizedDetail=researchMindMapDetail(detail),original=parseResearchMindMap(text,layout.expanded?'detailed':normalizedDetail);
  const fit=original?(layout.expanded?{tree:original,shortened:false}:researchMindMapFitTree(original,budget,Math.max(6,Math.floor((layout.width-36-(columns-1)*16)/columns/13)*2))):null;
  const tree=fit?.tree,cancel=()=>setEditingLineIndex(null),commit=(sourceLineIndex,label)=>{setEditingLineIndex(null);onNodeLabelCommit?.(sourceLineIndex,label);};
  return (0,react_jsx_runtime.jsxs)('div',{ref,className:'rScV5Q_mindMap','data-research-mind-map':'','data-research-mind-map-detail':normalizedDetail,'data-mind-map-summary':!!fit?.shortened,'data-mind-map-expanded':layout.expanded,style:{'--odyssey-map-columns':Math.min(columns,Math.max(1,tree?.children.length??1))},lang:'zh-CN',children:tree?[(0,react_jsx_runtime.jsx)(ResearchMindMapDisplayNode,{artifactId:nodeId,node:tree,depth:0,root:true,editingLineIndex,onBeginEdit:setEditingLineIndex,onCommit:commit,onCancel:cancel}),tree.children.length?(0,react_jsx_runtime.jsx)(ResearchMindMapBranches,{artifactId:nodeId,nodes:tree.children,editingLineIndex,onBeginEdit:setEditingLineIndex,onCommit:commit,onCancel:cancel}):null,fit.shortened?(0,react_jsx_runtime.jsx)('span',{className:'odyssey-component-summary-note',children:'放大查看完整导图'}):null]:[(0,react_jsx_runtime.jsx)('span',{className:'rScV5Q_artifactExcerpt',children:text})]});
}
`;

const generationSource = `function ResearchGenerationProcess({node,onCancel,onExpand}) {
  const presentation=researchGenerationPresentation(node);
  const [clock,setClock]=(0,react.useState)(Date.now);
  const [expanded,setExpanded]=(0,react.useState)(false);
  const started=(0,react.useRef)(node.generationStartedAt??Date.now());
  (0,react.useEffect)(()=>{started.current=node.generationStartedAt??Date.now();setExpanded(false);},[node.generationTaskId]);
  (0,react.useEffect)(()=>{let timer;const tick=()=>{setClock(Date.now());timer=setTimeout(tick,1000);};timer=setTimeout(tick,1000);return()=>clearTimeout(timer);},[]);
  const elapsed=Math.max(0,Math.floor((clock-started.current)/1000));
  const rows=researchGenerationLog(node).slice(-3);
  return (0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_generationProcess','data-research-generation-process':'','data-research-generation-stage':presentation.stage,'data-process-expanded':expanded,'aria-busy':true,children:[
    (0,react_jsx_runtime.jsxs)('div',{className:'odyssey-generation-step',children:[(0,react_jsx_runtime.jsx)('span',{className:'rScV5Q_generationSpinner','aria-hidden':true}),(0,react_jsx_runtime.jsx)('span',{'data-research-generation-description':'',role:'status',children:researchPublicProgress(node.title||'当前组件')+' · '+(rows.at(-1)?.text||presentation.title)})]}),
    expanded?(0,react_jsx_runtime.jsx)('div',{className:'odyssey-generation-records',children:rows.map(row=>(0,react_jsx_runtime.jsxs)('div',{'data-research-generation-row':'',children:[row.stamp?(0,react_jsx_runtime.jsx)('time',{children:row.stamp}):null,(0,react_jsx_runtime.jsx)('span',{children:row.text})]},row.id))}):(0,react_jsx_runtime.jsx)('div',{className:'odyssey-generation-skeleton','aria-hidden':true,children:[0,1,2].map(i=>(0,react_jsx_runtime.jsx)('i',{},i))}),
    (0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_generationFooter',children:[(0,react_jsx_runtime.jsx)('button',{type:'button','data-research-generation-toggle':'','aria-expanded':expanded,onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();if(!expanded)onExpand?.();setExpanded(!expanded);},children:expanded?'收起过程':'查看过程'}),(0,react_jsx_runtime.jsx)('span',{'data-research-generation-elapsed':'',children:elapsed+' 秒'}),typeof onCancel==='function'&&node.generationTaskId?(0,react_jsx_runtime.jsx)('button',{type:'button','data-research-generation-cancel':'','aria-label':'停止生成',onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.preventDefault();e.stopPropagation();onCancel(node);},children:'停止'}):null]})]});
}`

const responsiveSource = `function ResearchContainerContent(props) {
  const {node}=props, ref=(0,react.useRef)(null);
  const [frameState,setFrameState]=(0,react.useState)({expanded:false,overflow:false});
  const [fitRatio,setFitRatio]=(0,react.useState)(1);
  const [kpiFit,setKpiFit]=(0,react.useState)([]);
  (0,react.useLayoutEffect)(()=>setFitRatio(1),[node.id,node.width,node.height,node.containerSpec]);
  (0,react.useLayoutEffect)(()=>{if(frameState.expanded)return;const element=ref.current;if(!element)return;let active=true;const measure=()=>{if(!active||!element.isConnected||element.clientHeight<1)return;
      if(node.containerSpec?.type==='kpi'&&element.clientWidth>0){
        const doc=element.ownerDocument,canvas=doc.createElement('canvas'),context=canvas.getContext('2d'),strong=element.querySelector('strong'),label=element.querySelector('.rScV5Q_containerKpis span');
        if(context&&strong&&label){const full=Math.max(40,element.clientWidth-36),columns=(node.width??656)<480?2:4,cell=(full-(columns-1)*16)/columns;
          const textFit=(value,font,maximum)=>{const text=String(value);context.font=font;if(context.measureText(text).width<=maximum)return text;let low=0,high=text.length;while(low<high){const mid=Math.ceil((low+high)/2);if(context.measureText(text.slice(0,mid)+'…').width<=maximum)low=mid;else high=mid-1;}return text.slice(0,low)+'…';};
          const valueFont=doc.defaultView.getComputedStyle(strong).font,labelFont=doc.defaultView.getComputedStyle(label).font;
          const next=node.containerSpec.items.map(item=>{context.font=valueFont;const fullWidth=context.measureText(String(item.value)).width>cell;const limit=fullWidth?full:cell;const value=textFit(item.value,valueFont,limit),name=textFit(item.label,labelFont,limit);return {fullWidth,value,label:name,shortened:value!==String(item.value)||name!==item.label};});
          setKpiFit(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
        }
      }
      if(element.scrollHeight>element.clientHeight+1)setFitRatio(previous=>Math.max(.05,Math.min(previous-.05,previous*element.clientHeight/element.scrollHeight*.9)));};const Observer=element.ownerDocument.defaultView?.ResizeObserver;const observer=Observer?new Observer(measure):null;observer?.observe(element);for(const child of element.children)observer?.observe(child);element.ownerDocument.fonts?.ready.then(measure);measure();return()=>{active=false;observer?.disconnect();};},[node.id,node.width,node.height,node.containerSpec,frameState.expanded,fitRatio]);
  (0,react.useLayoutEffect)(()=>{const card=ref.current?.closest('[data-research-node-id]');if(!card)return;const update=()=>setFrameState({expanded:card.hasAttribute('open'),overflow:card.hasAttribute('data-research-content-overflow')});update();const Observer=card.ownerDocument.defaultView?.MutationObserver;if(!Observer)return;const observer=new Observer(update);observer.observe(card,{attributes:true,attributeFilter:['open','data-research-content-overflow']});return()=>observer.disconnect();},[node.id]);
  let spec=node.containerSpec, summary=false;
  const width=node.width??656,height=node.height??456;
  if(!frameState.expanded){
    if(spec.type==='table') {
      const maxRows=Math.max(1,Math.floor((height-110)/33*fitRatio)),maxColumns=width<480?2:width<760?4:6;
      const indices=spec.columns.map((_,i)=>i).slice(0,maxColumns),sourceIndex=spec.columns.findIndex(column=>/来源|出处|source/i.test(String(column)));
      if(sourceIndex>=maxColumns)indices[indices.length-1]=sourceIndex;
      summary=spec.rows.length>maxRows||spec.columns.length>maxColumns;
      const cellLimit=Math.max(4,Math.floor((width-36)/indices.length/13)-1);
      const compact=cell=>{if(typeof cell!=='string'||cell.length<=cellLimit)return cell;const link=cell.match(/^\\[([^\\]]+)\\]\\((https?:[^)]+)\\)$/);if(link){if(link[1].length<=cellLimit)return cell;summary=true;return '['+link[1].slice(0,cellLimit)+'…]('+link[2]+')';}const url=cell.match(/^https?:\\/\\/[^\\s]+$/);if(url){summary=true;return '['+cell.slice(0,cellLimit)+'…]('+cell+')';}summary=true;return cell.slice(0,cellLimit)+'…';};
      spec={...spec,columns:indices.map(i=>compact(spec.columns[i])),rows:spec.rows.slice(0,maxRows).map(row=>indices.map(i=>compact(row[i])))};
    }
    if(spec.type==='kpi'){const columns=width<480?2:4,rows=Math.max(1,Math.floor((height-70)/76*fitRatio)),maximum=(kpiFit.some(item=>item.fullWidth)?1:columns)*rows;summary=spec.items.length>maximum||kpiFit.some(item=>item.shortened);spec={...spec,items:spec.items.slice(0,maximum).map((item,index)=>({...item,...kpiFit[index]}))};}
    if(spec.type==='markdown'||spec.type==='html'&&frameState.overflow){const text=spec.type==='html'?researchHtmlText(spec.html):spec.content;const maxChars=Math.max(24,Math.floor(Math.floor((width-36)/13)*Math.max(2,Math.floor((height-108)/21))*fitRatio));if(text.length>maxChars||spec.type==='html'||fitRatio<1){const sentences=text.split(/(?<=[。！？.!?])\\s*|\\n+/);let excerpt='';for(const sentence of sentences){if(excerpt.length+sentence.length>maxChars)break;excerpt+=(excerpt?'\\n':'')+sentence;}spec={version:1,type:'markdown',title:spec.title,content:(excerpt||text.slice(0,maxChars)+'…').replace(/^\\s{0,3}#{1,6}\\s+/gm,'').replace(/\\n+/g,' ').replace(/[*_]/g,'')};summary=true;}}
  }
  (0,react.useLayoutEffect)(()=>{if(!frameState.expanded&&node.sizeMode!=='manual'&&(node.containerSpec.type==='kpi'||node.kind==='generated-summary')&&summary&&(width<656||height<456))props.onUpgradeSize?.();},[node.id,node.sizeMode,node.containerSpec.type,width,height,summary,frameState.expanded,props.onUpgradeSize]);
  const htmlSummary=node.containerSpec.type==='html'&&spec.type==='markdown';
  return (0,react_jsx_runtime.jsxs)('div',{ref,className:'odyssey-component-content','data-component-expanded':frameState.expanded,'data-component-summary':summary,'data-component-width':width<480?'narrow':width<760?'medium':'wide',children:[
    (0,react_jsx_runtime.jsx)('div',{className:'odyssey-component-primary',inert:htmlSummary?true:void 0,'aria-hidden':htmlSummary?true:void 0,style:{display:htmlSummary?'none':'flex'},children:(0,react_jsx_runtime.jsx)(ResearchContainerBody,{...props,node:node.containerSpec.type==='html'||spec===node.containerSpec?node:{...node,containerSpec:spec}})}),
    htmlSummary?(0,react_jsx_runtime.jsx)(ResearchContainerBody,{...props,node:{...node,containerSpec:spec}}):null,
    summary?(0,react_jsx_runtime.jsx)('span',{className:'odyssey-component-summary-note',children:'放大查看完整内容'}):null]});
}`

export const canvasCss = `
.rScV5Q_root{--sherlock-research-dot:rgba(139,139,139,.4)!important;background-image:radial-gradient(circle,var(--sherlock-research-dot) .675px,transparent .8px)!important}body[data-ds-dark-theme] .rScV5Q_root{--sherlock-research-dot:rgba(184,184,184,.46)!important}
.rScV5Q_globalToolbar[data-research-global-toolbar]{box-sizing:border-box;width:272px;height:48px;bottom:24px;padding:6px;gap:4px;border:0;outline:1px solid #0000001a;outline-offset:-1px;border-radius:14px;background:#ffffffeb;backdrop-filter:blur(12px);box-shadow:0 6px 20px #0000001a}
.rScV5Q_globalToolbar[data-research-global-toolbar]>button,.rScV5Q_globalToolbar[data-research-global-toolbar] .rScV5Q_globalToolSlot>button{width:84px;height:36px;padding:0;justify-content:center;gap:8px;border-radius:9px;background:#00000008;font:13px/20px 'Noto Sans SC',sans-serif;color:#333}
body[data-ds-dark-theme] .rScV5Q_globalToolbar[data-research-global-toolbar]{background:#242424db;outline-color:#ffffff1f;box-shadow:0 6px 20px #0000003d}body[data-ds-dark-theme] .rScV5Q_globalToolbar[data-research-global-toolbar] button{background:#ffffff08;color:#dedede}

[data-research-compact-chrome]{--odyssey-card:#fff;--odyssey-card-border:#e1e1e1;--odyssey-card-text:#292b2f;--odyssey-card-muted:#81858c;--odyssey-select:#a2c4ff;border-radius:12px!important;box-shadow:none!important;container-type:size}
body[data-ds-dark-theme] [data-research-compact-chrome]{--odyssey-card:#292a2d;--odyssey-card-border:#424242;--odyssey-card-text:#ececed;--odyssey-card-muted:#98999f;--odyssey-select:#1b77ff}
[data-research-compact-chrome][data-selected=true]{border-color:var(--odyssey-select)!important;outline:1.5px solid var(--odyssey-select)!important;outline-offset:-1px!important;box-shadow:0 0 7px rgba(82,140,255,.28),0 0 26px 2px rgba(64,128,255,.14)!important}
body[data-ds-dark-theme] [data-research-compact-chrome][data-selected=true]{box-shadow:0 0 7px rgba(82,140,255,.48),0 0 26px 2px rgba(64,128,255,.24)!important}
[data-research-compact-chrome]>.rScV5Q_nodeTitle{height:48px;min-height:48px;flex-basis:48px;padding:15px 18px 10px!important;border-radius:11px 11px 0 0;border-bottom:0!important;align-items:flex-start}
[data-research-compact-chrome] .rScV5Q_nodeTitleText{font-size:15px!important;font-weight:500;line-height:23px;flex:1}
[data-research-compact-chrome] .rScV5Q_nodeTitleActions{top:12px;right:12px;gap:6px;padding:3px;border-radius:7px;background:var(--odyssey-card)}
[data-research-compact-chrome] :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand){width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--odyssey-card-muted)}
[data-research-compact-chrome] :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand):hover{background:color-mix(in srgb,var(--odyssey-card-text) 6%,transparent);color:var(--odyssey-card-text)}
[data-research-compact-chrome]>.rScV5Q_previewBody{height:calc(100% - 48px);border-radius:0 0 11px 11px;clip-path:none}
[data-research-compact-chrome] :is(.rScV5Q_containerContent,.rScV5Q_generatedContainer){background:var(--odyssey-card)!important;overflow:visible;align-items:stretch!important;min-height:0}
[data-research-arrange-feedback]{width:max-content!important;min-width:0!important;padding:8px 12px!important}.odyssey-arrange-toast{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font:12px/20px DINPro,'Noto Sans SC',sans-serif}.odyssey-arrange-toast img{flex:none}\n.odyssey-component-content{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;color:var(--odyssey-card-text);font:13px/21px DINPro,'Noto Sans SC',sans-serif}
.odyssey-component-primary{display:flex;flex:1;min-height:0;min-width:0;flex-direction:column}\n.odyssey-component-content[data-component-expanded=true]{overflow:auto}
.odyssey-component-summary-note{flex:none;padding:0 18px 12px;font-size:10px;line-height:18px;color:var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_containerKpis{padding:6px 18px 16px;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 16px;align-content:start}
[data-research-compact-chrome] [data-component-width=narrow] .rScV5Q_containerKpis{grid-template-columns:repeat(2,minmax(0,1fr))}
[data-research-compact-chrome] .rScV5Q_containerKpis>div{min-height:60px;padding:0;gap:2px;border:0;background:transparent;justify-content:flex-start}
[data-research-compact-chrome] .rScV5Q_containerKpis span{font:10px/18px DINPro,'Noto Sans SC',sans-serif;color:var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_containerKpis strong{font:500 24px/32px DINPro,'Noto Sans SC',sans-serif;letter-spacing:0;color:var(--odyssey-card-text)}
[data-research-compact-chrome] .rScV5Q_containerKpis em{font:13px/21px DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_containerTableScroll{padding:0 18px 12px;overflow:visible}
[data-research-compact-chrome] .rScV5Q_containerTableScroll :is(th,td){height:33px;padding:6px 0;line-height:21px;border:0;border-bottom:1px solid var(--odyssey-card-border);overflow-wrap:anywhere}
[data-research-compact-chrome] .rScV5Q_containerTableScroll th{font-size:11px;line-height:19px;font-weight:400}
[data-research-compact-chrome] .rScV5Q_containerMarkdown{padding:0 18px 12px;overflow:visible;font-size:13px;line-height:21px}
[data-research-compact-chrome] .rScV5Q_containerMarkdown p{margin:0 0 8px}
[data-research-compact-chrome] .rScV5Q_containerChart{padding:0 18px 16px;flex:1;justify-content:flex-start}
[data-research-compact-chrome] .rScV5Q_containerChart svg{flex:1;width:100%;height:100%;max-height:none;min-height:0}
[data-research-compact-chrome] .rScV5Q_chartLabel{font:11px DINPro,'Noto Sans SC',sans-serif}\n[data-research-compact-chrome] .rScV5Q_chartLegend{padding:6px 0 0;font:11px/19px DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_artifactBody:has([data-research-derived-summary]),[data-research-compact-chrome][data-research-generated-mind-map] .rScV5Q_artifactBody{height:100%;min-height:0;padding:0!important;gap:6px}
.odyssey-derived-summary{display:flex;flex:1;min-height:0;flex-direction:column}
[data-research-compact-chrome] .rScV5Q_artifactMeta{flex:none;padding:0 18px 6px;font-size:10px;line-height:18px}
[data-research-compact-chrome] .rScV5Q_mindMap{height:auto;flex:1;min-height:0;padding:6px 18px 0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:12px;overflow:visible;font-family:DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapRoot{align-self:center;width:fit-content;max-width:100%}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapChildren{display:grid;grid-template-columns:repeat(var(--odyssey-map-columns),minmax(0,1fr));gap:16px;padding-top:12px}
[data-research-compact-chrome] .rScV5Q_mindMapChildren{min-width:0;gap:8px;justify-content:flex-start}
[data-research-compact-chrome] .rScV5Q_mindMapBranch{flex-direction:column;align-items:stretch;gap:8px;min-width:0}
[data-research-compact-chrome] .rScV5Q_mindMapBranch>.rScV5Q_mindMapChildren{padding-left:10px;border-left:1px solid var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_mindMapNode{width:auto;min-width:0;max-width:100%;min-height:30px;padding:6px 8px;border-radius:5px;font:400 13px/21px DINPro,'Noto Sans SC',sans-serif;overflow-wrap:anywhere}
[data-research-compact-chrome] .rScV5Q_mindMapRoot{font-weight:500}
[data-research-compact-chrome] .rScV5Q_mindMapRoot:after{display:none}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapChildren:before{content:"";position:absolute;left:50%;top:-12px;width:1px;height:12px;background:var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_mindMapChildren:after,[data-research-compact-chrome] .rScV5Q_mindMapBranch:after{display:none}
[data-research-compact-chrome] .rScV5Q_mindMapBranch:before{display:none}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapChildren>.rScV5Q_mindMapBranch:before{display:block;left:50%;top:-12px;width:1px;height:12px}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapChildren>.rScV5Q_mindMapBranch{border-top:1px solid var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_mindMap .odyssey-component-summary-note{padding:0;line-height:18px}
[data-research-compact-chrome][open] .rScV5Q_mindMap{overflow:auto}
[data-research-compact-chrome]:not([open]):has(.rScV5Q_mindMap,.odyssey-derived-summary)>.rScV5Q_previewBody{overflow:visible!important}
.rScV5Q_selectionActions{height:36px!important;padding:4px 6px!important;gap:2px;border-radius:11px!important;background:rgba(255,255,255,.94)!important;border:1px solid #00000014!important;backdrop-filter:blur(12px)!important;box-shadow:0 3px 12px #00000014!important}
.rScV5Q_selectionActions button{height:28px;padding:0 6px;gap:5px;border-radius:7px;font:12px/18px 'Noto Sans SC',sans-serif}
.rScV5Q_selectionActions button svg{width:14px;height:14px;flex:none}
.rScV5Q_selectionActions button[aria-expanded=true]{background:#f4f5f7}
body[data-ds-dark-theme] .rScV5Q_selectionActions{background:rgba(48,48,48,.93)!important;border-color:#ffffff1a!important;box-shadow:0 3px 12px #00000038!important}
body[data-ds-dark-theme] .rScV5Q_selectionActions button[aria-expanded=true]{background:#ffffff0a}
.rScV5Q_mindMapMenu{width:270px!important;padding:8px;display:flex;flex-direction:column;gap:4px;border-radius:10px;box-shadow:0 4px 16px #0000000d}
.rScV5Q_mindMapMenu button{position:relative;padding:8px 10px!important;min-height:56px;gap:0}
.odyssey-detail-check{position:absolute;right:10px;top:20px}.odyssey-canvas-icon{flex:none;object-fit:contain}body[data-ds-dark-theme] .odyssey-canvas-icon{filter:invert(.85)}\n.rScV5Q_mindMapMenu strong{font:13px/21px 'Noto Sans SC',sans-serif}.rScV5Q_mindMapMenu span{font:11px/19px 'Noto Sans SC',sans-serif}
[data-research-create-popover]{width:420px!important;padding:18px!important;border-radius:12px!important}
.odyssey-create-heading{display:flex;justify-content:space-between;align-items:center;font:15px/23px 'Noto Sans SC',sans-serif}.odyssey-create-heading strong{font-weight:500}.odyssey-create-heading button{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px}
.odyssey-create-count{margin:12px 0;color:var(--dsw-alias-label-tertiary);font-size:12px}
[data-research-create-popover] textarea{resize:none!important;height:98px!important;font:13px/21px 'Noto Sans SC',sans-serif!important}
[data-research-compact-chrome] .rScV5Q_generationProcess{box-sizing:border-box;min-height:0;height:100%;padding:8px 18px 16px!important;gap:12px;display:flex;flex-direction:column}
.odyssey-generation-step{display:flex;align-items:center;gap:10px;min-height:23px;font:13px/21px 'Noto Sans SC',sans-serif}
.odyssey-generation-step [data-research-generation-description]{display:block;overflow:visible;margin:0;line-height:21px}
.rScV5Q_generationSpinner{width:16px;height:16px;border:1.7px solid color-mix(in srgb,currentColor 16%,transparent);border-top-color:currentColor;border-radius:50%;animation:odyssey-ring .9s linear infinite}
.odyssey-generation-skeleton{min-height:18px;flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:8px}
.odyssey-generation-skeleton i{height:8px;max-height:12px;border-radius:4px;width:100%;background:#f0f1f3;animation:odyssey-skeleton 1.6s ease-in-out infinite}.odyssey-generation-skeleton i:nth-child(2){width:82%}.odyssey-generation-skeleton i:nth-child(3){width:58%}
body[data-ds-dark-theme] .odyssey-generation-skeleton i{background:#36373b}
.odyssey-generation-records{min-height:0;flex:1;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-radius:8px;background:#f4f5f7;font:12px/20px 'Noto Sans SC',sans-serif}
.odyssey-generation-records>div{display:flex;gap:8px;overflow-wrap:anywhere}.odyssey-generation-records time{flex:none;color:var(--odyssey-card-muted)}
body[data-ds-dark-theme] .odyssey-generation-records{background:#ffffff05}
[data-research-compact-chrome] .rScV5Q_generationFooter{display:flex;flex:none;align-items:center;gap:8px;border:0;padding:0;min-height:28px;font:12px/20px DINPro,'Noto Sans SC',sans-serif}
.rScV5Q_generationFooter [data-research-generation-elapsed]{color:var(--odyssey-card-muted);margin-right:auto}
.rScV5Q_generationFooter button{height:28px;padding:0 8px;font:12px/20px 'Noto Sans SC',sans-serif;border:0;border-radius:6px;background:transparent;color:var(--odyssey-card-text)}
[data-research-generation-process][data-process-expanded=true] .odyssey-generation-records{font-size:11px;line-height:17px;gap:4px;padding:6px 10px}
[data-research-compact-chrome] .rScV5Q_generationFailure{min-height:0;padding:8px 18px 18px;align-items:flex-start;justify-content:flex-start;text-align:left;gap:12px;font:13px/21px 'Noto Sans SC',sans-serif}
.rScV5Q_generationFailure>strong{font-size:16px;font-weight:500}.rScV5Q_generationFailure>span{color:var(--odyssey-card-muted)}.rScV5Q_generationFailure details{font-size:12px;line-height:20px}.rScV5Q_generationFailure details p{margin:8px 0}.rScV5Q_generationFailure button{margin-left:auto}
@keyframes odyssey-ring{to{transform:rotate(360deg)}}@keyframes odyssey-skeleton{50%{opacity:.45}}
@media(prefers-reduced-motion:reduce){.rScV5Q_generationSpinner,.odyssey-generation-skeleton i{animation:none}}
`
