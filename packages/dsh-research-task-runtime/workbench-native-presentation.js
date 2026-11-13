import {addDecimal,decimalNumber,decimalParts} from './workbench-decimal.js';
import { chartDataIssue,chartFieldUnit,normalizeChartMetadata,orderDatedChartRows,requestedChartVariant } from './chart-template-contract.js';
import { kpiDataIssue } from './kpi-template-contract.js';
import { nativeProvenance } from './component-provenance.js';
import { compileComponentContent } from './component-content.js';

const basicChartTypes = ['bar', 'horizontal', 'line', 'area'];
const presentationPatterns = [
    ['market.waterfall', /瀑布图|增减桥|\bwaterfall\b/iu],
    ['market.allocation-donut', /环形图|环图|\ballocation-donut\b/iu],
    ['market.risk-matrix', /风险矩阵|概率\s*[×x*]\s*影响|\brisk-matrix\b/iu],
    ['chart.candlestick', /K\s*线|蜡烛图|\bcandlestick\b/iu],
    ['chart.scatter', /散点图|\bscatter\b/iu],
    ['chart.groupedBar', /分组(?:柱|条)(?:状|形)?图|\bgroupedBar\b/u],
    ['chart.horizontal', /横向(?:条形|柱状|条|柱)图|横条图|条形图/u],
    ['chart.bar', /柱状图|柱形图|柱图/u],
    ['chart.line', /折线图|折线/u],
    ['chart.area', /面积图/u],
    ['timeline', /时间线/u],
    ['kpi', /指标卡|\bKPI\b/iu],
];

function explicitPresentation(text) {
    const affirmative = text.replace(/(?:不要|不用|无需|不需要|避免|禁止)(?:再|用|使用|画|绘制|生成|另做|做)*[^，。；、\n]{0,12}(?:瀑布图|环形图|环图|风险矩阵|K\s*线|蜡烛图|散点图|分组柱图|柱状图|柱图|条形图|折线图|时间线|指标卡)/gu, '');
    if (/堆叠|柱线组合|柱折组合|阶梯折线/u.test(affirmative)) return;
    return presentationPatterns.find(([, pattern]) => pattern.test(affirmative))?.[0];
}

