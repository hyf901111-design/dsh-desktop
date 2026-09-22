import { afterEach, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { ConnectionFormController } from '../src/preload/integrations/connection-form-controller';
import { connectionForm, parseDraftTools } from '../src/preload/integrations/forms';
import { emptyConnectionDraft } from '../src/shared/integration-ui';
import { HttpApiAdapter } from '../src/main/integrations/adapters/http-api';

const windows: Window[] = [], servers: Server[] = [];
afterEach(async () => {
    for (const w of windows.splice(0)) await w.happyDOM.close();
    for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
function fixture() {
    const w = new Window(); windows.push(w);
    const doc = w.document as unknown as Document;
    const controller = new ConnectionFormController(), draft = { ...emptyConnectionDraft(), name: '自己的数据', url: 'https://example.test/v1' };
    const action = (name: string) => controller.action(name, draft);
    const input = (name: string, value: string | boolean) => {
        const target = doc.createElement('input'); target.name = name;
        if (typeof value === 'boolean') target.checked = value; else target.value = value;
        return controller.input(target as unknown as HTMLInputElement, draft);
    };
    const render = () => { const root = doc.createElement('main'); root.innerHTML = controller.render(draft); doc.body.replaceChildren(root); return root; };
    const manual = (method = 'GET', path = '/items') => {
        expect(action('form-next').error).toBeUndefined(); action('form-manual');
        input('manual-name', 'read_items'); input('manual-description', '读取接口中的实际资料'); input('manual-method', method); input('manual-path', path);
    };
    let parameterIndex = 0;
    const parameter = (name: string, type: string, location: string, required = false) => {
        const index = parameterIndex++; action('form-add-param');
        input(`manual-param-${index}-name`, name); input(`manual-param-${index}-type`, type); input(`manual-param-${index}-location`, location); input(`manual-param-${index}-required`, required);
    };
    return { w, doc, controller, draft, action, input, render, manual, parameter };
}

describe('connection form controller and request definitions', () => {
    it('provides the correct single page title for each connection and wizard state', () => {
        const f = fixture();
        expect(f.controller.title(f.draft)).toBe('添加自定义 API');
        f.action('form-next'); expect(f.controller.title(f.draft)).toBe('配置可用工具');
        f.action('form-manual'); expect(f.controller.title(f.draft)).toBe('手动添加工具');
        expect(f.render().querySelector('h2')?.textContent).toBe('请求参数');
        f.action('form-manual-cancel'); expect(f.controller.title(f.draft)).toBe('配置可用工具');
        f.controller.reset(); f.draft.id = 'saved'; expect(f.controller.title(f.draft)).toBe('管理连接');
        delete f.draft.id; f.draft.type = 'mcp-stdio'; expect(f.controller.title(f.draft)).toBe('添加 MCP 服务器');
        f.draft.type = 'notion'; expect(f.controller.title(f.draft)).toBe('连接应用');
    });

    it('sends the compiled path, scalar query and one JSON body through the real HTTP adapter', async () => {
        const f = fixture(); f.manual('POST', '/items/{itemId}');
        f.parameter('itemId', 'string', 'path'); f.parameter('limit', 'number', 'query'); f.parameter('active', 'boolean', 'query'); f.parameter('payload', 'object', 'body', true);
        expect(f.action('form-manual-save')).toEqual({ handled: true, changed: true });
        const [operation] = parseDraftTools(f.draft);
        expect(operation).toMatchObject({ method: 'POST', effect: 'write', path: '/items/{itemId}', pathParams: ['itemId'], queryParams: ['limit', 'active'], bodyKey: 'payload', inputSchema: { required: ['itemId', 'payload'], additionalProperties: false } });
        const nonce = randomUUID(), calls: Array<{ method?: string; path: string; limit: string | null; active: string | null; body: unknown }> = [];
        const server = createServer(async (request, response) => {
            let body = ''; for await (const chunk of request) body += chunk;
            const url = new URL(request.url!, 'http://localhost');
            calls.push({ method: request.method, path: url.pathname, limit: url.searchParams.get('limit'), active: url.searchParams.get('active'), body: JSON.parse(body) });
            response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ nonce }));
        });
        servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const adapter = new HttpApiAdapter({ read: async () => { throw Error('No credential is needed by this fixture'); } });
        const result = await adapter.invoke({ type: 'api', baseUrl: `${origin}/v1`, auth: { type: 'none' }, network: { allowLocal: true, allowedOrigins: [origin] }, operations: [operation!] }, operation!.id, { itemId: '资料/a b', limit: 0, active: false, payload: { title: '真实请求', count: 2 } }, new AbortController().signal);
        expect(calls).toEqual([{ method: 'POST', path: '/v1/items/%E8%B5%84%E6%96%99%2Fa%20b', limit: '0', active: 'false', body: { title: '真实请求', count: 2 } }]);
        expect(result.content[0]?.text).toContain(nonce);
        expect(f.draft).not.toHaveProperty('toolGrants');
    });

    it('keeps the entire manual draft and existing tools when a save fails, then permits correction', () => {
        const f = fixture(); f.manual('GET', '/items/{id}'); f.parameter('filter', 'string', 'query');
        const before = f.draft.toolsJson;
        expect(f.action('form-manual-save').error).toContain('路径参数');
        expect(f.draft.toolsJson).toBe(before);
        expect(f.render().querySelector<HTMLInputElement>('[name=manual-name]')!.value).toBe('read_items');
        expect(f.render().querySelector<HTMLInputElement>('[name=manual-param-0-name]')!.value).toBe('filter');
        f.input('manual-path', '/items');
        expect(f.action('form-manual-save').changed).toBe(true);
        expect(parseDraftTools(f.draft)[0]?.queryParams).toEqual(['filter']);
    });

    it('updates the operation effect on every method change and never saves a contradictory label', () => {
        const f = fixture(); f.manual('POST');
        const effect = f.render().querySelector<HTMLInputElement>('[name=manual-effect]')!;
        expect(effect.readOnly).toBe(true);
        expect(effect.value).toBe('写入：新增或修改');
        expect(effect.closest('label')!.textContent).toContain('由请求方法确定');
        expect(f.render().querySelector('select[name=manual-effect]')).toBeNull();
        f.input('manual-method', 'DELETE');
        expect(f.render().querySelector<HTMLInputElement>('[name=manual-effect]')!.value).toBe('删除或不可逆操作');
        f.input('manual-method', 'GET');
        expect(f.render().querySelector<HTMLInputElement>('[name=manual-effect]')!.value).toBe('只读：查询数据');
        f.input('manual-effect', 'write');
        expect(f.action('form-manual-save').error).toBeDefined();
        expect(f.draft.toolsJson).toBe('[]');
    });

    it.each(['/items/{id', '/items/id}', '/items/{id}}', '/items\\other', '/items\u0001'])('rejects malformed paths without consuming the draft: %s', path => {
        const f = fixture(); f.manual('GET', path);
        expect(f.action('form-manual-save').error).toBeDefined();
        expect(f.render().querySelector('[name=manual-name]')).not.toBeNull();
        expect(f.draft.toolsJson).toBe('[]');
    });

    it.each([['manual-method', 'TRACE'], ['manual-param-0-type', 'file'], ['manual-param-0-location', 'header']])('rejects unsupported definition values from %s', (key, value) => {
        const f = fixture(); f.manual(); f.parameter('value', 'string', 'query'); f.input(key, value);
        expect(f.action('form-manual-save').error).toBeDefined(); expect(f.draft.toolsJson).toBe('[]');
    });

    it('rejects duplicate bodies, GET bodies and object query values before changing tools JSON', () => {
        for (const [method, parameters] of [['POST', [['a', 'body'], ['b', 'body']]], ['GET', [['a', 'body']]], ['GET', [['a', 'query']]]] as const) {
            const f = fixture(); f.manual(method); for (const [name, location] of parameters) f.parameter(name, 'object', location);
            expect(f.action('form-manual-save').error).toBeDefined(); expect(f.draft.toolsJson).toBe('[]');
        }
    });

    it('does not delete a different tool for malformed or stale remove actions', () => {
        const f = fixture(); f.manual(); expect(f.action('form-manual-save').changed).toBe(true);
        const before = f.draft.toolsJson;
        for (const action of ['form-remove-param-0', 'form-remove-bad', 'form-remove--1', 'form-remove-1', 'form-remove-0.5']) {
            expect(f.action(action).changed).not.toBe(true); expect(f.draft.toolsJson).toBe(before);
        }
        expect(f.action('form-remove-0').changed).toBe(true); expect(parseDraftTools(f.draft)).toEqual([]);
    });

    it('rejects a queried base URL at the basic step and preserves credentials and other fields', () => {
        const f = fixture(); f.draft.url = 'https://example.test/v1?token=not-a-real-token'; f.draft.secret = 'local-unsaved';
        expect(f.action('form-next').error).toBeDefined(); expect(f.render().querySelector('[name=url]')).not.toBeNull();
        expect(f.draft.secret).toBe('local-unsaved');
        f.draft.url = 'https://example.test/v1'; expect(f.action('form-next').error).toBeUndefined();
        f.action('form-previous'); expect(f.draft.secret).toBe('local-unsaved');
    });

    it('preserves both transport drafts while preventing a saved connection type from changing', () => {
        const f = fixture(); Object.assign(f.draft, { type: 'mcp-http', url: 'https://mcp.example.test', command: 'node', args: 'server.js', env: 'LOCAL_KEY=value', secret: 'draft-secret' });
        expect(f.action('form-transport-mcp-stdio').changed).toBe(true); expect(f.render().querySelector<HTMLTextAreaElement>('[name=env]')!.value).toBe('LOCAL_KEY=value');
        expect(f.action('form-transport-mcp-http').changed).toBe(true); expect(f.render().querySelector<HTMLInputElement>('[name=url]')!.value).toBe('https://mcp.example.test');
        f.draft.id = 'saved'; f.action('form-transport-mcp-stdio'); expect(f.draft.type).toBe('mcp-http'); expect(f.draft.secret).toBe('draft-secret');
    });

    it('escapes saved names, descriptions and secrets without creating active markup', () => {
        const f = fixture(), hostile = '\"><img src=x onerror=alert(1)><script>bad()</script>';
        Object.assign(f.draft, { name: hostile, secret: hostile, authType: 'bearer' });
        f.doc.body.innerHTML = connectionForm(f.draft);
        expect(f.doc.querySelector('img,script')).toBeNull();
        expect(f.doc.querySelector<HTMLInputElement>('[name=secret]')!.type).toBe('password');
        expect(f.doc.querySelector<HTMLInputElement>('[name=secret]')!.value).toBe(hostile);
        f.manual(); f.input('manual-description', '</textarea>' + hostile); const doc = f.render();
        expect(doc.querySelector('img,script')).toBeNull(); expect(doc.querySelector<HTMLTextAreaElement>('[name=manual-description]')!.value).toBe('</textarea>' + hostile);
    });
});
