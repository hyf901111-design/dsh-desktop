export const webpageControlGuidance = '用户未指定其他风格时，网页内的表格、容器、按钮和分段选择器默认用直角（border-radius: 0），柱形、堆叠条和进度条两端平直。指标、摘要、图例色块用平面底色，不叠加外描边或阴影。省去摘要侧边色条、分区顶部色带和胶囊外框。通用信息块可标注 data-workbench-block。用留白和必要的细分隔线分组，保留输入框边界和键盘焦点。'
export const compactWebpageGuidance = '同一组数据先放最有用的读数与单位，再按需提供周期切换、趋势或明细。易方达模式用白底深灰字、品牌深蓝选中下划线、深蓝与亮青系列、浅灰表头细线。浅色、深色和彭博模式共用布局、密度和交互，只从当前看板配色变量取色。图例、坐标单位和截至日期就近显示。窄卡筛选换行，宽表在表内横滚。'
  + ' 数值滑块使用原生 input[type=range]。易方达模式的未选滑轨用浅灰，已选段和滑块用品牌深蓝，第二系列可用亮青。可用 --page-range-accent 指定对应的图表系列变量。其余模式的滑轨和选中段分别跟随当前主题的控件边界色和强调色。'

// Applied to both new compact files and existing pages embedded in a board.
// Limit flat fills to information blocks; editors, focus indicators and table
// separators still communicate where the user can type or navigate.
export function webpageGeometryCss(scope) {
  const blocks = ':where([data-workbench-block],.card,.panel,.tile,.metric,.kpi,.stat,.verdict,.badge,.swatch,.sw,.bar,.seg,.metrics>div,.stats>div,[role=progressbar])'
  const sections = ':where(section,article,aside,div):has(>:is(h2,h3))'
  const controls = ':where(button,select,textarea,table,th,td,fieldset,[role=tab],input:not([type=radio],[type=checkbox],[type=range],[type=color],[type=image]))'
  const range = scope+' input[type=range]:not([orient=vertical])'
  const accent = 'var(--page-range-accent,var(--page-accent,var(--sherlock-chart-1,#005096)))'
  const track = 'var(--sherlock-control-border,#c1c6c8)'
  return `
    ${scope} ${blocks}, ${scope} ${sections} { border-radius:0!important; }
    ${scope} ${blocks}:not(:any-link,button,input,select,textarea,[tabindex],[role=button],[role=tab]),
    ${scope} ${sections}:not([tabindex],[role=button]) { border:0!important; box-shadow:none!important; }
    ${scope} ${controls} { border-radius:0!important; }
    ${scope} :is(button,input,select,textarea,a[href],[tabindex]):focus-visible { outline:2px solid var(--page-accent,var(--sherlock-chart-1,#005096))!important; outline-offset:2px; }
    @media screen and (forced-colors:none) {
      ${range} { appearance:none!important; background:transparent!important; border:0!important; padding:0; min-block-size:24px; overflow:hidden; }
      ${range}::-webkit-slider-runnable-track { appearance:none; height:4px; background:${track}!important; border:0!important; border-radius:0!important; }
      /* The thumb moves natively. Its clipped shadow fills exactly the portion
         before it, including after a script sets value or a form resets. */
      ${range}::-webkit-slider-thumb { appearance:none; width:12px; height:12px; margin-top:-4px; border:0!important; border-radius:0!important; background:${accent}!important; box-shadow:-100vmax 0 0 100vmax ${accent};
        clip-path:polygon(0 0,100% 0,100% 100%,0 100%,0 8px,-100vmax 8px,-100vmax 4px,0 4px); }
      ${range}:dir(rtl)::-webkit-slider-thumb { transform:scaleX(-1); }
      ${range}::-moz-range-track { height:4px; border:0; border-radius:0; background:${track}; }
      ${range}::-moz-range-progress { height:4px; border:0; border-radius:0; background:${accent}; }
      ${range}::-moz-range-thumb { width:12px; height:12px; border:0; border-radius:0; background:${accent}; }
    }`
}

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
    background: var(--sherlock-row-selected, #e8f1f8); border-color: transparent; font-weight: 600;
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
  ${webpageGeometryCss(':root')}
}`
