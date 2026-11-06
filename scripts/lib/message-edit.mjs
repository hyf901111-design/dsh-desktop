/** A revision forks a closed-turn prefix; durable source history is never rewritten. */
export function messageEditCut(events, seq) {
 if(!Number.isSafeInteger(seq)||seq<0)throw Error('消息位置无效。')
 const at=events.findIndex(e=>e.seq===seq),target=events[at]
 if(target?.type!=='user/message'||target.data?.source?.kind!=='user')throw Error('此消息不能编辑。')
 if(events.findLast(e=>e.type==='turn/start'||e.type==='turn/end')?.type==='turn/start')throw Error('当前仍有任务正在处理，请稍后编辑。')
 const start=events.slice(0,at).findLast(e=>e.type==='turn/start')
 if(!start||!events.slice(at+1).some(e=>e.type==='turn/end'))throw Error('此消息所在的回复尚未结束。')
 if(events.some(e=>e.seq>start.seq&&e.seq<seq&&e.type==='user/message'&&e.data?.source?.kind==='user'))throw Error('请从本轮最初的消息编辑，以保留追加指令的上下文。')
 return start.seq
}

export async function editedPromptContent(content, text, readImage) {
 if(typeof text!=='string'||!text.trim())throw Error('请输入消息内容。')
 const result=[];let inserted=false
 for(const part of content){
  if(part.type==='text'){if(!inserted){result.push({type:'text',text});inserted=true}}
  else if(part.type==='image'&&part.attachment)result.push({type:'image',...await readImage(part.attachment)})
  else throw Error('此消息包含暂不支持编辑的内容，原消息已保留。')
 }
 if(!inserted)result.push({type:'text',text})
 return result
}

export async function sendMessageRevision(api, request) {
 const {seq,content,text}=request
 const idle=()=>{if(api.isBusy())throw Error('当前仍有任务正在处理，请稍后编辑。')}
 idle()
 const prompt=await editedPromptContent(content,text,api.readImage)
 idle()
 if(request.submitted)throw Error('发送结果未确认，请先查看新分支，避免重复发送。')
 const child=request.child||await api.fork(seq);request.child=child
 // A transport failure is not a rejected send: open the child and never silently replay.
 let result
 try{request.submitted=true;result=await api.prompt(child,prompt)}catch{api.open(child);throw Error('发送结果未确认，已打开新分支，请先查看实际状态。')}
 if(!result.ok&&result.error?.code==='internal'){api.open(child);throw Error('发送结果未确认，已打开新分支，请先查看实际状态。')}
 if(!result.ok)request.submitted=false
 if(!result.ok)throw Error(result.error?.message||'发送失败，原消息已保留。')
 api.open(child)
 return child
}

function EWorkEditableUserMessage(props) {
 const {node,loadImage,openFile,t,useSession,editMessage,editBusy}=props,data=node.data
 const running=useSession(s=>s.running||s.queue?.length>0||!!s.subagent)
 const busy=running||editBusy
 const [editing,setEditing]=react.useState(false),[draft,setDraft]=react.useState(''),[sending,setSending]=react.useState(false),[error,setError]=react.useState('')
 const submitting=react.useRef(false),revision=react.useRef(null),input=react.useRef(null)
 const raw=contentParts(data.content).text,research=parseResearchPrompt(raw)
 const canEdit=!!editMessage&&!busy&&node.kind==='user'&&data.source?.kind==='user'&&data.content.every(p=>p.type==='text'||p.type==='image')
 react.useLayoutEffect(()=>{if(editing&&input.current){input.current.focus();input.current.setSelectionRange(input.current.value.length,input.current.value.length)}},[editing])
 react.useLayoutEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(320,Math.max(52,el.scrollHeight))+'px'}},[editing,draft])
 const begin=()=>{if(!canEdit)return;revision.current=null;setDraft(research.text);setError('');setEditing(true)}
 const cancel=()=>{if(submitting.current)return;setEditing(false);setError('')}
 const send=async()=>{
  if(submitting.current||busy||!draft.trim())return
  submitting.current=true;setSending(true);setError('')
  try{
   const text=raw.startsWith('␞SHERLOCK_RESEARCH_FILES_V1 ')?serializeResearchPrompt(research.files,draft,[],research.artifacts||[],[],research.canvasContext):draft
   revision.current={...revision.current,seq:data.seq,content:data.content,text};await editMessage(revision.current);setEditing(false)
  }catch(e){setError(e.message||'发送失败，请重试。')}
  finally{submitting.current=false;setSending(false)}
 }
 const h=react.createElement
 const pencil=h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true},h('path',{d:'m16 3 5 5-12 12-6 1 1-6L16 3Zm-11 12 5 5M14 5l5 5'}))
 const images=contentParts(data.content).images
 return h('div',{'data-ework-user-message':'','data-editing':editing||undefined},editing?
  h('div',{'data-ework-message-editor':''},images.length>0&&h(_deepseek_ai_dsh_client_ui_attachment.ImageGallery,{images,load:loadImage,align:'end',labels:messageImageLabels(t)}),
   h('div',{'data-edit-bubble':''},h('textarea',{ref:input,value:draft,'aria-label':'编辑消息',disabled:sending,onChange:e=>setDraft(e.target.value),onKeyDown:e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.preventDefault();cancel()}else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void send()}}}),
    h('div',{'data-edit-footer':''},h('small',null,busy?'当前任务完成后可发送':'发送后从此处重新生成，原对话保留'),h('button',{type:'button',disabled:sending,onClick:cancel},'取消'),h('button',{type:'button','data-edit-send':'',disabled:busy||sending||!draft.trim(),onClick:send},sending?'发送中…':'发送'))),error&&h('div',{role:'alert'},error)):
  h(UserStyleBubble,{eventSeq:data.seq,annotationIdentity:{sessionId:props.annotationSessionId,source:data.source},content:data.content,openFile,imageLoader:loadImage,t,
   actions:text=>h('div',{'data-ework-user-actions':''},Number.isFinite(data.time)&&h('time',{dateTime:new Date(data.time).toISOString(),title:new Date(data.time).toLocaleString()},formatMessageClock(data.time,t)),
    h(MessageIconActions,{text,className:MessageItem_module_css_default.actions,t,extraActions:canEdit&&h('button',{type:'button','aria-label':'编辑消息',title:'编辑消息',onClick:begin,className:MessageIconActions_module_css_default.action},pencil)}))}))
}

