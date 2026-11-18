export const costComparisonGuidance = '需要可带走的多方案费用网页，且总额等于固定项之和加按数量计费项之和乘人数或件数时，在 htmlFile 提交 costComparison 代替 html。只写方案、项目、计价方式及用户提供的金额，缺金额可留空供填写。宿主直接生成可编辑的明细、数量调整和人均/单位费用对比。需要汇率、优惠阶梯、其他公式或特殊交互时继续使用完整 html。'

export function portableUnitCostRequest(text) {
  return text.length <= 180 && /(?:网页|整页|html).{0,6}(?:带走|下载|导出)|(?:带走|下载|导出).{0,6}(?:网页|html)/iu.test(text) &&
    /预算|费用|报价|成本/iu.test(text) && /比比|对比|比较|比两|哪.{0,4}(?:划算|便宜)/u.test(text) &&
    /人均|每人|件均|单件|每件/u.test(text) &&
    !/附件|文件里|联网|报价源|实时|搜索|最新|天气|新闻|折扣|优惠|税|阶梯|汇率|利率|退款|押金|报销|持久|保存修改|自动保存|敏感度|分别建|另外|额外|同时|不要|禁止/u.test(text)
}

export const costComparisonSchema = {
  type:'object', additionalProperties:false, description:costComparisonGuidance,
  properties:{
    unit:{type:'string',description:'数量单位，如人或件。'},
    currency:{type:'string',description:'同一组方案的金额单位，如元或美元。'},
    quantity:{type:'integer',description:'用户提供的正整数数量，省略时从 1 开始。'},
    plans:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{
      name:{type:'string',required:true},
      costs:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{
        label:{type:'string',required:true}, basis:{type:'string',enum:['fixed','perUnit'],required:true},
        amount:{type:'number',description:'非负金额，未提供时省略。'}
      }}}
    }}}
  }
}

const chinese = {
  unit:'人',currency:'元',quantity:'数量',overview:'方案对比',details:'费用明细',unitCost:'平均费用',total:'总额',
  item:'项目',basis:'计价方式',amount:'金额',fixed:'整组固定',perUnit:'按数量',add:'添加费用项',remove:'移除费用项',
  name:'方案名称',pending:'待填写',hint:'填写各方案的金额，即可比较总额和平均费用。',
  chart:'单位费用对比',formula:'单位费用 = 固定费用 ÷ 数量 + 按单位计费的项目之和。',decrease:'减少数量',increase:'增加数量',
  tabs:'预算视图',itemLabel:'费用项目'
}
const english = {
  unit:'person',currency:'currency units',quantity:'Quantity',overview:'Comparison',details:'Costs',unitCost:'Cost per unit',total:'Total',
  item:'Item',basis:'Basis',amount:'Amount',fixed:'Fixed',perUnit:'Per unit',add:'Add cost',remove:'Remove cost',
  name:'Plan name',pending:'Enter an amount',hint:'Enter the amounts for each plan to compare totals and unit costs.',
  chart:'Cost per unit by plan',formula:'Cost per unit = fixed costs ÷ quantity + the sum of per-unit costs.',decrease:'Decrease quantity',increase:'Increase quantity',
  tabs:'Budget views',itemLabel:'Cost item'
}

function record(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key))
}
const label = value => typeof value === 'string' && value.trim().length > 0
const validCost = cost => record(cost,['label','basis','amount']) && label(cost.label) && ['fixed','perUnit'].includes(cost.basis) &&
  (cost.amount === undefined || Number.isFinite(cost.amount) && cost.amount >= 0)
const validPlan = plan => record(plan,['name','costs']) && label(plan.name) && Array.isArray(plan.costs) && plan.costs.length > 0 && plan.costs.every(validCost)

