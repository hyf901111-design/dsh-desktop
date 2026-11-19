import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { IntegrationView } from '../src/preload/integrations/view';
import type { IntegrationBridge, IntegrationCommand, IntegrationReply, IntegrationSnapshot } from '../src/preload/integrations/bridge';
const windows: Window[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.happyDOM.abort()); });
const snapshot = (): IntegrationSnapshot => ({ revision: 4, rows: [
        { id: 'plugin-1', kind: 'plugin', tab: 'plugins', name: '团队知识库', description: '引用团队资料', enabled: true, status: '需要连接应用', source: '个人', revision: 1, removable: true },
        { id: 'skill-1', kind: 'skill', tab: 'skills', name: '研究报告', description: '核实来源', enabled: true, status: '已启用', source: '个人', revision: 1, removable: true },
    ] });
async function fixture(handler?: (command: IntegrationCommand) => Promise<IntegrationReply>, useSkill?: IntegrationBridge['useSkill']) {
    const w = new Window();
    windows.push(w);
    const doc = w.document as unknown as Document;
    doc.body.innerHTML = '<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"><textarea>对话草稿</textarea></main>';
    const calls: IntegrationCommand[] = [];
    const bridge: IntegrationBridge = { useSkill, request: async (command) => { calls.push(command); if (handler)
            return handler(command); if (command.type === 'snapshot')
            return { type: 'snapshot', snapshot: snapshot() }; if (command.type === 'dependencies')
            return { type: 'dependencies', descriptions: ['1 个定时任务使用此插件'] }; if (command.type === 'market')
            return { type: 'market', entries: [] }; return { type: 'operation', operation: { id: 'op', status: 'succeeded', message: '已保存', cancellable: false } }; } };
    const view = new IntegrationView(doc, bridge);
    view.mount();
    await view.open();
    const click = (selector: string) => { const el = doc.querySelector<HTMLButtonElement>(selector); expect(el, selector).not.toBeNull(); el!.click(); };
    const settle = async () => { for (let i = 0; i < 8; i++)
        await Promise.resolve(); };
    const fill=(name:string,value:string)=>{const el=doc.querySelector<HTMLInputElement>(`[name="${name}"]`);expect(el,name).not.toBeNull();el!.value=value;el!.dispatchEvent(new w.Event('input',{bubbles:true}) as unknown as Event);};
    return { w, doc, calls, view, click, settle, fill };
}
it('allows builtin MCP toggles in list/menu/detail while keeping configuration and removal protected',async()=>{
 let enabled=true,revision=1
 const f=await fixture(async command=>{
  if(command.type==='snapshot')return {type:'snapshot',snapshot:{revision,rows:[{id:'builtin:datayes-mcp:1234567890abcdef',kind:'connection',tab:'mcp',name:'通联 DataYes MCP（内置）',description:'金融数据',enabled,status:enabled?'尚未验证调用':'已停用',source:'EWork 内置',revision,toggleable:true,configurable:false,removable:false,toolsReadonly:true,tools:[{id:'catalog',name:'get_catalog',description:'数据导航',allowed:true}]}]}}
  if(command.type==='set-enabled'){enabled=command.enabled;revision++;return {type:'operation',operation:{id:'builtin-toggle',status:'succeeded',message:'已保存',cancellable:false}}}
  throw new Error('Unexpected mutation')
 })
 f.click('[data-tab=mcp]')
 expect(f.doc.querySelector<HTMLButtonElement>('[role=switch]')?.disabled).toBe(false)
 f.click('[role=switch]');await f.settle()
 expect(enabled).toBe(false);expect(f.doc.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('false')
 f.click('[data-more]')
 expect(f.doc.querySelector('[data-menu-action=disconnect], [data-menu-action=uninstall]')).toBeNull()
 f.click('[data-menu-action=toggle]');await f.settle();expect(enabled).toBe(true)
 f.click('[data-more]');f.click('[data-menu-action=detail]');await f.settle()
 expect(f.doc.querySelector('[data-action=probe]')).not.toBeNull()
 expect(f.doc.querySelector('[data-action=disconnect], [data-action=edit-connection], [data-action=request-uninstall]')).toBeNull()
 f.click('[data-action=toggle-detail]');await f.settle();expect(enabled).toBe(false)
 f.click('[data-action=manage-tools]')
 expect(f.doc.querySelector<HTMLInputElement>('[name=toolGrant]')?.disabled).toBe(true)
 expect(f.doc.querySelector('[data-action=grant-tools], [data-action=toggle-all-tools]')).toBeNull()
 f.view.dispose()
})
it('renders compact text rows and all four market entries with retained workspace controls', async () => {
    const f = await fixture();
    const heading = f.doc.querySelector('.workspace-app-title[data-workspace-app="plugin"]');
    expect(heading?.textContent).toBe('插件');
    expect(heading?.querySelector('i[aria-hidden="true"]')).not.toBeNull();
    expect(f.doc.querySelector('[data-action=back]')).not.toBeNull();
    expect(f.doc.querySelector('[data-action=panel]')).toBeNull();
    expect(f.doc.querySelector('[data-row-id="plugin-1"]')!.textContent).toContain('需要连接应用');
    expect(f.doc.querySelector('[data-row-id="plugin-1"] .ig-row-main img, [data-row-id="plugin-1"] .ig-row-main svg')).toBeNull();
    for (const [tab, label] of [['plugins', '插件市场'], ['apps', '应用市场'], ['mcp', '工具市场'], ['skills', '技能市场']]) {
        f.click(`[data-tab=${tab}]`);
        expect(f.doc.querySelector('[data-action=market]')!.textContent).toBe(label);
    }
    expect(f.doc.querySelector('.ig-heading [data-action=add]')!.textContent).toBe('添加');
    expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('创建插件');
    f.view.dispose();
});
it('reloads the market after a new source has been added', async () => {
    let added = false;
    const f = await fixture(async command => {
        if (command.type === 'snapshot') return { type: 'snapshot', snapshot: snapshot() };
        if (command.type === 'market') return { type: 'market', entries: added ? [{ id: 'team:new', kind: 'plugin', name: '团队新插件', description: '', publisher: '团队', version: '1', installed: false, available: true, permissions: [] }] : [] };
        if (command.type === 'add-source') added = true;
        return { type: 'operation', operation: { id: 'source-op', status: 'succeeded', message: '已添加', cancellable: false } };
    });
    f.click('[data-action=market]');
    await f.settle();
    f.click('[data-action=add-source]');
    const input = f.doc.querySelector<HTMLInputElement>('[name=sourceUrl]')!;
    input.value = 'https://catalog.example.test/index.json';
    input.dispatchEvent(new f.w.Event('input', { bubbles: true }) as unknown as Event);
    f.click('[data-action=save-source]');
    await f.settle();
    expect(f.calls.filter(command => command.type === 'market')).toHaveLength(2);
    await vi.waitFor(() => expect(f.doc.querySelector('[data-market-entry="team:new"]')).not.toBeNull());
    expect(f.doc.querySelector('.ig-root')!.textContent).toContain('团队新插件');
    f.view.dispose();
});
it('opens a menu first, retrieves actual dependencies, and confirms before uninstalling', async () => {
    const f = await fixture();
    f.click('[data-more="plugin-1"]');
    expect(f.doc.querySelector('[role=menu]')).not.toBeNull();
    expect(f.doc.querySelector('[role=dialog]')).toBeNull();
    expect(f.calls.some(c => c.type === 'uninstall')).toBe(false);
    f.click('[data-menu-action=uninstall]');
    await f.settle();
    expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('1 个定时任务使用此插件');
    expect(f.calls.some(c => c.type === 'uninstall')).toBe(false);
    f.click('[data-action=confirm-uninstall]');
    await f.settle();
    expect(f.calls.find(c => c.type === 'uninstall')).toMatchObject({ id: 'plugin-1', meta: { expectedRevision: 1 } });
    f.view.dispose();
});
it('Escape returns menu focus and tab keyboard navigation selects the next category', async () => {
    const f = await fixture();
    f.click('[data-more="plugin-1"]');
    f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    expect(f.doc.querySelector('[role=menu]')).toBeNull();
    expect(f.doc.activeElement?.getAttribute('data-more')).toBe('plugin-1');
    const tab = f.doc.querySelector('[data-tab=plugins]')!;
    tab.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }) as unknown as Event);
    expect(f.doc.querySelector('[data-tab=apps]')!.getAttribute('aria-selected')).toBe('true');
    f.view.dispose();
});
it('keeps failed connection drafts, masks secrets, and never claims failed mutations connected', async () => {
    const f = await fixture(async (command) => { if (command.type === 'snapshot')
        return { type: 'snapshot', snapshot: snapshot() }; throw new Error('地址不可达'); });
    f.click('[data-tab=apps]');
    f.click('[data-action=add]');
    f.click('[data-add=api]');
    f.fill('authType','bearer');
    for (const [name, value] of [['name', '行情 API'], ['url', 'https://api.example.test'], ['secret', 'test-private-secret']] as const) {
        const input = f.doc.querySelector<HTMLInputElement>(`[name=${name}]`)!;
        input.value = value;
        input.dispatchEvent(new f.w.Event('input', { bubbles: true }) as unknown as Event);
    }
    expect(f.doc.querySelector<HTMLInputElement>('[name=secret]')!.type).toBe('password');
    f.click('[data-action=form-next]');f.fill('toolsJson',JSON.stringify([{id:'quote',name:'quote',description:'读取行情',method:'GET',path:'/quote',effect:'read',inputSchema:{type:'object'}}]));
    f.click('[data-action=save-connection]');
    await f.settle();
    expect(f.doc.querySelector('[role=alert]')!.textContent).toContain('地址不可达');
    f.click('[data-action=form-previous]');
    expect(f.doc.querySelector<HTMLInputElement>('[name=url]')!.value).toBe('https://api.example.test');
    expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('test-private-secret');
    f.view.dispose();
});
it('only imports a skill after displaying the backend preview', async () => {
    const f = await fixture(async (c) => { if (c.type === 'snapshot')
        return { type: 'snapshot', snapshot: snapshot() }; if (c.type === 'preview-skill')
        return { type: 'preview', preview: { previewId: 'preview-1', name: '我的技能', description: '说明', content: '# 可检查的正文', files: ['SKILL.md'], warnings: [] } }; return { type: 'operation', operation: { id: 'op', status: 'succeeded', message: '已导入', cancellable: false } }; });
    f.click('[data-tab=skills]');
    f.click('[data-action=add]');f.click('[data-action=import-file]');
    await f.settle();
    expect(f.doc.querySelector('.ig-root')!.textContent).toContain('# 可检查的正文');
    expect(f.calls.some(c => c.type === 'import-skill')).toBe(false);
    f.click('[data-action=import-skill]');
    await f.settle();
    expect(f.calls.find(c => c.type === 'import-skill')).toMatchObject({ previewId: 'preview-1', mode: 'copy' });
    f.view.dispose();
});
it('ignores a delayed market response after navigating away', async () => {
    let resolve!: (reply: IntegrationReply) => void;
    const f = await fixture(async (c) => { if (c.type === 'snapshot')
        return { type: 'snapshot', snapshot: snapshot() }; return new Promise(r => { resolve = r; }); });
    f.click('[data-action=market]');
    f.click('[data-action=back]');
    resolve({ type: 'market', entries: [{ id: 'late', kind: 'plugin', name: '迟到结果', description: '', publisher: '', version: '1', installed: false, available: true, permissions: [] }] });
    await f.settle();
    expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('迟到结果');
    expect(f.doc.querySelector('[data-tab=plugins]')).not.toBeNull();
    expect(f.doc.querySelector('[data-row-id="plugin-1"]')).not.toBeNull();
    f.view.dispose();
});
it('does not overwrite a newer API draft with a delayed OpenAPI parse', async () => {
    let resolve!: (reply: IntegrationReply) => void;
    const f = await fixture(async (c) => { if (c.type === 'snapshot')
        return { type: 'snapshot', snapshot: snapshot() }; return new Promise(r => { resolve = r; }); });
    f.click('[data-tab=apps]');
    f.click('[data-action=add]');
    f.click('[data-add=api]');
    f.click('[data-action=compile-openapi]');
    const input = f.doc.querySelector<HTMLInputElement>('[name=url]')!;
    input.value = 'https://new.example.test';
    input.dispatchEvent(new f.w.Event('input', { bubbles: true }) as unknown as Event);
    resolve({ type: 'compiled', toolsJson: '[{"id":"stale-tool"}]', diagnostics: [] });
    await f.settle();
    expect(f.doc.querySelector('[data-action=form-next]')).not.toBeNull();
    expect(f.doc.querySelector<HTMLInputElement>('[name=url]')!.value).toBe('https://new.example.test');
    expect(f.doc.querySelector('.ig-page')!.textContent).not.toContain('stale-tool');
    f.view.dispose();
});
it('preserves connection drafts when the right pane is collapsed and reopened', async () => {
    const f = await fixture();
    f.click('[data-tab=mcp]');
    f.click('[data-action=add]');
    f.click('[data-add=mcp-http]');
    const input = f.doc.querySelector<HTMLInputElement>('[name=url]')!;
    input.value = 'https://mcp.example.test';
    input.dispatchEvent(new f.w.Event('input', { bubbles: true }) as unknown as Event);
    expect(f.doc.querySelector('[data-action=panel]')).toBeNull();
    for (const open of [true, false]) f.w.dispatchEvent(new f.w.CustomEvent('sherlock:workspace-panel-state', { detail: { surface: 'integrations', open } }));
    expect(f.doc.querySelector<HTMLInputElement>('[name=url]')).toBe(input);
    expect(f.doc.querySelector<HTMLInputElement>('[name=url]')!.value).toBe('https://mcp.example.test');
    f.view.dispose();
});
it('clears pending UI state when a save completes after leaving that route', async () => {
    let resolve!: (reply: IntegrationReply) => void;
    const f = await fixture(async (c) => { if (c.type === 'snapshot')
        return { type: 'snapshot', snapshot: snapshot() }; return new Promise(r => { resolve = r; }); });
    f.click('[data-tab=apps]');
    f.click('[data-action=add]');
    f.click('[data-add=api]');
    for (const [name, value] of [['name', '行情'], ['url', 'https://old.example.test']] as const) {
        const input = f.doc.querySelector<HTMLInputElement>(`[name=${name}]`)!;
        input.value = value;
        input.dispatchEvent(new f.w.Event('input', { bubbles: true }) as unknown as Event);
    }
    f.click('[data-action=form-next]');f.fill('toolsJson',JSON.stringify([{id:'quote',name:'quote',description:'读取行情',method:'GET',path:'/quote',effect:'read',inputSchema:{type:'object'}}]));
    f.click('[data-action=save-connection]');
    f.click('[data-action=back]');
    resolve({ type: 'operation', operation: { id: 'done', status: 'succeeded', message: '已保存', entityId: 'old', cancellable: false } });
    await f.settle();
    expect(f.doc.querySelector('[data-tab=apps]')!.getAttribute('aria-selected')).toBe('true');
    f.click('[data-action=add]');f.click('[data-add=api]');
    expect(f.doc.querySelector<HTMLButtonElement>('[data-action=form-next]')!.disabled).toBe(false);
    expect(f.doc.querySelector('.ig-live')!.textContent).not.toContain('已保存');
    f.view.dispose();
});
it('offers the shared add menu from applications and opens API configuration directly', async () => {
    const f = await fixture();
    f.click('[data-tab=apps]');
    f.click('[data-action=add]');
    expect([...f.doc.querySelectorAll('[role=menu] [data-add]')].map(item => item.getAttribute('data-add'))).toEqual(['plugin','api','mcp-http']);
    expect(f.doc.querySelector('[data-tab=apps]')!.getAttribute('aria-selected')).toBe('true');
    expect(f.doc.querySelector('.ig-add-row')).toBeNull();
    f.click('[data-add=api]');
    expect(f.doc.querySelector('[name=url]')).not.toBeNull();
    expect(f.doc.querySelector('[data-action=form-next]')).not.toBeNull();
    f.view.dispose();
});
it('opens a market connection template as an editable draft before making any installation or connection', async () => {
 const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:snapshot()};if(c.type==='market')return{type:'market',entries:[{id:'bundled:notion',kind:'app',name:'Notion',description:'连接文档',publisher:'EWork',version:'1.0.0',installed:false,available:true,permissions:['读取授权页面'],blueprint:{type:'notion',name:'Notion'}}]};throw new Error('unexpected mutation')})
 f.click('[data-tab=apps]');f.click('[data-action=market]');await f.settle();f.click('[data-market-entry="bundled:notion"]');f.click('[data-action=install]');await f.settle()
 expect(f.doc.querySelector<HTMLInputElement>('[name=name]')?.value).toBe('Notion')
 expect(f.doc.querySelector<HTMLInputElement>('[name=secret]')?.type).toBe('password')
 expect(f.calls.some(c=>c.type==='install'||c.type==='save-connection')).toBe(false)
 f.view.dispose()
})
it('opens the matching current market version from check updates and installs a newer version', async()=>{
  const data=snapshot();Object.assign(data.rows[0]!,{marketEntryId:'bundled:knowledge',canRollback:true})
  const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(c.type==='market')return{type:'market',entries:[{id:'bundled:knowledge',kind:'plugin',name:'团队知识库',description:'新版研究工具',publisher:'EWork',version:'2.0.0',installed:false,available:true,permissions:[]}]};return{type:'operation',operation:{id:'update',status:'succeeded',message:'更新完成',cancellable:false}}})
  f.click('[data-more="plugin-1"]');f.click('[data-menu-action=check-update]');await f.settle()
  expect(f.doc.querySelector('.ig-page')!.textContent).toContain('版本 2.0.0')
  expect(f.doc.querySelector<HTMLButtonElement>('[data-action=install]')!.disabled).toBe(false)
  f.click('[data-action=install]');await f.settle()
  expect(f.calls.find(c=>c.type==='install')).toMatchObject({entryId:'bundled:knowledge',meta:{expectedRevision:4}})
  f.view.dispose()
})
it('confirms version rollback with dependency effects before submitting the exact entity revision', async()=>{
  const data=snapshot();Object.assign(data.rows[0]!,{canRollback:true})
  const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(c.type==='dependencies')return{type:'dependencies',descriptions:['1 个定时任务需要重新核对工具授权']};return{type:'operation',operation:{id:'rollback',status:'succeeded',message:'已回退',cancellable:false}}})
  f.click('[data-more="plugin-1"]');expect(f.doc.querySelector('[data-menu-action=check-update]')).toBeNull();f.click('[data-menu-action=rollback]');await f.settle()
  expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('应用账号连接会保留')
  expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('1 个定时任务需要重新核对工具授权')
  expect(f.calls.some(c=>c.type==='rollback-plugin')).toBe(false)
  f.click('[data-action=cancel-dialog]');expect(f.doc.querySelector('[role=dialog]')).toBeNull()
  f.click('[data-more="plugin-1"]');f.click('[data-menu-action=rollback]');await f.settle();f.click('[data-action=confirm-rollback]');await f.settle()
  expect(f.calls.find(c=>c.type==='rollback-plugin')).toMatchObject({id:'plugin-1',meta:{expectedRevision:1}})
  f.view.dispose()
})
it('keeps market eligibility disabled after render and busy-state updates',async()=>{
  const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:snapshot()}:c.type==='market'?{type:'market',entries:[{id:'current',kind:'plugin',name:'当前版本',description:'',publisher:'EWork',version:'1',installed:true,available:true,permissions:[]},{id:'blocked',kind:'plugin',name:'需要升级客户端',description:'',publisher:'EWork',version:'2',installed:false,available:false,permissions:[],unavailableReason:'客户端版本过低'}]}:{type:'operation',operation:{id:'x',status:'succeeded',message:'',cancellable:false}})
  f.click('[data-action=market]');await f.settle();f.click('[data-market-entry=current]');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=install]')!.disabled).toBe(true)
  f.click('[data-action=back]');f.click('[data-market-entry=blocked]');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=install]')!.disabled).toBe(true)
  f.view.dispose()
})
it('routes a successful install receipt to the actual created entity detail',async()=>{
  const data=snapshot();const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(c.type==='market')return{type:'market',entries:[{id:'new',kind:'skill',name:'新技能',description:'',publisher:'EWork',version:'1',installed:false,available:true,permissions:[]}]};return{type:'operation',operation:{id:'x',entityId:'skill-1',status:'succeeded',message:'已安装',cancellable:false}}})
  f.click('[data-tab=skills]');f.click('[data-action=market]');await f.settle();f.click('[data-market-entry=new]');f.click('[data-action=install]');await f.settle()
  expect(f.doc.querySelector('h1')!.textContent).toBe('研究报告');expect(f.doc.querySelector('[data-action=toggle-detail]')).not.toBeNull();f.view.dispose()
})
it('clears prior account UI and draft credentials immediately on identity change',async()=>{
  let data=snapshot();const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:{type:'market',entries:[]})
  f.click('[data-tab=apps]');f.click('[data-action=add]');f.click('[data-add=api]');f.fill('authType','bearer');const secret=f.doc.querySelector<HTMLInputElement>('[name=secret]')!;secret.value='previous-owner-secret';secret.dispatchEvent(new f.w.Event('input',{bubbles:true}) as unknown as Event)
  data={revision:10,rows:[],compatibilityStatus:'旧连接只读识别，尚未授权'}
  f.view.resetIdentity();await f.settle()
  expect(f.doc.querySelector('[name=secret]')).toBeNull();expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('团队知识库');expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('尚未授权')
  f.click('[data-tab=apps]');f.click('[data-action=add]');f.click('[data-add=api]');expect(f.doc.querySelector('[name=secret]')).toBeNull();f.fill('authType','bearer');expect(f.doc.querySelector<HTMLInputElement>('[name=secret]')!.value).toBe('');f.view.dispose()
})
it('does not publish a prior owner mutation receipt after identity reset',async()=>{
 let resolve!:(reply:IntegrationReply)=>void;let data=snapshot();const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:new Promise(r=>{resolve=r}))
 f.click('[data-toggle="plugin-1"]');data={revision:8,rows:[]};f.view.resetIdentity();await f.settle();resolve({type:'operation',operation:{id:'old',entityId:'plugin-1',status:'succeeded',message:'上一账号专有名称',cancellable:false}});await f.settle()
 expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('上一账号专有名称');expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('团队知识库');f.view.dispose()
})
it('keeps a reviewed skill preview if the replacement file chooser is cancelled',async()=>{
 let chosen=false;const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:snapshot()};if(c.type==='preview-skill'){const preview=chosen?null:{previewId:'reviewed',name:'已审阅技能',description:'说明',content:'技能正文',files:['SKILL.md'],warnings:[]};chosen=true;return{type:'preview',preview}};return{type:'operation',operation:{id:'x',status:'succeeded',message:'',cancellable:false}}})
 f.click('[data-tab=skills]');f.click('[data-action=add]');f.click('[data-action=import-file]');await f.settle();f.click('[data-action=choose-skill]');await f.settle();expect(f.doc.querySelector('.ig-preview')!.textContent).toBe('技能正文');f.view.dispose()
})

