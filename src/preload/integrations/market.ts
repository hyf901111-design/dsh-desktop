import type { MarketEntry } from './bridge';
import type { CatalogEntry } from '../../shared/integrations';
import { escapeHtml as esc, button } from './forms';
export type MarketCategory = 'all' | 'research' | 'office' | 'developer';
const categories: Array<[MarketCategory, string]> = [['all', '全部'], ['research', '研究与数据'], ['office', '办公与协作'], ['developer', '开发工具']];
export function marketGrid(entries: MarketEntry[], loading: boolean, category: MarketCategory = 'all', kind: CatalogEntry['kind'] = 'plugin') {
    if (loading) return '<p class="ig-empty" role="status">正在加载市场…</p>';
    const filtered = category === 'all' ? entries : entries.filter(entry => entry.category === category);
    const filters = `<nav class="ig-market-categories" aria-label="市场分类">${categories.map(([value, label]) => `<button type="button" class="ig-button ${category === value ? 'ig-primary' : 'ig-secondary'}" data-market-category="${value}" aria-pressed="${category === value}">${label}</button>`).join('')}</nav>`;
    if (!entries.length) return `<div class="ig-empty ig-market-vacant"><h2>暂无可用${{plugin:'插件',app:'应用',tool:'工具',skill:'技能'}[kind]}</h2><p>有可用内容后会显示在这里。</p></div>`;
    if (!filtered.length) return `${filters}<div class="ig-market-empty">这个分类暂时没有内容，可以切换到「全部」查看。</div>`;
    return `${filters}<div class="ig-market-grid">${filtered.map(entry => `<article class="ig-market-card"><h2>${esc(entry.name)}</h2><p>${esc(entry.description)}</p><span class="ig-market-meta">${esc(entry.publisher)} · ${entry.installed ? '已安装' : `版本 ${esc(entry.version)}`}</span><footer><button type="button" data-market-entry="${esc(entry.id)}" aria-label="查看${esc(entry.name)}">查看</button></footer></article>`).join('')}</div>`;
}
export function marketDetail(entry?: MarketEntry) {
    if (!entry) return '<p class="ig-empty">该条目已不在目录中，请返回刷新。</p>';
    const action = entry.installed ? '已安装' : entry.kind === 'app' ? '添加连接' : entry.kind === 'tool' ? '配置工具' : '安装';
    return `<section class="ig-detail-identity"><h2>${esc(entry.name)}</h2><p>${esc(entry.publisher)} · 版本 ${esc(entry.version)}${entry.installed ? ' · 已安装' : ''}</p></section><div class="ig-detail-grid"><section class="ig-detail-main ig-capabilities"><h2>可以帮你做什么</h2><p>${esc(entry.description)}</p>${entry.capabilities?.map(item => `<div class="ig-capability"><strong>${esc(item.name)}</strong><span>${esc(item.description)}</span></div>`).join('') || ''}</section><aside class="ig-detail-aside" aria-label="安装摘要"><section class="ig-help"><h2>本次需要的权限</h2>${entry.permissions.length ? `<ul>${entry.permissions.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p>此条目未声明额外权限。</p>'}</section>${entry.unavailableReason ? `<p class="ig-error">${esc(entry.unavailableReason)}</p>` : ''}${button('install', action, true, entry.installed || !entry.available)}<p class="ig-note">${entry.kind === 'app' || entry.kind === 'tool' ? '填写连接配置后再测试与授权，连接状态以实际验证结果为准。' : '连接凭据与工具授权独立管理，安装不会自动扩大权限。'}</p></aside></div>`;
}
