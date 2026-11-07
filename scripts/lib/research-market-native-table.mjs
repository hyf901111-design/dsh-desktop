// Only the host-rendered, source-contracted market table is eligible. Parse
// its escaped cells into text before rendering them in the canvas DOM, so a
// zoomed canvas does not enlarge an iframe's cached bitmap.
export function parseResearchMarketNativeTable(html, doc) {
  const variant = typeof html === 'string' && html.match(/<body\b[^>]*data-sherlock-market="(table|fund-holdings)"[^>]*data-sherlock-design="21m-20260923-v1"/)?.[1];
  if (!variant) return null;
  // Explicit layouts carry context, complete notes and their own interaction.
  // The cell-only native optimization must not flatten that host composition.
  if (/<body\b[^>]*\bdata-layout-profile="openterminal"/.test(html)) return null;
  const Parser = doc?.defaultView?.DOMParser;
  if (typeof Parser !== 'function') return null;
  // Parse inertly. Only the small host composition below can be projected;
  // unknown visible structures or runtimes keep the complete sandbox instead.
  const parsed = new Parser().parseFromString(html, 'text/html');
  const body = parsed.body;
  if (body.getAttribute('data-sherlock-market') !== variant || parsed.querySelectorAll('table').length !== 1) return null;
  const scripts = [...parsed.querySelectorAll('script')];
  const retained = scripts.filter(script => script.id === 'sherlock-template-data');
  if (retained.length > 1) return null;
  if (retained.length) {
    const script = retained[0];
    if (script.parentElement !== body || script.attributes.length !== 2 ||
        script.getAttribute('type') !== 'application/json') return null;
    // The host appends inert refresh metadata after its rendered document.
    // Recognize that envelope only; visible HTML remains the projection source.
    // Never execute or render strings/links from the retained data object.
    try {
      const model = JSON.parse(script.textContent);
      if (!model || Object.keys(model).sort().join(',') !== 'data,templateId,version' ||
          model.templateId !== `market.${variant}` || model.version !== '21m-20260923-v1' ||
          !model.data || Array.isArray(model.data) || model.data.version !== 1 ||
          model.data.type !== 'market' || model.data.variant !== variant) return null;
    } catch { return null; }
  }
  const runtimes = scripts.filter(script => !retained.includes(script));
  // Fingerprints identify the two fixed host runtimes that our controls replace.
  // They grant no execution privilege: scripts are never evaluated. Host script
  // changes deliberately fall back until their projection is reviewed again.
  const knownRuntime = variant === 'table' ? [2411, 2045077824] : [979, 2127678402];
  if (runtimes.length > 1 || runtimes.some(script => {
    let hash = 2166136261;
    for (const char of script.textContent) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return script.attributes.length || script.textContent.length !== knownRuntime[0] || (hash >>> 0) !== knownRuntime[1];
  })) return null;
  const safeHref = value => {
    try {
      if (typeof value !== 'string' || value.length > 8192) return null;
      const url = new URL(value);
      return url.href.length <= 8192 && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? value : null;
    } catch { return null; }
  };
  const hasOnly = (node, names) => [...node.attributes].every(attr => names.includes(attr.name));
  if (!hasOnly(body, ['data-sherlock-market', 'data-sherlock-design', 'aria-label']) ||
      body.getAttribute('data-sherlock-design') !== '21m-20260923-v1') return null;
  let invalid = false;
  const parts = node => [...node.childNodes].flatMap(child => {
    if (child.nodeType === 3) return [{ text: child.textContent }];
    if (child.nodeType !== 1) { invalid = true; return []; }
    if (child.tagName === 'SPAN' && hasOnly(child, ['class']) && (!child.className || child.className === 'market-asof')) return parts(child);
    if (child.tagName === 'A' && hasOnly(child, ['href', 'target', 'rel', 'aria-label']) &&
        [...child.childNodes].every(item => item.nodeType === 3)) {
      const href = safeHref(child.getAttribute('href'));
      if (href) return [{ text: child.textContent, href }];
    }
    invalid = true; return [];
  });
  const table = parsed.querySelector('table');
  // Only one header row of TH cells and one body of TD rows are supported.
  // Match extraction to that exact hierarchy so other visible cells/sections
  // cannot pass the width checks and then silently disappear or flatten.
  const heads = [...table.children].filter(node => node.tagName === 'THEAD');
  const bodies = [...table.children].filter(node => node.tagName === 'TBODY');
  if (heads.length !== 1 || bodies.length !== 1 || heads[0].children.length !== 1 ||
      heads[0].firstElementChild.tagName !== 'TR' ||
      [...heads[0].firstElementChild.children].some(cell => cell.tagName !== 'TH') ||
      [...bodies[0].children].some(row => row.tagName !== 'TR' || [...row.children].some(cell => cell.tagName !== 'TD'))) return null;
  // A cell/header can contain escaped text or one plain safe anchor; no HTML is
  // promoted into the client. Preserve link segments as well as original text.
  const columns = [...table.querySelectorAll('thead th')].map(cell => {
    const button = cell.querySelector(':scope > button');
    const content = parts(button || cell);
    return content.map(part => part.text).join('').trim();
  });
  const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => {
    const content = parts(cell);
    return { text: cell.textContent?.trim() ?? '', tone: cell.getAttribute('data-tone') ?? '',
      ...(content.some(part => part.href) ? { parts: content } : {}) };
  }));
  // Reject structures whose content would otherwise disappear (extra headings,
  // nested tables, rich cells, custom controls, non-empty host readouts, etc.).
  const expected = variant === 'table'
    ? ['terminal-table-toolbar', 'market-table-wrap', 'terminal-table-readout', 'market-footer']
    : ['fund-filters', 'fund-table-wrap', 'fund-footer'];
  const footer = [];
  for (const child of body.childNodes) {
    if (child.nodeType === 3 && !child.textContent.trim() || child.nodeType === 1 && child.tagName === 'SCRIPT') continue;
    if (child.nodeType !== 1 || !expected.includes(child.className) ||
        child.tagName !== (child.className === 'market-footer' ? 'FOOTER' : 'DIV') ||
        !hasOnly(child, child.className === 'terminal-table-readout' ? ['class', 'role'] : ['class'])) return null;
    if (child.className === 'market-footer' || child.className === 'fund-footer') {
      if (!hasOnly(child, ['class'])) return null;
      const lines = child.className === 'market-footer' ? [...child.childNodes] : [child];
      for (const line of lines) {
        if (child.className === 'market-footer' && line.nodeType !== 3 &&
            (line.tagName !== 'SPAN' || !hasOnly(line, ['class']) || line.className && line.className !== 'market-asof')) return null;
        const content = line.nodeType === 3 ? [{ text: line.textContent }] : parts(line);
        if (content.some(part => part.text.trim())) footer.push(content);
      }
    } else if (child.className.endsWith('table-wrap')) {
      if (child.children.length !== 1 || child.firstElementChild !== table || [...child.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return null;
    } else if (child.className === 'terminal-table-readout') {
      if (child.childNodes.length) return null;
    } else {
      const inputs = [...child.querySelectorAll('input')];
      if ([...child.children].some(n => !['INPUT', 'SPAN'].includes(n.tagName)) || child.textContent.trim() ||
          [...child.querySelectorAll('span')].some(span => span.children.length || !hasOnly(span, ['data-market-count','role'])) ||
          inputs.some(input => !hasOnly(input, ['class','value','aria-label','readonly','type','placeholder','data-market-search'])) ||
          inputs.some(input => input.type !== 'search' && !input.readOnly) ||
          variant === 'table' && (inputs.length !== 1 || inputs[0].type !== 'search')) return null;
      if (variant === 'fund-holdings') for (const input of inputs.filter(input => input.readOnly)) footer.push([{ text: input.getAttribute('aria-label') + '：' + input.value }]);
    }
  }
  // The host header metadata is already displayed by the client. Retain its
  // exact date/source text here too, without deriving a date from the note.
  const asOf = parsed.querySelector('meta[name="sherlock-header-note"]')?.getAttribute('content');
  if (asOf && !body.querySelector('.market-asof')) footer.unshift([{ text: asOf }]);
  const structure = { TABLE:['COLGROUP','THEAD','TBODY'], COLGROUP:['COL'], THEAD:['TR'], TBODY:['TR'], TR:['TH','TD'], TH:['BUTTON'], BUTTON:[], COL:[] };
  const attributes = { TABLE:['class','style'], COLGROUP:[], COL:['style'], THEAD:[], TBODY:[], TR:[], TH:['data-numeric'], TD:['data-numeric','data-tone'], BUTTON:['class','data-column','aria-label'], A:['href','target','rel','aria-label'] };
  if ([...table.querySelectorAll('*'), table].some(node => !hasOnly(node, attributes[node.tagName] || []) ||
      node.hasAttribute('style') && !(node.tagName === 'TABLE' && node.getAttribute('style') === 'table-layout:fixed' ||
        node.tagName === 'COL' && /^width:\d+(?:\.\d+)?%$/.test(node.getAttribute('style'))))) return null;
  if ([...table.querySelectorAll('*'), table].some(node => {
    if (!(node.tagName in structure)) return false;
    return [...node.children].some(child => !structure[node.tagName].includes(child.tagName)) ||
      !['TH','BUTTON'].includes(node.tagName) && [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim());
  }) || [...table.querySelectorAll('th')].some(cell => cell.querySelector('a') || cell.children.length && [...cell.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ||
      [...body.querySelectorAll('*')].some(node => [...node.attributes].some(attr => /^on/i.test(attr.name)))) return null;
  if (table.querySelector('caption,[rowspan],[colspan],tfoot') ||
      [...table.querySelectorAll('*')].some(node => !['COLGROUP','COL','THEAD','TBODY','TR','TH','TD','BUTTON','A'].includes(node.tagName)) ||
      [...table.querySelectorAll('th')].some(cell => cell.querySelectorAll('button').length > 1 || cell.children.length > 1) ||
      [...table.querySelectorAll('button')].some(button => button.parentElement.tagName !== 'TH') ||
      parsed.querySelector('[hidden],[style*="display:none"],[style*="display: none"]')) return null;
  if (invalid || !columns.length || columns.length > 12 || !rows.length || rows.length > 100 ||
      columns.some(value => !value) || rows.some(row => row.length !== columns.length)) return null;
  return { columns, rows, variant, ...(footer.length ? { footer } : {}), ...(variant === 'fund-holdings'
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
  const renderParts = parts => parts.map((part, index) => part.href
    ? (0, react_jsx_runtime.jsx)('a', { href: part.href, children: part.text }, index) : part.text);
  const isLink = event => event.target?.closest?.('a[href]');
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
          onClick:event=>{if(!isLink(event))setSelected(previous=>previous===row[0]?.text?null:row[0]?.text)},
          onKeyDown:event=>{if(isLink(event))return;if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(previous=>previous===row[0]?.text?null:row[0]?.text)}},
          children: row.map((cell, index) =>
          (0, react_jsx_runtime.jsx)('td', { 'data-tone': cell.tone, title:cell.text, children: cell.parts ? renderParts(cell.parts) : display(cell,data.columns[index]) }, index)) }, rowIndex)) })
    ] }) }),
    selectedRow && (0,react_jsx_runtime.jsx)('div',{className:'terminal-native-readout',role:'status',children:selectedRow.map((cell,i)=>(0,react_jsx_runtime.jsxs)('span',{children:[i ? ' · ' : '', `${data.columns[i]}：`,cell.parts ? renderParts(cell.parts) : cell.text]},i))})
    ,data.footer?.length > 0 && (0,react_jsx_runtime.jsx)('footer',{className:'terminal-native-context','aria-label':'组件数据说明',children:(0,react_jsx_runtime.jsxs)('details',{children:[(0,react_jsx_runtime.jsx)('summary',{children:'口径与来源'}),(0,react_jsx_runtime.jsx)('div',{className:'terminal-native-context-lines',children:data.footer.map((line,i)=>(0,react_jsx_runtime.jsx)('div',{children:renderParts(line)},i))})]})})
  ] });
}

