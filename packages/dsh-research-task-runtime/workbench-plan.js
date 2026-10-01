import {KPI_GUIDANCE,kpiDataIssue} from './kpi-template-contract.js';
import {CALENDAR_GUIDANCE} from './calendar-template-contract.js';
import { researchBentoSize } from './bento-layout.js';
import { resolveWorkbenchSamples } from './workbench-shared-samples.js';
import {chartDataIssue,chartTemplateSchema,requestedChartVariant,requireSimulatedChartData} from './chart-template-contract.js';
import { templateFor } from './component-template-registry.js';
import {operationsDataIssue,operationsTemplateSchema} from './operations-template-contract.js';
import {FINANCIAL_PROFILE_VARIANTS,FINANCIAL_PROFILE_FIELDS,financialProfileDataIssue} from './financial-profile.js';
import { acceptArtifactOutput, workbenchMarketRecencyIssue } from './artifact-output.js';
import { marketVariant, workbenchDesignTemplate } from './workbench-design-contract.js';
import { expandSimulatedWorkbenchPreset } from './simulated-workbench-presets.js';
export const PANEL_SIZES = { small: 220, medium: 220, large: 456 };
const panelSize = p => Object.hasOwn(PANEL_SIZES, p.size) ? p.size : researchBentoSize(p);
export const WORKBENCH_PANEL_TYPES = Object.freeze(['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard', 'market', 'gantt', 'progress', 'tasks', 'approval', 'alerts', 'form', 'code', 'clock', 'note', 'rss']);
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const preparedTypes = new Set(['chart', 'table', 'kpi', 'dashboard', 'news', 'reports', 'calendar', 'market', 'gantt', 'progress', 'tasks', 'approval', 'alerts', 'form', 'code', 'clock', 'note', 'rss']);
const simulated = value => /模拟|演示/u.test(value ?? '');
const explicitMetricValue = value => /(?:^|[（(、，,;；\s])\p{Script=Han}{2,12}\s*[:：]?\s*[+-]?\d+(?:\.\d+)?\s*(?:次|项|条|人|元|%|个|篇|家|亿元|万)?(?=$|[、，,;；）)\s])/u.test(value ?? '');
const schemaHints = {
    dashboard: 'dashboard 应包含 asOf 和 items:[{label,value:"带单位的字符串",detail?}]（也接受 metrics 中的数值和 unit）。',
    chart: chartTemplateSchema(),
    table: 'table 应包含 columns:[列名] 和 rows:[[单元格]]，每行列数一致。',
    kpi: KPI_GUIDANCE,
    market: 'market 应包含 variant、asOf 和对应数据；metrics 用 items:[{label,value}]，trend 用等长 labels/series.values，量价联动用 price-volume 的等长 labels/prices/volumes 与 priceUnit/volumeUnit，盘口用 order-book 的 bids/asks 与 priceUnit/sizeUnit，资金流向用 fund-flow 的 records:[{period,industry,inflow,outflow}] 与 unit，估值分位带用 valuation-band 的等长 labels/values 与 bands:{p10,p25,p50,p75,p90}，净值回撤用 equity-drawdown 的等长 labels/equity/benchmark 与 unit，配置占比用 allocation-donut 的 items:[{label,value}] 与 unit，瀑布图用 waterfall 的 start/changes:[{label,value}]/unit，漏斗用 funnel 的 stages:[{label,count}]，风险矩阵用 risk-matrix 的 items:[{label,probability,impact,detail?}]，table 用等宽 columns/rows；医药侧图、管线、事件依次用 scatter 的 xLabel/yLabel/items、pipeline 的 stages/items、events 的 items；基金三件套分别用 fund-kpi items、fund-holdings columns/rows、fund-industry items:[{label,weight,benchmark}]。',
    news: 'news 应包含 items:[{title,summary,date?,category?}]。',
    reports: 'reports 应包含 items:[{title,summary,date?,category?}]。',
    calendar: CALENDAR_GUIDANCE,
    gantt: 'gantt 应包含 asOf 和 items:[{label,start:"YYYY-MM-DD",end:"YYYY-MM-DD",progress?:0–100,owner?}]。'
};
const metricValue = metric => {
    if (!metric || (typeof metric.value !== 'string' && !(typeof metric.value === 'number' && Number.isFinite(metric.value)))) return metric?.value;
    return `${metric.value}${str(metric.unit, 40) ? ` ${metric.unit}` : ''}`;
};
const percentIn = (value, label) => {
    const match = typeof value === 'string' && value.match(new RegExp(label + '\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*%'));
    return match ? Number(match[1]) : null;
};
function fundTemplatePanel(panel, workbenchTitle) {
    if (!/基金/u.test(`${workbenchTitle}\n${panel.title}`) || !panel.artifact || typeof panel.artifact !== 'object') return null;
    const source = panel.artifact;
    const intent = panel.title + '\n' + panel.prompt;
    const base = { version: 1, type: 'market', title: source.title ?? panel.title,
        asOf: source.asOf ?? '模拟数据 · 时点未提供' };
    let artifact;
    if (/行业.{0,8}(?:暴露|偏离)|(?:暴露|偏离).{0,8}行业/u.test(intent)) {
        if (!Array.isArray(source.items)) throw Error(`面板「${panel.title}」应提供行业权重和基准权重，不能降级成普通指标卡。`);
        artifact = { ...base, variant: 'fund-industry', items: source.items.map(item => ({
            label: item?.label,
            weight: Number.isFinite(item?.weight) ? item.weight : percentIn(item?.detail, '组合权重'),
            benchmark: Number.isFinite(item?.benchmark) ? item.benchmark : percentIn(item?.detail, '基准')
        })) };
        if (artifact.items.some(item => !Number.isFinite(item.weight) || !Number.isFinite(item.benchmark)))
            throw Error(`面板「${panel.title}」缺少行业组合权重或基准权重，请提交 items:[{label,weight,benchmark}]。`);
    } else if (/穿透持仓|持仓明细|重叠暴露/u.test(intent) && Array.isArray(source.columns)) {
        artifact = { ...base, variant: 'fund-holdings', columns: source.columns, rows: source.rows,
            ...(source.period ? { period: source.period } : {}) };
    } else if (/组合风险|持仓概览|穿透概览|基金.{0,8}指标/u.test(intent) && Array.isArray(source.items ?? source.metrics)) {
        const items = normalizeMetrics(source.items ?? source.metrics, 'dashboard');
        artifact = { ...base, variant: 'fund-kpi', items: items.map(item => ({
            label: item?.label, value: item?.value, ...(item?.detail ? { detail: item.detail } : {})
        })) };
    } else return null;
    return { ...panel, type: 'market', prompt: `variant: ${artifact.variant}；${panel.prompt}`, artifact };
}
// Simulated financial plans often arrive as generic KPI/chart/table objects.
// Normalize them before a node is created, so a valid plan cannot silently
// fall back to the unrelated generic card renderer.
function financialTemplatePanel(panel, workbenchTitle) {
    if (!/金融|股票|证券|股市|A股|指数|行情|基金|贵金属|黄金|白银|交易|沪深|港股/u.test(`${workbenchTitle}\n${panel.title}`)) return panel;
    const fund = fundTemplatePanel(panel, workbenchTitle);
    if (fund) return fund;
    const source = panel.artifact;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return panel;
    const base = { version: 1, type: 'market', title: source.title ?? panel.title,
        asOf: source.asOf ?? '模拟数据 · 时点未提供' };
    let artifact;
    if (panel.type === 'dashboard' || panel.type === 'kpi') {
        const raw = source.items ?? source.metrics;
        if (!Array.isArray(raw) || raw.length > 12) throw Error(`面板「${panel.title}」的金融指标需拆成最多 12 项的独立组件。`);
        artifact = { ...base, variant: 'metrics', items: normalizeMetrics(raw, 'dashboard').map((item, index) => ({
            label: item?.label, value: item?.value,
            ...((raw[index]?.change ?? item?.detail) ? { detail: raw[index]?.change ?? item?.detail } : {})
        })) };
    } else if (panel.type === 'table') {
        artifact = { ...base, variant: 'table', columns: source.columns, rows: source.rows };
    } else if (panel.type === 'chart') {
        if (source.variant !== 'line') return panel;
        artifact = { ...base, variant: 'trend', labels: source.labels, series: source.series };
    } else return panel;
    return { ...panel, type: 'market', prompt: `variant: ${artifact.variant}；${panel.prompt}`, artifact };
}
function normalizeMetrics(metrics, type) {
    return metrics.map(metric => {
        if (!metric || typeof metric !== 'object') return metric;
        const change = [Number.isFinite(metric.delta) ? `变动 ${metric.delta}${str(metric.unit, 40) ? ` ${metric.unit}` : ''}` : '', Number.isFinite(metric.deltaPct) ? `变动比例 ${metric.deltaPct}（原始模拟值）` : ''].filter(Boolean).join(' · ');
        if (type === 'kpi') return {...metric,label:metric.label,value:metric.value,...(change&&!metric.change?{change}:{})};
        const detail = [str(metric.detail, 2000) ? metric.detail : '', change].filter(Boolean).join(' · ');
        return { label: metric.label, value: metricValue(metric), ...(detail ? { detail } : {}) };
    });
}
function normalizeSimulatedMarketData(artifact) {
    if (artifact.type !== 'market') return;
    // Preserve supplied values while accepting the names models commonly use
    // for the same fields. Source-backed data remains on the strict path.
    if (artifact.variant === 'scatter' && Array.isArray(artifact.items)) {
        artifact.items = artifact.items.map(item => {
            if (!item || typeof item !== 'object') return item;
            const number = value => typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : value;
            return { ...item, label: item.label ?? item.name ?? item.company, x: number(item.x), y: number(item.y),
                ...(item.size !== undefined ? { size: number(item.size) } : {}) };
        });
    }
    if (artifact.variant === 'pipeline' && Array.isArray(artifact.items)) {
        if (!artifact.stages && Array.isArray(artifact.phases)) artifact.stages = artifact.phases;
        artifact.items = artifact.items.map(item => {
            if (!item || typeof item !== 'object') return item;
            const phase = item.stage ?? item.phase;
            const matched = typeof phase === 'string' && Array.isArray(artifact.stages)
                ? artifact.stages.findIndex(v => String(v).replace(/\s/gu, '') === phase.replace(/\s/gu, '')) : -1;
            const stage = typeof phase === 'string' && /^\d+$/u.test(phase.trim()) ? Number(phase)
                : matched >= 0 ? matched + 1 : phase;
            return { ...item, name: item.name ?? item.project ?? item.drug,
                target: item.target ?? item.targetName,
                stage, nextDate: item.nextDate ?? item.next ?? item.date };
        });
    }
    if (artifact.variant === 'events' && Array.isArray(artifact.items)) {
        artifact.items = artifact.items.map(item => item && typeof item === 'object' ? {
            ...item, object: item.object ?? item.subject ?? item.company,
            focus: item.focus ?? item.observation_focus ?? item.summary,
            window: item.window ?? item.impact_window,
            status: item.status ?? item.state
        } : item);
    }
    if (['table', 'fund-holdings'].includes(artifact.variant) && Array.isArray(artifact.columns) && Array.isArray(artifact.rows)) {
        artifact.rows = artifact.rows.map(row => {
            if (!Array.isArray(row) || row.length === artifact.columns.length) return row;
            const cells = row.flatMap(cell => Array.isArray(cell) ? cell : [cell]);
            return cells.length === artifact.columns.length && cells.every(cell => typeof cell === 'string' || Number.isFinite(cell)) ? cells : row;
        });
    }
    if (artifact.variant !== 'trend' || !Array.isArray(artifact.labels) || !Array.isArray(artifact.series)) return;
    const count = artifact.labels.length;
    if (count < 12 || count > 60) return;
    const repaired = [];
    for (const item of artifact.series) {
        const values = item?.values;
        if (!Array.isArray(values) || values.length !== count - 1 || !values.every(Number.isFinite)) continue;
        item.values = Array.from({ length: count }, (_, index) => {
            const position = index * (values.length - 1) / (count - 1);
            const left = Math.floor(position), right = Math.ceil(position);
            return Number((values[left] + (values[right] - values[left]) * (position - left)).toFixed(4));
        });
        repaired.push(item.name);
    }
    if (repaired.length) artifact.note = [artifact.note, `模拟数据补点：${repaired.join('、')}序列由等距线性插值补齐。`].filter(Boolean).join(' · ');
}
function normalizeSimulatedCalendar(artifact) {
    if (artifact.type !== 'calendar' || !Array.isArray(artifact.items)) return;
    artifact.items = artifact.items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const result = { ...item };
        const dateTime = typeof result.date === 'string' && result.date.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/u);
        if (dateTime && !result.time) { result.date = dateTime[1]; result.time = dateTime[2]; }
        if (!result.summary) result.summary = [
            result.object && `对象：${result.object}`,
            result.observation_focus && `观察重点：${result.observation_focus}`,
            result.impact_window && `影响窗口：${result.impact_window}`,
            result.status && `状态：${result.status}`
        ].filter(Boolean).join(' · ');
        return result;
    });
}
function simulatedArtifactProblem(artifact) {
    if (!artifact || typeof artifact !== 'object') return '需提交包含 version:1、type、title 和对应模板数据字段的对象。';
    if (artifact.type === 'market' && FINANCIAL_PROFILE_VARIANTS.includes(artifact.variant)) return `${financialProfileDataIssue(artifact) ?? ''}。${FINANCIAL_PROFILE_FIELDS[artifact.variant]}`;
    if (['progress','tasks','approval','alerts','form','code','clock','note','rss'].includes(artifact.type)) return `${operationsDataIssue(artifact) ?? ''}。${operationsTemplateSchema(artifact.type)}`;
    if (artifact.type === 'kpi') return `${kpiDataIssue(artifact) ?? ''}。${KPI_GUIDANCE}`;
    if (artifact.type === 'chart') {
        const template = templateFor(artifact);
        const issue = chartDataIssue(artifact);
        return `${issue ? issue + '。' : ''}${template?.schema ?? chartTemplateSchema()}；保留已提供的数据，仅修正上述字段后重试。`;
    }
    if (artifact.type === 'market' && artifact.variant === 'scatter' && Array.isArray(artifact.items)) {
        const index = artifact.items.findIndex(i => !str(i?.label, 200) || !Number.isFinite(i?.x) || !Number.isFinite(i?.y));
        if (index !== -1) return `散点第${index + 1}项需有 label、有限数值 x 和 y（允许负值）；已提供的 name/company 可作为 label。`;
    }
    if (artifact.type === 'market' && artifact.variant === 'pipeline' && Array.isArray(artifact.items)) {
        if (!Array.isArray(artifact.stages) || artifact.stages.length < 2) return '管线需有至少两个公共阶段名 stages；可将 phases 作为别名。';
        const index = artifact.items.findIndex(i => !str(i?.name, 200) || !str(i?.target, 200) || !Number.isInteger(i?.stage) || i.stage < 0 || i.stage > artifact.stages.length || !str(i?.nextDate, 200));
        if (index !== -1) return `管线第${index + 1}项需有项目名 name、靶点 target、已达阶段数 stage（0 至 ${artifact.stages.length}）及下一节点 nextDate。`;
    }
    if (artifact.type === 'market' && artifact.variant === 'events' && Array.isArray(artifact.items)) {
        const required = ['date','object','event','focus','window','status'];
        const index = artifact.items.findIndex(i => required.some(k => !str(i?.[k], 200)));
        if (index !== -1) return `事件第${index + 1}项缺少 ${required.filter(k => !str(artifact.items[index]?.[k], 200)).join('、')}；观察重点和影响窗口可用 observation_focus、impact_window。`;
    }
    if (artifact.type === 'market' && artifact.variant === 'trend' && Array.isArray(artifact.labels) && Array.isArray(artifact.series)) {
        const mismatch = artifact.series.find(item => !Array.isArray(item?.values) || item.values.length !== artifact.labels.length);
        if (mismatch) return `趋势序列「${mismatch.name ?? '未命名'}」有 ${mismatch.values?.length ?? 0} 个值，横轴有 ${artifact.labels.length} 个时点；请只修正该序列。`;
    }
    if (artifact.type === 'market' && ['table', 'fund-holdings'].includes(artifact.variant) && Array.isArray(artifact.columns) && Array.isArray(artifact.rows)) {
        const index = artifact.rows.findIndex(row => !Array.isArray(row) || row.length !== artifact.columns.length);
        if (index !== -1) return `表格第${index + 1}行有 ${artifact.rows[index]?.length ?? 0} 个单元格，列标题有 ${artifact.columns.length} 列；请只修正该行。`;
    }
    if (artifact.type === 'calendar' && Array.isArray(artifact.items)) {
        const index = artifact.items.findIndex(item => item && !item.summary && !item.url);
        if (index !== -1) return `日历第${index + 1}项缺少可显示的摘要；请补 summary 或对象与观察重点。`;
    }
    return schemaHints[artifact.type] ?? '需提交已注册模板的结构化数据对象。';
}
export function prepareSimulatedArtifact(panel) {
    const source = panel.artifact;
    if (!source || typeof source !== 'object' || Array.isArray(source) || !preparedTypes.has(panel.type) || (source.type !== undefined && source.type !== panel.type) || (source.version !== undefined && source.version !== 1))
        throw Error(`面板「${panel.title}」的模拟数据格式或模板无效。`);
    if (Buffer.byteLength(JSON.stringify(source), 'utf8') > 64_000)
        throw Error(`面板「${panel.title}」的模拟数据过长。`);
    // Simulated data must never smuggle invented citations into a trusted host template.
    const hasLink = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) =>
        key === 'url' || key === 'sources' || (item && typeof item === 'object' && hasLink(item)));
    // Local calendars and KPI cards may reference user-supplied documents alongside
    // virtual records. Their strict URL contracts and simulated label remain active;
    // preserve those fields without fetching or inventing a citation.
    if (!['calendar','kpi'].includes(panel.type) && hasLink(source)) throw Error(`面板「${panel.title}」的模拟数据不能包含外部链接。`);
    const artifact = structuredClone(source);
    artifact.version = 1;
    artifact.type = panel.type;
    if (artifact.type === 'market' && !artifact.variant) {
        // The input schema permits an omitted variant. The data shape and panel
        // intent identify a single host template without another model retry.
        artifact.variant = Array.isArray(artifact.candles) ? 'candlestick'
            : Array.isArray(artifact.labels) && Array.isArray(artifact.series) ? 'trend'
                : (Array.isArray(artifact.stages) || Array.isArray(artifact.phases)) && Array.isArray(artifact.items) ? 'pipeline'
                    : str(artifact.xLabel, 200) && str(artifact.yLabel, 200) && Array.isArray(artifact.items) ? 'scatter'
                        : Array.isArray(artifact.items) && artifact.items.some(item => item?.date && item?.event && (item?.focus || item?.observation_focus)) ? 'events'
                : Array.isArray(artifact.columns) && Array.isArray(artifact.rows) ? 'table'
                    : Number.isSafeInteger(artifact.advancing) ? 'breadth'
                        : Array.isArray(artifact.items) && artifact.items.every(item => Number.isFinite(item?.weight) && Number.isFinite(item?.change)) ? 'heatmap'
                            : Array.isArray(artifact.items) ? 'metrics' : marketVariant(panel);
    }
    normalizeSimulatedMarketData(artifact);
    normalizeSimulatedCalendar(artifact);
    if (['dashboard', 'kpi'].includes(artifact.type) && artifact.items === undefined && Array.isArray(artifact.metrics)) {
        artifact.items = normalizeMetrics(artifact.metrics, artifact.type);
        delete artifact.metrics;
    }
    // Native canvas schemas are exact-key contracts. Keep the data fields and
    // carry a supplied snapshot time into the visible title when applicable.
    if (artifact.type === 'table') {
        const allowed = { chart: ['version', 'type', 'title', 'variant', 'labels', 'series'], table: ['version', 'type', 'title', 'columns', 'rows'], kpi: ['version', 'type', 'title', 'items'] }[artifact.type];
        const asOf = str(artifact.asOf, 80) ? artifact.asOf : undefined;
        for (const key of Object.keys(artifact)) if (!allowed.includes(key)) delete artifact[key];
        if (asOf && !panel.title.includes(asOf) && panel.title.length + asOf.length + 9 <= 80)
            artifact.title = `${panel.title} · ${asOf}`;
    }
    artifact.title = simulated(artifact.title ?? panel.title) ? (artifact.title ?? panel.title) : `${artifact.title ?? panel.title}（模拟）`;
    if (artifact.title.length > 80) throw Error(`面板「${panel.title}」的标题过长，无法标注模拟。`);
    if (['market', 'dashboard'].includes(artifact.type)) {
        if (!str(artifact.asOf, 256)) throw Error(`面板「${panel.title}」缺少模拟数据时点。`);
        if (!simulated(artifact.asOf)) artifact.asOf = `模拟数据 · ${artifact.asOf}`;
    }
    if (['news', 'reports', 'calendar'].includes(artifact.type) && Array.isArray(artifact.items))
        artifact.items = artifact.items.map(item => ({ ...item, category: simulated(item.category) ? item.category : `模拟 · ${item.category || '信息'}` }));
    if (!acceptArtifactOutput(JSON.stringify(artifact))) throw Error(`面板「${panel.title}」的模拟数据格式无效。${simulatedArtifactProblem(artifact)}`);
    return artifact;
}
export function validateWorkbench(value) {
    value = expandSimulatedWorkbenchPreset(value);
    if (value && value.panels === undefined)
        throw Error('缺少工作台内容参数：不能只传 title。标准模拟工作台请完整提交 {"title":"工作台标题","dataMode":"simulated","preset":"medical-21h"}（另有 market-overview-21h、research-operations-21m）；其他需求必须提供 1–10 个 panels，每项包含 title、prompt、type、size。preset 是工具参数，不是文件路径。请按用户需求补齐参数后重试，不要重复原调用。');
    if (!value || !str(value.requestId, 100) || !str(value.title, 100) || !Array.isArray(value.panels) || value.panels.length < 1 || value.panels.length > 10)
        throw Error('工作台需要 1–10 个独立面板。');
    if (value.dataMode !== undefined && !['simulated', 'source'].includes(value.dataMode)) throw Error('工作台数据模式无效。');
    const isSimulated = value.dataMode === 'simulated';
    const parallel = value.generationMode === 'parallel';
    if (value.generationMode !== undefined && !parallel) throw Error('工作台生成模式无效。');
    if (parallel && !isSimulated) throw Error('并行模拟生成仅适用于模拟数据工作台。');
    const seen = new Set();
    const panels = resolveWorkbenchSamples(value.panels).map(p => {
        if (!p || !str(p.title, 80) || !str(p.prompt, 5000) || !WORKBENCH_PANEL_TYPES.includes(p.type) || (!Object.hasOwn(PANEL_SIZES, p.size) && (!Number.isInteger(p.height) || p.height < 220 || p.height > 1200)) || seen.has(p.title.trim()))
            throw Error('面板标题、内容类型或规划尺寸无效。');
        seen.add(p.title.trim());
        // Correct a metadata-only planner mismatch before launching a child.
        // Existing supplied data remains subject to its original schema.
        if (!p.artifact && p.type === 'market' && /柱状图|条形图/iu.test(p.title) && !/行业|配置|资金流/u.test(p.title))
            p = {...p,type:'chart',prompt:`chart.bar；${p.prompt.replace(/variant\s*[:：=]\s*metrics/iu,'')}`};
        // A planner may include the selected template with empty data arrays.
        // That is a pending fetch, not a completed artifact. Never discard even
        // one supplied observation, date or note under this narrow recovery.
        const draft=p.artifact;
        const emptyFields=['items','labels','series','columns','rows','candles'];
        if(!isSimulated&&p.type==='market'&&draft?.version===1&&draft.type==='market'&&templateFor(draft)&&
            (draft.asOf===undefined||typeof draft.asOf==='string'&&!draft.asOf.trim())&&
            Object.keys(draft).every(key=>['version','type','variant','title','asOf',...emptyFields].includes(key))&&
            emptyFields.some(key=>Array.isArray(draft[key]))&&
            emptyFields.every(key=>draft[key]===undefined||Array.isArray(draft[key])&&draft[key].length===0)) {
            const {artifact,...planned}=p;
            p={...planned,prompt:`variant: ${draft.variant}；${p.prompt}`};
        }
        const requestsCandlestick = /K\s*线|蜡烛图|candlestick/iu.test(p.title) ||
            (p.type === 'chart' && /(?:绘制|显示|生成|展示|画).{0,12}(?:K\s*线|蜡烛图|candlestick)/iu.test(p.prompt));
        const chartVariant = p.type === 'chart' ? p.artifact?.variant ?? requestedChartVariant(`${p.title} ${p.prompt}`) : null;
        if (requestsCandlestick && !(p.type === 'market' && marketVariant(p) === 'candlestick') && chartVariant !== 'candlestick')
            throw Error(`面板「${p.title}」必须使用 market.candlestick 或 chart.candlestick 和完整 OHLC/成交量数据，不能降级为折线图。`);
        if (/OHLC\s*(?:图|走势)/iu.test(p.title) && chartVariant !== 'ohlc')
            throw Error(`面板「${p.title}」必须使用 chart.ohlc，绘制高低竖线与左开右收刻度；保留完整 OHLC/成交量数据，不能用蜡烛图替代。`);
        if (!isSimulated && p.artifact !== undefined) {
            if (!templateFor(p.artifact) || p.artifact.type !== p.type || !acceptArtifactOutput(JSON.stringify(p.artifact))) throw Error(`面板「${p.title}」的真实数据格式无效。${simulatedArtifactProblem(p.artifact)} 请复用已取得的数据，只修正字段格式，不重新取数或编写 HTML。`);
            const issue = workbenchMarketRecencyIssue(JSON.stringify(p.artifact), p.prompt);
            if (issue) throw Error(issue);
        }
        if (parallel && p.artifact !== undefined) throw Error('并行模拟生成只提交面板规划，不提交 artifact。');
        if (isSimulated && !parallel && p.artifact === undefined && ['dashboard', 'kpi'].includes(p.type) && explicitMetricValue(`${p.title} ${p.prompt}`))
            throw Error(`面板「${p.title}」已给出具体指标数值，请在 artifact.items 中逐项提交原数值与单位；不能以通用模拟模板数值替代。`);
        if (isSimulated && !parallel) requireSimulatedChartData(p);
        if (isSimulated && !parallel && p.type === 'market' && FINANCIAL_PROFILE_VARIANTS.includes(marketVariant(p)) && p.artifact === undefined)
            throw Error(`面板「${p.title}」需要完整 artifact 中的证券、指标或成员记录；不能生成无关金融样例。${FINANCIAL_PROFILE_FIELDS[marketVariant(p)]}`);
        if (isSimulated && ['progress','tasks','approval','alerts','form','code','clock','note','rss'].includes(p.type) && p.artifact === undefined)
            throw Error(`面板「${p.title}」需要完整 artifact ${p.type==='clock'?'时区配置；live设备时钟同样需要明确城市和IANA时区':'中的实际需求记录；不能生成无关清单或进度样例'}。${operationsTemplateSchema(p.type)}`);
        const selected = isSimulated ? financialTemplatePanel(p, value.title) : p;
        const artifact = isSimulated && !parallel && selected.artifact !== undefined ? prepareSimulatedArtifact(selected) : !isSimulated && selected.artifact !== undefined ? structuredClone(selected.artifact) : undefined;
        const panel = { title: artifact?.title ?? selected.title.trim(), prompt: selected.prompt.trim(), type: selected.type, size: panelSize(selected), height: PANEL_SIZES[panelSize(selected)], ...(artifact ? { artifact } : {}) };
        workbenchDesignTemplate(panel);
        return panel;
    });
    if (Buffer.byteLength(JSON.stringify(panels), 'utf8') > 256_000) throw Error('工作台结构化数据总量过长。');
    const title = isSimulated && !simulated(value.title) ? `${value.title.trim()}（模拟）` : value.title.trim();
    if (title.length > 100) throw Error('工作台标题过长，无法标注模拟。');
    return { requestId: value.requestId.trim(), title, ...(value.dataMode ? { dataMode: value.dataMode } : {}), ...(parallel ? { generationMode: 'parallel' } : {}), panels };
}
export function layoutWorkbench(panels, canvasSize = { width: 1380, height: 900 }) {
    // Keep plan order in two fixed columns. A shelf layout could wrap a wide
    // finance card alone and place later cards at unrelated horizontal offsets.
    const sized = panels.map(p => {
        const template = workbenchDesignTemplate(p);
        return { ...p, size: template.size, width: template.width, height: template.height };
    });
    const leftWidth = Math.max(0, ...sized.filter((_, i) => i % 2 === 0).map(p => p.width));
    let y = 0;
    return sized.map((p, index) => {
        if (index && index % 2 === 0) y += Math.max(sized[index - 2].height, sized[index - 1].height) + 16;
        return { ...p, x: index % 2 ? leftWidth + 16 : 0, y };
    });
}

