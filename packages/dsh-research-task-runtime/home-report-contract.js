/** Shared by the native actor and the isolated, packaged report replay. */
export const HOME_REPORT_PATH='/sherlock/home-guide/report'
export const HOME_REPORT_EVENT='home-guide/report'
export const HOME_REPORT_SKILL_ID='builtin:ework-equity-research'
export const HOME_REPORT_SKILL_ALIAS='ework-equity-research'
export const HOME_REPORT_HTML_FILE='公司研究报告.html'
export const HOME_REPORT_PDF_FILE='公司研究报告.pdf'
export const HOME_REPORT_ORIGIN_SESSION_ID='session-253912dd-cf7d-4669-9da7-361d4bf24166'
export function createHomeReportBrief(metadata){return `帮我写一份${metadata.companyName}的专业投资研究报告，讲清投资逻辑，并配上关键数据与图表，交付HTML和PDF。`}
