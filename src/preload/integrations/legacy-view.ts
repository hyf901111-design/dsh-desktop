import type { IntegrationReply, LegacySkillPreviewItem } from '../../shared/integration-ui'
import { button, escapeHtml as esc } from './forms'

export const legacyPreviewStyles = `
.ig-dialog.ig-legacy-dialog{width:min(720px,calc(100vw - 48px));max-height:calc(100vh - 64px);overflow:auto}.ig-legacy-dialog .ig-legacy-row{display:block}
.ig-legacy-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.ig-legacy-heading span{color:var(--ig-muted);font-size:var(--ig-text-meta);flex-shrink:0;line-height:var(--ig-leading-meta)}
.ig-legacy-row .ig-legacy-path{display:block;overflow-wrap:anywhere;white-space:pre-wrap;font:var(--ig-text-code)/var(--ig-leading-body) ui-monospace,SFMono-Regular,monospace;color:var(--ig-muted);margin:6px 0}
.ig-legacy-diagnostic{border-left:2px solid var(--ig-line);padding-left:12px;margin:10px 0}.ig-legacy-diagnostic p{margin:5px 0}.ig-legacy-row .ig-legacy-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ig-legacy-actions .ig-button{padding:4px 12px!important;min-height:30px;font-size:var(--ig-text-control)}
.ig-legacy-feedback{font-size:var(--ig-text-body);color:var(--ig-muted);margin:6px 0}.ig-legacy-dialog footer{flex-wrap:wrap}.ig-legacy-help summary{cursor:pointer;color:var(--ig-ink);font-size:var(--ig-text-body)}.ig-legacy-help p{padding-top:6px}
`
const labels: Record<string, string> = { eligible: '可接入', migrated: '已接入', compatibility: '原方式保留', skipped: '未接入', failed: '暂不能接入' }
const sourceLabels: Record<string, string> = { personal: '个人技能', project: '项目技能', custom: '自定义来源', bundled: '客户端内置' }
function diagnosticMarkup(item: LegacySkillPreviewItem): string {
  const d = item.diagnostic
  if (!d) return ''
  const measurement = d.actual !== undefined && d.limit !== undefined
    ? d.unit === 'bytes' ? `已检测到 ${(d.actual / 1048576).toFixed(2)} MiB，当前上限 ${(d.limit / 1048576).toFixed(2)} MiB` : `已检测到 ${d.actual} 个文件，当前上限 ${d.limit} 个文件`
    : ''
  return `<div class="ig-legacy-diagnostic"><p><strong>${esc(d.reason)}</strong></p>${d.resourcePath ? `<code class="ig-legacy-path">受阻资源：${esc(d.resourcePath)}</code>` : ''}${measurement ? `<p>${esc(measurement)}</p>` : ''}<details class="ig-legacy-help"><summary>查看处理建议</summary><p>${esc(d.guidance)}</p></details></div>`
}
export function legacyPreviewMarkup(reply: Extract<IntegrationReply, { type: 'legacy-preview' }>, canReveal: boolean): string {
  return `<section role="dialog" aria-modal="true" aria-labelledby="ig-confirm-title" class="ig-dialog ig-legacy-dialog"><h2 id="ig-confirm-title">接入旧技能</h2><p>确认后只复制可接入的个人技能，原文件与连接授权保持不变。暂不能接入的技能继续保留原方式；内置技能由客户端管理。</p><div class="ig-legacy-preview">${reply.items.length ? reply.items.map((item, index) => `<div class="ig-legacy-row"><div class="ig-legacy-heading"><strong>${esc(item.name)}</strong><span>${esc(item.kind === 'bundled' ? '内置管理' : labels[item.status] || item.status)}</span></div>${item.kind ? `<p>${esc(sourceLabels[item.kind])}</p>` : ''}${item.sourcePath ? `<code class="ig-legacy-path">${esc(item.sourcePath)}</code>` : ''}${item.message ? `<p>${esc(item.message)}</p>` : ''}${diagnosticMarkup(item)}<div class="ig-legacy-actions">${item.sourcePath && canReveal ? `<button type="button" class="ig-button ig-secondary" data-legacy-reveal="${index}">在 Finder 中显示来源</button>` : ''}${item.status === 'failed' || item.status === 'skipped' || item.status === 'compatibility' && item.kind !== 'bundled' ? button('legacy-reselect', '重新选择完整技能包') : ''}</div><p class="ig-legacy-feedback" data-legacy-feedback="${index}" role="status"></p></div>`).join('') : '<p>没有发现可接入的旧技能。</p>'}</div><p>可接入 ${reply.eligibleCount} 项。重新选择同目录的 SKILL.md 仍会检查整个技能包。</p><footer>${button('legacy-recheck', '重新检查')}${button('cancel-dialog', '关闭')}${button('confirm-legacy-migration', '复制并接入', true, reply.eligibleCount <= 0)}</footer></section>`
}
