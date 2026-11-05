import {OPEN_TERMINAL_LAYOUT_CSS} from './openterminal-layout.js'
import {TIMELINE_PRESENTATION_CSS} from './timeline-presentation.js';
import {KPI_PRESENTATION_CSS} from './kpi-presentation.js';
import {WORKBENCH_MODE_CSS} from './workbench-style.js'
import {CALENDAR_PRESENTATION_CSS} from './calendar-presentation.js'
import {WORKBENCH_TABLE_COLUMNS_CSS} from './workbench-table-columns.js'
// Presentation only: the artifact's data, DOM and event handlers stay intact.
export const WORKBENCH_PRESENTATION_CSS = `/* EWORK_OPENBB_COMPONENT_V1 */
@layer ework-workbench {
:root{--sherlock-price-up:#df4f57!important;--sherlock-price-down:#00a83e!important}
:root[data-sherlock-theme="dark"]{--sherlock-price-up:#ee5962!important;--sherlock-price-down:#00c84a!important}
:root{--sherlock-bg:#fff!important;--sherlock-surface:#fff!important;--sherlock-surface-muted:#f4f4f6!important;--sherlock-text:#25252b!important;--sherlock-muted:#777781!important;--sherlock-border:#dedee3!important;--sherlock-row-alternate:#f4f4f6!important;--sherlock-row-selected:#e8f2fc!important;--sherlock-control-bg:#f4f4f6!important;--sherlock-control-border:#d1d1d8!important;--sherlock-control-text:#25252b!important;--sherlock-control-primary:#168cf0!important;--sherlock-control-on-primary:#fff!important;--sherlock-link:#168cf0!important;--sherlock-chart-label:#777781!important;--sherlock-chart-grid:#dedee3!important;--sherlock-chart-crosshair:#a0a0ab!important;--sherlock-market-positive:#00a83e!important;--sherlock-market-negative:#df4f57!important}
:root[data-sherlock-theme="dark"]{--sherlock-bg:#151518!important;--sherlock-surface:#151518!important;--sherlock-surface-muted:#24242b!important;--sherlock-text:#e8e8ed!important;--sherlock-muted:#a0a0ab!important;--sherlock-border:#303036!important;--sherlock-row-alternate:#24242b!important;--sherlock-row-selected:#223147!important;--sherlock-control-bg:#1d1d23!important;--sherlock-control-border:#45454e!important;--sherlock-control-text:#e8e8ed!important;--sherlock-chart-label:#a0a0ab!important;--sherlock-chart-grid:#3c3c43!important;--sherlock-market-positive:#00c84a!important;--sherlock-market-negative:#ee5962!important}
:root{--sherlock-font-sans:Inter,"Noto Sans SC",system-ui,sans-serif!important;--sherlock-font-mono:Inter,"Noto Sans SC",system-ui,sans-serif!important;--sherlock-chart-1:#5b9bd5!important;--sherlock-chart-2:#f2a746!important;--sherlock-chart-3:#509760!important;--sherlock-chart-4:#ded800!important;--sherlock-chart-5:#25b6cd!important;--sherlock-chart-6:#9b73c5!important;--sherlock-market-table-text:var(--sherlock-text)!important;--sherlock-market-table-muted:var(--sherlock-muted)!important;--sherlock-market-table-heading:var(--sherlock-surface-muted)!important;--sherlock-market-row-highlight:var(--sherlock-surface)!important;--sherlock-market-row-alternate:var(--sherlock-row-alternate)!important;--terminal-heading:var(--sherlock-text)!important;--terminal-link:var(--sherlock-link)!important;--fund-bg:var(--sherlock-bg)!important;--fund-surface:var(--sherlock-surface)!important;--fund-muted:var(--sherlock-surface-muted)!important;--fund-row:var(--sherlock-row-alternate)!important;--fund-text:var(--sherlock-text)!important;--fund-secondary:var(--sherlock-muted)!important;--fund-line:var(--sherlock-border)!important;--fund-track:var(--sherlock-surface-muted)!important;--fund-blue:var(--sherlock-chart-1)!important;--fund-cyan:var(--sherlock-chart-5)!important;--fund-positive:var(--sherlock-market-positive)!important}
html,body{background:var(--sherlock-bg)!important;color:var(--sherlock-text)!important;font:400 12px/18px var(--sherlock-font-sans)!important;font-variant-numeric:tabular-nums!important;scrollbar-width:thin;scrollbar-color:var(--sherlock-scrollbar-thumb,#0000001a) transparent}
body{margin:0!important;padding:8px 10px!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;overflow:auto!important;backdrop-filter:none!important}
body :is(p,span,label,div,button,input,select,textarea,th,td,summary,small,strong,h1,h2,h3,h4){font-family:var(--sherlock-font-sans)!important}
body :is(button,input,select,textarea){font-size:12px!important;line-height:18px!important;border-radius:3px!important;box-shadow:none!important;accent-color:var(--sherlock-control-primary)}
/* Record selectors and evidence headers can contain several lines. Keep the
   toolbar minimum, while allowing their content to determine the height. */
body :is(button:not(.market-tile),[role="button"]:not(rect):not(circle)){height:auto!important;min-height:26px!important;padding:4px 8px!important}
body :is(input,select,textarea){background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;padding:2px 7px!important;box-sizing:border-box!important;min-width:0!important;max-width:100%!important}
body :is(input,textarea)::placeholder{color:var(--sherlock-control-muted,var(--sherlock-muted))!important;opacity:1}
body :is(input:not([type="checkbox"]):not([type="radio"]),select){height:26px!important;min-height:26px!important}
body :is(button,input,select,textarea):focus-visible{outline:1px solid var(--sherlock-control-primary)!important;outline-offset:-1px!important}
body :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),select,textarea):focus{border-color:var(--sherlock-control-primary)!important;outline:1px solid var(--sherlock-control-primary)!important;outline-offset:-1px!important}
body :is(.controls,.fund-filters,.fund-industry-filters,.market-candle-controls,.price-volume-controls,.order-book-controls,.fund-flow-controls,.valuation-controls,.equity-controls,.risk-controls,.event-filters,.terminal-table-toolbar){gap:6px!important;flex-wrap:wrap!important}
body :is(.controls,.fund-filters,.fund-industry-filters,.market-candle-controls,.price-volume-controls,.order-book-controls,.fund-flow-controls,.valuation-controls,.equity-controls,.risk-controls,.event-filters,.terminal-table-toolbar) button{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;min-height:26px!important;padding:2px 7px!important}
body button[aria-pressed="true"]{background-color:var(--sherlock-control-primary)!important;color:var(--sherlock-control-on-primary)!important;border-color:var(--sherlock-control-primary)!important}
body .series-controls button[aria-pressed="true"]{background:var(--sherlock-row-selected)!important;color:var(--sherlock-control-text)!important}
/* Schedule rows are record selectors, not fixed-height toolbar controls. */
body[data-research-kind="gantt"] .gantt-task{height:auto!important;min-height:0!important;max-height:none!important;white-space:normal!important;overflow:visible!important;padding:3px 0!important;border:0!important;border-radius:0!important;background-color:transparent!important;color:var(--sherlock-text)!important;text-align:left!important}
body[data-research-kind="view"] :is(.dv-record-select,.dv-schedule-select){height:auto!important;min-height:0!important;max-height:none!important;padding:3px 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--sherlock-text)!important;text-align:left!important}
body[data-research-kind="view"] .dv-schedule-select{white-space:normal!important;overflow:visible!important}
body .series-legend button{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border-color:var(--sherlock-control-border)!important}
body button.fund-industry{background:var(--sherlock-row-alternate)!important;color:var(--sherlock-text)!important;border:0!important;border-radius:0!important;outline:0!important;min-height:30px!important;padding:4px 8px!important;grid-template-columns:minmax(72px,90px) minmax(0,1fr) 48px!important;gap:8px!important}
body button.fund-industry:is(:hover,[aria-pressed="true"]){background:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important;border:0!important;outline:0!important}
body button.fund-industry:focus-visible{outline:1px solid var(--sherlock-muted)!important;outline-offset:-1px!important}
body button.fund-industry :is(.fund-industry-label,.fund-industry-value){color:var(--sherlock-text)!important;font-size:12px!important;line-height:18px!important}
body .fund-industry-readout:empty{display:none!important}
body :is(table,.fund-table){width:100%!important;border-collapse:collapse!important;font:400 12px/18px var(--sherlock-font-sans)!important;color:var(--sherlock-text)!important;background:var(--sherlock-bg)!important}
body:not([data-sherlock-market]) table{table-layout:auto!important}
body :is(th,td){height:26px!important;box-sizing:border-box!important;padding:4px 8px!important;border:0!important;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;font-size:12px!important;line-height:18px!important}
/* Keep full source values on one line; wider data scrolls horizontally. */
body .financial-profile :is(th,td){white-space:nowrap!important;overflow-wrap:normal!important}
body th{position:sticky;top:0;z-index:1;background:var(--sherlock-surface-muted)!important;color:var(--sherlock-text)!important;font-weight:500!important}
body th button{border:0!important;background:none!important;color:inherit!important;padding:0!important;text-align:inherit!important;font:inherit!important;min-height:0!important}
body tbody tr{background:var(--sherlock-bg)!important}body tbody tr:nth-child(even){background:var(--sherlock-row-alternate)!important}body tbody tr:hover,body tbody tr[aria-selected="true"]{background:var(--sherlock-row-selected)!important}
body td{background:transparent!important}body:where([data-sherlock-market]) td{color:var(--sherlock-text)!important}body:where(:not([data-sherlock-market])) :where(td){color:var(--sherlock-text)}body :is(td,th)[data-numeric="true"]{text-align:right!important}body :is(td,th)[data-numeric="false"]{text-align:left!important}
/* Native observed-source tables retain explicit business markings under host defaults. */
body[data-sherlock-source-view] tbody tr.highlight{background:var(--sherlock-row-selected)!important}
body[data-sherlock-source-view] td.inflow{color:var(--sherlock-status-danger-fg)!important}
body[data-sherlock-source-view] td.outflow{color:var(--sherlock-status-success-fg)!important}
body [data-tone="positive"],body:where([data-sherlock-market]) :is(.positive,.up):not(button,summary,[role="button"],input,select,textarea){color:var(--sherlock-market-positive)!important}body [data-tone="negative"],body:where([data-sherlock-market]) :is(.negative,.down):not(button,summary,[role="button"],input,select,textarea){color:var(--sherlock-market-negative)!important}
/* Class names alone do not define the business color convention of an authored
   page. Keep a fallback, but let its explicit host-role color win (e.g. red
   inflow / green outflow). Native market and explicit data-tone stay owned. */
body:where(:not([data-sherlock-market])) :where(.positive,.up){color:var(--sherlock-market-positive)}body:where(:not([data-sherlock-market])) :where(.negative,.down){color:var(--sherlock-market-negative)}
body :is(.market-metrics,.fund-kpis){display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px 12px!important;border:0!important;min-height:0!important}
body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi){padding:0!important;min-height:0!important;background:none!important;border:0!important;border-radius:0!important}
body :is(.market-label,.fund-label,.research-metric-label,.kpi-label){font-size:12px!important;font-weight:400!important;color:var(--sherlock-muted)!important;line-height:18px!important}
body :is(.market-value,.fund-value,.research-metric-value,.kpi-value){font-size:18px!important;line-height:25px!important;font-weight:600!important;overflow-wrap:anywhere!important}
body :is(.market-value,.fund-value,.research-metric-value,.kpi-value):where(:not(.positive):not(.negative):not(.up):not(.down):not([data-tone])){color:var(--sherlock-text)!important}
body :is(.market-detail,.fund-detail,.research-metric-detail,.kpi-detail){font-size:11px!important;line-height:17px!important;color:var(--sherlock-muted)!important}
body :is(.market-footer,.fund-footer,.fund-industry-footer,.market-ohlc,.trend-readout,.scatter-readout,.terminal-table-readout){font-size:11px!important;line-height:17px!important;color:var(--sherlock-muted)!important;background:transparent!important;border-color:var(--sherlock-border)!important;min-width:0!important;overflow-wrap:anywhere!important}
body :is(.market-table-wrap,.fund-table-wrap){min-width:0!important;min-height:0!important;overflow:auto!important;max-height:calc(100vh - 68px)!important;border:0!important}
body[data-sherlock-market="table"]{display:flex!important;flex-direction:column!important;height:100vh!important;overflow:hidden!important}
body[data-sherlock-market="table"]>.terminal-table-toolbar,body[data-sherlock-market="table"]>.terminal-table-readout{flex:0 0 auto!important}
body[data-sherlock-market="table"] .market-table-wrap{flex:1 1 auto!important;max-height:none!important}
body[data-sherlock-market="table"]>.market-footer{flex:0 0 auto!important;max-height:40%;overflow:auto!important;margin-top:8px!important}
body[data-sherlock-market="table"]>.market-footer>span{flex:1 1 100%;min-width:0}
body[data-sherlock-market="table"]>.market-footer>span:empty,body[data-sherlock-market="table"]>.terminal-table-readout:empty{display:none!important}
body[data-sherlock-market="metrics"]{display:flex!important;flex-direction:column!important;height:100vh!important;overflow:hidden!important}
body[data-sherlock-market="metrics"] .market-metrics{flex:1 1 auto;overflow:auto!important;align-content:start!important;grid-auto-rows:max-content!important}
body[data-sherlock-market="metrics"] .market-metric{display:flex!important;flex-direction:column!important;align-items:stretch!important}
body[data-sherlock-market="metrics"] .market-metric>:is(.market-label,.market-value,.market-detail){display:block!important;flex:none!important}
body[data-sherlock-market="metrics"]>.market-footer{flex:0 0 auto;max-height:35%;overflow:auto;min-height:17px;margin-top:8px!important}
body[data-sherlock-market="metrics"]>.market-footer>span{flex:1 1 100%;min-width:0}
body[data-sherlock-market="fund-holdings"]{display:flex!important;flex-direction:column!important;height:100vh!important;overflow:hidden!important}
body[data-sherlock-market="fund-holdings"] .fund-filters{flex:0 0 auto;margin-bottom:12px!important}
body[data-sherlock-market="fund-holdings"] .fund-table-wrap{flex:1 1 auto;max-height:none!important}
body[data-sherlock-market="fund-holdings"] .fund-footer{flex:0 0 auto;min-height:17px;margin-top:6px!important}
body :is(.market-candle,.market-trend,.market-scatter,.market-price-volume,.market-fund-flow){min-width:0!important;min-height:0!important;background:transparent!important;border:0!important}
body :is(.trend-head,.trend-legend){font-size:11px!important;line-height:17px!important;gap:8px!important;flex-wrap:wrap!important;color:var(--sherlock-muted)!important}
body :is(.trend-key,.sample-entry,.allocation-legend button){background:transparent!important;border:0!important;border-radius:0!important;min-height:22px!important;padding:1px 4px!important;color:var(--sherlock-text)!important}
body button[data-chart-series][aria-pressed]{background:transparent!important;border:0!important;border-radius:0!important;min-height:22px!important;height:22px!important;padding:1px 4px!important;color:var(--sherlock-text)!important}
body .trend-1{color:var(--sherlock-chart-1)!important}body .trend-2{color:var(--sherlock-chart-2)!important}body .trend-3{color:var(--sherlock-chart-3)!important}
body :is(.research-feed-item,.risk-item,.event){background:none!important;border:0!important;border-bottom:1px solid var(--sherlock-border)!important;border-radius:0!important;padding:8px 0!important}
body :is(.feed-copy h2,.event strong){font-size:12px!important;line-height:18px!important;font-weight:500!important;color:var(--sherlock-text)!important}
body :is(.feed-meta,.feed-details,.event small){font-size:11px!important;line-height:17px!important;color:var(--sherlock-muted)!important}
body .research-feed-item{min-width:0!important;grid-template-columns:104px minmax(0,1fr)!important;column-gap:10px!important}
body .feed-meta{display:flex!important;flex-direction:column!important;align-items:flex-start!important;min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important;gap:2px!important}
body .feed-meta :is(time,.feed-category){max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important}
body .feed-copy{min-width:0!important;overflow-wrap:anywhere!important}
body a{color:var(--sherlock-link)!important}body summary{background:transparent!important;color:var(--sherlock-muted)!important;font-size:11px!important;line-height:17px!important}
body :is(.rScV5Q_containerTableScroll,.rScV5Q_containerMarkdown){padding:8px 10px!important;min-height:0!important;overflow:auto!important}
body .rScV5Q_containerKpis{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;padding:8px 10px!important;gap:6px 12px!important;overflow:auto!important}
body .rScV5Q_containerKpis>div{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;min-width:0!important}
body .rScV5Q_containerKpis strong{font-size:18px!important;line-height:25px!important;font-weight:600!important;color:var(--sherlock-text)!important;overflow-wrap:anywhere!important}
body .rScV5Q_containerKpis :is(span,em){font-size:12px!important;line-height:18px!important;color:var(--sherlock-muted)!important}
body .rScV5Q_chartLegend{padding:8px 10px!important;gap:10px!important;font-size:11px!important;color:var(--sherlock-muted)!important}
body .rScV5Q_mindMap{padding:12px!important;gap:20px!important;background:var(--sherlock-bg)!important}
body .rScV5Q_mindMapNode{border:1px solid var(--sherlock-border)!important;border-radius:3px!important;background:var(--sherlock-surface-muted)!important;color:var(--sherlock-text)!important;padding:8px 10px!important;font-size:12px!important}
@media(max-width:440px){body :is(.controls,.terminal-table-toolbar){align-items:stretch!important}body .terminal-table-toolbar input{flex:1!important;width:100%!important}body .research-feed-item{grid-template-columns:minmax(0,1fr)!important;gap:3px!important}body .feed-meta{flex-direction:row!important;flex-wrap:wrap!important;align-items:baseline!important;gap:2px 6px!important}body[data-research-kind="calendar"]{display:block!important}body .market-value{font-size:16px!important}}
@media(max-width:480px){body :is(.market-metrics,.fund-kpis){grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:240px){body :is(.market-metrics,.fund-kpis){grid-template-columns:minmax(0,1fr)!important}}
${KPI_PRESENTATION_CSS}
${TIMELINE_PRESENTATION_CSS}
${CALENDAR_PRESENTATION_CSS}
${WORKBENCH_TABLE_COLUMNS_CSS}
${WORKBENCH_MODE_CSS}
body .terminal-table-toolbar{display:flex!important;align-items:center!important;gap:12px!important;margin-bottom:6px!important}body .terminal-table-toolbar input{flex:1 1 160px!important;min-width:80px!important}body .terminal-table-toolbar [data-market-count]{flex:none!important;white-space:nowrap!important}
${OPEN_TERMINAL_LAYOUT_CSS}
}`

export function applyWorkbenchPresentation(html) {
  if (typeof html !== 'string') return html
  return html.replace(/<style>\/\* ODYSSEY_TERMINAL_20260926 \*\/[\s\S]*?<\/style>/g, '')
}
