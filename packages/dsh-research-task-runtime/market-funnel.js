const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))

function funnelRuntime() {
 const root=document.querySelector('.market-funnel'),rows=[...(root?.querySelectorAll('.funnel-stage')??[])],readout=root?.querySelector('.funnel-readout')
 if(!root||!readout)return
 rows.forEach(row=>row.addEventListener('click',()=>{rows.forEach(item=>item.setAttribute('aria-pressed',String(item===row)));readout.textContent=row.dataset.readout}))
 rows[0]?.click()
}

export const FUNNEL_CSS='.market-funnel{display:grid;gap:7px}.funnel-stage-list{display:grid;gap:5px}.funnel-stage{display:grid;grid-template-columns:minmax(75px,28%) 1fr 56px 56px;gap:6px;align-items:center;width:100%;padding:5px 7px;border:1px solid var(--sherlock-border);border-radius:4px;background:var(--sherlock-surface-muted);color:var(--sherlock-text);font:10px var(--sherlock-font-sans);text-align:left;cursor:pointer}.funnel-stage[aria-pressed="true"]{border-color:var(--sherlock-control-primary)}.funnel-stage>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.funnel-bar{display:block;height:12px;border-radius:2px;background:var(--sherlock-chart-1)}.funnel-count,.funnel-rate{text-align:right;font-variant-numeric:tabular-nums}.funnel-rate{color:var(--sherlock-muted)}.funnel-readout{min-height:18px;color:var(--sherlock-muted);font-size:10px;font-variant-numeric:tabular-nums}.market-funnel details{max-height:170px;overflow:auto}@media(max-width:420px){.funnel-stage{grid-template-columns:60px 1fr 42px 42px;gap:3px;font-size:9px;padding:4px}}'

export function renderFunnel(spec) {
 const {stages,unit='个'}=spec
 if(!Array.isArray(stages)||stages.length<2||stages.length>10||stages.some(stage=>typeof stage?.label!=='string'||!stage.label.trim()||stage.label.length>100||!Number.isSafeInteger(stage.count)||stage.count<0)||stages[0].count<=0||stages.some((stage,index)=>index>0&&stage.count>stages[index-1].count)||typeof unit!=='string'||!unit.trim()||unit.length>20)return null
 const first=stages[0].count,rate=(count,base)=>base===0?'—':`${Number((count/base*100).toFixed(2))}%`
 const rows=stages.map((stage,index)=>{const previous=index?stages[index-1].count:first,stepRate=index?rate(stage.count,previous):'100%',overall=rate(stage.count,first),readout=`${stage.label} · ${stage.count} ${unit} · 阶段转化 ${stepRate} · 累计 ${overall}`;return `<button type="button" class="funnel-stage" data-readout="${esc(readout)}" aria-pressed="false"><span>${esc(stage.label)}</span><i class="funnel-bar" style="width:${stage.count/first*100}%" aria-hidden="true"></i><span class="funnel-count">${stage.count}</span><span class="funnel-rate">${stepRate}</span></button>`}).join('')
 const table=`<details><summary>完整漏斗数据</summary><table><thead><tr><th>阶段</th><th>数量 (${esc(unit)})</th><th>阶段转化</th><th>累计转化</th></tr></thead><tbody>${stages.map((stage,index)=>`<tr><td>${esc(stage.label)}</td><td>${stage.count}</td><td>${index?rate(stage.count,stages[index-1].count):'100%'}</td><td>${rate(stage.count,first)}</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-funnel"><div class="funnel-stage-list" role="group" aria-label="漏斗阶段">${rows}</div><div class="funnel-readout" role="status">选择阶段查看转化率</div>${table}</div>`
 return {body,script:`(${funnelRuntime.toString()})();`}
}
