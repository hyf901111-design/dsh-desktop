// These helpers are injected into the native conversation bundle. Keep the
// codec self-contained: its offsets belong to the native draft, not the DOM.
export function spreadsheetRangeCodec(){
 const parse=raw=>{
  const value=JSON.parse(raw)
  if(typeof value.sheetName!=='string'||value.sheetName.length>31||!value.sheetName.trim()||/[\u0000-\u001f]/.test(value.sheetName)||
    !/^[A-Z]{1,3}[1-9]\d{0,5}(?::[A-Z]{1,3}[1-9]\d{0,5})?$/.test(value.range)||!(/^[a-f0-9]{12}$/).test(value.id))throw Error('表格选区引用无效。')
  return value
 }
 return {trigger:'@',name:'spreadsheet-range',order:10005,candidates:async()=>[],onPick:()=>undefined,codec:{
  clipboardText:raw=>{try{const r=parse(raw);return r.sheetName+'!'+r.range}catch{return ''}},
  serialize:async raw=>{const r=parse(raw);return '〔表格选区 '+JSON.stringify(r.sheetName)+'!'+r.range+' #'+r.id+'〕'}
 }}
}

export function collectSpreadsheetReferences(state){
 return state.occurrences.filter(o=>o.source==='spreadsheet-range'&&state.draft[o.offset]==='\uFFFC')
  .sort((a,b)=>a.offset-b.offset).map(o=>JSON.parse(o.ref))
}

export function installSpreadsheetReferences({win,doc,sessions,getInput}){
 const selector='[data-research-composer-host] textarea[data-odyssey-file-reference-session]'
 const pendingCarets=new WeakMap()
 const onRange=event=>{
  const d=event.detail
  if(!d||sessions.list.getSnapshot().current!==d.sessionId||doc.body.dataset.eworkSpreadsheetSession!==d.sessionId)return
  const input=[...doc.querySelectorAll(selector)].find(el=>el.dataset.odysseyFileReferenceSession===d.sessionId&&
   !el.disabled&&!el.readOnly&&el.getClientRects().length&&!el.closest('[hidden],[aria-hidden="true"],[data-odyssey-subagent-panel]'))
  const shell=getInput(d.sessionId),before=shell?.snapshot
  if(!input||!before||shell.disposed||before.phase!=='plain'||before.researchContextPreparing)return
  const ranges=before.occurrences.filter(o=>o.source==='spreadsheet-range')
  if(ranges.length>=24){shell.notify('error','一条消息最多引用 24 个表格选区。');return}
  if(!d.explicit&&ranges.some(o=>{try{const r=JSON.parse(o.ref);return r.bookId===d.bookId&&r.sheetId===d.sheetId&&r.range===d.range}catch{return false}}))return
  const pending=pendingCarets.get(input)
  const offset=pending?.revision===before.draftRev?pending.offset:
   input.value.length===before.draft.length?Math.min(input.selectionEnd,before.draft.length):before.draft.length
  const {sessionId,bookId,sheetId,sheetName,range}=d
  const id=win.crypto.randomUUID().replaceAll('-','').slice(0,12)
  const ref=JSON.stringify({sessionId,bookId,sheetId,sheetName,range,id}),label=sheetName+'!'+range
  if(!shell.insertReference({source:'spreadsheet-range',ref,label,clipboardText:label},{start:offset,end:offset,draftRev:before.draftRev}))return
  const revision=shell.snapshot.draftRev,caret=offset+shell.snapshot.draft.length-before.draft.length
  pendingCarets.set(input,{revision,offset:caret})
  win.requestAnimationFrame(()=>{
   if(!input.isConnected||shell.snapshot.draftRev!==revision)return
   if(input.value.length===shell.snapshot.draft.length)input.setSelectionRange(caret,caret)
   pendingCarets.delete(input)
  })
 }
 win.addEventListener('sherlock:spreadsheet-range',onRange)
 return()=>win.removeEventListener('sherlock:spreadsheet-range',onRange)
}

export function spreadsheetMessageParts(text){
 const pattern=/〔表格选区 ("(?:[^"\\\n]|\\.)*")!([A-Z]{1,3}[1-9]\d{0,5}(?::[A-Z]{1,3}[1-9]\d{0,5})?) #[a-f0-9]{12}〕/g
 if(typeof text!=='string')return null
 const parts=[];let cursor=0
 for(const match of text.matchAll(pattern)){
  let sheet
  try{sheet=JSON.parse(match[1])}catch{continue}
  if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)})
  parts.push({label:sheet+'!'+match[2]});cursor=match.index+match[0].length
 }
 if(!parts.length)return null
 if(cursor<text.length)parts.push({text:text.slice(cursor)})
 return parts
}
