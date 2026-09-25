// Host-owned Gantt rendering: the model supplies dates and labels, never CSS.
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time / 86400000 : null;
};

export function renderGanttArtifact(spec) {
  if (spec?.type !== 'gantt') return null;
  if (spec.version !== 1 || typeof spec.title !== 'string' || !spec.title.trim() || spec.title.length > 256 ||
      typeof spec.asOf !== 'string' || !spec.asOf.trim() || spec.asOf.length > 256 ||
      !Array.isArray(spec.items) || spec.items.length < 1 || spec.items.length > 20) return null;
  const items = spec.items.map(item => {
    if (!item || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 128 ||
        (item.owner !== undefined && (typeof item.owner !== 'string' || item.owner.length > 80)) ||
        (item.progress !== undefined && (!Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100))) return null;
    const start = dateDay(item.start), end = dateDay(item.end);
    return start === null || end === null || end < start ? null : {...item,startDay:start,endDay:end};
  });
  if (items.some(item => item === null)) return null;
  const first = Math.min(...items.map(item => item.startDay));
  const last = Math.max(...items.map(item => item.endDay));
  const days = last - first + 1;
  if (days > 366) return null;
  const tick = fraction => new Date((first + Math.round((days - 1) * fraction)) * 86400000).toISOString().slice(5,10);
  const ticks = [0,.25,.5,.75,1].map((fraction,index) =>
    `<time style="left:${fraction * 100}%" datetime="${new Date((first + Math.round((days - 1) * fraction))*86400000).toISOString().slice(0,10)}"${index === 0 ? ' class="first"' : index === 4 ? ' class="last"' : ''}>${tick(fraction)}</time>`).join('');
  const rows = items.map(item => {
    const left = ((item.startDay - first) / days * 100).toFixed(3);
    const width = ((item.endDay - item.startDay + 1) / days * 100).toFixed(3);
    const progress = item.progress ?? 0;
    return `<div class="gantt-row" role="row"><div class="gantt-label" role="cell" title="${escape(item.label)}"><strong>${escape(item.label)}</strong>${item.owner ? `<small>${escape(item.owner)}</small>` : ''}</div><div class="gantt-track" role="cell"><span class="gantt-bar" style="left:${left}%;width:${width}%" title="${escape(item.label)} · ${item.start} 至 ${item.end} · ${progress}%"><i style="width:${progress}%"></i></span></div><span class="gantt-progress" role="cell">${progress}%</span></div>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{padding:8px 12px 10px;background:var(--sherlock-bg);color:var(--sherlock-text);font:11px/16px var(--sherlock-font-sans)}.gantt{height:100%;display:flex;flex-direction:column;min-height:0}.gantt-note{margin:0 0 7px;color:var(--sherlock-muted);font-size:9px}.gantt-head,.gantt-row{display:grid;grid-template-columns:minmax(108px,27%) minmax(0,1fr) 36px;gap:8px;align-items:center}.gantt-head{min-height:25px;border-bottom:1px solid var(--sherlock-border);color:var(--sherlock-muted);font-size:9px}.gantt-axis{position:relative;height:16px}.gantt-axis time{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}.gantt-axis time.first{transform:none}.gantt-axis time.last{transform:translateX(-100%)}.gantt-rows{min-height:0;overflow:auto;scrollbar-width:thin}.gantt-row{min-height:34px;border-bottom:1px solid var(--sherlock-border)}.gantt-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gantt-label strong{font-weight:500}.gantt-label small{display:block;color:var(--sherlock-muted);font-size:9px;line-height:12px}.gantt-track{position:relative;height:18px;background:repeating-linear-gradient(to right,transparent 0,transparent calc(25% - 1px),var(--sherlock-border) calc(25% - 1px),var(--sherlock-border) 25%)}.gantt-bar{position:absolute;top:3px;height:12px;min-width:2px;border-radius:3px;background:color-mix(in srgb,var(--sherlock-chart-1) 35%,var(--sherlock-surface));overflow:hidden}.gantt-bar i{display:block;height:100%;background:var(--sherlock-chart-1)}.gantt-progress{text-align:right;font-variant-numeric:tabular-nums;font-size:9px}@media(max-width:420px){body{padding:6px 8px}.gantt-head,.gantt-row{grid-template-columns:minmax(75px,28%) minmax(0,1fr) 30px;gap:4px}.gantt-axis time:nth-child(even){display:none}}
</style></head><body data-research-kind="gantt" aria-label="${escape(spec.title)}"><section class="gantt" role="table" aria-label="${escape(spec.title)}"><p class="gantt-note">${escape(spec.asOf)} · ${items.length} 项 · ${days} 天</p><div class="gantt-head" role="row"><span role="columnheader">研究计划</span><div class="gantt-axis" role="columnheader">${ticks}</div><span role="columnheader">完成</span></div><div class="gantt-rows">${rows}</div></section></body></html>`;
  return {version:1,type:'html',title:spec.title,html};
}
