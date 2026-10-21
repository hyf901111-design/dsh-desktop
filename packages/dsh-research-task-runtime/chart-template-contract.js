import {ADVANCED_CHART_TEMPLATES,ADVANCED_CHART_VARIANTS,advancedChartSchema,advancedChartDataIssue} from './advanced-chart-contract.js';
import {SPECIAL_CHART_TEMPLATES,SPECIAL_CHART_VARIANTS,specialChartSchema,specialChartDataIssue} from './special-chart-contract.js';
// Semantic chart contracts from the current Figma 22A library. Only implemented
// variants belong here; the full design inventory remains a separate audit.
export const CARTESIAN_CHART_TEMPLATES = Object.freeze([
  ['line', '折线图', '1918:355322'], ['area', '面积图', '1918:355569'],
  ['stackedArea', '堆叠面积图', '1918:355741'], ['step', '阶梯图', '1918:355950'],
  ['combo', '柱线组合图', '1918:356137'], ['bar', '柱状图', '1918:356393'],
  ['groupedBar', '分组柱状图', '1918:356566'], ['stackedBar', '堆叠柱状图', '1918:356817'],
  ['percentBar', '百分比堆叠柱图', '1918:357044'], ['horizontal', '横向条形图', '1918:357265'],
  ['lollipop', '棒棒糖图', '1918:357462'], ['dumbbell', '哑铃图', '1918:357677']
].map(([variant, title, figma]) => Object.freeze({variant, title, figma, width:656, height:412})));
export const CHART_TEMPLATES=Object.freeze([...CARTESIAN_CHART_TEMPLATES,...SPECIAL_CHART_TEMPLATES,...ADVANCED_CHART_TEMPLATES]);
export const CHART_VARIANTS = Object.freeze(CHART_TEMPLATES.map(t => t.variant));

