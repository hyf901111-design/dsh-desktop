const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)

function fundFlowRuntime() {
 const root=document.querySelector('.market-fund-flow'),period=root?.querySelector('[data-flow-period]'),industry=root?.querySelector('[data-flow-industry]'),rows=[...(root?.querySelectorAll('.fund-flow-row')??[])],summary=root?.querySelector('.fund-flow-summary'),readout=root?.querySelector('.fund-flow-readout')
 if(!root||!period||!industry||!summary||!readout)return
 const update=()=>{
  let count=0,net=0
  rows.forEach(row=>{const show=(period.value==='all'||period.value===row.dataset.period)&&(industry.value==='all'||industry.value===row.dataset.industry);row.hidden=!show;if(show){count++;net+=Number(row.dataset.net)}})
  const amount=Number(Math.abs(net).toFixed(4)),direction=net>0?'净流入':net<0?'净流出':'净额'
  summary.textContent=count?`${count} 项 · ${direction} ${amount} ${root.dataset.unit}`:'0 项 · 当前筛选无数据'
  const selected=rows.find(row=>!row.hidden&&row.getAttribute('aria-pressed')==='true')||rows.find(row=>!row.hidden)
  rows.forEach(row=>row.setAttribute('aria-pressed',String(row===selected)))
  readout.textContent=selected?selected.dataset.readout:'当前筛选无数据'
 }
 period.addEventListener('change',update);industry.addEventListener('change',update)
 rows.forEach(row=>row.addEventListener('click',()=>{rows.forEach(item=>item.setAttribute('aria-pressed',String(item===row)));readout.textContent=row.dataset.readout}))
 update()
}

export const FUND_FLOW_CSS='.market-fund-flow{display:grid;gap:6px}.fund-flow-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.fund-flow-controls select{font:11px var(--sherlock-font-sans);color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:4px 7px}.fund-flow-summary{margin-left:auto;color:var(--sherlock-muted);font-size:11px;font-variant-numeric:tabular-nums}.fund-flow-bars{display:grid;gap:3px;max-height:170px;overflow:auto}.fund-flow-row{display:grid;grid-template-columns:minmax(80px,30%) 1fr 72px;align-items:center;gap:5px;width:100%;border:0;border-radius:3px;padding:4px 6px;text-align:left;background:var(--sherlock-surface-muted);color:var(--sherlock-text);font:11px var(--sherlock-font-sans);cursor:pointer}.fund-flow-row[hidden]{display:none}.fund-flow-row[aria-pressed="true"]{outline:1px solid var(--sherlock-control-primary)}.fund-flow-row>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fund-flow-axis{display:grid;grid-template-columns:1fr 1fr;gap:2px;height:8px}.fund-flow-axis i{display:block;height:8px}.fund-flow-axis i:first-child{justify-self:end;background:var(--sherlock-market-negative)}.fund-flow-axis i:last-child{background:var(--sherlock-market-positive)}.fund-flow-net{text-align:right;font-variant-numeric:tabular-nums}.fund-flow-readout{min-height:17px;color:var(--sherlock-muted);font-size:11px}.market-fund-flow details{max-height:170px;overflow:auto}'

export function renderFundFlow(spec) {
 const {records,unit}=spec
 if(!Array.isArray(records)||!records.length||records.length>60||typeof unit!=='string'||!unit.trim()||unit.length>20||records.some(row=>
  typeof row?.period!=='string'||!row.period.trim()||row.period.length>100||typeof row.industry!=='string'||!row.industry.trim()||row.industry.length>100||!finite(row.inflow)||row.inflow<0||!finite(row.outflow)||row.outflow<0))return null
 const periods=[...new Set(records.map(row=>row.period))],industries=[...new Set(records.map(row=>row.industry))],max=Math.max(1,...records.map(row=>Math.max(row.inflow,row.outflow)))
 const options=(values)=>`<option value="all">全部</option>${values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('')}`
 const bars=records.map(row=>{const net=Number((row.inflow-row.outflow).toPrecision(12)),label=`${row.period} · ${row.industry} · 流入 ${row.inflow} ${unit} · 流出 ${row.outflow} ${unit} · 净额 ${net} ${unit}`;return `<button type="button" class="fund-flow-row" data-period="${esc(row.period)}" data-industry="${esc(row.industry)}" data-net="${net}" data-readout="${esc(label)}" aria-pressed="false"><span>${esc(row.period)} · ${esc(row.industry)}</span><span class="fund-flow-axis"><i style="width:${Math.max(1,row.outflow/max*100)}%"></i><i style="width:${Math.max(1,row.inflow/max*100)}%"></i></span><span class="fund-flow-net" data-tone="${net>=0?'positive':'negative'}">${net>0?'+':''}${net}</span></button>`}).join('')
 const table=`<details><summary>完整资金流向数据</summary><table><thead><tr><th>时段</th><th>行业</th><th>流入 (${esc(unit)})</th><th>流出 (${esc(unit)})</th><th>净额 (${esc(unit)})</th></tr></thead><tbody>${records.map(row=>`<tr><td>${esc(row.period)}</td><td>${esc(row.industry)}</td><td>${row.inflow}</td><td>${row.outflow}</td><td>${Number((row.inflow-row.outflow).toPrecision(12))}</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-fund-flow" data-unit="${esc(unit)}"><div class="fund-flow-controls"><select data-flow-period aria-label="筛选时段">${options(periods)}</select><select data-flow-industry aria-label="筛选行业">${options(industries)}</select><span class="fund-flow-summary" role="status"></span></div><div class="fund-flow-bars" aria-label="资金流向">${bars}</div><div class="fund-flow-readout" role="status">选择条形查看流入、流出和净额</div>${table}</div>`
 return {body,script:`(${fundFlowRuntime.toString()})();`}
}
