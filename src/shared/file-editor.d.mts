export type FileEditorMode = 'notes' | 'spreadsheet'
export function fileEditorMode(name: string): FileEditorMode | undefined
export function fileEditorLabel(mode: FileEditorMode, english?: boolean): string
export type FileEditorSource = { id: string; sessionId?: string } | { path: string; sessionId: string }
