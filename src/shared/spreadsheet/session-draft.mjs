export function hasSavedSpreadsheetDraft(sessionId){
  try{
    const saved=JSON.parse(window.localStorage.getItem('dsh.conversation.chat.'+sessionId)??'null')
    const draft=saved?.workspaceDrafts?.spreadsheet
    return typeof draft==='string'&&draft.trim().length>0
  }catch{return false}
}
