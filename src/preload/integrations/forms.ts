import type { ConnectionDraft, SkillPreview } from './bridge';
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const button = (action: string, text: string, primary = false, disabled = false) => `<button type="button" class="ig-button ${primary ? 'ig-primary' : 'ig-secondary'}" data-action="${action}" ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</button>`;
const field = (name: string, label: string, value: string, hint = '', type = 'text') => `<label class="ig-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="${type === 'password' ? 'new-password' : 'off'}" ${name === 'name' ? 'required maxlength="120"' : ''}>${hint ? `<small>${hint}</small>` : ''}</label>`;
const area = (name: string, label: string, value: string, hint = '') => `<label class="ig-field"><span>${label}</span><textarea name="${name}" spellcheck="false">${escapeHtml(value)}</textarea>${hint ? `<small>${hint}</small>` : ''}</label>`;
export function connectionForm(draft: ConnectionDraft): string {
    const mcp = draft.type.startsWith('mcp-'), app = ['google-calendar', 'notion'].includes(draft.type), stdio = draft.type === 'mcp-stdio';
    return `<form class="ig-form" data-form="connection">${field('name', '名称', draft.name)}
 ${draft.type === 'mcp-stdio' ? `${field('command', '启动命令', draft.command, '例如 npx。参数单独填写，不经过 shell 执行。')}${area('args', '参数', draft.args, '每行一个参数')}${field('cwd', '工作目录', draft.cwd)}${area('env', '环境变量', draft.env, '每行 KEY=value；已保存的值不会回显。')}` : app ? draft.type === 'google-calendar' ? field('clientId', 'Google 桌面 OAuth Client ID', draft.clientId || '', '使用类型为桌面应用的 Google OAuth 客户端 ID；授权会在系统浏览器中打开。') : '<p class="ig-note">可使用 Notion 内部集成令牌连接已共享给该集成的页面。</p>' : field('url', mcp ? 'MCP 服务器地址' : 'API 基础地址', draft.url, mcp ? '使用支持流式 HTTP 的服务地址' : '默认使用 HTTPS。')}
 ${!app && !stdio ? `<div class="ig-field-pair"><label class="ig-field"><span>认证方式</span><select name="authType">${[['none', '无需认证'], ['bearer', 'Bearer Token'], ['api-key', 'API Key']].map(([key, label]) => `<option value="${key}" ${draft.authType === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('headerName', 'API Key 请求头', draft.headerName, '使用 API Key 时生效')}</div>` : ''}
 ${draft.type === 'google-calendar' || stdio ? '' : field('secret', draft.type === 'notion' ? '内部集成令牌' : '密钥 / Token', draft.secret, draft.id ? '留空保留已有凭据；已保存的值不会回显。' : '凭据由客户端加密保存，不进入对话。', 'password')}
 ${draft.type === 'api' ? `<details ${draft.openApiDocument ? 'open' : ''}><summary>从 OpenAPI 文档导入工具</summary>${area('openApiDocument', 'OpenAPI 文档', draft.openApiDocument, '粘贴 JSON 或 YAML；解析后检查工具与读写权限。')}${button('compile-openapi', '解析接口')}</details>${area('toolsJson', '工具定义（JSON）', draft.toolsJson, '每项包含 id、name、description、method、path、inputSchema、effect；effect 为 read / write / destructive。保存后在详情中选择允许的工具。')}` : ''}
 ${field('workspaceIds', '允许使用的工作区', draft.workspaceIds, '留空：当前账号的所有工作区。限制范围：输入工作区 ID，用逗号分隔。')}
 ${!app && !stdio ? `<label class="ig-check"><input type="checkbox" name="allowPrivateNetwork" ${draft.allowPrivateNetwork ? 'checked' : ''}>允许连接我指定的局域网 / 本机服务</label>` : ''}
 <p class="ig-note">连接后先测试并确认工具权限；写入工具不会自动获得定时任务执行授权。</p>
 <div class="ig-form-actions">${button('back', '取消')}${button('save-connection', '保存连接', true)}</div></form>`;
}
export function skillPreviewForm(preview?: SkillPreview) {
    if (!preview)
        return `<div class="ig-empty"><h2>导入你的技能</h2><p>选择 SKILL.md 或技能目录，先检查正文、资源和依赖，再确认导入。</p>${button('choose-skill', '选择技能文件', true)}</div>`;
    return `<div class="ig-form"><div class="ig-card"><h2>${escapeHtml(preview.name)}</h2><p>${escapeHtml(preview.description)}</p><pre class="ig-preview">${escapeHtml(preview.content)}</pre></div><div class="ig-card"><h2>包含的文件</h2><p>${preview.files.map(escapeHtml).join('<br>')}</p>${preview.warnings.length ? `<p class="ig-error">${preview.warnings.map(escapeHtml).join('<br>')}</p>` : ''}</div><label class="ig-field"><span>同名技能</span><select name="importMode"><option value="copy">保留原技能，导入副本</option><option value="replace">替换同来源版本</option></select></label><div class="ig-form-actions">${button('choose-skill', '重新选择')}${button('import-skill', '确认导入', true)}</div></div>`;
}
