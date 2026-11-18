export const webpageControlGuidance = '用户未指定其他风格时，网页内的表格、容器、按钮和分段选择器默认用直角（border-radius: 0），柱形、堆叠条和进度条两端平直。用留白和必要的细分隔线分组，省去摘要侧边色条、分区顶部色带和胶囊外框。'
export const compactWebpageGuidance = '同一组数据先放最有用的读数与单位，再按需提供周期切换、趋势或明细。易方达模式用白底深灰字、品牌深蓝选中下划线、深蓝与亮青系列、浅灰表头细线。浅色、深色和彭博模式共用布局、密度和交互，只从当前看板配色变量取色。图例、坐标单位和截至日期就近显示。窄卡筛选换行，宽表在表内横滚。'

// Embedded in the exported HTML as well as the board preview. The low-priority
// layer lets a page keep its own layout and explicitly requested styling.
export const compactWebpageCss = `@layer workbench-compact {
  :root {
    --sherlock-chart-1: #005096;
    --sherlock-chart-2: #1eb9e1;
    --sherlock-chart-label: #666;
    --sherlock-chart-grid: #dce3eb;
    --page-accent: var(--sherlock-control-primary, #005096);
    --page-ink: var(--sherlock-text, #333);
    --page-muted: var(--sherlock-muted, #666);
    --page-line: var(--sherlock-border, #dce3eb);
    --page-surface: var(--sherlock-surface, #fff);
    --page-tint: var(--sherlock-surface-muted, #f8fafd);
  }
  :root[data-workbench-style="enterprise"] { --page-accent: var(--sherlock-chart-1, #005096); }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: clamp(12px, 2vw, 16px);
    background: var(--page-surface);
    color: var(--page-ink);
    font: 14px/1.5 var(--sherlock-font-sans, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif);
  }
  h1, h2, h3, p, figure, dl { margin: 0; }
  h1 { font-size: 18px; }
  h2, h3 { font-size: 16px; }
  section + section { margin-block-start: 16px; }
  :is(h1, h2, h3) + *, .filters + *, [role="tablist"] + * { margin-block-start: 8px; }
  .filters, [role="tablist"] { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; }
  button, select, textarea, input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"]) {
    min-height: 30px; max-width: 100%; padding: 4px 8px; border: 1px solid var(--page-line);
    border-radius: 0; background: var(--page-surface); color: var(--page-ink); font: inherit;
  }
  button { cursor: pointer; }
  a { color: var(--sherlock-link, var(--page-accent)); text-underline-offset: 2px; }
  button[aria-pressed="true"] {
    background: var(--sherlock-row-selected, #e8f1f8); border-color: var(--page-accent); font-weight: 600;
  }
  [role="tablist"] { border-bottom: 1px solid var(--page-line); }
  [role="tab"] { background: transparent; border: 0; border-bottom: 2px solid transparent; }
  [role="tab"][aria-selected="true"] { color: var(--page-accent); border-bottom-color: currentColor; font-weight: 600; }
  :focus-visible { outline: 2px solid var(--page-accent); outline-offset: 2px; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr)); gap: 8px 16px; }
  .metrics dt, figcaption, small { color: var(--page-muted); font-size: 12px; }
  .metrics dd { margin: 2px 0 0; font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .table-scroll { max-width: 100%; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid var(--page-line); text-align: start; }
  th { background: var(--page-tint); font-weight: 600; }
  .numeric { text-align: end; font-variant-numeric: tabular-nums; }
  figure { margin-block-start: 12px; }
  figure svg, figure canvas { display: block; max-width: 100%; }
  figcaption { margin-block-start: 8px; }
}`
