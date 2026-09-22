import { researchBentoSize } from './bento-layout.js';
export const PANEL_SIZES = { small: 220, medium: 220, large: 456 };
const panelSize = p => Object.hasOwn(PANEL_SIZES, p.size) ? p.size : researchBentoSize(p);
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard', 'market'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateWorkbench(value) {
    if (!value || !str(value.requestId, 100) || !str(value.title, 100) || !Array.isArray(value.panels) || value.panels.length < 2 || value.panels.length > 10)
        throw Error('工作台需要 2–10 个独立面板。');
    const seen = new Set();
    const panels = value.panels.map(p => {
        if (!p || !str(p.title, 80) || !str(p.prompt, 5000) || !types.includes(p.type) || (!Object.hasOwn(PANEL_SIZES, p.size) && (!Number.isInteger(p.height) || p.height < 220 || p.height > 1200)) || seen.has(p.title.trim()))
            throw Error('面板标题、内容类型或规划尺寸无效。');
        seen.add(p.title.trim());
        return { title: p.title.trim(), prompt: p.prompt.trim(), type: p.type, size: panelSize(p), height: PANEL_SIZES[panelSize(p)] };
    });
    return { requestId: value.requestId.trim(), title: value.title.trim(), panels };
}
export function layoutWorkbench(panels, canvasSize = { width: 1380, height: 900 }) {
    const columns = panels.length === 2 || panels.length === 4 ? 2 : 3;
    return panels.map((p, index) => ({ ...p, size: panelSize(p), width: 280, height: 200, x: index % columns * 300, y: Math.floor(index / columns) * 224 }));
}

export function workbenchPanelPrompt(input, p) {
    return `工作台：${input.title}\n本面板：${p.title}\n${p.prompt}\n仅生成本面板，优先使用 ${p.type} 类型；生成中的280×200是临时占位，不是成品边界。成品按内容密度选择合理布局；正文12/18px、标题13/20px、指标23/26px，数字英文DINPro、中文Noto Sans SC；内边距12px，控件黑白灰。不要在正文重复宿主面板标题，不截断用户要求的数据、行列或来源，不用折叠隐藏主要字段。表格保持可读，复杂图表按实际图种呈现。数据注明来源和日期，无法获得的数据明确标注缺失；不得伪造实时数据或声称已开启持续监控。`;
}
