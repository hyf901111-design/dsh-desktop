import { patchResearchCanvasDeferredHtml } from './research-canvas-deferred-html.mjs'
import { patchResearchCanvasViewportPersistence } from './research-canvas-viewport-persistence.mjs'
import { generationSource, generationCss, patchGenerationLifecycle, componentPromptSource } from './figma-generation-client.mjs'
import { researchCompletedDesignCss } from './research-completed-design.mjs'
import { patchResearchComponentHeaderNote, researchComponentHeaderNoteCss } from './research-component-header-note.mjs'
import { patchResearchOfficeResize } from './research-office-resize.mjs'
import { patchFigmaCanvasArrangeMotion } from './figma-canvas-arrange-motion.mjs'
import { patchResearchWorkbenchGrowth } from './research-workbench-growth.mjs'
import { patchResearchCreationProgress } from './research-creation-progress.mjs'
import { parseResearchMarketNativeTable, ResearchMarketNativeTable, researchMarketNativeTableCss } from './research-market-native-table.mjs'
import { ResearchInteractiveTable, ResearchContainerChart } from './research-native-interactivity.mjs'
import { MARKET_REGULAR_FONT_CSS } from '../../packages/dsh-research-task-runtime/market-font.js'
import { readFileSync } from 'node:fs'
import { patchFigmaDerivedMenu, derivedMenuCss } from './figma-derived-menu-client.mjs'
const iconData = Object.fromEntries(['branch','chevron','summary','plus','check','more','expand','global-link-light','global-container-light','global-voice-light','global-link-dark','global-container-dark','global-voice-dark'].map(name=>[name,'data:image/svg+xml;base64,'+readFileSync(new URL('../../build/figma-canvas-icons/'+name+'.svg',import.meta.url)).toString('base64')]));
const bentoSource = readFileSync(new URL('../../packages/dsh-research-task-runtime/bento-layout.js', import.meta.url), 'utf8').replace(/^import .* from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '').replace(/^\/\/[^\n]*\n/,'')
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
// Figma 361:5855 / 361:6148: short round-capped 0.07px lines, not radial fills.
// Cache one row and reuse it; panning updates only a group transform.
export function researchCanvasDotMetrics(canvasSize, viewport) {
  const scale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const step = 13.71 * scale;
  const phase = (value, offset) => ((value + offset * scale) % step + step) % step - step;
  return { scale, columns: Math.ceil(Math.max(0, canvasSize.width || 0) / step) + 2,
    rows: Math.ceil(Math.max(0, canvasSize.height || 0) / step) + 2,
    x: phase(viewport.x || 0, 12.5499), y: phase(viewport.y || 0, 7.6871) };
}
export function researchCanvasDotRowPath(columns) {
  return Array.from({ length: columns }, (_, column) => 'M' + (6.855 + column * 13.71).toFixed(5) + ' 6.855h.07').join('');
}
export function researchCanvasUnobscuredWidth(bounds, panelBounds) {
  if (!(bounds?.width > 0)) return 0;
  if (!panelBounds || panelBounds.left <= bounds.left || panelBounds.left >= bounds.right ||
      panelBounds.bottom <= bounds.top || panelBounds.top >= bounds.bottom) return bounds.width;
  return Math.max(1, Math.min(bounds.width, panelBounds.left - bounds.left));
}
function ResearchCanvasDotGrid({ viewport, canvasSize }) {
  const id = 'odyssey-dots-' + (0, react.useId)().replaceAll(':', '');
  const geometry = researchCanvasDotMetrics(canvasSize, viewport);
  const row = (0, react.useMemo)(() => researchCanvasDotRowPath(geometry.columns), [geometry.columns]);
  const rows = (0, react.useMemo)(() => Array.from({ length: geometry.rows }, (_, index) =>
    (0, react_jsx_runtime.jsx)('use', { href: '#' + id, y: index * 13.71 }, index)), [geometry.rows, id]);
  return (0, react_jsx_runtime.jsxs)('svg', { className: 'odyssey-canvas-dots', 'aria-hidden': true,
    'data-research-dot-grid': '', focusable: false, children: [
      (0, react_jsx_runtime.jsx)('defs', { children: (0, react_jsx_runtime.jsx)('path', { id, d: row }) }),
      (0, react_jsx_runtime.jsx)('g', { transform: 'translate(' + geometry.x + ' ' + geometry.y + ') scale(' + geometry.scale + ')', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', children: rows })
    ] });
}
function patchCanvasGraphicPrimitives(source) {
  const dotRender='(0,react_jsx_runtime.jsx)(ResearchCanvasDotGrid,{viewport,canvasSize:snapshot.canvasSize}),';
  const first=source.indexOf(dotRender),duplicate=source.indexOf(dotRender,first+dotRender.length);
  if(first>=0&&duplicate>=0)source=source.slice(0,duplicate)+source.slice(duplicate+dotRender.length);
  const definitions = researchCanvasDotMetrics.toString().replace('export ', '') + '\n' + researchCanvasDotRowPath.toString().replace('export ', '') + '\n' + ResearchCanvasDotGrid.toString();
  if (source.includes('function researchCanvasDotMetrics(')) source = block(source, 'function researchCanvasDotMetrics(', 'function ResearchCanvas({', definitions);
  else source = exact(source, 'function ResearchCanvas({', definitions + '\nfunction ResearchCanvas({');
  if (!source.includes('(ResearchCanvasDotGrid,{viewport,canvasSize:snapshot.canvasSize})')) {
    const start = source.indexOf('"data-canvas-scale": viewport.scale.toFixed(3)');
    const children = source.indexOf('children: [', start);
    if (start < 0 || children < start || children - start > 600) throw Error('Figma dot grid children anchor missing');
    source = source.slice(0, children) + source.slice(children).replace('children: [', 'children: [(0,react_jsx_runtime.jsx)(ResearchCanvasDotGrid,{viewport,canvasSize:snapshot.canvasSize}),');
  }
  for (const [label, key] of [['链接', 'link'], ['容器', 'container']]) {
    // Match the single existing one-line icon immediately before this fixed label.
    const line = source.split('\n').find(line => line.includes('children: [(0, react_jsx_runtime.jsx)("svg",') && line.includes('children: "' + label + '"'));
    if (line) {
      const iconStart = line.indexOf('(0, react_jsx_runtime.jsx)("svg",');
      const iconEnd = line.indexOf(', (0, react_jsx_runtime.jsx)("span", { children: "' + label + '" })', iconStart);
      if (iconEnd < 0) throw Error('Figma toolbar icon boundary missing: ' + key);
      source = exact(source, line, line.slice(0, iconStart) + "(0,react_jsx_runtime.jsx)('span',{className:'odyssey-global-icon odyssey-global-" + key + "','aria-hidden':true})" + line.slice(iconEnd));
    } else if (!source.includes("className:'odyssey-global-icon odyssey-global-" + key + "'") && !source.includes("/* ODYSSEY_CREATION_TOOLS */")) throw Error('Figma toolbar icon anchor missing: ' + key);
  }
  const voiceAnchor = 'icon("M6.5 5a2.5 2.5 0 0 1 5 0v4a2.5 2.5 0 0 1-5 0V5ZM4.5 8.5V9a4.5 4.5 0 0 0 9 0v-.5M9 13.5V16M6.5 16h5")';
  if (source.includes(voiceAnchor)) source = exact(source, voiceAnchor, "(0,react_jsx_runtime.jsx)('span',{className:'odyssey-global-icon odyssey-global-voice','aria-hidden':true})");
  else if (!source.includes("className:'odyssey-global-icon odyssey-global-voice'")) throw Error('Figma toolbar icon anchor missing: voice');
  return source;
}

function patchCreationAfterCanvasUse(source) {
  // The creation controls consume the canvas-use stop/queue handlers.
  return source.includes('stop=()=>{if(canvasRunning)') ? patchResearchCreationProgress(source) : source;
}
export function patchWorkbenchPanelGuard(source) {
  const singleWorkbenchGuard = 'if (!plan || !Array.isArray(plan.panels) || plan.panels.length < 1 || plan.panels.length > 30) return false;'
  if (!source.includes(singleWorkbenchGuard)) {
    const previousGuard = source.includes(singleWorkbenchGuard.replace('> 30','> 10'))
      ? singleWorkbenchGuard.replace('> 30','> 10')
      : singleWorkbenchGuard.replace('length < 1','length < 2').replace('> 30','> 10')
    source = exact(source,previousGuard,singleWorkbenchGuard)
  }
  return source
}
export function patchFigmaFinalCanvas(source) {
  source = patchResearchCanvasDeferredHtml(source)
  source = patchResearchCanvasViewportPersistence(source)
  source = patchWorkbenchPanelGuard(source)
  const marketResizeSource = `/* ODYSSEY_MARKET_METRICS_RESIZE */
        function researchCanvasMinimumHeight(node, policy) {
            if (node?.kind !== "generated-container") return policy.minHeight;
            const spec = node.containerSpec;
            const dimensions = researchMarketDimensions(node, true);
            if (dimensions) return Number.isFinite(node.height) && node.height>0
                ? Math.min(dimensions.height, node.height) : dimensions.height;
            if (spec?.type !== "market" || spec.variant !== "metrics") return policy.minHeight;
            const count = spec.items?.length || 0;
            return count > 12 ? 320 : count > 6 ? 232 : 144;
        }
        function researchCanvasMinimumWidth(node, policy) {
            if (node?.kind !== "generated-container") return policy.minWidth;
            const spec=node.containerSpec;
            const preferred=researchMarketDimensions(node,true)?.width ??
                (spec?.type==='kpi'&&spec.items?.length===6?896:null) ??
                (/data-research-kind="(?:news|reports)"/.test(spec?.html??'')?656:null);
            if (!preferred) return policy.minWidth;
            // Every generated family uses the same readable-width ratio. The
            // content template determines its starting size, not a second
            // unrelated drag rule.
            const floor=Math.max(policy.minWidth,Math.min(preferred,Math.round(preferred*.72/8)*8));
            return Number.isFinite(node.width)&&node.width>0?Math.min(floor,node.width):floor;
        }`;
  if (source.includes('/* ODYSSEY_MARKET_METRICS_RESIZE */')) {
    source=block(source,'/* ODYSSEY_MARKET_METRICS_RESIZE */','function normalizeResearchCanvasNodeGeometry(node) {',marketResizeSource);
  } else {
    source=exact(source,'function normalizeResearchCanvasNodeGeometry(node) {',marketResizeSource+'\n        function normalizeResearchCanvasNodeGeometry(node) {');
    source=exact(source,'Math.max(policy.minHeight, finiteHeight)','Math.max(researchCanvasMinimumHeight(node, policy), finiteHeight)');
    source=exact(source,'Math.max(policy.minHeight, geometry.height + sy * dy)','Math.max(researchCanvasMinimumHeight(node, policy), geometry.height + sy * dy)');
  }
  if(source.includes('Math.max(policy.minWidth, finiteWidth)'))source=exact(source,'Math.max(policy.minWidth, finiteWidth)','Math.max(researchCanvasMinimumWidth(node, policy), finiteWidth)');
  if(source.includes('Math.max(policy.minWidth, geometry.width + sx * dx)'))source=exact(source,'Math.max(policy.minWidth, geometry.width + sx * dx)','Math.max(researchCanvasMinimumWidth(node, policy), geometry.width + sx * dx)');
  const isolatedPointerResize = `/* ODYSSEY_POINTER_RESIZE_ISOLATED */
                  update({files:snapshot.files.map(apply),artifacts:snapshot.artifacts.map(apply)},false);`;
  const reflowingPointerResize = `/* ODYSSEY_POINTER_RESIZE_REFLOW */
                  let artifacts=snapshot.artifacts.map(apply);
                  for(const geometry of nodes) {
                    const previous=snapshot.artifacts.find(node=>node.id===geometry.id);
                    if(previous&&(Math.abs(previous.width-geometry.width)>2||Math.abs(previous.height-geometry.height)>2))
                      artifacts=researchCanvasReflowGrowth(snapshot.artifacts,artifacts,geometry.id);
                  }
                  update({files:snapshot.files.map(apply),artifacts},false);`;
  if (source.includes('/* ODYSSEY_POINTER_RESIZE_REFLOW */'))
    source=exact(source,reflowingPointerResize,isolatedPointerResize);
  else if (!source.includes('/* ODYSSEY_POINTER_RESIZE_ISOLATED */') && source.includes('applyPointerGeometry(nodes) {'))
    source=exact(source,'update({files:snapshot.files.map(apply),artifacts:snapshot.artifacts.map(apply)},false);',isolatedPointerResize);
  if(!source.includes('/* ODYSSEY_NATIVE_MARKET_TABLE */')) {
    const htmlReturn = source.includes('(ResearchHtmlArtifact, { spec, node, sessionId, onSize: onHtmlSize })')
      ? 'if (spec.type === "html") return (0, react_jsx_runtime.jsx)(ResearchHtmlArtifact, { spec, node, sessionId, onSize: onHtmlSize });'
      : 'if (spec.type === "html") return (0, react_jsx_runtime.jsx)(ResearchHtmlArtifact, { spec, node, onSize: onHtmlSize });';
    source=exact(source,htmlReturn,`/* ODYSSEY_NATIVE_MARKET_TABLE */
            const nativeTable = spec.type === "html" ? researchMarketTableForSpec(spec) : null;
            if (nativeTable) return (0, react_jsx_runtime.jsx)(ResearchMarketNativeTable, { data: nativeTable });
            ${htmlReturn}`);
  }
  if (!source.includes('"data-research-market-panel": researchMarketDimensions(node)'))
    source=exact(source,'"data-research-compact-chrome": compact || void 0,',
      '"data-research-compact-chrome": compact || void 0, "data-research-market-panel": researchMarketDimensions(node) ? true : void 0,');
  if(!source.includes('/* ODYSSEY_PREPARED_WORKBENCH_V1 */')) {
    source=exact(source,"excerpt: p.error ?? '正在准备任务…', containerPrompt: p.prompt, refreshMinutes: 0,",`/* ODYSSEY_PREPARED_WORKBENCH_V1 */
                        excerpt: p.preparedOutput ? researchContainerPlainText(parseResearchContainerSpec(p.preparedOutput)) : p.error ?? '正在准备任务…', containerPrompt: p.prompt, refreshMinutes: 0,`);
    source=exact(source,"generationStatus: p.taskId ? 'queued' : 'failed', generationLastSeq: 0,","generationStatus: p.preparedOutput ? 'completed' : p.taskId ? 'queued' : 'failed', generationLastSeq: p.preparedOutput ? 1 : 0,");
    source=exact(source,'containerSizePreset: p.size ?? researchComponentSize(p), workbenchId: plan.id,',`...(p.preparedOutput ? {containerSpec:parseResearchContainerSpec(p.preparedOutput),generationCompletedAt:Date.now(),lastSuccessfulAt:Date.now()} : {}),
                        containerSizePreset: p.size ?? researchComponentSize(p), workbenchId: plan.id,`);
  }
  if(!source.includes('/* ODYSSEY_WORKBENCH_PLAN_HYDRATION */')) {
    source=exact(source,
      'if (plan.panels.every(p => existing.has(p.nodeId))) return true;',
      `/* ODYSSEY_WORKBENCH_PLAN_HYDRATION */
                    if (plan.panels.every(p => existing.has(p.nodeId))) {
                        let changed = false;
                        const artifacts = snapshot.artifacts.map(node => {
                            const panel = plan.panels.find(p => p.nodeId === node.id);
                            if (!panel || node.generationStatus !== 'queued' || node.generationTaskId) return node;
                            if (panel.taskId) {
                                changed = true;
                                return { ...node, generationTaskId: panel.taskId,
                                    generationStartedAt: node.generationStartedAt ?? plan.createdAt ?? Date.now() };
                            }
                            if (panel.error) {
                                changed = true;
                                return { ...node, generationStatus: 'failed', generationError: panel.error, excerpt: panel.error };
                            }
                            return node;
                        });
                        if (changed) commitUpdate({ artifacts }, true);
                        /* ODYSSEY_WORKBENCH_PREPARED_HYDRATION */
                        for (const panel of plan.panels) {
                            const current = snapshot.artifacts.find(node => node.id === panel.nodeId);
                            if (panel.preparedOutput && panel.taskId && current?.generationStatus !== 'completed') {
                                this.applyGenerationInspection(panel.nodeId, {
                                    taskId: panel.taskId, canvasNodeId: panel.nodeId,
                                    state: 'completed', lastSeq: 1, events: [], finalOutput: panel.preparedOutput
                                });
                            }
                        }
                        return true;
                    }`);
  }
  if(source.includes('/* ODYSSEY_WORKBENCH_PLAN_HYDRATION */') && !source.includes('/* ODYSSEY_WORKBENCH_PREPARED_HYDRATION */')) {
    source=exact(source,
      'if (changed) commitUpdate({ artifacts }, true);\n                        return true;',
      `if (changed) commitUpdate({ artifacts }, true);
                        /* ODYSSEY_WORKBENCH_PREPARED_HYDRATION */
                        for (const panel of plan.panels) {
                            const current = snapshot.artifacts.find(node => node.id === panel.nodeId);
                            if (panel.preparedOutput && panel.taskId && current?.generationStatus !== 'completed') {
                                this.applyGenerationInspection(panel.nodeId, {
                                    taskId: panel.taskId, canvasNodeId: panel.nodeId,
                                    state: 'completed', lastSeq: 1, events: [], finalOutput: panel.preparedOutput
                                });
                            }
                        }
                        return true;`);
  }
  source=source.replace("generationStatus: p.preparedOutput ? 'completed' : p.taskId ? 'queued' : 'failed',",
    "generationStatus: p.preparedOutput ? 'completed' : p.taskId || p.pending ? 'queued' : 'failed',");
  if(!source.includes('/* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */')) {
    source=exact(source,"const nodes = plan.panels.filter(p => !existing.has(p.nodeId)).map(p => canonicalResearchCanvasArtifactNode({", "let nodes = plan.panels.filter(p => !existing.has(p.nodeId)).map(p => canonicalResearchCanvasArtifactNode({");
    source=exact(source,'if (nodes.some(n => n === null)) return false;\n                    const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);',`if (nodes.some(n => n === null)) return false;
                    /* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */
                    if(nodes.every(n=>n.generationStatus==='completed')&&nodes.some(researchMarketDimensions)) {
                        const packed=researchBentoLayout(nodes,researchCanvasVisibleArea(snapshot),new Map(),{fitColumns:true});
                        nodes=packed.nodes.map(n=>({...n,x:n.x+n.width/2,y:bottom+n.y+n.height/2}));
                    }
                    const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);`);
  }
  if(!source.includes('/* ODYSSEY_PREPARED_WORKBENCH_VIEWPORT */')) {
    source=exact(source,"/* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */\n                    if(nodes.every(n=>n.generationStatus==='completed')&&nodes.some(researchMarketDimensions)) {",`/* ODYSSEY_PREPARED_WORKBENCH_LAYOUT */
                    /* ODYSSEY_PREPARED_WORKBENCH_VIEWPORT */
                    let preparedViewport = null;
                    if(nodes.every(n=>n.generationStatus==='completed')&&nodes.some(researchMarketDimensions)) {`);
    source=exact(source,'nodes=packed.nodes.map(n=>({...n,x:n.x+n.width/2,y:bottom+n.y+n.height/2}));',`nodes=packed.nodes.map(n=>({...n,x:n.x+n.width/2,y:bottom+n.y+n.height/2}));
                        preparedViewport=researchWorkbenchViewport(nodes,snapshot.viewport,researchCanvasVisibleArea(snapshot));`);
    source=exact(source,'persistClipboardBatch({ ...snapshot, artifacts, selection });\n                    commitUpdate({ artifacts, selection }, false);',`persistClipboardBatch({ ...snapshot, artifacts, selection });
                    if(preparedViewport){autoFitManaged=true;autoFitActive=true;}
                    commitUpdate({ artifacts, selection, ...(preparedViewport ? {viewport:preparedViewport} : {}) }, false);`);
  }
  if(source.includes('/* ODYSSEY_PREPARED_WORKBENCH_VIEWPORT */')&&!source.includes('if(preparedViewport){autoFitManaged=true;autoFitActive=true;}'))
    source=exact(source,'commitUpdate({ artifacts, selection, ...(preparedViewport ? {viewport:preparedViewport} : {}) }, false);',
      'if(preparedViewport){autoFitManaged=true;autoFitActive=true;}\n                    commitUpdate({ artifacts, selection, ...(preparedViewport ? {viewport:preparedViewport} : {}) }, false);');
  source=source.replaceAll("nodes.every(n=>n.generationStatus==='completed')&&nodes.some(researchMarketDimensions)",
    "nodes.every(n=>n.generationStatus==='completed')");
  source=source.replace('researchWorkspace.setViewport(researchWorkbenchViewport(nodes, researchWorkspaceSnapshot2.viewport, researchWorkspaceSnapshot2.canvasSize));',
    'researchWorkspace.setViewport(researchWorkbenchViewport(nodes, researchWorkspaceSnapshot2.viewport, researchCanvasVisibleArea(researchWorkspaceSnapshot2)));');
  source=source.replace('researchWorkspace.setViewport(researchWorkbenchViewport(nodes, researchWorkspaceSnapshot2.viewport, researchCanvasVisibleArea(researchWorkspaceSnapshot2)));',
    'researchWorkspace.setViewport(researchWorkbenchViewport(nodes, researchWorkspaceSnapshot2.viewport, researchCanvasVisibleArea(researchWorkspaceSnapshot2)), true);');
  if(!source.includes('/* ODYSSEY_MARKET_COMPLETION_BOUNDS */')) {
    source=exact(source,'function normalizeResearchCanvasNodeGeometry(node) {',`function normalizeResearchCanvasNodeGeometry(node) {
    /* ODYSSEY_MARKET_COMPLETION_BOUNDS */
    if(node?.kind==='generated-container'&&node.sizeMode!=='manual'&&node.containerSpec&&(researchMarketDimensions(node)||(node.containerSpec.type==='kpi'&&node.containerSpec.items?.length===6&&node.width===896))&&Number.isFinite(node.width)&&node.width>0&&Number.isFinite(node.height)&&node.height>0)return {width:Math.min(RESEARCH_CANVAS_MAX_NODE_SIZE,node.width),height:Math.min(RESEARCH_CANVAS_MAX_GENERATED_HEIGHT,node.height),sizeMode:'auto',resizable:true};`);
  }
  if(!source.includes('/* ODYSSEY_MARKET_INTRINSIC_BOUNDS */'))source=exact(source,'function researchHtmlAutoGeometry(node, dimensions) {',`function researchHtmlAutoGeometry(node, dimensions) {
    /* ODYSSEY_MARKET_INTRINSIC_BOUNDS */
    if(researchMarketDimensions(node))return null;`);
  if(!source.includes('/* ODYSSEY_NEW_NODES_FRONT */')) {
    source=exact(source,'const publish = (next, persist = false) => {',`const publish = (next, persist = false, preserveStack = false) => {
      /* ODYSSEY_NEW_NODES_FRONT */
      if(persist && !preserveStack) {
        const known=new Set([...snapshot.files,...snapshot.artifacts].map(n=>n.id));
        for(const node of [...next.files,...next.artifacts]) {
          if(known.has(node.id)) continue;
          const raised=researchCanvasRaisedNodes(next.files,next.artifacts,node.id);
          if(raised) next={...next,...raised};
        }
      }`);
    source=source.replace('publish({ ...snapshot, files: entry.files, artifacts: artifacts2, selection: entry.selection }, true);','publish({ ...snapshot, files: entry.files, artifacts: artifacts2, selection: entry.selection }, true, true);');
  }
  if (!source.includes('/* ODYSSEY_CLIPBOARD_NODES_FRONT */')) {
    source=exact(source,'const next = { ...snapshot, files: nextFiles, artifacts: nextArtifacts, selection };',`let next = { ...snapshot, files: nextFiles, artifacts: nextArtifacts, selection };
      /* ODYSSEY_CLIPBOARD_NODES_FRONT */
      // Clipboard commits save atomically before publishing without persistence.
      // Assign the layer before saving so reloads and collaborators keep it.
      for (const id of selection.selectedNodeIds) {
        const raised = researchCanvasRaisedNodes(next.files, next.artifacts, id);
        if (raised) next = { ...next, ...raised };
      }`);
  }
  return patchResearchNativeInteractivity(patchCreationAfterCanvasUse(patchResearchComponentHeaderNote(patchGenerationLifecycle(patchResearchOfficeResize(patchResearchWorkbenchGrowth(patchFigmaCanvasArrangeMotion(patchFigmaCanvasContent(source))))))));
}
function patchResearchNativeInteractivity(source) {
  return replaceResearchContainerTable(source);
}
function replaceResearchContainerTable(source) {
  const body=source.indexOf('function ResearchContainerBody(');
  const start=source.indexOf('if (spec.type === "table") return',body);
  const end=source.indexOf('if (spec.type === "kpi")',start);
  if(body<0||start<body||end<start)throw Error('Native research table renderer missing');
  return source.slice(0,start)+'if (spec.type === "table") return (0, react_jsx_runtime.jsx)(ResearchInteractiveTable, { spec });\n\t\t\t'+source.slice(end);
}
function patchFigmaCanvasContent(source) {
  source=patchCanvasGraphicPrimitives(source);
  source=source.replaceAll('const availableWidth=bounds.width;', 'const availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);');
  if(!source.includes('function researchCanvasUnobscuredWidth('))
    source=exact(source,'function researchCanvasDotMetrics(',researchCanvasUnobscuredWidth.toString().replace('export ','')+'\nfunction researchCanvasDotMetrics(');
  // Empty creation cards use a compact 400 × 280 editor; completed content chooses its own size.
  source=source.replace('containerPrompt: "", containerSizePreset: "medium"', 'containerPrompt: "", containerSizePreset: "small"');
  source=source.replace('kind === "generated-container" ? { width: 320, height: 220 }', 'kind === "generated-container" ? { width: 400, height: 280 }');
  source=source.replace('kind === "generated-container" ? { width: 656, height: 220 }', 'kind === "generated-container" ? { width: 400, height: 280 }');
  // JSON table values commonly arrive as formatted strings. Preserve their
  // text while aligning entire numeric columns, including their headings.
  const tableColumnSource=`function researchTableNumericColumn(spec,index){
    if(/日期|时间|名称|代码|编号|date|time|name|code|\\bid\\b/i.test(String(spec.columns[index])))return false;
    const values=spec.rows.map(row=>row[index]).filter(value=>value!==null&&value!==undefined&&!['','—','--'].includes(String(value).trim()));
    return values.length>0&&values.every(value=>typeof value==='number'||/^[+−-]?\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:%|‰|亿|万|元|点|倍|px)?$/.test(String(value).replace(/\\s/g,'')));
  }\n`;
  const tableSource=tableColumnSource+ResearchInteractiveTable.toString()+'\n';
  if(source.includes('function researchTableNumericColumn('))source=block(source,'function researchTableNumericColumn(', 'function ResearchContainerContent(',tableSource.trimEnd());
  else source=exact(source,'function ResearchContainerContent(',tableSource+'function ResearchContainerContent(');
  source=replaceResearchContainerTable(source);
  source=source.replace('"strong", { children: String(item.value) }', '"strong", { "data-research-metric-positive": /涨跌|增长|变化|收益率|回报|change|growth|return/i.test(item.label) && /^\\+\\s*\\d/.test(String(item.value).trim()) || void 0, children: String(item.value) }');
  source=source.replaceAll('"aria-label": "更多", "aria-haspopup": "menu"', '"aria-label": "更多操作", "aria-haspopup": "menu"');
  source=source.replace('title: expanded ? "关闭放大阅读" : "放大阅读", ', '');
  for(const [icon,key] of [['IconBranchOutline16','branch'],['IconChevronDownOutline14','chevron'],['IconListPenOutline16','summary']]) {
    const old='(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.'+icon+', { size: '+(key==='chevron'?14:16)+' })';
    const start=source.indexOf('\"aria-label\": \"选中组件操作\"');
    if(start>=0){const end=source.indexOf('createSelection === null ? null',start);const section=source.slice(start,end).replace(old, "(0,react_jsx_runtime.jsx)('img',{src:"+JSON.stringify(iconData[key])+",width:"+(key==='chevron'?10:14)+",height:"+(key==='chevron'?10:14)+",alt:'','aria-hidden':true,className:'odyssey-canvas-icon'})");source=source.slice(0,start)+section+source.slice(end);}
  }

  source=source.replace('children: [(0, react_jsx_runtime.jsx)("strong", { children: option.label }), (0, react_jsx_runtime.jsx)("span", { children: option.description })]', `children: [(0, react_jsx_runtime.jsx)("strong", { children: option.label }), (0, react_jsx_runtime.jsx)("span", { children: option.description }),option.value==='standard'?(0,react_jsx_runtime.jsx)('img',{src:${JSON.stringify(iconData.check)},width:16,height:16,alt:'',className:'odyssey-detail-check'}):null]`);
  source=source.replace('children: "···"', "children:(0,react_jsx_runtime.jsx)('img',{src:"+JSON.stringify(iconData.more)+",width:13,height:13,alt:'',className:'odyssey-canvas-icon'})");
  source=source.replace(' || growths >= 3 || Date.now() - startedAt > 8000 || current.node?.sizeMode === "manual" || current.node?.containerSpec?.html !== spec.html', ' || current.node?.containerSpec?.html !== spec.html');
  source=source.replace("card?.toggleAttribute('data-research-content-overflow', dimensions.width>656 || dimensions.height>456);", "card?.toggleAttribute('data-research-content-overflow', dimensions.width>(current.node?.sizeMode==='manual'?current.node.width:656) || dimensions.height>(current.node?.sizeMode==='manual'?current.node.height:456));\n                    if(current.node?.sizeMode==='manual'||growths>=3||Date.now()-startedAt>8000)return;");
  source=block(source,'function ResearchContainerChart({ spec }) {',
    'function readResearchComponentTheme(',ResearchContainerChart.toString());
  source=source.replace(/const RESEARCH_CANVAS_GRID_SIZE = [\d.]+;/, 'const RESEARCH_CANVAS_GRID_SIZE = 13.71;');
  source=source.replace('backgroundPosition: `${viewport.x - gridSize / 2 + 1}px ${viewport.y - gridSize / 2 + 1}px`', 'backgroundPosition: `${viewport.x + 12.5499 * viewport.scale}px ${viewport.y + 7.6871 * viewport.scale}px`');
  source=source.replace('"data-research-global-toolbar": "",\n', '"data-research-global-toolbar": "", style:{left:(snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width)/2},\n');
  source=source.replace('"data-research-empty-viewport": "",\n', '"data-research-empty-viewport": "", style:{left:(snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width)/2,maxWidth:Math.max(0,(snapshot.canvasSize.availableWidth ?? snapshot.canvasSize.width)-24)},\n');
  source=source.replace('right: (canvasSize.width - 12 - x) / scale, top: (12 - y) / scale, bottom: (canvasSize.height - 12 - y) / scale', 'right: (researchCanvasVisibleArea(context).width - 32 - x) / scale, top: (32 - y) / scale, bottom: (researchCanvasVisibleArea(context).height - 32 - y) / scale');
  source=source.replace('const interactivePreview = event.target?.closest?.("[data-research-selection-actions],[data-research-create-popover]")', 'const interactivePreview = event.target?.closest?.("[data-research-selection-actions],[data-research-create-popover],[data-research-voice-feedback],[data-research-global-toolbar]")');
  // Selected embedded pages own pointer and wheel input; unselected pages still select the card.
  const selectedPreview=' || (selected && event.target?.closest?.("[data-research-preview-interactive]"))';
  const menuPreview=' || event.target?.closest?.("[role=menu],textarea,[contenteditable=true]")';
  while(source.includes(selectedPreview+selectedPreview))source=source.replace(selectedPreview+selectedPreview,selectedPreview);
  if(!source.includes(selectedPreview+menuPreview))source=source.replace(menuPreview,selectedPreview+menuPreview);
  source=source.replace('.rScV5Q_richNode:not([open])>.rScV5Q_previewBody:has(iframe)>.rScV5Q_previewShield{pointer-events:auto}', '.rScV5Q_richNode:not([data-selected=true]):not([open])>.rScV5Q_previewBody:has(iframe)>.rScV5Q_previewShield{pointer-events:auto}');
  source=source.replace('workspace.setCanvasSize({ width: bounds.width, height: bounds.height });', `const panel=root.ownerDocument.querySelector('.t8lSSG_panel:has([data-research-active=true])');
                    const panelBounds=panel?.getBoundingClientRect();
                    const availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);
                    const visibleHeight=Math.max(0,Math.min(bounds.height,(root.ownerDocument.defaultView?.innerHeight??bounds.bottom)-bounds.top));
                    workspace.setCanvasSize({ width: bounds.width, height: bounds.height, visibleHeight, availableWidth });`);
  // One viewport contract is used by the floating toolbar, drafts, and automatic growth.
  source=block(source,source.includes('function researchCanvasVisibleArea(')?'function researchCanvasVisibleArea(':'function researchCanvasViewportPlacement(', 'function researchCanvasGeneratedPlacement(', placementSource);
  source=source.replace('function researchGenerationSizedNode(node, geometry) {','function researchGenerationSizedNode(node, geometry, snapshot = null) {');
  source=source.replaceAll('researchGenerationSizedNode(next, geometry);','researchGenerationSizedNode(next, geometry, snapshot);');
  source=source.replace('researchGenerationSizedNode(node, geometry) :','researchGenerationSizedNode(node, geometry, snapshot) :');
  source=source.replace('researchCanvasContainedAutoNode(snapshot,{...current,containerSizePreset:researchContainerPromptPreset(prompt),...RESEARCH_BENTO_SIZES[researchContainerPromptPreset(prompt)]})','researchContainerPlannedGeometry(snapshot,current,prompt)');
  source=source.replace('const update = (patch, persist) => publish({ ...snapshot, ...patch }, persist);', 'const update = (patch, persist) => publish({ ...snapshot, ...researchCanvasFitAutomaticUpdate(snapshot,patch) }, persist);');
  source=block(source,'function researchCanvasGeneratedPlacement(', 'function researchCanvasRaisedNodes(',generatedPlacementSource);
  source=block(source,'function researchGenerationAutoGeometry(', 'function researchGenerationFinalGeometry(',`function researchGenerationAutoGeometry(node) {
    if(node?.sizeMode==='manual'||node?.workbenchId||node?.containerSizePreset)return null;
    const {width,height}=RESEARCH_BENTO_SIZES[researchBentoSize(node)];return {width,height};
  }`);
  source=block(source,'function researchGenerationSizedNode(', 'function researchGenerationAutoGeometry(',`function researchGenerationSizedNode(node, geometry, snapshot = null) {
    if(geometry===null||node.workbenchId)return node;
    const next={...node,...geometry};
    if(node.sizeMode!=='manual'&&['generated-container','generated-summary','generated-mind-map','pasted-text','assistant-result'].includes(node.kind)){
      const dimensions=researchOptimalDimensions(next);
      next.width=dimensions.width;next.height=dimensions.height;
      next.containerSizePreset=researchBentoSize(next,dimensions);
    }
    if(node.sizeMode!=='manual'&&(['generated-container','generated-summary','generated-mind-map','pasted-text','assistant-result'].includes(node.kind)||node.creationMode==='selection')){
      const before=normalizeResearchCanvasNodeGeometry(node),after=normalizeResearchCanvasNodeGeometry(next);
      next.x=node.x+(after.width-before.width)/2;next.y=node.y+(after.height-before.height)/2;
    }
    return researchCanvasContainedAutoNode(snapshot,next);
  }`);
  source=source.replace('...queued, containerSizePreset: researchComponentSize(current), ...(current.containerSpec || current.sizeMode === "manual" ? {} : { width: RESEARCH_BENTO_SIZES[researchComponentSize(current)].width, height: RESEARCH_BENTO_SIZES[researchComponentSize(current)].height }),', '...queued, ...(current.containerSpec || current.sizeMode === "manual" ? {} : researchContainerPlannedGeometry(snapshot,current,prompt)),');
  source=source.replace('...queued, containerSizePreset: researchComponentSize(current), ...(current.containerSpec || current.sizeMode === "manual" ? {} : { width: 720, height: RESEARCH_COMPONENT_SIZES[researchComponentSize(current)] }),', '...queued, ...(current.containerSpec || current.sizeMode === "manual" ? {} : researchContainerPlannedGeometry(snapshot,current,prompt)),');
  source=source.replace('onCancel: onCancelGeneration\n', 'onCancel: onCancelGeneration, onExpand: onExpandGeneration\n');
  source=source.replace('onActivate, onAutoHeight, onWebInspection', 'onActivate, onAutoHeight, onExpandGeneration, onWebInspection');
  // Figma 43 manual dimensions are a user choice, not an automatic preset request.
  // Read the latest node because a resize can finish before this render's callback is replaced.
  source=source.replaceAll('const width=Math.min(current.width,400),height=Math.min(current.height,300);','const width=320,height=220;');
  const expandGeneration = 'onExpandGeneration:(requestedSize="large")=>{const current=workspace.getSnapshot().artifacts.find(current=>current.id===node.id);if(!current||current.sizeMode==="manual")return;if(requestedSize==="loading"){if(current.containerSpec)return;const width=320,height=220;if(width!==current.width||height!==current.height)workspace.updateNodeGeometry(current.id,{width,height,sizeMode:"auto"});return;}const height=requestedSize==="medium"?220:456;if(height===220&&(current.width>320||current.height>220))return;if(current.height!==height||current.width!==656)workspace.updateNodeGeometry(current.id,{width:656,height,sizeMode:"auto"});},';
  source=source.replace('const width=280,height=200;if(width!==current.width||height!==current.height)', 'const width=320,height=220;if(width!==current.width||height!==current.height)');
  source=source.replace('if(!current||current.sizeMode==="manual")return;const height=requestedSize==="medium"?220:456;','if(!current||current.sizeMode==="manual")return;if(requestedSize==="loading"){if(current.containerSpec)return;const width=320,height=220;if(width!==current.width||height!==current.height)workspace.updateNodeGeometry(current.id,{width,height,sizeMode:"auto"});return;}const height=requestedSize==="medium"?220:456;');
  if (!source.includes(expandGeneration)) {
    const oldExpand = [
      'onExpandGeneration:()=>{const current=workspace.getSnapshot().artifacts.find(current=>current.id===node.id);if(current&&current.sizeMode!=="manual"&&(current.height!==456||current.width!==656))workspace.updateNodeGeometry(current.id,{width:656,height:456,sizeMode:"auto"});},',
      'onExpandGeneration:()=>{if(node.height<456)workspace.updateNodeGeometry(node.id,{width:656,height:456,sizeMode:"auto"});},',
      'onExpandGeneration:()=>{if(node.height!==456||node.width!==656)workspace.updateNodeGeometry(node.id,{width:656,height:456,sizeMode:"auto"});},'
    ].find(anchor => source.includes(anchor));
    if (oldExpand) source = exact(source, oldExpand, expandGeneration);
    else if (!source.includes('onExpandGeneration:')) {
      const autoHeight = 'onAutoHeight: (_artifact, height) => workspace.updateNodeGeometry(node.id, { height, sizeMode: "auto" }),';
      source = exact(source, autoHeight, autoHeight + ' ' + expandGeneration);
    } else throw Error('Figma generation expansion callback anchor missing');
  }

  source=source.replace(`}) : node.kind === "pasted-text" || node.kind === "assistant-result" || node.kind === "generated-summary" && node.generationStatus === 'completed' ?`, `}) : node.kind === 'generated-summary'&&node.generationStatus==='completed'?(0,react_jsx_runtime.jsx)(ResearchDerivedSummary,{node,onUpgradeSize:onExpandGeneration}):node.kind === "pasted-text" || node.kind === "assistant-result" ?`);
  source=source.replace('node.kind === "pasted-text" || node.kind === "assistant-result" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {\n\t\t\t\t\t\ttext: node.excerpt,\n\t\t\t\t\t\tstreaming: false\n\t\t\t\t\t})', 'node.kind === "pasted-text" || node.kind === "assistant-result" ? (0,react_jsx_runtime.jsx)(ResearchDerivedSummary,{node,onUpgradeSize:onExpandGeneration})');
  source=source.replace('function ResearchContainerBody({ node, sessionId, visible, onHtmlSize })', 'function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false })');
  source=source.replace('text: spec.content.replace(', 'text: preserveHeading ? spec.content : spec.content.replace(');
  source=block(source,source.includes('function ResearchDerivedSummary(')?'function ResearchDerivedSummary(':'function ResearchMindMap({', 'function researchGenerationPresentation(',derivedSource);
  const sourceMeta = 'node.kind === "generated-container" ? null : (0, react_jsx_runtime.jsxs)("span", {';
  source=source.replaceAll('(ResearchDerivedSources,{node})','(ResearchDerivedSources,{node,readOnly})');
  const linkedMeta = 'node.kind === "generated-container" ? null : ["generated-summary","generated-mind-map"].includes(node.kind)?(node.generationStatus==="completed"?(0,react_jsx_runtime.jsx)(ResearchDerivedSources,{node,readOnly}):null):(0, react_jsx_runtime.jsxs)("span", {';
  source=source.replace('node.kind === "generated-container" ? null : ["generated-summary","generated-mind-map"].includes(node.kind)&&node.generationStatus==="completed"?(0,react_jsx_runtime.jsx)(ResearchDerivedSources,{node,readOnly}):(0, react_jsx_runtime.jsxs)("span", {',linkedMeta);
  if(!source.includes(linkedMeta))source=exact(source,sourceMeta,linkedMeta);
  const artifactStart=source.indexOf('function ResearchCanvasArtifactCard('),artifactEnd=source.indexOf('function nextResearchCanvasViewport(',artifactStart);
  if(artifactStart<0||artifactEnd<artifactStart)throw Error('Figma derived title anchor missing');
  let artifact=source.slice(artifactStart,artifactEnd);
  if(!artifact.includes('"data-research-derived":')){
    artifact=exact(artifact,'"data-research-generation-state": node.generationStatus,','"data-research-generation-state": node.generationStatus, "data-research-derived":researchIsDerivedNode(node)?node.kind:undefined,');
    artifact=exact(artifact,'titleText: node.title,','titleText: researchDerivedTitle(node),');
    artifact=exact(artifact,'}) : node.title,','}) : researchIsDerivedNode(node)?(0,react_jsx_runtime.jsx)(ResearchDerivedHeading,{node}):node.title,');
  }
  if(!artifact.includes('readOnly = sherlockShared(sessionId)')){
    artifact=exact(artifact,'retryDisabled = false })','retryDisabled = false, readOnly = sherlockShared(sessionId) && sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit !== true })');
    artifact=exact(artifact,'onNodeLabelCommit: onMindMapNodeCommit','onNodeLabelCommit: readOnly ? undefined : onMindMapNodeCommit, readOnly');
  }
  source=source.slice(0,artifactStart)+artifact+source.slice(artifactEnd);
  const cardParentStart=source.indexOf(source.includes('/* ODYSSEY_STABLE_CANVAS_CARDS */') ? '(0, react_jsx_runtime.jsx)(ResearchStableArtifactCard, {' : '(0, react_jsx_runtime.jsx)(ResearchCanvasArtifactCard, {',source.indexOf('const selectionToolbarRef')),cardParentEnd=source.indexOf('}, node.id))',cardParentStart);
  if(cardParentStart<0||cardParentEnd<cardParentStart)throw Error('Figma readonly card parent anchor missing');
  let cardParent=source.slice(cardParentStart,cardParentEnd);
  if(!cardParent.includes('readOnly: sharedReadOnly'))cardParent=exact(cardParent,'sessionId,','sessionId, readOnly: sharedReadOnly,');
  source=source.slice(0,cardParentStart)+cardParent+source.slice(cardParentEnd);
  const sourceTitles = '(node.generationSources ?? []).map((source) => source.title).join("、")';
  const linkedTitles = '(0,react_jsx_runtime.jsx)(ResearchDerivedSources,{node,embedded:true})';
  if(!source.includes(linkedTitles))source=exact(source,sourceTitles,linkedTitles);
  // A reference jump keeps the user's zoom and centers in the unobscured area.
  const focusStart=source.indexOf('function researchCanvasFocusViewport('),focusEnd=source.indexOf('function researchWorkbenchViewport(',focusStart);
  if(focusStart<0||focusEnd<focusStart)throw Error('Figma source focus anchor missing');
  let focus=source.slice(focusStart,focusEnd);
  focus=focus.replace('canvasSize.width : 0;', 'Math.min(canvasSize.width,canvasSize.availableWidth>0?canvasSize.availableWidth:canvasSize.width) : 0;');
  source=source.slice(0,focusStart)+focus+source.slice(focusEnd);

  const displayStart=source.indexOf('function ResearchMindMapDisplayNode('),displayEnd=source.indexOf('function ResearchMindMapBranches(',displayStart);
  if(displayStart>=0&&displayEnd>displayStart){const display=source.slice(displayStart,displayEnd).replace('children: node.label', 'children: node.displayLabel ?? node.label');source=source.slice(0,displayStart)+display+source.slice(displayEnd);}
  source=source.replace('observer?.observe(root);\n\t\t\t\twindow.addEventListener("resize", scheduleSync);', 'observer?.observe(root);\n                for(const panel of document.querySelectorAll(".t8lSSG_panel"))observer?.observe(panel);\n\t\t\t\twindow.addEventListener("resize", scheduleSync);');
  if(!source.includes('let resizeSettleTimer=null;'))source=block(source,'const syncSize = () => {','const cancelScheduledSync = () => {', `let resizeSettleTimer=null;
                const syncSize = () => {
                    if(!active)return;
                    // The canvas fills its CSS track during a native window resize.
                    // Rebuilding every card on each intermediate size blocks the resize compositor.
                    if(document.documentElement.hasAttribute('data-odyssey-window-resizing')){
                      if(resizeSettleTimer!==null)window.clearTimeout(resizeSettleTimer);
                      resizeSettleTimer=window.setTimeout(()=>{resizeSettleTimer=null;syncSize();},150);
                      return;
                    }
                    const bounds=root.getBoundingClientRect();
                    const panel=root.ownerDocument.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)'),panelBounds=panel?.getBoundingClientRect();
                    const availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);
                    if(panel!==observedPanel){if(observedPanel)observer?.unobserve(observedPanel);if(panel)observer?.observe(panel);observedPanel=panel;}
                    const current=workspace.getSnapshot(),previous=current.canvasSize;
                    const visibleHeight=Math.max(0,Math.min(bounds.height,(root.ownerDocument.defaultView?.innerHeight??bounds.bottom)-bounds.top));
                    if(previous.width!==bounds.width||previous.height!==bounds.height||previous.visibleHeight!==visibleHeight||previous.availableWidth!==availableWidth){
                      const next={width:bounds.width,height:bounds.height,visibleHeight,availableWidth};
                      const viewport=researchCanvasViewportForAreaChange(current,next);
                      workspace.setCanvasSize(next);
                      if(viewport!==current.viewport)workspace.setViewport(viewport);
                    }
                    publishRegion(bounds,document.visibilityState!=="hidden");
                    // Transforms do not trigger ResizeObserver. Follow the visible panel
                    // through CSS motion, including a reversal, and sample its settled edge.
                    if(document.visibilityState!=="hidden"&&panel?.getAnimations?.().some(animation=>animation.playState==='running'))scheduleSync();
                };
                `);
  // Existing packaged clients already contain the resize compositor patch
  // above. Upgrade that path as well so visibleHeight reaches the workspace.
  if(!source.includes('previous.visibleHeight!==visibleHeight'))source=exact(source,
    'if(previous.width!==bounds.width||previous.height!==bounds.height||previous.availableWidth!==availableWidth){\n                      const next={width:bounds.width,height:bounds.height,availableWidth};',
    'const visibleHeight=Math.max(0,Math.min(bounds.height,(root.ownerDocument.defaultView?.innerHeight??bounds.bottom)-bounds.top));\n                    if(previous.width!==bounds.width||previous.height!==bounds.height||previous.visibleHeight!==visibleHeight||previous.availableWidth!==availableWidth){\n                      const next={width:bounds.width,height:bounds.height,visibleHeight,availableWidth};');
  source=source.replace('syncSize();\n\t\t\t\tconst observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);', 'let observedPanel=null;\n                const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);\n                syncSize();');
  // Upgrade already patched clients too; streamed descendants do not resize the panel.
  source=source.replace("record.target?.closest?.('.t8lSSG_panel')", "record.target?.matches?.('.t8lSSG_panel')").replace("||node.closest?.('.t8lSSG_panel')", '');
  source=source.replace('for(const panel of document.querySelectorAll(".t8lSSG_panel"))observer?.observe(panel);', `const panelMutations=typeof MutationObserver==='undefined'?null:new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'?record.target?.matches?.('.t8lSSG_panel'):[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches?.('.t8lSSG_panel')||node.querySelector?.('.t8lSSG_panel')))))scheduleSync();});
                if(document.body)panelMutations?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-research-active','class','style']});
                const onPanelMotion=event=>{if(event.target?.matches?.('.t8lSSG_panel'))scheduleSync();};
                for(const type of ['transitionrun','transitionend','transitioncancel','animationend','animationcancel'])document.addEventListener(type,onPanelMotion,true);`);
  source=source.replace('observer?.disconnect();\n\t\t\t\t\twindow.removeEventListener("resize", scheduleSync);','if(resizeSettleTimer!==null)window.clearTimeout(resizeSettleTimer);observer?.disconnect();panelMutations?.disconnect();for(const type of ["transitionrun","transitionend","transitioncancel","animationend","animationcancel"])document.removeEventListener(type,onPanelMotion,true);\n\t\t\t\t\twindow.removeEventListener("resize", scheduleSync);');
  source=source.replace("(0,react_jsx_runtime.jsxs)('details',{children:", "(0,react_jsx_runtime.jsxs)('details',{onToggle:event=>{const details=event.currentTarget,card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open){details.open=false;card?.querySelector('[data-research-container-expand]')?.click();card?.ownerDocument.defaultView?.requestAnimationFrame(()=>{if(card.open)details.open=true;});}},children:");
  source=source.replaceAll("card=details.closest('[data-research-compact-chrome]');if(details.open&&!card?.open)","card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open)");
  source=source.replace('function ResearchGeneratedContainer({ node, sessionId, visible, onGenerate, onHtmlSize, editingPrompt', 'function ResearchGeneratedContainer({ node, sessionId, visible, onGenerate, onHtmlSize, onUpgradeSize, editingPrompt');
  source=source.replace('jsx)(ResearchContainerContent, { node, sessionId, visible, onHtmlSize })', 'jsx)(ResearchContainerContent, { node, sessionId, visible, onHtmlSize, onUpgradeSize })');
  source=source.replace('onGenerate: onSubmitContainer,\n', 'onGenerate: onSubmitContainer, onUpgradeSize:onExpandGeneration,\n');
  source=source.replace('children: spec.items.map((item, index) => (0, react_jsx_runtime.jsxs)("div", { children:', 'children: spec.items.map((item, index) => (0, react_jsx_runtime.jsxs)("div", { style:{gridColumn:item.fullWidth?"1 / -1":undefined}, children:');
  source=source.replace('const usableHeight = Math.max(100, canvasSize.height - 180);','const usableHeight = Math.max(100, canvasSize.height); const availableWidth=canvasSize.availableWidth>0?Math.min(canvasSize.width,canvasSize.availableWidth):canvasSize.width;');
  source=source.replace('Math.max(1, canvasSize.width - 64) / (right - left)', 'Math.max(1, availableWidth - 64) / (right - left)');
  source=source.replace('return { scale, x: canvasSize.width / 2 - (left + right) / 2 * scale, y: usableHeight / 2', 'return { scale, x: availableWidth / 2 - (left + right) / 2 * scale, y: usableHeight / 2');
  for(const name of ['researchCanvasHasVisibleNodes','researchCanvasReturnViewport']) {
    const start=source.indexOf('function '+name+'('),end=source.indexOf('\n\t\tfunction ',start+1);
    if(start<0||end<0)throw Error('Visible canvas function missing: '+name);
    const part=source.slice(start,end).replace('canvasSize.width : 0;', 'Math.min(canvasSize.width,canvasSize.availableWidth>0?canvasSize.availableWidth:canvasSize.width) : 0;');
    source=source.slice(0,start)+part+source.slice(end);
  }
  source=source.replace('workspace.organizeCanvas(researchCanvasMeasureForArrange(rootRef.current, canvasNodes));', 'if(workspace.organizeCanvas(researchCanvasMeasureForArrange(rootRef.current, canvasNodes)))setClipboardFeedback({state:"success",kind:"arrange",message:"已整理 "+canvasNodes.length+" 个组件"});');
  source=source.replace('const update = (patch, persist) => publish({ ...snapshot, ...researchCanvasFitAutomaticUpdate(snapshot,patch) }, persist);',
    `const update = (patch, persist) => { const {__odysseyArrange,...safePatch}=patch;return publish({ ...snapshot, ...(__odysseyArrange?safePatch:researchCanvasFitAutomaticUpdate(snapshot,safePatch)),...(__odysseyArrange?{__odysseyArrange:true}:{}) }, persist); };`);
  source=source.replace('const changedGroups = new Set(next.artifacts.filter(n => n.workbenchId && !n.containerSizePreset',
    'const changedGroups = new Set((next.__odysseyArrange?[]:next.artifacts).filter(n => n.workbenchId && !n.containerSizePreset');
  source=source.replace('commitUpdate(organized, true);','commitUpdate({...organized,__odysseyArrange:true}, true);');
  source=source.replace('...cached.dimensions, sizeMode: "manual"', '...cached.dimensions, intrinsic: true, sizeMode: "manual"');
  source=source.replace('"data-research-clipboard-feedback": "", "data-state": clipboardFeedback.state,', '"data-research-clipboard-feedback": "", "data-research-arrange-feedback":clipboardFeedback.kind==="arrange"?"":undefined, "data-state": clipboardFeedback.state,');
  source=source.replace("pointerEvents: 'none' }, children: clipboardFeedback.message", `pointerEvents: 'none' }, children: clipboardFeedback.kind==='arrange'?(0,react_jsx_runtime.jsxs)('span',{className:'odyssey-arrange-toast',children:[(0,react_jsx_runtime.jsx)('img',{src:${JSON.stringify(iconData.check)},width:16,height:16,alt:''}),clipboardFeedback.message]}):clipboardFeedback.message`);
  source=block(source,'function researchCanvasMeasureForArrange(',source.includes('/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */')?'const RESEARCH_BENTO_SIZES':'function researchCanvasOrganizedLayout(',`function researchCanvasMeasureForArrange(root,nodes) {
    const measured=new Map();
    if(!root)return measured;
    for(const node of nodes){
      if(node.kind!=='generated-container'||node.generationStatus!=='completed'||researchMarketDimensions(node,true))continue;
      const card=Array.from(root.querySelectorAll('[data-research-artifact-card]')).find(el=>el.getAttribute('data-research-artifact-card')===node.id);
      const content=card?.querySelector('.rScV5Q_containerContent,[data-research-artifact-content]');
      if(!content||content.querySelector('iframe')||node.containerSpec?.type==='chart')continue;
      const width=researchOptimalDimensions(node).width,original=content.getAttribute('style'),beforeHeight=content.clientHeight;
      try{
        content.style.width=(width-2)+'px';content.style.height='auto';content.style.minHeight='0';content.style.maxHeight='none';
        const natural=Math.max(content.scrollHeight,content.firstElementChild?.scrollHeight||0);
        if(natural>0&&Math.abs(natural-beforeHeight)>8)measured.set(node.id,{width,height:Math.max(220,Math.ceil(natural+RESEARCH_CANVAS_TITLE_HEIGHT+2)),intrinsic:true});
      }finally{if(original===null)content.removeAttribute('style');else content.setAttribute('style',original);}
    }
    return measured;
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
    source=block(source,'function researchCanvasOrganizedLayout(', 'function researchCanvasVisibleArea(',organizedLayoutSource);
    source=block(source,'function ResearchGenerationProcess(', 'function isResearchWechatArticleUrl(',generationSource);
    source=block(source,'function ResearchContainerContent(props) {', 'function ResearchContainerBody(',responsiveSource);
    const marker=source.indexOf('/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */');
    const start=source.indexOf("if(typeof document",marker),end=source.indexOf('\n',start);
    if(start<0||end<0)throw Error('Figma canvas stylesheet missing');
    return patchFigmaDerivedMenu(capDerivedNodes(source.slice(0,start)+canvasStyleInstaller()+source.slice(end)));
  }
  source=exact(source,'assistant: Object.freeze({ width: 520, height: 300, minWidth: 360, minHeight: 120, resizable: true })','assistant: Object.freeze({ width: 320, height: 220, minWidth: 320, minHeight: 220, resizable: true })');
  source = exact(source, 'const RESEARCH_CANVAS_ORGANIZE_PADDING = 48;', 'const RESEARCH_CANVAS_ORGANIZE_PADDING = 32;')
  source = exact(source, 'const RESEARCH_CANVAS_ORGANIZE_NODE_GAP = 32;', 'const RESEARCH_CANVAS_ORGANIZE_NODE_GAP = 16;')
  source = block(source, 'function researchCanvasOrganizedLayout(', 'function researchCanvasVisibleArea(', `${bentoSource}
${organizedLayoutSource}`)
  source = block(source, 'const RESEARCH_COMPONENT_SIZES =', 'function researchCanvasReflowGrowth(', `const RESEARCH_COMPONENT_SIZES = { small:220, medium:220, large:456 };
function researchComponentSize(node) { return researchBentoSize(node); }
${componentPromptSource}
function researchAlignComponentPresets(artifacts, top = 32, canvasSize) {
  const packed=researchBentoLayout(artifacts.filter(n=>n.kind==='generated-container'),canvasSize);
  const replacements=new Map(packed.nodes.map(n=>[n.id,{...n,x:n.x+n.width/2,y:top+n.y+n.height/2,sizeMode:'auto'}]));
  return artifacts.map(n=>replacements.get(n.id)??n);
}`)
  source = block(source, '                    // Normalize component row sizes first,', '\n\t\t\t\t\tcommitUpdate({...organized,__odysseyArrange:true}, true);', `                    const organized = researchCanvasOrganizedLayout(snapshot.files, snapshot.artifacts, snapshot.canvasSize, measured);
                    if (organized === null) return false;`)
  source = source.replaceAll('width: 720, height: RESEARCH_COMPONENT_SIZES[researchComponentSize(current)]', 'width: RESEARCH_BENTO_SIZES[researchComponentSize(current)].width, height: RESEARCH_BENTO_SIZES[researchComponentSize(current)].height')
  source = source.replace('kind === "generated-container" ? { width: 520, height: 300 }', 'kind === "generated-container" ? { width: 400, height: 280 }')
  source = source.replace('const width = 520;\n\t\t\tconst height = 300;', 'const width = kind === "summary" ? 320 : 656;\n\t\t\tconst height = kind === "summary" ? 220 : 456;')
  source = block(source, 'function researchContainerFinalGeometry(', 'function researchContainerRefreshDue(', `function researchContainerFinalGeometry(node, spec) {
  if(node?.sizeMode==='manual'||spec===null)return null;
  const {width,height}=researchOptimalDimensions({...node,containerSpec:spec});
  return {width,height};
}`)
  source = block(source, 'function researchGenerationFinalGeometry(', 'function researchContainerFinalGeometry(', `function researchGenerationFinalGeometry(node,text) {
  if(node?.sizeMode==='manual')return null;
  if(node.kind==='generated-mind-map')return {width:656,height:456};
  const {width,height}=researchOptimalDimensions({...node,content:text});return {width,height};
}`)
  // Completed HTML may exceed the preset when its actual content needs room.
  source = exact(source, 'if (node.sizeMode === "manual" || node.kind === "web-link" || node.kind === "generated-container" && node.containerSpec?.type === "html"', 'if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link" || node.kind === "generated-container" && node.containerSpec?.type === "html"')
  source = exact(source, 'const width = Math.max(before.width, dimensions.width);\n\t\t\tconst height = Math.min(RESEARCH_CANVAS_MAX_AUTO_HEIGHT, Math.max(before.height, dimensions.height));', `const width = Math.max(320,dimensions.width);
            const height = Math.max(220,dimensions.height);`)
  source = exact(source, 'if (researchHtmlAutoGeometry(current.node, dimensions) === null) return;', `card?.toggleAttribute('data-research-content-overflow', dimensions.width>(current.node?.sizeMode==='manual'?current.node.width:656) || dimensions.height>(current.node?.sizeMode==='manual'?current.node.height:456));
                    if(current.node?.sizeMode==='manual'||growths>=3||Date.now()-startedAt>8000)return;
                    if (researchHtmlAutoGeometry(current.node, dimensions) === null) return;`)
  source = block(source, 'function ResearchGenerationProcess(', 'function isResearchWechatArticleUrl(', generationSource)
  source = block(source, 'function ResearchContainerContent(props) {', 'function ResearchContainerBody(', responsiveSource)
  for(const [before,after] of [['不超过 3 层，高度概括','保留核心主题'],['平衡阅读效率与内容理解','覆盖重点与主要关系'],['充分展开内容关系细节','展开细节与依据']])source=exact(source, before, after)
  source=exact(source, 'onKeyDown: (event) => { event.stopPropagation(); if (event.key === \'Escape\') closeSelectedCreate(); },', `onKeyDown: (event) => { event.stopPropagation(); if(event.key==='Escape')closeSelectedCreate(); if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(!createPreparing&&createPrompt.trim())void startSelectedCreate();} },`)
  source=exact(source, "children: [\n\t\t\t\t\t(0, react_jsx_runtime.jsx)('textarea', { ref: createInputRef", `children: [
                    (0,react_jsx_runtime.jsxs)('div',{className:'odyssey-create-heading',children:[(0,react_jsx_runtime.jsx)('strong',{children:'基于所选创建'}),(0,react_jsx_runtime.jsx)('button',{type:'button',onClick:closeSelectedCreate,children:'Esc 关闭'})]}),
                    (0,react_jsx_runtime.jsx)('p',{className:'odyssey-create-count',children:'已选择 '+createSelection.ids.length+' 个组件'}),
                    (0, react_jsx_runtime.jsx)('textarea', { ref: createInputRef`)
  source=exact(source, "className: 'rScV5Q_containerDraftFooter', style: { display: 'flex', justifyContent: 'flex-end', marginTop: 10 }, children: (0, react_jsx_runtime.jsx)('button', { type: 'button', 'data-research-create-submit'", "className: 'rScV5Q_containerDraftFooter', style: { display: 'flex', justifyContent: 'flex-end', marginTop: 10 }, children: (0, react_jsx_runtime.jsx)('button', { type: 'button', title:'⌘ Enter 创建', 'data-research-create-submit'")
  source=exact(source, `children: [(0, react_jsx_runtime.jsx)("span", { children: node.generationError ?? '生成失败，请重试。' }),`, `children: [(0,react_jsx_runtime.jsx)('strong',{children:node.generationStatus==='failed'?'暂时未能完成生成':'已停止生成'}),(0,react_jsx_runtime.jsx)('span',{children:node.generationStatus==='failed'?'未获取到有效内容，已保留你的生成要求。':'已保留需求与已获取的信息，可以重新生成。'}),(0,react_jsx_runtime.jsxs)('details',{onToggle:event=>{const details=event.currentTarget,card=details.closest('[data-research-compact-chrome]');if(details.open)card?.addEventListener('close',()=>{details.open=false;},{once:true});if(details.open&&!card?.open){details.open=false;card?.querySelector('[data-research-container-expand]')?.click();card?.ownerDocument.defaultView?.requestAnimationFrame(()=>{if(card.open)details.open=true;});}},children:[(0,react_jsx_runtime.jsx)('summary',{children:node.generationStatus==='failed'?'查看失败详情':'查看已有过程'}),(0,react_jsx_runtime.jsx)('p',{children:node.generationError||researchGenerationLog(node).slice(-3).map(row=>row.text).join('；')})]}),`)
  source=source.replace(' ? "应用结果" : "重试"]', ' ? "应用结果" : "重新生成"]')
  return patchFigmaDerivedMenu(capDerivedNodes(source)+`\n/* SHERLOCK_FIGMA_CANVAS_FINAL_20260910 */\n${canvasStyleInstaller()}\n`)
}

function capDerivedNodes(source) {
  source=source.replace("['generated-summary','generated-mind-map'].includes(node.kind)){if", "['generated-summary','generated-mind-map','pasted-text','assistant-result'].includes(node.kind)){if");
  if(source.includes("includes(node.kind)){if(node.height>456||node.width>656)onAutoHeight"))return source;
  source=source.replace('if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link"', `if(node.sizeMode!=='manual'&&['generated-summary','generated-mind-map','pasted-text','assistant-result'].includes(node.kind)){if(node.height>456||node.width>656)onAutoHeight?.(node,Math.min(456,node.height));return;}
                if (node.sizeMode === "manual" || node.kind === "generated-container" || node.kind === "web-link"`);
  return source;
}
// Plugin CSS and compact chrome are loaded after the client module. Keep the final
// design override last for those two sources, including lazy loading and reloads.
function canvasStyleInstaller() {
  return `if(typeof document!=='undefined'){const style=document.createElement('style');style.dataset.sherlockFigmaCanvas='';style.textContent=${JSON.stringify(canvasCss)};document.head.appendChild(style);const Observer=document.defaultView?.MutationObserver;if(Observer){const observer=new Observer(records=>{if(!style.isConnected){observer.disconnect();return;}if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&node.matches?.('style[data-research-compact-style],style[data-plugin-css="@deepseek-ai/dsh-client-ui-conversation/ResearchCanvas.module.css"]')&&(style.compareDocumentPosition(node)&4))))document.head.appendChild(style);});observer.observe(document.head,{childList:true});}}`;
}
const organizedLayoutSource = `function researchCanvasOrganizedLayout(files, artifacts, canvasSize, measured = new Map()) {
  const nodes = [...files, ...artifacts].filter(n => typeof n?.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y));
  if (!nodes.length) return null;
  const packed = researchBentoLayout(nodes, researchCanvasVisibleArea({canvasSize}), measured, {fitColumns:true});
  const byId = new Map(packed.nodes.map(n => [n.id, { ...n, x:n.x+n.width/2, y:n.y+n.height/2, sizeMode:n.sizeMode==='manual'?'manual':'auto' }]));
  return { files:files.map(n=>byId.get(n.id)??n), artifacts:artifacts.map(n=>byId.get(n.id)??n), viewport:packed.viewport };
}`;

const placementSource = `function researchCanvasVisibleArea(snapshot) {
  const size=snapshot?.canvasSize??{};
  const height=size.visibleHeight>0?Math.min(size.height,size.visibleHeight):size.height;
  return {width:size.availableWidth>0?Math.min(size.width,size.availableWidth):size.width,height:Math.max(0,(height??0)-88)};
}
function researchCanvasViewportForAreaChange(snapshot,next) {
  // Figma 66: resizing the viewport must never reframe existing components.
  return snapshot.viewport;
}
function researchCanvasContainedAutoNode(snapshot,node) {
  if(!snapshot||node.sizeMode==='manual'||node.workbenchId||!['generated-container','generated-summary','generated-mind-map','pasted-text','assistant-result','web-link'].includes(node.kind))return node;
  const sources=[...snapshot.files,...snapshot.artifacts].filter(n=>n.id!==node.id&&node.sourceNodeIds?.includes(n.id));
  if(sources.length){
    const peers=[...snapshot.files,...snapshot.artifacts].filter(n=>n.id!==node.id);
    const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+16&&Math.abs(a.y-b.y)<(a.height+b.height)/2+16;
    if(!peers.some(n=>overlaps(n,node)))return node;
    const placed={...node,x:Math.max(...sources.map(n=>n.x+n.width/2))+16+node.width/2,y:Math.min(...sources.map(n=>n.y-n.height/2))+node.height/2};
    if(peers.some(n=>overlaps(n,placed)))placed.y=Math.max(...peers.map(n=>n.y+n.height/2))+16+node.height/2;
    return placed;
  }
  const area=researchCanvasVisibleArea(snapshot),view=snapshot.viewport??{x:0,y:0,scale:1},scale=view.scale>0?view.scale:1;
  if(!(area.width>64&&area.height>64)||node.width*scale>area.width-64+1e-6||node.height*scale>area.height-64+1e-6)return node;
  const clamp=(center,size,offset,extent)=>{const min=(32-offset)/scale+size/2,max=(extent-32-offset)/scale-size/2;return max>=min?Math.max(min,Math.min(max,center)):(extent/2-offset)/scale;};
  return {...node,x:clamp(node.x,node.width,view.x,area.width),y:clamp(node.y,node.height,view.y,area.height)};
}
function researchCanvasFittedViewport(snapshot,node) {
  const area=researchCanvasVisibleArea(snapshot),view=snapshot?.viewport??{x:0,y:0,scale:1};
  if(!(area.width>64&&area.height>64&&node.width>0&&node.height>0))return null;
  const scale=Math.min(view.scale>0?view.scale:1,(area.width-64)/node.width,(area.height-64)/node.height);
  if(scale>=(view.scale>0?view.scale:1)-1e-6)return null;
  return {scale,x:area.width/2-node.x*scale,y:area.height/2-node.y*scale};
}
function researchCanvasFitAutomaticUpdate(snapshot,patch) {
  if(!patch.artifacts)return patch;
  const changed=patch.artifacts.filter(node=>{const prior=snapshot.artifacts.find(old=>old.id===node.id);return node.sizeMode!=='manual'&&prior?.sizeMode!=='manual'&&!node.workbenchId&&['generated-container','generated-summary','generated-mind-map','pasted-text','assistant-result','web-link'].includes(node.kind)&&(!prior||node.kind!=='web-link'&&(prior.width!==node.width||prior.height!==node.height));});
  let viewport=patch.viewport??snapshot.viewport;
  const placed=new Map(changed.map(node=>[node.id,researchCanvasContainedAutoNode(snapshot,node)]));
  patch={...patch,artifacts:patch.artifacts.map(node=>placed.get(node.id)??node)};
  for(const node of placed.values()){
    const sources=[...snapshot.files,...snapshot.artifacts].filter(n=>n.id!==node.id&&node.sourceNodeIds?.includes(n.id));
    const fitted=sources.length?researchWorkbenchViewport([...sources,node],viewport,researchCanvasVisibleArea(snapshot)):researchCanvasFittedViewport({...snapshot,viewport},node);
    if(fitted)viewport=fitted;
  }
  if(viewport===(patch.viewport??snapshot.viewport))return patch;
  const changedIds=new Set(changed.map(node=>node.id));
  return {...patch,viewport,artifacts:patch.artifacts.map(node=>changedIds.has(node.id)?researchCanvasContainedAutoNode({...snapshot,viewport},node):node)};
}
function researchContainerPromptPreset(prompt) {
  const text=String(prompt);
  const large=text.length>280||/看板|概览|综合|多维|仪表|分布|热力|相关|复杂|K线|candlestick|dashboard|overview/i.test(text);
  const small=/核心指标|单一指标|当前价格|最新价格|市值|短结论|文件入口|一句话|KPI/i.test(text)&&!/[，、；;].*(趋势|图表|对比|表格)/.test(text);
  return researchBentoSize({type:large?'chart':small?'kpi':/短表|表格|趋势|走势|对比|比较|trend|table|compare/i.test(text)?'table':'chart'});
}
function researchContainerPlannedGeometry(snapshot,node,prompt) {
  const preset=researchContainerPromptPreset(prompt),dimensions={width:320,height:220};
  const placed=researchCanvasContainedAutoNode(snapshot,{...node,width:dimensions.width,height:dimensions.height});
  return {containerSizePreset:preset,width:placed.width,height:placed.height,x:placed.x,y:placed.y};
}
function researchCanvasViewportPlacement(snapshot, kind, cascadeIndex = 0) {
  const dimensions=kind==='web-link'?{width:656,height:456}:kind==='generated-container'?{width:400,height:280}:null;
  if(!dimensions)return null;
  const viewport=snapshot?.viewport??{scale:1,x:0,y:0},area=researchCanvasVisibleArea(snapshot),scale=viewport.scale>0?viewport.scale:1;
  const center=researchCanvasWorldPoint(viewport,{x:(area.width>0?area.width:1200)/2,y:(area.height>0?area.height:712)/2});
  const offset=Math.min(3,Math.max(0,Number.isFinite(cascadeIndex)?Math.floor(cascadeIndex):0))*24/scale;
  const placement=researchCanvasContainedAutoNode(snapshot,{kind,x:center.x+offset,y:center.y+offset,...dimensions,sizeMode:'auto'});
  const {kind:_kind,...geometry}=placement;return geometry;
}
`;

const generatedPlacementSource = `function researchCanvasGeneratedPlacement(nodes,selectedIds,kind,requestedDetail='standard',context=null) {
  const bounds=researchCanvasSelectionBounds(nodes,selectedIds);
  if(!bounds||!['mind-map','summary','create'].includes(kind))return null;
  const {width,height}=kind==='summary'?{width:320,height:220}:{width:400,height:300};
  const center={x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
  const candidates=[{x:bounds.right+32+width/2,y:center.y},{x:bounds.left-32-width/2,y:center.y},{x:center.x,y:bounds.bottom+32+height/2},{x:center.x,y:bounds.top-32-height/2}];
  let point=candidates[0],fitted=null;
  const view=context?.viewport,area=researchCanvasVisibleArea(context);
  if(view?.scale>0&&Number.isFinite(view.x)&&Number.isFinite(view.y)&&area.width>64&&area.height>64){
    if(width*view.scale>area.width-64||height*view.scale>area.height-64){
      point=researchCanvasWorldPoint(view,{x:area.width/2,y:area.height/2});
      fitted=researchCanvasFittedViewport(context,{...point,width,height});
    }else{
      const visible={left:(32-view.x)/view.scale,right:(area.width-32-view.x)/view.scale,top:(32-view.y)/view.scale,bottom:(area.height-32-view.y)/view.scale};
      const fit=candidates.find(p=>p.x-width/2>=visible.left&&p.x+width/2<=visible.right&&p.y-height/2>=visible.top&&p.y+height/2<=visible.bottom);
      const clamp=(value,min,max,size)=>Math.max(min+size/2,Math.min(max-size/2,value));
      point=fit??{x:clamp(point.x,visible.left,visible.right,width),y:clamp(point.y,visible.top,visible.bottom,height)};
    }
  }
  return {...point,width,height,sizeMode:'auto',...(fitted?{viewport:fitted}:{})};
}
`;


function ResearchDerivedSources({node,embedded=false,readOnly=false}) {
  const trigger=(0,react.useRef)(null),menu=(0,react.useRef)(null),[open,setOpen]=(0,react.useState)(false);
  const frozen=new Map((node.generationSources??[]).map(source=>[source.id,source]));
  const ids=Array.from(new Set(node.sourceNodeIds??[])),items=ids.map((id,index)=>({id,title:frozen.get(id)?.title||'来源组件 '+(index+1)}));
  const close=()=>setOpen(false);
  (0,react.useEffect)(()=>{if(!open)return;const doc=trigger.current?.ownerDocument;const dismiss=event=>{if(!trigger.current?.contains(event.target)&&!menu.current?.contains(event.target))close();};const key=event=>{if(event.key==='Escape'){event.preventDefault();close();trigger.current?.focus({preventScroll:true});}};doc?.addEventListener('pointerdown',dismiss,true);doc?.addEventListener('keydown',key,true);return()=>{doc?.removeEventListener('pointerdown',dismiss,true);doc?.removeEventListener('keydown',key,true);};},[open]);
  const select=event=>{event.stopPropagation();close();(event.currentTarget.closest('dialog[open]')??trigger.current?.closest('dialog[open]'))?.close();};
  const link=item=>(0,react_jsx_runtime.jsx)('button',{type:'button',role:embedded||open?'menuitem':undefined,'data-research-reference-node-id':item.id,onClick:select,onDoubleClick:event=>event.stopPropagation(),children:item.title},item.id);
  if(embedded)return (0,react_jsx_runtime.jsx)('div',{className:'odyssey-source-links',children:items.map(link)});
  const rect=trigger.current?.getBoundingClientRect(),doc=trigger.current?.ownerDocument,view=doc?.defaultView;
  const popup=open&&rect?(0,react_dom.createPortal)((0,react_jsx_runtime.jsx)('div',{ref:menu,className:'odyssey-source-menu','data-research-source-menu':'',role:'menu','aria-label':'来源组件',onPointerDown:event=>event.stopPropagation(),style:{position:'fixed',width:270,maxWidth:'calc(100vw - 24px)',maxHeight:Math.max(40,Math.min(300,view.innerHeight-24)),left:Math.max(12,Math.min(view.innerWidth-282,rect.left)),...(rect.top>Math.min(300,items.length*36+16)+20?{bottom:view.innerHeight-rect.top+8}:{top:rect.bottom+8})},children:items.map(link)}),trigger.current.closest('dialog[open]')??doc.body):null;
  return (0,react_jsx_runtime.jsxs)('div',{className:'rScV5Q_artifactMeta odyssey-derived-sources','data-research-derived-sources':'',onPointerDown:event=>event.stopPropagation(),children:[(0,react_jsx_runtime.jsx)('button',{ref:trigger,type:'button',disabled:!items.length,'data-research-reference-node-id':items.length===1?items[0].id:undefined,'aria-haspopup':items.length>1?'menu':undefined,'aria-expanded':items.length>1?open:undefined,onClick:event=>{if(items.length===1)select(event);else{event.stopPropagation();setOpen(!open);}},children:node.kind==='generated-mind-map'?'来源：所选组件':'› 查看来源组件'}),node.kind==='generated-mind-map'&&!readOnly?(0,react_jsx_runtime.jsx)('span',{children:' · 双击编辑节点'}):null,popup]});
}


function ResearchMindMapConnections({rootRef,revision}) {
  const [geometry,setGeometry]=(0,react.useState)({width:1,height:1,path:''});
  (0,react.useEffect)(()=>{const root=rootRef.current;if(!root)return;let active=true;const measure=()=>{if(!active)return;const bounds=root.getBoundingClientRect();if(!(bounds.width>0&&bounds.height>0))return;const sx=root.clientWidth/bounds.width,sy=root.clientHeight/bounds.height;const box=element=>{const rect=element.getBoundingClientRect();return {left:(rect.left-bounds.left)*sx+root.scrollLeft,top:(rect.top-bounds.top)*sy+root.scrollTop,width:rect.width*sx,height:rect.height*sy};};const origin=root.querySelector(':scope > [data-research-mind-map-node]');if(!origin)return;const paths=[];for(const branch of root.querySelectorAll('[data-research-mind-map-branch]')){const child=branch.querySelector(':scope > [data-research-mind-map-node]'),parentBranch=branch.parentElement.closest('[data-research-mind-map-branch]'),parent=parentBranch?.querySelector(':scope > [data-research-mind-map-node]')??origin;if(!child||!parent)continue;const a=box(parent),b=box(child);const x=a.left+a.width,y=a.top+a.height/2,endY=b.top+b.height/2,middle=(x+b.left)/2;paths.push('M'+x+' '+y+'H'+middle+'V'+endY+'H'+b.left);}const content=Array.from(root.querySelectorAll('[data-research-mind-map-node],.odyssey-component-summary-note')).map(box);const next={width:Math.max(root.clientWidth,...content.map(item=>item.left+item.width)),height:Math.max(root.clientHeight,...content.map(item=>item.top+item.height)),path:paths.join(' ')};setGeometry(before=>JSON.stringify(before)===JSON.stringify(next)?before:next);};const View=root.ownerDocument.defaultView,observer=View?.ResizeObserver?new View.ResizeObserver(measure):null;observer?.observe(root);for(const node of root.querySelectorAll('[data-research-mind-map-node]'))observer?.observe(node);measure();root.ownerDocument.fonts?.ready.then(measure);return()=>{active=false;observer?.disconnect();};},[rootRef,revision]);
  return (0,react_jsx_runtime.jsx)('svg',{'data-research-mind-map-edges':'','aria-hidden':true,width:geometry.width,height:geometry.height,viewBox:'0 0 '+geometry.width+' '+geometry.height,children:(0,react_jsx_runtime.jsx)('path',{d:geometry.path,fill:'none',stroke:'currentColor',strokeWidth:1})});
}


function researchIsDerivedNode(node) {
  return node?.kind==='generated-summary'||node?.kind==='generated-mind-map'||node?.kind==='generated-container'&&node.creationMode==='selection';
}
function researchDerivedTitle(node) {
  if(!researchIsDerivedNode(node))return node.title;
  if(node.kind==='generated-summary'&&node.generationStatus==='running')return '正在提炼关键结论';
  if(node.generationStatus!=='completed'||!['思维导图','总结提炼'].includes(node.title))return node.title;
  const heading=node.excerpt?.match(/^\s*#\s+([^\n]+)(?:\n|$)/)?.[1]?.trim();
  if(!heading)return node.title;
  const suffix=node.kind==='generated-mind-map'?'思维导图':'关键结论';
  return heading.includes(suffix)?heading:heading+' · '+suffix;
}
function ResearchDerivedHeading({node}) {
  const status=node.kind==='generated-mind-map'&&node.generationStatus==='completed'?(RESEARCH_MIND_MAP_DETAIL_OPTIONS.find(option=>option.value===researchMindMapDetail(node.generationDetail))?.label??'常规'):'';
  return (0,react_jsx_runtime.jsxs)('span',{'data-research-derived-title':'',children:[(0,react_jsx_runtime.jsx)('span',{children:researchDerivedTitle(node)}),status?(0,react_jsx_runtime.jsx)('span',{'data-research-derived-status':'',children:status}):null]});
}

const derivedSource = `function ResearchDerivedSummary({node,onUpgradeSize}) {
  const spec={version:1,type:'markdown',title:node.title,content:node.excerpt};
  return (0,react_jsx_runtime.jsx)('div',{'data-research-derived-summary':'',className:'odyssey-derived-summary',children:(0,react_jsx_runtime.jsx)(ResearchContainerContent,{node:{...node,height:Math.max(100,node.height-24),containerSpec:spec},preserveHeading:['pasted-text','assistant-result'].includes(node.kind),onUpgradeSize})});
}
${researchIsDerivedNode.toString()}
${researchDerivedTitle.toString()}
${ResearchDerivedHeading.toString()}
${ResearchDerivedSources.toString()}
${ResearchMindMapConnections.toString()}
function researchMindMapFitTree(tree,budget,labelLimit,rootLimit=labelLimit) {
  let remaining=Math.max(1,budget)-1,shortened=false;
  const copy=node=>{const label=String(node.label),limit=node===tree?rootLimit:labelLimit;const displayLabel=label.length>limit?label.slice(0,Math.max(1,limit-1))+'…':label;if(displayLabel!==label)shortened=true;return {...node,sourceLineIndex:node.sourceLineIndex,displayLabel,children:[]};};
  const result=copy(tree),queue=[{source:tree,target:result}];
  while(queue.length){const {source,target}=queue.shift();for(const child of source.children){if(remaining<=0){shortened=true;continue;}remaining--;const next=copy(child);target.children.push(next);queue.push({source:child,target:next});}}
  return {tree:result,shortened};
}
function researchMindMapInitialBudget(height) {
  return Math.max(2,1+Math.floor((height+12)/60));
}
function ResearchMindMap({nodeId,text,detail='standard',onNodeLabelCommit,readOnly=false}) {
  const [editingLineIndex,setEditingLineIndex]=(0,react.useState)(null),[layout,setLayout]=(0,react.useState)({width:620,height:360,expanded:false}),[fitBudget,setFitBudget]=(0,react.useState)(null),ref=(0,react.useRef)(null);
  (0,react.useLayoutEffect)(()=>{const element=ref.current,card=element?.closest('[data-research-compact-chrome]');if(!element||!card)return;const update=()=>{const expanded=card.open;setLayout(previous=>{const next={width:element.clientWidth||previous.width,height:element.clientHeight||previous.height,expanded};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});};const View=element.ownerDocument.defaultView,observer=new View.ResizeObserver(update),mutation=new View.MutationObserver(update);observer.observe(element);mutation.observe(card,{attributes:true,attributeFilter:['open']});update();return()=>{observer.disconnect();mutation.disconnect();};},[nodeId]);
  const columns=1, budgetKey=text+'|'+layout.width+'|'+layout.height, budget=fitBudget?.key===budgetKey?fitBudget.value:researchMindMapInitialBudget(layout.height);
  (0,react.useEffect)(()=>{if(readOnly)setEditingLineIndex(null);},[readOnly]);
  
  (0,react.useLayoutEffect)(()=>{const element=ref.current;if(!element||layout.expanded||editingLineIndex!==null)return;let active=true;
    const measure=()=>{if(!active||element.clientHeight<=0)return;const bounds=element.getBoundingClientRect();if(!(bounds.width>0&&bounds.height>0))return;
      const sx=element.clientWidth/bounds.width,sy=element.clientHeight/bounds.height;
      // The previous SVG dimensions may still be from the old tree. Only text boxes
      // and the real summary footer determine whether content fits this render.
      const overflow=Array.from(element.querySelectorAll('[data-research-mind-map-node],.odyssey-component-summary-note')).some(node=>{const box=node.getBoundingClientRect();return (box.right-bounds.left)*sx>element.clientWidth+1||(box.bottom-bounds.top)*sy>element.clientHeight+1;});
      if(overflow&&budget>2)setFitBudget({key:budgetKey,value:budget-1});};measure();element.ownerDocument.fonts?.ready.then(measure);return()=>{active=false;};},[budget,budgetKey,layout.expanded,layout.width,layout.height,editingLineIndex]);
  const normalizedDetail=researchMindMapDetail(detail),original=parseResearchMindMap(text,layout.expanded?'detailed':normalizedDetail);
  const fit=original?{tree:original,shortened:false}:null;
  const tree=fit?.tree,cancel=()=>setEditingLineIndex(null),commit=(sourceLineIndex,label)=>{setEditingLineIndex(null);if(!readOnly)onNodeLabelCommit?.(sourceLineIndex,label);};
  return (0,react_jsx_runtime.jsxs)('div',{ref,className:'rScV5Q_mindMap','data-research-mind-map':'','data-research-mind-map-detail':normalizedDetail,'data-mind-map-summary':!!fit?.shortened,'data-mind-map-expanded':layout.expanded,style:{'--odyssey-map-columns':Math.min(columns,Math.max(1,tree?.children.length??1))},lang:'zh-CN',children:tree?[(0,react_jsx_runtime.jsx)(ResearchMindMapConnections,{rootRef:ref,revision:text+'|'+budget+'|'+layout.expanded+'|'+editingLineIndex}),(0,react_jsx_runtime.jsx)(ResearchMindMapDisplayNode,{artifactId:nodeId,node:tree,depth:0,root:true,editingLineIndex:readOnly?null:editingLineIndex,onBeginEdit:readOnly?()=>{}:setEditingLineIndex,onCommit:commit,onCancel:cancel}),tree.children.length?(0,react_jsx_runtime.jsx)(ResearchMindMapBranches,{artifactId:nodeId,nodes:tree.children,editingLineIndex:readOnly?null:editingLineIndex,onBeginEdit:readOnly?()=>{}:setEditingLineIndex,onCommit:commit,onCancel:cancel}):null,fit.shortened?(0,react_jsx_runtime.jsx)('span',{className:'odyssey-component-summary-note',children:'放大查看完整导图'}):null]:[(0,react_jsx_runtime.jsx)('span',{className:'rScV5Q_artifactExcerpt',children:text})]});
}
`;


const responsiveSource = `function ResearchContainerContent(props) {
  const {node}=props,ref=(0,react.useRef)(null);
  const [width,setWidth]=(0,react.useState)(node.width??656);
  (0,react.useLayoutEffect)(()=>{const element=ref.current;if(!element)return;const update=()=>{if(element.clientWidth>0)setWidth(element.clientWidth);};const Observer=element.ownerDocument.defaultView?.ResizeObserver,observer=Observer?new Observer(update):null;observer?.observe(element);update();return()=>observer?.disconnect();},[node.id]);
  return (0,react_jsx_runtime.jsx)('div',{ref,className:'odyssey-component-content','data-component-summary':false,'data-component-width':width<480?'narrow':width<760?'medium':'wide',children:
    (0,react_jsx_runtime.jsx)('div',{className:'odyssey-component-primary',children:(0,react_jsx_runtime.jsx)(ResearchContainerBody,props)})});
}
${parseResearchMarketNativeTable.toString()}
const researchMarketNativeTableCache = new WeakMap();
function researchMarketTableForSpec(spec) {
  if (!researchMarketNativeTableCache.has(spec)) researchMarketNativeTableCache.set(spec, parseResearchMarketNativeTable(spec.html, document));
  return researchMarketNativeTableCache.get(spec);
}
${ResearchMarketNativeTable.toString()}`

export const canvasCss = `
body [data-research-artifact-card]:not(:has(.rScV5Q_webFrame)) :is(.rScV5Q_previewBody,.rScV5Q_artifactBody,.odyssey-component-primary,.rScV5Q_containerMarkdown,.rScV5Q_containerTableScroll,.rScV5Q_mindMap,.odyssey-generation-records,textarea){scrollbar-width:none!important}
body [data-research-artifact-card]:not(:has(.rScV5Q_webFrame)) ::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
.rScV5Q_root[data-space-pressed=true]:after{content:none;border:0}
[data-research-empty-viewport]{box-sizing:border-box;white-space:nowrap}
.rScV5Q_root{--sherlock-research-dot:var(--odyssey-dot)!important;background-image:none!important}
.rScV5Q_root>.odyssey-canvas-dots{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;color:var(--sherlock-research-dot)}
.odyssey-global-icon{display:inline-block;width:16px;height:16px;flex:0 0 16px;background:center/16px 16px no-repeat}
.odyssey-global-link{background-image:url('${iconData['global-link-light']}')}body[data-ds-dark-theme] .odyssey-global-link{background-image:url('${iconData['global-link-dark']}')}
.odyssey-global-container{background-image:url('${iconData['global-container-light']}')}body[data-ds-dark-theme] .odyssey-global-container{background-image:url('${iconData['global-container-dark']}')}
.odyssey-global-voice{background-image:url('${iconData['global-voice-light']}')}body[data-ds-dark-theme] .odyssey-global-voice{background-image:url('${iconData['global-voice-dark']}')}
.rScV5Q_globalToolbar[data-research-global-toolbar]{box-sizing:border-box;width:272px;height:48px;bottom:24px;padding:6px;gap:4px;border:0;outline:1px solid #0000001a;outline-offset:-1px;border-radius:14px;background:#ffffffeb;backdrop-filter:blur(12px);box-shadow:0 6px 20px #0000001a}
.rScV5Q_globalToolbar[data-research-global-toolbar]>button,.rScV5Q_globalToolbar[data-research-global-toolbar] .rScV5Q_globalToolSlot>button{width:84px;height:36px;padding:0;justify-content:center;gap:8px;border-radius:9px;background:#00000008;font:13px/20px 'Noto Sans SC',sans-serif;color:#333}
body[data-ds-dark-theme] .rScV5Q_globalToolbar[data-research-global-toolbar]{background:#242424db;outline-color:#ffffff1f;box-shadow:0 6px 20px #0000003d}body[data-ds-dark-theme] .rScV5Q_globalToolbar[data-research-global-toolbar] button{background:#ffffff08;color:#dedede}

[data-research-compact-chrome]{--odyssey-card:#f1f2f4;--odyssey-content:#fff;--odyssey-card-border:#e1e1e1;--odyssey-card-text:#292b2f;--odyssey-card-muted:#81858c;--odyssey-select:#a2c4ff;border-radius:12px!important;border-color:transparent!important;outline:none!important;box-shadow:none!important;container-type:size}
body[data-ds-dark-theme] [data-research-compact-chrome]{--odyssey-card:#292a2d;--odyssey-content:#171717;--odyssey-card-border:#424242;--odyssey-card-text:#ececed;--odyssey-card-muted:#98999f;--odyssey-select:#1b77ff}
[data-research-compact-chrome][data-research-market-panel]{--odyssey-card:#fafafa;--odyssey-content:#fafafa}
body[data-ds-dark-theme] [data-research-compact-chrome][data-research-market-panel]{--odyssey-card:#303030;--odyssey-content:#303030}
[data-research-compact-chrome][data-selected=true]{border-color:transparent!important;outline:none!important;box-shadow:none!important}
/* The selection and drag ring belongs to the foreground overlay. A shadow on
   the host paints behind full-bleed previews and disappears under their edge. */
[data-research-compact-chrome][data-selected=true]::after{content:'';position:absolute;inset:-1px;border-radius:inherit;box-shadow:inset 0 0 0 1.5px var(--odyssey-select),0 0 7px rgba(82,140,255,.28),0 0 26px 2px rgba(64,128,255,.14);pointer-events:none;z-index:50}
[data-research-compact-chrome][data-research-derived][data-selected=true]::after{inset:0}
body[data-ds-dark-theme] [data-research-compact-chrome][data-selected=true]::after{box-shadow:inset 0 0 0 1.5px var(--odyssey-select),0 0 7px rgba(82,140,255,.48),0 0 26px 2px rgba(64,128,255,.24)}
[data-research-compact-chrome]>.rScV5Q_nodeTitle{height:47px;min-height:47px;flex-basis:47px;padding:12px 18px!important;border-radius:11px 11px 0 0;border-bottom:0!important;align-items:flex-start}
[data-research-compact-chrome] .rScV5Q_nodeTitleText{font-size:15px!important;font-weight:500;line-height:23px;flex:1}
[data-research-compact-chrome] .rScV5Q_nodeTitleActions{top:11px;right:12px;gap:6px;padding:3px;border-radius:7px;background:var(--odyssey-card)}
[data-research-compact-chrome] :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand){width:24px;height:24px;border:1px solid #0000001f;border-radius:6px;background:#ffffff99;color:var(--odyssey-card-muted)}
body[data-ds-dark-theme] [data-research-compact-chrome] :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand){border-color:#ffffff24;background:#ffffff09}
[data-research-compact-chrome]:not([open]) .rScV5Q_containerExpand>svg{display:none}
[data-research-compact-chrome]:not([open]) .rScV5Q_containerExpand::before{content:'';width:13px;height:13px;background:currentColor;mask:url('${iconData.expand}') center/10.5625px 10.5625px no-repeat}
[data-research-compact-chrome] :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand):hover{background:color-mix(in srgb,var(--odyssey-card-text) 6%,transparent);color:var(--odyssey-card-text)}
[data-research-compact-chrome]>.rScV5Q_previewBody{height:calc(100% - 48px);border-radius:0 0 11px 11px;clip-path:none}
[data-research-compact-chrome] :is(.rScV5Q_containerContent,.rScV5Q_generatedContainer){background:var(--odyssey-content)!important;overflow:visible;align-items:stretch!important;min-height:0}
[data-research-arrange-feedback]{width:max-content!important;min-width:0!important;padding:8px 12px!important}.odyssey-arrange-toast{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font:12px/20px DINPro,'Noto Sans SC',sans-serif}.odyssey-arrange-toast img{flex:none}\n.odyssey-component-content{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;color:var(--odyssey-card-text);font:13px/21px DINPro,'Noto Sans SC',sans-serif}
.odyssey-component-primary{display:flex;flex:1;min-height:0;min-width:0;flex-direction:column;overflow:auto}\n.odyssey-component-content[data-component-expanded=true]{overflow:auto}
.odyssey-component-summary-note{flex:none;padding:0 18px 12px;font-size:10px;line-height:18px;color:var(--odyssey-card-muted)}
[data-research-compact-chrome] .rScV5Q_containerKpis{box-sizing:border-box;padding:20px;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 16px;align-content:start}
[data-research-compact-chrome] [data-component-width=narrow] .rScV5Q_containerKpis{grid-template-columns:repeat(2,minmax(0,1fr))}
[data-research-compact-chrome] .rScV5Q_containerKpis>div{min-height:53px;padding:0;gap:2px;border:0;background:transparent;justify-content:flex-start}
[data-research-compact-chrome] .rScV5Q_containerKpis span{font:11px/19px DINPro,'Noto Sans SC',sans-serif;color:var(--odyssey-card-muted)}
[data-research-compact-chrome] [data-component-width=narrow] .rScV5Q_containerKpis span{font-size:10px;line-height:18px}
[data-research-compact-chrome] .rScV5Q_containerKpis strong{font:500 24px/32px DINPro,'Noto Sans SC',sans-serif;letter-spacing:0;color:var(--odyssey-card-text)}
[data-research-compact-chrome] .rScV5Q_containerKpis strong[data-research-metric-positive=true]{color:#cd7269}
[data-research-compact-chrome] .rScV5Q_containerKpis em{font:13px/21px DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_containerTableScroll{box-sizing:border-box;padding:20px;overflow:visible}
[data-research-compact-chrome] .rScV5Q_containerTableScroll :is(th,td){box-sizing:border-box;height:33px;padding:6px 0;line-height:21px;border:0;border-bottom:1px solid var(--odyssey-card-border);overflow-wrap:anywhere}
[data-research-compact-chrome] .rScV5Q_containerTableScroll [data-numeric=true]{text-align:right}
[data-research-compact-chrome] .rScV5Q_containerTableScroll th{font-size:11px;line-height:19px;font-weight:400}
[data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerTableScroll table{color:var(--odyssey-card-text)}
[data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerTableScroll th{color:var(--odyssey-card-muted)}
body[data-ds-dark-theme] [data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerTableScroll table{color:#e7e7e9}
body[data-ds-dark-theme] [data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerTableScroll th{color:#989aa0}
[data-research-compact-chrome] .rScV5Q_containerTableScroll :is(th,td)[data-numeric=true]+:is(th,td):not([data-numeric=true]){padding-left:18px}
[data-research-compact-chrome] .rScV5Q_containerMarkdown{box-sizing:border-box;padding:20px;overflow:visible;font-size:13px;line-height:21px}
[data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerMarkdown{color:var(--odyssey-card-text)}
/* Text 349:1036 uses the 40/41 content palette; SML table 379:668 keeps its own. */
body:not([data-ds-dark-theme]) [data-research-compact-chrome] .odyssey-component-primary .rScV5Q_containerMarkdown{--odyssey-card-text:#242529}
[data-research-compact-chrome] .rScV5Q_containerMarkdown>:first-child{font:inherit;color:var(--odyssey-card-text);overflow-wrap:anywhere}
[data-research-compact-chrome] .rScV5Q_containerMarkdown p{margin:0 0 8px}
[data-research-compact-chrome] .rScV5Q_containerChart{box-sizing:border-box;padding:20px;flex:1;justify-content:flex-start}
[data-research-compact-chrome] .odyssey-component-primary [data-research-container-chart=line]{background:transparent}
[data-research-compact-chrome] [data-research-container-chart=line] .rScV5Q_chartLabel{font:10px/18px DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_containerChart svg{flex:1;width:100%;height:100%;max-height:none;min-height:0}
[data-research-compact-chrome] .rScV5Q_chartLabel{font:11px DINPro,'Noto Sans SC',sans-serif}\n[data-research-compact-chrome] .rScV5Q_chartLegend{padding:6px 0 0;font:11px/19px DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_artifactBody:has([data-research-derived-summary]),[data-research-compact-chrome][data-research-generated-mind-map] .rScV5Q_artifactBody{height:100%;min-height:0;padding:0!important;gap:6px}
[data-research-compact-chrome]:not([open])>.rScV5Q_previewBody>.rScV5Q_artifactBody{background:var(--odyssey-content);border-radius:inherit}
body [data-research-compact-chrome] .rScV5Q_containerDraft{box-sizing:border-box;min-height:0;height:100%;padding:20px!important;gap:12px}\nbody [data-research-compact-chrome] .rScV5Q_containerDraft textarea{box-sizing:border-box;min-height:0;flex:1}\n.odyssey-derived-summary{display:flex;flex:1;min-height:0;flex-direction:column}
body [data-research-compact-chrome][data-research-artifact-card] :is(.rScV5Q_previewBody,.rScV5Q_artifactBody,.rScV5Q_mindMap,.rScV5Q_generationProcess,.rScV5Q_containerDraft,.rScV5Q_generationFailure){background:var(--odyssey-content)!important}
[data-research-compact-chrome] .rScV5Q_artifactBody{background:var(--odyssey-content);min-height:0;max-height:100%;box-sizing:border-box}
[data-research-compact-chrome] .rScV5Q_artifactBody:has(> .rScV5Q_contentEditor){display:flex;flex-direction:column;height:100%;min-height:0;padding:0!important}\n[data-research-compact-chrome] .rScV5Q_contentEditor{height:calc(100% - 24px)!important;box-sizing:border-box;flex:1;min-height:0!important;max-height:calc(100% - 24px);width:calc(100% - 44px)!important;margin:12px 22px;padding:12px!important;border-radius:8px;resize:none}
.odyssey-derived-summary .rScV5Q_containerMarkdown{min-height:0;overflow:auto;overscroll-behavior:contain}
.odyssey-derived-sources{flex:none}

.odyssey-derived-sources{display:flex!important;align-items:baseline;gap:4px;position:relative;font:11px/19px DINPro,'Noto Sans SC',sans-serif!important;white-space:nowrap}
.odyssey-derived-sources>button{border:0;padding:0;background:transparent;color:#4279d8;font:inherit;cursor:pointer}.odyssey-derived-sources>button:disabled{color:#85878d;cursor:default}.odyssey-derived-sources>span{color:#85878d}
.odyssey-source-menu{z-index:1000;box-sizing:border-box;overflow:auto;padding:8px;border-radius:10px;background:#fff;outline:1px solid #e7e8ec;box-shadow:0 4px 16px #0000000e;color:#242529;font:12px/20px DINPro,'Noto Sans SC',sans-serif}
.odyssey-source-menu>button,.odyssey-source-links>button{display:block;width:100%;border:0;border-radius:6px;padding:8px 10px;text-align:left;background:transparent;color:inherit;font:inherit;overflow-wrap:anywhere;cursor:pointer}.odyssey-source-menu>button:hover,.odyssey-source-links>button:hover{background:#f4f5f7}
body[data-ds-dark-theme] .odyssey-derived-sources>button{color:#92b5fa}body[data-ds-dark-theme] .odyssey-source-menu{background:#292a2d;outline-color:#414247;color:#ececed;box-shadow:0 4px 16px #00000029}body[data-ds-dark-theme] :is(.odyssey-source-menu,.odyssey-source-links)>button:hover{background:#343538}

[data-research-compact-chrome] .rScV5Q_artifactMeta{flex:none;padding:0 18px 6px;font-size:10px;line-height:18px}
body [data-research-compact-chrome][data-research-generated-mind-map] :is(.rScV5Q_previewBody,.rScV5Q_artifactBody,.rScV5Q_mindMap){background:#fff!important}
[data-research-compact-chrome] .rScV5Q_mindMap{position:relative;height:auto;flex:1;min-height:0;box-sizing:border-box;padding:24px;display:flex;align-items:safe center;justify-content:flex-start;gap:40px;overflow:auto;overscroll-behavior:contain;background:#fff;font-family:DINPro,'Noto Sans SC',sans-serif}
[data-research-compact-chrome] .rScV5Q_mindMap>[data-research-mind-map-edges]{position:absolute;inset:0;pointer-events:none;overflow:visible;color:#a4a4a4;z-index:0}
[data-research-compact-chrome] .rScV5Q_mindMap>.rScV5Q_mindMapRoot{flex:0 0 160px;align-self:center;z-index:1}
[data-research-compact-chrome] .rScV5Q_mindMapChildren{display:flex;flex-direction:column;gap:18px;padding:0;flex:none;z-index:1}
[data-research-compact-chrome] .rScV5Q_mindMapBranch{display:flex;flex-direction:row;align-items:center;gap:40px;min-width:0}
[data-research-compact-chrome] .rScV5Q_mindMapBranch>.rScV5Q_mindMapChildren{padding:0;border:0;display:flex;flex-direction:column}
[data-research-compact-chrome] .rScV5Q_mindMapNode[data-research-mind-map-depth]{position:relative;box-sizing:border-box;flex:0 0 160px;width:160px;min-width:160px;max-width:160px;min-height:42px;padding:11px 12px;border:0;border-radius:0;background:#1ab3d5;color:#fff;font:500 12px/20px DINPro,'Noto Sans SC',sans-serif;text-align:center;overflow-wrap:anywhere;z-index:1}
[data-research-compact-chrome] .rScV5Q_mindMapNode[data-research-mind-map-depth="0"]{background:#00549e}
[data-research-compact-chrome] .rScV5Q_mindMapNode[data-research-mind-map-depth="1"]{background:#0088bd}
[data-research-compact-chrome] .rScV5Q_mindMapRoot:after,[data-research-compact-chrome] .rScV5Q_mindMapChildren:before,[data-research-compact-chrome] .rScV5Q_mindMapChildren:after,[data-research-compact-chrome] .rScV5Q_mindMapBranch:before,[data-research-compact-chrome] .rScV5Q_mindMapBranch:after{display:none!important}
[data-research-compact-chrome] .rScV5Q_mindMap .odyssey-component-summary-note{grid-column:1 / -1;padding:0;line-height:18px}
[data-research-compact-chrome][open] .rScV5Q_mindMap{overflow:auto;align-content:start}
[data-research-compact-chrome]:not([open]):has(.rScV5Q_mindMap,.odyssey-derived-summary)>.rScV5Q_previewBody{overflow:hidden!important}
[data-research-compact-chrome][data-research-derived]{border-width:0!important}
[data-research-compact-chrome][data-research-derived]:not([data-selected=true]){outline:none!important}
[data-research-compact-chrome][data-research-derived]>.rScV5Q_nodeTitle{height:47px;min-height:47px;flex-basis:47px;padding:12px 18px!important}
[data-research-compact-chrome][data-research-derived]>.rScV5Q_previewBody{height:calc(100% - 48px)}
[data-research-compact-chrome][data-research-derived] .rScV5Q_artifactBody{height:100%;min-height:0;padding:0!important;gap:6px}
[data-research-derived-title]{display:flex;align-items:center;gap:8px;width:100%;min-width:0;font:500 15px/23px DINPro,'Noto Sans SC',sans-serif}
[data-research-derived-title]>:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-research-derived-title]>[data-research-derived-status]{flex:none;color:var(--odyssey-card-muted);font:400 12px/20px DINPro,'Noto Sans SC',sans-serif}
[data-research-derived] .odyssey-derived-sources{padding:0 22px 22px!important}
[data-research-derived] .rScV5Q_mindMap{padding:20px}
[data-research-derived] .odyssey-derived-summary .rScV5Q_containerMarkdown{padding:20px}
[data-research-compact-chrome][data-research-derived] .odyssey-derived-process{padding:18px 22px 22px!important;gap:18px;height:100%;min-height:0}
.odyssey-derived-process>.odyssey-generation-step{border:0;padding:0;background:transparent;text-align:left;color:inherit;cursor:pointer;font:13px/21px DINPro,'Noto Sans SC',sans-serif;gap:8px;flex:none}
.odyssey-derived-process>.odyssey-generation-step:focus-visible{outline:1px solid var(--odyssey-select);outline-offset:4px;border-radius:4px}
.odyssey-derived-process>[data-research-generation-sources]{flex:none;color:var(--odyssey-card-muted);font:12px/20px DINPro,'Noto Sans SC',sans-serif}
[data-research-derived] .odyssey-derived-process>.rScV5Q_generationFooter{justify-content:space-between;margin-top:auto;padding-top:18px;border-top:1px solid var(--odyssey-card-border);color:var(--odyssey-card-muted)}
.odyssey-derived-process>.rScV5Q_generationFooter button{padding:4px 12px;background:#f4f5f7;color:var(--odyssey-card-text);font:12px/20px DINPro,'Noto Sans SC',sans-serif}
body[data-ds-dark-theme] .odyssey-derived-process>.rScV5Q_generationFooter button{background:#343538}
.odyssey-derived-skeleton{display:grid;grid-template-columns:.7fr 1fr 1fr;gap:8px 12px;flex:1;align-content:center;min-height:30px}
.odyssey-derived-skeleton>i{display:block;height:12px;border-radius:4px;background:#eff0f2;animation:odyssey-skeleton 1.6s ease-in-out infinite}
body[data-ds-dark-theme] .odyssey-derived-skeleton>i{background:#36373b}
[data-research-derived] .odyssey-derived-process .odyssey-generation-records{overflow:auto;min-height:0;flex:1}
[data-research-compact-chrome][data-research-derived] .odyssey-derived-process[data-process-compact=true]{gap:8px}
[data-research-derived] .odyssey-derived-process[data-process-compact=true]>.rScV5Q_generationFooter{padding-top:12px}
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
[data-research-compact-chrome] .rScV5Q_generationProcess{box-sizing:border-box;min-height:0;height:100%;padding:20px!important;gap:12px;display:flex;flex-direction:column}
.odyssey-generation-step{display:flex;align-items:center;gap:10px;min-height:23px;font:13px/21px 'Noto Sans SC',sans-serif}
.odyssey-generation-step [data-research-generation-description]{display:block;overflow:visible;margin:0;line-height:21px}
.rScV5Q_generationSpinner{width:16px;height:16px;border:1.7px solid color-mix(in srgb,currentColor 16%,transparent);border-top-color:currentColor;border-radius:50%;animation:odyssey-ring .9s linear infinite}
.odyssey-generation-skeleton{box-sizing:border-box;min-height:0;flex:1;display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:10px;padding:12px;border:1px solid var(--odyssey-card-border);border-radius:8px;overflow:hidden}
.odyssey-generation-skeleton i{height:24px;border-radius:5px;width:100%;background:#f0f1f3;animation:odyssey-skeleton 1.6s ease-in-out infinite}.odyssey-generation-skeleton i:nth-child(-n+2){grid-column:1/-1;height:8px;width:90%}.odyssey-generation-skeleton i:first-child{width:62%}.odyssey-generation-skeleton i:nth-child(2n){animation-delay:.15s}
body[data-ds-dark-theme] .odyssey-generation-skeleton i{background:#36373b}
.odyssey-generation-records{min-height:0;flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-radius:8px;background:#f4f5f7;font:12px/20px 'Noto Sans SC',sans-serif}
.odyssey-generation-records>div{display:flex;gap:8px;overflow-wrap:anywhere}.odyssey-generation-records time{flex:none;color:var(--odyssey-card-muted)}
body[data-ds-dark-theme] .odyssey-generation-records{background:#ffffff05}
[data-research-compact-chrome] .rScV5Q_generationFooter{display:flex;flex:none;align-items:center;gap:8px;border:0;padding:0;min-height:28px;font:12px/20px DINPro,'Noto Sans SC',sans-serif}
.rScV5Q_generationFooter [data-research-generation-elapsed]{color:var(--odyssey-card-muted);margin-right:auto}
.rScV5Q_generationFooter button{height:28px;padding:0 8px;font:12px/20px 'Noto Sans SC',sans-serif;border:0;border-radius:6px;background:transparent;color:var(--odyssey-card-text)}
[data-research-generation-process][data-process-expanded=true] .odyssey-generation-records{font-size:11px;line-height:17px;gap:4px;padding:6px 10px}
[data-research-derived] [data-research-generation-process][data-process-expanded=true] .odyssey-generation-records{font-size:12px;line-height:20px;gap:8px;padding:10px 12px}
[data-research-compact-chrome] .rScV5Q_generationFailure{min-height:0;padding:20px!important;align-items:flex-start;justify-content:flex-start;text-align:left;gap:12px;font:13px/21px 'Noto Sans SC',sans-serif}
.rScV5Q_generationFailure>strong{font-size:16px;font-weight:500}.rScV5Q_generationFailure>span{color:var(--odyssey-card-muted)}.rScV5Q_generationFailure details{font-size:12px;line-height:20px}.rScV5Q_generationFailure details p{margin:8px 0}.rScV5Q_generationFailure button{margin-left:auto}
@keyframes odyssey-ring{to{transform:rotate(360deg)}}@keyframes odyssey-skeleton{50%{opacity:.45}}
@media(prefers-reduced-motion:reduce){.rScV5Q_generationSpinner,.odyssey-generation-skeleton i,.odyssey-derived-skeleton>i{animation:none}}
` + derivedMenuCss + researchCompletedDesignCss + researchComponentHeaderNoteCss + generationCss + MARKET_REGULAR_FONT_CSS + researchMarketNativeTableCss
