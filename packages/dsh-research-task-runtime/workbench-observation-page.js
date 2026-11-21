import {publicTableSourceHref} from './component-provenance.js'
import {pastedWorkbenchBlocks} from './workbench-pasted-tables.js'

// Resolve dates against the supplied observations. Month/day alone may
// identify only one row; a trailing bare day inherits the first date's month.
function observedDate(label, dates, first) {
  if (dates.includes(label)) return label
  const parts = /^(?:(?:(\d{4})年)?(\d{1,2})月)?(\d{1,2})日$/u.exec(label)
  if (!parts || !parts[2] && !first) return
  const [, year, month, day] = parts
  const mm = month?.padStart(2,'0') ?? first.slice(5,7)
  const yyyy = year ?? (!month && first ? first.slice(0,4) : undefined)
  const matches = dates.filter(date => (!yyyy || date.startsWith(yyyy+'-')) && date.endsWith('-'+mm+'-'+day.padStart(2,'0')))
  if (matches.length === 1) return matches[0]
}
const dateLabel = String.raw`(?:\d{4}-\d{2}-\d{2}|(?:(?:\d{4}年)?\d{1,2}月)?\d{1,2}日)`
const defaultDates = new RegExp('(默认|初始)\\s*(?:比较|对比)\\s*('+dateLabel+')\\s*(?:至|到|与|和|→|～|~)\\s*('+dateLabel+')(?=[\\s，,。；;]|$)','u')

