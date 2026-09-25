import { marketVariant } from './workbench-design-contract.js';
import { expandSimulatedWorkbenchPreset } from './simulated-workbench-presets.js';

// The planner chooses the information architecture. For a simulated board the
// host supplies bounded, clearly fictional data and renders it locally; no
// second model call is needed for each card.
const examples = ['medical-21h', 'market-overview-21h', 'research-operations-21m']
    .flatMap(preset => expandSimulatedWorkbenchPreset({ dataMode: 'simulated', preset }).panels);
const asOf = '2026-06-30 15:00 · 模拟数据';
const subjectOf = title => title.replace(/（模拟）|模拟数据|工作台|研究|监控|验证|可视化/gu, '').trim() || '研究样本';
const clone = value => structuredClone(value);
const numberWords = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function requestedCount(intent, unit, maximum) {
    const match = intent.match(new RegExp(`([\\d一二两三四五六七八九十]{1,4})\\s*(?:个)?\\s*(?:${unit})`, 'u'));
    if (!match) return null;
    const chinese = match[1].split('十');
    const value = /^\d+$/u.test(match[1]) ? Number(match[1])
        : chinese.length === 2 ? (chinese[0] ? numberWords[chinese[0]] : 1) * 10 + (chinese[1] ? numberWords[chinese[1]] : 0)
            : numberWords[match[1]];
    return Number.isInteger(value) && value >= 1 && value <= maximum ? value : null;
}
function simulatedSeries(series, count) {
    return series.map((item, seriesIndex) => ({ ...item, values: Array.from({ length: count }, (_, index) =>
        index < item.values.length ? item.values[index]
            : +(item.values.at(-1) + (index - item.values.length + 1) * (seriesIndex ? .6 : .8) + Math.sin(index) * .5).toFixed(2)) }));
}
const sample = (type, variant) => {
    const found = examples.find(panel => panel.type === type && (type !== 'market' || panel.artifact.variant === variant));
    if (!found) throw Error(`模拟组件类型 ${type}${variant ? `.${variant}` : ''} 暂无宿主模板。`);
    return clone(found.artifact);
};
const fundKpiSamples = [
    { label: '模拟单位净值', value: '1.2864 元', detail: '虚构基金样本 · 复权口径', match: /单位净值|基金净值/u },
    { label: '近一年收益', value: '+12.8%', detail: '模拟近 12 个月累计收益', match: /收益/u },
    { label: '年化波动率', value: '15.6%', detail: '模拟日收益率标准差按 252 个交易日折算', match: /波动/u },
    { label: '最大回撤', value: '-8.4%', detail: '模拟窗口 2025-07-01 至 2026-06-30；以日频复权单位净值计算 max(1−当日净值/此前最高净值)。样本未提供峰谷日期及修复天数；分红按复权处理，未计申赎费用。', match: /回撤/u },
    { label: '夏普比率', value: '0.82', detail: '模拟收益率与模拟无风险利率比较', match: /夏普/u },
    { label: '基金规模', value: '28.6 亿元', detail: '虚构期末资产净值', match: /基金规模|资产规模/u }
];
function simulatedFundKpis(intent) {
    const scope = intent.split(/(?:完整|详细)?(?:计算|统计)?口径|公式|定义|说明/u)[0];
    const selected = fundKpiSamples.filter(item => item.match.test(scope));
    return (selected.length ? selected : fundKpiSamples).map(({ label, value, detail }) => ({ label, value, detail }));
}

