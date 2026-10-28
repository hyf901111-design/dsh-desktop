import { WorkspaceSurfaceHost } from '../workspace-surface-host';
import { workspaceBackButton, mountWorkspaceTopbarStyles } from '../workspace-topbar';
import { type IntegrationBridge, type IntegrationCommand, type IntegrationReply, type IntegrationSnapshot, type IntegrationRow, type IntegrationTab, type MarketEntry, type Mutation, type ConnectionDraft, type SkillPreview, type UiOperation, emptyConnectionDraft } from './bridge';
import { type IntegrationRoute, marketKinds, marketNames, tabNames, parseIntegrationRoute } from './router';
import { button, parseDraftTools, escapeHtml as esc, skillPreviewForm } from './forms';
import { ConnectionFormController } from './connection-form-controller';
import { marketGrid, marketDetail, type MarketCategory } from './market';
import { integrationStyles } from './style';
import { renderSkillMarkdown } from './skill-markdown';
import { legacyPreviewMarkup, legacyPreviewStyles } from './legacy-view';
import type { LegacySkillPreviewItem } from '../../shared/integration-ui';
const icons = {
    more: '<circle cx="4" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>',
    chevron: '<path d="m5 8 5 5 5-5"/>',
    search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${icons[name]}</svg>`;
type SkillDetailState = {
    id: string; revision: number; epoch: number; status: 'loading' | 'ready' | 'error';
    reply?: Extract<IntegrationReply, {type: 'skill-detail'}>; error?: string;
    useController?: AbortController; useError?: string; useMessage?: string;
};
const tabs: IntegrationTab[] = ['plugins', 'apps', 'mcp', 'skills'];
const addMenuButton = () => `<button type="button" class="ig-button ig-primary ig-add-trigger" data-action="add" aria-haspopup="menu" aria-expanded="false">添加${icon('chevron')}</button>`;
const subtitles: Record<IntegrationTab, string> = { plugins: '让 EWork 连接你的工具与工作资料', apps: '管理应用账号、自有 API 与连接权限', mcp: '连接 MCP 服务器，管理可调用的工具', skills: '管理可复用的工作方法与专业能力' };
/** Figma workspace flows, driven exclusively by the trusted main-process bridge. */
export class IntegrationView {
    private root?: HTMLElement;
    private ownHost: boolean;
    private host: WorkspaceSurfaceHost;
    private mounted = false;
    private snapshot: IntegrationSnapshot = { revision: 0, rows: [] };
    private history: IntegrationRoute[] = [{ page: 'list', tab: 'plugins' }];
    private epoch = 0;
    private refreshSeq = 0;
    private loading = false;
    private error = '';
    private message = '';
    private query = '';
    private entries: MarketEntry[] = [];
    private marketCategory: MarketCategory = 'all';
    private toolsExpanded = false;
    private toolGrantDraft?: { connectionId: string; selected: Set<string>; fingerprints: Map<string,string>; granted: Set<string> };
    private dependenciesExpanded = false;
    private skillDetail?: SkillDetailState;
    private draft = emptyConnectionDraft();
    private connectionEditor = new ConnectionFormController();
    private draftVersion = 0;
    private preview?: SkillPreview;
    private operation?: UiOperation;
    private operationTimer?: ReturnType<typeof setTimeout>;
    private snapshotTimer?: ReturnType<typeof setInterval>;
    private busy = false;
    private busyCommand?: {type: IntegrationCommand['type']; id?: string};
    private pendingActions = new Map<string, symbol>();
    private mutationSeq = 0;
    private menuAnchor?: HTMLButtonElement;
    private menuId?: string;
    private dialogId?: string;
    private returnFocus?: HTMLElement;
    private manifest = '';
    private sourceUrl = '';
    private legacyEligibleCount = 0;
    private legacyItems: LegacySkillPreviewItem[] = [];
    private legacyPreviewSeq = 0;
    constructor(private document: Document, private bridge: IntegrationBridge, host?: WorkspaceSurfaceHost) {
        this.ownHost = !host;
        this.host = host || new WorkspaceSurfaceHost(document);
    }
    mount() {
        if (this.mounted)
            return;
        this.mounted = true;
        mountWorkspaceTopbarStyles(this.document);
        if (!this.document.getElementById('sherlock-integrations-style')) {
            const style = this.document.createElement('style');
            style.id = 'sherlock-integrations-style';
            style.textContent = integrationStyles + legacyPreviewStyles;
            this.document.head.append(style);
        }
        this.root = this.document.createElement('section');
        this.root.className = 'ig-root';
        this.root.setAttribute('aria-label', '插件工作区');
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('input', this.onInput);
        this.root.addEventListener('change', this.onInput);
        this.root.addEventListener('dragover',this.onSkillDragOver,true);
        this.root.addEventListener('dragleave',this.onSkillDragLeave,true);
        this.root.addEventListener('drop',this.onSkillDrop,true);
        this.root.addEventListener('scroll', this.onMenuLayoutChanged, {passive:true,capture:true});
        this.document.defaultView?.addEventListener('resize',this.onMenuLayoutChanged);
        this.document.defaultView?.addEventListener('sherlock:workspace-panel-state',this.onMenuLayoutChanged);
        this.root.addEventListener('submit', event => event.preventDefault());
        this.document.addEventListener('keydown', this.onKey);
        this.document.addEventListener('pointerdown', this.onOutside);
        this.document.addEventListener('focusin',this.onFocusOutside);
        this.document.addEventListener('sherlock:workspace-surface-change', this.onSurfaceChange);
        this.document.defaultView?.addEventListener('sherlock:integrations-open', this.onOpen as EventListener);
        this.host.register('integrations', this.root);
        this.snapshotTimer=setInterval(()=>{if(this.host.current()?.surface==='integrations' && this.route.page==='list' && !this.loading && !this.busy && !this.menuId && !this.dialogId && !this.document.activeElement?.matches('[name=query]'))void this.refresh(true)},5000);
    }
    async open(path?: string) {
        this.mount();
        this.clearSkillDetail();
        this.epoch++;
        this.error = '';
        this.message = '';
        if (path) {
            this.clearToolGrantDraft();
            this.history = [parseIntegrationRoute(path)];
        }
        this.host.open('integrations');
        this.render();
        await this.refresh();
        if (this.route.page === 'market')
            await this.loadMarket();
    }
    resetIdentity() {
        this.clearSkillDetail();
        this.epoch++;this.mutationSeq++;this.refreshSeq++;clearTimeout(this.operationTimer);
        this.closeMenu();this.closeDialog();this.busy=false;this.busyCommand=undefined;this.pendingActions.clear();this.loading=false;
        this.snapshot={revision:0,rows:[]};this.entries=[];this.history=[{page:'list',tab:'plugins'}];
        this.draft=emptyConnectionDraft();this.connectionEditor.reset();this.draftVersion++;this.preview=undefined;this.operation=undefined;
        this.query='';this.marketCategory='all';this.clearToolGrantDraft();this.dependenciesExpanded=false;this.manifest='';this.sourceUrl='';this.legacyEligibleCount=0;this.error='';this.message='';
        this.legacyItems=[];this.legacyPreviewSeq++;
        this.render();if(this.host.current()?.surface==='integrations')void this.refresh();
    }
    private showOperationEntity(tab:IntegrationTab) {
        const entity=this.snapshot.rows.find(row=>row.id===this.operation?.entityId);
        this.history=[{page:'list',tab:entity?.tab || tab}];
        if(entity)this.history.push({page:'detail',id:entity.id,tab:entity.tab});
        this.render();
    }
    close() { this.clearSkillDetail(); this.clearToolGrantDraft(); this.epoch++; this.closeMenu(); this.closeDialog(); this.host.close('integrations'); this.draft.secret = ''; clearTimeout(this.operationTimer); }
    dispose() { this.document.defaultView?.removeEventListener('resize',this.onMenuLayoutChanged);this.document.defaultView?.removeEventListener('sherlock:workspace-panel-state',this.onMenuLayoutChanged);clearInterval(this.snapshotTimer); this.close(); this.document.removeEventListener('keydown', this.onKey); this.document.removeEventListener('pointerdown', this.onOutside);this.document.removeEventListener('focusin',this.onFocusOutside); this.document.removeEventListener('sherlock:workspace-surface-change', this.onSurfaceChange); this.document.defaultView?.removeEventListener('sherlock:integrations-open', this.onOpen as EventListener);
        this.root?.remove(); if (this.ownHost)
        this.host.dispose(); this.mounted = false; }
    private get route() { return this.history[this.history.length - 1]!; }
    private onOpen = (event: CustomEvent<{
        route?: string;
    }>) => { void this.open(event.detail?.route); };
    private onSurfaceChange = (event: Event) => { const detail = (event as CustomEvent<{
        surface?: string;
    }>).detail; if (detail?.surface !== 'integrations') {
        this.clearSkillDetail();
        this.epoch++;
        this.closeMenu();
        this.closeDialog();
    } };
    private meta(id?: string): Mutation { return { requestId: this.document.defaultView?.crypto.randomUUID() || `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`, expectedRevision: id ? (this.snapshot.rows.find(row => row.id === id)?.revision ?? this.snapshot.revision) : this.snapshot.revision }; }
    private async request<T extends IntegrationReply['type']>(command: IntegrationCommand, type: T): Promise<Extract<IntegrationReply, {
        type: T;
    }>> { const reply = await this.bridge.request(command); if (reply.type !== type)
        throw new Error('客户端返回了不匹配的结果，请重试。'); return reply as Extract<IntegrationReply, {
        type: T;
    }>; }
    private showError(error: unknown) { this.message='';let message = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/,'').replace(/^(?:IntegrationError|Error):\s*/,''); if (this.draft.secret)
        message = message.split(this.draft.secret).join('••••••'); this.error = message; this.renderFeedback(); }
    private scrollToTop() { const scroll=this.root?.querySelector<HTMLElement>('.ig-scroll');if(scroll)scroll.scrollTop=0; }
    private navigate(route: IntegrationRoute) { this.clearSkillDetail(); this.closeMenu(); this.closeDialog(); this.history.push(route); this.clearToolGrantDraft();this.dependenciesExpanded=false;this.epoch++; this.loading = false; this.error = ''; this.message = ''; this.query = ''; this.render(); this.scrollToTop(); if (route.page === 'market')
        void this.loadMarket(); }
    private back() { this.clearSkillDetail(); if(this.toolsExpanded){this.clearToolGrantDraft();this.render();return;} this.closeMenu(); this.closeDialog(); this.epoch++; this.loading = false; this.error = ''; if (this.history.length > 1) {
        this.history.pop();
        this.render();
    }
    else
        this.host.back(); }
    private async refresh(quiet = false) { const epoch = this.epoch, seq = ++this.refreshSeq; if(!quiet){this.loading = true; this.render();} try {
        const reply = await this.request({ type: 'snapshot' }, 'snapshot');
        if (epoch !== this.epoch || seq !== this.refreshSeq)
            return;
        if(quiet && JSON.stringify(this.snapshot)===JSON.stringify(reply.snapshot))return;
        this.snapshot = reply.snapshot;
        this.loading = false;
        this.render();
    }
    catch (error) {
        if (epoch !== this.epoch || seq !== this.refreshSeq)
            return;
        this.loading = false;
        this.showError(error);
        this.render();
    } }
    private async loadMarket() { if (this.route.page !== 'market')
        return; const kind = this.route.kind, focusEntryId = this.route.focusEntryId, epoch = this.epoch; this.loading = true; this.entries = []; this.render(); try {
        const reply = await this.request({ type: 'market', kind }, 'market');
        if (epoch !== this.epoch)
            return;
        this.entries = reply.entries;
        this.loading = false;
        if (focusEntryId && this.entries.some(entry => entry.id === focusEntryId)) this.navigate({page:'market-detail', kind, id:focusEntryId});
        else { if (focusEntryId) this.error = '原目录中已没有此项目，请检查目录来源或联系发布者。'; this.render(); }
    }
    catch (error) {
        if (epoch !== this.epoch)
            return;
        this.loading = false;
        this.showError(error);
        this.render();
    } }
    private async run(command: IntegrationCommand, done?: () => void) { if (this.busy)
        return; const epoch = this.epoch, mutationSeq = ++this.mutationSeq; this.busy = true; this.busyCommand={type:command.type,id:'id' in command ? command.id : undefined}; this.operation = undefined; clearTimeout(this.operationTimer); this.error = ''; this.message = '正在提交…'; this.renderFeedback(); this.updateBusy(); try {
        const reply = await this.request(command, 'operation');
        if (mutationSeq !== this.mutationSeq) return;
        if (epoch !== this.epoch) {
            this.busy = false;
            this.message = '';
            this.updateBusy();
            this.renderFeedback();
            return;
        }
        this.operation = reply.operation;
        await this.followOperation(epoch, done, mutationSeq);
    }
    catch (error) {
        if (mutationSeq !== this.mutationSeq) return;
        if (epoch === this.epoch)
            this.showError(error);
        this.busy = false;
        this.message = '';
        this.updateBusy();
        this.renderFeedback();
    } }
    private async followOperation(epoch: number, done?: () => void, mutationSeq = this.mutationSeq) { if (mutationSeq !== this.mutationSeq) return; if (epoch !== this.epoch) {
        this.busy = false;this.message='';this.updateBusy();this.renderFeedback();
        return;
    } const op = this.operation; if (!op)
        return; this.message = op.message || (op.status === 'succeeded' ? '操作已完成' : '正在处理…'); this.renderFeedback(); if (op.status === 'pending' || op.status === 'running') {
        this.operationTimer = setTimeout(() => { void (async () => { try {
            const next = await this.request({ type: 'operation', id: op.id }, 'operation');
            if (mutationSeq !== this.mutationSeq) return;
            if (epoch !== this.epoch) {
                this.busy = false;this.message='';this.updateBusy();this.renderFeedback();
                return;
            }
            this.operation = next.operation;
            await this.followOperation(epoch, done, mutationSeq);
        }
        catch (error) {
            if (mutationSeq === this.mutationSeq) {
                this.busy = false;this.message='';
                if(epoch===this.epoch)this.showError(error);else this.renderFeedback();
                this.updateBusy();
            }
        } })(); }, 700);
        return;
    } this.busy = false; this.updateBusy(); if (op.status === 'failed') {
        this.error = op.message;
        this.message = '';
        this.renderFeedback();
        return;
    } if (op.status === 'cancelled') {
        this.message = '操作已取消';
        this.renderFeedback();
        return;
    } await this.refresh(); if (epoch === this.epoch)
        done?.(); }
    private hasApiTools() { try { return parseDraftTools(this.draft).length > 0; } catch { return false; } }
    private updateBusy() {
        if (!this.root) return;
        this.root.setAttribute('aria-busy', String(this.busy || this.pendingActions.size > 0 || Boolean(this.skillDetail?.useController)));
        const mutationActions = ['grant-tools','save-connection','import-skill','install','create-plugin','save-source','authorize','toggle-detail'];
        const readActions: Record<string,string[]> = { probe:['probe'], 'compile-openapi':['compile-openapi'], 'edit-connection':['edit-connection'], skill:['choose-skill'], legacy:['legacy-preview','legacy-recheck'], dependencies:['request-uninstall','disconnect'] };
        const entry=this.route.page==='market-detail'?this.entries.find(item=>item.id===this.routeId()):undefined;
        this.root.querySelectorAll<HTMLButtonElement>('button').forEach(el => {
            const action=el.dataset.action || '';
            if(action==='use-skill') {
                const row=this.snapshot.rows.find(item=>item.id===this.routeId());
                el.disabled=!this.canUseSkill(row);
                if(this.skillDetail?.useController)el.setAttribute('aria-busy','true');else el.removeAttribute('aria-busy');
                return;
            }
            const pending=Object.entries(readActions).some(([key,actions])=>this.pendingActions.has(key)&&actions.includes(action));
            const isRead=Object.values(readActions).some(actions=>actions.includes(action));
            const isMutation=el.hasAttribute('data-mutation') || mutationActions.includes(action);
            if (!isRead && !isMutation) return;
            const toggleRow=el.dataset.toggle?this.snapshot.rows.find(row=>row.id===el.dataset.toggle):action==='toggle-detail'?this.snapshot.rows.find(row=>row.id===this.routeId()):undefined;
            const unavailable=toggleRow?.toggleable===false || (action==='save-connection' && this.draft.type==='api' && !this.hasApiTools()) || (action==='grant-tools' && !this.snapshot.rows.find(row=>row.id===this.routeId())?.tools?.length) || (action==='install' && (!entry || entry.installed || !entry.available));
            el.disabled = pending || this.busy || (isMutation && this.pendingActions.size > 0) || unavailable;
            const mutationActive=this.busy && (action===this.busyCommand?.type || (this.busyCommand?.type==='set-enabled' && (el.dataset.toggle===this.busyCommand.id || action==='toggle-detail')) || (action==='install' && this.busyCommand?.type==='install'));
            if (pending || mutationActive) el.setAttribute('aria-busy','true'); else el.removeAttribute('aria-busy');
        });
    }
    private async withPending(key: string, work: () => Promise<void>) {
        if(this.pendingActions.has(key)) return;
        const token=Symbol(key);this.pendingActions.set(key,token);this.updateBusy();
        try {await work();} finally {if(this.pendingActions.get(key)===token){this.pendingActions.delete(key);this.updateBusy();}}
    }
    private title() { switch (this.route.page) {
        case 'list': return '插件';
        case 'market': return marketNames[this.route.kind];
        case 'market-detail': return this.route.kind === 'plugin' ? '插件详情' : this.route.kind === 'skill' ? '技能详情' : this.route.kind === 'app' ? '应用详情' : '工具详情';
        case 'detail': { const row=this.snapshot.rows.find(r=>r.id===this.routeId()); return row?.kind==='plugin' ? '插件详情' : row?.name || '详情'; }
        case 'connection': return this.connectionEditor.title(this.draft);
        case 'skill-import': return '导入技能';
        case 'create-plugin': return '创建插件';
        case 'add-source': return '添加目录来源';
    } }
    private routeId() { return 'id' in this.route ? this.route.id : undefined; }
    private render() {
        if (!this.root)
            return;
        const route = this.route;
        if(this.toolGrantDraft && (route.page!=='detail' || route.id!==this.toolGrantDraft.connectionId))this.clearToolGrantDraft();
        const currentRow = this.snapshot.rows.find(row => row.id === this.routeId());
        const skillPage=route.page==='detail' && currentRow?.kind==='skill';
        const previousDocument=this.root.querySelector<HTMLElement>('[data-skill-detail]');
        const previewScroll=skillPage && previousDocument?.dataset.skillId===currentRow.id && previousDocument.dataset.skillRevision===String(currentRow.revision) ? previousDocument.scrollTop : 0;
        const pageScroll=this.root.querySelector<HTMLElement>('.ig-scroll')?.scrollTop || 0;
        this.root.classList.toggle('ig-skill-detail-page',skillPage);
        this.ensureSkillDetail(currentRow);
        const subtitle = route.page === 'list' ? subtitles[route.tab] : route.page === 'market' ? '为研究、写作与日常协作添加能力' : route.page === 'detail' ? (currentRow?.kind === 'connection' ? '管理这条连接的使用范围、凭据和工具' : currentRow?.description || '') : route.page === 'market-detail' ? '了解能力与权限，选择适合你的工作方式' : route.page === 'connection' ? this.connectionEditor.subtitle(this.draft) : route.page === 'skill-import' ? '把已有的工作方法添加到 EWork' : route.page === 'create-plugin' ? '将技能与连接组合成一套可复用的能力' : route.page === 'add-source' ? '从团队或组织维护的目录中发现插件' : '';
        const actions = route.page === 'list' ? `${button('market', marketNames[marketKinds[route.tab]])}${addMenuButton()}` : route.page === 'market' ? button('add-source','添加来源') : '';
        this.root.innerHTML = `<div class="ig-chrome">${workspaceBackButton()}</div><div class="ig-scroll"><div class="ig-content"><header class="ig-heading"><div><h1 ${route.page==='detail' && currentRow?.kind!=='plugin'?'data-ui-preserve':''}>${esc(this.title())}</h1>${subtitle ? `<p class="ig-subtitle" ${route.page==='detail' && currentRow?.kind!=='connection'?'data-ui-preserve':''}>${esc(subtitle)}</p>` : ''}</div><div class="ig-actions">${actions}</div></header><div class="ig-error" role="alert"></div><div class="ig-live" role="status" aria-live="polite" aria-atomic="true"></div><div class="ig-page">${this.content()}</div></div></div>`;
        this.root.querySelector<HTMLElement>('.ig-scroll')!.scrollTop=skillPage?0:pageScroll;
        if(skillPage){const preview=this.root.querySelector<HTMLElement>('[data-skill-detail]');if(preview)preview.scrollTop=previewScroll;}
        this.renderFeedback();
        this.updateBusy();
    }
    private content(): string {
        const route = this.route;
        switch (route.page) {
            case 'list': return `<div class="ig-toolbar"><nav class="ig-tabs" role="tablist" aria-label="能力类型">${tabs.map(tab => `<button type="button" role="tab" data-tab="${tab}" aria-selected="${route.tab === tab}" tabindex="${route.tab === tab ? '0' : '-1'}">${tabNames[tab]}<small>${this.snapshot.rows.filter(row => row.tab === tab).length}</small></button>`).join('')}</nav><label class="ig-search">${icon('search')}<input name="query" aria-label="搜索${tabNames[route.tab]}" placeholder="搜索${tabNames[route.tab]}" value="${esc(this.query)}"></label></div><div class="ig-list" role="tabpanel">${this.listContent(route.tab)}</div>`;
            case 'market': return marketGrid(this.entries, this.loading, this.marketCategory, route.kind);
            case 'market-detail': return marketDetail(this.entries.find(entry => entry.id === route.id));
            case 'connection': return this.connectionEditor.render(this.draft);
            case 'detail': return this.detailContent(this.snapshot.rows.find(row => row.id === route.id));
            case 'skill-import': return skillPreviewForm(this.preview);
            case 'create-plugin': return `<form class="ig-form ig-connection-form"><div class="ig-form-layout"><div class="ig-form-main"><label class="ig-field"><span>插件清单（JSON）</span><textarea name="manifest" class="ig-manifest" spellcheck="false" placeholder="粘贴声明式插件清单">${esc(this.manifest)}</textarea></label></div><aside class="ig-form-help"><h2>创建个人插件</h2><p>使用声明式清单组织可复用技能与能力。</p><p>创建时会校验文件、版本和权限；不会运行 npm 安装或清单中的脚本。</p><p>安装完成后，可在插件列表启用或管理。</p></aside></div><div class="ig-form-actions">${button('back', '取消')}${button('create-plugin', '校验并安装', true)}</div></form>`;
            case 'add-source': return `<form class="ig-form ig-connection-form"><div class="ig-form-layout"><div class="ig-form-main"><label class="ig-field"><span>目录地址</span><input type="url" name="sourceUrl" value="${esc(this.sourceUrl)}" placeholder="https://plugins.example.com/catalog.json"><small>目录名称使用来源的域名。仅支持可信的 HTTPS 目录。</small></label><p class="ig-form-explanation">验证后读取目录中实际提供的名称、版本与发布者信息。添加来源后，仍需逐个选择并安装。</p></div><aside class="ig-form-help"><h2>确认你信任这个来源</h2><p>添加来源不会自动安装插件，也不会运行其中的代码。</p><p>来源校验失败时不会添加，可修改地址后重试。</p></aside></div><div class="ig-form-actions">${button('back', '取消')}${button('save-source', '验证并添加', true)}</div></form>`;
        }
    }
    private listContent(tab: IntegrationTab) { if (this.loading)
        return '<p class="ig-empty" role="status">正在加载…</p>'; const all = this.snapshot.rows.filter(row => row.tab === tab), rows = all.filter(row => (row.name + ' ' + row.description).toLocaleLowerCase().includes(this.query.toLocaleLowerCase())); if (!rows.length)
        return `<div class="ig-empty"><h2>${this.query ? '没有匹配的结果' : `还没有${tabNames[tab]}`}</h2><p>${this.query ? '试试其他名称或关键词。' : tab === 'skills' ? '导入技能，或从技能市场寻找可复用的工作方法。' : `从${marketNames[marketKinds[tab]]}添加，或连接你自己的工具。`}</p>${this.query ? '' : addMenuButton()}</div>`; return `<div class="ig-list-heading"><span>${tab === 'apps' ? '连接' : tab === 'mcp' ? '服务器' : '已安装'}</span><span>${all.length} 项 · ${all.filter(row => row.enabled).length} 项已启用</span></div>${rows.map(row => `<article class="ig-row" data-row-id="${esc(row.id)}"><button class="ig-row-main" ${row.id.startsWith('builtin:')?'':'data-ui-preserve'} data-detail="${esc(row.id)}"><strong title="${esc(row.name)}">${esc(row.name)}</strong><span title="${esc(row.description)}">${esc(row.description)}</span></button><div class="ig-row-meta"><span data-enabled="${row.enabled}">${esc(row.status)}</span><span title="${esc(row.source)}">${esc(row.source)}${typeof row.toolCount === 'number' ? ` · ${row.toolCount} 个工具` : ''}</span></div><button type="button" role="switch" aria-checked="${row.enabled}" aria-label="${row.enabled ? '停用' : '启用'}${esc(row.name)}${row.toggleable===false?`，${esc(this.toggleDisabledReason(row))}`:''}" class="ig-toggle" data-toggle="${esc(row.id)}" ${row.toggleable===false?`disabled data-toggle-locked="true" title="${esc(this.toggleDisabledReason(row))}"`:''} data-mutation></button><button class="ig-more" data-more="${esc(row.id)}" aria-label="${esc(row.name)}的更多操作" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button></article>`).join('')}`; }
    private toggleDisabledReason(row: IntegrationRow) { return row.toggleDisabledReason || '内置技能，保持启用'; }
    private detailToggleButton(row: IntegrationRow, primary = false) {
        const label=row.enabled?'停用':'启用';
        return row.toggleable===false
            ? `<button type="button" class="ig-button ig-secondary" data-action="toggle-detail" disabled title="${esc(this.toggleDisabledReason(row))}" aria-label="${label}${esc(row.name)}，${esc(this.toggleDisabledReason(row))}">${label}</button>`
            : button('toggle-detail',label,primary);
    }
    private clearToolGrantDraft() { this.toolGrantDraft=undefined;this.toolsExpanded=false; }
    private toolSelections(row: IntegrationRow): Set<string> {
        const tools=row.tools || [];
        const capabilities=this.snapshot.taskCapabilities?.find(item=>item.entityId===row.id)?.tools;
        const fingerprints=new Map(tools.map(tool=>[tool.id,capabilities?.find(item=>item.id===tool.id)?.schemaDigest || JSON.stringify([tool.name,tool.description])]));
        const granted=new Set(tools.filter(tool=>tool.allowed).map(tool=>tool.id));
        if(!this.toolGrantDraft || this.toolGrantDraft.connectionId!==row.id) {
            this.toolGrantDraft={connectionId:row.id,selected:new Set(granted),fingerprints,granted};
        } else {
            const draft=this.toolGrantDraft;
            // A refresh may remove a tool, change its contract, or revoke an existing grant.
            // Never turn any of those changes into an implicit approval in an open editor.
            for(const id of draft.selected) {
                if(!fingerprints.has(id) || draft.fingerprints.get(id)!==fingerprints.get(id) || (draft.granted.has(id) && !granted.has(id)))draft.selected.delete(id);
            }
            draft.fingerprints=fingerprints;draft.granted=granted;
        }
        return this.toolGrantDraft.selected;
    }
    private syncToolSelectAll(row: IntegrationRow) {
        const toggle=this.root?.querySelector<HTMLButtonElement>('[data-action=toggle-all-tools]');
        if(!toggle)return;
        const selected=this.toolSelections(row);
        const all=!!row.tools?.length && row.tools.every(tool=>selected.has(tool.id));
        toggle.textContent=all?'取消全选':'全选';
        toggle.setAttribute('aria-pressed',String(all));
    }
    private clearSkillDetail() {
        this.skillDetail?.useController?.abort();
        this.skillDetail=undefined;
    }
    private isCurrentSkillDetail(state: SkillDetailState) {
        return this.skillDetail===state && state.epoch===this.epoch && this.route.page==='detail' && this.route.id===state.id
            && this.snapshot.rows.some(row=>row.id===state.id && row.kind==='skill' && row.revision===state.revision);
    }
    private ensureSkillDetail(row?: IntegrationRow) {
        if(this.route.page!=='detail' || row?.kind!=='skill') { this.clearSkillDetail(); return; }
        const previous=this.skillDetail;
        if(previous?.id===row.id && previous.revision===row.revision && previous.epoch===this.epoch)return;
        this.clearSkillDetail();
        const state: SkillDetailState={id:row.id,revision:row.revision,epoch:this.epoch,status:'loading'};
        this.skillDetail=state;
        void this.loadSkillDetail(state);
    }
    private async loadSkillDetail(state: SkillDetailState) {
        try {
            const reply=await this.request({type:'skill-detail',id:state.id,revision:state.revision},'skill-detail');
            if(!this.isCurrentSkillDetail(state))return;
            if(reply.id!==state.id || reply.revision!==state.revision || typeof reply.content!=='string' || typeof reply.invocationName!=='string' || typeof reply.enabled!=='boolean')throw new Error('技能已发生变化，请重新读取正文。');
            state.reply=reply;state.status='ready';
        } catch(error) {
            if(!this.isCurrentSkillDetail(state))return;
            state.status='error';state.error=error instanceof Error ? error.message : String(error);
        }
        this.render();
    }
    private canUseSkill(row?: IntegrationRow) {
        const state=this.skillDetail,reply=state?.reply;
        return Boolean(row?.kind==='skill' && row.enabled && state && this.isCurrentSkillDetail(state) && state.status==='ready'
            && reply?.enabled && reply.usable!==false && this.bridge.useSkill && !state.useController && !this.busy && !this.pendingActions.size);
    }
    private async useCurrentSkill(row?: IntegrationRow) {
        const state=this.skillDetail;
        if(!row || !state?.reply || !this.canUseSkill(row) || !this.bridge.useSkill)return;
        const controller=new AbortController();state.useController=controller;state.useError='';state.useMessage='';this.render();
        try {
            await this.bridge.useSkill({id:state.id,revision:state.revision,invocationName:state.reply.invocationName,name:row.name,signal:controller.signal});
            if(this.isCurrentSkillDetail(state) && !controller.signal.aborted)state.useMessage='已在对话输入框中准备好技能。';
        } catch(error) {
            if(this.isCurrentSkillDetail(state) && !controller.signal.aborted)state.useError=error instanceof Error ? error.message : String(error);
        } finally {
            if(this.isCurrentSkillDetail(state) && !controller.signal.aborted){state.useController=undefined;this.render();}
        }
    }
    private skillDetailContent(row: IntegrationRow) {
        const state=this.skillDetail,reply=state?.reply;
        const body=state?.status==='ready' && reply ? `<article class="ig-markdown">${renderSkillMarkdown(reply.content)}</article>`
            : state?.status==='error' ? `<div class="ig-skill-read-state"><p class="ig-error" role="alert">${esc(state.error)}</p>${button('retry-skill-detail','重新读取')}</div>`
            : '<div class="ig-skill-read-state" role="status">正在读取技能正文…</div>';
        const unavailable=!row.enabled || reply?.enabled===false ? '先启用技能，再在对话中使用。'
            : reply?.usable===false ? reply.unavailableReason || '此技能暂时不可用，请检查所属插件。'
            : !this.bridge.useSkill ? '当前客户端暂不支持直接使用技能。' : '';
        return `<div class="ig-detail-grid ig-skill-detail-grid"><section class="ig-detail-main ig-skill-document" data-skill-detail data-skill-id="${esc(row.id)}" data-skill-revision="${row.revision}" tabindex="0" role="region" aria-label="技能 Markdown 预览" aria-busy="${state?.status==='loading'}"><div class="ig-skill-file-label">SKILL.md</div>${body}</section><aside class="ig-detail-aside" aria-label="技能操作">${button('use-skill',state?.useController?'正在准备…':'立即使用',true,!this.canUseSkill(row))}${unavailable?`<p class="ig-note">${esc(unavailable)}</p>`:''}${state?.useError?`<p class="ig-error" role="alert">${esc(state.useError)}</p>`:''}${state?.useMessage?`<p class="ig-note" role="status">${esc(state.useMessage)}</p>`:''}<section class="ig-help"><h2>${esc(row.status)}</h2><p>将在对话中填入技能，发送前仍可补充具体需求。</p></section><div class="ig-skill-actions">${this.detailToggleButton(row)}${row.removable?button('request-uninstall','删除技能'):''}</div></aside></div>`;
    }
    private detailContent(row?: IntegrationRow) {
        if (!row) return '<p class="ig-empty">该项目已不存在，请返回列表刷新。</p>';
        if (row.kind === 'skill') return this.skillDetailContent(row);
        if (row.kind === 'plugin') {
            return `<section class="ig-detail-identity"><h2>${esc(row.name)}</h2><p>${esc(row.source)}${row.detail ? ` · ${esc(row.detail)}` : ''}</p></section><div class="ig-detail-grid"><section class="ig-detail-main ig-capabilities"><h2>可以帮你做什么</h2><p data-ui-preserve>${esc(row.description)}</p><p>启用后，可在当前账号允许的工作区中使用这项能力。</p></section><aside class="ig-detail-aside"><section class="ig-help"><h2>${esc(row.status)}</h2><p>插件控制能力是否可用，应用账号与工具权限可在对应连接中管理。</p></section>${this.detailToggleButton(row,!row.enabled)}${row.removable ? `<hr><p class="ig-note">卸载前会检查关联任务，已有应用连接仍会保留。</p>${button('request-uninstall','卸载')}` : ''}</aside></div>`;
        }
        const summary = row.connectionSummary;
        const capability = this.snapshot.taskCapabilities?.find(item => item.entityId === row.id);
        const scope = summary?.workspaceLabel || (capability ? capability.workspaceIds?.length ? capability.workspaceIds.join('、') : '当前账号的所有工作区' : '查看连接配置中的使用范围');
        const tools = row.tools || [];
        const allowed = tools.filter(tool => tool.allowed).length;
        const dependencies = summary?.dependencies;
        const summaryRow = (label: string, value: string, action?: string, actionLabel?: string, extra = '') => `<div class="ig-summary-row"><div><span>${label}</span><strong>${esc(value)}</strong>${extra}</div>${action ? button(action, actionLabel || '') : ''}</div>`;
        const summaryContent = summaryRow('使用范围', scope, row.configurable===false?undefined:'edit-connection', '修改范围')
            + summaryRow('允许调用', `${allowed} 个已授权工具 · 共 ${tools.length} 个工具`, 'manage-tools', this.toolsExpanded ? '收起工具' : row.toolsReadonly?'查看工具':'管理工具')
            + summaryRow('认证方式', summary?.authLabel || '查看连接配置', row.configurable===false?undefined:'edit-connection', '管理凭据')
            + summaryRow('关联任务', dependencies ? dependencies.length ? `${dependencies.length} 个任务依赖这条连接` : '暂无关联任务' : '移除连接前会检查关联任务', dependencies?.length ? 'show-dependencies' : undefined, this.dependenciesExpanded ? '收起任务' : '查看任务', this.dependenciesExpanded && dependencies?.length ? `<ul>${dependencies.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '');
        const selected = this.toolsExpanded ? this.toolSelections(row) : undefined;
        const allSelected=!!tools.length && tools.every(tool=>selected?.has(tool.id));
        const toolForm = this.toolsExpanded ? `<section class="ig-tools" aria-label="工具权限"><header class="ig-tools-head"><h2>允许使用的工具</h2><div class="ig-tools-head-actions"><span>${tools.length} 个工具</span>${tools.length && !row.toolsReadonly ? `<button type="button" class="ig-tool-select-all" data-action="toggle-all-tools" aria-pressed="${allSelected}">${allSelected ? '取消全选' : '全选'}</button>` : ''}</div></header><p class="ig-tools-intro">${row.toolsReadonly?'内置通联工具默认全部启用，登录 EWork 后即可使用。':'已配置的工具及后续新增工具默认允许调用；取消勾选可停用指定工具。'}</p>${tools.length ? tools.map(tool => `<label class="ig-tool-row"><input type="checkbox" name="toolGrant" value="${esc(tool.id)}" ${selected?.has(tool.id) ? 'checked' : ''} ${row.toolsReadonly?'disabled':''}><div><strong>${esc(tool.name)}</strong><span>${esc(tool.description)}</span></div></label>`).join('') : '<p class="ig-note">暂未发现工具。请先完善配置并测试连接。</p>'}<footer class="ig-tool-actions">${button('cancel-tool-grants', row.toolsReadonly?'收起':'取消')}${row.toolsReadonly?'':button('grant-tools', '保存工具权限', true, !tools.length)}</footer></section>` : '';
        return `<div class="ig-detail-grid"><div class="ig-detail-main">${this.toolsExpanded ? toolForm : `<section class="ig-detail-summary">${summaryContent}</section>`}</div><aside class="ig-detail-aside" aria-label="连接状态"><section class="ig-help"><h2>${esc(row.status)}</h2><p>${esc(summary?.healthDetail || row.detail || '点击重新测试，检查这条连接的实际可用状态。')}</p></section>${button('probe', '重新测试')}${this.detailToggleButton(row)}${['google-calendar', 'notion'].includes(row.connectionType || '') ? button('authorize', '授权连接', true) : ''}${row.configurable===false?'<p class="ig-note">随 EWork 提供，默认启用，可随时停用；使用前请登录 EWork。</p>':`<hr><p class="ig-note">断开连接会影响依赖它的定时任务；已有内容仍会保留。</p>${button('disconnect', '断开连接')}`} ${row.removable ? button('request-uninstall', '移除连接') : ''}</aside></div>`;
    }
    private renderFeedback() {
        if (!this.root) return;
        const error = this.root.querySelector<HTMLElement>('.ig-error');
        if (error) error.textContent = this.error;
        const message = this.root.querySelector<HTMLElement>('.ig-live');
        if (message) message.textContent = this.message;
        const existing = this.root.querySelector<HTMLButtonElement>('[data-action="cancel-operation"]');
        if (this.busy && this.operation?.cancellable) {
            if (!existing) {
                const cancel = this.document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'ig-button ig-secondary';
                cancel.dataset.action = 'cancel-operation';
                cancel.textContent = '取消操作';
                this.root.querySelector('.ig-actions')?.append(cancel);
            }
        } else existing?.remove();
    }
    private onInput = (event: Event) => { const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; if (!target.name)
        return; if(target.name==='toolGrant' && this.route.page==='detail' && this.toolsExpanded){
        const row=this.snapshot.rows.find(item=>item.id===this.routeId());
        if(row?.kind==='connection' && row.tools?.some(tool=>tool.id===target.value)){const selected=this.toolSelections(row);if((target as HTMLInputElement).checked)selected.add(target.value);else selected.delete(target.value);this.syncToolSelectAll(row);}
        return;
    } if (this.route.page === 'connection') {
        const redraw = this.connectionEditor.input(target, this.draft);
        if (redraw) { this.draftVersion++; this.render(); }
        else if (target.name.startsWith('manual-')) this.draftVersion++;
    } if (target.name === 'query') {
        this.query = target.value;
        const list = this.root?.querySelector('.ig-list');
        if (list && this.route.page === 'list')
            list.innerHTML = this.listContent(this.route.tab);
        return;
    } if (target.name === 'manifest') {
        this.manifest = target.value;
        return;
    } if (target.name === 'sourceUrl') {
        this.sourceUrl = target.value;
        return;
    } if (this.route.page === 'connection' && target.name in this.draft) {
        const name = target.name as keyof ConnectionDraft;
        if (name === 'allowPrivateNetwork')
            this.draft.allowPrivateNetwork = (target as HTMLInputElement).checked;
        else
            (this.draft as unknown as Record<string, string>)[name] = target.value;
        this.draftVersion++;
        this.message = '';
        this.renderFeedback();
        if(target.name==='toolsJson') this.updateBusy();
    } };
    private onClick = (event: Event) => { const target = (event.target as Element).closest<HTMLButtonElement>('button'); if (!target || target.disabled)
        return; if (target.dataset.legacyReveal !== undefined) { void this.revealLegacySource(Number(target.dataset.legacyReveal)); return; } const id = target.dataset.detail; if (id) {
        const row = this.snapshot.rows.find(r => r.id === id);
        if (row)
            this.navigate({ page: 'detail', id, tab: row.tab });
        return;
    } if (target.dataset.tab) {
        this.clearToolGrantDraft();
        this.history = [{ page: 'list', tab: target.dataset.tab as IntegrationTab }];
        this.loading = false;
        this.epoch++;
        this.query = '';
        this.error = '';
        this.render();
        return;
    } if (target.dataset.more) {
        this.showMenu(target, target.dataset.more);
        return;
    } if (target.dataset.toggle) {
        const row = this.snapshot.rows.find(r => r.id === target.dataset.toggle);
        if (row && row.toggleable!==false)
            void this.run({ type: 'set-enabled', kind: row.kind, id: row.id, enabled: !row.enabled, meta: this.meta(row.id) });
        return;
    } if (target.dataset.menuAction) {
        void this.menuAction(target.dataset.menuAction);
        return;
    } if (target.dataset.add) {
        void this.chooseAdd(target.dataset.add);
        return;
    } if (target.dataset.marketCategory && this.route.page === 'market') {
        this.marketCategory = target.dataset.marketCategory as MarketCategory; this.render(); return;
    } if (target.dataset.marketEntry && this.route.page === 'market') {
        this.navigate({ page: 'market-detail', kind: this.route.kind, id: target.dataset.marketEntry });
        return;
    } if(target.dataset.action==='add' && this.route.page==='list'){this.showAddMenu(target);return;}
    if (target.dataset.action)
        void this.action(target.dataset.action); };
    private async chooseAdd(type: string) { if (type === 'skill') {
        this.preview = undefined;
        this.navigate({ page: 'skill-import' });
        await this.chooseSkill();
        return;
    } if (type === 'plugin') {
        this.navigate({ page: 'create-plugin' });
        return;
    } this.draft = emptyConnectionDraft(type as ConnectionDraft['type']); this.connectionEditor.reset(); this.draftVersion++; this.navigate({ page: 'connection', type: this.draft.type }); }
    private async action(action: string) {
        if (['probe','compile-openapi','edit-connection'].includes(action)) return this.withPending(action,()=>this.performAction(action));
        return this.performAction(action);
    }
    private async performAction(action: string) {
        if(this.route.page==='connection') {
            const result=this.connectionEditor.action(action,this.draft);
            if(result.handled){this.draftVersion++;this.error=result.error||'';this.message='';this.render();if(['form-next','form-previous','form-manual','form-manual-cancel','form-manual-save'].includes(action))this.scrollToTop();return;}
        }
        const route = this.route, row = this.snapshot.rows.find(r => r.id === this.routeId());
        switch (action) {
            case 'retry-skill-detail':
                if(row?.kind==='skill'){this.clearSkillDetail();this.render();}
                break;
            case 'use-skill':
                await this.useCurrentSkill(row);
                break;
            case 'back':
                this.back();
                break;
            case 'market':
                this.marketCategory = 'all';
                if (route.page === 'list')
                    this.navigate({ page: 'market', kind: marketKinds[route.tab] });
                break;
            case 'add-source':
                if (route.page === 'market' || route.page === 'list')
                    this.navigate({ page: 'add-source', kind: route.page === 'market' ? route.kind : 'plugin' });
                break;
            case 'save-source':
                await this.run({ type: 'add-source', url: this.sourceUrl, meta: this.meta() }, () => {
                    this.back();
                    void this.loadMarket();
                });
                break;
            case 'create-plugin':
                try {
                    JSON.parse(this.manifest);
                }
                catch {
                    this.showError('请填写有效的 JSON 插件清单。');
                    break;
                }
                await this.run({ type: 'create-plugin', manifest: this.manifest, meta: this.meta() }, () => this.showOperationEntity('plugins'));
                break;
            case 'install':
                if(route.page==='market-detail') {
                    const entry=this.entries.find(item=>item.id===route.id);
                    if(!entry || entry.installed || !entry.available)break;
                    if(entry && (entry.kind==='app'||entry.kind==='tool')) {
                        const blueprint=entry.blueprint;
                        if(!blueprint?.type) {this.showError('此目录条目缺少可配置的连接方式，请刷新目录。');break;}
                        this.draft=emptyConnectionDraft(blueprint.type);this.connectionEditor.reset();
                        for(const key of ['name','url','clientId','command','args','cwd','authType','headerName','toolsJson'] as const) {
                            if(typeof blueprint[key]==='string') (this.draft as unknown as Record<string,string>)[key]=blueprint[key]!;
                        }
                        this.draftVersion++;
                        this.navigate({page:'connection',type:this.draft.type});
                    } else await this.run({type:'install',entryId:route.id,meta:this.meta()},()=>this.showOperationEntity(route.kind==='skill'?'skills':'plugins'));
                }
                break;
            case 'save-connection':
                if (!this.draft.name.trim()) {
                    this.showError('请填写连接名称。');
                    break;
                }
                if (this.draft.type === 'api' && !this.draft.url.trim()) {
                    this.showError('请填写 API 基础地址。');
                    break;
                }
                if(this.draft.type==='api' && !this.hasApiTools()){this.showError('请先添加至少一个有效的工具。');break;}
                await this.run({ type: 'save-connection', draft: { ...this.draft }, meta: this.meta(this.draft.id) }, () => { this.draft.secret = ''; const id = this.operation?.entityId; this.history = [{ page: 'list', tab: this.draft.type.startsWith('mcp') ? 'mcp' : 'apps' }]; if (id && this.snapshot.rows.some(r => r.id === id))
                    this.history.push({ page: 'detail', id, tab: this.draft.type.startsWith('mcp') ? 'mcp' : 'apps' }); this.render(); });
                break;
            case 'compile-openapi':
                {
                    const epoch = this.epoch, version = this.draftVersion;
                    this.message='正在解析接口文档…';this.renderFeedback();
                    try {
                        const result = await this.request({ type: 'compile-openapi', document: this.draft.openApiDocument }, 'compiled');
                        if (epoch !== this.epoch || version !== this.draftVersion)
                            return;
                        this.draft.toolsJson = result.toolsJson;
                        this.connectionEditor.showTools();
                        this.message = result.diagnostics.length ? result.diagnostics.join('\n') : '接口已解析，请检查工具定义与权限。';
                        this.render();
                    }
                    catch (error) {
                        if (epoch === this.epoch && version === this.draftVersion)
                            this.showError(error);
                    }
                }
                break;
            case 'import-file':
                this.closeMenu();await this.chooseAdd('skill');
                break;
            case 'legacy-preview':
            case 'legacy-recheck':
                {const anchor=this.menuAnchor;this.closeMenu();anchor?.isConnected&&anchor.focus();await this.showLegacyPreview();}
                break;
            case 'legacy-reselect':
                this.closeDialog();
                await this.chooseAdd('skill');
                break;
            case 'confirm-legacy-migration':
                if(this.legacyEligibleCount>0 && this.dialogId==='legacy-skills') {this.closeDialog();await this.run({type:'migrate-legacy-skills',meta:this.meta()},()=>{this.history=[{page:'list',tab:'skills'}];this.render();});}
                break;
            case 'choose-skill':
                await this.chooseSkill();
                break;
            case 'import-skill':
                if (this.preview) {
                    const mode = this.root?.querySelector<HTMLSelectElement>('[name=importMode]')?.value === 'replace' ? 'replace' : 'copy';
                    await this.run({ type: 'import-skill', previewId: this.preview.previewId, mode, meta: this.meta() }, () => { this.preview = undefined; this.showOperationEntity('skills'); });
                }
                break;
            case 'edit-connection':
                if (row) {
                    const epoch = this.epoch;
                    this.message='正在读取连接配置…';this.renderFeedback();
                    try {
                        const reply = await this.request({ type: 'connection-draft', id: row.id }, 'draft');
                        if (epoch !== this.epoch)
                            return;
                        this.draft = { ...reply.draft, secret: '' };
                        this.connectionEditor.reset();
                        this.navigate({ page: 'connection', type: this.draft.type, id: row.id });
                    }
                    catch (error) {
                        if (epoch === this.epoch)
                            this.showError(error);
                    }
                }
                break;
            case 'probe':
                if (row) {
                    const epoch = this.epoch;
                    this.message = '正在测试连接…';
                    this.renderFeedback();
                    try {
                        const reply = await this.request({ type: 'probe', id: row.id }, 'probe');
                        if (epoch !== this.epoch)
                            return;
                        this.message = `${reply.status === 'verified' ? '连接已验证' : reply.status === 'config-valid' ? '配置有效，尚未验证服务' : reply.status === 'failed' ? '测试失败' : '尚未验证'}：${reply.message}`;
                        await this.refresh();
                    }
                    catch (error) {
                        if (epoch === this.epoch)
                            this.showError(error);
                    }
                }
                break;
            case 'manage-tools':
                const expand=!this.toolsExpanded;this.clearToolGrantDraft();this.toolsExpanded=expand;this.render();
                this.scrollToTop();
                break;
            case 'toggle-all-tools':
                if(row?.kind==='connection' && !row.toolsReadonly && this.toolsExpanded && row.tools?.length){
                    const selected=this.toolSelections(row);
                    const selectAll=row.tools.some(tool=>!selected.has(tool.id));
                    for(const tool of row.tools)if(selectAll)selected.add(tool.id);else selected.delete(tool.id);
                    this.root?.querySelectorAll<HTMLInputElement>('input[name=toolGrant]').forEach(input=>{input.checked=selected.has(input.value)});
                    this.syncToolSelectAll(row);
                }
                break;
            case 'cancel-tool-grants':
                this.clearToolGrantDraft();this.render();
                break;
            case 'show-dependencies':
                this.dependenciesExpanded = !this.dependenciesExpanded; this.render();
                break;
            case 'grant-tools':
                if (row && !row.toolsReadonly) {
                    const toolIds = [...this.toolSelections(row)];
                    await this.run({ type: 'grant-tools', id: row.id, toolIds, meta: this.meta(row.id) },()=>{this.clearToolGrantDraft();this.render();});
                }
                break;
            case 'authorize':
                if (row)
                    await this.run({ type: 'authorize', id: row.id, meta: this.meta(row.id) });
                break;
            case 'disconnect':
                if (row)
                    await this.confirmRemoval(row, true);
                break;
            case 'toggle-detail':
                if (row && row.toggleable!==false)
                    await this.run({ type: 'set-enabled', kind: row.kind, id: row.id, enabled: !row.enabled, meta: this.meta(row.id) });
                break;
            case 'request-uninstall':
                if (row)
                    await this.confirmRemoval(row);
                break;
            case 'cancel-dialog':
                this.closeDialog();
                break;
            case 'confirm-rollback':
                {
                    const entity = this.snapshot.rows.find(r => r.id === this.dialogId);
                    this.closeDialog();
                    if (entity?.kind === 'plugin' && entity.canRollback) await this.run({type:'rollback-plugin',id:entity.id,meta:this.meta(entity.id)}, () => {this.history=[{page:'list',tab:'plugins'}];this.render();});
                }
                break;
            case 'confirm-uninstall':
            case 'confirm-disconnect':
                {
                    const entity = this.snapshot.rows.find(r => r.id === this.dialogId);
                    this.closeDialog();
                    if (entity)
                        await this.run(action === 'confirm-disconnect' ? { type: 'disconnect', id: entity.id, meta: this.meta(entity.id) } : { type: 'uninstall', kind: entity.kind, id: entity.id, meta: this.meta(entity.id) }, () => { this.history = [{ page: 'list', tab: entity.tab }]; this.render(); });
                }
                break;
            case 'cancel-operation':
                if (this.operation) {
                    try {
                        await this.bridge.request({ type: 'cancel-operation', id: this.operation.id });
                        this.message = '已请求取消，正在等待操作结果。';
                        this.renderFeedback();
                    }
                    catch (error) {
                        this.showError(error);
                    }
                }
                break;
        }
    }
    private showLegacyPreview() { return this.withPending('legacy',()=>this.loadLegacyPreview()); }
    private async loadLegacyPreview() {
        this.closeDialog();const epoch=this.epoch,seq=++this.legacyPreviewSeq;this.error='';this.message='正在检查旧技能…';this.renderFeedback();this.returnFocus=this.document.activeElement as HTMLElement;
        try {
            const reply=await this.request({type:'legacy-preview'},'legacy-preview');
            if(epoch!==this.epoch || seq!==this.legacyPreviewSeq || !this.root)return;
            this.message='';this.renderFeedback();this.legacyEligibleCount=reply.eligibleCount;this.legacyItems=reply.items;this.dialogId='legacy-skills';
            const overlay=this.document.createElement('div');overlay.className='ig-overlay';
            overlay.innerHTML=legacyPreviewMarkup(reply, !!this.bridge.revealSource);
            this.root.append(overlay);overlay.querySelector<HTMLButtonElement>('[data-action=cancel-dialog]')?.focus();
        } catch(error) {if(epoch===this.epoch && seq===this.legacyPreviewSeq){this.message='';this.renderFeedback();this.showError(error);}}
    }
    private async revealLegacySource(index: number) {
        const item=this.legacyItems[index],epoch=this.epoch,seq=this.legacyPreviewSeq;
        if(this.dialogId!=='legacy-skills' || !item?.sourcePath || !this.bridge.revealSource)return;
        const feedback=this.root?.querySelector<HTMLElement>(`[data-legacy-feedback="${index}"]`);
        try {await this.bridge.revealSource(item.sourcePath);if(epoch===this.epoch && seq===this.legacyPreviewSeq && feedback?.isConnected)feedback.textContent='已在 Finder 中显示来源，原文件未修改。';}
        catch {if(epoch===this.epoch && seq===this.legacyPreviewSeq && feedback?.isConnected)feedback.textContent='暂时无法定位来源；请确认目录仍存在，也可复制上方路径在 Finder 中打开。';}
    }
    private acceptsSkillDrop(event:DragEvent){return this.host.current()?.surface==='integrations'&&(this.route.page==='skill-import'||this.route.page==='list'&&this.route.tab==='skills')&&Array.from(event.dataTransfer?.types??[]).includes('Files');}
    private onSkillDragOver=(event:DragEvent)=>{if(!this.acceptsSkillDrop(event))return;event.preventDefault();event.stopPropagation();if(event.dataTransfer)event.dataTransfer.dropEffect=this.pendingActions.has('skill')||this.busy?'none':'copy';this.root?.setAttribute('data-skill-drag','true');};
    private onSkillDragLeave=(event:DragEvent)=>{if(!this.root?.contains(event.relatedTarget as Node))this.root?.removeAttribute('data-skill-drag');};
    private onSkillDrop=(event:DragEvent)=>{
        if(!this.acceptsSkillDrop(event))return;event.preventDefault();event.stopPropagation();this.root?.removeAttribute('data-skill-drag');
        if(this.pendingActions.has('skill')||this.busy)return;
        const files=Array.from(event.dataTransfer?.files??[]),items=Array.from(event.dataTransfer?.items??[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file)),selected=files.length?files:items;
        if(selected.length!==1){this.showError('请拖入一个包含 SKILL.md 的完整技能文件夹，或该文件夹中的 SKILL.md。');return;}
        let path='';try{path=this.bridge.getPathForFile?.(selected[0]!)||'';}catch{}
        if(!path){this.showError('未取得本地文件路径，请使用“选择文件”导入完整技能文件夹。');return;}
        if(this.route.page!=='skill-import')this.navigate({page:'skill-import'});
        void this.withPending('skill',()=>this.loadSkillPreview(path));
    };
    private chooseSkill() { return this.withPending('skill',()=>this.loadSkillPreview()); }
    private async loadSkillPreview(path?:string) { const epoch = this.epoch; this.error = ''; this.message=path?'正在检查完整技能包…':'正在选择并检查技能…';this.renderFeedback();try {
        const reply = await this.request({ type: 'preview-skill',...(path?{path}:{}) }, 'preview');
        if (epoch !== this.epoch)
            return;
        this.message='';if(reply.preview) this.preview = reply.preview;
        this.render();
    }
    catch (error) {
        if (epoch === this.epoch)
            this.showError(error);
    } }
    private showAddMenu(anchor: HTMLButtonElement) {
        this.openMenu(anchor,'@add','添加能力',
            '<button type="button" role="menuitem" data-add="plugin">创建插件</button>' +
            '<button type="button" role="menuitem" data-action="add-source">添加市场来源</button>' +
            '<button type="button" role="menuitem" data-add="api">自定义 API</button>' +
            '<button type="button" role="menuitem" data-add="mcp-http">添加 MCP 服务器</button>' +
            '<div class="ig-menu-separator" role="separator"></div>' +
            '<button type="button" role="menuitem" data-action="import-file">导入技能</button>' +
            '<button type="button" role="menuitem" data-action="legacy-preview">接入旧技能</button>');
    }
    private showMenu(anchor: HTMLButtonElement, id: string) {
        const row=this.snapshot.rows.find(item=>item.id===id);if(!row)return;
        const locked=this.busy || this.pendingActions.size>0;
        const item=(action:string,label:string,destructive=false)=>`<button type="button" role="menuitem" data-menu-action="${action}" ${destructive?'class="ig-danger"':''} ${locked&&action!=='detail'?'disabled':''}>${label}</button>`;
        this.openMenu(anchor,id,`${row.name}的更多操作`,`${item('detail','查看详情')}${row.toggleable===false?'':item('toggle',row.enabled?'停用':'启用')}${row.kind==='connection'?item('probe','测试连接')+(row.configurable===false?'':item('disconnect','断开连接')):''}${row.marketEntryId&&row.kind!=='connection'?item('check-update','检查更新'):''}${row.kind==='plugin'&&row.canRollback?item('rollback','回退上一版本'):''}${row.removable?'<div class="ig-menu-separator" role="separator"></div>'+item('uninstall',row.kind==='connection'?'移除连接':row.kind==='skill'?'删除技能':'卸载',true):''}`);
    }
    private openMenu(anchor:HTMLButtonElement,id:string,label:string,markup:string) {
        if(this.menuId===id){this.closeMenu();return;}
        this.closeMenu();if(!this.root)return;
        this.menuAnchor=anchor;this.menuId=id;anchor.setAttribute('aria-expanded','true');
        const menu=this.document.createElement('div');menu.className='ig-menu';menu.dataset.integrationEntity=id;menu.setAttribute('role','menu');menu.setAttribute('aria-label',label);menu.innerHTML=markup;
        this.root.append(menu);
        const rect=anchor.getBoundingClientRect(),panel=this.root.getBoundingClientRect(),bounds=menu.getBoundingClientRect();
        const viewportWidth=this.document.defaultView?.innerWidth||1280,viewportHeight=this.document.defaultView?.innerHeight||800;
        const width=bounds.width||194,height=bounds.height||menu.querySelectorAll('button').length*34+14;
        const leftEdge=Math.max(8,panel.left+8),rightEdge=Math.min(viewportWidth-8,panel.right>panel.left?panel.right-8:viewportWidth-8);
        const bottom=Math.min(viewportHeight-8,panel.bottom>panel.top?panel.bottom-8:viewportHeight-8);
        const above=rect.top-height-6;
        menu.style.left=`${Math.max(leftEdge,Math.min(rect.right-width,rightEdge-width))}px`;
        menu.style.top=`${Math.max(8,rect.bottom+6+height<=bottom?rect.bottom+6:above)}px`;
        menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
    }
    private onMenuLayoutChanged=()=>{if(this.menuId)this.closeMenu();};
    private async menuAction(action: string) { const row = this.snapshot.rows.find(r => r.id === this.menuId); this.closeMenu(); if (!row)
        return; if (action === 'check-update' && row.marketEntryId && row.kind !== 'connection') { this.navigate({page:'market',kind:marketKinds[row.tab],focusEntryId:row.marketEntryId}); return; }
    if (action === 'rollback' && row.kind === 'plugin' && row.canRollback) { await this.confirmRollback(row); return; }
    if (action === 'uninstall' || action === 'disconnect') {
        await this.confirmRemoval(row, action === 'disconnect');
        return;
    } if (action === 'toggle') {
        if(row.toggleable===false)return;
        await this.run({ type: 'set-enabled', kind: row.kind, id: row.id, enabled: !row.enabled, meta: this.meta(row.id) });
        return;
    } this.navigate({ page: 'detail', id: row.id, tab: row.tab }); if (action === 'probe')
        await this.action('probe'); }
    private closeMenu() { this.root?.querySelector('.ig-menu')?.remove(); this.menuAnchor?.setAttribute('aria-expanded', 'false'); this.menuId = undefined; }
    private confirmRemoval(row: IntegrationRow, disconnect = false) { return this.withPending('dependencies',()=>this.loadRemoval(row,disconnect)); }
    private async loadRemoval(row: IntegrationRow, disconnect = false) { this.closeDialog();const epoch = this.epoch; this.returnFocus = this.menuAnchor?.isConnected ? this.menuAnchor : this.document.activeElement as HTMLElement;this.message='正在检查关联任务…';this.renderFeedback();try {
        const reply = await this.request({ type: 'dependencies', kind: row.kind, id: row.id }, 'dependencies');
        if (epoch !== this.epoch || !this.root)
            return;
        this.message='';this.renderFeedback();this.dialogId = row.id;
        const overlay = this.document.createElement('div');
        overlay.className = 'ig-overlay';
        overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="ig-confirm-title" class="ig-dialog ig-confirm-dialog"><h2 id="ig-confirm-title">${disconnect ? '断开' : row.kind==='skill'?'删除':'卸载'}“${esc(row.name)}”？</h2><div class="ig-dialog-body" role="region" aria-label="关联任务与影响" tabindex="0"><p>${disconnect ? '断开后将撤销此连接，新的调用无法继续使用。' : row.kind==='skill'?'此技能将从 EWork 中删除，之后不会再用于新任务。原始文件、已有对话和插件的其他能力都会保留。':'此项目及其托管能力将被移除，已有对话和引用内容会保留。'}</p>${reply.descriptions.length ? `<ul>${reply.descriptions.map(description => `<li>${esc(description)}</li>`).join('')}</ul>` : '<p>当前没有记录到依赖此项目的任务。</p>'}${row.kind === 'plugin' ? '<p>应用账号连接仍在「应用」中单独管理。</p>' : ''}</div><footer>${button('cancel-dialog', '取消')}${button(disconnect ? 'confirm-disconnect' : 'confirm-uninstall', disconnect ? '确认断开' : row.kind==='skill'?'确认删除':'确认卸载', true)}</footer></section>`;
        this.root.append(overlay);
        overlay.querySelector<HTMLButtonElement>('[data-action=cancel-dialog]')?.focus();
    }
    catch (error) {
        if (epoch === this.epoch)
            this.showError(error);
    } }
    private confirmRollback(row: IntegrationRow) { return this.withPending('dependencies',()=>this.loadRollback(row)); }
    private async loadRollback(row: IntegrationRow) {
        this.closeDialog();const epoch=this.epoch;
        this.returnFocus=this.menuAnchor || this.document.activeElement as HTMLElement;
        this.message='正在检查关联任务…';this.renderFeedback();
        try {
            const reply=await this.request({type:'dependencies',kind:row.kind,id:row.id},'dependencies');
            if(epoch!==this.epoch || !this.root)return;
            this.message='';this.renderFeedback();this.dialogId=row.id;
            const overlay=this.document.createElement('div');overlay.className='ig-overlay';
            overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="ig-confirm-title" class="ig-dialog ig-confirm-dialog"><h2 id="ig-confirm-title">回退“${esc(row.name)}”的上一版本？</h2><div class="ig-dialog-body" role="region" aria-label="关联任务与影响" tabindex="0"><p>恢复上一版本的插件和技能文件。应用账号连接会保留；依赖此插件的任务需要重新核对工具版本与授权。</p>${reply.descriptions.length?`<ul>${reply.descriptions.map(description=>`<li>${esc(description)}</li>`).join('')}</ul>`:''}</div><footer>${button('cancel-dialog','取消')}${button('confirm-rollback','确认回退',true)}</footer></section>`;
            this.root.append(overlay);overlay.querySelector<HTMLButtonElement>('[data-action=cancel-dialog]')?.focus();
        } catch(error) {if(epoch===this.epoch)this.showError(error);}
    }
    private closeDialog() { this.root?.querySelector('.ig-overlay')?.remove(); this.dialogId = undefined; this.returnFocus?.isConnected && this.returnFocus.focus(); this.returnFocus = undefined; }
    private onFocusOutside=(event:Event)=>{if(this.menuId && !this.root?.querySelector('.ig-menu')?.contains(event.target as Node) && event.target!==this.menuAnchor)this.closeMenu();};
    private onOutside = (event: Event) => { if (this.menuId && !this.root?.querySelector('.ig-menu')?.contains(event.target as Node) && !this.menuAnchor?.contains(event.target as Node))
        this.closeMenu(); };
    private onKey = (event: KeyboardEvent) => { if (!this.root || this.root.hidden)
        return; const target = event.target as Element; if (target?.closest?.('[role=tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index = tabs.indexOf(target.getAttribute('data-tab') as IntegrationTab), next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + 4) % 4;
        this.root.querySelector<HTMLButtonElement>(`[data-tab=${tabs[next]}]`)?.click();
        this.root.querySelector<HTMLButtonElement>(`[data-tab=${tabs[next]}]`)?.focus();
        return;
    } const dialog = this.root.querySelector('.ig-dialog'), menu = this.root.querySelector('.ig-menu'); if (event.key === 'Escape') {
        if (dialog) {
            event.preventDefault();
            this.closeDialog();
        }
        else if (menu) {
            event.preventDefault();
            const anchor = this.menuAnchor;
            this.closeMenu();
            anchor?.focus();
        }
        return;
    } if(menu && event.key==='Tab'){const anchor=this.menuAnchor;this.closeMenu();anchor?.focus();return;}
    if (menu?.contains(target) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')), at = buttons.indexOf(this.document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    } if (dialog && event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const at = controls.indexOf(this.document.activeElement as HTMLButtonElement);
        if ((event.shiftKey && at <= 0) || (!event.shiftKey && at === controls.length - 1)) {
            event.preventDefault();
            controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
        }
    } };
}
