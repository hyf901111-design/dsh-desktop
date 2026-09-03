export const MAX_RESEARCH_HTML_BYTES: number
export const RESEARCH_HTML_LIMIT_ERROR: string
export type ResearchHtmlArtifact = Readonly<{ version: 1; type: 'html'; title: string; html: string }>
export function parseResearchHtmlArtifact(value: unknown): ResearchHtmlArtifact | null
export function researchHtmlText(html: unknown): string
export function buildResearchHtmlPreview(html: string, title?: string): string
