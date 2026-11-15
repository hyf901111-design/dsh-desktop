export type CashFlowGuideLocale = 'zh'|'en'
type BridgeStep = {
  id:'profit'|'depreciation'|'receivables'|'inventory'|'other'|'cash'
  name:string
  amount:number
  details:{name:string;amount:number}[]
}

const copy = {
  zh:{
    sample:'虚构演示数据', earnings:'净利润', cash:'经营现金流', conversion:'现金转化率',
    unit:'亿元', chart:'从净利润到经营现金流', assumption:'若当季多收回货款',
    actual:'实际', estimate:'测算', max:'8,000 万元', labels:['净利润','折旧摊销','应收增加','存货增加','其他调整','现金流'],
    targetMet:'达到 75% 目标', targetGap:'距 75% 目标差', points:'个百分点',
  },
  en:{
    sample:'Fictional demo data', earnings:'Net profit', cash:'Operating cash flow', conversion:'Cash conversion',
    unit:'CNY 100m', chart:'From net profit to operating cash flow', assumption:'If more receivables were collected',
    actual:'Actual', estimate:'Scenario', max:'CNY 80m', labels:['Net profit','D&A','Receivables','Inventory','Other','Cash flow'],
    targetMet:'75% target reached', targetGap:'Gap to 75% target:', points:'pp',
  }
}
const css = `
  [data-cash-flow-bridge] {
    --ink: var(--sherlock-text);
    --quiet: var(--sherlock-muted);
    --rule: var(--sherlock-border);
    --total: var(--sherlock-chart-1);
    --inflow: #227b63;
    --outflow: #b65833;
    width: 100%;
    padding: 12px 10px 8px;
    color: var(--ink);
    font: 12px/1.4 var(--sherlock-font-sans);
    font-variant-numeric: tabular-nums;
  }
  :root[data-sherlock-theme="dark"] [data-cash-flow-bridge] {
    --inflow: #78c8af;
    --outflow: #ed9c73;
  }
  [data-cash-flow-bridge] .bridge-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 8px;
  }
  .bridge-heading strong { font-size: 13px; }
  [data-cash-flow-bridge] .bridge-secondary { color: var(--quiet); font-size: 11px; }
  [data-cash-flow-bridge] .bridge-metrics {
    display: grid;
    grid-template-columns: .9fr 1.05fr 1.05fr;
    gap: 7px;
    margin: 12px 0 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--rule);
  }
  .bridge-metrics > div { display: grid; min-width: 0; align-content: start; gap: 3px; }
  .bridge-metrics b { font-size: clamp(19px,6vw,26px); line-height: 1.05; white-space: nowrap; }
  .bridge-metrics [data-metric-label] { font-size: 11px; color: var(--quiet); }
  [data-cash-flow-bridge][data-goal-met] [data-target] { color: var(--inflow); }
  [data-cash-flow-bridge] .bridge-graph { --plot: 103px; --labels: 36px; position: relative; margin-top: 15px; padding-left: 12px; }
  .bridge-grid { position: absolute; inset: 0 0 auto; height: var(--plot); pointer-events: none; }
  .bridge-grid span { position: absolute; inset-inline: 0; bottom: var(--position); height: 0; color: var(--quiet); font-size: 9px; line-height: 0; }
  .bridge-grid span::after { content: ""; position: absolute; inset-inline: 12px 0; border-top: 1px solid var(--rule); }
  [data-cash-flow-bridge] .bridge-steps { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); list-style: none; margin: 0; padding: 0; }
  .bridge-step { position: relative; min-width: 0; height: calc(var(--plot) + var(--labels)); }
  .bridge-bar {
    position: absolute;
    z-index: 1;
    left: 20%;
    width: 60%;
    bottom: calc(var(--labels) + var(--low) * var(--plot));
    height: calc(var(--span) * var(--plot));
    background: var(--bar);
    border-radius: 2px 2px 0 0;
    transition: height .24s ease, bottom .24s ease;
  }
  .bridge-step[data-role=total] { --bar: var(--total); }
  .bridge-step[data-role=inflow] { --bar: var(--inflow); }
  .bridge-step[data-role=outflow] { --bar: var(--outflow); }
  .bridge-connector {
    position: absolute;
    left: 80%;
    width: 40%;
    bottom: calc(var(--labels) + var(--end) * var(--plot));
    border-top: 1px dashed var(--quiet);
    transition: bottom .24s ease;
  }
  .bridge-amount {
    position: absolute;
    z-index: 1;
    inset-inline: 0;
    bottom: calc(var(--labels) + var(--high) * var(--plot) + 3px);
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    transition: bottom .24s ease;
  }
  [data-cash-flow-bridge] .bridge-choice {
    position: absolute;
    z-index: 2;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--quiet);
    text-align: center;
    padding: 0 0 4px;
    font: inherit;
    font-size: 10px;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  [data-cash-flow-bridge] button.bridge-choice:hover,
  [data-cash-flow-bridge] .bridge-choice[aria-pressed="true"] { background: transparent; color: var(--ink); }
  [data-cash-flow-bridge] .bridge-choice[aria-pressed="true"] > span { font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  [data-cash-flow-bridge] .bridge-choice:focus-visible { outline: 1px solid var(--total); outline-offset: -1px; }
  [data-cash-flow-bridge] .bridge-source {
    display: grid;
    gap: 2px;
    min-height: 43px;
    padding: 5px 7px;
    border-left: 2px solid var(--total);
    background: var(--sherlock-surface-muted);
  }
  [data-cash-flow-bridge] .bridge-scenario { margin-top: 10px; }
  [data-cash-flow-bridge] .bridge-scenario input { display:block; width:100%; height:23px; margin:0; padding:0; accent-color:var(--total); }
  @media (prefers-reduced-motion:reduce) {
    .bridge-bar,.bridge-connector,.bridge-amount { transition:none; }
  }
`

