// Completed component shells and native content use the current 21H fund72/Lumos profile.
// Source: 1217:247146 (shell/KPI), 1217:247167 (table), and 1217:239973
// (Dark surface). This is not a replacement for the distinct classic financial
// glass profile. Drafts, initial generation and maps are excluded; HTML receives
// shell rules only and its sandboxed document retains its own scoped renderer.
const nativeContent = ':is([data-research-container-type="kpi"],[data-research-container-type="table"],[data-research-container-type="chart"],[data-research-container-type="markdown"])'
const root = '[data-research-compact-chrome][data-research-generated-container]'
const nativeCard = `${root}:has(${nativeContent})`
const completedContent = `:is(${nativeContent},[data-research-container-type="html"],[data-research-container-type="web"],[data-research-container-type="news"],.rScV5Q_webFrame)`
const card = `${root}:has(${completedContent}):not([data-research-generated-mind-map])`

// Scope by existing content, rather than generationStatus: a refresh must keep
// the last successful content's appearance while its independent status changes.
export const researchCompletedDesignCss = `
${card}{
  --research-completed-surface:#fafafa;
  --research-completed-inset:#ebf1f5;
  --research-completed-text:#202629;
  --research-completed-muted:#65717a;
  --research-completed-divider:#e1e6e9;
  --research-completed-row:#f0f3f5;
  --research-completed-action:#333333;
  --research-completed-control:#ffffff;
  --research-completed-control-border:#d9d9d9;
  --research-completed-control-muted:#777777;
  --odyssey-card:var(--research-completed-surface);
  --odyssey-content:var(--research-completed-surface);
  --odyssey-card-border:var(--research-completed-divider);
  --odyssey-card-text:var(--research-completed-text);
  --odyssey-card-muted:var(--research-completed-muted);
  border-width:0!important;border-radius:8px!important;
  background:var(--research-completed-surface)!important;
  color:var(--research-completed-text);
  font-family:"EWork DIN Pro","Noto Sans SC",sans-serif;
  font-synthesis:none;
}
/* Preserve the canvas selection paint after removing the transparent layout
   border: its existing blue overlay now aligns with the actual card bounds. */
${card}[data-selected=true]::after{inset:0}
body[data-ds-dark-theme] ${card}{
  --research-completed-surface:#303030;
  --research-completed-inset:#3b3b3b;
  --research-completed-text:#f4f5f6;
  --research-completed-muted:#b9bec3;
  --research-completed-divider:#454545;
  --research-completed-row:#353b40;
  --research-completed-action:#f5f5f5;
  --research-completed-control:#292929;
  --research-completed-control-border:#505050;
  --research-completed-control-muted:#a0a0a0;
}
${card}>.rScV5Q_nodeTitle{
  box-sizing:border-box;position:relative;height:48px;min-height:48px;flex-basis:48px;
  padding:14px 12px!important;border-radius:8px 8px 0 0;
  align-items:center;border-bottom:0!important;
  background:var(--research-completed-surface);
}
${card}>.rScV5Q_nodeTitle:after{
  content:'';position:absolute;left:12px;right:12px;top:47px;height:.5px;
  background:var(--research-completed-divider);pointer-events:none;
}
${card} :is(.rScV5Q_nodeTitleText,[data-research-derived-title]){
  font-family:"Noto Sans SC","EWork DIN Pro",sans-serif;
  font-size:13px!important;font-weight:700;line-height:20px;
  color:var(--research-completed-text);
}
${card}>.rScV5Q_previewBody{height:calc(100% - 48px);border-radius:0 0 8px 8px}
${card} :is(.rScV5Q_artifactBody,.rScV5Q_generatedContainer,.rScV5Q_containerContent){background:var(--research-completed-surface)!important;border-radius:0 0 8px 8px}
${card} .rScV5Q_webFrame{border-radius:0 0 8px 8px}
${nativeCard} .odyssey-component-content{color:var(--research-completed-text);font:400 12px/18px "EWork DIN Pro","Noto Sans SC",sans-serif}

/* 72 KPI: y56, 64px cell, label y6/14, value y23/26, detail y49/11.
   min-height retains the source density while allowing long user text to wrap. */
${nativeCard} .rScV5Q_containerKpis{padding:8px 12px 12px;gap:10px;align-content:start}
${nativeCard} .rScV5Q_containerKpis>div{
  box-sizing:border-box;min-height:64px;padding:6px 10px 4px;gap:0;
  border:0;border-radius:5px;background:var(--research-completed-inset);
  justify-content:flex-start;min-width:0;
}
${nativeCard} .rScV5Q_containerKpis span,
${nativeCard} [data-component-width=narrow] .rScV5Q_containerKpis span{
  font:400 9px/14px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-muted);overflow-wrap:anywhere;
}
${nativeCard} .rScV5Q_containerKpis strong,
${nativeCard} .rScV5Q_containerKpis strong[data-research-metric-positive=true]{
  margin-top:3px;font:500 23px/26px "EWork DIN Pro","Noto Sans SC",sans-serif;
  letter-spacing:0;color:var(--research-completed-text);overflow-wrap:anywhere;
}
${nativeCard} .rScV5Q_containerKpis em{
  margin:0;font:400 8px/11px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-muted);overflow-wrap:anywhere;
}

/* fund72 table: 25px header, 34px single-line row, 9/17 and 9/18 type.
   Cell heights are minimums in table layout; wrapped content stays accessible. */
${nativeCard} .rScV5Q_containerTableScroll{padding:12px;overflow:visible}
${nativeCard} .rScV5Q_containerTableScroll table{
  border-collapse:separate;border-spacing:0;
  font:400 9px/18px "EWork DIN Pro","Noto Sans SC",sans-serif;
  color:var(--research-completed-text);
}
${nativeCard} .rScV5Q_containerTableScroll :is(th,td){
  box-sizing:border-box;height:34px;padding:8px 6px;vertical-align:middle;
  border:0;font:inherit;line-height:18px;overflow-wrap:anywhere;
  color:var(--research-completed-text);
}
${nativeCard} .rScV5Q_containerTableScroll th{
  height:25px;padding:4px 6px;font-size:9px;font-weight:400;line-height:17px;
  text-align:left;color:var(--research-completed-muted);background:var(--research-completed-row);
}
${nativeCard} .rScV5Q_containerTableScroll th:first-child{border-radius:3px 0 0 3px}
${nativeCard} .rScV5Q_containerTableScroll th:last-child{border-radius:0 3px 3px 0}
${nativeCard} .rScV5Q_containerTableScroll tbody:before{content:'';display:table-row;height:4px}
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
${nativeCard} .rScV5Q_containerChart{padding:12px;background:transparent}
${nativeCard} .rScV5Q_chartLabel,
${nativeCard} [data-research-container-chart=line] .rScV5Q_chartLabel{font:400 9px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;fill:var(--research-completed-muted);color:var(--research-completed-muted)}
${nativeCard} .rScV5Q_chartLegend{padding:6px 0 0;font:400 9px/16px "EWork DIN Pro","Noto Sans SC",sans-serif;color:var(--research-completed-muted)}

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
`
