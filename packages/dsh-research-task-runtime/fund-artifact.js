import { MARKET_REGULAR_FONT_CSS } from './market-font.js';
import { WORKBENCH_DESIGN_VERSION } from './workbench-design-contract.js';

// Fund72 source family: Light 1217:247146/247167/247228,
// Dark 1217:254999/255020/255081. The outer canvas title is the source's
// 48px heading; this markup renders only the measured content region.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
const list = (items, max) => Array.isArray(items) && items.length > 0 && items.length <= max;
const cell = (tag, value, attributes = '') => '<' + tag + attributes + '>' + escape(value) + '</' + tag + '>';

const css = [
  ':root{--fund-bg:#fafafa;--fund-surface:#fff;--fund-muted:#ebf1f5;--fund-row:#f0f5f8;--fund-text:#202629;--fund-secondary:#65717a;--fund-line:#e1e6e9;--fund-track:#ebf1f5;--fund-blue:#07509a;--fund-cyan:#19aed9;--fund-positive:#bd3e45;--fund-callout:#fff3d9}',
  ':root[data-sherlock-theme="dark"]{--fund-bg:#292929;--fund-surface:#292929;--fund-muted:#393939;--fund-row:#333a3e;--fund-text:#f6f6f6;--fund-secondary:#aaa;--fund-line:#454545;--fund-track:#414141;--fund-blue:#167fc6;--fund-cyan:#30b9df;--fund-positive:#ff625f;--fund-callout:#51452c}',
  '*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:auto}body{padding:8px 12px 10px;background:var(--fund-bg);color:var(--fund-text);font:11px/18px "EWork Market DIN Regular","Noto Sans SC",sans-serif}',
  '.fund-kpis{display:grid;grid-template-columns:repeat(var(--fund-count),minmax(0,1fr));gap:10px}.fund-kpi{min-width:0;min-height:64px;padding:6px 10px 4px;border-radius:5px;background:var(--fund-muted)}.fund-label{font-size:9px;line-height:14px;color:var(--fund-secondary)}.fund-value{display:block;margin-top:2px;font-size:23px;line-height:26px;font-weight:500;font-variant-numeric:tabular-nums}.fund-detail{font-size:8px;line-height:11px;color:var(--fund-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.fund-filters{display:grid;grid-template-columns:minmax(0,178fr) minmax(0,142fr) minmax(0,184fr);gap:8px;margin-bottom:18px}.fund-control{min-width:0;height:28px;border:.65px solid #d9d9d9;border-radius:6px;padding:0 10px;background:var(--fund-surface);color:var(--fund-text);font:10px/16px "Noto Sans SC",sans-serif}.fund-control:focus-visible,.fund-sort:focus-visible{outline:1px solid var(--fund-blue)}.fund-control[readonly]{color:var(--fund-secondary)}.fund-search::placeholder{color:var(--fund-secondary)}',
  '.fund-table-wrap{max-height:calc(100vh - 88px);overflow:auto}.fund-table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:10px;line-height:18px}.fund-table :is(th,td){height:34px;padding:7px 6px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fund-table th{height:25px;padding:4px 6px;background:var(--fund-muted);color:var(--fund-secondary);font-size:9px;font-weight:400}.fund-table tbody tr:nth-child(odd){background:var(--fund-row)}.fund-table td:first-child{font-weight:700}.fund-table [data-tone="positive"]{color:var(--fund-positive)}.fund-table [data-tone="negative"]{color:var(--fund-secondary)}.fund-sort{width:100%;border:0;background:none;padding:0;text-align:left;color:inherit;font:inherit;cursor:pointer}.fund-footer{margin-top:5px;font-size:9px;color:var(--fund-secondary)}',
  '.fund-industry-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.fund-industry-count,.fund-industry-readout{margin:0 0 6px;color:var(--fund-secondary);font-size:9px;line-height:14px}.fund-industry-readout{min-height:14px;color:var(--fund-text)}.fund-industries{display:grid;gap:9px}.fund-industry{display:grid;grid-template-columns:90px minmax(0,1fr) 43px;gap:4px;align-items:center;min-height:18px;width:100%;padding:0;border:0;background:transparent;color:var(--fund-text);font:inherit;text-align:left;cursor:pointer}.fund-industry[hidden],.fund-industry-empty[hidden]{display:none}.fund-industry:focus-visible,.fund-industry[aria-pressed="true"]{outline:1px solid var(--fund-blue);outline-offset:2px}.fund-industry-label{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fund-track{height:7px;border-radius:2px;background:var(--fund-track);overflow:hidden}.fund-bar{display:block;height:100%;border-radius:2px;background:var(--fund-blue)}.fund-industry:nth-child(even) .fund-bar{background:var(--fund-cyan)}.fund-industry-value{text-align:right;font-size:10px;font-variant-numeric:tabular-nums}.fund-industry-empty{padding:8px 0;color:var(--fund-secondary)}.fund-callout{display:flex;align-items:center;gap:14px;margin:20px 0 0;font-size:9px}.fund-callout[hidden]{display:none}.fund-callout strong{min-width:136px;padding:3px;border-radius:4px;background:var(--fund-callout);font-weight:400;text-align:center}.fund-industry-footer{margin-top:20px;font-size:9px;color:var(--fund-secondary)}',
  '@media(max-width:500px){body[data-sherlock-market="fund-kpi"] .fund-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.fund-filters{grid-template-columns:1fr 1fr}.fund-search{grid-column:1/-1}.fund-table{min-width:480px}.fund-industry{grid-template-columns:75px minmax(0,1fr) 40px}}'
].join('');