// Serialized into the standalone file. Submitted strings only enter the DOM as text or input values.
function mountCostComparison() {
  const {plans,unit,currency,quantity,language,copy} = JSON.parse(document.getElementById('budget-data').textContent)
  const number = new Intl.NumberFormat(language,{maximumFractionDigits:2})
  const byId = id => document.getElementById(id)
  const create = (tag, text) => {
    const element = document.createElement(tag)
    if (text !== undefined) element.textContent = text
    return element
  }
  const amountUnit = currency + '/' + unit
  const quantityInput = byId('quantity')
  quantityInput.value = String(quantity)
  function button(name, action, glyph) {
    const control = create('button', glyph ?? name)
    if (glyph) control.setAttribute('aria-label', name)
    control.type = 'button'
    control.addEventListener('click', action)
    return control
  }
  function textInput(value, accessibleName, change) {
    const input = create('input')
    input.value = value
    input.setAttribute('aria-label', accessibleName)
    input.addEventListener('input', () => change(input.value))
    return input
  }
  function renderResults() {
    const n = quantityInput.valueAsNumber
    const validQuantity = Number.isSafeInteger(n) && n > 0
    byId('minus').disabled = !validQuantity || n === 1
    const results = plans.map(plan => {
      if (!validQuantity || !plan.costs.length || plan.costs.some(cost => !Number.isFinite(cost.amount) || cost.amount < 0)) return null
      const total = plan.costs.reduce((sum,cost) => sum + cost.amount * (cost.basis === 'fixed' ? 1 : n), 0)
      return Number.isFinite(total) ? {total,average:total/n} : null
    })
    const highest = Math.max(0,...results.map(result => result?.average ?? 0))
    byId('missing').hidden = results.every(Boolean)
    const rows = [], bars = []
    for (const [i,plan] of plans.entries()) {
      const result = results[i], row = create('tr'), heading = create('th', plan.name)
      heading.scope = 'row'
      row.append(heading)
      for (const value of [result?.average,result?.total]) {
        const cell = create('td', value === undefined ? '—' : number.format(value))
        cell.className = 'numeric'
        row.append(cell)
      }
      rows.push(row)
      if (!result) continue
      const bar = create('div'), track = create('span'), fill = create('i')
      bar.className = 'comparison-row'
      track.className = 'track'
      fill.style.width = (highest ? result.average / highest * 100 : 0) + '%'
      fill.style.backgroundColor = 'var(--sherlock-chart-' + (i % 2 + 1) + ')'
      track.append(fill)
      bar.append(create('span',plan.name), track, create('strong',number.format(result.average)))
      bars.push(bar)
    }
    byId('values').replaceChildren(...rows)
    byId('bars').replaceChildren(...bars)
    byId('comparison-chart').hidden = bars.length < 2
  }
  for (const plan of plans) {
    const group = create('section'), name = textInput(plan.name,copy.name,value => { plan.name=value; renderResults() })
    name.className = 'plan-name'
    const headings = create('div'), items = create('div')
    headings.className = 'cost-row headings'
    headings.append(...[copy.item,copy.basis,copy.amount+' ('+currency+')'].map(text => create('span',text)))
    function addRow(cost) {
      const row = create('div'), basis = create('select')
      row.className = 'cost-row'
      const title = textInput(cost.label,copy.itemLabel,value => { cost.label=value })
      basis.setAttribute('aria-label',copy.basis)
      for (const key of ['fixed','perUnit']) {
        const option = create('option',copy[key]); option.value = key; basis.append(option)
      }
      basis.value = cost.basis
      basis.addEventListener('change', () => {cost.basis=basis.value; renderResults()})
      const amount = create('input')
      amount.type='number'; amount.min='0'; amount.step='any'; amount.placeholder='—'
      amount.setAttribute('aria-label',copy.amount+' ('+currency+')')
      if (cost.amount !== undefined) amount.value=String(cost.amount)
      amount.addEventListener('input', () => {cost.amount=amount.valueAsNumber; renderResults()})
      const remove = button(copy.remove, () => {
        const next = row.nextElementSibling?.querySelector('input') ?? row.previousElementSibling?.querySelector('input') ?? add
        plan.costs.splice(plan.costs.indexOf(cost),1); row.remove(); next.focus(); renderResults()
      },'×')
      row.append(title,basis,amount,remove); items.append(row)
      return title
    }
    const add = button(copy.add, () => {
      const cost = {label:'',basis:'perUnit'}
      plan.costs.push(cost); addRow(cost).focus(); renderResults()
    })
    plan.costs.forEach(addRow)
    group.append(name,headings,items,add)
    byId('editors').append(group)
  }
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  function select(current) {
    for (const tab of tabs) {
      const active = tab === current
      tab.setAttribute('aria-selected',String(active)); tab.tabIndex=active ? 0 : -1
      byId(tab.getAttribute('aria-controls')).hidden = !active
    }
  }
  for (const [i,tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab))
    tab.addEventListener('keydown', event => {
      const position = {ArrowLeft:1-i,ArrowRight:1-i,Home:0,End:1}[event.key]
      if (position === undefined) return
      event.preventDefault(); select(tabs[position]); tabs[position].focus()
    })
  }
  quantityInput.addEventListener('input',renderResults)
  for (const [id,step] of [['minus',-1],['plus',1]]) byId(id).addEventListener('click',() => {
    const n = quantityInput.valueAsNumber
    quantityInput.value = String(Math.max(1,(Number.isSafeInteger(n) ? n : 0) + step))
    renderResults()
  })
  byId('unit-heading').textContent = copy.unitCost + ' ('+amountUnit+')'
  byId('total-heading').textContent = copy.total + ' ('+currency+')'
  byId('chart-heading').textContent = copy.chart + ' ('+amountUnit+')'
  select(plans.some(plan => plan.costs.some(cost => cost.amount === undefined)) ? tabs[1] : tabs[0])
  renderResults()
}

