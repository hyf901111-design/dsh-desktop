export type WorkspaceSurface = 'scheduled' | 'integrations';
type SurfaceLocation = {
    surface: WorkspaceSurface;
    route?: string;
};
/** Coordinates owned workspace surfaces without unmounting their drafts or the conversation. */
export class WorkspaceSurfaceHost {
    private surfaces = new Map<WorkspaceSurface, HTMLElement>();
    private history: SurfaceLocation[] = [];
    private background?: HTMLElement;
    private backgroundWasInert = false;
    private observer?: MutationObserver;
    private resizeObserver?: ResizeObserver;
    private expanded = false;
    constructor(private document: Document) {
        document.addEventListener('sherlock:search-session-opened', this.closeAll);
        document.addEventListener('click', this.onNavigate, true);
        document.defaultView?.addEventListener('resize', this.position);
        document.defaultView?.addEventListener('sherlock:workspace-panel-state', this.onPanelState);
        const Observer = document.defaultView?.MutationObserver;
        if (Observer) {
            this.observer = new Observer(this.position);
            this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-sidebar-wide', 'data-theme', 'data-ds-dark-theme', 'class', 'data-odyssey-panel-right'] });
        }
        const Resize = document.defaultView?.ResizeObserver;
        const sidebar = document.querySelector('[data-dsh-sidebar-root]');
        if (Resize && sidebar) {
            this.resizeObserver = new Resize(this.position);
            this.resizeObserver.observe(sidebar);
        }
    }
    register(surface: WorkspaceSurface, element: HTMLElement) {
        this.surfaces.set(surface, element);
        element.hidden = true;
        element.style.display = 'none';
        element.dataset.workspaceSurface = surface;
        (this.document.querySelector('.pI_x6G_frame') || this.document.body).append(element);
        this.position();
    }
    open(surface: WorkspaceSurface, route?: string) {
        const current = this.history.at(-1);
        if (current?.surface !== surface || current.route !== route)
            this.history.push({ surface, route });
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
                    this.background.inert = true;
                    this.background.dataset.workspaceSurfaceHidden = 'true';
                }
            }
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
    private position = () => {
        const sidebar = this.document.querySelector('[data-dsh-sidebar-root]')?.getBoundingClientRect();
        const left = `${Math.max(10, sidebar?.right || 10)}px`;
        const html = this.document.documentElement;
        const color = this.document.defaultView?.getComputedStyle(this.document.body).color || '';
        const dark = this.document.body.hasAttribute('data-ds-dark-theme') || html.dataset.theme === 'dark' || html.classList.contains('dark') || Number(color.match(/\d+/)?.[0] || 0) > 180;
        for (const element of this.surfaces.values()) {
            if (element.style.left !== left)
                element.style.left = left;
            if (element.dataset.dark !== String(dark))
                element.dataset.dark = String(dark);
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
    private onNavigate = (event: Event) => {
        if (!this.current())
            return;
        const target = event.target as Element;
        if (target?.closest?.('[data-sidebar-session-search],.st-more-zone'))
            return;
        if (target?.closest?.('[data-dsh-sidebar-root] [class*="_sessionRow"],[data-dsh-sidebar-root] [role=row],.hHd-Xa_newSession'))
            this.closeAll();
    };
    dispose() {
        this.closeAll();
        this.observer?.disconnect();
        this.resizeObserver?.disconnect();
        this.document.removeEventListener('sherlock:search-session-opened', this.closeAll);
        this.document.removeEventListener('click', this.onNavigate, true);
        this.document.defaultView?.removeEventListener('resize', this.position);
        this.document.defaultView?.removeEventListener('sherlock:workspace-panel-state', this.onPanelState);
        this.surfaces.clear();
    }
}
