/** One ephemeral UI outcome for the native, successfully accepted command transaction. */
function rememberPlainSlashCaret(shell,claim){
 if(typeof document==='undefined'||typeof claim?.token!=='string'||!claim.token.startsWith('/'))return
 const input=document.activeElement
 if(input?.tagName!=='TEXTAREA')return
 const state=shell.snapshot
 plainSlashCaretTickets.set(shell,{input,draft:state.draft,revision:state.draftRev,token:claim.token,caret:claim.token.length,start:input.selectionStart,end:input.selectionEnd})
}
function usePlainSlashCaret(react,inputRef,keyboard,state,locked,busy,composingRef){
 react.useLayoutEffect(()=>{
  const ticket=keyboard&&plainSlashCaretTickets.get(keyboard),input=inputRef.current
  if(!ticket||input!==ticket.input)return
  plainSlashCaretTickets.delete(keyboard)
  const doc=input.ownerDocument,win=doc.defaultView,current=keyboard.snapshot
  if(keyboard.disposed||locked||busy||composingRef.current||!input.isConnected||input.disabled||input.readOnly||doc.activeElement!==input||input.closest('[hidden],[inert],[aria-hidden="true"]'))return
  if(current.draft!==ticket.draft||current.draftRev!==ticket.revision||input.value.slice(0,ticket.token.length)!==ticket.token||input.selectionStart!==ticket.start||input.selectionEnd!==ticket.end)return
  for(let parent=input;parent;parent=parent.parentElement){const style=win.getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return}
  input.setSelectionRange(ticket.caret,ticket.caret);keyboard.track(current.draft,ticket.caret)
 },[keyboard,state?.draftRev,locked,busy])
}
const start='/* sherlock:plain-slash-input:v1 */',end='/* sherlock:plain-slash-input:end */'
const definition=start+'\nconst plainSlashCaretTickets = new WeakMap();\n'+rememberPlainSlashCaret.toString()+'\n'+usePlainSlashCaret.toString()+'\n'+end+'\n'
const anchor='var SessionInputShell = class {'
const hooks=[
 ['return this.core.state.phase === "claimed" && this.core.state.draftRev !== before;','const accepted = this.core.state.phase === "claimed" && this.core.state.draftRev !== before;\n                if (accepted) rememberPlainSlashCaret(this,claim);\n                return accepted;'],
 ['track(draft, caret) {\n\t\t\t\tthis.deps.inputTriggers?.()?.track(draft, caret, { tier: guardOf(this.snapshot.phase) }, this.snapshot.draftRev);','track(draft, caret, inputType) {\n                const tier=guardOf(this.snapshot.phase),deleting=typeof inputType === "string" && /^delete(?:Content|Word|SoftLine|HardLine)/.test(inputType);\n\t\t\t\tthis.deps.inputTriggers?.()?.track(draft, caret, { tier: deleting && tier !== "frozen" ? "claimed" : tier }, this.snapshot.draftRev);'],
 ['keyboard.track(next, e.target.selectionStart ?? next.length);','keyboard.track(next, e.target.selectionStart ?? next.length, e.nativeEvent?.inputType);'],
 ['const machineBusy = input?.phase === "adjudicating" || input?.phase === "submitting" || input?.researchContextPreparing === true;','const machineBusy = input?.phase === "adjudicating" || input?.phase === "submitting" || input?.researchContextPreparing === true;\nusePlainSlashCaret(react,inputRef,keyboard,input,locked,machineBusy,composingRef);']
]
export function stripPlainSlashInput(source){
 if(!source.includes('sherlock:plain-slash-input:')){
  if(source.includes('rememberPlainSlashCaret(')||source.includes('usePlainSlashCaret('))throw Error('Plain slash input orphan drifted')
  return source
 }
 if(source.split(definition).length!==2||hooks.some(([,after])=>source.split(after).length!==2))throw Error('Plain slash input installation drifted')
 source=source.replace(definition,'')
 for(const[before,after]of hooks)source=source.replace(after,before)
 if(source.includes('sherlock:plain-slash-input:')||source.includes('rememberPlainSlashCaret(')||source.includes('usePlainSlashCaret('))throw Error('Plain slash input inverse drifted')
 return source
}
export function patchPlainSlashInput(source){
 source=stripPlainSlashInput(source)
 if(source.split(anchor).length!==2||hooks.some(([before])=>source.split(before).length!==2))throw Error('Plain slash input native anchors drifted')
 for(const[before,after]of hooks)source=source.replace(before,after)
 return source.replace(anchor,definition+anchor)
}