it('refreshes list data without persistent compatibility copy or replacing an active connection draft',async()=>{
 vi.useFakeTimers();let data=snapshot();let f:Awaited<ReturnType<typeof fixture>>|undefined;
 try {f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:{type:'market',entries:[]});data={...data,compatibilityStatus:'个人技能已复制完成'};await vi.advanceTimersByTimeAsync(5000);expect(f.doc.querySelector('.ig-root')!.textContent).not.toContain('个人技能已复制完成');f.click('[data-tab=apps]');f.click('[data-action=add]');f.click('[data-add=api]');const input=f.doc.querySelector<HTMLInputElement>('[name=url]')!;input.value='https://draft.example.test';input.dispatchEvent(new f.w.Event('input',{bubbles:true}) as unknown as Event);await vi.advanceTimersByTimeAsync(5000);expect(f.doc.querySelector('[name=url]')).toBe(input);expect(input.value).toBe('https://draft.example.test')}finally{f?.view.dispose();vi.useRealTimers()}
})
it('previews legacy skill scope before explicitly copying eligible skills',async()=>{
 const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:snapshot()};if(c.type==='legacy-preview')return{type:'legacy-preview',eligibleCount:1,items:[{name:'个人周报',status:'eligible'},{name:'内置分析',status:'compatibility',message:'保留原提供者与作用域'}]};return{type:'operation',operation:{id:'migration',status:'succeeded',message:'已复制接入，原文件保留',cancellable:false}}})
 f.click('[data-tab=skills]');f.click('[data-action=add]');f.click('[data-action=legacy-preview]');await f.settle();expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('个人周报');expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('保留原提供者与作用域');expect(f.calls.some(c=>c.type==='migrate-legacy-skills')).toBe(false)
 f.click('[data-action=confirm-legacy-migration]');await f.settle();expect(f.calls.find(c=>c.type==='migrate-legacy-skills')).toMatchObject({meta:{expectedRevision:4}});expect(f.doc.querySelector('[data-tab=skills]')!.getAttribute('aria-selected')).toBe('true');f.view.dispose()
})
it('does not allow legacy import when the preview has no eligible skills',async()=>{
 const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:snapshot()}:{type:'legacy-preview',eligibleCount:0,items:[{name:'内置技能',status:'compatibility'}]});f.click('[data-tab=skills]');f.click('[data-action=add]');f.click('[data-action=legacy-preview]');await f.settle();expect(f.doc.querySelector<HTMLButtonElement>('[data-action=confirm-legacy-migration]')!.disabled).toBe(true);f.click('[data-action=cancel-dialog]');expect(f.calls.some(c=>c.type==='migrate-legacy-skills')).toBe(false);f.view.dispose()
})

