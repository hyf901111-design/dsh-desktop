// Applied after the Notes destination so the same resident reply action follows
// the active session and switches back immediately when leaving the presentation.
export function addPresentationReplyDestination(original) {
  const notes = 'const notes=noteSession===sessionId;'
  const startClick = 'onClick: () => {if(!notes)'
  const label = original.includes('(notes?workbenchText("添加到笔记"):workbenchText("添加到画布"))')
    ? '(notes?workbenchText("添加到笔记"):workbenchText("添加到画布"))'
    : 'workbenchText(notes?"添加到笔记":"添加到画布")'
  if (!original.includes(notes) || !original.includes(startClick) || original.split(label).length !== 3)
    throw Error('Presentation reply destination anchor drifted')
  return original
    .replace(notes, notes + `
const presentation=(0,react.useSyncExternalStore)(subscribePresentationReplyTarget,()=>document.body.dataset.eworkPresentationSession===sessionId?(document.body.dataset.eworkPresentationReply||'empty'):'');
const submitting=react.useRef(false),[busy,setBusy]=react.useState(false);
const english=document.documentElement.dataset.odysseyLocale==='en';`)
    .replace('if (!active&&!notes)', 'if (!active&&!notes&&!presentation)')
    .replaceAll(label, "(presentation?(english?'Add to presentation':'添加至演示文稿'):" + label + ')')
    .replace(startClick, `disabled:!!presentation && (presentation!=='editable'||busy||!text?.trim()),
onClick: () => {if(presentation){
  if(presentation!=='editable'||submitting.current)return;
  submitting.current=true;setBusy(true);setFailure('');
  Promise.resolve().then(()=>window.dshDesktop.presentationInsertReply(sessionId,text))
    .catch(error=>setFailure(error.message))
    .finally(()=>{submitting.current=false;setBusy(false)});
  return;
}if(!notes)`)
}