// A historical rate table and explicitly named spreads already specify this
// comparison. Keep ambiguous pairs, extra formulas and data retrieval in the planner.
export function observationComparison(request) {
  if (typeof request !== 'string' || request.length > 40000) return null
  const prose = request.split(/\r?\n/u).filter(line => !/[\t|｜]/u.test(line)).join('\n')
  const requestedDates = defaultDates.exec(prose)
  const otherInstructions = requestedDates ? prose.replace(defaultDates,'') : prose
  if (!/网页|HTML/iu.test(prose) || !/离线|断网|带走/u.test(prose) ||
      !/基准日/u.test(prose) || !/观察日/u.test(prose) || !/切换|选择|筛选/u.test(prose) ||
      !/曲线/u.test(prose) || !/明细/u.test(prose) || !/利差|点差/u.test(prose) ||
      !/(?:利率|收益率|费率|各(?:列|项)?(?:数据|数值)?|单位)[^。；，\n]{0,14}(?:[%％]|百分比)/u.test(prose) ||
      !/%|％|百分比/u.test(prose) || !/\bbps?\b|基点/iu.test(prose) ||
      /不要.{0,4}网页|只(?:要|用)原生|多张|另(?:外|做|加)|实时刷新|持续更新|还(?:要|需)|滑块|回放|刷选|拖动|排序|动画|手动编辑|核(?:查|实|验).{0,10}(?:来源|官网|原文)|联网核对|联动.{0,3}(?:另一|其他)卡|预测|预警|移动均线|跨币种|保存修改|筛选行业|异常筛选|额外|新增|违约|久期|凸性|敏感度|情景|阈值|权重|插值|平均|分位|置信|回归|归因|持久化|保存选择|导出.{0,4}(?:CSV|Excel)|默认|初始|自定义|手动输入/iu.test(otherInstructions)) return null
  const blocks = pastedWorkbenchBlocks(request)
  if (blocks.length !== 1) return null
  const [header,...rows] = blocks[0]
  if (header.length < 3 || header.length > 17 || rows.length < 2 || rows.length > 180 ||
      !/日期|交易日|^date$/iu.test(header[0]) || new Set(header).size !== header.length) return null
  const fields = header.slice(1)
  if (!fields.every(field => /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u.test(field))) return null
  const decimal = /^[+-]?(?:0|[1-9]\d{0,4})(?:\.\d{1,8})?$/u
  if (!rows.every(row => row.length === header.length && /^\d{4}-\d{2}-\d{2}$/u.test(row[0]) &&
      Number.isFinite(Date.parse(row[0])) && new Date(row[0]).toISOString().slice(0,10) === row[0] &&
      row.slice(1).every(value=>decimal.test(value))) || new Set(rows.map(row=>row[0])).size !== rows.length) return null
  // Require the *entire* requested combination list to map to real columns,
  // including its order. Never drop one unmatched pair or invent a spread.
  const named = /(?:利差|点差)组合\s*[（(]([^）)]+)[）)]/u.exec(prose)?.[1]
  if (!named) return null
  const pairs = []
  for (const item of named.split(/\s*(?:、|[,，;；])\s*/u)) {
    const operands = item.trim().split(/\s*(?:减去|减|[-−－])\s*/u)
    if (operands.length !== 2) return null
    const [left,right] = operands.map(field => fields.indexOf(field))
    if (left < 0 || right < 0 || left === right) return null
    pairs.push([left,right])
  }
  if (pairs.length < 2 || new Set(pairs.map(pair=>pair.join(','))).size !== pairs.length) return null
  let source = /(?:^|\n)\s*(?:数据来源|来源|出处)\s*[:：]\s*([^\n]+)/u.exec(prose)?.[1]?.trim()
  const publisher = /(?:摘自|摘录自)\s*([^。；，\n]{1,140}?)\s*(?:的真实|的历史|的公开|[，。；])/u.exec(prose)?.[1]?.trim()
  // A single bare citation can follow an explicit attribution, directly
  // before the supplied table. Other navigational URLs belong to the planner.
  const urlCount = (request.match(/https?:\/\//giu) ?? []).length
  if (urlCount > 1) return null
  if (!source && publisher && urlCount === 1) {
    const bareURL = /(?:^|\n)[ ]*(https?:\/\/[^\s]+)[ ]*\r?\n(?=[^\n]*(?:\t|[|｜]))/iu.exec(request)?.[1]
    if (bareURL) source = publicTableSourceHref(bareURL)
  }
  if (urlCount && !publicTableSourceHref(source)) return null
  let initial
  if (requestedDates) {
    const dates = rows.map(row=>row[0])
    const baseline = observedDate(requestedDates[2],dates)
    const observation = observedDate(requestedDates[3],dates,baseline)
    if (!baseline || !observation) return null
    initial = {baseline,observation}
  }
  return {fields, rows:[...rows].sort((a,b)=>a[0].localeCompare(b[0])), pairs, source, publisher, ...(initial && {initial})}
}

const escapeHtml = s => String(s).replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch])
function interactivePage(data) {
  const pick = name => document.querySelector('[name="'+name+'"]')
  const fields = data.fields
  const base = pick('baseline'), observed = pick('observation'), pair = pick('pair')
  function addOption(select,label,value) {
    const option=document.createElement('option')
    option.textContent=label
    option.value=value
    select.append(option)
  }
  for (const row of data.rows) {
    addOption(base,row[0],row[0])
    addOption(observed,row[0],row[0])
  }
  data.pairs.forEach(([left,right],i)=>addOption(pair,fields[left]+' − '+fields[right],String(i)))
  base.value = data.initial?.baseline ?? data.rows[0][0]
  observed.value = data.initial?.observation ?? data.rows.at(-1)[0]
  // Source strings preserve precision in the detail rows. Convert to fixed
  // integers for exact basis-point subtraction, including sub-bp and zero.
  const digits = Math.max(2,...data.rows.flatMap(row=>row.slice(1).map(v=>(v.split('.')[1]||'').length)))
  const integer = raw => {
    const [whole,fraction=''] = raw.replace(/^[+-]/,'').split('.')
    const n = BigInt(whole+fraction.padEnd(digits,'0'))
    return raw.startsWith('-') ? -n : n
  }
  function bp(value,plus=false) {
    const unsigned = (value<0n?-value:value).toString().padStart(digits-1,'0')
    const decimals = digits-2
    const formatted = decimals ? (unsigned.slice(0,-decimals)+'.'+unsigned.slice(-decimals)).replace(/0+$/,'').replace(/\.$/,'') : unsigned
    return (value<0n?'−':value>0n&&plus?'+':'')+formatted
  }
  function svg(name,attrs,text) {
    const element=document.createElementNS('http://www.w3.org/2000/svg',name)
    for(const [key,value] of Object.entries(attrs)) element.setAttribute(key,String(value))
    if(text!==undefined) element.textContent=text
    return element
  }
  function render() {
    const baseline=data.rows[base.selectedIndex], observation=data.rows[observed.selectedIndex]
    const [left,right]=data.pairs[pair.selectedIndex]
    const spread=row=>integer(row[left+1])-integer(row[right+1])
    for(const [key,value] of [['base',spread(baseline)],['observed',spread(observation)],['change',spread(observation)-spread(baseline)]]) {
      document.querySelector('[data-difference='+key+']').textContent=bp(value,key==='change')
    }
    document.querySelector('[data-label=base]').textContent=baseline[0]
    document.querySelector('[data-label=observed]').textContent=observation[0]
    const body=document.querySelector('tbody')
    body.replaceChildren()
    fields.forEach((name,i)=>{
      const tr=body.insertRow()
      for(const text of [name,baseline[i+1]+'%',observation[i+1]+'%',bp(integer(observation[i+1])-integer(baseline[i+1]),true)]) tr.insertCell().textContent=text
    })
    const chart=document.querySelector('svg'),width=Math.max(340,fields.length*63),height=195
    chart.setAttribute('viewBox','0 0 '+width+' '+height)
    chart.replaceChildren()
    const points=[...baseline.slice(1),...observation.slice(1)].map(Number)
    const min=Math.min(...points),max=Math.max(...points)
    const rawStep=(max-min || Math.max(Math.abs(max)*.01,.01))/3
    const magnitude=10**Math.floor(Math.log10(rawStep))
    const step=([1,2,2.5,5,10].find(value=>value>=rawStep/magnitude) || 10)*magnitude
    const low=Math.floor(min/step)*step
    const high=Math.max(low+step,Math.ceil(max/step)*step)
    const y=v=>155-(Number(v)-low)/(high-low)*132
    const x=i=>48+(width-68)*i/(fields.length-1)
    for(let i=0;i<=Math.round((high-low)/step);i++) {
      const value=low+i*step,level=y(value)
      chart.append(svg('line',{x1:44,x2:width-16,y1:level,y2:level,class:'grid'}),svg('text',{x:40,y:level+4,'text-anchor':'end'},Number(value.toFixed(Math.min(digits+1,10)))+'%'))
    }
    fields.forEach((field,i)=>chart.append(svg('text',{x:x(i),y:180,'text-anchor':'middle'},field)))
    for(const [row,key] of [[baseline,'base'],[observation,'observed']]) {
      const g=svg('g',{'data-series':key})
      g.append(svg('polyline',{points:fields.map((_,i)=>x(i)+','+y(row[i+1])).join(' ')}))
      fields.forEach((field,i)=>{
        const dot=svg('circle',{cx:x(i),cy:y(row[i+1]),r:3,'data-value':row[i+1]})
        dot.append(svg('title',{},row[0]+' · '+field+' '+row[i+1]+'%'));g.append(dot)
      })
      chart.append(g)
    }
  }
  for(const select of [base,observed,pair]) select.addEventListener('change',render)
  render()
}

