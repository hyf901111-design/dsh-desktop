export const sidebarVisitsKey: string
export function readSidebarViewMode(win: Window, key: string): 'directory' | 'recent'
export function writeSidebarViewMode(win: Window, key: string, mode: 'directory' | 'recent'): void
export function parseSidebarVisits(raw: unknown): [string, number][] | null