export function workbenchPanelPrompt(input, p) {
    const template = workbenchDesignTemplate(p);
    const origin = ['chart','reports','news','gantt'].includes(p.type) ? 'Figma 组件族参考' : 'Figma 节点';
    return `工作台：${input.title}\n本面板：${p.title}\n${p.prompt}\n仅生成本面板，优先使用 ${p.type} 类型。${input.dataMode === 'simulated' ? '只使用明确标注的虚构模拟数据；不得检索外部资料、引用真实行情或伪造链接。' : ''}宿主设计合同 ${template.version}/${template.id}，${origin} ${template.figma}；目标内容尺寸 ${template.width}×${template.height}。${p.type === 'market' ? `必须输出 market.${template.variant} 的结构化数据；金融趋势用同单位、同纵轴的 trend 序列，不要混入右轴百分比；K线单标的用 candles，多标的用 datasets，成交量缺失填 null，均不得用通用 chart 或自写 HTML 替代。` : ''}${p.type === 'chart' ? `必须输出 ${'chart.'+(p.artifact?.variant??requestedChartVariant(p.title+' '+p.prompt)??'line')} 的结构化数据。按对应图表契约填写；坐标图的labels与series.values等长，层级/分布/目标图用各自字段。` : ''}组件样式、深浅主题、字体和几何由宿主模板负责；仅提交数据，不自造视觉样式。用户手动框保持原宽高，不裁切、折叠或隐藏主要字段。不要在正文重复宿主面板标题。来源、日期与单位就近标注；缺失数据明确说明，不伪造实时数据或声称已开启持续监控。`;
}
