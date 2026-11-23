// A panel title can quote a measurement ("8 projects rank first") or describe
// a population. Check the measurement actually shown before counting rows.
export function chartQuantityIssue(chart, prompt, scope) {
    if (!Array.isArray(chart.labels) || !chart.labels.every(label => typeof label === 'string') ||
        !Array.isArray(chart.series) || !chart.series.every(s => typeof s?.name === 'string' && Array.isArray(s.values))) return;
    const number = scope.expected, unit = scope.unit;
    for (const match of prompt.matchAll(/(?:由|从)\s*(\d+)\s*([项个条家只])\s*(增至|降至|升至|减至|增长至|下降至)\s*(\d+)\s*\2/gu)) {
        if (Number(match[1]) !== number || match[2] !== unit || !scope.entity.startsWith(match[3] + match[4] + unit)) continue;
        const before = prompt.slice(0, match.index).trimEnd();
        const series = chart.series.filter(s => {
            const name = s.name.replace(/^(?:含|涉及)/u, '');
            return name.length && before.endsWith(name);
        });
        const values = series.length === 1 ? series[0].values : undefined;
        const start = values?.indexOf(number) ?? -1;
        const end = Number(match[4]);
        const increasing = /^(?:增|升)/u.test(match[3]);
        if (chart.unit === unit && values?.length === chart.labels.length && start >= 0 &&
            values.indexOf(end, start + 1) > start && (increasing ? number < end : number > end)) return null;
        return '图表中的对应序列未显示所述的起止数量及变化方向。';
    }
    if (!/^(?:居首|排名第一|位居第一)/u.test(scope.entity)) return;
    const match = new RegExp(number + '\\s*' + unit + '\\s*(?:居首|排名第一|位居第一)', 'u').exec(prompt);
    if (!match) return;
    const before = prompt.slice(0, match.index).trimEnd();
    const category = chart.labels.findIndex(label => typeof label === 'string' && label.length && before.endsWith(label));
    const values = chart.series.length === 1 ? chart.series[0].values : undefined;
    if (chart.unit === unit && category >= 0 && values?.length === chart.labels.length &&
        values[category] === number && values.every(value => Number.isFinite(value) && value <= number)) return null;
    return '图表中所述类别的数量或排名与已显示数据不一致。';
}

export function groupedCountValue(value) {
    if (typeof value === 'string' && /^\d+$/u.test(value)) value = Number(value);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function groupedQuantityData(artifact) {
    let data = artifact;
    if (data?.type === 'html' && typeof data.html === 'string') {
        const encoded = data.html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/u)?.[1];
        if (!encoded || encoded.length > 512000) return;
        try {
            const model = JSON.parse(encoded);
            const expected = model.data?.type === 'chart' ? 'chart.' + model.data.variant : model.data?.type;
            if (model.templateId !== expected || typeof model.version !== 'string') return;
            data = model.data;
        } catch { return; }
    }
    if (data?.type !== 'view') return data;
    if (!Array.isArray(data.view?.sections) || !data.view.sections.every(section => typeof section?.kind === 'string')) return;
    const records = data.view.sections.filter(section => section?.kind === 'records');
    if (records.length !== 1 || (data.view.where !== undefined && (!Array.isArray(data.view.where) || data.view.where.length)) || !Array.isArray(records[0].fields) ||
        !Array.isArray(data.dataset?.fields) || !data.dataset.fields.every(field => typeof field?.key === 'string' && typeof field.label === 'string') ||
        !Array.isArray(data.dataset.records) || !data.dataset.records.every(row => row && typeof row === 'object' && !Array.isArray(row))) return;
    const fields = data.dataset.fields.filter(field => records[0].fields.includes(field.key));
    return {type:'table', columns:fields.map(field => field.label), rows:data.dataset.records.map(row => fields.map(field => row[field.key]))};
}

