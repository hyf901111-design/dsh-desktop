import { researchBentoSize, researchBentoLayout } from './bento-layout.js';
export const PANEL_SIZES = { small: 220, medium: 220, large: 456 };
const panelSize = p => Object.hasOwn(PANEL_SIZES, p.size) ? p.size : researchBentoSize(p);
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard'];
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
    return researchBentoLayout(panels.map(p => ({ ...p, size: panelSize(p) })), canvasSize).nodes;
}

export function workbenchPanelPrompt(input, p) {
    return `工作台：${input.title}\n本面板：${p.title}\n${p.prompt}\n仅生成本面板，优先使用 ${p.type} 类型；框宽 ${p.width}px，建议初始高度 ${p.height}px，按容器重排，不缩小字号，不设置内部滚动区。默认规格 S 320×220、M 656×220、L 656×456，格间距16。内容放不下升级规格，超过 L 则拆分组件或呈现摘要，完整内容通过放大阅读。数字英文 DINPro，中文 Noto Sans SC；标题15、主指标24、正文13px。首屏表格最多${p.size === "large" ? 8 : 3}行、最多4个主要列（更多字段用默认折叠的详情），不得压缩成逐字换行；来源必须短标签可点击；文字最多${p.size === "small" ? 100 : p.size === "medium" ? 180 : 450}字，优先核心数据和结论，使用简短来源链接，细节可用折叠区。内容简洁完整，遵守用户指定的行数、条数和范围，不额外扩写背景、摘要。标题简短，来源和日期放在正文，避免重复其他面板内容。数据注明来源和日期，无法获得的数据明确标注缺失；不得伪造实时数据或声称已开启持续监控。`;
}
