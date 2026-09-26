// Only the host-rendered, source-contracted market table is eligible. Parse
// its escaped cells into text before rendering them in the canvas DOM, so a
// zoomed canvas does not enlarge an iframe's cached bitmap.
export function parseResearchMarketNativeTable(html, doc) {
  const variant = typeof html === 'string' && html.match(/<body\b[^>]*data-sherlock-market="(table|fund-holdings)"[^>]*data-sherlock-design="21m-20260923-v1"/)?.[1];
  if (!variant) return null;
  const fragment = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  const Parser = doc?.defaultView?.DOMParser;
  if (!fragment || typeof Parser !== 'function') return null;
  const parsed = new Parser().parseFromString(fragment, 'text/html');
  const table = parsed.querySelector('table');
  const columns = [...(table?.querySelectorAll('thead th') ?? [])].map(cell => cell.textContent?.trim() ?? '');
  const rows = [...(table?.querySelectorAll('tbody tr') ?? [])].map(row => [...row.querySelectorAll('td')].map(cell => ({
    text: cell.textContent?.trim() ?? '', tone: cell.getAttribute('data-tone') ?? ''
  })));
  if (!columns.length || columns.length > 12 || !rows.length || rows.length > 100 ||
      columns.some(value => !value) || rows.some(row => row.length !== columns.length)) return null;
  return { columns, rows, variant, ...(variant === 'fund-holdings'
    ? { simulated: /<meta name="sherlock-header-note" content="[^"]*(?:模拟|演示)/.test(html) } : {}) };
}

export function ResearchMarketNativeTable({ data }) {
  const [order, setOrder] = react.useState({ column: -1, ascending: true });
  const [query, setQuery] = react.useState('');
  const [selected, setSelected] = react.useState(null);
  if (!data) return (0, react_jsx_runtime.jsx)('div', { children: '表格暂不可用' });
  const filtered = query.trim()
    ? data.rows.filter(row => row.some(cell => cell.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    : data.rows;
  const rows = order.column < 0 ? filtered : [...filtered].sort((a, b) => {
    const left = a[order.column].text, right = b[order.column].text;
    const numeric = value => {
      const match=value.trim().replace(/[,，]/g,'').match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(万亿|亿|万|%|元|股)?$/);
      return match?Number(match[1])*({万亿:1e12,亿:1e8,万:1e4}[match[2]]??1):NaN;
    };
    const x = numeric(left), y = numeric(right);
    const comparison = Number.isFinite(x) && Number.isFinite(y)
      ? x - y : left.localeCompare(right, 'zh-CN', { numeric: true });
    return order.ascending ? comparison : -comparison;
  });
  // Limit display precision only. Sorting and expanded row details retain the source text.
  const display = (cell, column) => {
    if (/代码|编号|日期|交易日|时间|ticker|code|id/i.test(column)) return cell.text;
    const match = cell.text.match(/^([+-]?\d+\.\d{3,})(%?)$/);
    if (!match) return cell.text;
    const number = Number(match[1]);
    if (!Number.isFinite(number)) return cell.text;
    const digits = match[2] || /亿|万|率|幅/.test(column) ? 2 : 6;
    return number.toLocaleString('en-US', {useGrouping:false, maximumFractionDigits:digits}) + match[2];
  };
  const selectedRow = selected && data.rows.find(row => row[0]?.text === selected);
  return (0, react_jsx_runtime.jsxs)('div', { 'data-sherlock-market-native': data.variant, children: [
    (0, react_jsx_runtime.jsxs)('div', { className: 'terminal-native-filters', children: [
      (0, react_jsx_runtime.jsx)('input', { type: 'search', value: query, placeholder: '搜索表格内容', 'aria-label': '搜索表格内容',
        onChange: event => setQuery(event.target.value) })
      ,(0, react_jsx_runtime.jsx)('span', { children: `${rows.length} / ${data.rows.length} 行${data.simulated ? ' · 模拟数据' : ''}` })
    ] }),
    (0, react_jsx_runtime.jsx)('div', { className: 'fund-native-table-wrap', children: (0, react_jsx_runtime.jsxs)('table', { children: [
      (0, react_jsx_runtime.jsx)('thead', { children: (0, react_jsx_runtime.jsx)('tr', { children:
        data.columns.map((column, index) => (0, react_jsx_runtime.jsx)('th', {
          'aria-sort': order.column === index ? order.ascending ? 'ascending' : 'descending' : undefined,
          children: (0, react_jsx_runtime.jsx)('button', { type: 'button', 'aria-label': `按${column}排序`,
            onClick: () => setOrder(previous => ({ column: index, ascending: previous.column !== index || !previous.ascending })),
            children: column })
        }, index)) }) }),
      (0, react_jsx_runtime.jsx)('tbody', { children: rows.map((row, rowIndex) =>
        (0, react_jsx_runtime.jsx)('tr', { tabIndex:0, 'aria-selected':selected===row[0]?.text,
          onClick:()=>setSelected(previous=>previous===row[0]?.text?null:row[0]?.text),
          onKeyDown:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(previous=>previous===row[0]?.text?null:row[0]?.text)}},
          children: row.map((cell, index) =>
          (0, react_jsx_runtime.jsx)('td', { 'data-tone': cell.tone, title:cell.text, children: display(cell,data.columns[index]) }, index)) }, rowIndex)) })
    ] }) }),
    selectedRow && (0,react_jsx_runtime.jsx)('div',{className:'terminal-native-readout',role:'status',children:selectedRow.map((cell,i)=>`${data.columns[i]}：${cell.text}`).join(' · ')})
  ] });
}

