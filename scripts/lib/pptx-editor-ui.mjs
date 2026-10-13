/** Self-contained factory embedded in the pinned Office client bundle. */
export function createPptxEditorComponent(React, Preview, download) {
 const h=React.createElement, drafts=new Map()
 const fields=entry=>entry.document.slides.flatMap(slide=>slide.fields)
 const dirty=entry=>fields(entry).some(field=>entry.values[field.id]!==field.text)
 const emit=entry=>entry.listeners.forEach(listener=>listener())
 const persist=entry=>{
  try{
   const key='sherlock:pptx-draft:'+entry.document.id
   if(dirty(entry))window.sessionStorage.setItem(key,JSON.stringify({document:entry.document,values:entry.values}))
   else window.sessionStorage.removeItem(key)
  }catch{entry.error='无法保留本地编辑稿，请保存文件后再关闭。'}
 }
 return function PptxView(props) {
  const {scope,path,title,toolbar,onToolbarState,onToolbarControls}=props
  const root=React.useRef(null),entryRef=React.useRef(null),generation=React.useRef(0),opening=React.useRef(null),editTokenRef=React.useRef(null),viewerRef=React.useRef(null),pageRef=React.useRef(0)
  const [mode,setMode]=React.useState('preview'),[entry,setEntry]=React.useState(null),[page,setPage]=React.useState(0),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),[revision,setRevision]=React.useState(0),[,tick]=React.useState(0)
  pageRef.current=page
  const attachViewer=React.useCallback(next=>{viewerRef.current=next;if(next&&pageRef.current>0)void next.goToSlide?.(pageRef.current,{behavior:'auto',block:'nearest'})},[])
  React.useEffect(()=>{void viewerRef.current?.goToSlide?.(page,{behavior:'auto',block:'nearest'})},[page])
  const bridge=window.sherlockPptEditor,available=typeof bridge?.open==='function'&&typeof bridge?.save==='function'
  const source=String(path).startsWith('sherlock-preview:')?{sourceUrl:path}:{sessionId:scope.sessionId,path}
  const sourceKey=JSON.stringify(source)
  const open=async()=>{
   if(entryRef.current)return entryRef.current
   if(opening.current)return opening.current
   const expected=generation.current
   setLoading(true);setError('')
   const operation=(async()=>{
    try{
     if(!available)throw Error('PPTX 编辑服务不可用，请重新打开应用。')
     const result=await bridge.open({...source,...(editTokenRef.current?{editToken:editTokenRef.current}:{})})
     if(expected!==generation.current)return null
     if(!result.ok)throw Error(result.error)
     let current=drafts.get(result.document.id)
     if(!current){
      let restored
      try{restored=JSON.parse(window.sessionStorage.getItem('sherlock:pptx-draft:'+result.document.id)||'null')}catch{}
      if(restored?.document?.id!==result.document.id||!restored.values)restored=null
      current={document:restored?.document||result.document,values:restored?.values||Object.fromEntries(result.document.slides.flatMap(s=>s.fields.map(f=>[f.id,f.text]))),saving:false,status:'idle',error:'',listeners:new Set()}
      drafts.set(result.document.id,current)
     }
     if(current.document.version!==result.document.version){
      if(dirty(current))current.error='原 PPTX 已变化，当前编辑稿已保留。请核对内容后重新读取文件。'
      else{current.document=result.document;current.values=Object.fromEntries(fields(current).map(f=>[f.id,f.text]));current.error=''}
     }
     if(result.document.editToken)current.document.editToken=result.document.editToken
     editTokenRef.current=current.document.editToken||null
     entryRef.current=current;setEntry(current);return current
    }catch(failure){if(expected===generation.current)setError(failure.message||'无法读取 PPTX 内容。');return null}
    finally{if(expected===generation.current){setLoading(false);opening.current=null}}
   })()
   opening.current=operation;return operation
  }
  const changeMode=next=>{setMode(next);if(next==='edit')void open()}
  const save=async()=>{
   const current=entryRef.current
   if(!current||current.saving||!dirty(current))return
   const values={...current.values},edits=fields(current).filter(f=>values[f.id]!==f.text).map(f=>({id:f.id,text:values[f.id]}))
   current.saving=true;current.status='saving';current.error='';emit(current)
   try{
    const result=await bridge.save({...(current.document.editToken?{editToken:current.document.editToken}:source),version:current.document.version,edits})
    if(!result.ok)throw Error(result.error)
    current.document=result.document;current.status='saved';persist(current)
    document.dispatchEvent(new CustomEvent('sherlock:pptx-saved',{detail:{id:current.document.id}}))
   }catch(failure){current.status='failed';current.error=failure.message||'保存失败，编辑稿已保留。'}
   finally{current.saving=false;emit(current)}
  }
  React.useEffect(()=>{
   generation.current++;entryRef.current=null;opening.current=null;editTokenRef.current=null;setEntry(null);setMode('preview');setPage(0);setError('')
   return()=>{generation.current++;entryRef.current=null}
  },[sourceKey])
  React.useEffect(()=>{
   if(!entry)return
   const listener=()=>tick(value=>value+1)
   entry.listeners.add(listener)
   const saved=event=>{if(event.detail?.id===entry.document.id)setRevision(value=>value+1)}
   const leave=event=>{if(dirty(entry)){event.preventDefault();event.returnValue=''}}
   document.addEventListener('sherlock:pptx-saved',saved);window.addEventListener('beforeunload',leave)
   return()=>{entry.listeners.delete(listener);document.removeEventListener('sherlock:pptx-saved',saved);window.removeEventListener('beforeunload',leave)}
  },[entry])
  React.useEffect(()=>{
   if(toolbar==='host')onToolbarState?.({modes:available,mode,dirty:!!entry&&dirty(entry),editable:!!entry,saveState:entry?.status||'idle',downloadUrl:download?download(scope,path):String(path).startsWith('sherlock-preview:')?path:undefined})
   onToolbarControls?.({setMode:changeMode,save})
  })
  const reload=async()=>{
   if(entryRef.current?.saving)return
   if(entryRef.current&&dirty(entryRef.current)&&!window.confirm('重新读取会放弃当前编辑稿，是否继续？'))return
   if(entryRef.current){drafts.delete(entryRef.current.document.id);try{window.sessionStorage.removeItem('sherlock:pptx-draft:'+entryRef.current.document.id)}catch{}}
   entryRef.current=null;setEntry(null);setPage(0);await open();setRevision(value=>value+1)
  }
  const selected=entry?.document.slides[Math.min(page,entry.document.slides.length-1)]
  const message=error||entry?.error
  const button=(text,action,disabled=false)=>h('button',{type:'button',onClick:action,disabled},text)
  const controls=toolbar==='host'&&onToolbarControls?null:h('div',{className:'sherlock-ppt-controls'},button('预览',()=>changeMode('preview')),button('编辑内容',()=>changeMode('edit'),!available),entry&&button(entry.saving?'保存中…':'保存',save,entry.saving||!dirty(entry)),h('span',{'aria-live':'polite'},entry&&dirty(entry)?'未保存':entry?.status==='saved'?'已保存':''))
  return h('div',{ref:root,className:'sherlock-ppt-editor','data-ppt-editor':'',onKeyDownCapture:event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&entryRef.current){event.preventDefault();event.stopPropagation();void save()}}},
   h('style',null,`.sherlock-ppt-editor{--sherlock-ppt-ink:#2b2b2b;--sherlock-ppt-border:#dedede;--sherlock-ppt-control:#f2f2f2;--sherlock-ppt-input:#fafafa;height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;container-type:inline-size;color:var(--sherlock-ppt-ink)}[data-ds-dark-theme] .sherlock-ppt-editor{--sherlock-ppt-ink:#e5e5e5;--sherlock-ppt-border:#414141;--sherlock-ppt-control:#343434;--sherlock-ppt-input:#292929}.sherlock-ppt-controls{display:flex;align-items:center;gap:6px;padding:6px 10px;flex-wrap:wrap;border-bottom:1px solid var(--sherlock-ppt-border);flex-shrink:0}.sherlock-ppt-editor button,.sherlock-ppt-editor select{font:inherit;font-size:12px;color:inherit;background:var(--sherlock-ppt-control);border:1px solid var(--sherlock-ppt-border);border-radius:5px;padding:4px 8px}.sherlock-ppt-editor button{cursor:pointer}.sherlock-ppt-editor button:disabled{opacity:.5;cursor:default}.sherlock-ppt-editor button:focus-visible,.sherlock-ppt-editor select:focus-visible,.sherlock-ppt-editor textarea:focus-visible{outline:2px solid #6c8cff;outline-offset:1px}.sherlock-ppt-workspace{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}.sherlock-ppt-preview{flex:1;min-height:0;min-width:0;overflow:hidden}.sherlock-ppt-workspace.editing .sherlock-ppt-preview{flex:0 0 42%}.sherlock-ppt-fields{flex:1;min-height:0;min-width:0;overflow:auto;padding:12px;box-sizing:border-box;border-top:1px solid var(--sherlock-ppt-border)}.sherlock-ppt-fields header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;font-size:12px}.sherlock-ppt-fields label{display:block;margin:0 0 12px}.sherlock-ppt-fields label span{display:block;font-size:11px;opacity:.7;margin-bottom:5px;overflow-wrap:anywhere}.sherlock-ppt-fields textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;min-height:38px;max-height:360px;background:var(--sherlock-ppt-input);color:inherit;border:1px solid var(--sherlock-ppt-border);border-radius:6px;padding:8px;font:inherit;font-size:13px;line-height:1.6}.sherlock-ppt-error{font-size:12px;color:#d16a56;padding:8px 12px;flex-shrink:0;overflow-wrap:anywhere}.sherlock-ppt-error button{margin-left:8px}@container(min-width:720px){.sherlock-ppt-workspace.editing{flex-direction:row}.sherlock-ppt-workspace.editing .sherlock-ppt-preview{flex:1}.sherlock-ppt-fields{flex:0 0 320px;border-top:0;border-left:1px solid var(--sherlock-ppt-border)}}`),controls,
   message&&h('div',{className:'sherlock-ppt-error',role:'alert'},message,button('重新读取文件',reload,!!entry?.saving)),
   h('div',{className:'sherlock-ppt-workspace'+(mode==='edit'?' editing':'')},h('div',{className:'sherlock-ppt-preview'},h(Preview,{...props,path:entry?.document.previewUrl||props.path,key:sourceKey+':'+revision,onToolbarState:undefined,onToolbarControls:undefined,onPptxViewer:attachViewer,toolbar:'host'})),
    mode==='edit'&&h('section',{className:'sherlock-ppt-fields','aria-label':'PPT 内容编辑'},
     loading?h('div',null,'正在读取幻灯片内容…'):entry&&h(React.Fragment,null,
      h('header',null,h('select',{'aria-label':'选择幻灯片',value:String(Math.min(page,entry.document.slides.length-1)),onChange:event=>setPage(Number(event.target.value))},entry.document.slides.map((slide,i)=>h('option',{key:i,value:String(i)},'第 '+(i+1)+' 页'))),h('span',null,'编辑文字与表格内容')),
      selected?.fields.length?selected.fields.map(field=>h('label',{key:field.id},h('span',null,field.label),h('textarea',{'aria-label':field.label,value:entry.values[field.id],rows:Math.max(1,Math.min(8,Math.ceil(String(entry.values[field.id]).length/35)+String(entry.values[field.id]).split('\n').length-1)),onInput:event=>{entry.values[field.id]=event.currentTarget.value;entry.status='idle';persist(entry);emit(entry)}}))):h('div',null,'此页没有可编辑的文字或表格。')))))
 }
}
const marker='/* sherlock:pptx-content-editor:v1 */'
const endMarker='/* sherlock:pptx-content-editor:end */\n'
const viewerAttach='viewerRef.current = viewer;'
const attached=viewerAttach+' props.onPptxViewer?.(viewer);'
const viewerDetach='viewerRef.current = null;'
const detached='props.onPptxViewer?.(null); '+viewerDetach
export function stripPptxEditorPatch(source) {
 const start=source.indexOf(marker)
 if(start<0)return source
 const end=source.indexOf(endMarker,start)
 if(end<0)throw Error('PPT content editor patch end missing')
 return (source.slice(0,start)+source.slice(end+endMarker.length)).replace('function PptxPreview(props) {','function PptxView(props) {').replace(attached,viewerAttach).split(detached).join(viewerDetach)
}
export function patchPptxEditor(source) {
 if(source.includes(marker))return source
 const anchor='function PptxView(props) {'
 if(source.split(anchor).length!==2)throw Error('PPT content editor anchor drifted')
 if(source.split(viewerAttach).length!==2||source.split(viewerDetach).length!==3)throw Error('PPT viewer callback anchors drifted')
 return source.replace(viewerAttach,attached).split(viewerDetach).join(detached).replace(anchor,marker+'\n'+createPptxEditorComponent.toString()+'\nconst PptxView = createPptxEditorComponent(react$1, PptxPreview, downloadUrl);\n'+endMarker+'function PptxPreview(props) {')
}