export function renderObservationComparison(data,title) {
  const safeTitle=escapeHtml(title)
  const source=data.source||''
  let href
  try { const u=new URL(source);if(['https:','http:'].includes(u.protocol))href=u.href } catch {}
  const citation=href?'<a href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(data.publisher||new URL(href).host)+'</a>':escapeHtml([data.publisher,source].filter(Boolean).join(' · ')||'用户提供的历史数据表')
  const payload=JSON.stringify(data).replace(/</gu,'\\u003c').replace(/\u2028/gu,'\\u2028').replace(/\u2029/gu,'\\u2029')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>
  *{box-sizing:border-box}body{margin:0;padding:20px;font:14px/1.5 system-ui,sans-serif;color:var(--sherlock-text,#20252a);background:var(--sherlock-bg,#fff)}main{max-width:900px;margin:auto}h1{font-size:21px;margin:0 0 18px}h2{font-size:15px;margin:20px 0 8px}.filters,.metrics{display:flex;flex-wrap:wrap;gap:12px 16px}.filters label{display:grid;gap:4px;font-size:12px}select{color:inherit;background:inherit;font:inherit;padding:5px;border:1px solid #8a9198}.metrics{padding:14px 0;border-bottom:1px solid #8886}.metrics p{margin:0;min-width:84px}.metrics span{display:block;font-size:12px}.metrics output{font-weight:650;font-size:22px;font-variant-numeric:tabular-nums}.chart{overflow-x:auto}svg{display:block;width:100%;min-width:320px;height:auto}svg text{fill:currentColor;font:10px system-ui}svg .grid{stroke:currentColor;opacity:.16}svg polyline{fill:none;stroke:currentColor;stroke-width:2}svg circle{fill:currentColor}[data-series=base],.base{color:var(--sherlock-chart-1,#507cb2)}[data-series=observed],.observed{color:var(--sherlock-chart-2,#bd633b)}g[data-series=base] polyline{stroke-dasharray:5 3}.legend{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;font-size:12px}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px;text-align:right;white-space:nowrap;border-bottom:1px solid #8885}th:first-child,td:first-child{text-align:left}footer{margin-top:16px;font-size:12px;overflow-wrap:anywhere}footer a{color:inherit}@media(max-width:520px){body{padding:12px}.filters{gap:8px}h1{font-size:18px}}@media(prefers-color-scheme:dark){body{color:var(--sherlock-text,#eceef0);background:var(--sherlock-bg,#202124)}option{color-scheme:dark;background:#242628}.base,[data-series=base]{color:var(--sherlock-chart-1,#8ab4e7)}.observed,[data-series=observed]{color:var(--sherlock-chart-2,#ffab80)}}
  </style></head><body><main><h1>${safeTitle}</h1><div class="filters"><label>基准日<select name="baseline"></select></label><label>观察日<select name="observation"></select></label><label>利差组合<select name="pair"></select></label></div>
  <section class="metrics"><p><span>基准日利差</span><output data-difference="base"></output> bp</p><p><span>观察日利差</span><output data-difference="observed"></output> bp</p><p><span>利差变动</span><output data-difference="change"></output> bp</p></section>
  <h2>收益率曲线</h2><div class="legend"><span class="base">┄ 基准日 <b data-label="base"></b></span><span class="observed">━ 观察日 <b data-label="observed"></b></span></div><div class="chart"><svg role="img" aria-label="两日各期限收益率对比"></svg></div>
  <h2>期限明细</h2><div class="table-scroll"><table><thead><tr><th>期限</th><th>基准日 (%)</th><th>观察日 (%)</th><th>变动 (bp)</th></tr></thead><tbody></tbody></table></div><footer>来源 · ${citation}</footer></main>
  <script>(${interactivePage.toString()})(${payload})</script></body></html>`
}
