// Dense terminal presentation for completed component shells and native content.
// Design: docs/design/terminal-components-figma-map-20260926.json.
// Drafts and maps keep their own presentation; HTML bodies use their trusted
// scoped template stylesheet inside the sandbox.
const nativeContent = ':is([data-research-container-type="kpi"],[data-research-container-type="table"],[data-research-container-type="chart"],[data-research-container-type="markdown"])'
const root = '[data-research-compact-chrome][data-research-generated-container]'
const nativeCard = `${root}:has(${nativeContent})`
const completedContent = `:is(${nativeContent},[data-research-container-type="html"],[data-research-container-type="web"],[data-research-container-type="news"],.rScV5Q_webFrame)`
const card = `${root}:has(${completedContent}):not([data-research-generated-mind-map])`

// Scope by existing content, rather than generationStatus: a refresh must keep
// the last successful content's appearance while its independent status changes.
export const researchCompletedDesignCss = `
${card}{
  --research-completed-surface:#ffffff;
  --research-completed-inset:#edf1f5;
  --research-completed-text:#1b2734;
  --research-completed-muted:#56677a;
  --research-completed-divider:#d4dce5;
  --research-completed-row:#f5f7fa;
  --research-completed-action:#80500c;
  --research-completed-control:#ffffff;
  --research-completed-control-border:#c5cfda;
  --research-completed-control-muted:#777777;
  --odyssey-card:var(--research-completed-surface);
  --odyssey-content:var(--research-completed-surface);
  --odyssey-card-border:var(--research-completed-divider);
  --odyssey-card-text:var(--research-completed-text);
  --odyssey-card-muted:var(--research-completed-muted);
  border:1px solid var(--research-completed-divider)!important;border-radius:3px!important;
  background:var(--research-completed-surface)!important;
  color:var(--research-completed-text);
  font-family:"EWork DIN Pro","Noto Sans SC",sans-serif;
  font-synthesis:none;
}
/* Preserve the canvas selection paint after removing the transparent layout
   border: its existing blue overlay now aligns with the actual card bounds. */
${card}[data-selected=true]::after{inset:0}
body[data-ds-dark-theme] ${card}{
  --research-completed-surface:#11161c;
  --research-completed-inset:#1c252f;
  --research-completed-text:#e1e8f0;
  --research-completed-muted:#98a9bc;
  --research-completed-divider:#303d4b;
  --research-completed-row:#151d26;
  --research-completed-action:#ffbc66;
  --research-completed-control:#19222c;
  --research-completed-control-border:#3c4b5c;
  --research-completed-control-muted:#a0a0a0;
}
${card}>.rScV5Q_nodeTitle{
  box-sizing:border-box;position:relative;height:32px;min-height:32px;flex-basis:32px;
  padding:5px 8px!important;border-radius:2px 2px 0 0;
  align-items:center;border-bottom:0!important;
  background:var(--research-completed-surface);
}
${card}>.rScV5Q_nodeTitle:after{
  content:'';position:absolute;left:0;right:0;top:31px;height:1px;
  background:var(--research-completed-divider);pointer-events:none;
}
${card} :is(.rScV5Q_nodeTitleText,[data-research-derived-title]){
  font-family:"Noto Sans SC","EWork DIN Pro",sans-serif;
  font-size:12px!important;font-weight:600;line-height:20px;
  color:var(--research-completed-action);
}
${card}>.rScV5Q_previewBody{height:calc(100% - 32px);border-radius:0 0 2px 2px}
${card} :is(.rScV5Q_artifactBody,.rScV5Q_generatedContainer,.rScV5Q_containerContent){background:var(--research-completed-surface)!important;border-radius:0 0 2px 2px}
${card} .rScV5Q_webFrame{border-radius:0 0 2px 2px}
${nativeCard} .odyssey-component-content{color:var(--research-completed-text);font:400 12px/18px "EWork DIN Pro","Noto Sans SC",sans-serif}

/* 72 KPI: y56, 64px cell, label y6/14, value y23/26, detail y49/11.
   min-height retains the source density while allowing long user text to wrap. */
${nativeCard} .rScV5Q_containerKpis{padding:8px;gap:0;align-content:start}
${nativeCard} [data-component-width=wide] .rScV5Q_containerKpis:has(>div:nth-child(6)):not(:has(>div:nth-child(7))){grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
${nativeCard} [data-component-width=wide] .rScV5Q_containerKpis:has(>div:nth-child(6)):not(:has(>div:nth-child(7)))>div{min-height:76px;padding:8px}
${nativeCard} .rScV5Q_containerKpis>div{
  display:flex;flex-direction:column;align-items:flex-start;
  box-sizing:border-box;min-height:82px;padding:8px 10px;gap:0;
  border:1px solid var(--research-completed-divider);border-radius:0;background:transparent;
  justify-content:flex-start;min-width:0;
}
${nativeCard} .rScV5Q_containerKpis span,
${nativeCard} [data-component-width=narrow] .rScV5Q_containerKpis span{
  font:400 11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-muted);overflow-wrap:anywhere;
}
${nativeCard} .rScV5Q_containerKpis strong,
${nativeCard} .rScV5Q_containerKpis strong[data-research-metric-positive=true]{
  margin-top:3px;font:500 22px/28px "EWork DIN Pro","Noto Sans SC",sans-serif;
  letter-spacing:0;color:var(--research-completed-text);overflow-wrap:anywhere;
}
${nativeCard} [data-component-width=wide] .rScV5Q_containerKpis:has(>div:nth-child(6)):not(:has(>div:nth-child(7))) strong{font-size:21px}
${nativeCard} .rScV5Q_containerKpis em{
  margin:0;font:400 11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-muted);overflow-wrap:anywhere;
}

/* fund72 table: 25px header, 34px single-line row, 9/17 and 9/18 type.
   Cell heights are minimums in table layout; wrapped content stays accessible. */
${nativeCard} .rScV5Q_containerTableScroll{padding:8px;overflow:visible}
${nativeCard} .rScV5Q_containerTableScroll table{
  border-collapse:separate;border-spacing:0;
  font:400 11px/18px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-text);
}
${nativeCard} .rScV5Q_containerTableScroll :is(th,td){
  box-sizing:border-box;height:25px;padding:3px 7px;vertical-align:middle;
  border:0;border-bottom:1px solid var(--research-completed-divider);font:inherit;line-height:18px;overflow-wrap:anywhere;
  color:var(--research-completed-text);
}
${nativeCard} .rScV5Q_containerTableScroll th{
  height:25px;padding:4px 6px;font-size:11px;font-weight:400;line-height:17px;
  text-align:left;color:var(--research-completed-muted);background:var(--research-completed-row);
}
${nativeCard} .rScV5Q_containerTableScroll th:first-child{border-radius:3px 0 0 3px}
${nativeCard} .rScV5Q_containerTableScroll th:last-child{border-radius:0 3px 3px 0}
${nativeCard} .rScV5Q_containerTableScroll tbody:before{display:none}
${nativeCard} .rScV5Q_containerTableScroll tbody tr:nth-child(odd){background:var(--research-completed-row)}
${nativeCard} .rScV5Q_containerTableScroll tbody tr:nth-child(odd) td:first-child{border-radius:2px 0 0 2px}
${nativeCard} .rScV5Q_containerTableScroll tbody tr:nth-child(odd) td:last-child{border-radius:0 2px 2px 0}
${nativeCard} .rScV5Q_containerTableScroll [data-numeric=true]{text-align:right}
${nativeCard} .rScV5Q_containerTableScroll td[data-numeric=true]{font-weight:500}
${nativeCard} .rScV5Q_containerTableScroll :is(th,td)[data-numeric=true]+:is(th,td):not([data-numeric=true]){padding-left:6px}
${nativeCard} .rScV5Q_containerTableScroll td :is(span,p){color:inherit;font:inherit}
body[data-ds-dark-theme] ${nativeCard} .odyssey-component-primary .rScV5Q_containerTableScroll table{color:var(--research-completed-text)}
body[data-ds-dark-theme] ${nativeCard} .odyssey-component-primary .rScV5Q_containerTableScroll th{color:var(--research-completed-muted)}

${nativeCard} .rScV5Q_containerMarkdown{
  padding:12px;font:400 12px/18px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-text);overflow-wrap:anywhere;
}
${nativeCard} .rScV5Q_containerMarkdown :is(p,li){color:inherit;font-size:inherit;line-height:inherit}
${nativeCard} .rScV5Q_containerMarkdown>:first-child{color:var(--research-completed-text)}
${nativeCard} .odyssey-component-primary .rScV5Q_containerMarkdown{--odyssey-card-text:var(--research-completed-text);color:var(--research-completed-text)}
${nativeCard} .rScV5Q_containerChart{padding:8px;background:transparent}
${nativeCard} .rScV5Q_chartLabel,
${nativeCard} [data-research-container-chart=line] .rScV5Q_chartLabel{font:400 11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;fill:var(--research-completed-muted);color:var(--research-completed-muted)}
${nativeCard} .rScV5Q_chartLegend{padding:6px 0 0;font:400 11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;color:var(--research-completed-muted)}
${nativeCard} .odyssey-native-table{min-width:0;overflow:hidden}
${nativeCard} .odyssey-native-table-controls{display:flex;align-items:center;gap:8px;margin-bottom:6px}
${nativeCard} .odyssey-native-table-controls input{box-sizing:border-box;min-width:0;flex:1;height:26px;padding:0 8px;border:1px solid var(--research-completed-divider);border-radius:2px;background:var(--research-completed-row);color:var(--research-completed-text);font:400 11px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-table-controls [role=status]{flex:none;color:var(--research-completed-muted);font:11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-table-grid{width:100%;overflow-x:auto;overflow-y:visible}
${nativeCard} .odyssey-native-table-grid table{width:100%;min-width:max-content}
${nativeCard} .odyssey-native-table-grid th{min-width:84px;white-space:nowrap}
${nativeCard} .odyssey-native-table-grid th button{width:100%;padding:0;border:0;background:none;color:inherit;text-align:inherit;font:inherit;cursor:pointer}
${nativeCard} .odyssey-native-table-grid th button:hover{color:var(--research-completed-text)}
${nativeCard} .odyssey-native-empty{margin:10px 0;color:var(--research-completed-muted);font:11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-chart{min-height:0;overflow:auto}
${nativeCard} .odyssey-native-chart svg{min-height:110px}
${nativeCard} .odyssey-native-chart svg [role=button]{cursor:pointer;outline:none}
${nativeCard} .odyssey-native-chart svg [role=button]:focus-visible{stroke:var(--research-completed-text);stroke-width:2px}
${nativeCard} .odyssey-native-chart svg [data-selected=true]{stroke:var(--research-completed-text);stroke-width:1.5px}
${nativeCard} .odyssey-native-chart .rScV5Q_chartLegend{display:flex;flex-wrap:wrap;gap:4px 10px}
${nativeCard} .odyssey-native-chart .rScV5Q_chartLegend button{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
@layer ework-workbench{
  body [data-ework-grid] [data-research-node-id] .odyssey-native-chart .rScV5Q_chartLegend button[aria-pressed]{background:transparent!important;border-color:transparent!important;color:var(--sherlock-text,var(--research-completed-text))!important}
  body [data-ework-grid] [data-research-node-id] .odyssey-native-chart .rScV5Q_chartLegend button:focus-visible{outline:1px solid var(--sherlock-control-primary,var(--research-completed-action))!important;outline-offset:-1px}
}
${nativeCard} .odyssey-native-chart .rScV5Q_chartLegend button[aria-pressed=false]{opacity:.38}
${nativeCard} .odyssey-native-chart .rScV5Q_chartLegend i{display:inline-block;width:7px;height:7px;border-radius:50%}
${nativeCard} .odyssey-native-chart-readout{padding:2px 0;color:var(--research-completed-text);font:500 11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-chart-data{color:var(--research-completed-muted);font:11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-chart-data summary{width:max-content;cursor:pointer}
${nativeCard} .odyssey-native-chart-data>div{max-height:180px;overflow:auto}
${nativeCard} .odyssey-native-chart-data table{width:100%;border-collapse:collapse;color:var(--research-completed-text);font:11px/16px "EWork DIN Pro","Noto Sans SC",sans-serif}
${nativeCard} .odyssey-native-chart-data :is(th,td){padding:3px 6px;border-bottom:1px solid var(--research-completed-divider);text-align:right;white-space:nowrap}
${nativeCard} .odyssey-native-chart-data :is(th,td):first-child{text-align:left}

/* Actions are neutral. Do not recolor chart paths, legend swatches, status
   tokens or the canvas' --odyssey-select / selection pseudo-element. */
${card} :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand){
  background:var(--research-completed-control);border-color:var(--research-completed-control-border);
  color:var(--research-completed-control-muted);
}
${card} :is(.rScV5Q_containerMenuTrigger,.rScV5Q_containerExpand):hover{background:var(--research-completed-row);color:var(--research-completed-action)}
${card} .rScV5Q_nodeTitleActions{background:var(--research-completed-surface)}
${card} :is(.rScV5Q_containerTableScroll,.rScV5Q_containerMarkdown) a,
${card} .odyssey-derived-sources>button{color:var(--research-completed-action)}
${card} .odyssey-component-summary-note,
${card} .rScV5Q_artifactMeta{padding-right:12px;padding-left:12px;color:var(--research-completed-muted)}

/* Terminal: continuous rows, sticky field labels, and a data-bearing chart. */
${nativeCard} .rScV5Q_containerTableScroll :is(th,td){border-radius:0!important}
${nativeCard} .rScV5Q_containerTableScroll th{color:var(--research-completed-action);position:sticky;top:0;z-index:1}
${nativeCard} .rScV5Q_containerTableScroll tbody tr:hover{background:var(--research-completed-inset)}
${nativeCard} .rScV5Q_containerTableScroll tbody td:first-child{color:var(--sherlock-chart-1)}
${nativeCard} .odyssey-native-table-grid{max-height:calc(100cqh - 86px);overflow:auto}
${nativeCard} .odyssey-native-chart{display:flex;flex-direction:column;gap:8px;height:100%}
${nativeCard} .odyssey-native-chart svg{flex:1;width:100%;height:clamp(160px,calc(100cqh - 122px),360px)}
${nativeCard} .odyssey-native-chart .rScV5Q_chartLegend{order:-2;padding:0 0 4px;border-bottom:1px solid var(--research-completed-divider)}
${nativeCard} .odyssey-native-chart-readout{order:-1;margin-bottom:4px;padding:4px 0;color:var(--research-completed-action)}
${nativeCard} .odyssey-native-chart-data{margin-top:4px;border-top:1px solid var(--research-completed-divider)}
${nativeCard} .odyssey-native-chart-data summary{min-height:24px;padding:3px 0}
${nativeCard} .rScV5Q_containerKpis{grid-template-columns:repeat(3,minmax(0,1fr))}
${card}{container-type:size}

${nativeCard} .rScV5Q_chartGrid{stroke:var(--research-completed-divider);stroke-width:.7}
${nativeCard} .rScV5Q_chartAxis{stroke:var(--research-completed-divider);stroke-width:1}
${card}{--sherlock-chart-1:#0076a8;--sherlock-chart-2:#9f6811;--sherlock-chart-3:#8356b7;--sherlock-chart-4:#bd8420;--sherlock-chart-5:#008368;--sherlock-chart-6:#bc3545}
body[data-ds-dark-theme] ${card}{--sherlock-chart-1:#6bccf2;--sherlock-chart-2:#ffbd69;--sherlock-chart-3:#b29ae3;--sherlock-chart-4:#ebd875;--sherlock-chart-5:#4bd3a3;--sherlock-chart-6:#ff7380}
`