export const researchMarketNativeTableCss = `
[data-sherlock-market-native] .terminal-native-filters{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;line-height:18px}
[data-sherlock-market-native] .terminal-native-filters input{box-sizing:border-box;min-width:60px;flex:1;height:24px;padding:2px 7px;border:1px solid #b8c7d2;border-radius:2px;background:#f3f6f8;color:inherit;font-family:inherit;font-size:12px;line-height:18px}
[data-sherlock-market-native] .terminal-native-filters span{white-space:nowrap}
[data-sherlock-market-native] .fund-native-table-wrap{max-height:calc(100% - 30px);overflow:auto}
[data-sherlock-market-native]:has(.terminal-native-readout) .fund-native-table-wrap{max-height:calc(100% - 84px)}
[data-sherlock-market-native] .terminal-native-readout{max-height:48px;overflow:auto;margin-top:6px;font-size:11px;line-height:16px;overflow-wrap:anywhere}
[data-sherlock-market-native] tbody tr{cursor:pointer}
[data-sherlock-market-native] tbody tr:focus-visible{outline:1px solid #0d99ff;outline-offset:-1px}
[data-sherlock-market-native] tbody tr[aria-selected=true]{box-shadow:inset 2px 0 #0d99ff}
body[data-ds-dark-theme] [data-sherlock-market-native] .terminal-native-filters input{background:#19222c;border-color:#3c4b5c}
[data-sherlock-market-native="table"]{box-sizing:border-box;width:100%;height:100%;padding:8px 12px 6px;overflow:auto;container-type:inline-size;background:rgba(255,255,255,.76);color:#202629;font:14px/20px "EWork Market DIN Regular",DINPro,"Noto Sans SC",sans-serif}
[data-sherlock-market-native="table"] table{width:100%;border-collapse:collapse;table-layout:auto;font:inherit}
[data-sherlock-market-native="table"] :is(th,td){box-sizing:border-box;padding:3px 3px;border:0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
[data-sherlock-market-native="table"] :is(th:first-child,td:first-child){text-align:left}
[data-sherlock-market-native="table"] th{font-size:11px;line-height:16px;font-weight:500;color:#65717a;border-bottom:.5px solid #d9e0e5}
[data-sherlock-market-native="table"] thead{background:#ebf1f5}
[data-sherlock-market-native="table"] tbody tr:nth-child(even){background:#f0f3f5}
[data-sherlock-market-native="table"] tbody tr:first-child{background:#e3eff5}
[data-sherlock-market-native="table"] th button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-align:inherit}
[data-sherlock-market-native="table"] th button:focus-visible{outline:1px solid #0d99ff}
@container (min-width:600px){[data-sherlock-market-native="table"] :is(th,td){padding:4px 6px}[data-sherlock-market-native="table"] th{font-size:12px;line-height:17px}}
[data-component-expanded=true] [data-sherlock-market-native="table"]{padding:16px 20px;font-size:14px;line-height:21px}
[data-component-expanded=true] [data-sherlock-market-native="table"] table{font-size:14px;line-height:21px}
[data-component-expanded=true] [data-sherlock-market-native="table"] :is(th,td){padding:6px 8px}
[data-component-expanded=true] [data-sherlock-market-native="table"] th{font-size:12px;line-height:18px}
[data-sherlock-market-native="table"] [data-tone=positive]{color:#c62f36}
[data-sherlock-market-native="table"] [data-tone=negative]{color:#008565}
[data-sherlock-market-native="fund-holdings"]{box-sizing:border-box;width:100%;height:100%;padding:11px 12px 10px;overflow:auto;background:#fafafa;color:#202629;font:10px/18px "EWork Market DIN Regular",DINPro,"Noto Sans SC",sans-serif}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters{display:grid;grid-template-columns:178fr 142fr 184fr;gap:8px;margin-bottom:18px}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters :is(span,input){box-sizing:border-box;display:flex;align-items:center;min-width:0;height:28px;padding:0 10px;border:.65px solid #d9d9d9;border-radius:6px;background:#fff;color:#333;font:10px/16px "Noto Sans SC",sans-serif}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters input:focus-visible{outline:1px solid #333}
[data-sherlock-market-native="fund-holdings"] .fund-native-table-wrap{max-height:calc(100% - 46px);overflow:auto}
[data-sherlock-market-native="fund-holdings"] table{width:100%;table-layout:fixed;border-collapse:collapse}
[data-sherlock-market-native="fund-holdings"] :is(th,td){box-sizing:border-box;height:34px;padding:7px 6px;border:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
[data-sherlock-market-native="fund-holdings"] th{height:25px;padding:4px 6px;background:#ebf1f5;color:#65717a;font-size:9px;font-weight:400}
[data-sherlock-market-native="fund-holdings"] th button{width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
[data-sherlock-market-native="fund-holdings"] tbody tr:nth-child(odd){background:#f0f5f8}
[data-sherlock-market-native="fund-holdings"] td:first-child{font-weight:700}
[data-sherlock-market-native="fund-holdings"] [data-tone=positive]{color:#bd3e45}
body[data-ds-dark-theme] [data-sherlock-market-native="fund-holdings"]{background:#292929;color:#f6f6f6}
body[data-ds-dark-theme] [data-sherlock-market-native="fund-holdings"] .fund-native-filters :is(span,input){border-color:#505050;background:#292929;color:#f5f5f5}
body[data-ds-dark-theme] [data-sherlock-market-native="fund-holdings"] th{background:#393939;color:#aaa}
body[data-ds-dark-theme] [data-sherlock-market-native="fund-holdings"] tbody tr:nth-child(odd){background:#333a3e}
body[data-ds-dark-theme] [data-sherlock-market-native="fund-holdings"] [data-tone=positive]{color:#ff625f}
@container (max-width:500px){[data-sherlock-market-native="fund-holdings"] .fund-native-filters{grid-template-columns:1fr 1fr}[data-sherlock-market-native="fund-holdings"] .fund-native-filters input{grid-column:1/-1}[data-sherlock-market-native="fund-holdings"] table{min-width:480px}}
body[data-ds-dark-theme] [data-sherlock-market-native="table"]{background:rgba(64,64,64,.4);color:#fff}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] th{color:#dedede;border-bottom-color:#565656}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] thead{background:rgba(56,56,56,.8)}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] tbody tr:nth-child(even){background:rgba(80,80,80,.07)}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] tbody tr:first-child{background:rgba(222,222,222,.13)}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] [data-tone=positive]{color:#ff625f}
body[data-ds-dark-theme] [data-sherlock-market-native="table"] [data-tone=negative]{color:#22d6a0}

body [data-research-artifact-card] [data-sherlock-market-native]{padding:8px!important;background:var(--research-completed-surface,#fff)!important;color:var(--research-completed-text,#1b2734)!important;font-size:12px!important;line-height:18px!important}
body [data-research-artifact-card] [data-sherlock-market-native] :is(th,td){height:25px!important;padding:3px 7px!important;font-size:12px!important;line-height:18px!important;text-align:right;border-bottom:1px solid var(--research-completed-divider,#d4dce5)}
body [data-research-artifact-card] [data-sherlock-market-native] :is(th:first-child,td:first-child){text-align:left}
body [data-research-artifact-card] [data-sherlock-market-native] th{font-size:11px!important;color:var(--research-completed-action,#80500c)!important;background:var(--research-completed-inset,#edf1f5)!important;position:sticky;top:0;z-index:1}
body [data-research-artifact-card] [data-sherlock-market-native] tbody tr:nth-child(odd){background:transparent}
body [data-research-artifact-card] [data-sherlock-market-native] tbody tr:nth-child(even){background:var(--research-completed-row,#f5f7fa)}
`;
