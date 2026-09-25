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
const sample = (type, variant) => {
    const found = examples.find(panel => panel.type === type && (type !== 'market' || panel.artifact.variant === variant));
    if (!found) throw Error(`模拟组件类型 ${type}${variant ? `.${variant}` : ''} 暂无宿主模板。`);
    return clone(found.artifact);
};

export function generateSimulatedPanel(panel, workbenchTitle) {
    if (panel.artifact) return panel;
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
        } : variant === 'fund-kpi' ? { variant, items: [] }
            : variant === 'fund-holdings' ? { variant, columns: [], rows: [] }
                : variant === 'fund-industry' ? { variant, items: [] }
                    : sample('market', variant);
        artifact.asOf = asOf;
        if (variant === 'metrics' || variant === 'fund-kpi') artifact.items = [
            { label: '模拟收盘', value: '1,486.20', detail: '较前期 +0.62%' },
            { label: '模拟成交额', value: '286.4 亿元', detail: '较前期 +8.3%' },
            { label: '区间涨跌', value: '+2.16%', detail: '近 30 日虚构样本' },
            { label: '波动率', value: '12.8%', detail: '30 日模拟口径' },
            { label: '估值倍数', value: '22.5 倍', detail: '模拟 TTM' },
            { label: '样本数量', value: '36 家', detail: '虚构观察池' }
        ];
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
        if (variant === 'trend') artifact.series = artifact.series.map((item, index) => ({ ...item, name: index ? '模拟基准' : `${subject}模拟指数` }));
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
    } else if (panel.type === 'table') {
        artifact = { columns: ['模拟样本', '数值', '变化', '观察重点'], rows: [
            [`${subject} A`, '148.60', '+0.62%', '量价观察'],
            [`${subject} B`, '128.50', '+1.12%', '估值观察'],
            [`${subject} C`, '108.60', '-0.38%', '需求观察'],
            [`${subject} D`, '178.20', '+0.74%', '库存变化'],
            [`${subject} E`, '68.40', '-0.24%', '广度改善']
        ] };
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