export function buildCashFlowGuideHtml(input:{locale:CashFlowGuideLocale;company:string;period:string;steps:BridgeStep[]}){
  const {locale,company,period,steps}=input
  const labels=copy[locale]
  const scriptData=JSON.stringify({locale,steps,labels}).replace(/</g,'\\u003c')
  return `<style>${css}</style>
<main data-cash-flow-bridge>
  <header class="bridge-heading">
    <strong>${company} · ${period}</strong>
    <span class="bridge-secondary">${labels.sample}</span>
  </header>
  <div class="bridge-metrics" aria-live="polite">
    <div><span data-metric-label>${labels.earnings}</span><b data-profit></b><span class="bridge-secondary">${labels.unit}</span></div>
    <div><span data-metric-label>${labels.cash}<span data-mode></span></span><b data-flow></b><span class="bridge-secondary" data-actual-flow></span></div>
    <div><span data-metric-label>${labels.conversion}</span><b data-ratio></b><span data-target class="bridge-secondary"></span></div>
  </div>
  <div class="bridge-heading">
    <strong>${labels.chart}</strong>
    <span class="bridge-secondary">${labels.unit}</span>
  </div>
  <div class="bridge-graph" role="group" aria-label="${labels.chart}">
    <div class="bridge-grid" aria-hidden="true">
      <span style="--position:100%">3</span><span style="--position:66.6667%">2</span><span style="--position:33.3333%">1</span><span style="--position:0%">0</span>
    </div>
    <ol class="bridge-steps"></ol>
  </div>
  <div class="bridge-source" aria-live="polite">
    <strong data-source-title></strong><span data-source-detail class="bridge-secondary"></span>
  </div>
  <div class="bridge-scenario">
    <div class="bridge-heading">
      <label for="cash-flow-collections">${labels.assumption}</label>
      <strong data-collected></strong>
    </div>
    <input id="cash-flow-collections" type="range" min="0" max="8000" step="100" value="0">
    <div class="bridge-heading bridge-secondary" aria-hidden="true"><span>0</span><span>${labels.max}</span></div>
  </div>
</main>
<script>
(() => {
  const {locale,steps,labels} = ${scriptData};
  const root = document.querySelector('[data-cash-flow-bridge]');
  const slider = root.querySelector('input');
  const graph = root.querySelector('ol');
  const actualProfit = steps[0].amount;
  const actualCash = steps[steps.length - 1].amount;
  const formatNumber = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {maximumFractionDigits:1});
  const amountText = amount => (Math.abs(amount) / 10000).toFixed(2);
  const signed = amount => (amount < 0 ? '−' : amount > 0 ? '+' : '') + amountText(amount);
  const write = (selector, text) => {
    const node = root.querySelector(selector);
    if (node.textContent !== text) node.textContent = text;
  };
  let active = 'receivables';
  const marks = steps.map((step,index) => {
    const item = document.createElement('li');
    item.className = 'bridge-step';
    const bar = document.createElement('span');
    bar.className = 'bridge-bar';
    const value = document.createElement('span');
    value.className = 'bridge-amount';
    value.setAttribute('aria-hidden','true');
    item.append(bar,value);
    if (index < steps.length - 1) {
      const connector = document.createElement('span');
      connector.className = 'bridge-connector';
      item.append(connector);
    }
    const choice = document.createElement(step.details.length ? 'button' : 'span');
    choice.className = 'bridge-choice';
    const name = document.createElement('span');
    name.textContent = labels.labels[index];
    choice.append(name);
    if (step.details.length) {
      choice.type = 'button';
      choice.dataset.adjustment = step.id;
      choice.addEventListener('click', () => {
        active = step.id;
        showAdjustment();
      });
    }
    item.append(choice);
    graph.append(item);
    return {item,value,choice};
  });

  function showAdjustment() {
    const step = steps.find(step => step.id === active);
    write('[data-source-title]', step.name);
    write('[data-source-detail]', step.details.map(detail => detail.name + ' ' + signed(detail.amount) + ' ' + labels.unit).join(' · '));
    for (const {choice} of marks) if (choice.dataset.adjustment) {
      choice.setAttribute('aria-pressed',String(choice.dataset.adjustment === active));
    }
  }

  function render() {
    const recovered = Number(slider.value);
    const projected = actualCash + recovered;
    const ratio = projected / actualProfit * 100;
    let balance = 0;
    steps.forEach((step,index) => {
      const total = step.id === 'profit' || step.id === 'cash';
      const delta = step.amount + (step.id === 'receivables' || step.id === 'cash' ? recovered : 0);
      const start = total ? 0 : balance;
      const end = start + delta;
      const {item,value,choice} = marks[index];
      balance = end;
      item.dataset.role = total ? 'total' : delta < 0 ? 'outflow' : 'inflow';
      item.style.setProperty('--low', Math.min(start,end) / 30000);
      item.style.setProperty('--high', Math.max(start,end) / 30000);
      item.style.setProperty('--span', Math.abs(delta) / 30000);
      item.style.setProperty('--end', end / 30000);
      value.textContent = total ? amountText(delta) : signed(delta);
      choice.setAttribute('aria-label',step.name + ' ' + value.textContent + ' ' + labels.unit);
    });
    write('[data-profit]', amountText(actualProfit));
    write('[data-flow]', amountText(projected));
    write('[data-ratio]', formatNumber.format(ratio) + '%');
    write('[data-mode]', recovered ? ' · ' + labels.estimate : '');
    write('[data-actual-flow]', recovered ? labels.actual + ' ' + amountText(actualCash) + ' ' + labels.unit : labels.unit);
    const attained = ratio >= 75;
    root.toggleAttribute('data-goal-met',attained);
    write('[data-target]', attained ? labels.targetMet : labels.targetGap + ' ' + formatNumber.format(75-ratio) + ' ' + labels.points);
    const value = locale === 'en' ? 'CNY ' + formatNumber.format(recovered/100) + 'm' : formatNumber.format(recovered) + ' 万元';
    write('[data-collected]', value);
    slider.setAttribute('aria-valuetext', value);
  }
  render();
  showAdjustment();
  slider.addEventListener('input',render);
})();
</script>`
}
