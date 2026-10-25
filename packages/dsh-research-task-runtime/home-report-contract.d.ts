export const HOME_REPORT_PATH:'/sherlock/home-guide/report'
export const HOME_REPORT_EVENT:'home-guide/report'
export const HOME_REPORT_SKILL_ID:'builtin:ework-equity-research'
export const HOME_REPORT_SKILL_ALIAS:'ework-equity-research'
export const HOME_REPORT_HTML_FILE:'公司研究报告.html'
export const HOME_REPORT_PDF_FILE:'公司研究报告.pdf'
export const HOME_REPORT_AUDIT_FILES:readonly ['evidence.json','calculations.json','validation.json','run.json']
export type HomeReportAuditFile=typeof HOME_REPORT_AUDIT_FILES[number]
export const HOME_REPORT_ORIGIN_SESSION_ID:'session-253912dd-cf7d-4669-9da7-361d4bf24166'
export type HomeReportMetadataBase={
 reportTitle:string;companyName:string;companyCode:string;researchAsOf:string;reportPages:number
 htmlFile:'research-report.html';pdfFile:'research-report.pdf';htmlSha256:string;pdfSha256:string;localPresetOnly:true
 chapters:Array<{id:string;title:string}>;sources:Array<{id:string;title:string;url:string;asOf:string}>
 chartCatalog:Array<{id:string;title:string;sourceIds:string[];asOf:string}>;keyFindings:string[]
 provenance:{product:'EWork Odyssey';sessionId:string;model:string;generatedAt:string;attempts?:Array<{sessionId:string;status:'failed-before-model'|'generated';reason?:string}>}
}
export type HomeReportMetadata=HomeReportMetadataBase&(
 {schemaVersion:1;deliveryNames?:never;audit?:never}|
 {schemaVersion:2;deliveryNames:{html:string;pdf:string};audit:Record<HomeReportAuditFile,string>}
)
export type HomeReportPrepared={ready:true;brief:string;htmlPath:string;pdfPath:string;deliveryPaths:{html:string;pdf:string};reportTitle:string;researchAsOf:string;chapters:Array<{id:string;title:string}>}
export function createHomeReportBrief(metadata:Pick<HomeReportMetadata,'companyName'>):string