it('uses one connection title, a real summary aside, and an explicit right-aligned tool grant flow',async()=>{
 const data=snapshot();data.rows.push({id:'api',kind:'connection',tab:'apps',name:'基金数据 API',description:'自定义 API',enabled:true,status:'尚未验证',source:'个人连接',revision:8,connectionType:'api',removable:true,tools:[{id:'read',name:'查询净值',description:'读取净值',allowed:true},{id:'write',name:'写入记录',description:'修改记录',allowed:false}]});
 const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:{type:'operation',operation:{id:'grant',status:'succeeded',message:'已保存',cancellable:false}});f.click('[data-tab=apps]');f.click('[data-detail=api]');
 expect([...f.doc.querySelectorAll('h1,h2')].filter(el=>el.textContent==='基金数据 API')).toHaveLength(1);
 expect(f.doc.querySelector('.ig-detail-aside')!.textContent).toContain('尚未验证');
 expect(f.doc.querySelector('.ig-detail-aside')!.textContent).not.toContain('验证通过');
 expect(f.doc.querySelector('[name=toolGrant]')).toBeNull();f.click('[data-action=manage-tools]');
 expect(f.doc.querySelector('.ig-tool-actions [data-action=grant-tools]')).not.toBeNull();
 f.doc.querySelector<HTMLInputElement>('[name=toolGrant][value=write]')!.click();
 f.click('[data-action=grant-tools]');await f.settle();expect(f.calls.find(c=>c.type==='grant-tools')).toMatchObject({id:'api',toolIds:['read','write'],meta:{expectedRevision:8}});f.view.dispose()
})
it('selects and clears all discovered tools without saving until confirmed',async()=>{
 const data=snapshot();data.rows.push({id:'mcp',kind:'connection',tab:'mcp',name:'数据 MCP',description:'MCP 工具',enabled:true,status:'已连接',source:'个人连接',revision:8,connectionType:'mcp-http',removable:true,tools:[{id:'one',name:'工具一',description:'读取',allowed:true},{id:'two',name:'工具二',description:'检索',allowed:false}]});
 const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:{type:'operation',operation:{id:'grant',status:'succeeded',message:'已保存',cancellable:false}});
 f.click('[data-tab=mcp]');f.click('[data-detail=mcp]');f.click('[data-action=manage-tools]');
 const toggle=()=>f.doc.querySelector<HTMLButtonElement>('[data-action=toggle-all-tools]')!;
 expect(toggle().textContent).toBe('全选');
 f.click('[data-action=toggle-all-tools]');
 expect([...f.doc.querySelectorAll<HTMLInputElement>('[name=toolGrant]')].every(input=>input.checked)).toBe(true);
 expect(toggle().textContent).toBe('取消全选');
 expect(f.calls.some(c=>c.type==='grant-tools')).toBe(false);
 f.click('[data-action=toggle-all-tools]');
 expect([...f.doc.querySelectorAll<HTMLInputElement>('[name=toolGrant]')].every(input=>!input.checked)).toBe(true);
 expect(toggle().textContent).toBe('全选');
 f.click('[data-action=toggle-all-tools]');f.click('[data-action=grant-tools]');await f.settle();
 expect(f.calls.find(c=>c.type==='grant-tools')).toMatchObject({id:'mcp',toolIds:['one','two'],meta:{expectedRevision:8}});
 f.view.dispose();
})
it('opens add choices in place and returns directly to the originating list after creating a plugin draft',async()=>{
 const f=await fixture();f.click('[data-tab=mcp]');f.click('[data-action=add]');expect(f.doc.querySelector('h1')!.textContent).toBe('插件');expect(f.doc.querySelectorAll('.ig-add-row')).toHaveLength(0);expect(f.doc.querySelector('[role=menu] [data-add=plugin]')).not.toBeNull();f.click('[data-add=plugin]');expect(f.doc.querySelector('h1')!.textContent).toBe('创建插件');expect(f.doc.querySelector('[name=manifest]')).not.toBeNull();f.click('[data-action=back]');expect(f.doc.querySelector('[data-tab=mcp]')!.getAttribute('aria-selected')).toBe('true');f.view.dispose()
})
it('filters real market metadata and keeps installation permissions beside the primary action',async()=>{
 const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:snapshot()}:c.type==='market'?{type:'market',entries:[{id:'one',kind:'plugin',name:'研究报告',description:'核验资料',publisher:'EWork',version:'1.0',installed:false,available:true,permissions:['读取已授权资料'],category:'research'},{id:'two',kind:'plugin',name:'团队模板',description:'未分类条目',publisher:'团队',version:'1',installed:false,available:true,permissions:[]}]} as IntegrationReply:{type:'operation',operation:{id:'x',status:'succeeded',message:'',cancellable:false}});
 f.click('[data-action=market]');await f.settle();expect(f.doc.querySelectorAll('.ig-market-card')).toHaveLength(2);f.click('[data-market-category=research]');expect(f.doc.querySelectorAll('.ig-market-card')).toHaveLength(1);f.click('[data-market-entry=one]');expect(f.doc.querySelector('.ig-detail-aside')!.textContent).toContain('读取已授权资料');expect(f.doc.querySelector('.ig-detail-aside [data-action=install]')).not.toBeNull();expect(f.doc.querySelector('.ig-page .ig-card')).toBeNull();f.view.dispose()
})
it('keeps typing stable across the API steps and only saves a real manually defined tool',async()=>{
 const f=await fixture();f.click('[data-tab=apps]');f.click('[data-action=add]');f.click('[data-add=api]');
 const original=f.doc.querySelector('[name=name]');f.fill('name','行情服务');expect(f.doc.querySelector('[name=name]')).toBe(original);f.fill('url','https://api.example.test');f.fill('authType','bearer');expect(f.doc.querySelector('[name=secret]')).not.toBeNull();f.fill('secret','once-only-secret');f.click('[data-action=form-next]');
 expect(f.doc.querySelector<HTMLButtonElement>('[data-action=save-connection]')!.disabled).toBe(true);f.click('[data-action=form-manual]');f.fill('manual-name','read_quotes');f.fill('manual-description','读取最新行情');f.fill('manual-path','/quotes');f.click('[data-action=form-manual-save]');
 expect(f.doc.querySelector('.ig-api-tool')!.textContent).toContain('read_quotes');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=save-connection]')!.disabled).toBe(false);f.click('[data-action=save-connection]');await f.settle();const command=f.calls.find(c=>c.type==='save-connection');expect(command).toMatchObject({draft:{name:'行情服务',url:'https://api.example.test',authType:'bearer',secret:'once-only-secret'}});expect(command?.type==='save-connection'&&JSON.parse(command.draft.toolsJson)).toMatchObject([{id:'read_quotes',method:'GET',path:'/quotes',effect:'read'}]);f.view.dispose()
})
it('switches new MCP transport without losing the other transport draft',async()=>{
 const f=await fixture();f.click('[data-tab=mcp]');f.click('[data-action=add]');f.click('[data-add=mcp-http]');f.fill('name','研究工具');f.fill('url','https://mcp.example.test');f.click('[data-action=form-transport-mcp-stdio]');expect(f.doc.querySelector('[name=url]')).toBeNull();f.fill('command','mcp-research');f.click('[data-action=form-transport-mcp-http]');expect(f.doc.querySelector<HTMLInputElement>('[name=url]')!.value).toBe('https://mcp.example.test');f.click('[data-action=form-transport-mcp-stdio]');expect(f.doc.querySelector<HTMLInputElement>('[name=command]')!.value).toBe('mcp-research');f.view.dispose()
})
it('preserves revoked grant drafts through probe refresh and rejects new, removed, changed-schema or externally revoked tools',async()=>{
 const data=snapshot();const row={id:'api',kind:'connection' as const,tab:'apps' as const,name:'数据连接',description:'API',enabled:true,status:'已验证',source:'个人',revision:8,tools:[{id:'read',name:'查询',description:'读取',allowed:true},{id:'write',name:'写入',description:'修改',allowed:true},{id:'removed',name:'旧工具',description:'旧',allowed:true},{id:'changed',name:'同名工具',description:'修改',allowed:true},{id:'revoked',name:'外部撤权',description:'读取',allowed:true}]};data.rows.push(row);data.taskCapabilities=[{entityId:'api',kind:'connection',name:'数据连接',revision:8,available:true,tools:row.tools.map(t=>({...t,effect:'read' as const,schemaDigest:`${t.id}-v1`}))}];
 const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(c.type==='probe'){row.revision=9;row.tools=row.tools.filter(t=>t.id!=='removed').map(t=>({...t,allowed:t.id==='revoked'?false:t.allowed}));row.tools.push({id:'new',name:'新工具',description:'新增',allowed:true});data.taskCapabilities![0]!.tools=row.tools.map(t=>({...t,effect:'read',schemaDigest:`${t.id}-${t.id==='changed'?'v2':'v1'}`}));return{type:'probe',status:'verified',message:'已更新工具'}};if(c.type==='grant-tools')for(const tool of row.tools)tool.allowed=c.toolIds.includes(tool.id);return{type:'operation',operation:{id:'grant',status:'succeeded',message:'已保存',cancellable:false}}});
 f.click('[data-tab=apps]');f.click('[data-detail=api]');f.click('[data-action=manage-tools]');f.doc.querySelector<HTMLInputElement>('[name=toolGrant][value=write]')!.click();f.click('[data-action=probe]');await f.settle();
 for(const id of ['write','new','changed','revoked'])expect(f.doc.querySelector<HTMLInputElement>(`[name=toolGrant][value=${id}]`)!.checked,id).toBe(false);expect(f.doc.querySelector('[name=toolGrant][value=removed]')).toBeNull();expect(f.doc.querySelector<HTMLInputElement>('[name=toolGrant][value=read]')!.checked).toBe(true);
 await vi.waitFor(()=>expect(f.doc.querySelector<HTMLButtonElement>('[data-action=grant-tools]')!.disabled).toBe(false));f.click('[data-action=grant-tools]');await f.settle();expect(f.calls.find(c=>c.type==='grant-tools')).toMatchObject({id:'api',toolIds:['read'],meta:{expectedRevision:9}});expect(f.doc.querySelector('[name=toolGrant]')).toBeNull();f.click('[data-action=manage-tools]');expect(f.doc.querySelector<HTMLInputElement>('[name=toolGrant][value=write]')!.checked).toBe(false);f.view.dispose()
})
it('retains grant edits after a failed probe but clears them on cancel, leaving the page and identity reset',async()=>{
 const data=snapshot();data.rows.push({id:'api',kind:'connection',tab:'apps',name:'数据连接',description:'API',enabled:true,status:'已验证',source:'个人',revision:1,tools:[{id:'write',name:'写入',description:'修改',allowed:true}]});
 const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};throw new Error('测试失败')});f.click('[data-tab=apps]');f.click('[data-detail=api]');f.click('[data-action=manage-tools]');const checked=()=>f.doc.querySelector<HTMLInputElement>('[name=toolGrant][value=write]')!;
 checked().click();f.click('[data-action=probe]');await f.settle();await f.view.open();expect(checked().checked).toBe(false);f.click('[data-action=cancel-tool-grants]');f.click('[data-action=manage-tools]');expect(checked().checked).toBe(true);
 checked().click();f.click('[data-action=back]');f.click('[data-action=back]');f.click('[data-detail=api]');f.click('[data-action=manage-tools]');expect(checked().checked).toBe(true);checked().click();f.view.resetIdentity();await f.settle();f.click('[data-tab=apps]');f.click('[data-detail=api]');f.click('[data-action=manage-tools]');expect(checked().checked).toBe(true);f.view.dispose()
})