export const researchMarketNativeTableCss = `
[data-sherlock-market-native]{display:flex;flex-direction:column;min-width:0;min-height:0;gap:6px}
[data-sherlock-market-native] table{color:inherit}
[data-sherlock-market-native] .terminal-native-filters{flex:0 0 auto;min-width:0}
[data-sherlock-market-native] .terminal-native-context{flex:0 1 auto;min-height:0;max-height:32%;overflow:auto;padding-top:6px;border-top:1px solid var(--research-completed-divider,#a3aeb955);font-size:11px;line-height:16px;white-space:pre-wrap;overflow-wrap:anywhere}
[data-sherlock-market-native] .terminal-native-context details{margin:0;padding:0;border:0;background:transparent}
[data-sherlock-market-native] .terminal-native-context summary{min-height:22px;padding:2px 0;cursor:pointer;list-style:disclosure-closed inside;font-family:inherit;font-size:11px;line-height:18px;color:var(--research-completed-muted,inherit)}
[data-sherlock-market-native] .terminal-native-context details[open]>summary{list-style:disclosure-open inside}
[data-sherlock-market-native] .terminal-native-context-lines{display:grid;gap:6px;padding-top:6px}
[data-sherlock-market-native] a{color:var(--research-completed-link,#1568ac);text-decoration:underline;text-underline-offset:2px}
body[data-ds-dark-theme] [data-sherlock-market-native] a{color:var(--research-completed-link,#8ac6ff)}
[data-sherlock-market-native] a:focus-visible,[data-sherlock-market-native] .terminal-native-context summary:focus-visible{outline:2px solid #0d99ff;outline-offset:-2px}

[data-sherlock-market-native] .terminal-native-filters{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;line-height:18px}
[data-sherlock-market-native] .terminal-native-filters input{box-sizing:border-box;min-width:60px;flex:1;height:24px;padding:2px 7px;border:1px solid #b8c7d2;border-radius:2px;background:#f3f6f8;color:inherit;font-family:inherit;font-size:12px;line-height:18px}
[data-sherlock-market-native] .terminal-native-filters span{white-space:nowrap}
[data-sherlock-market-native] .fund-native-table-wrap{flex:1 1 auto;min-height:0;max-height:none;overflow:auto}

[data-sherlock-market-native] .terminal-native-readout{flex:0 1 auto;min-height:0;max-height:18%;overflow:auto;margin-top:6px;font-size:11px;line-height:16px;overflow-wrap:anywhere}
[data-sherlock-market-native] tbody tr{cursor:pointer}
[data-sherlock-market-native] tbody tr:focus-visible{outline:1px solid #0d99ff;outline-offset:-1px}
[data-sherlock-market-native] tbody tr[aria-selected=true]{box-shadow:inset 2px 0 #0d99ff}
body[data-ds-dark-theme] [data-sherlock-market-native] .terminal-native-filters input{background:#19222c;border-color:#3c4b5c}
[data-sherlock-market-native="table"]{box-sizing:border-box;width:100%;height:100%;padding:8px 12px 6px;overflow:hidden;container-type:inline-size;background:rgba(255,255,255,.76);color:#202629;font:14px/20px "EWork Market DIN Regular",DINPro,"Noto Sans SC",sans-serif}
[data-sherlock-market-native="table"] .terminal-native-context{flex:0 0 auto;max-height:40%}
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
[data-sherlock-market-native="fund-holdings"]{box-sizing:border-box;width:100%;height:100%;padding:11px 12px 10px;overflow:hidden;background:#fafafa;color:#202629;font:10px/18px "EWork Market DIN Regular",DINPro,"Noto Sans SC",sans-serif}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters{display:grid;grid-template-columns:178fr 142fr 184fr;gap:8px;margin-bottom:18px}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters :is(span,input){box-sizing:border-box;display:flex;align-items:center;min-width:0;height:28px;padding:0 10px;border:.65px solid #d9d9d9;border-radius:6px;background:#fff;color:#333;font:10px/16px "Noto Sans SC",sans-serif}
[data-sherlock-market-native="fund-holdings"] .fund-native-filters input:focus-visible{outline:1px solid #333}
[data-sherlock-market-native="fund-holdings"] .fund-native-table-wrap{max-height:none;overflow:auto}
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
