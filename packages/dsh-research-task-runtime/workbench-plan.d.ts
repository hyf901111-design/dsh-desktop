export type WorkbenchPanel = { title: string; prompt: string; type: string; size: 'small' | 'medium' | 'large'; height: number }
export type WorkbenchPlan = { requestId: string; title: string; dataMode?: 'simulated' | 'source'; generationMode?: 'parallel'; tabs?: {name:string;panelIndexes:number[]}[]; panels: WorkbenchPanel[] }
export const PANEL_SIZES: Record<WorkbenchPanel['size'], number>
export function validateWorkbench(value: unknown): WorkbenchPlan
export function layoutWorkbench(panels: WorkbenchPanel[]): (WorkbenchPanel & { x: number; y: number; width: number })[]
export function workbenchPanelPrompt(plan: WorkbenchPlan, panel: WorkbenchPanel & { width: number }, now?: Date): string
