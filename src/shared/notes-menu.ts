export type NoteMenuItem = { id: string; title: string; subtext: string; group: string; badge: string; icon: string }
export type NoteMenuState = {
  sessionId: string; menuId: string; revision: number; dark: boolean; selectedIndex: number | undefined;
  anchor: { x: number; y: number; width: number; height: number }; items: NoteMenuItem[]
}
export type NoteMenuEvent = { sessionId: string; owner: string; menuId: string; revision: number; action: 'select' | 'cancel'; itemId?: string }
export interface NotesNativeMenu {
  sync(input: NoteMenuState, owner: string): void
  close(menuId?: string): void
}