// Source explanations belong in the full note, not a short chart caption.
// Preserve every character and the native renderer; never trim business data.
export function normalizeChartMetadata(data) {
  if(data?.type!=='chart'||!CARTESIAN_CHART_TEMPLATES.some(t=>t.variant===data.variant)||typeof data.asOf!=='string'||data.asOf.length<=256||data.asOf.length>2000)return data;
  if(data.note!==undefined&&(typeof data.note!=='string'||!data.note.trim()))return data;
  const note=['数据时点与来源：'+data.asOf,data.note].filter(Boolean).join('\n');
  if(note.length>2000)return data;
  const first=data.asOf.split(/[；;。\n]/u)[0].trim();
  return {...data,asOf:first&&first.length<=256?first:'数据时点与来源详见完整说明',note};
}
export function requestedChartVariant(text = '') {
  // Ignore chart syntax examples together with their human-readable labels.
  // A business-data example must not hide a later explicit chart selection.
  let intent = '', consumed = 0, previousEnd = 0, previousExample = false;
  for (const match of text.matchAll(/\bchart\.[a-zA-Z]+\b/gu)) {
    if (match.index < consumed) { previousEnd = match.index + match[0].length; previousExample = true; continue; }
    const between = text.slice(previousEnd, match.index);
    const context = between.split(/[。；;\n]|[，,](?=但|不过|本面板|本图|必须|务必|实际|最终)/u).at(-1);
    const format = context.search(/(?:语法|格式|结构|写法).{0,12}(?:示例|举例)|示例(?=[：:\s（(])/u);
    const example = context.search(/(?:例如|比如|譬如|举例)[：:\s（(]*(?:(?:使用|采用|输出|声明)\s*)?$/u);
    const optional = context.search(/(?:可以|允许|支持|可)(?:声明(?:为)?|写为|写作)\s*$/u);
    let omit = format >= 0 ? format : example;
    if (optional >= 0 && omit < 0) {
      const clauseStart = Math.max(context.lastIndexOf('，'),context.lastIndexOf(',')) + 1;
      omit = /\bchart\b/u.test(context.slice(clauseStart, optional)) ? clauseStart : optional;
    }
    if (omit < 0 && previousExample && context === between && /^[\s/／、|]*(?:(?:或|和|与|及)(?:使用|采用|声明)?\s*)?$/u.test(context)) omit = 0;
    if (omit >= 0) {
      intent += text.slice(consumed, match.index - context.length + omit);
      const tokenEnd = match.index + match[0].length;
      // A suffix such as “绘制普通柱状图” or “（饼图）” is still part of
      // the syntax example. Stop before a new clause or business instruction.
      const boundary = text.slice(tokenEnd).search(/[。；;\n]|[，,]?(?=但|不过|本面板|本图|必须|务必|实际|最终|随后)|[，,](?=(?:使用|采用|输出|声明|选择)\s*chart\.)/u);
      consumed = boundary < 0 ? text.length : tokenEnd + boundary;
    }
    previousEnd = match.index + match[0].length;
    previousExample = omit >= 0;
  }
  intent += text.slice(consumed);
  const explicit = intent.match(/\bchart\.([a-zA-Z]+)\b/u)?.[1];
  if (CHART_VARIANTS.includes(explicit)) return explicit;
  const rules = [['waterfall',/瀑布图/u],['funnel',/漏斗图/u],['sankey',/桑基图/u],['bubble',/气泡图/u],['scatter',/散点图/u],['heatmap',/相关性热力图|相关矩阵/u],['calendar',/日历热力图/u],['ohlc',/OHLC图|OHLC 图/iu],['candlestick',/K线图|K 线图|蜡烛图/u],['sunburst', /旭日图/u], ['treemap', /矩形树图|树矩图/u], ['donut', /环形图|环图/u], ['pie', /饼图/u], ['radar', /雷达图/u], ['histogram', /直方图/u], ['box', /箱线图|箱形图/u], ['bullet', /子弹图|靶心图/u], ['gauge', /仪表图|仪表盘/u], ['percentBar', /百分比.*(?:柱|条)|百分比堆叠/u], ['stackedArea', /堆叠面积/u],
    ['stackedBar', /堆叠(?:柱|条)/u], ['groupedBar', /分组(?:柱|条)/u], ['combo', /柱线|柱.*折线.*组合/u],
    ['dumbbell', /哑铃/u], ['lollipop', /棒棒糖/u], ['horizontal', /横向(?:条|柱)|条形图/u],
    ['step', /阶梯图/u], ['area', /面积图/u], ['bar', /柱状图/u], ['line', /折线|趋势|走势|对比曲线/u]];
  return rules.find(([, rule]) => rule.test(intent))?.[0];
}
export function chartTemplateSchema(variant) {
  if(ADVANCED_CHART_VARIANTS.includes(variant))return advancedChartSchema(variant);
  if(SPECIAL_CHART_VARIANTS.includes(variant))return specialChartSchema(variant);
  return JSON.stringify({version:1,type:'chart',title:'标题',variant:variant ?? CARTESIAN_CHART_TEMPLATES.map(t=>t.variant).join('|'),
    labels:['标签1','标签2'],series:[{name:'系列',values:[12,18]}],unit:'相同数值单位',asOf:'来源及数据时点'}) +
    '；labels 为1–366项，series 为1–12项，总数据点不超过600；values 与 labels 等长、只用有限数值，不能用0替代缺失数据。asOf、subtitle、unit 各最多256字，完整来源和计算说明放 note（最多2000字），不要把长篇解读写进 asOf。' +
    'percentBar 仅非负原值，由宿主计算各分类百分比；unit 必须是原值单位（如百万元、件），不能把金额原值标为 %，不要在 unit 中填写说明文字；dumbbell 恰好两组配对值；combo 每组可指定 kind:"bar"或"line"，默认第一组柱、其余折线。同轴仅放同单位序列。可选 subtitle、note，原始单位和来源保留。'+(variant?'':'；其他已实现图表：'+specialChartSchema()+'；'+advancedChartSchema());
}
export function requireSimulatedChartData(panel) {
  if (panel.type !== 'chart' || panel.artifact) return;
  const variant = requestedChartVariant(`${panel.title}\n${panel.prompt}`) ?? 'bar';
  throw Error(`面板「${panel.title}」需要与需求匹配的模拟图表数据。请在本次工作台调用的 panel.artifact 中补齐 ${chartTemplateSchema(variant)} labels、系列名、单位和数据范围必须对应用户需求；只生成明确标注的虚构值，不联网、不编写 HTML、不启动逐卡模型。宿主不会用通用行业样例替代季度或产品数据。`);
}
export function chartDataIssue(spec) {
  if(ADVANCED_CHART_VARIANTS.includes(spec?.variant))return advancedChartDataIssue(spec);
  if(SPECIAL_CHART_VARIANTS.includes(spec?.variant))return specialChartDataIssue(spec);
  if (spec?.type !== 'chart' || !CHART_VARIANTS.includes(spec.variant)) return '未注册的图表变体';
  const string = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const allowed = ['version','type','title','variant','labels','series','unit','asOf','subtitle','note'];
  if (spec.version !== 1 || !string(spec.title,256) || Object.keys(spec).some(k => !allowed.includes(k))) return '图表版本、标题或字段无效';
  for (const key of ['unit','asOf','subtitle','note']) if (spec[key] !== undefined && !string(spec[key], key === 'note' ? 2000 : 256)) return `${key} 无效`;
  if (!Array.isArray(spec.labels) || !spec.labels.length || spec.labels.length > 366 || !spec.labels.every(v => string(v,128))) return 'labels 必须为1–366个标签';
  if (!Array.isArray(spec.series) || !spec.series.length || spec.series.length > 12 || spec.labels.length * spec.series.length > 600) return 'series 为1–12组且总数据点不超过600';
  for (const [i, s] of spec.series.entries()) {
    if (!s || !string(s.name,128) || Object.keys(s).some(k => !['name','values','kind'].includes(k)) ||
      !Array.isArray(s.values) || s.values.length !== spec.labels.length ||
      !s.values.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12)) return `series[${i}] 的数值必须与 labels 等长且有限`;
    if (s.kind !== undefined && (spec.variant !== 'combo' || !['bar','line'].includes(s.kind))) return `series[${i}].kind 仅用于柱线组合图`;
  }
  if (spec.variant === 'dumbbell' && spec.series.length !== 2) return '哑铃图必须恰好有两组配对数据';
  if (spec.variant === 'percentBar' && spec.series.some(s => s.values.some(v => v < 0))) return '百分比堆叠柱图不接受负值';
  if (spec.variant === 'percentBar' && /[%％]|百分比/u.test(spec.unit ?? '') &&
    spec.labels.some((_,i) => spec.series.reduce((sum,s) => sum+s.values[i],0) > 100+1e-8)) {
    return '百分比堆叠图的 unit 是原始数据单位（如百万元、件），不能把未归一化原值标成百分比；占比由宿主计算，说明放入 note';
  }
  return null;
}
