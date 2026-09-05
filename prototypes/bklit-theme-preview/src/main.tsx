import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip,
  BarChart, Bar, BarXAxis } from './vendor/bklit';
import { sampleData, percent, type SamplePoint } from './data';
import './style.css';

type Mode = 'compare' | 'dark' | 'light';
type Kind = 'area' | 'bar';

function Icon({ name }: { name: 'sun' | 'moon' | 'split' | 'area' | 'bar' | 'replay' }) {
  const paths = {
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />,
    split: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 4v16" /></>,
    area: <><path d="M3 18V6m0 12h18M5 15l4-6 4 3 6-8" /></>,
    bar: <><path d="M4 18V12m8 6V6m8 12V3" strokeWidth="3" /></>,
    replay: <><path d="M3 5v5h5M3.7 10A8 8 0 1 1 5 18" /></>,
  };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function SampleTooltip({ point }: { point: Record<string, unknown> }) {
  const date = point.date as Date;
  return <div className="sample-tooltip">
    <p>{date.getMonth() + 1} 月 {date.getDate()} 日</p>
    <div><span><i className="legend-dot primary" />研究组合</span><strong>{percent(Number(point.strategy))}</strong></div>
    <div><span><i className="legend-dot secondary" />参考组合</span><strong>{percent(Number(point.benchmark))}</strong></div>
  </div>;
}

function Chart({ data, kind, replay }: { data: SamplePoint[]; kind: Kind; replay: number }) {
  const tooltip = <ChartTooltip showDatePill={false} dotVariant="ring" dotSize={4}
    indicatorDasharray="3,4" content={({ point }) => <SampleTooltip point={point} />} />;

  if (kind === 'bar') return <BarChart data={data} xDataKey="name" aspectRatio="1.65 / 1"
    margin={{ top: 16, right: 18, bottom: 36, left: 40 }} barGap={0.25} revealSignature={String(replay)}>
    <Grid numTicksRows={4} strokeDasharray="3,5" />
    <Bar dataKey="strategy" fill="var(--chart-line-primary)" lineCap={2} groupGap={2} />
    <Bar dataKey="benchmark" fill="var(--chart-line-secondary)" lineCap={2} groupGap={2} />
    <BarXAxis maxLabels={5} />
    <YAxis numTicks={4} formatValue={value => `${value}%`} />
    {tooltip}
  </BarChart>;

  return <AreaChart data={data} style={{ height: '100%' }} aspectRatio="auto"
    margin={{ top: 16, right: 18, bottom: 36, left: 40 }} revealSignature={String(replay)}>
    <Grid numTicksRows={4} strokeDasharray="3,5" />
    <Area dataKey="benchmark" fill="var(--chart-line-secondary)" fillOpacity={0.13} strokeWidth={1.5} />
    <Area dataKey="strategy" fill="var(--chart-line-primary)" fillOpacity={0.26} strokeWidth={2.2} fadeEdges="left" />
    <XAxis numTicks={5} />
    <YAxis numTicks={4} formatValue={value => `${value}%`} />
    {tooltip}
  </AreaChart>;
}

function ThemePanel({ theme, kind, data, replay, showData }: {
  theme: 'dark' | 'light'; kind: Kind; data: SamplePoint[]; replay: number; showData: boolean;
}) {
  const last = data.at(-1)!;
  return <section className={`theme-panel ${theme}`} aria-label={`${theme === 'dark' ? '深色' : '浅色'}主题样板`}>
    <div className="panel-label"><span><Icon name={theme === 'dark' ? 'moon' : 'sun'} />{theme === 'dark' ? '深色主题' : '浅色主题'}</span><span>01 — 研究组件</span></div>
    <article className="research-card">
      <header className="card-heading"><div><span className="eyebrow">PORTFOLIO PERFORMANCE</span><h2>组合收益走势</h2></div><span className="demo-badge">演示</span></header>
      <div className="metric-row"><div><p className="metric-label">累计收益率</p><p className="headline-value">{percent(last.strategy)}</p></div><span className="metric-note">4 月 {data[0].date.getDate()} 日 — 30 日</span></div>
      <div className="chart-legend"><span><i className="legend-dot primary" />研究组合</span><span><i className="legend-dot secondary" />参考组合</span></div>
      <div className={`chart-frame ${kind}`} role="img" aria-label={`两组演示累计收益率，${data.length} 天；期末研究组合 12.84%，参考组合 5.16%`}>
        <Chart data={data} kind={kind} replay={replay} />
      </div>
      <dl className="summary-row"><div><dt>参考组合</dt><dd>{percent(last.benchmark)}</dd></div><div><dt>收益差</dt><dd className="accent-value">+{(last.strategy - last.benchmark).toFixed(2)}<small> 个百分点</small></dd></div><div><dt>观察样本</dt><dd>{data.length}<small> 天</small></dd></div></dl>
      <footer className="card-footer"><span className="status-dot" />主题切换保留数据与所选区间</footer>
    </article>
    {showData && <div className="data-table-wrap"><table><caption>图表数据 · 累计收益率（%）</caption><thead><tr><th>日期</th><th>研究组合</th><th>参考组合</th></tr></thead><tbody>{data.map(point => <tr key={point.name}><td>{point.name}</td><td>{point.strategy.toFixed(2)}</td><td>{point.benchmark.toFixed(2)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function App() {
  const [mode, setMode] = useState<Mode>('compare');
  const [kind, setKind] = useState<Kind>('area');
  const [days, setDays] = useState(30);
  const [replay, setReplay] = useState(0);
  const [showData, setShowData] = useState(false);
  const data = sampleData.slice(-days);
  return <MotionConfig reducedMotion="user"><main className={`preview-shell mode-${mode}`}>
    <header className="page-header"><div className="page-identity"><span className="brand-mark" aria-hidden="true">S</span><span>SHERLOCK</span><span className="header-divider" /><span className="header-context">组件风格预览</span></div><a href="https://bklit.com/charts/area-chart" target="_blank" rel="noreferrer">Bklit UI <span aria-hidden="true">↗</span></a></header>
    <section className="intro"><div><div className="intro-kicker">STYLE 01 / BKLIT</div><h1>数据有层次，界面更轻。</h1><p>同一组数据，深浅两种呈现。移动到图表上，试试交互。</p></div><div className="mode-switch segmented" role="group" aria-label="主题预览方式">
      {([['compare', 'split', '对照'], ['dark', 'moon', '深色'], ['light', 'sun', '浅色']] as const).map(([value, icon, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon name={icon} />{label}</button>)}
    </div></section>
    <div className="preview-toolbar"><div className="segmented" role="group" aria-label="图表类型">{([['area', 'area', '面积图'], ['bar', 'bar', '柱状图']] as const).map(([value, icon, label]) => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}><Icon name={icon} />{label}</button>)}</div><div className="toolbar-actions"><label className="range-select">时间范围<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={30}>全部 30 天</option><option value={14}>后 14 天</option><option value={7}>后 7 天</option></select></label><button className="replay-button" aria-label="重播动画" onClick={() => setReplay(value => value + 1)}><Icon name="replay" /><span>重播动画</span></button></div></div>
    <div className="preview-grid">
      {mode !== 'light' && <ThemePanel theme="dark" kind={kind} data={data} replay={replay} showData={showData} />}
      {mode !== 'dark' && <ThemePanel theme="light" kind={kind} data={data} replay={replay} showData={showData} />}
    </div>
    <footer className="page-footer"><p>示意数据，不代表真实市场或回测结果。</p><button aria-expanded={showData} onClick={() => setShowData(value => !value)}>{showData ? '收起' : '查看'}数据 <span aria-hidden="true">{showData ? '−' : '+'}</span></button><a href="https://github.com/bklit/bklit-ui" target="_blank" rel="noreferrer">Bklit 开源图表 · MIT ↗</a></footer>
  </main></MotionConfig>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