function requestedPresentation(panel, originalRequest) {
    if (!originalRequest) return;
    const title = panel.title.split(/[（(]/u)[0].trim();
    const quoted = [...originalRequest.matchAll(/[「“『]([^」”』\n]+)[」”』]([^「“『。；;\n]*)/gu)]
        .find(match => match[1] === title);
    if(quoted&&/^\s*(?:做成|做为|作为|用|为)?\s*(?:一张)?\s*(?:可(?:搜索|排序|筛选|分页|和|与|、|\s)+(?:的)?)?\s*(?:原生|明细|数据)?表(?:格)?(?=$|[，、,。；;\s])/u.test(quoted[2]))return 'table';
    const local = explicitPresentation((quoted?.[2] ?? '') + ' ' + title);
    if (local) return local;
    // With a title list separated from the descriptions, accept a planner's
    // chart declaration only when the request also mentions the same format.
    const suggested = explicitPresentation(panel.prompt);
    return suggested && presentationPatterns.some(([kind, pattern]) => kind === suggested && pattern.test(originalRequest)) ? suggested : undefined;
}

function authoredChartTitle(panel,request,variant){
    const titles=[...request.matchAll(/[「“『]([^」”』\n]+)[」”』]([^「“『。；;\n]*)/gu)]
        .filter(([,title,description])=>explicitPresentation(description)===`chart.${variant}`).map(([,title])=>title);
    const exact=titles.find(title=>panel.title===title||panel.title.split(/[（(]/u)[0].trim()===title);
    return exact??(titles.length===1?titles[0]:undefined);
}

const ledgerHeaders = [
    ['candlestick', /(?:^|\s)(日期|交易日|date)$/iu],
    ['scatter', /(?:^|\s)(产品(?:简称|名称)?|基金简称|标的|简称|名称|product|name)$/iu],
    ['groupedBar', /(?:^|\s)(季度|quarter)$/iu],
];
const ledgerDecimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u;

// A pasted ledger is direct source evidence. Match only complete, unambiguous
// blocks with a recognizable header; other prose remains a planning request.
export function authoredFinanceLedger(request = '') {
    if (!/(?:模拟[^。；\n]{0,48}(?:账簿|台账)|(?:账簿|台账)[^。；\n]{0,48}模拟)/u.test(request) ||
        !/(?:禁止|不要|不用|不)\s*联网/u.test(request)) return;
    const tables = new Map();
    let current;
    for (const line of request.split(/\r?\n/u)) {
        const cells = line.trim().replace(/^[|｜]|[|｜]$/gu,'').split(/[|｜]/u).map(cell=>cell.trim());
        if (cells.length < 3) { current = undefined; continue; }
        const kind = ledgerHeaders.find(([variant,pattern]) => pattern.test(cells[0]) &&
            (variant === 'candlestick' ? cells.length === 6 : cells.length === 3));
        if (kind) {
            cells[0] = kind[1].exec(cells[0])[1];
            current = {columns:cells,rows:[],invalid:false};
            const tablesOfKind = tables.get(kind[0]) ?? [];
            tablesOfKind.push(current);
            tables.set(kind[0], tablesOfKind);
            continue;
        }
        if (!current || cells.every(cell=>/^:?-{3,}:?$/u.test(cell))) continue;
        if (cells.length !== current.columns.length || !cells[0] || !cells.slice(1).every(cell=>ledgerDecimal.test(cell))) {
            current.invalid = true;
            continue;
        }
        current.rows.push([cells[0],...cells.slice(1).map(Number)]);
    }
    return tables;
}

// Inline ledger clauses are direct evidence when every entry parses in full.
export function applyInlineFinanceLedger(panel, request = '') {
    if (!panel?.title || panel.library || panel.publicData || panel.profile || panel.requests ||
        !/(?:禁止|不要|不用|不)\s*联网/u.test(request) || !/模拟[^。；\n]{0,30}(?:账簿|台账)|模拟(?:账簿|台账)/u.test(request)) return panel;
    const title = panel.title.split(/[（(]/u)[0].trim();
    const clause = [...request.matchAll(/「([^」\n]+)」([^「。；\n]*)/gu)].find(match=>match[1]===title)?.[2];
    if (!clause) return panel;
    const kind = explicitPresentation(clause);
    const number = '([+−-]?(?:0|[1-9]\\d{0,12})(?:\\.\\d{1,8})?)';
    const unit = '(万元|亿元|元)';
    const tokens = body => body.split(/[、，]/u).map(value=>value.trim());
    const unique = rows => rows.length > 0 && rows.length <= 30 &&
        rows.every(Boolean) && new Set(rows.map(row=>row.label)).size===rows.length;
    const amounts = (body,units,{signed=false}={}) => tokens(body).map(token=>{
        const match = new RegExp('^([^0-9+−-]{1,50}?)\\s*'+number+'\\s*'+unit+'?$','u').exec(token);
        if (!match || match[3] && match[3]!==units || signed && !/^[+−-]/u.test(match[2])) return;
        const label=match[1].trim(),raw=match[2].replace('−','-');
        const value=Number(raw);
        return label && Number.isFinite(value) ? {label,value,raw} : undefined;
    });
    const base = {version:1,type:'market',title,asOf:'用户提供的模拟账簿期末（未注明日期）',sources:[{label:'用户提供的模拟账簿'}],note:'来源：用户提供的模拟账簿'};
    let artifact;
    if (kind === 'market.waterfall') {
        const match = new RegExp('期初\\s*'+number+'\\s*'+unit+'[、，](.+?)[、，]\\s*(?:明确)?期末\\s*'+number+'\\s*'+unit+'\\s*$','u').exec(clause);
        if (!match || match[2]!==match[5]) return panel;
        const [,start,units,body,end]=match;
        const changes=amounts(body,units,{signed:true});
        if (!unique(changes)) return panel;
        const normalized = value => value.replace('−','-');
        const total=changes.reduce((sum,{raw})=>addDecimal(sum,decimalParts(raw)),decimalParts(normalized(start)));
        if (decimalNumber(total)!==Number(normalized(end))) throw Error('瀑布图的期末金额与期初金额加各项增减额不一致，请核对账簿。');
        artifact={...base,variant:'waterfall',unit:units,start:Number(normalized(start)),changes:changes.map(({label,value})=>({label,value}))};
    } else if (kind === 'market.allocation-donut') {
        const body = /(?:环形图|环图)[，、：:]\s*(.*?)(?:[，、](?:图例|标注|显示|保留).*)?$/u.exec(clause)?.[1];
        const units=body?.match(/(?:万元|亿元|元)\s*$/u)?.[0].trim();
        if (!units) return panel;
        const items=amounts(body,units);
        if (!unique(items)||items.some(item=>item.value<0)) return panel;
        artifact={...base,variant:'allocation-donut',unit:units,items:items.map(({label,value})=>({label,value}))};
    } else if (kind === 'market.risk-matrix') {
        const body=/(?:1\s*(?:到|至|[-–])\s*5\s*档)?[：:]\s*(.+)$/u.exec(clause)?.[1];
        const items=body?.split(/[、，](?!\s*[1-5]\s*[）)])/u).map(token=>{
            const match=/^([^（(]{1,50}?)\s*[（(]\s*([1-5])\s*[,，]\s*([1-5])\s*[）)]$/u.exec(token.trim());
            return match ? {label:match[1].trim(),probability:Number(match[2]),impact:Number(match[3])} : undefined;
        });
        if (!items || !unique(items)) return panel;
        artifact={...base,variant:'risk-matrix',items};
    }
    if (!artifact) return panel;
    const {content,view,artifact:previous,...planned}=panel;
    return {...planned,type:'market',artifact};
}

export function applyAuthoredFinanceLedger(panel, tables, request) {
    if (!tables?.size || !panel?.title || panel.library || panel.publicData || panel.profile || panel.requests) return panel;
    const view=panel.view;
    const variant=requestedPresentation(panel,request)?.split('.')[1]??view?.variant;
    const named=authoredChartTitle(panel,request,variant);
    if(view&&(!named||!['chart','market'].includes(panel.type)||panel.artifact!==undefined||panel.content!==undefined||
        Object.keys(view).some(key=>!['dataset','variant','unit','note','subject','sections'].includes(key))||
        view.sections?.length!==1||!['records','compare'].includes(view.sections[0]?.kind)))return panel;
    const matches = tables.get(variant);
    if (matches?.length !== 1 || matches[0].invalid || !matches[0].rows.length) return panel;
    const {columns,rows} = matches[0];
    const source = /来源\s*(?:标(?:为|注(?:为)?)?|写(?:为)?|[:：])\s*[「“]?([^。；;，、」”\n]{1,48})/u.exec(request)?.[1] ?? '用户提供的模拟台账';
    const title = named ?? panel.artifact?.title ?? panel.content?.title ?? panel.title;
    const sources = [{label:source.trim()}];
    let artifact;
    if (variant === 'groupedBar') {
        const context = [...request.matchAll(/[「“]([^」”\n]+)[」”]([^「“。；;\n]*)/gu)].find(match=>match[1]===panel.title.split(/[（(]/u)[0].trim())?.[2];
        const unit = /单位(?:为|均为)?\s*(百分比|[%％]|万元|亿元|元|百分点)/u.exec(context ?? '')?.[1];
        if (!unit || !columns.slice(1).every(column=>context.includes(column)) ||
            !rows.every(row=>/^\d{4}Q[1-4]$/u.test(row[0])) ||
            new Set(rows.map(row=>row[0])).size!==rows.length || new Set(columns).size!==columns.length) return panel;
        artifact=compileComponentContent({title,rows:rows.map(row=>Object.fromEntries(columns.map((column,i)=>[column,row[i]]))),sources,
            visualization:{kind:variant,label:columns[0],values:columns.slice(1),unit:unit==='百分比'||unit==='％'?'%':unit}}).data;
    } else {
        artifact=financeChartFromTable({version:1,type:'table',title,columns,rows,sources},variant,request);
    }
    if (artifact?.variant!==variant) return panel;
    const {content,view:sharedView,...planned} = panel;
    return {...planned,type:'chart',artifact};
}

export function expandMappedWorkbenchChart(panel){
    const draft=panel?.artifact;
    if(panel?.type!=='chart'||draft?.type!=='chart'||panel.content!==undefined||panel.view!==undefined||
       panel.library||panel.publicData||panel.profile||panel.requests||draft.version!==undefined&&draft.version!==1)return panel;
    const variant=draft.variant??draft.chartType??requestedChartVariant(panel.title+'\n'+panel.prompt);
    if(!basicChartTypes.includes(variant)||draft.variant&&draft.chartType&&draft.variant!==draft.chartType)return panel;
    const {artifact,...planned}=panel;
    const common=['version','type','variant','chartType','title','unit','note'];
    if(typeof draft.dataset==='string'&&typeof draft.xField==='string'&&typeof draft.yField==='string'&&
       Object.keys(draft).every(key=>[...common,'dataset','xField','yField'].includes(key))){
        return {...planned,view:{dataset:draft.dataset,variant,...(draft.unit===undefined?{}:{unit:draft.unit}),...(draft.note===undefined?{}:{note:draft.note}),
            sections:[{kind:'records',label:draft.xField,fields:[draft.yField]}]}};
    }
    if(!Array.isArray(draft.records)||!draft.records.length||!Array.isArray(draft.fields)||draft.fields.length!==2||draft.source!==undefined&&draft.sources!==undefined||
       !draft.fields.every(field=>field&&typeof field.key==='string'&&typeof field.label==='string'&&Object.keys(field).every(key=>['key','label','unit'].includes(key)))||
       !Object.keys(draft).every(key=>[...common,'records','fields','source','sources','asOf'].includes(key)))return panel;
    const dateFields=draft.fields.filter(field=>/date|日期|时间/iu.test(field.key+' '+field.label));
    if(dateFields.length!==1)return panel;
    const [date]=dateFields, measure=draft.fields.find(field=>field!==date);
    if(!draft.records.every(row=>row&&typeof row[date.key]==='string'&&Number.isFinite(row[measure.key])))return panel;
    const unit=chartFieldUnit(measure);
    if(draft.unit!==undefined&&unit!==undefined&&draft.unit!==unit)return panel;
    const sources=draft.sources??(draft.source===undefined?undefined:[typeof draft.source==='string'?{label:draft.source}:draft.source]);
    return {...planned,content:{title:panel.title,rows:orderDatedChartRows(draft.records,row=>row[date.key]),columns:draft.fields.map(({key,label})=>({key,label})),
        ...(sources===undefined?{}:{sources}),...(draft.asOf===undefined?{}:{asOf:draft.asOf}),...(draft.note===undefined?{}:{note:draft.note}),
        visualization:{kind:variant,label:date.key,values:[measure.key],...(draft.unit??unit?{unit:draft.unit??unit}:{})}}};
}

export function labelRequestedReportSeries(panel,request){
    const content=panel?.content,view=content?.visualization;
    if(panel?.type!=='chart'||!content||content.columns!==undefined||!Array.isArray(view?.values)||view.values.length!==2||
       !view.values.includes('revenue')||!view.values.includes('profit')||!Array.isArray(content.rows)||
       !/研报|研究报告/u.test(request??'')||!/(?:营业收入|营收).{0,12}归母净利润/u.test(request??'')||
       !/(?:营业收入|营收).{0,12}归母净利润/u.test([panel.title,content.title,panel.prompt].join('\n')))return panel;
    return {...panel,content:{...content,columns:[{key:'revenue',label:'营业收入'},{key:'profit',label:'归母净利润'}]}};
}

export function normalizeSharedChart(panel,datasets,request=''){
    const view=panel?.view;
    if(!view||panel.artifact!==undefined||panel.content!==undefined||panel.library||panel.publicData||panel.profile||panel.requests)return panel;
    if(!['chart','view'].includes(panel.type)||!['bar','horizontal','line','area','groupedBar'].includes(view.variant))return panel;
    if(Object.keys(view).some(key=>!['dataset','variant','unit','note','subject','sections'].includes(key))||
       view.subject!==undefined&&typeof view.subject!=='string')return panel;
    const dataset=datasets?.find(item=>item.id===view.dataset);
    if(!dataset||!Array.isArray(view.sections))return panel;
    const [first,second]=view.sections;
    const duplicateComparison=view.sections.length===2&&first?.kind==='records'&&second?.kind==='compare'&&first.label===second.label&&
        JSON.stringify(first.fields)===JSON.stringify(second.fields)&&Object.keys(second).every(key=>['kind','title','label','fields'].includes(key))&&
        !/(?:任意|任选|选取|选择)(?:两|2)(?:组|项|条|类).{0,8}(?:对比|比较)/u.test(request);
    if(view.sections.length!==1&&!duplicateComparison)return panel;
    const section=first;
    if(!section||!['compare','records'].includes(section.kind)||Object.keys(section).some(key=>!['kind','title','label','fields'].includes(key)))return panel;
    return {...panel,type:'chart',view:{...view,sections:[{...section,kind:'records'}]}};
}

export function normalizeSharedKpi(panel,datasets,request){
    if(panel?.type!=='view'||!panel.view||panel.artifact!==undefined||panel.content!==undefined||panel.library||panel.publicData||
        panel.profile||panel.requests||requestedPresentation(panel,request)!=='kpi')return panel;
    const source=datasets?.find(dataset=>dataset.id===panel.view.dataset);
    return source?.groupBy?.length===0&&source.records.length===1?{...panel,type:'kpi'}:panel;
}

function chartFromTable(table, variant, prompt) {
    if (table.type !== 'table' || !Array.isArray(table.columns) || !Array.isArray(table.rows) || !table.rows.length ||
        !table.columns.every(column => typeof column === 'string') ||
        !table.rows.every(row => Array.isArray(row) && row.length === table.columns.length)) return;
    const { columns, rows, type, ...metadata } = table;
    const dimensions = columns.map((column,i) => ({column,i})).filter(({i}) =>
        rows.every(row => typeof row[i] === 'string' && row[i].trim()) &&
        new Set(rows.map(row => row[i])).size === rows.length);
    const namedDimensions = dimensions.filter(({column}) => column.length>=2 && prompt.includes(column));
    const axis = namedDimensions.length===1 ? namedDimensions[0] : dimensions.length===1 ? dimensions[0] : undefined;
    if (!axis) return;
    const label = axis.i;
    const splitColumn = column => {
        const match = column.match(/^(.*?)\s*[（(]([^）()]+)[）)]$/u);
        return match ? { name: match[1].trim(), unit: match[2] } : { name: column };
    };
    const metrics = columns.map((column, i) => ({ ...splitColumn(column), i }))
        .filter(({ i }) => i !== label && rows.every(row => Number.isFinite(row[i])));
    const selected = metrics.length === 1 ? metrics : metrics.filter(({ name }) => name.length >= 2 && prompt.includes(name));
    if (selected.length !== 1) return;
    const [metric] = selected;
    const unit = metric.unit ?? /单位[：:\s]*(万元|亿元|元|百分点|%|％)/u.exec(prompt)?.[1];
    const detail = columns.map((_, i) => i).filter(i => i !== label && i !== metric.i);
    const result = {
        ...metadata, type: 'chart', variant, labels: rows.map(row => row[label]),
        series: [{ name: metric.name, values: rows.map(row => row[metric.i]) }],
        ...(unit ? { unit } : {}),
        ...(detail.length ? {
            detailColumns: [columns[label], ...detail.map(i => columns[i])],
            detailRows: rows.map(row => [row[label], ...detail.map(i => row[i])]),
        } : {}),
    };
    const provenance = nativeProvenance(result);
    if (!provenance.invalid && !chartDataIssue(provenance.data)) return result;
}

function kpiFromTable(table) {
    const { columns, rows, type, ...metadata } = table;
    if (!Array.isArray(columns) || !Array.isArray(rows) || !rows.length) return;
    const label = columns.findIndex(column => /^(?:指标(?:名称)?|项目|名称|indicator|metric|label)$/iu.test(column));
    const value = columns.findIndex(column => /^(?:数值|值|金额|结果|value)$/iu.test(column));
    const unit = columns.findIndex(column => /^(?:单位|unit)$/iu.test(column));
    if (label < 0 || value < 0 || !columns.every((column, i) => [label, value, unit].includes(i) || /^(?:id|序号|编号)$/iu.test(column))) return;
    if (!rows.every(row => Array.isArray(row) && row.length === columns.length)) return;
    const result = {
        ...metadata, type: 'kpi', items: rows.map(row => ({
            label: row[label], value: row[value],
            ...(unit >= 0 && row[unit] && !String(row[value]).trim().endsWith(String(row[unit])) ? { unit: row[unit] } : {}),
        })),
    };
    const provenance = nativeProvenance(result);
    if (!provenance.invalid && !kpiDataIssue(provenance.data)) return result;
}

function tableFromChart(chart){
    if(chart.type!=='chart'||!Array.isArray(chart.detailColumns)||!Array.isArray(chart.detailRows)||!chart.detailRows.length)return;
    const {version,title,asOf,note,sources,unit,series}=chart;
    const columns=chart.detailColumns.map(label=>unit&&series?.some(item=>item.name===label)&&!label.includes(unit)?`${label}（${unit}）`:label);
    return {version,type:'table',title,columns,rows:chart.detailRows,...(asOf===undefined?{}:{asOf}),...(note===undefined?{}:{note}),
        ...(sources===undefined?{}:{sources})};
}

function financeChartFromTable(table, variant, request) {
    if (table.type !== 'table' || !Array.isArray(table.columns) || !table.rows?.length || table.body ||
        !table.rows.every(row => Array.isArray(row) && row.length === table.columns.length)) return;
    const { columns, rows, type, ...metadata } = table;
    const labels = columns.map(column => String(column).replace(/\s*[（(][^）)]*[）)]$/u, ''));
    const field = pattern => {
        const matches = labels.flatMap((name, index) => pattern.test(name) ? [index] : []);
        return matches.length === 1 ? matches[0] : -1;
    };
    const unit = index => /[（(]([^）)]+)[）)]$/u.exec(columns[index])?.[1];
    const base = { ...metadata, type:'chart', variant };
    let result;
    let fields;
    if (variant === 'candlestick') {
        fields = [/^(?:日期|交易日|date)$/iu, /^(?:开|开盘价?|open)$/iu, /^(?:高|最高价?|high)$/iu,
            /^(?:低|最低价?|low)$/iu, /^(?:收|收盘价?|close)$/iu, /^(?:量|成交量|volume)$/iu].map(field);
        const [date, open, high, low, close, volume] = fields;
        const priceUnit = unit(open) ?? /(?:开高低收|价格|OHLC)\s*[（(](元|美元|港元|点)[）)]/iu.exec(request)?.[1];
        const volumeUnit = unit(volume) ?? /(?:成交量|量)\s*[（(](股|万股|手|万手|份)[）)]/u.exec(request)?.[1];
        if ([high,low,close].some(i=>unit(i)&&unit(i)!==priceUnit)) return;
        const candles = rows.map(row=>({date:row[date],open:row[open],high:row[high],low:row[low],close:row[close],volume:row[volume]}));
        result = { ...base, unit:priceUnit, volumeUnit, candles:candles.toSorted((a,b)=>String(a.date).localeCompare(String(b.date))) };
    } else {
        fields = [/^(?:产品(?:简称|名称)?|基金简称|标的|简称|名称|product|label|name)$/iu, /^(?:年化)?波动率$|^(?:vol|volatility)$/iu,
            /^(?:(?:年度|年化|期间|区间)?收益率|return)$/iu].map(field);
        const [name,x,y] = fields;
        const commonUnit = /(?:单位均为百分比|单位(?:均)?为[%％]|单位[:：]\s*[%％])/u.test(request) ? '%' : undefined;
        const xLabel = /横轴(?:为|是)?\s*(年化波动率|波动率)/u.exec(request)?.[1] ?? labels[x];
        const yLabel = /纵轴(?:为|是)?\s*(年度收益率|年化收益率|收益率)/u.exec(request)?.[1] ?? labels[y];
        result = { ...base, xAxis:{label:xLabel,unit:unit(x)??commonUnit}, yAxis:{label:yLabel,unit:unit(y)??commonUnit},
            points:rows.map(row=>({label:row[name],x:row[x],y:row[y]})) };
    }
    if (fields.includes(-1) || !labels.every((label,index)=>fields.includes(index)||/^(?:id|编号|序号)$/iu.test(label))) return;
    result=normalizeChartMetadata(result);
    const provenance = nativeProvenance(result);
    if (!provenance.invalid && !chartDataIssue(provenance.data)) return result;
}

function financeChartFromMappedRecords(source, variant, request) {
    const declared = source.chartType ?? source.variant ?? (typeof source.type==='string'?source.type.replace(/^chart\./u,''):undefined);
    if (declared!==variant || !Array.isArray(source.data) || !source.data.length) return;
    const candle = variant==='candlestick';
    if(!candle&&!/横轴(?:为|是)?\s*(?:年化)?波动率[^。；\n]*纵轴(?:为|是)?\s*(?:年度|年化|期间|区间)?收益率/u.test(request))return;
    const keys = candle
        ? [source.xField,source.openField,source.highField,source.lowField,source.closeField,source.volumeField]
        : [source.labelField,source.xField,source.yField];
    if (keys.some(key=>typeof key!=='string'||!key) || new Set(keys).size!==keys.length ||
        !source.data.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&
            keys.every(key=>Object.hasOwn(row,key))&&Object.keys(row).every(key=>keys.includes(key)||key==='id'))) return;
    const declaredUnit = source.unit;
    const suffix = value => typeof value==='string'&&value.trim() ? '（'+value+'）' : '';
    const columns = candle
        ? ['日期',...['开','高','低','收'].map(name=>name+suffix(declaredUnit?.price)),'量'+suffix(declaredUnit?.volume)]
        : ['名称','波动率'+suffix(declaredUnit?.x),'收益率'+suffix(declaredUnit?.y)];
    const {version,title,asOf,note,sources}=source;
    return financeChartFromTable({type:'table',version,title,asOf,note,sources,
        ...(typeof source.source==='string'?{source:source.source}:{}),columns,rows:source.data.map(row=>keys.map(key=>row[key]))},variant,request);
}

function literalFinanceChart(source, variant, request) {
    const declared = source.type === 'chart' ? source.variant : source.type?.replace?.(/^chart\./u, '');
    if (declared !== variant || source.variant !== undefined && source.variant !== variant) return;
    let chart = { ...source, type:'chart', variant };
    if (variant === 'candlestick') {
        const {unit,volumeUnit,volume,...metadata} = chart;
        const price = /(?:开高低收|价格|OHLC)\s*[（(](元|美元|港元|点)[）)]/iu.exec(request)?.[1];
        const quantity = /(?:成交量|量)\s*[（(](股|万股|手|万手|份)[）)]/u.exec(request)?.[1];
        const paired = typeof unit === 'string' && price && quantity && unit === `${price}/${quantity}`;
        const named = unit && typeof unit === 'object' && !Array.isArray(unit) && Object.keys(unit).every(key => ['price','volume'].includes(key));
        const priceUnit = paired ? price : named ? unit.price : unit ?? price;
        const statedVolumeUnit = paired ? quantity : named ? unit.volume : undefined;
        if (volumeUnit && statedVolumeUnit && volumeUnit !== statedVolumeUnit) return;
        if (volume !== undefined && (volume !== true || !Array.isArray(chart.candles) || !chart.candles.every(row => Number.isFinite(row?.volume)))) return;
        chart = { ...metadata, unit:priceUnit, volumeUnit:volumeUnit ?? statedVolumeUnit ?? quantity };
    } else if (variant === 'scatter') {
        const {xAxis,yAxis,xLabel,yLabel,points,unit,...metadata} = chart;
        if (xAxis !== undefined && xLabel !== undefined || yAxis !== undefined && yLabel !== undefined || !Array.isArray(points)) return;
        const axis = (current, label) => {
            if (current) return unit === undefined || current.unit === undefined || current.unit === unit ? { ...current, unit:current.unit ?? unit } : undefined;
            if (typeof label !== 'string') return;
            const suffix = /^(.*?)\s*[（(]([^）()]+)[）)]$/u.exec(label);
            if (suffix && unit !== undefined && suffix[2] !== unit) return;
            return { label:suffix?.[1] ?? label, unit:suffix?.[2] ?? unit };
        };
        chart = { ...metadata, xAxis:axis(xAxis,xLabel), yAxis:axis(yAxis,yLabel), points:points.map(point => {
            if (!point || typeof point !== 'object' || !Object.hasOwn(point,'name')) return point;
            const { name, ...rest } = point;
            return rest.label === undefined || rest.label === name ? { ...rest,label:name } : point;
        }) };
    }
    chart = normalizeChartMetadata(chart);
    const provenance = nativeProvenance(chart);
    if (!provenance.invalid && !chartDataIssue(provenance.data)) return chart;
}

const specializedMarketVariants = ['waterfall', 'allocation-donut', 'risk-matrix'];

export function normalizeSpecializedMarketData(artifact) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return artifact;
    const typeAlias = typeof artifact.type === 'string' ? artifact.type.replace(/^market\./u, '') : '';
    const variant = artifact.variant ?? (specializedMarketVariants.includes(typeAlias) ? typeAlias : undefined);
    if (!specializedMarketVariants.includes(variant) ||
        !(artifact.type === 'market' || artifact.type === undefined || typeAlias === variant)) return artifact;
    if (artifact.type !== 'market' || artifact.version === '1') {
        artifact = { ...artifact, type: 'market', variant,
            ...(artifact.version === '1' ? { version: 1 } : {}) };
    }
    const items = artifact.items ?? (variant === 'waterfall' ? artifact.steps :
        variant === 'allocation-donut' ? artifact.segments : undefined);
    if (!Array.isArray(items)) return artifact;
    if (variant === 'waterfall' && artifact.start === undefined && artifact.changes === undefined && items.length >= 3) {
        const [start, ...steps] = items;
        const end = steps.pop();
        if (start?.kind !== 'total' || end?.kind !== 'total' ||
            !steps.every(step => ['increase', 'decrease', 'change', 'delta'].includes(step?.kind)) ||
            !items.every(row => typeof row.label === 'string' && Number.isFinite(row.value) &&
                (row.unit === undefined || row.unit === artifact.unit))) return artifact;
        const total = steps.reduce((balance, step) => Number((balance + step.value).toPrecision(12)), start.value);
        if (total !== end.value) throw Error('瀑布图的期末金额与期初金额加各期增减额不一致，请核对账簿。');
        const { items: recordedSteps, steps: namedSteps, ...metadata } = artifact;
        return { ...metadata, start: start.value, startLabel: start.label, endLabel: end.label,
            changes: steps.map(({ label, value }) => ({ label, value })) };
    }
    if (!['allocation-donut', 'risk-matrix'].includes(variant)) return artifact;
    if (variant === 'allocation-donut' && items.some(row => row?.unit !== undefined && row.unit !== artifact.unit))
        throw Error('配置环形图的各分类和总计必须使用同一单位，请保留账簿口径。');
    const axes = variant === 'risk-matrix' && /概率|likelihood|probability/iu.test(artifact.xAxis?.label ?? '') &&
        /影响|impact/iu.test(artifact.yAxis?.label ?? '') &&
        [artifact.xAxis, artifact.yAxis].every(axis => axis.min === 1 && axis.max === 5);
    const { segments, ...metadata } = artifact;
    return { ...metadata, items: items.map(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const label = row.label ?? row.name;
        return axes ? { ...row, label, probability: row.probability ?? row.x, impact: row.impact ?? row.y }
            : { ...row, label };
    }) };
}