// undefined leaves ordinary record coverage in charge. null means the displayed
// quantities substantiate this clause. A string explains a measurable gap.
export function workbenchGroupedQuantityIssue(data, prompt, scope) {
    if (!data || /逐[项条个只家]|逐一|明细清单|项目明细/u.test(prompt)) return;
    if (data.type === 'chart') return chartQuantityIssue(data, prompt, scope);
    if (data.type !== 'table' || !Array.isArray(data.columns) || !Array.isArray(data.rows) ||
        !data.rows.every(row => Array.isArray(row) && row.length === data.columns.length)) return;
    const labels = data.columns.map(column => typeof column === 'string' ? column : column?.label ?? '');
    if (!labels.every(label => typeof label === 'string' && label.length)) return;
    const minimum = new RegExp('(?:至少|不少于|最少|不低于)\\s*' + scope.expected + '\\s*' + scope.unit, 'u').test(prompt);
    const indexed = /(?:序号|编号)索引/u.test(prompt);
    if (indexed && /^(?:项目|任务|记录|事项)?$/u.test(scope.entity)) {
        const serial = labels.findIndex(label => /(?:序号|编号)(?:列表|清单)?$/u.test(label) && !['编号','记录编号'].includes(label));
        const count = labels.findIndex(label => /^(?:项目|任务|记录|事项)(?:数量|数)$/u.test(label));
        const seen = new Set();
        for (const row of data.rows) {
            const cell = row[serial];
            if (typeof cell !== 'string' && !Number.isSafeInteger(cell)) return '分组索引没有可核验的序号列。';
            const ids = String(cell).trim().split(/\s*[、,，;；]\s*/u);
            if (!ids.every(id => /^\d+$/u.test(id) && Number.isSafeInteger(Number(id))) ||
                count >= 0 && groupedCountValue(row[count]) !== ids.length) return '索引中的序号缺失或与分组数量不符。';
            for (const id of ids.map(Number)) {
                if (seen.has(id)) return '同一序号在分组索引中重复。';
                seen.add(id);
            }
        }
        if (minimum ? seen.size >= scope.expected : seen.size === scope.expected) return null;
        return '索引列出 ' + seen.size + ' 个不同序号，要求' + (minimum ? '至少' : '') + ' ' + scope.expected + ' 个。';
    }
    if (!/^(?:项目|任务|记录|事项|产品)$/u.test(scope.entity) ||
        !/(?:等级|类别|分类|分级|各组|分组|领域).{0,12}(?:结构|分布|汇总|统计)/u.test(prompt)) return;
    const group = labels.findIndex(label => /(?:等级|类别|分类|分组|领域|类型)$/u.test(label));
    const counts = labels.flatMap((label, index) => {
        const name = label.replace(/^(?:全行业|全部|全体|总体)/u, '');
        return [scope.entity + '数', scope.entity + '数量', scope.entity + '总数'].includes(name) ? [index] : [];
    });
    if (group < 0 || counts.length !== 1) return '分组表缺少可核验的分类或数量列。';
    const groups = new Set();
    let total = 0, statedTotal;
    for (const row of data.rows) {
        const name = typeof row[group] === 'string' ? row[group].trim() : '', value = groupedCountValue(row[counts[0]]);
        if (!name || value === undefined || groups.has(name)) return '分组表含有缺失、重复或无效的分类数量。';
        groups.add(name);
        if (/^(?:总计|合计)$/u.test(name)) {
            if (statedTotal !== undefined) return '分组表含有重复的总计行。';
            statedTotal = value;
        } else total += value;
    }
    return (minimum ? total >= scope.expected : total === scope.expected) && (statedTotal === undefined || statedTotal === total) ? null :
        '可见分类合计 ' + total + '，与声明的 ' + scope.expected + scope.unit + scope.entity + '或总计行不一致。';
}

export function groupedScopeRestored(artifact, prompt, scope) {
    if (!Number.isSafeInteger(scope?.expected) || scope.expected < 2 || typeof scope.unit !== 'string' || !/^[项个条家只]$/u.test(scope.unit) ||
        typeof scope.entity !== 'string' || typeof prompt !== 'string' || !new RegExp('(?<!\\d)' + scope.expected + '\\s*' + scope.unit).test(prompt)) return false;
    const data = groupedQuantityData(artifact);
    return workbenchGroupedQuantityIssue(data, prompt, scope) === null;
}
