const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const level=score=>score>=15?'high':score>=7?'medium':'low'

function riskMatrixRuntime() {
 const root=document.querySelector('.market-risk-matrix'),filters=[...(root?.querySelectorAll('[data-risk-filter]')??[])],cells=[...(root?.querySelectorAll('[data-risk-cell]')??[])],items=[...(root?.querySelectorAll('.risk-item')??[])],readout=root?.querySelector('.risk-readout'),summary=root?.querySelector('.risk-summary'),clear=root?.querySelector('.risk-clear-cell')
 if(!root||!readout||!summary||!clear)return
 let grade='all',cell=''
 const update=()=>{
  let count=0
  items.forEach(item=>{const show=(grade==='all'||item.dataset.grade===grade)&&(!cell||item.dataset.cell===cell);item.hidden=!show;if(show)count++})
  summary.textContent=`${count} 项风险`
  clear.hidden=!cell
  const selected=items.find(item=>item.getAttribute('aria-pressed')==='true'&&!item.hidden)
  if(!selected){items.forEach(item=>item.setAttribute('aria-pressed','false'));const first=items.find(item=>!item.hidden);if(first){first.setAttribute('aria-pressed','true');readout.textContent=first.dataset.readout}else readout.textContent='当前筛选无风险项'}
 }
 filters.forEach(button=>button.addEventListener('click',()=>{grade=button.dataset.riskFilter;filters.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));update()}))
 cells.forEach(button=>button.addEventListener('click',()=>{cell=button.dataset.riskCell===cell?'':button.dataset.riskCell;cells.forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.riskCell===cell&&!!cell)));update()}))
 clear.addEventListener('click',()=>{cell='';cells.forEach(item=>item.setAttribute('aria-pressed','false'));update()})
 items.forEach(item=>item.addEventListener('click',()=>{items.forEach(other=>other.setAttribute('aria-pressed',String(other===item)));readout.textContent=item.dataset.readout}))
 update()
}

export const RISK_MATRIX_CSS='.market-risk-matrix{display:grid;gap:7px}.risk-controls{display:flex;align-items:center;gap:3px;flex-wrap:wrap}.risk-controls button,.risk-clear-cell{font:10px var(--sherlock-font-sans);color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:3px 6px;cursor:pointer}.risk-controls button[aria-pressed="true"]{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.risk-summary{margin-left:auto;color:var(--sherlock-muted);font-size:10px}.risk-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:8px}.risk-grid{display:grid;grid-template-columns:18px repeat(5,minmax(0,1fr));grid-template-rows:repeat(5,28px) 15px;gap:2px;align-items:stretch}.risk-grid-label{display:grid;place-items:center;font-size:9px;color:var(--sherlock-muted)}.risk-cell{border:1px solid var(--sherlock-border);border-radius:3px;font:10px var(--sherlock-font-sans);cursor:pointer}.risk-cell[data-grade="low"]{background:var(--sherlock-status-success-bg);color:var(--sherlock-status-success-fg)}.risk-cell[data-grade="medium"]{background:var(--sherlock-status-warning-bg);color:var(--sherlock-status-warning-fg)}.risk-cell[data-grade="high"]{background:var(--sherlock-status-danger-bg);color:var(--sherlock-status-danger-fg)}.risk-cell[aria-pressed="true"]{outline:2px solid var(--sherlock-control-primary)}.risk-list{max-height:166px;overflow:auto;display:grid;align-content:start;gap:3px}.risk-item{width:100%;padding:5px;border:1px solid var(--sherlock-border);border-radius:3px;background:var(--sherlock-surface-muted);color:var(--sherlock-text);text-align:left;font:10px var(--sherlock-font-sans);cursor:pointer}.risk-item[aria-pressed="true"]{border-color:var(--sherlock-control-primary)}.risk-item[hidden],.risk-clear-cell[hidden]{display:none}.risk-item small{float:right;color:var(--sherlock-muted)}.risk-readout{min-height:16px;color:var(--sherlock-muted);font-size:10px}.market-risk-matrix details{max-height:170px;overflow:auto}@media(max-width:460px){.risk-layout{grid-template-columns:1fr}.risk-grid{max-width:280px}.risk-list{max-height:90px}}'

export function renderRiskMatrix(spec) {
 const {items}=spec
 if(!Array.isArray(items)||!items.length||items.length>30||items.some(item=>typeof item?.label!=='string'||!item.label.trim()||item.label.length>100||!Number.isInteger(item.probability)||item.probability<1||item.probability>5||!Number.isInteger(item.impact)||item.impact<1||item.impact>5||item.detail!==undefined&&(typeof item.detail!=='string'||!item.detail.trim()||item.detail.length>300)))return null
 const counts=new Map();items.forEach(item=>{const key=`${item.probability}-${item.impact}`;counts.set(key,(counts.get(key)??0)+1)})
 const grid=[]
 for(let probability=5;probability>=1;probability--){grid.push(`<span class="risk-grid-label">${probability}</span>`);for(let impact=1;impact<=5;impact++){const key=`${probability}-${impact}`,score=probability*impact;grid.push(`<button type="button" class="risk-cell" data-risk-cell="${key}" data-grade="${level(score)}" aria-pressed="false" aria-label="概率 ${probability}，影响 ${impact}，${counts.get(key)??0} 项风险">${counts.get(key)??''}</button>`)}}
 grid.push('<span class="risk-grid-label">概率↑</span>',...Array.from({length:5},(_,index)=>`<span class="risk-grid-label">${index+1}</span>`))
 const controls=`<div class="risk-controls" role="group" aria-label="风险等级筛选">${[['all','全部'],['high','高'],['medium','中'],['low','低']].map(([grade,label])=>`<button type="button" data-risk-filter="${grade}" aria-pressed="${grade==='all'}">${label}</button>`).join('')}<button type="button" class="risk-clear-cell" hidden>清除矩阵格</button><span class="risk-summary" role="status"></span></div>`
 const list=items.map(item=>{const score=item.probability*item.impact,readout=`${item.label} · 概率 ${item.probability}/5 · 影响 ${item.impact}/5 · 得分 ${score}${item.detail?` · ${item.detail}`:''}`;return `<button type="button" class="risk-item" data-grade="${level(score)}" data-cell="${item.probability}-${item.impact}" data-readout="${esc(readout)}" aria-pressed="false">${esc(item.label)}<small>${score}</small></button>`}).join('')
 const table=`<details><summary>完整风险项数据</summary><table><thead><tr><th>风险项</th><th>概率</th><th>影响</th><th>得分</th><th>详情</th></tr></thead><tbody>${items.map(item=>`<tr><td>${esc(item.label)}</td><td>${item.probability}</td><td>${item.impact}</td><td>${item.probability*item.impact}</td><td>${esc(item.detail??'—')}</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-risk-matrix">${controls}<div class="risk-layout"><div class="risk-grid" role="group" aria-label="风险矩阵，横轴影响等级，纵轴概率等级">${grid.join('')}</div><div class="risk-list" role="group" aria-label="风险项">${list}</div></div><div class="risk-readout" role="status">选择风险项查看详情</div>${table}</div>`
 return {body,script:`(${riskMatrixRuntime.toString()})();`}
}