function renderKpi(spec) {
  if (!list(spec.items, 6) || spec.items.some(item => !text(item?.label) || !text(item?.value) || item.detail !== undefined && !text(item.detail))) return null;
  return '<div class="fund-kpis" style="--fund-count:' + spec.items.length + '">' + spec.items.map(item =>
    '<div class="fund-kpi">' + cell('div', item.label, ' class="fund-label"') +
    cell('strong', item.value, ' class="fund-value"') +
    (item.detail ? cell('div', item.detail, ' class="fund-detail"') : '') + '</div>').join('') + '</div>';
}
function renderHoldings(spec) {
  if (!list(spec.columns, 8) || !spec.columns.every(text) || !list(spec.rows, 30) ||
      spec.rows.some(row => !Array.isArray(row) || row.length !== spec.columns.length ||
        row.some(value => typeof value !== 'string' && typeof value !== 'number'))) return null;
  const widths = spec.columns.length === 5 ? [35,17,16,16,16] : null;
  const colgroup = widths ? '<colgroup>' + widths.map(width => '<col style="width:' + width + '%">').join('') + '</colgroup>' : '';
  const head = '<thead><tr>' + spec.columns.map((name, index) =>
    '<th><button class="fund-sort" data-column="' + index + '" aria-label="按' + escape(name) + '排序">' + escape(name) + '</button></th>').join('') + '</tr></thead>';
  const rows = spec.rows.map(row => '<tr>' + row.map(value => {
    const tone = /^[+＋]/.test(String(value)) ? 'positive' : /^[-−]/.test(String(value)) ? 'negative' : '';
    return cell('td', value, tone ? ' data-tone="' + tone + '"' : '');
  }).join('') + '</tr>').join('');
  const simulated = /模拟|演示/u.test(spec.asOf);
  const filters = '<div class="fund-filters"><input class="fund-control" value="' + (simulated ? '模拟基金池' : '基金池') + '" aria-label="基金池" readonly>' +
    '<input class="fund-control" value="' + escape(spec.period || (simulated ? '模拟时点' : '当前时点')) + '" aria-label="数据期间" readonly>' +
    '<input class="fund-control fund-search" type="search" placeholder="搜索名称" aria-label="搜索名称"></div>';
  return filters + '<div class="fund-table-wrap"><table class="fund-table">' + colgroup + head + '<tbody>' + rows +
    '</tbody></table></div><div class="fund-footer">' + (simulated ? '模拟数据 · ' : '') + spec.rows.length + ' 条 · 可搜索与排序</div>';
}
function renderIndustry(spec) {
  if (!list(spec.items, 12) || spec.items.some(item => !text(item?.label) ||
      !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100 ||
      !Number.isFinite(item.benchmark) || item.benchmark < 0 || item.benchmark > 100)) return null;
  const max = Math.max(1, ...spec.items.map(item => item.weight));
  const rows = spec.items.map(item => '<button type="button" class="fund-industry" data-label="' + escape(item.label) + '" data-weight="' + item.weight + '" data-benchmark="' + item.benchmark + '" data-delta="' + (item.weight - item.benchmark) + '" aria-pressed="false" aria-label="' + escape(item.label + ' · 组合 ' + item.weight + '% · 基准 ' + item.benchmark + '%') + '">' +
    cell('span', item.label, ' class="fund-industry-label"') +
    '<span class="fund-track"><span class="fund-bar" style="width:' + Math.max(1, item.weight / max * 83).toFixed(1) + '%"></span></span>' +
    cell('span', item.weight.toFixed(1) + '%', ' class="fund-industry-value"') + '</button>').join('');
  const prominent = [...spec.items].sort((a, b) => Math.abs(b.weight - b.benchmark) - Math.abs(a.weight - a.benchmark))[0];
  const delta = prominent.weight - prominent.benchmark;
  return '<div class="fund-industry-filters"><select class="fund-control fund-industry-filter" aria-label="偏离筛选"><option value="all">全部行业</option><option value="over">超配行业</option><option value="under">低配行业</option></select>' +
    '<select class="fund-control fund-industry-sort" aria-label="行业排序"><option value="weight">按组合权重</option><option value="delta">按偏离幅度</option><option value="name">按行业名称</option></select></div>' +
    '<div class="fund-industry-count" role="status">' + spec.items.length + ' / ' + spec.items.length + ' 个行业</div><div class="fund-industries">' + rows +
    '</div><div class="fund-industry-empty" hidden>该筛选条件下暂无行业</div><div class="fund-industry-readout" role="status"></div>' +
    '<div class="fund-callout"><strong>' + escape(prominent.label) + (delta >= 0 ? '超配 +' : '低配 ') +
    Math.abs(delta).toFixed(1) + '%</strong><span>基准 ' + prominent.benchmark.toFixed(1) + '%</span></div>' +
    '<div class="fund-industry-footer">' + escape(spec.note || '行业权重 · 组合与基准对照') + '</div>';
}
const holdingsScript = "const search=document.querySelector('.fund-search'),body=document.querySelector('tbody');search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();for(const row of body.rows)row.hidden=!row.textContent.toLocaleLowerCase().includes(q)});document.querySelectorAll('[data-column]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.column),asc=button.dataset.order!=='asc';button.dataset.order=asc?'asc':'desc';document.querySelectorAll('th').forEach(th=>th.removeAttribute('aria-sort'));button.parentElement.setAttribute('aria-sort',asc?'ascending':'descending');const rows=[...body.rows];rows.sort((a,b)=>{const left=a.cells[index].textContent,right=b.cells[index].textContent;const n=v=>Number(v.replace(/[,，%]/g,''));const diff=Number.isFinite(n(left))&&Number.isFinite(n(right))?n(left)-n(right):left.localeCompare(right,'zh-CN',{numeric:true});return asc?diff:-diff});rows.forEach(row=>body.appendChild(row))}));";
function fundIndustryRuntime() {
  const filter=document.querySelector('.fund-industry-filter'),sort=document.querySelector('.fund-industry-sort'),container=document.querySelector('.fund-industries'),count=document.querySelector('.fund-industry-count'),readout=document.querySelector('.fund-industry-readout'),empty=document.querySelector('.fund-industry-empty'),callout=document.querySelector('.fund-callout');
  const rows=[...container.querySelectorAll('.fund-industry')];
  const describe=row=>{const delta=Number(row.dataset.delta);return `${row.dataset.label} · 组合 ${Number(row.dataset.weight).toFixed(1)}% · 基准 ${Number(row.dataset.benchmark).toFixed(1)}% · ${delta>=0?'超配 +':'低配 '}${Math.abs(delta).toFixed(1)} 个百分点`};
  const select=row=>{rows.forEach(item=>item.setAttribute('aria-pressed',String(item===row)));readout.textContent=row?describe(row):''};
  const update=()=>{
    rows.forEach(row=>{const delta=Number(row.dataset.delta);row.hidden=filter.value==='over'?delta<=0:filter.value==='under'?delta>=0:false});
    const ordered=[...rows].sort((a,b)=>sort.value==='name'?a.dataset.label.localeCompare(b.dataset.label,'zh-CN'):sort.value==='delta'?Math.abs(Number(b.dataset.delta))-Math.abs(Number(a.dataset.delta)):Number(b.dataset.weight)-Number(a.dataset.weight));
    ordered.forEach(row=>container.appendChild(row));
    const visible=ordered.filter(row=>!row.hidden);count.textContent=`${visible.length} / ${rows.length} 个行业`;empty.hidden=visible.length>0;callout.hidden=visible.length===0;
    const selected=visible.find(row=>row.getAttribute('aria-pressed')==='true')||visible[0];select(selected);
    if(visible.length){const prominent=[...visible].sort((a,b)=>Math.abs(Number(b.dataset.delta))-Math.abs(Number(a.dataset.delta)))[0],delta=Number(prominent.dataset.delta);callout.querySelector('strong').textContent=`${prominent.dataset.label}${delta>=0?'超配 +':'低配 '}${Math.abs(delta).toFixed(1)}%`;callout.querySelector('span').textContent=`基准 ${Number(prominent.dataset.benchmark).toFixed(1)}%`}
  };
  rows.forEach(row=>{row.addEventListener('click',()=>select(row));row.addEventListener('focus',()=>select(row))});filter.addEventListener('change',update);sort.addEventListener('change',update);update();
}

export function renderFundMarketArtifact(spec) {
  if (!['fund-kpi', 'fund-holdings', 'fund-industry'].includes(spec?.variant)) return null;
  if (!text(spec.title) || !text(spec.asOf) || spec.period !== undefined && !text(spec.period)) return null;
  const body = spec.variant === 'fund-kpi' ? renderKpi(spec)
    : spec.variant === 'fund-holdings' ? renderHoldings(spec) : renderIndustry(spec);
  if (body === null) return null;
  const script = spec.variant === 'fund-holdings' ? '<script>' + holdingsScript + '</script>' : spec.variant === 'fund-industry' ? '<script>(' + fundIndustryRuntime.toString() + ')();</script>' : '';
  return { version:1, type:'html', title:spec.title, html:'<!doctype html><html><head><meta charset="utf-8"><meta name="sherlock-header-note" content="' +
    escape(spec.asOf) + '"><style>' + MARKET_REGULAR_FONT_CSS + css + '</style></head><body data-sherlock-market="' +
    spec.variant + '" data-sherlock-design="' + WORKBENCH_DESIGN_VERSION + '" aria-label="' + escape(spec.title) + '">' +
    body + script + '</body></html>' };
}
