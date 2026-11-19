export function installSidebarNewNote(deps:{
  sessions:any
  workspaces:any
  chatStore:any
  inputHub:any
  getInput:(id:string)=>any
  getPending:()=>{getSnapshot:()=>{workspaceId:string|null|undefined}}|undefined
  standaloneDirectory:()=>Promise<string>
}):()=>void
export function patchSidebarNewNoteConversation(source:string):string
export function patchSidebarNewNoteShell(source:string):string
export function stripSidebarNewNoteConversation(source:string):string
export function stripSidebarNewNoteShell(source:string):string
