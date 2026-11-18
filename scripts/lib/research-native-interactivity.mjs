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

// Shared by ordinary chart cards and views that supply their own surrounding
// controls, such as the exchange term structure. X positions may be irregular.
export function ResearchContainerChart({ spec, axisLabels = spec.labels, xValues, initialPoint, embedded, describePoint }) {
  const { jsx, jsxs } = react_jsx_runtime;
  const svgRef = react.useRef(null);
  const [plotSize, setPlotSize] = react.useState({ width: 620, height: 196 });
  const [hidden, setHidden] = react.useState([]);
  const [selected, setSelected] = react.useState(null);
  const seriesKey = JSON.stringify(spec.series.map(series => series.name));
  react.useEffect(() => { setHidden([]); setSelected(null); }, [spec.variant, seriesKey]);
  react.useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // A board zoom transforms the entire card. Use layout pixels here and
    // screen pixels only when converting pointer coordinates below.
    const measure = () => {
      const width = svg.clientWidth, height = svg.clientHeight;
      if (width > 0 && height > 0) setPlotSize(previous =>
        previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const Observer = svg.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const bars = spec.variant === 'bar', length = spec.labels.length;
  const visible = spec.series.map((_, i) => i).filter(i => !hidden.includes(i));
  const values = spec.series.flatMap(series => series.values.filter(Number.isFinite));
  const rawMin = values.length ? Math.min(...values) : 0, rawMax = values.length ? Math.max(...values) : 0;
  let low = bars ? Math.min(0, rawMin) : rawMin, high = bars ? Math.max(0, rawMax) : rawMax;
  if (high === low) {
    const pad = Math.abs(high) * .01 || 1;
    if (!bars) low -= pad;
    high += pad;
  }
  const step = (high - low) / 4, magnitude = 10 ** Math.floor(Math.log10(step));
  const interval = ([1, 2, 2.5, 5, 10].find(i => i * magnitude >= step) || 10) * magnitude;
  const ticks = [];
  if (Number.isFinite(interval) && interval > 0) {
    const first = Math.floor(low / interval + 1e-9), last = Math.ceil(high / interval - 1e-9);
    if (last > first && last - first <= 8 && Number.isSafeInteger(first) && Number.isSafeInteger(last)) {
      low = Math.min(low, first * interval); high = Math.max(high, last * interval);
      for (let i = first; i <= last; i++) ticks.push(Number((i * interval).toPrecision(13)));
    }
  }
  if (!ticks.length) ticks.push(rawMax === rawMin ? rawMax : rawMin, ...(rawMax === rawMin ? [] : [rawMax]));
  const format = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumSignificantDigits: 17 }) : '—';
  const formatTick = value => Math.abs(value) >= 1e9 || value !== 0 && Math.abs(value) < 1e-4 ? value.toExponential(2) : format(value);
  const textWidth = label => [...String(label)].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 11.5 : 6.4), 0);
  const left = Math.min(plotSize.width * .32, Math.max(32, ...ticks.map(value => textWidth(formatTick(value)) + 10)));
  const right = Math.max(left + 1, plotSize.width - 10), top = 16, bottom = Math.max(top + 1, plotSize.height - 27);
  const scale = Math.max(Math.abs(low), Math.abs(high)) || 1;
  const y = value => {
    if (!Number.isFinite(scale)) return (top + bottom) / 2;
    const delta = high / scale - low / scale;
    return delta ? bottom - ((value / scale - low / scale) / delta) * (bottom - top) : (top + bottom) / 2;
  };
  const band = (right - left) / Math.max(1, length), firstX = xValues?.[0], lastX = xValues?.[length - 1];
  const x = i => {
    if (bars) return left + (i + .5) * band;
    if (length === 1) return (left + right) / 2;
    const fraction = xValues && lastX > firstX ? (xValues[i] - firstX) / (lastX - firstX) : i / (length - 1);
    return left + (right - left) * fraction;
  };
  const seriesIndex = selected && visible.includes(selected.series) ? selected.series : visible[0];
  const point = Math.max(0, Math.min(length - 1, selected?.point ?? initialPoint ?? (bars ? 0 : length - 1)));
  const active = spec.series[seriesIndex];
  const unit = spec.unit ? ' ' + spec.unit : '';
  const seriesLabel = s => {
    const name = spec.series[s].name, suffix = name.match(/\s*[（(]([^（）()]+)[）)]\s*$/u);
    return spec.unit && suffix?.[1].trim() === spec.unit.trim() ? name.slice(0, suffix.index).trimEnd() : name;
  };
  const describe = (s, i) => spec.labels[i] + ' · ' + seriesLabel(s) + ' ' + format(spec.series[s].values[i]) + unit;
  const readout = active ? (describePoint ? describePoint(point) : describe(seriesIndex, point)) : '选择图例查看数据';
  const choose = (s, i) => setSelected(previous => previous?.series === s && previous.point === i ? previous : { series: s, point: i });
  const navigate = event => {
    if (!visible.length) return;
    const key = event.key, offset = visible.indexOf(seriesIndex);
    if (key === 'Home') choose(seriesIndex, 0);
    else if (key === 'End') choose(seriesIndex, length - 1);
    else if (key === 'ArrowLeft' || key === 'ArrowRight') choose(seriesIndex, Math.min(length - 1, Math.max(0, point + (key === 'ArrowLeft' ? -1 : 1))));
    else if (key === 'ArrowUp' || key === 'ArrowDown') choose(visible[(offset + (key === 'ArrowUp' ? -1 : 1) + visible.length) % visible.length], point);
    else return;
    event.preventDefault(); event.stopPropagation();
  };
  const inspect = event => {
    if (!visible.length) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const px = (event.clientX - box.left) * plotSize.width / box.width, py = (event.clientY - box.top) * plotSize.height / box.height;
    if (px < left - 6 || px > right + 6 || py < top - 7 || py > bottom + 7) return;
    let nearest = 0;
    for (let i = 1; i < length; i++) if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    const candidates = visible.filter(s => Number.isFinite(spec.series[s].values[nearest]));
    const nearestSeries = candidates.reduce((best, s) => Math.abs(y(spec.series[s].values[nearest]) - py) < Math.abs(y(spec.series[best].values[nearest]) - py) ? s : best, candidates[0]);
    choose(nearestSeries ?? seriesIndex, nearest);
  };
  const color = s => embedded ? 'var(--fw-ma-1)' : RESEARCH_CONTAINER_CHART_COLORS[s % RESEARCH_CONTAINER_CHART_COLORS.length];
  const labels = axisLabels.map(label => {
    const limit = Math.max(24, (right - left) * .46);
    if (textWidth(label) <= limit) return label;
    let short = '', used = 0;
    for (const char of label) {
      used += textWidth(char);
      if (used + 12 > limit) break;
      short += char;
    }
    return short + '…';
  });
  const bounds = (i, align) => {
    const width = textWidth(labels[i]);
    const start = align === 'start' ? x(i) : align === 'end' ? x(i) - width : x(i) - width / 2;
    return [start, start + width];
  };
  // Reserve both endpoints first, then fit a few evenly distributed labels
  // between them using their actual positions (months may be several apart).
  const indices = [0], last = length - 1;
  let end = bounds(0, 'start')[1];
  const lastStart = bounds(last, 'end')[0];
  const labelCount = Math.max(2, Math.min(length, Math.floor((right - left) / (Math.max(...labels.map(textWidth)) + 18)) + 1));
  for (let j = 1; j < labelCount - 1; j++) {
    const i = Math.round(j * last / (labelCount - 1)), [start, finish] = bounds(i, 'middle');
    if (start >= end + 10 && finish <= lastStart - 10) { indices.push(i); end = finish; }
  }
  if (last > 0 && lastStart >= bounds(0, 'start')[1] + 4) indices.push(last);
  const markProps = (s, i) => ({
    'data-chart-point': i, 'data-selected': seriesIndex === s && point === i ? 'true' : undefined,
    role: 'button', tabIndex: -1, 'aria-label': describe(s, i), 'aria-pressed': seriesIndex === s && point === i,
    onClick: event => { event.stopPropagation(); choose(s, i); svgRef.current?.focus({ preventScroll: true }); }
  });
  const marks = visible.flatMap((s, order) => {
    const values = spec.series[s].values;
    if (bars) {
      const barWidth = band * .72 / visible.length;
      return values.flatMap((value, i) => {
        if (!Number.isFinite(value)) return [];
        const center = x(i) - band * .36 + barWidth * (order + .5);
        const bar = jsx('rect', { ...markProps(s, i), x: center - barWidth * .45, y: Math.min(y(0), y(value)),
          width: barWidth * .9, height: Math.abs(y(0) - y(value)), fill: color(s) }, 'bar-' + s + '-' + i);
        if (barWidth < textWidth(format(value)) + 8 || length * visible.length > 18) return [bar];
        return [bar, jsx('text', { x: center, y: value < 0 ? Math.min(bottom + 11, y(value) + 12) : Math.max(11, y(value) - 4),
          textAnchor: 'middle', className: 'rScV5Q_chartLabel', pointerEvents: 'none', children: format(value) }, 'value-' + s + '-' + i)];
      });
    }
    let path = '';
    const dots = [];
    for (let i = 0; i < length; i++) {
      if (!Number.isFinite(values[i])) continue;
      path += (i && Number.isFinite(values[i - 1]) ? 'L' : 'M') + x(i) + ',' + y(values[i]) + ' ';
      const focused = seriesIndex === s && point === i;
      const isolated = !Number.isFinite(values[i - 1]) && !Number.isFinite(values[i + 1]);
      const radius = focused ? 4.5 : length <= 30 || isolated ? 2.7 : 0;
      if (radius) dots.push(jsx('circle', { ...markProps(s, i), cx: x(i), cy: y(values[i]), r: radius,
        fill: color(s), stroke: embedded ? 'var(--fw-card)' : 'var(--sherlock-surface)', strokeWidth: 1.5 }, 'point-' + s + '-' + i));
    }
    return [jsx('path', { d: path.trim(), fill: 'none', stroke: color(s), strokeWidth: 2.3, strokeLinejoin: 'round', strokeLinecap: 'round' }, 'line-' + s), ...dots];
  });
  const svg = jsxs('svg', { ref: svgRef, className: embedded ? 'ew-futures-curve' : undefined,
    viewBox: '0 0 ' + plotSize.width + ' ' + plotSize.height, role: 'group', tabIndex: 0,
    'aria-label': spec.title + (unit ? '（' + spec.unit + '）' : '') + '，左右方向键查看相邻数据',
    onKeyDown: navigate, onPointerMove: inspect, onClick: inspect, children: [
      ...ticks.map(value => jsxs('g', { children: [
        jsx('line', { x1: left, x2: right, y1: y(value), y2: y(value), className: value === 0 ? 'rScV5Q_chartAxis' : 'rScV5Q_chartGrid', style: value === 0 ? { strokeWidth: 1.4 } : undefined, 'data-chart-zero': value === 0 || undefined }),
        jsx('text', { x: left - 6, y: y(value) + 4, textAnchor: 'end', className: 'rScV5Q_chartLabel', children: formatTick(value) })
      ] }, 'grid-' + value)),
      active && jsx('line', { x1: x(point), x2: x(point), y1: top, y2: bottom, 'data-chart-cursor': '', stroke: embedded ? 'var(--fw-muted)' : 'var(--sherlock-muted)', opacity: .6, strokeDasharray: '3 3' }),
      ...marks,
      ...indices.map(i => jsx('text', { x: x(i), y: plotSize.height - 7, textAnchor: length === 1 ? 'middle' : i === 0 ? 'start' : i === last ? 'end' : 'middle',
        'data-chart-x-label': i, 'aria-label': axisLabels[i], className: 'rScV5Q_chartLabel', children: labels[i] }, 'label-' + i))
    ] });
  const valueReadout = jsx('div', { className: embedded ? 'ew-futures-readout' : 'odyssey-native-chart-readout', role: 'status', 'aria-live': 'polite', children: readout });
  if (embedded) return jsxs(react.Fragment, { children: [svg, valueReadout] });
  return jsxs('div', { className: 'rScV5Q_containerChart odyssey-native-chart', 'data-research-container-chart': spec.variant,
    'data-research-preview-interactive': '', onPointerDown: event => event.stopPropagation(), children: [
      svg,
      jsx('div', { className: 'rScV5Q_chartLegend', children: spec.series.map((series, i) => jsxs('button', {
        type: 'button', 'aria-pressed': visible.includes(i), onClick: () => setHidden(previous => previous.includes(i) ? previous.filter(s => s !== i) : [...previous, i]),
        children: [jsx('i', { style: { background: color(i) } }), series.name] }, i)) }),
      valueReadout,
      jsxs('details', { className: 'odyssey-native-chart-data', children: [
        jsx('summary', { children: '查看完整数据' }),
        jsx('div', { children: jsxs('table', { children: [
          jsx('thead', { children: jsxs('tr', { children: [jsx('th', { children: '分类' }, 'label'), ...spec.series.map((series, i) =>
            jsx('th', { children: seriesLabel(i) + (spec.unit ? '（' + spec.unit + '）' : '') }, i))] }) }),
          jsx('tbody', { children: spec.labels.map((label, i) => jsxs('tr', { children: [jsx('td', { children: label }, 'label'),
            ...spec.series.map((series, j) => jsx('td', { children: String(series.values[i] ?? '—') }, j))] }, i)) })
        ] }) })
      ] })
    ] });
}

// Both serializers can be run separately against a previously installed client.
export function installResearchContainerChart(source) {
  const start = source.indexOf('function ResearchContainerChart('), end = source.indexOf('function readResearchComponentTheme(', start);
  if (start < 0 || end < start) throw Error('Research chart renderer boundary missing');
  return source.slice(0, start) + ResearchContainerChart.toString() + '\n' + source.slice(end);
}
