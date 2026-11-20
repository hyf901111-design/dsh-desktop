export const managerPanelCss = `
@layer ework-workbench { html body:has(.manager-panel) { padding: 0!important; } }
.manager-panel {
  color: var(--sherlock-text);
  background: var(--sherlock-surface);
  font: 12px/1.5 var(--sherlock-font-sans);
  font-variant-numeric: tabular-nums;
  --manager-blue: var(--sherlock-chart-1);
  --manager-teal: var(--sherlock-chart-5);
  --manager-rose: var(--sherlock-market-negative);
  --manager-radius: 4px;
}
:root[data-workbench-style="dark"] .manager-panel {
  --manager-blue: #4599db;
  --manager-teal: #5cc7b5;
  --manager-rose: #eb8293;
}
:root:is([data-workbench-style="enterprise"], [data-workbench-style="openterminal"]) .manager-panel {
  --manager-radius: 0;
}
.manager-body { padding: 12px 16px; min-width: 0; }
.manager-panel :is(p, h3, dl, dd, figure) { margin: 0; }
.manager-panel h3 { font-size: 12px; font-weight: 500; }
.manager-panel small, .manager-caption, .manager-unit { color: var(--sherlock-muted); font-size: 11px; }
.manager-unit { margin-inline-start: 5px; white-space: nowrap; }
.manager-tile {
  min-width: 0;
  border-radius: var(--manager-radius);
  background: var(--sherlock-surface-muted);
  padding: 9px 12px;
}
.manager-hero-line, .manager-between { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.manager-value { white-space: nowrap; }
.manager-value strong { font-size: 24px; font-weight: 600; line-height: 1.25; }
.manager-hero .manager-value strong { font-size: 34px; }
.manager-overview { display: grid; grid-template-columns: minmax(148px, 1fr) minmax(0, 3.1fr); gap: 24px; align-items: start; }
.manager-overview .manager-tile { min-height: 46px; }
.manager-overview .manager-hero { min-height: 68px; padding-block: 6px; }
.manager-overview .manager-hero .manager-value strong { line-height: 36px; }
.manager-section-label { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.manager-section-label::after { content: ""; flex: 1; height: 1px; background: var(--sherlock-border); }
.manager-three, .manager-two { display: grid; gap: 10px; }
.manager-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.manager-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.manager-status { display: flex; align-items: center; gap: 10px; }
.manager-status img { width: 18px; height: 18px; flex: none; }
.manager-track { display: flex; height: 5px; background: var(--sherlock-border); overflow: hidden; }
.manager-track.rounded, .manager-track.rounded > span { border-radius: var(--manager-radius); }
.manager-track > span { width: var(--share); background: var(--series, var(--manager-blue)); }
.manager-teal { --series: var(--manager-teal); }
.manager-rose { --series: var(--manager-rose); }
.manager-gold { --series: var(--sherlock-chart-2); }
.manager-bars { display: grid; grid-template-columns: minmax(63px, max-content) minmax(20px, 1fr) 40px; gap: 12px 10px; margin-top: 12px; }
.manager-bars > div {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}
.manager-bars dd:last-child { text-align: right; white-space: nowrap; }
.manager-bars dd .manager-unit { margin-inline-start: 2px; }
.manager-location {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 1.05fr);
  align-items: center;
  gap: 16px;
  margin-top: 6px;
}
.manager-location svg { display: block; width: 100%; max-height: 196px; }
.manager-location dl { gap: 16px 10px; margin-top: 0; }
.manager-location-gd { --series: var(--manager-blue); }
.manager-location-hi { --series: var(--manager-teal); }
.manager-location-bj { --series: var(--sherlock-chart-3); }
.manager-location-sh { --series: var(--sherlock-chart-6); }
.manager-location-js { --series: var(--sherlock-chart-2); }
:root[data-workbench-style="dark"] .manager-location-hi { --series: #62c8ca; }
:root[data-workbench-style="dark"] .manager-location-bj { --series: #8ca3ce; }
:root[data-workbench-style="dark"] .manager-location-sh { --series: #aaa1de; }
:root[data-workbench-style="dark"] .manager-location-js { --series: #8897b4; }
.manager-location svg g circle { fill: var(--series); }
.manager-location svg text { fill: var(--sherlock-muted); font-size: 10px; }
.manager-location-lines { stroke: var(--sherlock-chart-grid); fill: none; }
.manager-demographics { margin-top: 8px; }
.manager-demographics .manager-bars { gap: 10px; }
.manager-gender { margin-top: 18px; padding-top: 9px; border-top: 1px solid var(--sherlock-border); }
.manager-gender .manager-track { height: 8px; margin: 7px 0 5px; }
.manager-interview { display: grid; grid-template-columns: .9fr 2.1fr; gap: 18px; align-items: end; }
.manager-interview .manager-tile { min-height: 46px; }
.manager-interview .manager-hero { min-height: 68px; }
.manager-interview + figure { margin-top: 12px; border-top: 1px solid var(--sherlock-border); padding-top: 10px; }
.manager-line-chart svg { width: 100%; height: 106px; display: block; margin-top: 7px; overflow: visible; }
.manager-line-chart figcaption { margin-bottom: 2px; }
.manager-line-plot { position: relative; }
.manager-stage-values {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  position: absolute;
  inset: 0;
  font-size: 12px;
  text-align: center;
}
.manager-stage-values span { position: relative; }
.manager-stage-labels { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 10px; line-height: 14px; color: var(--sherlock-muted); }
.manager-stage-labels span { min-width: 0; overflow-wrap: anywhere; }
.manager-interview-summary { display: grid; grid-template-columns: minmax(0, 2fr) minmax(118px, 1fr); gap: 14px; }
.manager-mini-offers { border-left: 1px solid var(--sherlock-border); padding-inline-start: 12px; }
.manager-mini-offers dl > div { margin-top: 6px; }
.manager-mini-offers .manager-value strong, .manager-expenses .manager-value strong { font-size: 17px; }
.manager-expenses { display: grid; gap: 9px; }
.manager-expenses .manager-track { margin-top: 6px; }
.manager-offer .manager-hero { margin-bottom: 14px; }
.manager-offer .manager-two .manager-tile { min-height: 98px; }
.manager-offer .manager-two .manager-track { margin-top: 12px; }
.manager-offer .manager-value strong { font-size: 30px; }
.manager-offer .manager-hero .manager-value strong { font-size: 34px; }
.manager-legend { display: inline-flex; align-items: center; gap: 8px; }
.manager-legend::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--series); }
.manager-panel table { width: 100%; margin-top: 8px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.manager-panel :is(td,th) { text-align: start; padding: 6px 8px; height: 32px; border: 0; }
:root .manager-panel th { background: var(--sherlock-surface)!important; font-weight: 500!important; color: var(--sherlock-muted)!important; }
:root[data-workbench-style="enterprise"] .manager-panel th { background: var(--sherlock-table-heading)!important; color: var(--sherlock-table-heading-text)!important; }
:root .manager-panel tbody tr:nth-child(even) > td { background: var(--sherlock-row-alternate)!important; }
.manager-panel td:last-child { white-space: nowrap; color: var(--sherlock-muted); }
.manager-departments .manager-three { margin: 12px 0 4px; }
.manager-departments .manager-tile { min-height: 64px; padding-block: 10px; }
.manager-departments .manager-track { margin-top: 9px; }
.manager-organization { overflow: auto; }
.manager-organization svg { width: 100%; min-width: 880px; display: block; height: auto; margin-top: 10px; }
.manager-organization svg rect { fill: var(--sherlock-surface); stroke: var(--sherlock-border); rx: var(--manager-radius); }
.manager-organization svg .manager-department rect { fill: var(--sherlock-surface-muted); }
.manager-organization svg .manager-root rect { fill: var(--sherlock-row-selected); stroke: var(--sherlock-link); }
.manager-organization svg .manager-root text:first-of-type { fill: var(--sherlock-link); font-weight: 600; }
.manager-organization svg .manager-tree-link { fill: none; stroke: var(--sherlock-chart-crosshair); stroke-width: 1; opacity: .65; }
.manager-organization svg text, .manager-line-chart svg text { fill: var(--sherlock-text); font: 12px var(--sherlock-font-sans); }
.manager-organization svg .manager-tree-label, .manager-organization svg .manager-tree-subtitle { fill: var(--sherlock-muted); font-size: 11px; }
@media (max-width: 650px) {
  .manager-overview, .manager-interview { gap: 10px; }
  .manager-overview { grid-template-columns: minmax(125px, .9fr) minmax(0, 2.1fr); }
  .manager-status { gap: 6px; }
  .manager-tile { padding-inline: 8px; }
  .manager-status .manager-value strong { font-size: 19px; }
  .manager-location { grid-template-columns: minmax(100px, 1fr) minmax(170px, 1fr); gap: 10px; }
  .manager-departments .manager-between { align-items: flex-start; }
}
@media (max-width: 450px) {
  .manager-overview, .manager-interview, .manager-location, .manager-interview-summary { grid-template-columns: 1fr; }
  .manager-location svg { max-height: 94px; }
  .manager-mini-offers { border-left: 0; padding-inline-start: 0; }
  .manager-departments .manager-three, .manager-demographics { grid-template-columns: 1fr; }
}
`
