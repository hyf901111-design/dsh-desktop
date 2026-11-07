// These functions are stringified into the installed conversation renderer.
// Keep their dependencies limited to globals already present in that bundle.
export function ResearchInteractiveTable({ spec }) {
  const [query, setQuery] = react.useState('');
  const [sort, setSort] = react.useState({ column: -1, descending: false });
  const numericColumns = spec.columns.map((_, index) => researchTableNumericColumn(spec, index));
  const normalized = query.trim().toLocaleLowerCase();
  const rows = spec.rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    !normalized || row.some(cell => String(cell ?? '').toLocaleLowerCase().includes(normalized)));
  if (sort.column >= 0) rows.sort((left, right) => {
    const a = left.row[sort.column], b = right.row[sort.column];
    const numeric = value => {
      if (typeof value === 'number') return value;
      const text = String(value ?? '').trim();
      const unit = text.includes('亿') ? 1e8 : text.includes('万') ? 1e4 : 1;
      return Number(text.replace(/[\s,%‰亿万元点倍]/g, '').replace(/[−]/g, '-')) * unit;
    };
    const compared = numericColumns[sort.column] && Number.isFinite(numeric(a)) && Number.isFinite(numeric(b))
      ? numeric(a) - numeric(b)
      : String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN', { numeric: true });
    return (sort.descending ? -1 : 1) * compared || left.index - right.index;
  });
  return react_jsx_runtime.jsxs('div', { className: 'rScV5Q_containerTableScroll odyssey-native-table',
    'data-research-preview-interactive': '', onPointerDown: event => event.stopPropagation(),
    children: [
      react_jsx_runtime.jsxs('div', { className: 'odyssey-native-table-controls', children: [
        react_jsx_runtime.jsx('input', { type: 'search', value: query, placeholder: '搜索表格',
          'aria-label': '搜索表格', onInput: event => setQuery(event.currentTarget.value) }),
        react_jsx_runtime.jsx('span', { role: 'status', 'aria-live': 'polite', children: rows.length + ' / ' + spec.rows.length + ' 行' })
      ] }),
      react_jsx_runtime.jsx('div', { className: 'odyssey-native-table-grid', children:
        react_jsx_runtime.jsxs('table', { 'data-research-container-table': '', children: [
          react_jsx_runtime.jsx('thead', { children: react_jsx_runtime.jsx('tr', { children: spec.columns.map((column, index) =>
            react_jsx_runtime.jsx('th', { 'data-numeric': numericColumns[index] ? 'true' : void 0,
              'aria-sort': sort.column === index ? sort.descending ? 'descending' : 'ascending' : 'none',
              children: react_jsx_runtime.jsx('button', { type: 'button',
                onClick: () => setSort(previous => ({ column: index,
                  descending: previous.column === index && !previous.descending })),
                'aria-label': '按' + column + '排序', children: column }) }, index)) }) }),
          react_jsx_runtime.jsx('tbody', { children: rows.map(({ row, index }) =>
            react_jsx_runtime.jsx('tr', { children: row.map((cell, cellIndex) =>
              react_jsx_runtime.jsx('td', { 'data-numeric': numericColumns[cellIndex] ? 'true' : void 0,
                children: react_jsx_runtime.jsx(ResearchTableCell, { cell }) }, cellIndex)) }, index)) })
        ] }) }),
      !rows.length ? react_jsx_runtime.jsx('p', { className: 'odyssey-native-empty', children: '没有匹配的数据' }) : null
    ] });
}