it('offers skill deletion with its own confirmation and preserves other plugin capabilities in the explanation',async()=>{
 const f=await fixture();f.click('[data-tab=skills]');f.click('[data-more="skill-1"]');
 expect(f.doc.querySelector('[data-menu-action=uninstall]')!.textContent).toBe('删除技能');
 f.click('[data-menu-action=uninstall]');await f.settle();
 expect(f.doc.querySelector('[role=dialog] h2')!.textContent).toBe('删除“研究报告”？');
 expect(f.doc.querySelector('[role=dialog]')!.textContent).toContain('原始文件、已有对话和插件的其他能力都会保留');
 expect(f.doc.querySelector('[data-action=confirm-uninstall]')!.textContent).toBe('确认删除');
 expect(f.calls.some(c=>c.type==='uninstall')).toBe(false);f.click('[data-action=confirm-uninstall]');await f.settle();
 expect(f.calls.find(c=>c.type==='uninstall')).toMatchObject({kind:'skill',id:'skill-1'});f.view.dispose();
});
it('shows honest empty plugin and app markets without placeholder cards, category filters or footer copy',async()=>{
 const f=await fixture();
 for(const [tab,name] of [['plugins','插件'],['apps','应用']]){await f.view.open(`integrations/${tab}`);f.click('[data-action=market]');await f.settle();
 expect(f.doc.querySelector('.ig-market-vacant')!.textContent).toContain(`暂无可用${name}`);
 expect(f.doc.querySelector('.ig-market-card')).toBeNull();expect(f.doc.querySelector('.ig-market-categories')).toBeNull();expect(f.doc.querySelector('.ig-market-source')).toBeNull();expect(f.doc.querySelector('.ig-heading [data-action=add-source]')).not.toBeNull();}
 f.view.dispose();
});

