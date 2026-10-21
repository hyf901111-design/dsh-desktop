import { parseGanttSpec } from './gantt-template-contract.js';
import { GANTT_READING_CSS } from './workbench-reading-layout.js';
// Host-owned Gantt rendering: the model supplies dates and labels, never CSS.
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function ganttRuntime() {
  const tasks=[...document.querySelectorAll('.gantt-task')],readout=document.querySelector('.gantt-readout');
  const select=index=>{
    const next=Math.max(0,Math.min(tasks.length-1,index));
    tasks.forEach((task,i)=>{task.setAttribute('aria-pressed',String(i===next));task.closest('.gantt-row').dataset.selected=String(i===next)});
    const task=tasks[next],owner=task.dataset.owner?` · 负责人 ${task.dataset.owner}`:'';
    readout.textContent=`${task.dataset.label}\n${task.dataset.start} 至 ${task.dataset.end}\n完成 ${task.dataset.progress}%${owner}${task.dataset.detail?'\n'+task.dataset.detail:''}`;
  };
  tasks.forEach((task,index)=>{
    task.addEventListener('click',()=>select(index));
    task.addEventListener('focus',()=>select(index));
    task.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tasks.length-1:Math.max(0,Math.min(tasks.length-1,index+(event.key==='ArrowUp'?-1:1)));
      tasks[next].focus();
    });
  });
  select(0);
}
export const GANTT_SELECTION_RUNTIME=ganttRuntime.toString();

export function renderGanttArtifact(spec) {
  if (spec?.type !== 'gantt') return null;
  const timeline = parseGanttSpec(spec);
  if (timeline.issue) return null;
  const { items, first, last, span, timed, axisOffset, zoneKind } = timeline, days = span / 86400000;
  const ticks = [0,.25,.5,.75,1].map((fraction,index) => {
    const time = first + (timed ? Math.round((last - first) * fraction) : Math.round((days - 1) * fraction) * 86400000);
    const local = new Date(time + axisOffset * 60000).toISOString();
    const label = timed ? `<span>${local.slice(5,10)}</span><span>${local.slice(11,16)}</span>` : local.slice(5,10);
    return `<time style="left:${fraction * 100}%" datetime="${timed ? new Date(time).toISOString() : local.slice(0,10)}"${index === 0 ? ' class="first"' : index === 4 ? ' class="last"' : ''}>${label}</time>`;
  }).join('');
  const rows = items.map(item => {
    const left = ((item.startTime - first) / span * 100).toFixed(3);
    const width = ((item.endTime - item.startTime) / span * 100).toFixed(3);
    const progress = item.progress ?? 0;
    return `<div class="gantt-row" role="row"><div class="gantt-label" role="cell"><button type="button" class="gantt-task" data-label="${escape(item.label)}" data-start="${item.start}" data-end="${item.end}" data-progress="${progress}" data-owner="${escape(item.owner ?? '')}" data-detail="${escape(item.detail ?? '')}" aria-label="查看${escape(item.label)}排期" aria-pressed="false"><strong>${escape(item.label)}</strong>${item.owner ? `<small>${escape(item.owner)}</small>` : ''}</button></div><div class="gantt-track" role="cell"><span class="gantt-bar" style="left:${left}%;width:${width}%" title="${escape(item.label)} · ${item.start} 至 ${item.end} · ${progress}%"><i style="width:${progress}%"></i></span></div><span class="gantt-progress" role="cell">${progress}%</span></div>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{padding:8px 12px 10px;background:var(--sherlock-bg);color:var(--sherlock-text);font:11px/16px var(--sherlock-font-sans)}.gantt{height:100%;display:flex;flex-direction:column;min-height:0}.gantt-note{margin:0 0 7px;color:var(--sherlock-muted);font-size:11px}.gantt-head,.gantt-row{display:grid;grid-template-columns:minmax(108px,27%) minmax(0,1fr) 36px;gap:8px;align-items:center}.gantt-head{min-height:25px;border-bottom:1px solid var(--sherlock-border);color:var(--sherlock-muted);font-size:11px}.gantt-axis{position:relative;height:16px}.gantt-axis time{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}.gantt-axis.has-time{height:30px}.gantt-axis.has-time time span{display:block;line-height:14px}.gantt-axis time.first{transform:none}.gantt-axis time.last{transform:translateX(-100%)}.gantt-rows{min-height:0;overflow:auto;scrollbar-width:thin}.gantt-row{min-height:34px;border-bottom:1px solid var(--sherlock-border)}.gantt-row[data-selected="true"]{background:var(--sherlock-surface-muted)}.gantt-row[data-selected="true"] .gantt-bar{outline:1px solid var(--sherlock-chart-1)}.gantt-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gantt-task{display:block;width:100%;border:0;padding:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gantt-task:focus-visible{outline:2px solid var(--sherlock-control-primary)}.gantt-label strong{font-weight:500}.gantt-label small{display:block;color:var(--sherlock-muted);font-size:11px;line-height:12px}.gantt-track{position:relative;height:18px;background:repeating-linear-gradient(to right,transparent 0,transparent calc(25% - 1px),var(--sherlock-border) calc(25% - 1px),var(--sherlock-border) 25%)}.gantt-bar{position:absolute;top:3px;height:12px;min-width:2px;border-radius:3px;background:color-mix(in srgb,var(--sherlock-chart-1) 35%,var(--sherlock-surface));overflow:hidden}.gantt-bar i{display:block;height:100%;background:var(--sherlock-chart-1)}.gantt-progress{text-align:right;font-variant-numeric:tabular-nums;font-size:11px}.gantt-readout{flex:none;min-height:17px;max-height:35%;overflow:auto;overflow-wrap:anywhere;margin:7px 0 0;color:var(--sherlock-text);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums}@media(max-width:420px){body{padding:6px 8px}.gantt-head,.gantt-row{grid-template-columns:minmax(75px,28%) minmax(0,1fr) 30px;gap:4px}.gantt-axis time:nth-child(even){display:none}}
${GANTT_READING_CSS}</style></head><body data-research-kind="gantt" aria-label="${escape(spec.title)}"><section class="gantt" role="table" aria-label="${escape(spec.title)}"><p class="gantt-note">${escape(spec.asOf)} · ${items.length} 项 · ${timed ? Number(((last - first) / 3600000).toFixed(2)) + ' 小时 · ' + (zoneKind === 'local' ? '共同当地排期时间' : 'UTC' + (axisOffset < 0 ? '-' : '+') + String(Math.floor(Math.abs(axisOffset) / 60)).padStart(2, '0') + ':' + String(Math.abs(axisOffset) % 60).padStart(2, '0')) : days + ' 天'}</p><div class="gantt-head" role="row"><span role="columnheader">作业 / 负责人</span><div class="gantt-axis${timed ? ' has-time' : ''}" role="columnheader">${ticks}</div><span role="columnheader">完成</span></div><div class="gantt-rows">${rows}</div><div class="gantt-readout" role="status" tabindex="0" aria-label="完整排期详情"></div></section><script>(${ganttRuntime.toString()})();</script></body></html>`;
  return {version:1,type:'html',title:spec.title,html};
}