export function ResearchContainerChart({ spec }) {
  const svgRef = react.useRef(null);
  const [plotSize, setPlotSize] = react.useState({ width: 640, height: 290 });
  const [hidden, setHidden] = react.useState([]);
  const [selected, setSelected] = react.useState({ series: 0, point: 0 });
  const seriesIdentity = JSON.stringify(spec.series.map(series => series.name));
  react.useEffect(() => { setHidden([]); setSelected({ series: 0, point: 0 }); }, [spec.variant, seriesIdentity]);
  react.useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      if (svg.clientWidth > 0 && svg.clientHeight > 0)
        setPlotSize(previous => previous.width === svg.clientWidth && previous.height === svg.clientHeight
          ? previous : { width: svg.clientWidth, height: svg.clientHeight });
    };
    measure();
    const Observer = svg.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const visible = spec.series.map((_, index) => !hidden.includes(index));
  const values = spec.series.flatMap((series, index) => visible[index] ? series.values.filter(Number.isFinite) : []);
  const minimum = Math.min(0, ...values), maximum = Math.max(0, ...values), range = maximum - minimum || 1;
  const left = 54, top = 18, width = Math.max(100, plotSize.width - left - 18);
  const height = Math.max(40, plotSize.height - top - 30);
  const y = value => top + (maximum - value) / range * height;
  const baseline = y(0), step = width / Math.max(1, spec.labels.length);
  const currentSeries = visible[selected.series] ? selected.series : visible.findIndex(Boolean);
  const point = Math.min(selected.point, Math.max(0, spec.labels.length - 1));
  const current = currentSeries < 0 ? null : spec.series[currentSeries];
  const readout = current ? spec.labels[point] + ' · ' + current.name + ' ' + String(current.values[point] ?? '—') : '选择图例查看数据';
  const select = (series, index) => setSelected({ series, point: index });
  const navigate = event => {
    if (!event.target.closest?.('svg')) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const active = currentSeries < 0 ? 0 : currentSeries;
    const available = visible.map((shown, index) => shown ? index : -1).filter(index => index >= 0);
    if (!available.length) return;
    if (event.key === 'Home') select(active, 0);
    else if (event.key === 'End') select(active, spec.labels.length - 1);
    else if (event.key === 'ArrowLeft') select(active, Math.max(0, point - 1));
    else if (event.key === 'ArrowRight') select(active, Math.min(spec.labels.length - 1, point + 1));
    else select(available[(available.indexOf(active) + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length], point);
  };
  return react_jsx_runtime.jsxs('div', { className: 'rScV5Q_containerChart odyssey-native-chart',
    'data-research-container-chart': spec.variant, 'data-research-preview-interactive': '',
    onPointerDown: event => event.stopPropagation(), onKeyDown: navigate, children: [
      react_jsx_runtime.jsxs('svg', { ref: svgRef, viewBox: '0 0 ' + plotSize.width + ' ' + plotSize.height,
        role: 'group', 'aria-label': spec.title, children: [
          Array.from({ length: 5 }, (_, index) => {
            const lineY = top + index * height / 4;
            const value=maximum-index*range/4;
            return react_jsx_runtime.jsxs('g', { children:[
              react_jsx_runtime.jsx('line', { x1:left,x2:left+width,y1:lineY,y2:lineY,className:'rScV5Q_chartGrid' }),
              react_jsx_runtime.jsx('text', { x:left-8,y:lineY+4,textAnchor:'end',className:'rScV5Q_chartLabel',children:Math.abs(value)>=1000?Math.round(value).toLocaleString('en-US'):Number(value.toFixed(range<10?2:1)).toString() })
            ]},'grid-'+index);
          }),
          react_jsx_runtime.jsx('line', { x1: left, x2: left + width, y1: baseline, y2: baseline,
            className: 'rScV5Q_chartAxis' }),
          spec.variant === 'bar' ? spec.series.flatMap((series, seriesIndex) => visible[seriesIndex]
            ? series.values.map((value, index) => {
              const groupWidth = Math.max(4, step * .7);
              const barWidth = Math.max(3, groupWidth / spec.series.length - 3);
              const valueY = y(value);
              return react_jsx_runtime.jsx('rect', {
                x: left + index * step + (step - groupWidth) / 2 + seriesIndex * (groupWidth / spec.series.length),
                y: Math.min(baseline, valueY), width: barWidth, height: Math.max(1, Math.abs(baseline - valueY)),
                fill: RESEARCH_CONTAINER_CHART_COLORS[seriesIndex % RESEARCH_CONTAINER_CHART_COLORS.length],
                role: 'button', tabIndex: 0, 'aria-label': spec.labels[index] + ' · ' + series.name + ' ' + value,
                'aria-pressed': currentSeries === seriesIndex && point === index,
                onClick: () => select(seriesIndex, index), onKeyDown: event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(seriesIndex, index); }
                }, 'data-selected': currentSeries === seriesIndex && point === index ? 'true' : void 0
              }, seriesIndex + '-' + index);
            }) : [])
            : spec.series.flatMap((series, seriesIndex) => {
              if (!visible[seriesIndex]) return [];
              const color = RESEARCH_CONTAINER_CHART_COLORS[seriesIndex % RESEARCH_CONTAINER_CHART_COLORS.length];
              const points = series.values.map((value, index) => Number.isFinite(value)
                ? (left + (index + .5) * step) + ',' + y(value) : '').join(' ');
              return [react_jsx_runtime.jsx('polyline', { points, fill: 'none', stroke: color,
                strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }, 'line-' + seriesIndex),
              ...series.values.map((value, index) => Number.isFinite(value) ? react_jsx_runtime.jsx('circle', {
                cx: left + (index + .5) * step, cy: y(value), r: currentSeries === seriesIndex && point === index ? 5 : 4,
                fill: color, stroke: 'var(--odyssey-content)', strokeWidth: 1,
                role: 'button', tabIndex: 0, 'aria-label': spec.labels[index] + ' · ' + series.name + ' ' + value,
                'aria-pressed': currentSeries === seriesIndex && point === index,
                'data-selected': currentSeries === seriesIndex && point === index ? 'true' : void 0,
                onClick: () => select(seriesIndex, index), onKeyDown: event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(seriesIndex, index); }
                }
              }, 'point-' + seriesIndex + '-' + index) : null)];
            }),
          spec.labels.map((label, index) => (index === 0 || index === spec.labels.length - 1 || index % Math.max(1, Math.ceil(spec.labels.length / Math.max(2, Math.floor(width / 70)))) === 0) ? react_jsx_runtime.jsx('text', {
            x: left + (index + .5) * step, y: top + height + 22, textAnchor: 'middle',
            className: 'rScV5Q_chartLabel', children: label }, 'label-' + index) : null)
        ] }),
      react_jsx_runtime.jsx('div', { className: 'rScV5Q_chartLegend', children: spec.series.map((series, index) =>
        react_jsx_runtime.jsxs('button', { type: 'button', 'aria-pressed': visible[index],
          onClick: () => setHidden(previous => previous.includes(index)
            ? previous.filter(item => item !== index) : [...previous, index]),
          children: [react_jsx_runtime.jsx('i', { style: {
            background: RESEARCH_CONTAINER_CHART_COLORS[index % RESEARCH_CONTAINER_CHART_COLORS.length] } }), series.name]
        }, index)) }),
      react_jsx_runtime.jsx('div', { className: 'odyssey-native-chart-readout', role: 'status',
        'aria-live': 'polite', children: readout }),
      react_jsx_runtime.jsxs('details', { className: 'odyssey-native-chart-data', children: [
        react_jsx_runtime.jsx('summary', { children: '查看完整数据' }),
        react_jsx_runtime.jsx('div', { children: react_jsx_runtime.jsxs('table', { children: [
          react_jsx_runtime.jsx('thead', { children: react_jsx_runtime.jsx('tr', { children: [
            react_jsx_runtime.jsx('th', { children: '分类' }, 'label'),
            ...spec.series.map((series, index) => react_jsx_runtime.jsx('th', { children: series.name }, index))] }) }),
          react_jsx_runtime.jsx('tbody', { children: spec.labels.map((label, index) =>
            react_jsx_runtime.jsx('tr', { children: [react_jsx_runtime.jsx('td', { children: label }, 'label'),
              ...spec.series.map((series, seriesIndex) => react_jsx_runtime.jsx('td', {
                children: String(series.values[index] ?? '—') }, seriesIndex))] }, index)) })
        ] }) })
      ] })
    ] });
}