it('loads the actual skill markdown, renders it safely, and waits for the composer acknowledgement before reporting use',async()=>{
 let resolveDetail!:(value:IntegrationReply)=>void,resolveUse!:()=>void;const useSkill=vi.fn(()=>new Promise<void>(resolve=>{resolveUse=resolve}));
 const f=await fixture(async command=>command.type==='snapshot'?{type:'snapshot',snapshot:snapshot()}:new Promise(resolve=>{resolveDetail=resolve}),useSkill);
 f.click('[data-tab=skills]');f.click('[data-detail="skill-1"]');
 expect(f.doc.querySelector('[data-skill-detail]')).not.toBeNull();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).toContain('正在读取');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=use-skill]')!.disabled).toBe(true);
 resolveDetail({type:'skill-detail',id:'skill-1',revision:1,enabled:true,invocationName:'research-report',content:'---\nname: research-report\n---\n# 工作方法\n\n先**核验来源**。\n\n- 保留引用\n\n3. 第三步\n4. 第四步\n\n> 不确定时说明\n\n```sh\n<unsafe>\n```\n\n[资料](https://example.test/source) [坏链接](javascript:alert(1))\n\n![远程图片](https://example.test/tracker.png)\n\n<img src=x onerror=alert(1)><script>alert(1)</script>'});await f.settle();
 const body=f.doc.querySelector('[data-skill-detail]')!;expect(body.getAttribute('tabindex')).toBe('0');expect(body.getAttribute('role')).toBe('region');expect(f.doc.querySelector('.ig-root')!.classList.contains('ig-skill-detail-page')).toBe(true);expect(f.doc.querySelector('.ig-skill-actions [data-action=toggle-detail]')).not.toBeNull();expect(f.doc.querySelector('.ig-detail-aside hr')).toBeNull();expect(f.doc.querySelector('.ig-detail-aside')!.textContent).not.toContain('已有对话内容仍会保留');expect(body.querySelector('h1,h2')!.textContent).toBe('工作方法');expect(body.querySelector('strong')!.textContent).toBe('核验来源');expect(body.querySelector('li')!.textContent).toBe('保留引用');expect(body.querySelector('ol')!.getAttribute('start')).toBe('3');expect(body.querySelector('pre code')!.textContent).toContain('<unsafe>');expect(body.querySelector('script,img,iframe')).toBeNull();expect(body.querySelector('a[href^="javascript:"]')).toBeNull();expect(body.querySelector('a')!.getAttribute('href')).toBe('https://example.test/source');
 expect(f.calls.find(c=>c.type==='skill-detail')).toEqual({type:'skill-detail',id:'skill-1',revision:1});f.click('[data-action=use-skill]');expect(f.doc.querySelector('[data-action=use-skill]')!.getAttribute('aria-busy')).toBe('true');f.click('[data-action=use-skill]');expect(useSkill).toHaveBeenCalledExactlyOnceWith({id:'skill-1',revision:1,invocationName:'research-report',name:'研究报告',signal:expect.any(AbortSignal)});resolveUse();await f.settle();expect(f.doc.querySelector('[data-skill-detail]')).not.toBeNull();expect(f.doc.querySelector('[data-action=use-skill]')!.hasAttribute('aria-busy')).toBe(false);f.view.dispose();
});
it('offers a detail retry after read failure or a mismatched revision, without falling back to generic row detail',async()=>{
 let attempt=0;const data=snapshot();data.rows[1]!.detail='不能冒充真实文件的旧摘要';const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(++attempt===1)throw Error('文件暂不可读');return{type:'skill-detail',id:'skill-1',revision:attempt===2?99:1,enabled:true,content:'# 最新正文',invocationName:'report'}});
 f.click('[data-tab=skills]');f.click('[data-detail="skill-1"]');await f.settle();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).toContain('文件暂不可读');expect(f.doc.querySelector('[data-skill-detail]')!.textContent).not.toContain('旧摘要');f.click('[data-action=retry-skill-detail]');await f.settle();expect(f.doc.querySelector('[data-action=retry-skill-detail]')).not.toBeNull();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).not.toContain('最新正文');f.click('[data-action=retry-skill-detail]');await f.settle();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).toContain('最新正文');f.view.dispose();
});
it('ignores skill detail replies after rapid navigation and account reset',async()=>{
 let data=snapshot();data.rows.push({...data.rows[1]!,id:'skill-2',name:'第二个技能'});const waiting:Array<(reply:IntegrationReply)=>void>=[];const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:new Promise(resolve=>waiting.push(resolve)));
 f.click('[data-tab=skills]');f.click('[data-detail="skill-1"]');f.click('[data-action=back]');f.click('[data-detail="skill-2"]');waiting[1]!({type:'skill-detail',id:'skill-2',revision:1,enabled:true,content:'# 第二份正文',invocationName:'second'});await f.settle();waiting[0]!({type:'skill-detail',id:'skill-1',revision:1,enabled:true,content:'# 迟到的旧正文',invocationName:'first'});await f.settle();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).toContain('第二份正文');expect(f.doc.body.textContent).not.toContain('迟到');f.click('[data-action=back]');f.click('[data-detail="skill-1"]');expect(f.doc.querySelector('[data-skill-detail]')!.textContent).not.toContain('第二份');data={revision:9,rows:[]};f.view.resetIdentity();waiting[2]!({type:'skill-detail',id:'skill-1',revision:1,enabled:true,content:'# 上一账号私有内容',invocationName:'private'});await f.settle();expect(f.doc.body.textContent).not.toContain('上一账号');expect(f.doc.querySelector('[data-skill-detail]')).toBeNull();f.view.dispose();
});
it('keeps disabled or parent-disabled skills readable but prevents immediate use, and reports callback failures inline for retry',async()=>{
 const data=snapshot();data.rows[1]!.enabled=false;let usable=false;const useSkill=vi.fn(async()=>{throw Error('对话输入框暂不可用')});const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:data}:{type:'skill-detail',id:'skill-1',revision:data.rows[1]!.revision,enabled:data.rows[1]!.enabled,...(!usable?{usable:false,unavailableReason:'所属插件已停用'}:{}),content:'# 可阅读的正文',invocationName:'report'},useSkill);
 f.click('[data-tab=skills]');f.click('[data-detail="skill-1"]');await f.settle();expect(f.doc.querySelector('[data-skill-detail]')!.textContent).toContain('可阅读');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=use-skill]')!.disabled).toBe(true);expect(f.doc.querySelector('.ig-detail-aside')!.textContent).toContain('启用');
 data.rows[1]!.enabled=true;data.rows[1]!.revision=2;await f.view.open();await f.settle();expect(f.doc.querySelector<HTMLButtonElement>('[data-action=use-skill]')!.disabled).toBe(true);expect(f.doc.querySelector('.ig-detail-aside')!.textContent).toContain('所属插件已停用');usable=true;data.rows[1]!.revision=3;await f.view.open();await f.settle();f.click('[data-action=use-skill]');await f.settle();expect(f.doc.querySelector('.ig-detail-aside')!.textContent).toContain('对话输入框暂不可用');expect(f.doc.querySelector<HTMLButtonElement>('[data-action=use-skill]')!.disabled).toBe(false);expect(f.doc.querySelector('[data-skill-detail]')).not.toBeNull();f.click('[data-action=use-skill]');await f.settle();expect(useSkill).toHaveBeenCalledTimes(2);f.view.dispose();
});

