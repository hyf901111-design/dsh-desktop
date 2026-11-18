// Serialized into the trusted research client with the other native widgets.
export function FinancialFuturesPanel({ report, initialProduct }) {
  const { jsx, jsxs } = react_jsx_runtime;
  const tabs = ['期限结构', '持仓分布', '合约明细', '品种排行'];
  const [chosen, setChosen] = react.useState(''), [tab, setTab] = react.useState(tabs[0]);
  const [showAll, setShowAll] = react.useState(false), [selectedContract, setSelectedContract] = react.useState('');
  const tabsId = react.useId(), selectedRow = react.useRef(null), panel = react.useRef(null), focusCurve = react.useRef(false);
  const requested = (chosen || initialProduct || '').trim().toLowerCase();
  const product = requested ? report.products.find(item => item.code === requested || item.name === requested) : report.products[0];
  const contracts = product?.contracts ?? [], unit = product?.unit ?? '';
  const format = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 3 }) : '—';
  const signed = value => (value > 0 ? '+' : '') + format(value);
  const percent = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  const selectProduct = code => { setChosen(code); setSelectedContract(''); };
  const leadContract = rows => rows.reduce((best, row) =>
    Number.isFinite(row.openInterest) && row.openInterest > 0 && (!best || row.openInterest > best.openInterest) ? row : best, null);

  react.useEffect(() => {
    if (tab === '期限结构' && focusCurve.current) {
      focusCurve.current = false;
      const target = panel.current?.querySelector('.ew-futures-curve') ?? panel.current?.querySelector('[aria-selected=true]');
      target?.focus({ preventScroll: true });
    }
    if (tab === '合约明细' && selectedRow.current) {
      selectedRow.current.focus({ preventScroll: true });
      selectedRow.current.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [tab, selectedContract]);

  const ranking = () => {
    const rows = [];
    for (const item of report.products) {
      const lead = leadContract(item.contracts);
      if (lead && Number.isFinite(lead.settlement) && Number.isFinite(lead.previousSettlement) && lead.previousSettlement > 0) {
        rows.push({ item, lead, change: (lead.settlement / lead.previousSettlement - 1) * 100 });
      }
    }
    if (!rows.length) return jsx('p', { role: 'status', children: '缺少可比较的持仓或昨结算价。' });
    rows.sort((a, b) => b.change - a.change);
    const gain = Math.max(0, rows[0].change), loss = Math.max(0, -rows.at(-1).change);
    const span = gain + loss, zero = span ? loss / span * 100 : 50;
    const limited = rows.length > 6 && !showAll;
    const shown = limited ? [...rows.slice(0, 3), ...rows.slice(-3)] : rows;
    const direction = value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    return jsxs('section', { className: 'ew-futures-ranking', style: { '--zero': zero + '%' }, children: [
      jsxs('div', { className: 'ew-futures-subheading', children: [
        jsx('strong', { children: '主力合约结算涨跌幅' }),
        rows.length > 6 && jsxs('div', { className: 'ew-futures-switch', role: 'group', 'aria-label': '排行范围', children: [
          jsx('button', { type: 'button', 'aria-pressed': !showAll, onClick: () => setShowAll(false), children: '首尾各三' }),
          jsx('button', { type: 'button', 'aria-pressed': showAll, onClick: () => setShowAll(true), children: '全部 ' + rows.length })
        ] })
      ] }),
      jsx('small', { className: 'ew-futures-basis', children: '各品种取持仓量最大的合约，与上一交易日结算价比较。' }),
      jsxs('div', { className: 'ew-futures-rank-scale', 'aria-hidden': true, children: [
        jsx('span', { children: '品种 / 合约' }),
        jsxs('span', { className: 'ew-futures-rank-axis', children: [
          loss > 0 && zero >= 16 && jsx('span', { 'data-axis': 'min', children: percent(-loss) }),
          jsx('span', { 'data-axis': 'zero', style: { left: zero + '%', transform: zero === 100 ? 'translateX(-100%)' : zero === 0 ? 'none' : 'translateX(-50%)' }, children: '0%' }),
          gain > 0 && zero <= 84 && jsx('span', { 'data-axis': 'max', children: percent(gain) })
        ] })
      ] }),
      jsx('ol', { className: 'ew-futures-rank', children: shown.map(({ item, lead, change }, i) => {
        const end = span ? (loss + change) / span * 100 : zero;
        const number = limited && i >= 3 ? rows.length - (shown.length - 1 - i) : i + 1;
        return jsx('li', { value: number, 'data-rank-break': limited && i === 3 || undefined, children:
          jsxs('button', { className: 'ew-futures-rank-row', type: 'button', onClick: () => { focusCurve.current = true; selectProduct(item.code); setSelectedContract(lead.code); setTab('期限结构'); },
            'aria-label': '第' + number + '名 ' + item.name + ' ' + lead.code + ' ' + percent(change) + '，查看期限结构',
            'data-direction': direction(change), style: { '--start': Math.min(zero, end) + '%', '--width': Math.abs(end - zero) + '%', '--end': end + '%' }, children: [
              jsxs('span', { className: 'ew-futures-rank-label', children: [
                jsx('small', { className: 'ew-futures-rank-number', children: number }), jsxs('span', { children: [jsx('b', { children: item.name }), jsx('small', { children: lead.code })] })
              ] }),
              jsxs('span', { className: 'ew-futures-rank-track', 'aria-hidden': true, children: [
                jsx('i', {}), jsx('b', { className: 'ew-futures-plot-value', children: percent(change) })
              ] }),
              jsx('b', { className: 'ew-futures-cell-value', 'aria-hidden': true, children: percent(change) })
            ] })
        }, item.code);
      }) })
    ] });
  };
  const table = () => jsx('div', { className: 'ew-futures-scroll', children: jsxs('table', { children: [
    jsx('thead', { children: jsx('tr', { children: ['合约', '结算价' + (unit ? '（' + unit + '）' : ''), '收盘价' + (unit ? '（' + unit + '）' : ''), '成交量（手）', '持仓量（手）']
      .map(label => jsx('th', { scope: 'col', children: label }, label)) }) }),
    jsx('tbody', { children: contracts.map(row => jsxs('tr', { ref: row.code === selectedContract ? selectedRow : undefined,
      tabIndex: row.code === selectedContract ? -1 : undefined, 'data-selected-contract': row.code === selectedContract || undefined, children: [
        jsx('th', { scope: 'row', children: row.code }), ...['settlement', 'close', 'volume', 'openInterest'].map(key => jsx('td', { children: format(row[key]) }, key))
      ] }, row.code)) })
  ] }) });
  const positions = () => {
    const rows = contracts.filter(row => Number.isFinite(row.openInterest) && row.openInterest >= 0).sort((a, b) => b.openInterest - a.openInterest);
    if (!rows.length) return jsx('p', { role: 'status', children: '交易日报未提供持仓量' });
    const max = rows[0].openInterest, total = rows.reduce((sum, row) => sum + row.openInterest, 0);
    return jsxs(react.Fragment, { children: [
      jsxs('div', { className: 'ew-futures-subheading', children: [jsx('strong', { children: '各合约持仓量' }),
        rows.length === contracts.length && total > 0 && jsx('small', { children: rows[0].code + ' 占 ' + (max / total * 100).toFixed(1) + '%' })] }),
      jsx('ol', { className: 'ew-futures-positions', children: rows.map(row => jsx('li', { children:
        jsxs('button', { type: 'button', 'aria-label': row.code + ' 持仓量 ' + format(row.openInterest) + ' 手，查看合约明细',
          onClick: () => { setSelectedContract(row.code); setTab('合约明细'); }, children: [
            jsx('b', { children: row.code }),
            jsx('span', { className: 'ew-futures-bar-track', 'aria-hidden': true, children: jsx('i', { style: { width: (max ? row.openInterest / max * 100 : 0) + '%' } }) }),
            jsx('span', { children: format(row.openInterest) + ' 手' })
          ] })
      }, row.code)) })
    ] });
  };
  const termStructure = () => {
    const first = contracts[0], last = contracts.at(-1), lead = leadContract(contracts);
    const settledCount = contracts.filter(row => Number.isFinite(row.settlement)).length;
    const spread = contracts.length > 1 && Number.isFinite(first.settlement) && Number.isFinite(last.settlement) ? last.settlement - first.settlement : null;
    const metric = (label, value) => jsxs('div', { children: [jsx('small', { children: label }), jsx('strong', { children: value })] });
    const index = contracts.findIndex(row => row.code === (selectedContract || lead?.code)), initial = index < 0 ? 0 : index;
    return jsxs(react.Fragment, { children: [
      jsxs('div', { className: 'ew-futures-metrics', children: [
        metric('近月结算' + (first ? ' · ' + first.code : ''), format(first?.settlement)),
        metric('远月减近月' + (unit ? '（' + unit + '）' : ''), spread === null ? '—' : signed(spread))
      ] }),
      settledCount < 2 ? jsx('p', { role: 'status', children: '同一交易日的有效结算价不足两个，合约明细可查看已公布数据。' }) :
        jsxs('div', { className: 'ew-futures-term', children: [
          jsxs('div', { className: 'ew-futures-axis-caption', children: [jsx('span', { children: '结算价' + (unit ? '（' + unit + '）' : '') }), jsx('span', { children: '交割月份' })] }),
          jsx(ResearchContainerChart, { embedded: true, initialPoint: initial, axisLabels: contracts.map(row => row.month.slice(0, 2) + '/' + row.month.slice(2)),
            xValues: contracts.map(row => Number(row.month.slice(0, 2)) * 12 + Number(row.month.slice(2))),
            spec: { variant: 'line', title: product.name + '交割月结算曲线', unit, labels: contracts.map(row => row.code), series: [{ name: '结算价', values: contracts.map(row => row.settlement) }] },
            describePoint: i => {
              const row = contracts[i];
              return jsxs(react.Fragment, { children: [jsx('strong', { children: row.code }), jsx('span', { children: '结算价 ' + format(row.settlement) + (Number.isFinite(row.settlement) && unit ? ' ' + unit : '') }),
                jsx('span', { children: '持仓 ' + format(row.openInterest) + (Number.isFinite(row.openInterest) ? ' 手' : '') })] });
            } }, product.code)
        ] })
    ] });
  };
  const changeTab = (event, index) => {
    const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation(); setTab(tabs[next]); event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return jsxs('div', { ref: panel, className: 'ew-futures-panel', onKeyDown: event => {
    const button = event.target.closest?.('button');
    if (!button || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); if (!event.repeat) button.click();
  }, children: [
    jsxs('div', { className: 'ew-futures-heading', children: [
      jsx('select', { 'aria-label': '选择期货品种', value: tab === '品种排行' ? '' : product?.code ?? '', onChange: event => {
        selectProduct(event.target.value); if (tab === '品种排行') setTab('期限结构');
      }, children: [
        ...(!product || tab === '品种排行' ? [jsx('option', { value: '', children: tab === '品种排行' ? '全部品种' : '选择日报覆盖的品种' }, 'empty')] : []),
        ...report.products.map(item => jsx('option', { value: item.code, children: item.name + ' · ' + item.code.toUpperCase() }, item.code))
      ] }),
      jsx('a', { href: report.url, onClick: financialOpenArticle, target: '_blank', rel: 'noopener noreferrer', title: '打开该交易日的交易所原始报告', children: '交易日报 ↗' })
    ] }),
    jsx('div', { role: 'tablist', 'aria-label': '期货行情栏目', className: 'ew-futures-tabs', children: tabs.map((name, i) =>
      jsx('button', { role: 'tab', type: 'button', id: tabsId + '-tab-' + i, 'aria-controls': tabsId + '-panel', 'aria-selected': tab === name,
        tabIndex: tab === name ? 0 : -1, onClick: () => setTab(name), onKeyDown: event => changeTab(event, i), children: name }, name)) }),
    jsx('div', { id: tabsId + '-panel', role: 'tabpanel', 'aria-labelledby': tabsId + '-tab-' + tabs.indexOf(tab), className: 'ew-futures-view',
      children: tab === '品种排行' ? ranking() : !product ? jsx('p', { role: 'status', children: '该交易日报没有所选品种，可切换查看其他在市合约。' }) :
        tab === '合约明细' ? table() : tab === '持仓分布' ? positions() : termStructure() })
  ] });
}
