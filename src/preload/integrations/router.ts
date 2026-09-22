import type { IntegrationTab, MarketKind, ConnectionDraft } from './bridge';
export type IntegrationRoute = {
    page: 'list';
    tab: IntegrationTab;
} | {
    page: 'market';
    kind: MarketKind;
    focusEntryId?: string;
} | {
    page: 'market-detail';
    kind: MarketKind;
    id: string;
} | {
    page: 'detail';
    id: string;
    tab: IntegrationTab;
} | {
    page: 'connection';
    type: ConnectionDraft['type'];
    id?: string;
} | {
    page: 'skill-import';
} | {
    page: 'create-plugin';
} | {
    page: 'add-source';
    kind: MarketKind;
};
export const marketKinds: Record<IntegrationTab, MarketKind> = { plugins: 'plugin', apps: 'app', mcp: 'tool', skills: 'skill' };
export const tabNames: Record<IntegrationTab, string> = { plugins: '插件', apps: '应用', mcp: 'MCP', skills: '技能' };
export const marketNames: Record<MarketKind, string> = { plugin: '插件市场', app: '应用市场', tool: '工具市场', skill: '技能市场' };
export function parseIntegrationRoute(path?: string): IntegrationRoute {
    const parts = (path || 'integrations/plugins').split('/');
    if (parts[0] !== 'integrations')
        return { page: 'list', tab: 'plugins' };
    if (parts[1] === 'market' && ['plugin', 'app', 'tool', 'skill'].includes(parts[2] || ''))
        return { page: 'market', kind: parts[2] as MarketKind };
    if (['plugins', 'apps', 'mcp', 'skills'].includes(parts[1] || ''))
        return { page: 'list', tab: parts[1] as IntegrationTab };
    return { page: 'list', tab: 'plugins' };
}
