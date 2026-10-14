export type NoteMenuItem = { id: string; title: string; subtext: string; group: string; badge: string; icon: string; children?: NoteMenuItem[] }
export type NoteMenuState = {
  sessionId: string; menuId: string; revision: number; dark: boolean; selectedIndex: number | undefined;
  anchor: { x: number; y: number; width: number; height: number }; items: NoteMenuItem[]
  submenu?: {parentId:string;selectedIndex:number;keyboardActive?:boolean}
}
export type NoteMenuEvent = { sessionId: string; owner: string; menuId: string; revision: number; action: 'select' | 'cancel' | 'open' | 'back'; itemId?: string; parentId?:string }
export interface NotesNativeMenu {
  sync(input: NoteMenuState, owner: string): void
  close(menuId?: string): void
}