export function generateSimulatedPanel(panel, workbenchTitle) {
    if (panel.artifact) return panel;
    // Planners sometimes call a financial template by its generic canvas type.
    // Preserve the requested fixed template before choosing sample data.
    if (['kpi', 'table'].includes(panel.type)) {
        const variant = marketVariant(panel);
        if (['fund-kpi', 'fund-holdings', 'fund-industry'].includes(variant))
            return generateSimulatedPanel({ ...panel, type: 'market', prompt: `variant: ${variant}；${panel.prompt}` }, workbenchTitle);
    }
    const subject = subjectOf(workbenchTitle);
    const intent = `${panel.title}\n${panel.prompt}`;
    let artifact;
    if (panel.type === 'market') {
        const variant = marketVariant(panel);
        artifact = variant === 'price-volume' ? {
            version: 1, type: 'market', variant, priceUnit: '元', volumeUnit: '股',
            labels: Array.from({ length: 65 }, (_, index) => `模拟交易日 ${index + 1}`),
            prices: Array.from({ length: 65 }, (_, index) => +(100 + index * .18 + Math.sin(index / 4) * 1.5).toFixed(2)),
            volumes: Array.from({ length: 65 }, (_, index) => 9000 + (index * 317) % 5300)
        } : variant === 'order-book' ? {
            version: 1, type: 'market', variant, priceUnit: '元', sizeUnit: '股',
            bids: Array.from({ length: 10 }, (_, index) => ({ price: +(108.66 - index * .01).toFixed(2), size: 900 + index * 120 })),
            asks: Array.from({ length: 10 }, (_, index) => ({ price: +(108.67 + index * .01).toFixed(2), size: 1100 + index * 90 }))
        } : variant === 'fund-flow' ? {
            version: 1, type: 'market', variant, unit: '亿元',
            records: ['科技', '消费', '金融', '医药', '工业'].flatMap((industry, index) => [
                { period: '模拟本周', industry, inflow: 18 + index * 4, outflow: 14 + index * 3 },
                { period: '模拟上周', industry, inflow: 12 + index * 3, outflow: 16 + index * 2 }
            ])
        } : variant === 'valuation-band' ? {
            version: 1, type: 'market', variant, unit: '倍',
            labels: Array.from({ length: 65 }, (_, index) => `模拟交易日 ${index + 1}`),
            values: Array.from({ length: 65 }, (_, index) => +(20 + index * .035 + Math.sin(index / 5) * 2.1).toFixed(2)),
            bands: { p10: 17.8, p25: 19.2, p50: 21.1, p75: 23.3, p90: 24.8 }
        } : variant === 'equity-drawdown' ? {
            version: 1, type: 'market', variant, unit: '元',
            labels: Array.from({ length: 65 }, (_, index) => `模拟交易日 ${index + 1}`),
            equity: Array.from({ length: 65 }, (_, index) => +(1 + index * .003 + Math.sin(index / 6) * .025).toFixed(4)),
            benchmark: Array.from({ length: 65 }, (_, index) => +(1 + index * .002 + Math.sin(index / 8) * .012).toFixed(4))
        } : variant === 'allocation-donut' ? {
            version: 1, type: 'market', variant, unit: '%',
            items: ['股票', '债券', '现金', '商品', '其他'].map((label, index) => ({ label, value: [42, 28, 15, 10, 5][index] }))
        } : variant === 'waterfall' ? {
            version: 1, type: 'market', variant, unit: '亿元', start: 100, startLabel: '期初', endLabel: '期末',
            changes: [{ label: '收入增长', value: 24 }, { label: '成本增加', value: -11 }, { label: '费用减少', value: 6 }, { label: '其他调整', value: -3 }]
        } : variant === 'funnel' ? {
            version: 1, type: 'market', variant, unit: '个',
            stages: [{ label: '触达', count: 1000 }, { label: '浏览', count: 680 }, { label: '咨询', count: 310 }, { label: '转化', count: 122 }]
        } : variant === 'risk-matrix' ? {
            version: 1, type: 'market', variant,
            items: [{ label: '供应链波动', probability: 4, impact: 4, detail: '模拟供应中断情景' },
                { label: '需求放缓', probability: 3, impact: 5, detail: '模拟销售下降情景' },
                { label: '现金流压力', probability: 2, impact: 4, detail: '模拟回款延迟情景' },
                { label: '系统维护', probability: 2, impact: 2, detail: '模拟短时维护情景' }]
        } : variant === 'fund-kpi' ? { variant, items: [] }
            : variant === 'fund-holdings' ? { variant, columns: [], rows: [] }
                : variant === 'fund-industry' ? { variant, items: [] }
                    : sample('market', variant);
        artifact.asOf = asOf;
        if (variant === 'metrics') artifact.items = [
            { label: '模拟收盘', value: '1,486.20', detail: '较前期 +0.62%' },
            { label: '模拟成交额', value: '286.4 亿元', detail: '较前期 +8.3%' },
            { label: '区间涨跌', value: '+2.16%', detail: '近 30 日虚构样本' },
            { label: '波动率', value: '12.8%', detail: '30 日模拟口径' },
            { label: '估值倍数', value: '22.5 倍', detail: '模拟 TTM' },
            { label: '样本数量', value: '36 家', detail: '虚构观察池' }
        ];
        if (variant === 'fund-kpi') artifact.items = simulatedFundKpis(intent);
        if (variant === 'candlestick') {
            // Keep a complete OHLC + volume series. Change the price level by
            // subject so unrelated boards do not share an identical quote.
            const seed = [...subject].reduce((n, char) => (n * 33 + char.codePointAt(0)) % 997, 0);
            const base = 80 + seed;
            artifact.candles = artifact.candles.map(candle => ({ ...candle,
                open: +(candle.open / 1486.2 * base).toFixed(2),
                high: +(candle.high / 1486.2 * base).toFixed(2),
                low: +(candle.low / 1486.2 * base).toFixed(2),
                close: +(candle.close / 1486.2 * base).toFixed(2)
            }));
        }
        if (variant === 'table' || variant === 'fund-holdings') {
            artifact.columns = /估值|同业|公司/u.test(intent)
                ? ['模拟样本', '模拟收盘', '涨跌幅', 'PE · TTM', '观察重点']
                : ['模拟样本', '模拟收盘', '涨跌幅', '成交额 / 亿', '观察重点'];
            artifact.rows = [
                [`${subject}样本`, '148.60', '+0.62%', '22.5', '量价同步'],
                ['对比样本 A', '128.50', '+1.12%', '18.6', '估值观察'],
                ['对比样本 B', '108.60', '-0.38%', '13.5', '需求观察'],
                ['对比样本 C', '178.20', '+0.74%', '19.6', '库存变化'],
                ['对比样本 D', '68.40', '-0.24%', '12.8', '广度改善']
            ];
        }
        if (variant === 'scatter') artifact.items = artifact.items.map((item, index) => ({ ...item, label: `${subject}样本 ${index + 1}` }));
        if (variant === 'trend') {
            artifact.series = artifact.series.map((item, index) => ({ ...item, name: index ? '模拟基准' : `${subject}模拟指数` }));
            const quarters = requestedCount(intent, '季度', 24);
            const months = requestedCount(intent, '月', 24);
            const points = requestedCount(intent, '(?:交易日|观察)?时点|数据点', 366);
            const count = quarters ?? months ?? points;
            if (count && count >= 2) {
                artifact.labels = quarters ? Array.from({ length: count }, (_, index) => {
                    const quarter = 2026 * 4 + 2 - count + index;
                    return `${Math.floor(quarter / 4)}Q${quarter % 4 + 1}`;
                }) : months ? Array.from({ length: count }, (_, index) => {
                    const date = new Date(Date.UTC(2026, 6 - count + index, 1));
                    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
                }) : Array.from({ length: count }, (_, index) => artifact.labels[index] ?? `模拟时点 ${index + 1}`);
                artifact.series = simulatedSeries(artifact.series, count);
            }
        }
        if (variant === 'pipeline') artifact.items = artifact.items.map((item, index) => ({ ...item,
            name: `${subject}项目 ${index + 1}`, target: `模拟观察点 ${index + 1}`
        }));
        if (variant === 'fund-industry') artifact.items = ['医药', '科技', '消费', '金融', '能源', '工业'].map((label, index) => ({
            label, weight: [24, 21, 18, 15, 12, 10][index], benchmark: [20, 18, 20, 17, 13, 12][index]
        }));
        if (variant === 'events') artifact.items = ['观察窗口', '模拟公告', '经营跟踪', '行业会议', '估值复核'].map((event, index) => ({
            date: `07-${String(5 + index * 5).padStart(2, '0')} 09:00`, object: subject, event,
            focus: `复核${subject}的模拟指标、假设与后续变化`, window: `7 月${index < 2 ? '上' : '下'}旬`, status: '待观察'
        }));
    } else if (['dashboard', 'kpi'].includes(panel.type)) {
        artifact = panel.type === 'dashboard' ? sample('dashboard') : {
            // Native KPI has an exact-key schema; dashboard's detail field is
            // not accepted until a finance board converts the card to market.
            items: sample('dashboard').items.map(({ label, value, detail }) => ({
                label, value, ...(detail ? { change: detail } : {})
            }))
        };
        artifact.items = artifact.items.map((item, index) => ({ ...item, label: index === 0 ? `${subject}模拟指标` : item.label }));
    } else if (panel.type === 'chart') {
        artifact = sample('chart');
        artifact.variant = /趋势|折线|走势|line/iu.test(intent) ? 'line' : 'bar';
        artifact.series = artifact.series.map((item, index) => ({ ...item, name: `${subject}${index ? '对比' : '样本'}` }));
        const months = requestedCount(intent, '月', 24);
        const industries = requestedCount(intent, '行业', 20);
        if (months && artifact.variant === 'line') {
            artifact.labels = Array.from({ length: months }, (_, index) => {
                const date = new Date(Date.UTC(2026, 6 - months + index, 1));
                return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
            });
        } else if (industries) {
            artifact.labels = Array.from({ length: industries }, (_, index) =>
                artifact.labels[index] ?? `模拟行业 ${index + 1}`);
        }
        artifact.series = simulatedSeries(artifact.series, artifact.labels.length);
    } else if (panel.type === 'table') {
        artifact = { columns: ['模拟样本', '数值', '变化', '观察重点'], rows: [
            [`${subject} A`, '148.60', '+0.62%', '量价观察'],
            [`${subject} B`, '128.50', '+1.12%', '估值观察'],
            [`${subject} C`, '108.60', '-0.38%', '需求观察'],
            [`${subject} D`, '178.20', '+0.74%', '库存变化'],
            [`${subject} E`, '68.40', '-0.24%', '广度改善']
        ] };
        const count = requestedCount(intent, '行', 20);
        if (count) artifact.rows = Array.from({ length: count }, (_, index) => {
            if (index < artifact.rows.length) return artifact.rows[index];
            const row = [...artifact.rows[index % artifact.rows.length]];
            row[0] = `${subject} ${String.fromCharCode(65 + index)}`;
            row[1] = (82 + index * 11.4).toFixed(2);
            return row;
        });
    } else if (panel.type === 'news' || panel.type === 'reports') {
        artifact = sample(panel.type);
        artifact.items = artifact.items.map((item, index) => ({ ...item,
            title: `${subject}模拟${panel.type === 'news' ? ['动态', '公告', '行业观察', '数据跟踪'][index % 4] : ['周报', '深度观察', '专题', '月评'][index % 4]}`,
            summary: `虚构${subject}样本：${['观察指标变化与后续跟踪窗口。', '复核经营假设和模拟估值区间。', '比较行业样本与模拟基准表现。', '整理近期事件及待验证问题。'][index % 4]}`
        }));
    } else if (panel.type === 'calendar' || panel.type === 'gantt') {
        artifact = sample(panel.type);
        artifact.items = artifact.items.map(item => ({ ...item,
            ...(panel.type === 'gantt' ? { label: `${subject} · ${item.label}` } : { title: `${subject} · ${item.title}` })
        }));
    } else {
        throw Error(`面板「${panel.title}」没有可验证的模拟数据模板，请选择图表、表格、指标、资讯或日历组件。`);
    }
    return { ...panel, artifact: { ...artifact, title: panel.title, ...(panel.type === 'market' || panel.type === 'dashboard' || panel.type === 'gantt' ? { asOf } : {}) } };
}
