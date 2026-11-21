// Compare the same named measure across two explicit periods. Balances and
// flows may share a unit, so neither a shared unit nor axis order is enough.
export function annualChartExceptions(spec) {
  const intent = [spec.title, spec.subtitle].filter(Boolean).join(' ');
  if (!['bar', 'groupedBar', 'horizontal', 'dumbbell'].includes(spec.variant) ||
      spec.series.length !== 2 || !/负转正|由负到正|转正|扭转|例外|净流出.*追踪|sign reversal|turnaround|exceptions?/iu.test(intent)) return;
  const periods = spec.series.map(series => {
    const matches = [...series.name.matchAll(/(?:19|20)\d{2}/gu)];
    if (matches.length !== 1) return;
    const year = matches[0][0];
    const measure = series.name.replace(year, '').replace(/年|\bFY\b|[\s()（）·:/_-]/giu, '').toLowerCase();
    return { year, measure, values: series.values };
  });
  if (periods.some(period => !period) || periods[0].year === periods[1].year || periods[0].measure !== periods[1].measure) return;
  periods.sort((a, b) => Number(a.year) - Number(b.year));
  const [prior, current] = periods;
  const onlyRecovered = /(?:仅|只)(?:列出|展示|显示|看|列)?[^，。；;]{0,10}(?:负转正|转正|扭转)/u.test(intent);
  const rows = spec.labels.flatMap((label, index) => {
    const before = prior.values[index], after = current.values[index];
    if (!Number.isFinite(before) || before >= 0 || onlyRecovered && !(after > 0)) return [];
    return [{ label, before, after }];
  });
  return rows.length ? { prior: prior.year, current: current.year, rows } : undefined;
}

export function chartExceptionLedger(spec, escape) {
  const report = annualChartExceptions(spec);
  if (!report) return '';
  const fmt = value => value === null ? '未提供' : value.toLocaleString('en-US', { signDisplay: 'exceptZero', maximumSignificantDigits: 21 });
  const value = (year, number) => `<span><small>${year}</small><strong>${fmt(number)}</strong></span>`;
  const unit = spec.unit ? '（' + escape(spec.unit) + '）' : '';
  return `<section class="chart-exceptions" aria-label="上期负值分类"><header>上期为负的分类${unit}</header><ul>${report.rows.map(row =>
    `<li><b>${escape(row.label)}</b>${value(report.prior, row.before)}<i aria-hidden="true">→</i>${value(report.current, row.after)}</li>`).join('')}</ul></section>`;
}

export const CHART_READING_LAYOUT_CSS = `
.chart-exceptions{grid-column:1/-1;min-width:0;margin:0 0 6px;border-bottom:1px solid var(--sherlock-border);padding-bottom:6px}
.chart-exceptions header{margin:0 0 4px;font-weight:600;color:var(--sherlock-muted);font-size:11px}
.chart-exceptions ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:4px 20px;padding:0;margin:0;list-style:none;max-height:135px;overflow:auto}
.chart-exceptions li{display:grid;grid-template-columns:minmax(48px,1fr) auto auto auto;gap:7px;align-items:center;padding:4px 0}
.chart-exceptions li b{font-weight:600;overflow-wrap:anywhere}.chart-exceptions li span{display:grid;line-height:1.25;text-align:right}
.chart-exceptions li small,.chart-exceptions li i{font-size:10px;color:var(--sherlock-muted);font-style:normal}
.chart-exceptions strong{font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
svg .chart-zero{stroke:var(--sherlock-muted);stroke-width:1.25}svg .observation-label{fill:var(--sherlock-text);font-weight:600;paint-order:stroke;stroke:var(--sherlock-surface);stroke-width:3px;stroke-linejoin:round}
`;
