import type {MemorySource} from '../../shared/memory'
/** Only a stable source location plus its original excerpt can establish success. */
export async function waitForMemorySource(document:Document,source:MemorySource,current:()=>string|undefined,{attempts=25,intervalMs=100,onReady}: {attempts?:number;intervalMs?:number;onReady?:()=>void}={}) {
  let activated=false
  for(let i=0;i<attempts;i++){
    if(current()===source.sessionId){
      if(!activated){onReady?.();activated=true}
      let target:HTMLElement|undefined
      if(source.kind==='note'&&source.noteId&&Number.isSafeInteger(source.noteRevision)){
        const root=[...document.querySelectorAll<HTMLElement>('[data-note-source-session]')].find(n=>n.dataset.noteSourceSession===source.sessionId&&Number(n.dataset.noteSourceRevision)===source.noteRevision)
        target=root?[...root.querySelectorAll<HTMLElement>('[data-id]')].find(n=>n.dataset.id===source.noteId):undefined
      }else if(source.kind==='conversation'){
        if(source.messageId)target=[...document.querySelectorAll<HTMLElement>('[data-message-id]')].find(n=>n.dataset.messageId===source.messageId&&!n.closest('[hidden],[inert],[aria-hidden="true"]'))
        if(!target&&Number.isSafeInteger(source.seq))target=[...document.querySelectorAll<HTMLElement>('[data-event-seq]')].find(n=>Number(n.dataset.eventSeq)===source.seq&&!n.closest('[hidden],[inert],[aria-hidden="true"]'))
      }
      if(target&&source.excerpt&&target.textContent?.includes(source.excerpt))return target
    }
    if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,intervalMs))
  }
  return null
}
