export type WorkspaceSurface = 'scheduled' | 'integrations' | 'notes' | 'browser' | 'knowledge' | 'shared-session' | 'image-factory';
type SurfaceLocation = {
    surface: WorkspaceSurface;
    route?: string;
};
const switchableApps = new Set<WorkspaceSurface>(['browser', 'image-factory', 'knowledge', 'integrations', 'scheduled']);
/** Coordinates owned workspace surfaces without unmounting their drafts or the conversation. */
export class WorkspaceSurfaceHost {
    private surfaces = new Map<WorkspaceSurface, HTMLElement>();
    private history: SurfaceLocation[] = [];
    private background?: HTMLElement;
    private backgroundWasInert = false;
    private observer?: MutationObserver;
    private resizeObserver?: ResizeObserver;
    private expanded = false;
    private positionFrame = 0;
    constructor(private document: Document) {
        if (!document.getElementById('sherlock-workspace-surface-style')) {
            const style = document.createElement('style');
            style.id = 'sherlock-workspace-surface-style';
            // Body portals owned by the resident workspace need the same visibility
            // boundary as its center pane. The active surface owns its own overlays.
            style.textContent = `
                [data-workspace-surface-hidden=true] { visibility: hidden !important; }
                body[data-workspace-surface] :is([data-workspace-background-portal], [data-ework-toolbar-owner]) { display: none !important; }
            `;
            document.head.append(style);
        }
        document.addEventListener('sherlock:search-session-opened', this.onSessionOpened);
        document.addEventListener('sherlock:sidebar-home-opened', this.closeAll);
        document.addEventListener('click', this.onNavigate, true);
        document.defaultView?.addEventListener('resize', this.schedulePosition);
        document.defaultView?.addEventListener('sherlock:workspace-panel-state', this.onPanelState);
        const Observer = document.defaultView?.MutationObserver;
        if (Observer) {
            this.observer = new Observer(this.onDomChanged);
            this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-sidebar-wide', 'data-theme', 'data-ds-dark-theme', 'class', 'data-odyssey-panel-right'] });
        }
        const Resize = document.defaultView?.ResizeObserver;
        const sidebar = document.querySelector('[data-dsh-sidebar-root]');
        if (Resize) {
            this.resizeObserver = new Resize(this.schedulePosition);
            if (sidebar) this.resizeObserver.observe(sidebar);
        }
    }
    register(surface: WorkspaceSurface, element: HTMLElement) {
        this.surfaces.set(surface, element);
        element.hidden = true;
        element.style.display = 'none';
        element.dataset.workspaceSurface = surface;
        // Notes use viewport coordinates from the shared header and pane.
        // The blurred frame creates a fixed-position containing block.
        (['notes','browser','knowledge','shared-session','image-factory'].includes(surface) ? this.document.body : this.document.querySelector('.pI_x6G_frame') || this.document.body).append(element);
        if (this.current()?.surface === surface) this.position();
    }
    open(surface: WorkspaceSurface, route?: string) {
        if (this.settingsOpen() && !['notes','browser','knowledge','shared-session'].includes(surface)) { this.closeAll(); return; }
        const current = this.history.at(-1);
        if (current?.surface !== surface || current.route !== route) {
            const next = { surface, route };
            if (current && switchableApps.has(current.surface) && switchableApps.has(surface))
                this.history[this.history.length - 1] = next;
            else this.history.push(next);
        }
        this.sync();
    }
    back() { this.history.pop(); this.sync(); }
    close(surface: WorkspaceSurface) { this.history = this.history.filter(location => location.surface !== surface); this.sync(); }
    revealConversation() { this.closeAll(); }
    current() { return this.history.at(-1); }
    setRightPaneExpanded(expanded: boolean) {
        // The native pane owns visibility; only its acknowledgement updates UI state.
        this.dispatch('sherlock:workspace-panel', { surface: this.current()?.surface, open: expanded });
    }
    isRightPaneExpanded() { return this.expanded; }
    private dispatch(name: string, detail: unknown) {
        const EventType = this.document.defaultView?.CustomEvent;
        if (EventType)
            this.document.dispatchEvent(new EventType(name, { detail, bubbles: true }));
    }
    private sync() {
        const current = this.current();
        for (const [name, element] of this.surfaces) {
            element.hidden = name !== current?.surface;
            element.style.display = element.hidden ? 'none' : '';
        }
        if (current) {
            if (!this.background) {
                this.background = this.document.querySelector<HTMLElement>('.pI_x6G_centerCol') || undefined;
                if (this.background) {
                    this.backgroundWasInert = this.background.inert;
                    this.background.dataset.workspaceSurfaceHidden = 'true';
                }
            }
            // Notes share the resident native header; hidden conversation
            // content cannot receive focus, while the header stays interactive.
            if (this.background) this.background.inert = ['notes','browser','knowledge','shared-session'].includes(current.surface) ? this.backgroundWasInert : true;
            this.document.body.dataset.workspaceSurface = current.surface;
        }
        else {
            if (this.background) {
                this.background.inert = this.backgroundWasInert;
                delete this.background.dataset.workspaceSurfaceHidden;
            }
            this.background = undefined;
            delete this.document.body.dataset.workspaceSurface;
            delete this.document.body.dataset.workspaceRightExpanded;
        }
        this.position();
        this.dispatch('sherlock:workspace-surface-change', { ...current, active: !!current });
    }
    private settingsOpen() { return !!this.document.querySelector('.VOzbGW_overlay'); }
    private onDomChanged = () => {
        if (!this.current()) return;
        // Native settings can also mount through keyboard or programmatic navigation.
        // End the surface session instead of concealing it behind another layer.
        if (this.current() && !['notes','browser','knowledge','shared-session'].includes(this.current()?.surface ?? '') && this.settingsOpen()) { this.closeAll(); return; }
        this.schedulePosition();
    };
    private schedulePosition = () => {
        const view = this.document.defaultView;
        if (!this.current() || this.positionFrame || !view) return;
        this.positionFrame = view.requestAnimationFrame(() => { this.positionFrame = 0; this.position(); });
    };
    private position = () => {
        if (this.positionFrame) this.document.defaultView?.cancelAnimationFrame(this.positionFrame);
        this.positionFrame = 0;
        const current = this.current();
        if (!current) return;
        const sidebarElement = this.document.querySelector('[data-dsh-sidebar-root]');
        if (sidebarElement) this.resizeObserver?.observe(sidebarElement);
        const sidebar = sidebarElement?.getBoundingClientRect();
        const left = `${Math.max(10, sidebar?.right || 10)}px`;
        const html = this.document.documentElement;
        const color = this.document.defaultView?.getComputedStyle(this.document.body).color || '';
        const dark = this.document.body.hasAttribute('data-ds-dark-theme') || html.dataset.theme === 'dark' || html.classList.contains('dark') || Number(color.match(/\d+/)?.[0] || 0) > 180;
        for (const [name, element] of this.surfaces) {
            if (name !== current.surface) continue;
            element.dataset.settingsOpen = String(this.settingsOpen());
            if (name !== 'knowledge' && name !== 'shared-session' && name !== 'image-factory' && element.style.left !== left)
                element.style.left = left;
            if (element.dataset.dark !== String(dark))
                element.dataset.dark = String(dark);
            if (name === 'knowledge' || name === 'shared-session' || name === 'image-factory') {
                const center = this.document.querySelector<HTMLElement>('.pI_x6G_centerCol');
                if (center) {
                    const box = center.getBoundingClientRect();
                    const view = this.document.defaultView;
                    const reserved = name !== 'knowledge' ? 0 : Math.max(0, parseFloat(view?.getComputedStyle(html).getPropertyValue('--dsh-sidebar-height') || '') || 0);
                    const height = Math.max(0, Math.min(box.bottom, view?.innerHeight ?? box.bottom) - box.top - reserved);
                    const bounds = { left: box.left, top: box.top, width: box.width, height };
                    for (const [property, pixels] of Object.entries(bounds)) {
                        const next = String(pixels) + 'px';
                        if (element.style.getPropertyValue(property) !== next) element.style.setProperty(property, next);
                    }
                    this.resizeObserver?.observe(center);
                }
            }
            if (element.dataset.workspaceSurface === 'notes') {
                const center = this.document.querySelector<HTMLElement>('.pI_x6G_centerCol');
                const header = this.document.querySelector<HTMLElement>('[data-ework-notes-session]');
                if (center && header) {
                    const pane = center.getBoundingClientRect(), chrome = header.getBoundingClientRect();
                    const viewport = header.closest<HTMLElement>('.wSkVaW_root[data-odyssey-page]');
                    const bottom = Math.min(pane.bottom, viewport?.getBoundingClientRect().bottom ?? pane.bottom);
                    const view = this.document.defaultView;
                    element.style.left = `${Math.max(0, pane.left)}px`;
                    element.style.top = `${Math.max(0, chrome.bottom)}px`;
                    element.style.right = `${Math.max(0, (view?.innerWidth || pane.right) - pane.right)}px`;
                    element.style.bottom = `${Math.max(0, (view?.innerHeight || pane.bottom) - bottom)}px`;
                    this.resizeObserver?.observe(center);
                    this.resizeObserver?.observe(header);
                    if (viewport) this.resizeObserver?.observe(viewport);
                }
            }
        }
    };
    private onPanelState = (event: Event) => {
        const detail=(event as CustomEvent<{surface?:string;open?:boolean}>).detail;
        if(detail?.surface==='integrations' && typeof detail.open==='boolean') {
            this.expanded=detail.open;
            if (this.current()?.surface === 'integrations') {
                this.document.body.dataset.workspaceRightExpanded=String(detail.open);
                // The same native button remains mounted in both states, so focus stays put.
            }
        }
    };
    private closeAll = () => { this.history = []; this.sync(); };
    // The native notes view owns its lifecycle. Opening the same session does
    // not unmount it and must not hide its content behind a selected tab.
    private onSessionOpened = () => { if (this.current()?.surface !== 'notes') this.closeAll(); };
    private onNavigate = (event: Event) => {
        if (!this.current())
            return;
        const target = event.target as Element;
        if (target?.closest?.('[data-sidebar-home]')) return;
        if (this.current()?.surface === 'notes' && target?.closest?.('[data-srb-tabs] [data-conversation-view-id]:not([data-conversation-view-id="notes"])')) { this.closeAll(); return; }
        // Account/settings entries ultimately click this existing native trigger.
        // Release inert and cancel the active surface before React mounts settings.
        if (target?.closest?.('.VOzbGW_trigger')) { if (!['notes','browser','knowledge','shared-session'].includes(this.current()?.surface ?? '')) this.closeAll(); return; }
        if (target?.closest?.('[data-sidebar-session-search],.st-more-zone'))
            return;
        if (this.current()?.surface !== 'notes' && !target?.closest?.('[data-sidebar-browser],[data-sidebar-knowledge],[data-sidebar-image-factory],.st-more-zone') && target?.closest?.('[data-dsh-sidebar-root] [class*="_sessionRow"],[data-dsh-sidebar-root] [role=row],.hHd-Xa_newSession'))
            this.closeAll();
    };
    dispose() {
        this.closeAll();
        this.observer?.disconnect();
        this.resizeObserver?.disconnect();
        this.document.removeEventListener('sherlock:search-session-opened', this.onSessionOpened);
        this.document.removeEventListener('sherlock:sidebar-home-opened', this.closeAll);
        this.document.removeEventListener('click', this.onNavigate, true);
        this.document.defaultView?.removeEventListener('resize', this.schedulePosition);
        this.document.defaultView?.removeEventListener('sherlock:workspace-panel-state', this.onPanelState);
        this.surfaces.clear();
    }
}
