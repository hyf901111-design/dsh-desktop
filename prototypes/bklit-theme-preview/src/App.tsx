import { useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AreaChart, Area, Grid, XAxis, ChartTooltip, BarChart, Bar, BarXAxis } from './vendor/bklit';
import { sampleData, percent, type SamplePoint } from './data';

type Mode = 'compare' | 'dark' | 'light';
type Kind = 'area' | 'bar';

function Icon({ name }: { name: 'sun' | 'moon' | 'split' | 'replay' }) {
  const paths = {
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />,
    split: <><rect x="3" y="4" width="18" height="16" /><path d="M12 4v16" /></>,
    replay: <path d="M3 5v5h5M3.7 10A8 8 0 1 1 5 18" />,
  };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{paths[name]}</svg>;
}

function SampleTooltip({ point }: { point: Record<string, unknown> }) {
  const date = point.date as Date;
  return <div className="sample-tooltip">
    <p>{date.getMonth() + 1} 月 {date.getDate()} 日 · 累计收益率</p>
    <div><span><i className="legend-mark primary" />研究组合</span><strong>{percent(Number(point.strategy))}</strong></div>
    <div><span><i className="legend-mark secondary" />参考组合</span><strong>{percent(Number(point.benchmark))}</strong></div>
  </div>;
}

function Chart({ data, kind, replay }: { data: SamplePoint[]; kind: Kind; replay: number }) {
  const tooltip = <ChartTooltip showDatePill={false} dotVariant="ring" dotSize={4}
    className="chart-tooltip-panel" panelStyle={{ border: '1px solid var(--border)', borderRadius: 0, boxShadow: 'none' }}
    indicatorDasharray="4,4" content={({ point }) => <SampleTooltip point={point} />} />;
  const margin = { top: 40, right: 20, bottom: 40, left: 20 };

  if (kind === 'bar') return <BarChart data={data} xDataKey="name" aspectRatio="2 / 1"
    margin={margin} barGap={0.12} revealSignature={String(replay)}>
    <Grid numTicksRows={5} strokeDasharray="4,4" />
    <Bar dataKey="strategy" fill="var(--chart-line-primary)" lineCap="butt" groupGap={1} />
    <Bar dataKey="benchmark" fill="var(--chart-line-secondary)" lineCap="butt" groupGap={1} />
    <BarXAxis maxLabels={5} />
    {tooltip}
  </BarChart>;

  return <AreaChart data={data} style={{ height: '100%' }} aspectRatio="auto"
    margin={margin} revealSignature={String(replay)}>
    <Grid numTicksRows={5} strokeDasharray="4,4" />
    <Area dataKey="strategy" fill="var(--chart-line-primary)" fillOpacity={0.3} strokeWidth={2} fadeEdges />
    <Area dataKey="benchmark" fill="var(--chart-line-secondary)" fillOpacity={0.3} strokeWidth={2} fadeEdges />
    <XAxis numTicks={5} />
    {tooltip}
  </AreaChart>;
}

function DataTable({ data }: { data: SamplePoint[] }) {
  return <div className="data-table-wrap"><table>
    <caption>图表数据 · 累计收益率（%）</caption>
    <thead><tr><th>日期</th><th>研究组合</th><th>参考组合</th></tr></thead>
    <tbody>{data.map(point => <tr key={point.name}><td>{point.name}</td><td>{point.strategy.toFixed(2)}</td><td>{point.benchmark.toFixed(2)}</td></tr>)}</tbody>
  </table></div>;
}