export const messageEditCss=`
[data-ework-user-message]{width:100%;min-width:0}
[data-ework-user-actions]{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:24px;margin:5px 6px 0 0;opacity:0;pointer-events:none;transition:opacity .12s ease}
[data-ework-user-message]:hover [data-ework-user-actions],[data-ework-user-message]:focus-within [data-ework-user-actions]{opacity:1;pointer-events:auto}
[data-ework-user-actions] time{font-size:12px;line-height:20px;color:var(--dsr-text-2,#888)}
[data-ework-user-actions]>div{margin:0!important;gap:6px!important;display:flex!important}
[data-ework-user-actions] button{width:24px!important;height:24px!important;padding:4px!important}
[data-ework-message-editor]{width:100%;padding-top:4px}
[data-edit-bubble]{padding:12px 14px;border-radius:18px;background:var(--ework-edit-bubble,#eee);color:inherit}
body[data-ds-dark-theme] [data-edit-bubble],html[data-ds-dark-theme] [data-edit-bubble]{--ework-edit-bubble:#292929}
[data-edit-bubble] textarea{display:block;width:100%;min-height:52px;max-height:320px;box-sizing:border-box;background:transparent;color:inherit;border:0;outline:0;resize:none;font:inherit;line-height:1.55;padding:0}
[data-edit-footer]{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}
[data-edit-footer] small{font-size:12px;color:#888;margin-right:auto}
[data-edit-footer] button{border:1px solid #8883;border-radius:9px;background:transparent;color:inherit;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}
[data-edit-footer] [data-edit-send]{background:#171717;color:#fff}
body[data-ds-dark-theme] [data-edit-send],html[data-ds-dark-theme] [data-edit-send]{background:#fff;color:#171717}
[data-edit-footer] button:disabled{opacity:.45;cursor:default}
[data-ework-message-editor] [role=alert]{font-size:13px;color:#d55;margin-top:8px}
@media(hover:none){[data-ework-user-actions]{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){[data-ework-user-actions]{transition:none}}
`
const marker='/* ework:message-edit:restore '
function once(source,before,after){if(source.split(before).length!==2)throw Error('Message edit anchor drift: '+before.slice(0,90));return source.replace(before,after)}
export function stripMessageEditClient(source){
 const at=source.indexOf(marker);if(at<0)return source
 const end=source.indexOf(' */',at),swaps=JSON.parse(source.slice(at+marker.length,end))
 source=source.slice(0,at)+source.slice(end+3)
 for(const [before,after]of swaps.reverse())source=once(source,after,before)
 return source
}
export function patchMessageEditClient(source){
 source=stripMessageEditClient(source);const swaps=[]
 const swap=(a,b)=>{source=once(source,a,b);swaps.push([a,b])}
 const start=source.indexOf('const UserMessageNodeView = (0, react.memo)(function UserMessageNodeView('),end=source.indexOf('\n\t\t/** Injected-context',start)
 if(start<0||end<0)throw Error('User renderer missing')
 const helpers=[editedPromptContent,sendMessageRevision,EWorkEditableUserMessage].map(f=>f.toString()).join('\n')
 swap(source.slice(start,end),helpers+`\nconst UserMessageNodeView=react.memo(EWorkEditableUserMessage);\nif(!document.getElementById('ework-message-edit-style')){const style=document.createElement('style');style.id='ework-message-edit-style';style.textContent=${JSON.stringify(messageEditCss)};document.head.append(style);}`)
 swap('chatScroll, forkAt, fileMentions, t }) {','chatScroll, forkAt, editMessage, fileMentions, t }) {')
 swap('const routedOwner = {\n\t\t\t\tannotationSessionId:', 'const routedOwner = {\neditMessage:arguments[0].editMessage,editBusy:arguments[0].editBusy,\n\t\t\t\tannotationSessionId:')
 swap('const seatProps = (0, react.useMemo)(() => ({\n\t\t\t\tannotationSessionId:',`const editBusy=running||inbox.length>0||canvasTasks.some(task=>['pending','running','queued','preparing','generating'].includes(task.status||task.phase))||noteRows.some(row=>['preparing','generating'].includes(row.phase));\nconst seatProps = (0, react.useMemo)(() => ({\neditMessage,editBusy,\n\t\t\t\tannotationSessionId:`)
 swap('\n\t\t\t}), [\n\t\t\t\tsessionId,\n\t\t\t\tuseSession,','\n\t\t\t}), [\neditMessage,editBusy,\n\t\t\t\tsessionId,\n\t\t\t\tuseSession,')
 const anchor='forkAt: (seq) => {\n\t\t\t\t\t\t\tsessions.fork({'
 swap(anchor,`editMessage: request=>sendMessageRevision({
 isBusy:()=>{const state=sessions.binding(sessionId)?.session.getSnapshot();return !state||state.running||state.queue?.length>0},
 readImage:async attachment=>{const result=await sessions.binding(sessionId).session.readAttachment(attachment.attachmentId);if(!result.ok)throw Error(result.error.message);return {mediaType:result.value.attachment.mediaType,data:bytesToBase64(result.value.data)}},
 fork:beforeMessageSeq=>sessions.fork({sessionId,beforeMessageSeq}),
 prompt:(child,content)=>sessions.binding(child).session.prompt(content,'queue'),
 open:child=>sessions.open(child)
},request),\n${anchor}`)
 return source+marker+JSON.stringify(swaps).replaceAll('*/','*\\u002f')+' */'
}

