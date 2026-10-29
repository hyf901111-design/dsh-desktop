export const CARTESIAN_CHART_TEMPLATES:readonly Record<string,any>[]
export const CHART_TEMPLATES:readonly Record<string,any>[]
export const CHART_VARIANTS:readonly string[]
export function normalizeChartMetadata(value:any):any
export function requestedChartVariant(text?:string):string|undefined
export function chartTemplateSchema(variant?:string):string
export function requireSimulatedChartData(panel:any):void
export function chartDataIssue(value:unknown):string|null
