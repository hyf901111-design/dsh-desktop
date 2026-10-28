export type HomeWorkbenchStudyRole='disclosure'|'performance'|'peers'|'valuation'|'matrix'|'dividend'|'cashflow'|'directory'|'reader'|'analysis'|'news'
export type HomeWorkbenchStudySecurity='600519'|'000858'|'000568'
export type HomeWorkbenchStudyReportKind='annual'|'quarter'|'dividend'
export interface HomeWorkbenchStudyScenario {pe:'snapshot'|20|25;epsChange:-5|0|5}
export interface HomeWorkbenchStudySpec {
 version:1;type:'research-study';role:HomeWorkbenchStudyRole;title:string
 security:HomeWorkbenchStudySecurity|null;reportKind:HomeWorkbenchStudyReportKind
 scenarios:Record<HomeWorkbenchStudySecurity,HomeWorkbenchStudyScenario>
 performancePeriods:Record<HomeWorkbenchStudySecurity,'quarter'|'annual'>
 linkedSourceId?:string
}
export const HOME_WORKBENCH_STUDY_DATA:Readonly<Record<string,unknown>>
export const HOME_WORKBENCH_STUDY_EXPANSION:Readonly<Record<string,unknown>>
export const HOME_WORKBENCH_STUDY_COPY:Readonly<Record<string,unknown>>
export function parseHomeWorkbenchStudySpec(value:unknown):HomeWorkbenchStudySpec|null
export function homeWorkbenchStudyTitle(role:HomeWorkbenchStudyRole,security:HomeWorkbenchStudySecurity|null,reportKind?:HomeWorkbenchStudyReportKind):string
export function homeWorkbenchStudySpec(role:HomeWorkbenchStudyRole,security?:string|null,options?:Partial<Omit<HomeWorkbenchStudySpec,'version'|'type'|'role'|'security'>>):HomeWorkbenchStudySpec|null
export function homeWorkbenchStudyCanLink(source:unknown,target:unknown):boolean
export function homeWorkbenchStudyHasOutput(spec:unknown):boolean
export function synchronizeHomeWorkbenchStudies<T extends {id:string;title?:string;containerSpec?:unknown}>(artifacts:T[],changedNodeId?:string):T[]
export function homeWorkbenchStudyModel(spec:HomeWorkbenchStudySpec):{available:boolean;snapshot:string;[key:string]:any}
export function homeWorkbenchStudyNews():Array<{date:string;company:string;tag:string;title:string;source:string;url:string}>
