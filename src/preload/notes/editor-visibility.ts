/** Cached editors share one surface; only the selected wrapper owns UI actions. */
export function noteEditorVisible(element:HTMLElement|null|undefined):boolean{
 if(!element||element.closest('[hidden],[inert],[data-note-editor-active="false"]'))return false
 const wrapper=element.closest<HTMLElement>('[data-note-editor-session]'),selected=document.querySelector<HTMLElement>('[data-ework-notes-session]')?.dataset.eworkNotesSession
 if(wrapper&&selected&&wrapper.dataset.noteEditorSession!==selected)return false
 const surface=element.closest<HTMLElement>('.en-root')
 return !surface||surface.style.display!=='none'
}
