import { chartDataIssue } from './chart-template-contract.js';

// A distribution pair should carry one source list, not two model-written
// copies which can silently drop the tail or change duplicate observations.
export function resolveWorkbenchSamples(panels) {
    if (!Array.isArray(panels)) return panels;
    const reused = new Set();
    const resolved = panels.map(panel => {
        if (panel?.samplesFromPanel === undefined) return panel;
        const name = panel.samplesFromPanel;
        if (typeof name !== 'string' || !name.trim() || panel.type !== 'chart' || panel.artifact?.variant !== 'histogram')
            throw Error('samplesFromPanel 仅供直方图引用同工作台箱线图的原始样本，值为该面板的完整标题。');
        const sources = panels.filter(p => p?.title?.trim() === name.trim());
        const source = sources[0];
        if (sources.length !== 1 || source === panel || source.type !== 'chart' || source.artifact?.variant !== 'box')
            throw Error(`样本源「${name}」必须唯一指向同工作台的箱线图面板。`);
        const data = { version: 1, type: 'chart', title: source.title, ...source.artifact };
        if (chartDataIssue(data) || !data.groups?.every(g => Array.isArray(g.samples)))
            throw Error(`样本源「${name}」必须提供有效 groups:[{name,samples}]，不能用五数摘要还原样本。`);
        if (panel.artifact.samples !== undefined || panel.artifact.bins !== undefined)
            throw Error(`面板「${panel.title}」使用 samplesFromPanel 时省略 samples/bins，宿主直接合并源分组，不能重复抄写。`);
        if (panel.artifact.unit !== data.unit)
            throw Error(`面板「${panel.title}」与样本源「${name}」的 unit 必须一致，宿主不会猜测单位换算。`);
        const { samplesFromPanel, ...rest } = panel;
        const result = { ...rest, artifact: { ...panel.artifact, samples: data.groups.flatMap(g => [...g.samples]) } };
        reused.add(result);
        return result;
    });
    // Also reject a legacy duplicated payload which explicitly claims a common
    // cohort. Do not infer a relationship for unrelated distribution panels.
    for (const panel of resolved) {
        const data = panel?.artifact;
        if (reused.has(panel) || data?.variant !== 'histogram' || !Array.isArray(data.samples)) continue;
        const intent = `${panel.prompt ?? ''} ${data.note ?? ''}`;
        if (!/(?:共用|共享|同一批|同批|同源|same\s+(?:samples|cohort))/iu.test(intent) || !/(?:箱线|箱须|box)/iu.test(intent)) continue;
        const candidates = resolved.filter(p => p?.type === 'chart' && p.artifact?.variant === 'box' && p.artifact.unit === data.unit);
        if (candidates.length !== 1)
            throw Error(`面板「${panel.title}」声明共用箱线样本，请用 samplesFromPanel 指定唯一源面板，并省略 samples。`);
        const groups = candidates[0].artifact.groups;
        if (!Array.isArray(groups) || !groups.every(g => Array.isArray(g?.samples)))
            throw Error(`面板「${panel.title}」声明共用样本，但箱线图没有原始样本。`);
        const expected = groups.flatMap(g => g.samples).sort((a,b) => a-b);
        const supplied = [...data.samples].sort((a,b) => a-b);
        if (expected.length !== supplied.length || expected.some((v,i) => v !== supplied[i]))
            throw Error(`面板「${panel.title}」共用样本不一致：直方图 ${supplied.length} 条，箱线图 ${expected.length} 条。改用 samplesFromPanel:"${candidates[0].title}" 并省略 samples，由宿主复用全部原样本。`);
    }
    return resolved;
}
