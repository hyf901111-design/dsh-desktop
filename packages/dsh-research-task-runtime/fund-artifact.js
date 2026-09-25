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
  '.fund-industry-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px}.fund-industries{display:grid;gap:9px}.fund-industry{display:grid;grid-template-columns:90px minmax(0,1fr) 43px;gap:4px;align-items:center;min-height:18px}.fund-industry-label{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fund-track{height:7px;border-radius:2px;background:var(--fund-track);overflow:hidden}.fund-bar{display:block;height:100%;border-radius:2px;background:var(--fund-blue)}.fund-industry:nth-child(even) .fund-bar{background:var(--fund-cyan)}.fund-industry-value{text-align:right;font-size:10px;font-variant-numeric:tabular-nums}.fund-callout{display:flex;align-items:center;gap:14px;margin:27px 0 0;font-size:9px}.fund-callout strong{min-width:136px;padding:3px;border-radius:4px;background:var(--fund-callout);font-weight:400;text-align:center}.fund-industry-footer{margin-top:34px;font-size:9px;color:var(--fund-secondary)}',
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
  const rows = spec.items.map(item => '<div class="fund-industry" title="' + escape(item.label + ' 组合 ' + item.weight + '% · 基准 ' + item.benchmark + '%') + '">' +
    cell('span', item.label, ' class="fund-industry-label"') +
    '<span class="fund-track"><span class="fund-bar" style="width:' + Math.max(1, item.weight / max * 83).toFixed(1) + '%"></span></span>' +
    cell('span', item.weight.toFixed(1) + '%', ' class="fund-industry-value"') + '</div>').join('');
  const prominent = [...spec.items].sort((a, b) => Math.abs(b.weight - b.benchmark) - Math.abs(a.weight - a.benchmark))[0];
  const delta = prominent.weight - prominent.benchmark;
  return '<div class="fund-industry-filters"><input class="fund-control" value="申万一级" aria-label="行业分类" readonly>' +
    '<input class="fund-control" value="穿透权重" aria-label="指标" readonly></div><div class="fund-industries">' + rows +
    '</div><div class="fund-callout"><strong>' + escape(prominent.label) + (delta >= 0 ? '超配 +' : '低配 ') +
    Math.abs(delta).toFixed(1) + '%</strong><span>基准 ' + prominent.benchmark.toFixed(1) + '%</span></div>' +
    '<div class="fund-industry-footer">' + escape(spec.note || '行业权重 · 组合与基准对照') + '</div>';
}
const holdingsScript = "const search=document.querySelector('.fund-search'),body=document.querySelector('tbody');search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();for(const row of body.rows)row.hidden=!row.textContent.toLocaleLowerCase().includes(q)});document.querySelectorAll('[data-column]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.column),asc=button.dataset.order!=='asc';button.dataset.order=asc?'asc':'desc';document.querySelectorAll('th').forEach(th=>th.removeAttribute('aria-sort'));button.parentElement.setAttribute('aria-sort',asc?'ascending':'descending');const rows=[...body.rows];rows.sort((a,b)=>{const left=a.cells[index].textContent,right=b.cells[index].textContent;const n=v=>Number(v.replace(/[,，%]/g,''));const diff=Number.isFinite(n(left))&&Number.isFinite(n(right))?n(left)-n(right):left.localeCompare(right,'zh-CN',{numeric:true});return asc?diff:-diff});rows.forEach(row=>body.appendChild(row))}));";

export function renderFundMarketArtifact(spec) {
  if (!['fund-kpi', 'fund-holdings', 'fund-industry'].includes(spec?.variant)) return null;
  if (!text(spec.title) || !text(spec.asOf) || spec.period !== undefined && !text(spec.period)) return null;
  const body = spec.variant === 'fund-kpi' ? renderKpi(spec)
    : spec.variant === 'fund-holdings' ? renderHoldings(spec) : renderIndustry(spec);
  if (body === null) return null;
  const script = spec.variant === 'fund-holdings' ? '<script>' + holdingsScript + '</script>' : '';
  return { version:1, type:'html', title:spec.title, html:'<!doctype html><html><head><meta charset="utf-8"><meta name="sherlock-header-note" content="' +
    escape(spec.asOf) + '"><style>' + MARKET_REGULAR_FONT_CSS + css + '</style></head><body data-sherlock-market="' +
    spec.variant + '" data-sherlock-design="' + WORKBENCH_DESIGN_VERSION + '" aria-label="' + escape(spec.title) + '">' +
    body + script + '</body></html>' };
}
