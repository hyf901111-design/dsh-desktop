export declare function patchBetterSidebarClient(source: string): string
export declare function patchBetterSidebarPackage(packageRoot: string): Promise<void>
export declare function sherlockSessionHasChatFile(session: { events?: Array<{ type: string; data?: { source?: { kind: string }; content?: Array<{ type: string; text?: string }> } }> } | undefined, targetPath: string): boolean
export declare function patchBetterSidebarServer(source: string): string
export declare function sherlockResearchGenerationOwnsFocus(state: unknown, document?: { querySelector(selectors: string): unknown }): boolean

export declare function odysseyClampPanelWidth(width: number, viewport?: number, document?: unknown): number
