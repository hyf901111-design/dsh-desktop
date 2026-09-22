import type { MarketEntry } from './bridge';
import { escapeHtml, button } from './forms';
export function marketGrid(entries: MarketEntry[], loading: boolean) {
    if (loading)
        return '<p class="ig-empty" role="status">正在加载市场…</p>';
    if (!entries.length)
        return '<div class="ig-empty"><h2>暂无可用内容</h2><p>连接目录服务或添加团队来源后，这里会显示可以安装或连接的能力。</p></div>';
    return `<div class="ig-market-grid">${entries.map(entry => `<article class="ig-market-card"><h2>${escapeHtml(entry.name)}</h2><p>${escapeHtml(entry.description)}</p><footer><span>${escapeHtml(entry.publisher)} · ${escapeHtml(entry.installed ? '已安装' : entry.version)}</span><button data-market-entry="${escapeHtml(entry.id)}">查看</button></footer></article>`).join('')}</div>`;
}
export function marketDetail(entry?: MarketEntry) {
    if (!entry)
        return '<p class="ig-empty">该条目已不在目录中，请返回刷新。</p>';
    return `<div class="ig-form"><div class="ig-card"><h2>${escapeHtml(entry.name)}</h2><p>${escapeHtml(entry.publisher)} · 版本 ${escapeHtml(entry.version)}</p><p>${escapeHtml(entry.description)}</p></div><div class="ig-card"><h2>需要的权限</h2>${entry.permissions.length ? `<ul>${entry.permissions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '<p>此条目未声明额外权限。</p>'}</div>${entry.unavailableReason ? `<p class="ig-error">${escapeHtml(entry.unavailableReason)}</p>` : ''}<div class="ig-form-actions">${button('back', '返回')}${button('install', entry.installed ? '已安装' : entry.kind === 'app' ? '添加连接' : entry.kind === 'tool' ? '配置工具' : '安装', true, entry.installed || !entry.available)}</div></div>`;
}
