export declare function patchSidebarPdfPreview(source: string): string
export declare function loadSidebarPdfLibrary(win?: Window): Promise<any>
export declare function mountSidebarPdfPreview(host: HTMLElement, source: string, loadLibrary?: (...args: any[]) => Promise<any>): { ready: Promise<void>; dispose(): void }
