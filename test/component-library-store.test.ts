import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentLibraryStore, installComponentLibrary } from '../src/main/state/component-library';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const node = () => ({ id: 'original', messageId: 'message', kind: 'generated-container', title: '收入监控', displayName: '收入概览', excerpt: '原内容', x: 300, y: 400, width: 480, height: 320, sizeMode: 'manual', generationStatus: 'completed', containerSpec: { version: 1, type: 'table', title: '收入监控', columns: ['项目', '金额'], rows: [['销售', 120]] }, sourceNodeIds: ['source'], creationMode: 'selection', generationTaskId: 'old-task' });
async function fixture() { const dir = await mkdtemp(join(tmpdir(), 'ework-library-')); dirs.push(dir); const file = join(dir, 'library.json'), store = new ComponentLibraryStore(file); await store.load(); return { file, store }; }
it('保存独立快照，重复添加去重，重命名、重启恢复和删除不修改源组件', async () => {
    const { file, store } = await fixture(), original = node(), entry = await store.add(original);
    expect(store.list()).toEqual([{ id: entry.id, name: '收入概览' }]);
    original.containerSpec.rows[0]![1] = 999;
    expect(store.read(entry.id).node.containerSpec).toMatchObject({ rows: [['销售', 120]] });
    expect(store.read(entry.id).node).not.toHaveProperty('sourceNodeIds');
    expect(store.read(entry.id).node).not.toHaveProperty('generationTaskId');
    expect((await store.add(node())).id).toBe(entry.id);
    await store.rename(entry.id, '  每月收入  ');
    const reopened = new ComponentLibraryStore(file);
    await reopened.load();
    expect(reopened.list()).toEqual([{ id: entry.id, name: '每月收入' }]);
    expect(reopened.read(entry.id).node).toMatchObject({ title: '每月收入', displayName: '每月收入', width: 480, height: 320 });
    await reopened.remove(entry.id);
    expect(reopened.list()).toEqual([]);
    expect(node().displayName).toBe('收入概览');
});
it('拒绝内置组件、未完成内容、空名称和不存在的条目', async () => {
    const { store } = await fixture();
    for (const n of [{ ...node(), containerSpec: { type: 'financial-widget' } }, { ...node(), containerSpec: { type: 'calendar-tool' } }, { ...node(), generationStatus: 'running' }, { ...node(), kind: 'file' }, { ...node(), containerSpec: undefined, excerpt: '' }])
        await expect(store.add(n)).rejects.toThrow();
    const item = await store.add(node());
    await expect(store.rename(item.id, ' ')).rejects.toThrow();
    await expect(store.remove('missing')).rejects.toThrow();
    expect(() => store.read('missing')).toThrow();
    expect(store.list()).toHaveLength(1);
});
it('原配置的刷新间隔和映射被保存，只允许相同账户恢复绑定', async () => {
    const { store } = await fixture(), recipe = { templateId: 'table', templateVersion: '1', intervalMinutes: 1, enabled: true, requests: [{ key: 'q', toolId: 'public_data_query', args: { sourceId: 'quotes' } }], mapping: { title: '收入' } };
    const item = await store.add(node(), recipe, 'owner-one');
    expect(store.read(item.id, 'owner-one').recipe).toEqual(recipe);
    expect(store.read(item.id, 'owner-two').recipe).toBeUndefined();
});
it('自定义组件重启恢复时保留完整来源方案与选择，移除旧连接授权元数据', async () => {
    const {file,store}=await fixture(),request={key:'q',toolId:'price',args:{code:'600519'},connectionId:'private-connection',connectionRevision:9,schemaDigest:'old'},mapping={title:'收入'};
    const saved={templateId:'table',templateVersion:'1',intervalMinutes:5,enabled:true,requests:[request],mapping,sourceId:'backup',sources:[{id:'default',name:'主来源',requests:[{...request,toolId:'primary'}],mapping},{id:'backup',name:'备用来源',requests:[request],mapping}]};
    const entry=await store.add(node(),saved,'owner'),restarted=new ComponentLibraryStore(file);await restarted.load();
    const restored=restarted.read(entry.id,'owner').recipe as any;
    expect(restored.sourceId).toBe('backup');expect(restored.sources.map((s:any)=>s.id)).toEqual(['default','backup']);
    expect(restored.sources[1].requests[0]).toEqual({key:'q',toolId:'price',args:{code:'600519'}});
    expect(restarted.read(entry.id,'other').recipe).toBeUndefined();
});
it('损坏的持久文件保留原文件，失败写入不发布内存更新', async () => {
    const { file, store } = await fixture(), item = await store.add(node());
    await writeFile(file, 'bad json');
    const reopened = new ComponentLibraryStore(file);
    await expect(reopened.load()).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('bad json');
    await rm(file);
    // A directory at the destination makes atomic rename fail.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(file);
    await expect(store.rename(item.id, '写入失败')).rejects.toThrow();
    expect(store.list()[0]!.name).toBe('收入概览');
});
it('旧版总结和导图保存为独立内容，派生组件保留原文但不保留跨看板节点链接', async () => {
    const { store } = await fixture();
    for (const kind of ['generated-summary', 'generated-mind-map']) {
        const e = await store.add({ ...node(), kind, containerSpec: undefined, excerpt: '# 研究\n- 行情\n  - 风险' });
        expect(store.read(e.id).node).toMatchObject({ kind: 'generated-container', containerPrompt: '自定义组件', refreshMinutes: 0, containerSpec: { type: kind === 'generated-summary' ? 'markdown' : 'mind-map', content: '# 研究\n- 行情\n  - 风险' } });
    }
    const e = await store.add({ ...node(), containerSpec: { version: 1, type: 'summary', title: '总结', content: '风险分析', source: { title: '材料', text: '完整原文', nodeId: 'source' } } });
    expect((store.read(e.id).node.containerSpec as any).source).toEqual({ title: '材料', text: '完整原文' });
});
it('IPC仅信任主窗口，保存从真实画布读取当前节点而非调用者传入的内容', async () => {
    const { file } = await fixture(), webContents = { mainFrame: { processId: 1, routingId: 2 } }, window = { isDestroyed: () => false, webContents };
    let handler: any;
    await installComponentLibrary({ ipcMain: { handle: (_channel: string, fn: any) => handler = fn }, getWindow: () => window, file, readCanvas: () => ({ artifacts: [node()] }), getBinding: () => undefined, owner: () => undefined });
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const saved = await handler(event, { action: 'save', sessionId: 'session', nodeId: 'original', node: { title: '伪造' } });
    expect(saved.name).toBe('收入概览');
    expect(() => handler({ ...event, senderFrame: { processId: 1, routingId: 3 } }, { action: 'list' })).toThrow('main EWork Odyssey window');
    await expect(handler(event, { action: 'save', sessionId: 'session', nodeId: 'missing' })).rejects.toThrow();
});
it('saves a strict native financial snapshot with independent configuration and no external links',async()=>{
 const {financialWidgetDefaults}=await import('../packages/dsh-research-task-runtime/financial-widget-contract.js'),{file,store}=await fixture(),spec={...financialWidgetDefaults('quote')!,symbols:[{code:'AAPL',market:'US',name:'模拟标的'}],period:'1w',dataSource:'backup',linkedWatchlistId:'external-board'},original={...node(),title:'模拟行情',displayName:'模拟行情',containerSpec:spec}
 const saved=await store.add(original,undefined,'owner'),reopened=new ComponentLibraryStore(file);await reopened.load();expect(reopened.list()).toContainEqual(saved)
 const restored=reopened.read(saved.id,'owner').node;expect(restored).toMatchObject({id:'custom-template',x:0,y:0,containerSpec:{symbols:spec.symbols,period:'1w',dataSource:'backup'}});expect(restored.containerSpec).not.toHaveProperty('linkedWatchlistId');expect(restored).not.toHaveProperty('messageId')
 ;(restored.containerSpec as any).period='1y';expect((reopened.read(saved.id).node.containerSpec as any).period).toBe('1w');expect(spec.period).toBe('1w')
 for(const key of ['price','script'])await expect(store.add({...original,containerSpec:{...spec,[key]:17}})).rejects.toThrow();expect(store.list()).toHaveLength(1)
})
it('retains linked security news semantics through save, reload and independent note or research placement',async()=>{
 const {financialWidgetDefaults}=await import('../packages/dsh-research-task-runtime/financial-widget-contract.js'),{noteLibraryNode}=await import('../src/main/notes/component-library'),{file,store}=await fixture(),spec={...financialWidgetDefaults('news')!,symbols:[{code:'AAPL',market:'US',name:'苹果'}],query:'',linkedSourceId:'source-security'},original={...node(),title:'证券新闻',displayName:'证券新闻',containerSpec:spec},entry=await store.add(original),restart=new ComponentLibraryStore(file);await restart.load()
 const research=restart.read(entry.id).node,noteA=noteLibraryNode(restart,entry.id,'owner'),noteB=noteLibraryNode(restart,entry.id,'owner');for(const placed of [research,noteA,noteB]){expect(placed.containerSpec).toMatchObject({type:'financial-widget',widget:'news',query:'苹果',symbols:spec.symbols});expect(placed.containerSpec).not.toHaveProperty('linkedSourceId')}
 expect(noteA.id).not.toBe(noteB.id);noteA.containerSpec.query='副本查询';expect(noteB.containerSpec.query).toBe('苹果');expect(spec.query).toBe('')
 await expect(store.add({...original,containerSpec:{...spec,symbols:[]}})).rejects.toThrow();expect(store.list()).toHaveLength(1)
})
