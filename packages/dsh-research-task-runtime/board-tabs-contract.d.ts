export type BoardTabsSpec = {
  version: 1
  type: 'board-tabs'
  title: '页签'
  revision: number
  orientation?: 'horizontal' | 'vertical'
  verticalWidth?: number
  tabs: { id: string; name: string; nodeIds: string[] }[]
}
export function boardTabsSpec(value: unknown): BoardTabsSpec | null
export function boardTabsLayout(spec: BoardTabsSpec | null, fullWidth: number): {
  left: number; top: number; width: number; vertical: boolean; railWidth: number; maxRailWidth: number
}
export function boardTabsApplyWorkbench<T extends {files:any[];artifacts:any[]}>(snapshot:T,plan:{id:string;panels:{nodeId:string}[];tabs?:{name:string;panelIndexes:number[]}[]}):T

export function isBoardTabsRecovery(id: unknown): boolean
