import type { ConnectionDraft } from './bridge';
import type { ApiOperation } from '../../shared/integrations';
import { connectionForm, manualToolForm, parseDraftTools, type ManualToolDraft } from './forms';
/** Keeps unsaved form state local; defining a tool never grants it permission. */
export class ConnectionFormController {
    private step: 'basic' | 'tools' = 'basic';
    private manual?: ManualToolDraft;
    reset() { this.step = 'basic'; this.manual = undefined; }
    showTools() { this.step = 'tools'; this.manual = undefined; }
    title(draft: ConnectionDraft): string {
        if (this.manual) return '手动添加工具';
        if (draft.type === 'api' && this.step === 'tools') return '配置可用工具';
        if (draft.id) return '管理连接';
        return draft.type === 'api' ? '添加自定义 API' : draft.type.startsWith('mcp-') ? '添加 MCP 服务器' : '连接应用';
    }
    subtitle(draft: ConnectionDraft) {
        if (this.manual) return '定义一个可供 EWork 调用的接口';
        if (draft.type === 'api') return this.step === 'tools' ? '配置接口后，测试连接并确认调用权限' : '把你的数据服务连接到 EWork';
        return draft.type.startsWith('mcp-') ? '连接工具服务器，让 EWork 使用你允许的能力' : '连接工作账号，管理可访问的资料与工具';
    }
    render(draft: ConnectionDraft) { return this.manual ? manualToolForm(this.manual) : connectionForm(draft, this.step === 'tools'); }
    input(target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, draft: ConnectionDraft): boolean {
        const name = target.name;
        if (name === 'authType') { draft.authType = target.value as ConnectionDraft['authType']; return true; }
        if (!this.manual || !name.startsWith('manual-')) return false;
        const match = /^manual-param-(\d+)-(name|type|location|required)$/.exec(name);
        if (match) {
            const parameter = this.manual.parameters[Number(match[1])];
            if (parameter) { if (match[2] === 'required') parameter.required = (target as HTMLInputElement).checked; else parameter[match[2] as 'name'|'type'|'location'] = target.value; }
        } else {
            const key = name.slice(7);
            if (['name','description','method','path','effect'].includes(key)) this.manual[key as 'name'|'description'|'method'|'path'|'effect'] = target.value;
            if (key === 'method') { this.manual.effect = ['GET','HEAD'].includes(target.value) ? 'read' : target.value === 'DELETE' ? 'destructive' : 'write'; return true; }
        }
        return false;
    }
    action(action: string, draft: ConnectionDraft): { handled: boolean; changed?: boolean; error?: string } {
        if (!action.startsWith('form-')) return { handled: false };
        try {
            if (action === 'form-next') {
                if (!draft.name.trim()) throw new Error('请填写连接名称。');
                let url: URL; try { url = new URL(draft.url); } catch { throw new Error('请填写有效的 API 基础地址。'); }
                if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址须使用 HTTP 或 HTTPS，且不能包含凭据、查询参数或片段。');
                this.step = 'tools';
            } else if (action === 'form-previous') this.step = 'basic';
            else if (action === 'form-manual') this.manual = { name:'',description:'',method:'GET',path:'/',effect:'read',parameters:[] };
            else if (action === 'form-manual-cancel') this.manual = undefined;
            else if (action === 'form-add-param' && this.manual) this.manual.parameters.push({ name:'',type:'string',location:'query',required:false });
            else if (action.startsWith('form-remove-param-')) {
                const index = this.removalIndex(action.slice('form-remove-param-'.length), this.manual?.parameters.length ?? 0);
                this.manual!.parameters.splice(index, 1);
            }
            else if (action.startsWith('form-transport-') && !draft.id) {
                const type = action.slice('form-transport-'.length);
                if (type === 'mcp-http' || type === 'mcp-stdio') { draft.type = type; return { handled:true,changed:true }; }
            } else if (action.startsWith('form-remove-')) {
                const tools = parseDraftTools(draft); tools.splice(this.removalIndex(action.slice('form-remove-'.length), tools.length),1); draft.toolsJson = JSON.stringify(tools,null,2); return { handled:true,changed:true };
            } else if (action === 'form-manual-save' && this.manual) {
                const tools = parseDraftTools(draft), tool = this.compileManual(this.manual);
                if (tools.some(existing => existing.id === tool.id || existing.name === tool.name)) throw new Error('工具名称已存在，请使用不同的名称。');
                draft.toolsJson = JSON.stringify([...tools,tool],null,2); this.manual = undefined; return { handled:true,changed:true };
            }
            return { handled:true };
        } catch (error) { return { handled:true,error:(error as Error).message }; }
    }
    private removalIndex(value: string, length: number): number {
        const index = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(index) || index < 0 || index >= length) throw new Error('此项目已变化，请重新选择要移除的项目。');
        return index;
    }
    private compileManual(draft: ManualToolDraft): ApiOperation {
        const name = draft.name.trim(), path = draft.path.trim();
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('工具名称需以字母开头，并仅包含字母、数字或下划线（最多 64 个字符）。');
        if (!draft.description.trim()) throw new Error('请填写工具的用途说明。');
        if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || /[\\\u0000-\u001f\u007f?#]/.test(path) || /[{}]/.test(path.replace(/\{[A-Za-z][A-Za-z0-9_]{0,63}\}/g, ''))) throw new Error('接口路径须以 / 开头；查询条件请添加为查询参数。');
        if (!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(draft.method)) throw new Error('请选择有效的请求方法。');
        const effect = ['GET','HEAD'].includes(draft.method) ? 'read' : draft.method === 'DELETE' ? 'destructive' : 'write';
        if (draft.effect !== effect) throw new Error('操作性质与请求方法不一致，请重新选择。');
        const properties: Record<string,unknown> = {}, required: string[] = [], queryParams: string[] = [], pathParams: string[] = [];
        let bodyKey: string | undefined;
        for (const parameter of draft.parameters) {
            const key = parameter.name.trim();
            if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || Object.hasOwn(properties,key)) throw new Error('参数名不能为空、重复或包含特殊字符。');
            if (!['string','number','boolean','object'].includes(parameter.type) || !['query','path','body'].includes(parameter.location)) throw new Error('请选择有效的参数类型与位置。');
            if (parameter.location !== 'body' && parameter.type === 'object') throw new Error('查询和路径参数不能使用对象类型。');
            properties[key] = { type:parameter.type };
            if (parameter.required || parameter.location === 'path') required.push(key);
            if (parameter.location === 'query') queryParams.push(key);
            if (parameter.location === 'path') pathParams.push(key);
            if (parameter.location === 'body') { if (bodyKey || ['GET','HEAD'].includes(draft.method)) throw new Error('请求正文只支持一个参数，且不能用于 GET / HEAD。'); bodyKey = key; }
        }
        const paths = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]!);
        if (paths.some(key => !pathParams.includes(key)) || pathParams.some(key => !paths.includes(key))) throw new Error('接口路径中的占位符必须与路径参数对应。');
        return { id:name,name,description:draft.description.trim(),method:draft.method,path,effect,inputSchema:{ type:'object',properties,required,additionalProperties:false },queryParams,pathParams,...(bodyKey ? {bodyKey} : {}) };
    }
}
