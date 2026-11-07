import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sanitizeResearchClipboardNode, type ClipboardNode } from './research-canvas-clipboard';
import { registerTrustedMainWindowHandler, type TrustedWindow } from '../ipc-trust';
import { financialWidgetSpec } from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js';
import { detachConversationComponentNode, type JsonObject } from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js';
type Recipe = {
    templateId: string;
    templateVersion: string;
    intervalMinutes: number;
    enabled: boolean;
    requests: unknown[];
    mapping: Record<string, unknown>;
    sourceId?:string;
    sources?:Array<{id:string;name:string;requests:unknown[];mapping:Record<string,unknown>}>;
};
type Entry = {
    id: string;
    name: string;
    fingerprint: string;
    node: ClipboardNode;
    recipe?: Recipe;
    owner?: string;
};
const label = (v: unknown) => { if (typeof v !== 'string' || !v.trim() || v.trim().length > 120)
    throw Error('组件名称需为 1–120 个字符'); return v.trim(); };
export function canSaveCustomComponent(node: any) { return Boolean(node && ['generated-container', 'generated-summary', 'generated-mind-map'].includes(node.kind) && node.generationStatus === 'completed' && node.containerSpec?.type !== 'calendar-tool' && (node.containerSpec?.type !== 'financial-widget' || financialWidgetSpec(node.containerSpec) !== null) && (node.containerSpec || typeof node.excerpt === 'string' && node.excerpt.trim())); }
function snapshot(value: unknown) {
    if (!canSaveCustomComponent(value))
        throw Error('请先完成组件生成，再添加至组件库');
    const clean = sanitizeResearchClipboardNode(value);
    const node = structuredClone((clean.containerSpec as any)?.type === 'financial-widget'
        ? detachConversationComponentNode(clean as JsonObject) as ClipboardNode : clean);
    // Keep content and geometry, discard links into the originating board/session.
    for (const key of ['sourceNodeIds', 'generationSources', 'creationMode', 'messageId'])
        delete node[key];
    if (node.kind !== 'generated-container') {
        node.containerSpec = { version: 1, type: node.kind === 'generated-mind-map' ? 'mind-map' : 'markdown', title: node.title, content: node.excerpt };
        node.kind = 'generated-container';
    }
    node.containerPrompt = typeof node.containerPrompt === 'string' ? node.containerPrompt : '自定义组件';
    node.refreshMinutes = 0;
    const spec = node.containerSpec as any;
    if (spec?.source?.nodeId) {
        spec.source = { ...spec.source };
        delete spec.source.nodeId;
    }
    node.x = 0;
    node.y = 0;
    node.id = 'custom-template';
    return node;
}
function recipe(value: any): Recipe | undefined {
    if (value === undefined)
        return;
    if (!value || typeof value.templateId !== 'string' || typeof value.templateVersion !== 'string' || !Number.isInteger(value.intervalMinutes) || value.intervalMinutes < 0 || value.intervalMinutes > 10080 || typeof value.enabled !== 'boolean' || !Array.isArray(value.requests) || !value.requests.length || value.requests.length > 16 || !value.mapping || typeof value.mapping !== 'object' || Array.isArray(value.mapping))
        throw Error('组件数据配置无效');
    const requests=(rows:any[])=>rows.map((r:any)=>({key:r.key,toolId:r.toolId,args:r.args}));
    const result:Recipe = { templateId: value.templateId, templateVersion: value.templateVersion, intervalMinutes: value.intervalMinutes, enabled: value.enabled, requests: requests(value.requests), mapping: value.mapping };
    if(value.sources!==undefined){
        if(!Array.isArray(value.sources)||!value.sources.length||value.sources.length>5||new Set(value.sources.map((s:any)=>s?.id)).size!==value.sources.length||!value.sources.some((s:any)=>s.id===value.sourceId)||value.sources.some((s:any)=>!s||typeof s.id!=='string'||!/^[a-zA-Z0-9][\w.-]{0,63}$/.test(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>128||!Array.isArray(s.requests)||!s.requests.length||s.requests.length>16||!s.mapping||typeof s.mapping!=='object'||Array.isArray(s.mapping)))throw Error('组件数据源方案无效');
        result.sourceId=value.sourceId;
        result.sources=value.sources.map((s:any)=>({id:s.id,name:s.name,requests:requests(s.requests),mapping:s.mapping}));
    }
    if (Buffer.byteLength(JSON.stringify(result)) > 256000)
        throw Error('组件数据配置过大');
    return structuredClone(result);
}
export class ComponentLibraryStore {
    private entries: Entry[] = [];
    private queue: Promise<unknown> = Promise.resolve();
    constructor(private file: string) { }
    async load() {
        let text: string;
        try {
            text = await readFile(this.file, 'utf8');
        }
        catch (e: any) {
            if (e.code === 'ENOENT')
                return;
            throw e;
        }
        if (Buffer.byteLength(text) > 24 * 1024 * 1024)
            throw Error('组件库文件过大，原文件已保留');
        const state = JSON.parse(text), ids = new Set();
        if (state?.version !== 1 || !Array.isArray(state.items) || state.items.length > 100)
            throw Error('组件库读取失败，原文件已保留');
        const items = state.items.map((e: any) => { if (typeof e.id !== 'string' || !/^[a-f0-9-]{36}$/.test(e.id) || ids.has(e.id) || typeof e.fingerprint !== 'string' || e.owner !== undefined && typeof e.owner !== 'string')
            throw Error('组件库条目无效'); ids.add(e.id); return { ...e, name: label(e.name), node: snapshot(e.node), recipe: recipe(e.recipe) }; });
        this.entries = items;
    }
    list() { return this.entries.map(({ id, name }) => ({ id, name })); }
    read(id: string, owner?: string): {
        node: ClipboardNode;
        recipe?: Recipe;
    } { const e = this.entries.find(e => e.id === id); if (!e)
        throw Error('组件库条目不存在'); return structuredClone({ node: { ...e.node, title: e.name, displayName: e.name }, ...(e.recipe && e.owner === owner ? { recipe: e.recipe } : {}) }); }
    private mutate<T>(change: (items: Entry[]) => T, guard:()=>boolean=()=>true): Promise<T> {
        const check=()=>{if(!guard())throw Error('组件操作已取消，宿主身份或权限已变化。');};
        const run=this.queue.catch(()=>{}).then(async()=>{
            check();const items=structuredClone(this.entries),result=change(items),text=JSON.stringify({version:1,items});
            if(Buffer.byteLength(text)>24*1024*1024)throw Error('组件库容量已满，请删除部分条目');
            await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';
            try{
                check();await writeFile(tmp,text+'\n',{encoding:'utf8',mode:0o600});check();await rename(tmp,this.file);
                this.entries=items;return structuredClone(result);
            }finally{await rm(tmp,{force:true}).catch(()=>{});}
        });this.queue=run;return run;
    }
    add(value: unknown, binding?: unknown, owner?: string, guard:()=>boolean=()=>true) { return this.mutate(items => { const node = snapshot(value), data = recipe(binding), fingerprint = createHash('sha256').update(JSON.stringify({ node, recipe: data, owner })).digest('hex'), old = items.find(e => e.fingerprint === fingerprint); if (old)
        return { id: old.id, name: old.name }; if (items.length >= 100)
        throw Error('自定义组件最多保存 100 项'); const e: Entry = { id: randomUUID(), name: label(String(node.displayName || node.title || '组件').slice(0,120)), fingerprint, node, recipe: data, owner }; items.push(e); return { id: e.id, name: e.name }; },guard); }
    rename(id: string, name: unknown) { return this.mutate(items => { const e = items.find(e => e.id === id); if (!e)
        throw Error('组件库条目不存在'); e.name = label(name); return { id: e.id, name: e.name }; }); }
    remove(id: string) { return this.mutate(items => { const at = items.findIndex(e => e.id === id); if (at < 0)
        throw Error('组件库条目不存在'); items.splice(at, 1); return { ok: true }; }); }
}
export async function installComponentLibrary(options: {
    ipcMain: any;
    getWindow: () => TrustedWindow | undefined;
    file: string;
    readCanvas: (sessionId: string) => {
        artifacts: any[];
    };
    getBinding: (sessionId: string, nodeId: string) => unknown;
    owner: () => string | undefined;
}) {
    const store = new ComponentLibraryStore(options.file);
    let failed = false;
    try {
        await store.load();
    }
    catch (e) {
        failed = true;
        console.error('[component-library] 读取失败，原文件已保留', e);
    }
    registerTrustedMainWindowHandler(options.ipcMain, 'research:component-library', options.getWindow, async (_event, v: any) => {
        if (failed)
            throw Error('组件库读取失败，原文件已保留');
        if (!v || typeof v !== 'object')
            throw Error('组件库参数无效');
        if (v.action === 'list')
            return store.list();
        if (v.action === 'save') {
            if (typeof v.sessionId !== 'string' || !v.sessionId || v.sessionId.length > 512 || typeof v.nodeId !== 'string' || !v.nodeId || v.nodeId.length > 512)
                throw Error('组件身份无效');
            const node = options.readCanvas(v.sessionId).artifacts.find(n => n.id === v.nodeId);
            return store.add(node, options.getBinding(v.sessionId, v.nodeId), options.owner());
        }
        if (typeof v.id !== 'string' || v.id.length > 128)
            throw Error('组件库条目无效');
        if (v.action === 'read')
            return store.read(v.id, options.owner());
        if (v.action === 'rename')
            return store.rename(v.id, v.name);
        if (v.action === 'remove')
            return store.remove(v.id);
        throw Error('不支持的组件库操作');
    });
    return failed ? undefined : store;
}
