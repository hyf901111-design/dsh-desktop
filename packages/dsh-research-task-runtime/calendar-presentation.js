// Keep DOM identity intact for saved month/day selections and interaction replay.
export const CALENDAR_PRESENTATION_CSS = `/* EWORK_CALENDAR_RESPONSIVE_V2 */
body[data-research-kind="calendar"]{display:grid!important;height:auto!important;min-height:0!important;grid-template-columns:minmax(218px,1fr) minmax(160px,.85fr)!important;grid-template-rows:auto auto!important;align-content:start!important;gap:10px 12px!important;padding:8px 10px!important;overflow:auto!important}
body[data-research-kind="calendar"] .month{min-width:0!important;padding:0!important}
body[data-research-kind="calendar"] .month-nav{display:flex!important;height:30px!important;align-items:center!important;gap:6px!important;margin-bottom:4px!important}
body[data-research-kind="calendar"] .month-nav select{width:108px!important;text-align:center!important;font-variant-numeric:tabular-nums!important}
body[data-research-kind="calendar"] .month-nav button{width:28px!important;height:28px!important;min-width:28px!important;padding:0!important;background:transparent!important;color:var(--sherlock-control-text)!important;border:0!important}
body[data-research-kind="calendar"] .weekdays{height:24px!important;gap:2px!important;font-size:11px!important;color:var(--sherlock-muted)!important}
body[data-research-kind="calendar"] .days{grid-auto-rows:32px!important;gap:2px!important;align-items:center!important}
body[data-research-kind="calendar"] .days button{width:100%!important;max-width:32px!important;height:30px!important;min-height:30px!important;padding:0!important;border:0!important;border-radius:3px!important;background:transparent!important;color:var(--sherlock-control-text)!important;font-size:12px!important;line-height:30px!important}
body[data-research-kind="calendar"] :is(.days button,.month-nav button):hover{background:var(--sherlock-surface-muted)!important}
body[data-research-kind="calendar"] .days button[aria-pressed="true"]{background:var(--sherlock-control-primary)!important;color:var(--sherlock-control-on-primary)!important;font-weight:600!important}
body[data-research-kind="calendar"] .days button[data-active="true"]::after{bottom:2px!important;background:var(--sherlock-control-primary)!important}
body[data-research-kind="calendar"] .days button[data-active="true"][aria-pressed="true"]::after{background:var(--sherlock-control-on-primary)!important}
body[data-research-kind="calendar"] .agenda{display:flex!important;flex-direction:column!important;min-height:0!important;min-width:0!important;padding:0 0 0 12px!important;border-left:1px solid var(--sherlock-border)!important;overflow:hidden!important}
body[data-research-kind="calendar"] .agenda-head{height:30px!important;min-height:30px!important;gap:6px!important;flex:none!important;align-items:center!important;font-size:12px!important;line-height:18px!important}
body[data-research-kind="calendar"] .agenda-head button{min-height:26px!important;padding:2px 5px!important;white-space:nowrap!important;background:transparent!important;color:var(--sherlock-control-muted)!important;font-size:11px!important}
body[data-research-kind="calendar"] .events{height:auto!important;min-height:0!important;max-height:228px!important;flex:1!important;overflow:auto!important}
body[data-research-kind="calendar"] .event{grid-template-columns:38px minmax(0,1fr)!important;gap:6px!important;padding:8px 0!important}
body[data-research-kind="calendar"] .event time{color:var(--sherlock-muted)!important;font-size:11px!important;line-height:18px!important}
body[data-research-kind="calendar"] .event strong{font-size:12px!important;line-height:18px!important;font-weight:500!important}
body[data-research-kind="calendar"] .event small{margin-top:3px!important;font-size:11px!important;line-height:17px!important}
body[data-research-kind="calendar"] footer{position:static!important;grid-column:1/-1!important;min-height:26px!important;margin:0!important;padding:8px 0 0!important;display:block!important;white-space:normal!important;overflow:visible!important;font-size:11px!important;line-height:18px!important;border-top:1px solid var(--sherlock-border)!important}
@media(max-width:440px){body[data-research-kind="calendar"]{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto auto!important;gap:12px!important}body[data-research-kind="calendar"] .agenda{padding:10px 0 0!important;border-left:0!important;border-top:1px solid var(--sherlock-border)!important;overflow:visible!important}body[data-research-kind="calendar"] .events{max-height:none!important;overflow:visible!important}}
`;
