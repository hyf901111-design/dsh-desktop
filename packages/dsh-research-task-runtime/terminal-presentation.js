// Dense, data-first workbench presentation. Only deterministic host templates
// receive this sheet; user HTML and the application's navigation are untouched.
export const TERMINAL_PRESENTATION_CSS = `/* ODYSSEY_TERMINAL_20260926 */
@layer sherlock-terminal{
body :is(button,input,select){border-radius:2px!important}
body summary{background:transparent!important}
body :is(.trend-key,.sample-entry,.gantt-task,.days button,.month-nav button,.agenda-head button){background:transparent!important;color:var(--sherlock-text)!important;height:auto!important;min-height:22px!important;padding:2px 4px!important;border:0!important}
body :is(.trend-key,.sample-entry,.gantt-task)[aria-pressed="true"]{background:transparent!important;color:var(--sherlock-text)!important}
body .trend-key.trend-1{color:var(--sherlock-chart-1)!important}body .trend-key.trend-2{color:var(--sherlock-chart-2)!important}body .trend-key.trend-3{color:var(--sherlock-chart-3)!important}
body .sample-entry[aria-pressed="true"],body .days button[aria-pressed="true"]{background:var(--sherlock-row-selected)!important;box-shadow:inset 2px 0 var(--sherlock-control-primary)!important}
body .risk-cell{height:28px!important;min-height:28px!important;padding:0!important;border:1px solid var(--sherlock-border)!important}
body .risk-cell[data-grade="low"]{background:var(--sherlock-status-success-bg)!important;color:var(--sherlock-status-success-fg)!important}
body .risk-cell[data-grade="medium"]{background:var(--sherlock-status-warning-bg)!important;color:var(--sherlock-status-warning-fg)!important}
body .risk-cell[data-grade="high"]{background:#773d47!important;color:#ffe0e3!important}
body .risk-cell[aria-pressed="true"]{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}
body :is(.risk-item,.funnel-stage){height:auto!important;min-height:28px!important;background:transparent!important;color:var(--sherlock-text)!important;padding:4px 6px!important;border:0!important;border-bottom:1px solid var(--sherlock-border)!important}
body :is(.risk-item,.funnel-stage)[aria-pressed="true"]{background:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important;box-shadow:inset 2px 0 var(--sherlock-control-primary)!important}
body :is(.controls,.fund-filters,.fund-industry-filters,.market-candle-controls,.price-volume-controls,.order-book-controls,.fund-flow-controls,.valuation-controls,.equity-controls,.risk-controls,.event-filters,.terminal-table-toolbar) :is(button,input,select){height:24px!important;min-height:24px!important;border:1px solid var(--sherlock-control-border)!important;border-radius:2px!important;padding:1px 7px!important;background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important}
body :is(.controls,.market-candle-controls,.price-volume-controls,.order-book-controls,.valuation-controls,.equity-controls,.risk-controls) button[aria-pressed="true"]{background:var(--sherlock-control-primary)!important;color:var(--sherlock-control-on-primary)!important;border-color:var(--sherlock-control-primary)!important}
body :is(.feed-details, .market-candle+details) summary{background:transparent!important;color:var(--sherlock-muted)!important}
body :is(.fund-flow-row,.order-book-level,.fund-industry,.allocation-legend button){border-radius:0!important;min-height:26px!important;height:auto!important;padding:3px 6px!important;background-color:transparent!important;border-bottom:1px solid var(--sherlock-border)!important}
body .fund-flow-row[aria-pressed="true"],body .order-book-level[aria-selected="true"],body .fund-industry[aria-pressed="true"]{background-color:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important;outline:1px solid var(--sherlock-control-primary)}
body .allocation-legend button{color:var(--sherlock-text)!important;border:0!important}
body .fund-table th button{height:auto!important;min-height:0!important;border:0!important;padding:0!important;background:transparent!important;color:var(--terminal-heading)!important;text-align:inherit}
body .drawdown-controls button{height:24px!important;min-height:24px!important;padding:1px 7px!important;border:1px solid var(--sherlock-control-border)!important;background:var(--sherlock-control-bg)!important}
body .drawdown-controls button[aria-pressed="true"]{background:var(--sherlock-control-primary)!important;color:var(--sherlock-control-on-primary)!important}
}
:root{--terminal-heading:#80500c;--terminal-link:#086e9b;--sherlock-bg:#fff;--sherlock-surface:#fff;--sherlock-surface-muted:#edf1f5;--sherlock-text:#1b2734;--sherlock-muted:#56677a;--sherlock-border:#d4dce5;--sherlock-control-bg:#f6f8fa;--sherlock-control-border:#c5cfda;--sherlock-control-text:#27394a;--sherlock-control-muted:#64768a;--sherlock-control-primary:#835308;--sherlock-control-on-primary:#fff;--sherlock-row-selected:#e4eef7;--sherlock-row-alternate:#f5f7fa;--sherlock-link:#086e9b;--sherlock-chart-1:#0076a8;--sherlock-chart-2:#9f6811;--sherlock-chart-3:#8356b7;--sherlock-chart-4:#bd8420;--sherlock-chart-5:#008368;--sherlock-chart-6:#bc3545;--sherlock-chart-label:#56677a;--sherlock-chart-grid:#dde4ec;--sherlock-chart-crosshair:#8295a8;--sherlock-market-positive:#c23043;--sherlock-market-negative:#008168;--sherlock-market-table-text:var(--sherlock-text);--sherlock-market-table-muted:var(--terminal-heading);--sherlock-market-table-heading:var(--sherlock-surface-muted);--sherlock-market-row-highlight:var(--sherlock-surface);--sherlock-market-row-alternate:var(--sherlock-row-alternate)}
:root[data-sherlock-theme="dark"]{--terminal-heading:#ffbc66;--terminal-link:#75cfff;--sherlock-bg:#11161c;--sherlock-surface:#11161c;--sherlock-surface-muted:#1c252f;--sherlock-text:#e1e8f0;--sherlock-muted:#98a9bc;--sherlock-border:#303d4b;--sherlock-control-bg:#19222c;--sherlock-control-border:#3c4b5c;--sherlock-control-text:#d6e0eb;--sherlock-control-muted:#a7b6c8;--sherlock-control-primary:#ffbc66;--sherlock-control-on-primary:#171b21;--sherlock-row-selected:#263b4d;--sherlock-row-alternate:#151d26;--sherlock-link:#75cfff;--sherlock-chart-1:#6bccf2;--sherlock-chart-2:#ffbd69;--sherlock-chart-3:#b29ae3;--sherlock-chart-4:#ebd875;--sherlock-chart-5:#4bd3a3;--sherlock-chart-6:#ff7380;--sherlock-chart-label:#98a9bc;--sherlock-chart-grid:#293641;--sherlock-chart-crosshair:#889aaf;--sherlock-market-positive:#ff7380;--sherlock-market-negative:#4bd3a3;--sherlock-market-table-text:var(--sherlock-text);--sherlock-market-table-muted:var(--terminal-heading);--sherlock-market-table-heading:var(--sherlock-surface-muted);--sherlock-market-row-highlight:var(--sherlock-surface);--sherlock-market-row-alternate:var(--sherlock-row-alternate)}
:root,:root[data-sherlock-theme]{--fund-bg:var(--sherlock-bg);--fund-surface:var(--sherlock-surface);--fund-muted:var(--sherlock-surface-muted);--fund-row:var(--sherlock-row-alternate);--fund-text:var(--sherlock-text);--fund-secondary:var(--sherlock-muted);--fund-line:var(--sherlock-border);--fund-track:var(--sherlock-surface-muted);--fund-blue:var(--sherlock-chart-1);--fund-cyan:var(--sherlock-chart-2);--fund-positive:var(--sherlock-market-positive)}
html{background:var(--sherlock-surface)}body,body[data-sherlock-market],body[data-research-kind]{padding:8px!important;background:var(--sherlock-surface)!important;color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);font-variant-numeric:tabular-nums;backdrop-filter:none!important;scrollbar-width:thin;scrollbar-color:var(--sherlock-scrollbar-thumb,#e1e1e1) transparent}
body :is(button,input,select){font:11px/18px var(--sherlock-font-sans);border-radius:2px!important;min-height:24px;accent-color:var(--sherlock-control-primary)}
body :is(select,input){height:26px;padding:2px 7px;border:1px solid var(--sherlock-control-border);background:var(--sherlock-control-bg);color:var(--sherlock-control-text)}
body :is(button,summary,input,select):focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}
body button:not(.market-tile):hover{filter:brightness(1.1)}
body :is(table,.fund-table){border-collapse:collapse;width:100%;font-size:12px;line-height:18px}
body :is(th,td),body[data-sherlock-market="table"] :is(th,td),body .fund-table :is(th,td){height:25px;padding:3px 7px;border-bottom:1px solid var(--sherlock-border);font-size:12px;line-height:18px;white-space:nowrap}
body th,body[data-sherlock-market="table"] th,body .fund-table th{height:26px;font-size:11px;line-height:18px;color:var(--terminal-heading);background:var(--sherlock-surface-muted);font-weight:500;position:sticky;top:0;z-index:1}
body th button{width:100%;text-align:inherit;min-height:0}
body tbody tr:first-child{background:transparent}body tbody tr:nth-child(even){background:var(--sherlock-row-alternate)}body tbody tr:hover{background:var(--sherlock-row-selected)}
body :is(td,th)[data-numeric="false"]{text-align:left}body :is(td,th)[data-numeric="true"]{text-align:right}
body tbody td:first-child{color:var(--terminal-link)}
body :is(.market-footer,.fund-footer,.fund-industry-footer){padding-top:5px;margin-top:6px;border-top:1px solid var(--sherlock-border);font-size:11px;line-height:16px;color:var(--sherlock-muted)}
body[data-sherlock-market] details{margin-top:5px;border-top:1px solid var(--sherlock-border)}
body[data-sherlock-market] details>summary{min-height:24px;padding:2px 4px;font-size:11px;line-height:18px;border-radius:0;color:var(--terminal-link)}
body[data-sherlock-market] details[open]{max-height:none;overflow:visible}
/* Continuous metric strips, without nested cards and decorative space. */
body :is(.market-metrics,.fund-kpis){gap:0;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--sherlock-border);border-left:1px solid var(--sherlock-border)}
body :is(.market-metric,.fund-kpi,.research-metric){min-height:82px;padding:8px 10px;border-radius:0;background:transparent;border-right:1px solid var(--sherlock-border);border-bottom:1px solid var(--sherlock-border)}
body :is(.market-label,.fund-label,.research-metric-label){font-size:11px;line-height:16px;color:var(--sherlock-muted)}
body :is(.market-value,.fund-value,.research-metric-value){font-size:22px;line-height:28px;font-weight:500;color:var(--sherlock-text);margin-top:2px;padding:0;letter-spacing:-.3px}
body :is(.market-detail,.fund-detail,.research-metric-detail){font-size:11px;line-height:16px;margin:0}
body[data-research-kind="dashboard"]>.muted{margin:0 0 5px}body .list.research-metrics{gap:0;border-top:1px solid var(--sherlock-border);border-left:1px solid var(--sherlock-border)}
/* A single compact action row sits directly above the data. */
body :is(.controls,.fund-filters,.fund-industry-filters,.market-candle-controls,.price-volume-controls,.fund-flow-controls){margin:0 0 6px;gap:4px;min-height:26px}
body .market-candle-controls{flex-wrap:wrap;justify-content:space-between}
body .market-candle-coverage{line-height:18px!important;font-size:11px!important}
body .market-ohlc{min-height:22px;padding:3px 5px;background:var(--sherlock-surface-muted);color:var(--terminal-heading);font-size:11px;line-height:16px;white-space:nowrap;overflow:auto}
body .market-candle canvas{height:clamp(156px,calc(100vh - 144px),340px)}
body .market-candle-ranges{margin-left:auto}
body .market-candle [data-candle-range]{padding:2px 6px}
body .market-candle>.market-footer{border-top:0;padding:0;margin:2px 0 0}
body .market-candle>.market-footer>span:last-child{max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body .market-trend svg{height:clamp(136px,calc(100vh - 92px),300px)}
body :is(.price-volume,.valuation-band,.equity-drawdown) svg{height:clamp(148px,calc(100vh - 104px),320px)}
body :is(.trend-head,.trend-footer){min-height:22px;font-size:11px}
body :is(.trend-readout,.price-volume-readout,.valuation-readout,.equity-readout){min-height:22px;font-size:11px;line-height:18px;color:var(--terminal-heading)}
body :is(.market-scatter svg){height:clamp(144px,calc(100vh - 104px),280px)}
body .market-scatter .sample-legend{gap:2px 8px}
body .market-scatter svg{height:auto;aspect-ratio:640/198;min-width:480px}body .market-scatter{overflow-x:auto}
body .risk-grid{grid-template-columns:28px repeat(5,minmax(0,1fr))}body .risk-grid-label{white-space:nowrap;font-size:11px}
body .market-pipeline .pipeline-row summary{display:block;position:relative;padding-left:12px}body .market-pipeline .pipeline-row summary::before{position:absolute;left:0;top:5px}body .market-pipeline .pipeline-primary .target{flex:1}body .market-pipeline .pipeline-progress{display:grid}
body .market-pipeline .pipeline-primary strong{flex-basis:108px}
body .fund-table tbody tr:nth-child(odd){background:transparent}body .fund-table tbody tr:nth-child(even){background:var(--sherlock-row-alternate)}
body .market-allocation{grid-template-columns:180px minmax(0,1fr);gap:4px 8px}body .market-allocation svg{width:160px;height:160px}body .allocation-legend{gap:0;max-height:180px}body .allocation-legend button{font-size:12px}body .allocation-readout,body .allocation-visible-total{min-height:18px;margin:0}
body .market-table-wrap{max-height:calc(100vh - 66px);overflow:auto}
.terminal-table-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:6px}.terminal-table-toolbar input{flex:1;min-width:80px}.terminal-table-toolbar span{font-size:11px;color:var(--sherlock-muted);white-space:nowrap}
.terminal-table-readout{font-size:11px;line-height:18px;margin-top:4px;color:var(--sherlock-muted)}
body .order-book-grid{gap:8px}body .order-book-level{min-height:26px;padding:4px 6px;border-radius:0!important;font-size:12px;line-height:18px}body .order-book-heading{padding:3px 6px;background:var(--sherlock-surface-muted);color:var(--terminal-heading)}
body .order-book-level span:first-child{text-align:left}body .order-book-level[aria-selected="true"]{outline:1px solid var(--sherlock-control-primary)}
body .fund-flow-bars{max-height:calc(100vh - 102px);gap:0;border-top:1px solid var(--sherlock-border)}body .fund-flow-row{min-height:27px;border-radius:0!important;border-bottom:1px solid var(--sherlock-border);background:transparent;padding:3px 6px}body .fund-flow-row:nth-child(even){background:var(--sherlock-row-alternate)}
body .fund-filters{grid-template-columns:1fr 1fr 1.4fr}body .fund-control{height:26px;border-color:var(--sherlock-border);border-radius:2px;padding:2px 7px}body .fund-table-wrap{max-height:calc(100vh - 64px)}
body .fund-industries{gap:0;border-top:1px solid var(--sherlock-border)}body .fund-industry{height:28px;grid-template-columns:96px 1fr 60px;padding:3px 6px;border-bottom:1px solid var(--sherlock-border)}body .fund-industry:nth-child(even){background:var(--sherlock-row-alternate)}body .fund-track{height:10px;border-radius:0}body .fund-bar{border-radius:0}body .fund-callout{margin-top:8px;gap:8px}body .fund-industry-footer{margin-top:6px}
body .market-heatmap{height:clamp(160px,calc(100vh - 88px),400px);gap:2px}body .market-heat-row{gap:2px;min-height:0;overflow:hidden}body .market-tile{min-height:0;min-width:42px;padding:7px 6px;border-radius:0!important;gap:3px;overflow:hidden;color:white}body .market-tile strong{font-size:12px;font-weight:500;line-height:16px}body .market-tile span{font-size:15px;line-height:20px}body .market-tile small{font-size:11px;line-height:14px}body .market-scale{margin-top:4px;padding-top:3px;border-top:1px solid var(--sherlock-border)}
body .market-breadth{gap:12px;align-content:start}body .market-distribution{justify-content:flex-start;padding:4px}body .market-participation{font-size:24px;line-height:30px;margin:0 0 6px}body .market-breadth .market-metrics{align-content:start;gap:0;border-left:1px solid var(--sherlock-border)}body .market-breadth .market-metric{min-height:64px;background:transparent}body .market-breadth .market-value{font-size:19px;line-height:24px}
body .market-pipeline .pipeline-row{padding:3px 5px;min-height:36px}body .market-pipeline .pipeline-row summary{min-height:0;padding:0}body .market-pipeline .pipeline-primary strong{flex-basis:80px}body .market-pipeline .pipeline-progress{margin:4px 0 2px}
/* News and research are scan-first feeds. Disclosure reveals the full text. */
body[data-research-kind="news"],body[data-research-kind="reports"]{padding:6px 8px!important;counter-reset:feed}
body .research-feed{gap:0;border-top:1px solid var(--sherlock-border)}
body .research-feed-item,body .research-feed-item:first-child{position:relative;min-height:0;grid-template-columns:94px minmax(0,1fr);gap:8px;padding:5px 4px;border-bottom:1px solid var(--sherlock-border);background:transparent}
body .research-feed-item:nth-child(even){background:var(--sherlock-row-alternate)}body .research-feed-item:hover{background:var(--sherlock-row-selected)}
body .feed-meta{font-size:11px;line-height:16px;gap:0}body .feed-category{padding:0;background:none;color:var(--terminal-heading);font-size:11px;line-height:16px}
body .feed-copy h2{font-size:12px;line-height:18px;font-weight:500;color:var(--sherlock-text)}body .feed-details{font-size:11px;line-height:16px;margin:0}body .feed-details summary{line-height:16px}body .feed-details[open]{border-left:2px solid var(--sherlock-control-primary);padding-left:6px}body .feed-details a{color:var(--terminal-link)}
body[data-research-kind="news"] #count,body[data-research-kind="reports"] #count{font-size:11px;line-height:16px;margin:0 0 4px;color:var(--sherlock-muted)}
body[data-research-kind="calendar"]{grid-template-columns:minmax(0,1fr) 45%;padding:4px 8px!important}body .agenda{padding:4px 0 0 8px}body .month{padding:4px 8px 0 0}body .days button{border-radius:2px}body .event{padding:5px 0;border-bottom:1px solid var(--sherlock-border)}body .event strong{font-size:12px;line-height:17px}body .event small{line-height:15px}
@media(max-width:440px){body .market-candle-ranges{margin-left:0}body :is(.market-metrics,.fund-kpis){grid-template-columns:repeat(2,minmax(0,1fr))}body .fund-filters{grid-template-columns:1fr 1fr}body .fund-search{grid-column:1/-1}body .market-tile strong{font-size:11px}body .market-tile span{font-size:12px}body .market-tile small{display:none}body .research-feed-item{grid-template-columns:84px minmax(0,1fr);gap:6px}body .feed-meta{flex-direction:column}body[data-research-kind="calendar"]{display:block}}
`;

export function applyTerminalPresentation(html) {
  if (typeof html !== 'string') return html;
  const trustedMarket = html.includes('data-sherlock-market=') && html.includes('data-sherlock-design=');
  const trustedInteractive = html.includes('data-research-kind=') && (html.includes('const all=Array.from(document.querySelectorAll(\'article\'))') || html.includes('function render(){const value=month.value'));
  const trustedGantt = html.includes('data-research-kind="gantt"') && html.includes('class="gantt-task"');
  if (!trustedMarket && !trustedInteractive && !trustedGantt) return html;
  html = html.replace(/<style>\/\* ODYSSEY_TERMINAL_20260926 \*\/[\s\S]*?<\/style>/g, '');
  return html.replace('</head>', `<style>${TERMINAL_PRESENTATION_CSS}</style></head>`);
}
