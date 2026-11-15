export type HomeGuideSessionKind='board'|'note'|'ppt'|'report'|'workbench'|'spreadsheet'
export function legacyHomeGuideSessionTitle(kind:HomeGuideSessionKind,replay?:boolean):string
export function homeGuideSessionTitle(kind:HomeGuideSessionKind,replay?:boolean):string
export function isHomeGuideSessionTitle(kind:unknown,title:unknown):boolean