it('cancels an outstanding skill prefill on back, close, or account change and ignores late errors',async()=>{
 for(const leave of ['back','close','identity'] as const){
  let signal:AbortSignal|undefined,rejectUse!:(error:Error)=>void;
  const f=await fixture(async c=>c.type==='snapshot'?{type:'snapshot',snapshot:snapshot()}:{type:'skill-detail',id:'skill-1',revision:1,enabled:true,content:'# 正文',invocationName:'report'},async input=>{signal=input.signal;await new Promise<void>((_,reject)=>{rejectUse=reject})});
  f.click('[data-tab=skills]');f.click('[data-detail=skill-1]');await f.settle();f.click('[data-action=use-skill]');expect(signal?.aborted).toBe(false);
  if(leave==='back')f.click('[data-action=back]');else if(leave==='close')f.view.close();else f.view.resetIdentity();
  expect(signal?.aborted).toBe(true);rejectUse(Error('过期使用失败'));await f.settle();expect(f.doc.body.textContent).not.toContain('过期使用失败');f.view.dispose();
 }
});

it('keeps built-in skills enabled through list, busy refresh, menus, and detail toggle entry points',async()=>{
 const data=snapshot();Object.assign(data.rows[1]!,{name:'易方达演示文稿',source:'EWork 内置 · v1.1.1',toggleable:false,toggleDisabledReason:'内置技能，保持启用',removable:false});
 data.rows.push({...data.rows[1]!,id:'personal-skill',name:'个人技能',source:'个人',toggleable:true,toggleDisabledReason:undefined,removable:true});
 const f=await fixture(async c=>{if(c.type==='snapshot')return{type:'snapshot',snapshot:data};if(c.type==='skill-detail')return{type:'skill-detail',id:c.id,revision:c.revision,content:'# 内置正文',enabled:true,invocationName:'efund-ppt'};if(c.type==='set-enabled'){data.rows.find(row=>row.id===c.id)!.enabled=c.enabled;}return{type:'operation',operation:{id:'op',status:'succeeded',message:'已保存',cancellable:false}}});
 f.click('[data-tab=skills]');const locked=()=>f.doc.querySelector<HTMLButtonElement>('[data-toggle=skill-1]')!;
 expect(locked().disabled).toBe(true);expect(locked().getAttribute('aria-checked')).toBe('true');expect(locked().title).toBe('内置技能，保持启用');expect(locked().getAttribute('aria-label')).toContain('内置技能，保持启用');expect(f.doc.querySelector('[data-row-id=skill-1]')!.textContent).toContain('EWork 内置 · v1.1.1');
 f.click('[data-toggle=personal-skill]');await f.settle();expect(locked().disabled).toBe(true);expect(locked().getAttribute('aria-checked')).toBe('true');
 locked().disabled=false;locked().click();await f.settle();expect(f.calls.filter(c=>c.type==='set-enabled'&&c.id==='skill-1')).toHaveLength(0);
 f.click('[data-more=skill-1]');expect(f.doc.querySelector('[data-menu-action=toggle]')).toBeNull();expect(f.doc.querySelector('[data-menu-action=uninstall]')).toBeNull();
 const fake=f.doc.createElement('button');fake.dataset.menuAction='toggle';f.doc.querySelector('.ig-menu')!.append(fake);fake.click();await f.settle();expect(f.calls.filter(c=>c.type==='set-enabled'&&c.id==='skill-1')).toHaveLength(0);
 f.click('[data-more=skill-1]');f.click('[data-menu-action=detail]');await f.settle();const detail=f.doc.querySelector<HTMLButtonElement>('[data-action=toggle-detail]')!;expect(detail.disabled).toBe(true);expect(detail.title).toBe('内置技能，保持启用');expect(detail.getAttribute('aria-label')).toContain('内置技能，保持启用');expect(f.doc.querySelector('[data-action=request-uninstall]')).toBeNull();
 detail.disabled=false;detail.click();await f.settle();expect(f.calls.filter(c=>c.type==='set-enabled'&&c.id==='skill-1')).toHaveLength(0);f.view.dispose();
});
