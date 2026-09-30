import {clockDataIssue,clockDisplayValue} from './clock-template-contract.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clockRuntime(spec,display){
 const get=id=>document.getElementById(id),city=get('clock-city'),cycle=get('clock-cycle');let timer;
 function update(){
  clearTimeout(timer);
  const location=spec.locations.find(l=>l.id===city.value)??spec.locations[0];
  const value=display(location.timeZone,cycle.value,spec.mode==='snapshot'?spec.currentTime:Date.now());
  get('clock-location').textContent=location.label;
  get('clock-time').textContent=value.time;
  get('clock-date').textContent=value.date;
  get('clock-zone').textContent=location.timeZone+' · '+value.offset;
  if(spec.mode!=='snapshot'&&document.visibilityState!=='hidden')timer=setTimeout(update,1000-Date.now()%1000);
 }
 city.addEventListener('change',update);cycle.addEventListener('change',update);
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(document.visibilityState!=='hidden')update();});
 addEventListener('pagehide',()=>clearTimeout(timer));update();
}
const css=`*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{padding:6px 12px;background:var(--sherlock-bg);color:var(--sherlock-text);font:12px/18px var(--sherlock-font-sans);overflow:auto}main{height:100%;min-height:132px;display:flex;flex-direction:column;gap:6px;min-width:0}.clock-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;flex-shrink:0}.clock-tools select{min-width:0;max-width:100%;font:inherit;border:1px solid var(--sherlock-control-border);border-radius:4px;padding:3px 6px;background:var(--sherlock-control-bg);color:var(--sherlock-control-text)}#clock-city{flex:1 1 150px}#clock-cycle{flex:0 0 auto}.clock-display{flex:1 0 78px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;min-width:0}p{margin:0;overflow-wrap:anywhere}.clock-time{font:700 28px/34px var(--sherlock-font-sans);font-variant-numeric:tabular-nums;white-space:nowrap}.clock-muted{color:var(--sherlock-muted);font-size:11px;line-height:16px}.clock-source{flex-shrink:0}.clock-tools select:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:2px}@layer ework-workbench{body[data-research-kind="clock"]{padding:6px 12px!important}body[data-research-kind="clock"] .clock-tools select{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;padding:3px 6px!important;border-radius:4px!important}body[data-research-kind="clock"] .clock-time{font-size:28px!important;line-height:34px!important;font-weight:700!important}body[data-research-kind="clock"] .clock-display{background:transparent!important}}`;
export function renderClockArtifact(spec){
 if(spec?.type!=='clock'||clockDataIssue(spec))return null;
 const location=spec.locations.find(l=>l.id===spec.selectedId)??spec.locations[0],cycle=spec.hourCycle??'h23';
 const value=clockDisplayValue(location.timeZone,cycle,spec.mode==='snapshot'?spec.currentTime:Date.now());
 const json=JSON.stringify(spec).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const source=[spec.mode==='snapshot'?'固定时间快照':'设备时钟 · 实时',spec.asOf,spec.note].filter(Boolean).join(' · ');
 return {version:1,type:'html',title:spec.title,html:`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body data-research-kind="clock" data-sherlock-template="clock"><main><div class="clock-tools"><select id="clock-city" aria-label="城市与时区">${spec.locations.map(l=>`<option value="${escape(l.id)}"${l.id===location.id?' selected':''}>${escape(l.label)}</option>`).join('')}</select><select id="clock-cycle" aria-label="小时制"><option value="h23"${cycle==='h23'?' selected':''}>24 小时</option><option value="h12"${cycle==='h12'?' selected':''}>12 小时</option></select></div><section class="clock-display" aria-label="时区时间"><p id="clock-location">${escape(location.label)}</p><p id="clock-time" class="clock-time">${escape(value.time)}</p><p id="clock-date" class="clock-muted">${escape(value.date)}</p><p id="clock-zone" class="clock-muted">${escape(location.timeZone+' · '+value.offset)}</p></section><p class="clock-source clock-muted">${escape(source)}</p></main><script>(${clockRuntime.toString()})(${json},${clockDisplayValue.toString()});</script></body></html>`};
}
