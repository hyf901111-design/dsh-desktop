export declare function patchBetterSidebarClient(source: string): string
export declare function patchBetterSidebarEditor(source: string): string
export declare function patchBetterSidebarPackage(packageRoot: string): Promise<void>
export declare function sherlockSessionHasChatFile(session: { events?: Array<{ type: string; data?: any }> } | undefined, targetPath: string): boolean
export declare function patchBetterSidebarServer(source: string): string
export declare function sherlockVirtualBoardDirectory(sessionId: string, cwd: string, target: string, root?: string): Promise<boolean>
export declare function sherlockResearchGenerationOwnsFocus(state: unknown, document?: { querySelector(selectors: string): unknown }): boolean

export declare function odysseyClampPanelWidth(width: number, viewport?: number, document?: unknown): number

export declare function prepareBoardTerminalDirectory(sessionId: string, cwd: string, root?: string): Promise<void>
