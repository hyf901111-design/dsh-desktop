export const MAX_RESEARCH_HTML_BYTES: number
export const RESEARCH_HTML_LIMIT_ERROR: string
export type ResearchHtmlArtifact = Readonly<{ version: 1; type: 'html'; title: string; html: string }>
export function parseResearchHtmlArtifact(value: unknown): ResearchHtmlArtifact | null
export function researchHtmlText(html: unknown): string
export function buildResearchHtmlPreview(html: string, title?: string, initialTheme?: 'light' | 'dark'): string

export const RESEARCH_COMPONENT_PALETTES: Readonly<Record<'light' | 'dark', Readonly<Record<string, string>>>>
export const RESEARCH_COMPONENT_THEME_CSS: string
export function researchComponentTypographyCss(scope: string): string
