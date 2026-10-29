export const HOME_WORKBENCH_PATH:string
export const HOME_WORKBENCH_EVENT:string
export const HOME_WORKBENCH_PURPOSE:'frozen-research-workbench-replay'
export const HOME_WORKBENCH_PROMPT:string
export const HOME_WORKBENCH_AS_OF:string
export const HOME_WORKBENCH_TABS:readonly {id:string;name:string}[]
export const HOME_WORKBENCH_PANELS:readonly {tab:string;role:string;title:string;parent?:string;begin:number;complete:number;reused?:boolean}[]
export const HOME_WORKBENCH_STEPS:readonly {id:string;title:string;hold:number;result:string}[]
export function homeWorkbenchNodeId(sessionId:string,tab:string,role:string):string
export interface HomeWorkbenchProgressIdentity {version:1;purpose:typeof HOME_WORKBENCH_PURPOSE;runId:string;turn:number}
export interface HomeWorkbenchPlanReceipt extends HomeWorkbenchProgressIdentity {kind:'plan';plans:{id:string;count:number}[]}
export type HomeWorkbenchProgressEvent=HomeWorkbenchPlanReceipt|(HomeWorkbenchProgressIdentity&({kind:'playback';playing:boolean}|{kind:'stopped'|'completed'}))
export function homeWorkbenchPlanReceipt(sessionId:string,runId:string,turn:number):HomeWorkbenchPlanReceipt
export function homeWorkbenchStage(command:string):number
export function homeWorkbenchPanelState(panel:{begin:number;complete:number},stage:number):'completed'|'running'|'queued'