export function patchMessageEditRuntime(source){
 const marker='/* ework:message-edit-runtime:v1 */';if(source.includes(marker))return source
 source=once(source,'...opts.atSeq === void 0 ? {} : { atSeq: opts.atSeq }','...opts.atSeq === void 0 ? {} : { atSeq: opts.atSeq },\n...opts.beforeMessageSeq === void 0 ? {} : { beforeMessageSeq: opts.beforeMessageSeq }')
 source=once(source,'...opts.atSeq === void 0 ? {} : { atSeq: Math.floor(opts.atSeq) }','...opts.atSeq === void 0 ? {} : { atSeq: Math.floor(opts.atSeq) },\n...opts.beforeMessageSeq === void 0 ? {} : { beforeMessageSeq: opts.beforeMessageSeq }')
 return marker+'\n'+source
}

export function patchMessageEditHost(source){
 const marker='/* ework:message-edit-host:v1 */';if(source.includes(marker))return source
 source=once(source,'const sessionForkRequestSchema = z$1.object({\n\tsessionId: sessionIdSchema,','const sessionForkRequestSchema = z$1.object({\n\tbeforeMessageSeq: z$1.number().int().nonnegative().optional(),\n\tsessionId: sessionIdSchema,')
 source=once(source,'const { sessionId, atSeq } = request.payload;','const { sessionId, atSeq, beforeMessageSeq } = request.payload;')
 source=once(source,'const noteBoundary=noteForkBoundary(events,atSeq);',`let editCut;\nif(beforeMessageSeq!==undefined){try{if(atSeq!==undefined)throw Error('编辑参数冲突。');const live=ctx.agents.get(sessionId);if(live?.status==='running'||live?.inbox.nextTurn.length||live?.inbox.nextStep.length)throw Error('当前仍有任务正在处理。');editCut=messageEditCut(events,beforeMessageSeq)}catch(error){return err(request,{code:'fork-unavailable',message:error.message,details:{sessionId}})}}\nconst noteBoundary=editCut===undefined?noteForkBoundary(events,atSeq):{seq:editCut-1};`)
 source=once(source,'const forkComposition = await composeAgent(resolveSessionPreset(source));',`const forkComposition = await composeAgent(resolveSessionPreset(source));\nif(editCut!==undefined){const live=ctx.agents.get(sessionId);if(live?.status==='running'||live?.inbox.nextTurn.length||live?.inbox.nextStep.length)return err(request,{code:'fork-unavailable',message:'当前仍有任务正在处理。',details:{sessionId}})}`)
 return marker+'\n'+messageEditCut.toString()+'\n'+source
}
