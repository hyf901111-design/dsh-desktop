export const WORKBENCH_LIBRARY_IDS: readonly string[]
export const WORKBENCH_LIBRARY_GUIDANCE: string
export function resolveWorkbenchLibraryPanel(panel: any): any
export function validateWorkbenchLinks(value: unknown, panels: any[]): {sourcePanel:number;targetPanel:number}[] | undefined
export function bindWorkbenchLibraryLinks<T extends {nodeId:string;artifact?:any}>(panels:T[], links?:{sourcePanel:number;targetPanel:number}[]):T[]