export function preserveRequestedNativePresentation(panel, originalRequest) {
    const requested = requestedPresentation(panel, originalRequest);
    if (!requested || panel.library || panel.publicData || panel.profile || panel.requests) return panel;
    const [type, variant] = requested.split('.');
    const source = panel.artifact;
    const chartRequest=originalRequest+'\n'+panel.prompt;
    if(type==='table'&&(panel.type==='view'&&source?.type==='view'||panel.type==='market'&&source?.variant==='table'))return panel;
    if (source && type === 'chart' && ['candlestick','scatter'].includes(variant)) {
        const literal = literalFinanceChart(source,variant,chartRequest);
        if (literal) return { ...panel,type,artifact:literal };
    }
    if (panel.type === 'market' && (
        type === 'kpi' && ['metrics', 'fund-kpi'].includes(panel.artifact?.variant) ||
        variant === 'line' && panel.artifact?.variant === 'trend' ||
        ['candlestick','scatter'].includes(variant) && panel.artifact?.variant === variant
    )) return panel;
    if (panel.type === type && (!variant || panel.artifact?.variant === variant)) return panel;
    if (!source && panel.type !== 'view') {
        const prefix = type === 'market' ? 'variant: ' + variant : requested;
        return { ...panel, type,
            ...(variant && !panel.prompt.startsWith(prefix + '；') ? { prompt: prefix + '；' + panel.prompt } : {}) };
    }
    if (!source) return panel;
    const projected = type === 'chart' && ['candlestick','scatter'].includes(variant)
        ? financeChartFromTable(source,variant,chartRequest)??financeChartFromMappedRecords({...source,title:panel.title},variant,chartRequest)
        : type === 'chart' && basicChartTypes.includes(variant) ? chartFromTable(source, variant, panel.prompt)
        : type === 'kpi' && source.type === 'table' ? kpiFromTable(source)
        : type === 'table' ? tableFromChart(source) : undefined;
    if (projected) {
        const { view, ...planned } = panel;
        return { ...planned, type, artifact: projected };
    }
    if (type === 'chart' && source.type === 'chart' && basicChartTypes.includes(source.variant) &&
        (basicChartTypes.includes(variant)||variant==='groupedBar'&&source.series?.length>1)) {
        const ordered = variant==='groupedBar'&&Array.isArray(source.labels)&&source.labels.every(label=>/^\d{4}Q[1-4]$/u.test(label))
            ? source.labels.map((label,index)=>({label,index})).toSorted((a,b)=>a.label.localeCompare(b.label)) : undefined;
        const artifact = { ...source, variant, ...(ordered?{labels:ordered.map(row=>row.label),
            series:source.series.map(item=>({...item,values:ordered.map(row=>item.values[row.index])})),
            ...(source.detailRows?{detailRows:ordered.map(row=>source.detailRows[row.index])}:{})}:{}) };
        const provenance = nativeProvenance(artifact);
        if (!provenance.invalid && !chartDataIssue(provenance.data)) return { ...panel, artifact };
    }
    throw Error(`面板「${panel.title}」需使用用户指定的原生 ${requested}。保留已取得的原值、单位和来源，只修正本卡类型和数据映射，不能用另一种卡替代。`);
}