const costPageCss = `
main{max-width:72rem;margin-inline:auto}.filters{margin-block:12px}.filters input{width:5em;text-align:center}
.editors{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:16px}.editors section+section{margin:0}
.editors .plan-name{font-weight:600;width:100%;margin-bottom:8px}
.cost-row{display:grid;grid-template-columns:minmax(4em,1fr) minmax(5.25em,.72fr) minmax(4em,.7fr) 30px;gap:4px;align-items:center;margin-block:4px}
.cost-row>*{min-width:0}.cost-row input[type=number]{text-align:end;font-variant-numeric:tabular-nums}
.headings{font-size:12px;color:var(--page-muted)}.headings span:nth-child(3){text-align:end}
.editors section>button{margin-top:4px}#values th{background:transparent;text-align:start;font-weight:500}
.comparison-row{display:grid;grid-template-columns:minmax(5em,1fr) 2fr minmax(4em,auto);gap:8px;align-items:center;margin-block:6px}
.comparison-row>span:first-child{overflow-wrap:anywhere}.comparison-row strong{text-align:end;font-variant-numeric:tabular-nums}
.track,.track i{display:block;height:10px}.track{background:var(--page-tint)}figure{padding-block-start:4px}
#missing{margin-top:8px}.note{margin-block:16px 0;padding-top:8px;border-top:1px solid var(--page-line);font-size:12px;color:var(--page-muted)}
[role=tabpanel]{margin-block-start:10px}#overview th{overflow-wrap:anywhere}`

const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')

export function renderCostComparison(spec, title, request) {
  if (!record(spec,['unit','currency','quantity','plans']) || ![spec.unit,spec.currency].every(v=>v===undefined || label(v)) ||
      spec.quantity !== undefined && (!Number.isSafeInteger(spec.quantity) || spec.quantity < 1) ||
      !Array.isArray(spec.plans) || spec.plans.length < 2 || !spec.plans.every(validPlan)) {
    throw Error('费用比较须有至少两个有名称的方案，各含费用项、fixed/perUnit 计价方式及可选的非负金额。')
  }
  const language = /\p{Script=Han}/u.test(request || title) ? 'zh-CN' : 'en'
  const copy = language === 'zh-CN' ? chinese : english
  const {plans,unit=copy.unit,currency=copy.currency,quantity=1} = spec
  const data = JSON.stringify({language,plans,unit,currency,quantity,copy}).replaceAll('<','\\u003c')
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style>${costPageCss}</style></head><body><main><h1>${escape(title)}</h1>
<div class="filters"><label for="quantity">${copy.quantity}（${escape(unit)}）</label><button id="minus" type="button" aria-label="${copy.decrease}">−</button>
<input id="quantity" type="number" min="1" step="1"><button id="plus" type="button" aria-label="${copy.increase}">＋</button></div>
<div role="tablist" aria-label="${copy.tabs}"><button id="overview-tab" role="tab" aria-controls="overview">${copy.overview}</button>
<button id="details-tab" role="tab" aria-controls="details">${copy.details}</button></div>
<section id="overview" role="tabpanel" aria-labelledby="overview-tab"><div class="table-scroll"><table><thead><tr><th scope="col">${copy.name}</th><th scope="col" class="numeric" id="unit-heading"></th><th scope="col" class="numeric" id="total-heading"></th></tr></thead><tbody id="values"></tbody></table></div>
<p id="missing" role="status">${copy.hint}</p><figure id="comparison-chart"><h2 id="chart-heading"></h2><div id="bars"></div></figure></section>
<section id="details" role="tabpanel" aria-labelledby="details-tab"><div class="editors" id="editors"></div></section>
<p class="note">${copy.formula}</p></main><script type="application/json" id="budget-data">${data}</script><script>(${mountCostComparison.toString()})()</script></body></html>`
}