function ThemePanel({ theme, kind, data, replay, showData, onToggleData }: {
  theme: 'dark' | 'light'; kind: Kind; data: SamplePoint[]; replay: number;
  showData: boolean; onToggleData: () => void;
}) {
  const last = data.at(-1)!;
  return <section className={`theme-panel ${theme}`} aria-label={`${theme === 'dark' ? '深色' : '浅色'}主题样板`}>
    <div className="panel-label"><span>{theme === 'dark' ? '深色主题' : '浅色主题'}</span><span>MONOCHROME</span></div>
    <article className="research-card">
      {['tl', 'tr', 'bl', 'br'].map(corner => <span key={corner} className={`frame-corner ${corner}`} aria-hidden="true" />)}
      <header className="card-heading">
        <div><h2>{kind === 'area' ? '面积图' : '柱状图'} · 组合收益走势</h2><p>研究组合与参考组合的累计收益，4 月 {data[0].date.getDate()} 日至 30 日。</p></div>
        <button className="text-button" aria-expanded={showData} onClick={onToggleData}>{showData ? '收起数据' : '查看数据'}</button>
      </header>
      <div className="chart-meta"><span>累计收益率（%）</span><div className="chart-legend"><span><i className="legend-mark primary" />研究组合</span><span><i className="legend-mark secondary" />参考组合</span></div></div>
      <div className={`chart-frame ${kind}`} role="img" aria-label={`两组演示累计收益率，${data.length} 天；期末研究组合 12.84%，参考组合 5.16%`}>
        <Chart data={data} kind={kind} replay={replay} />
      </div>
      <footer className="card-footer"><p>期末累计收益 <strong>{percent(last.strategy)}</strong><span className="footer-separator">/</span>参考组合 <strong>{percent(last.benchmark)}</strong></p><span>{data.length} 天 · 演示数据</span></footer>
      {showData && <DataTable data={data} />}
    </article>
  </section>;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('light');
  const [kind, setKind] = useState<Kind>('area');
  const [days, setDays] = useState(30);
  const [replay, setReplay] = useState(0);
  const [showData, setShowData] = useState(false);
  const data = useMemo(() => sampleData.slice(-days), [days]);
  return <MotionConfig reducedMotion="user"><main className={`preview-shell mode-${mode}`}>
    <div className="canvas-ruler" aria-hidden="true">{[0, 100, 200, 300, 400, 500, 600, 700].map(value => <span key={value}>{value}</span>)}</div>
    <header className="page-header">
      <div className="page-identity"><span className="brand-mark" aria-hidden="true">S</span><span>SHERLOCK</span><span className="header-divider" /><h1>研究组件</h1></div>
      <div className="header-actions"><a href="https://bklit.com/charts/area-chart" target="_blank" rel="noreferrer">Bklit UI ↗</a><div className="mode-switch" role="group" aria-label="主题预览方式">
        {([['light', 'sun', '浅色'], ['dark', 'moon', '深色'], ['compare', 'split', '对照']] as const).map(([value, icon, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon name={icon} /><span>{label}</span></button>)}
      </div></div>
    </header>
    <nav className="chart-navigation" aria-label="图表类型">
      {([['area', '面积图', 'Area Chart'], ['bar', '柱状图', 'Bar Chart']] as const).map(([value, label, english]) => <button key={value} aria-label={label} aria-pressed={kind === value} onClick={() => setKind(value)}>{english}</button>)}
    </nav>
    <div className="preview-toolbar"><p>交互图表 <span>/</span> 单色系列</p><div className="toolbar-actions"><label className="range-select">时间范围<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={30}>全部 30 天</option><option value={14}>后 14 天</option><option value={7}>后 7 天</option></select></label><button className="replay-button" aria-label="重播动画" onClick={() => setReplay(value => value + 1)}><Icon name="replay" /><span>重播动画</span></button></div></div>
    <div className="preview-grid">
      {mode !== 'light' && <ThemePanel theme="dark" kind={kind} data={data} replay={replay} showData={showData} onToggleData={() => setShowData(value => !value)} />}
      {mode !== 'dark' && <ThemePanel theme="light" kind={kind} data={data} replay={replay} showData={showData} onToggleData={() => setShowData(value => !value)} />}
    </div>
    <footer className="page-footer"><p>示意数据，不代表真实市场或回测结果。</p><a href="https://github.com/bklit/bklit-ui" target="_blank" rel="noreferrer">Bklit 开源图表 · MIT ↗</a></footer>
  </main></MotionConfig>;
}
