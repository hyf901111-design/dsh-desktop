export const PANEL_SIZES = { small: 360, medium: 600, large: 840 };
const panelSize = p => Object.hasOwn(PANEL_SIZES, p.size) ? p.size : p.height <= 360 ? 'small' : p.height <= 600 ? 'medium' : 'large';
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateWorkbench(value) {
    if (!value || !str(value.requestId, 100) || !str(value.title, 100) || !Array.isArray(value.panels) || value.panels.length < 2 || value.panels.length > 10)
        throw Error('工作台需要 2–10 个独立面板。');
    const seen = new Set();
    const panels = value.panels.map(p => {
        if (!p || !str(p.title, 80) || !str(p.prompt, 5000) || !types.includes(p.type) || (!Object.hasOwn(PANEL_SIZES, p.size) && (!Number.isInteger(p.height) || p.height < 320 || p.height > 1200)) || seen.has(p.title.trim()))
            throw Error('面板标题、内容类型或规划尺寸无效。');
        seen.add(p.title.trim());
        return { title: p.title.trim(), prompt: p.prompt.trim(), type: p.type, size: panelSize(p), height: PANEL_SIZES[panelSize(p)] };
    });
    return { requestId: value.requestId.trim(), title: value.title.trim(), panels };
}
export function layoutWorkbench(panels) {
    const columns = panels.length === 2 || panels.length === 4 ? 2 : 3;
    let y = 0;
    const result = [];
    for (let offset = 0; offset < panels.length; offset += columns) {
        const row = panels.slice(offset, offset + columns);
        const height = Math.max(...row.map(p => PANEL_SIZES[panelSize(p)]));
        const size = Object.keys(PANEL_SIZES).find(key => PANEL_SIZES[key] === height);
        row.forEach((p, index) => result.push({ ...p, size, height, x: index * 752, y, width: 720 }));
        y += height + 32;
    }
    return result;
}

export function workbenchPanelPrompt(input, p) {
    return `工作台：${input.title}\n本面板：${p.title}\n${p.prompt}\n仅生成本面板，优先使用 ${p.type} 类型；框宽 ${p.width}px，建议初始高度 ${p.height}px，使用自然高度和响应式布局，不设置固定高度的内部滚动区；必要时画布按实际内容增高。首屏表格最多${p.size === "small" ? 4 : p.size === "medium" ? 6 : 8}行、最多4个主要列（更多字段用默认折叠的详情），不得压缩成逐字换行；来源必须短标签可点击；文字最多${p.size === "small" ? 250 : p.size === "medium" ? 450 : 650}字，优先核心数据和结论，使用简短来源链接，细节可用折叠区。内容简洁完整，遵守用户指定的行数、条数和范围，不额外扩写背景、摘要。标题简短，来源和日期放在正文，避免重复其他面板内容。数据注明来源和日期，无法获得的数据明确标注缺失；不得伪造实时数据或声称已开启持续监控。`;
}
