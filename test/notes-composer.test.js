import {expect,it} from 'vitest'
import {runInNewContext} from 'node:vm'
import {readFile} from 'node:fs/promises'
import {notesComposerSource,patchNotesComposer} from '../scripts/lib/notes-composer.mjs'
import {patchDshFileDropClientSource} from '../src/main/state/dsh-file-drop-compat'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isFunctionDeclaration} from 'typescript'
function functionText(source,name){const tree=createSourceFile('client.js',source,ScriptTarget.Latest,false,ScriptKind.JS);let found;const visit=node=>{if(isFunctionDeclaration(node)&&node.name?.text===name)found??=node.getText(tree);forEachChild(node,visit)};visit(tree);if(!found)throw Error('Missing '+name);return found}
function fixture(){
 const listeners=new Map(),events=[];let savedState={running:false,ready:false}
 class Shell{constructor(deps){this.deps=deps;this.snapshot={draft:'',draftRev:0,imageIds:[],occurrences:[]};this.files=[];this.state={subscribe:()=>()=>{},getSnapshot:()=>this.snapshot};this.notices={subscribe:()=>()=>{},getSnapshot:()=>null};this.actions={setDraft:text=>this.setDraft(text),insertFilePaths:paths=>this.files.push(...paths)};}setDraft(draft){this.snapshot={...this.snapshot,draft,draftRev:this.snapshot.draftRev+1}}sinkSerialized(draft){return this.deps.defaultSink(draft,this.snapshot.imageIds,'queue',{draft,draftRev:this.snapshot.draftRev,imageIds:[...this.snapshot.imageIds]})}commitSend(ids,draft){this.committed={ids,draft};this.snapshot={...this.snapshot,imageIds:this.snapshot.imageIds.filter(id=>!ids.includes(id)),draft:this.snapshot.draft===draft?'':this.snapshot.draft}}notify(level,text){(this.notifications??=[]).push({level,text})}pruneImages(){}dispose(){this.disposed=true}}
 const released=[],conversation={serializeImages:async files=>files,draftImages:()=>[],releaseDraftImage:id=>released.push(id)},original={deps:{defaultSink:()=>{throw Error('Must not send to chat')},sharedSubmit:()=>{throw Error('Must not send to a board')}},actions:{insertFilePaths:()=>{throw Error('Must not attach to chat')}},snapshot:{draft:'对话草稿'}},InputBar=()=>null
 const context={ctx:{effect:fn=>fn()},SessionInputShell:Shell,conversationController:conversation,InputBar,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail}},document:{addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[])fn(new context.CustomEvent(event.type,{detail:structuredClone(event.detail)}))}},requestAnimationFrame:()=>{},react_jsx_runtime:{jsx:(type,props)=>({type,props})},react:{useState:()=>[savedState,value=>{savedState=value}],useEffect:fn=>fn(),useSyncExternalStore:(_subscribe,get)=>get()}}
 const api=runInNewContext(notesComposerSource+';({input:eworkNotesInput,bar:EWorkSharedInputBar,records:eworkNotesInputs})',context)
 return{...api,original,conversation,InputBar,events,released,document:context.document,CustomEvent:context.CustomEvent}
}
it('reuses the native InputBar and preserves the native hook calls, model and permissions',()=>{
 const f=fixture();let inputCalls=0,noticeCalls=0;const props={eworkNotes:true,sessionId:'s',keyboard:f.original,useInput:select=>{inputCalls++;return select({draft:'对话草稿'})},useNotices:select=>{noticeCalls++;return select(null)},useSession:select=>select({running:false}),renderSlot:()=> 'native model and permissions'}
 const node=f.bar(props);expect(node.type).toBe(f.InputBar);expect(node.props.renderSlot).toBe(props.renderSlot);expect(node.props.useInput(s=>s.draft)).toBe('');node.props.useNotices(s=>s);expect([inputCalls,noticeCalls]).toEqual([1,1]);expect(f.original.snapshot.draft).toBe('对话草稿')
 expect(f.bar({...props,eworkNotes:false}).props).toBeDefined()
})
it('keeps notes drafts separate by session and routes sends to notes without starting chat or research',async()=>{
 const f=fixture(),a=f.input('a',f.original,f.conversation),b=f.input('b',f.original,f.conversation);a.ready=true;b.ready=true;a.shell.setDraft('笔记请求');b.shell.setDraft('其他笔记草稿');await a.shell.sinkSerialized(a.shell.snapshot.draft);expect(f.events[0]).toMatchObject({type:'sherlock:notes-submit',detail:{sessionId:'a',prompt:'笔记请求'}});expect(b.shell.snapshot.draft).toBe('其他笔记草稿');expect(f.original.snapshot.draft).toBe('对话草稿');expect(f.input('a',f.original,f.conversation)).toBe(a)
})
it('does not submit before recovery is ready or after account reset while attachments serialize',async()=>{
 const f=fixture(),a=f.input('a',f.original,f.conversation);a.shell.setDraft('请求');a.shell.submit();await Promise.resolve();expect(f.events).toHaveLength(0);a.ready=true;let finish;f.conversation.serializeImages=()=>new Promise(resolve=>{finish=resolve});a.shell.submit();f.document.dispatchEvent(new f.CustomEvent('sherlock:notes-reset'));finish([]);await Promise.resolve();expect(f.events.filter(e=>e.type==='sherlock:notes-submit')).toHaveLength(0);expect(a.shell.disposed).toBe(true)
})
it('installs the native portal and adapter idempotently, and rejects an unknown native host',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchNotesComposer(source);expect(patchNotesComposer(patched)).toBe(patched);expect(patched).toContain('}, EWorkSharedInputBar);');expect(patched).toContain("activeView === 'notes' ? document.querySelector('[data-ework-notes-composer-host");expect(()=>patchNotesComposer('other client')).toThrow('无法定位')
})
it('passes note-owned input through the actual native slot merge and paperclip contract, including late uploads',async()=>{
 const f=fixture(),record=f.input('s',f.original,f.conversation);record.shell.setDraft('笔记草稿');
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),start=source.indexOf('const zone = session === void 0'),end=source.indexOf('\n\t\t\t};',start)+7;
 const owner=runInNewContext(source.slice(start,end)+';zone',{session:{},inputState:f.original.snapshot,activeView:'notes',notesInputRecord:record,notesInputState:record.shell.snapshot,useInput:select=>select(f.original.snapshot)});
 const renderer=await readFile('node_modules/@deepseek-ai/dsh-client-web-react/lib/index.js','utf8'),render=runInNewContext(functionText(renderer,'renderEntry')+';renderEntry',{jsx:(type,props)=>({type,props})});
 const node=render('conversation.input.left','paperclip',{inputActions:f.original.actions},{},{},{props:{}},owner);
 expect(node.props.input.draft).toBe('笔记草稿');expect(node.props.inputActions).toBe(record.shell.actions);
 const captured=node.props.inputActions;f.bar({eworkNotes:false,sessionId:'s',keyboard:f.original});
 const fileSource=patchDshFileDropClientSource(await readFile('test/fixtures/dsh-file-drop-1.0.0-client.js','utf8')),append=runInNewContext(functionText(fileSource,'appendToDraft')+';appendToDraft');
 append(captured,'旧草稿',['/synthetic/note.txt']);expect(record.shell.files).toEqual(['/synthetic/note.txt']);expect(f.original.snapshot.draft).toBe('对话草稿');
})
it('commits only submitted text and images, preserving a new draft and later attachments',()=>{
 const f=fixture(),props={eworkNotes:true,sessionId:'s',keyboard:f.original,useSession:select=>select({running:false}),useInput:select=>select(f.original.snapshot),useNotices:select=>select(null)};f.bar(props);const record=f.records.get('s');record.shell.setDraft('原请求');record.shell.snapshot.imageIds=['sent'];const admission={draft:'原请求',draftRev:record.shell.snapshot.draftRev,imageIds:['sent']};record.shell.setDraft('等待时写的下一条');record.shell.snapshot.imageIds.push('later');f.document.dispatchEvent(new f.CustomEvent('sherlock:notes-composer-commit',{detail:{sessionId:'s',admission}}));expect(record.shell.snapshot.draft).toBe('等待时写的下一条');expect(record.shell.snapshot.imageIds).toEqual(['later']);expect(f.released).toEqual(['sent']);
 record.shell.setDraft('新请求');const untouched={draft:'新请求',draftRev:record.shell.snapshot.draftRev,imageIds:[]};f.document.dispatchEvent(new f.CustomEvent('sherlock:notes-composer-commit',{detail:{sessionId:'s',admission:untouched}}));expect(record.shell.snapshot.draft).toBe('')
})

it('accepts submissions across isolated event-detail copies and only warns when no editor acknowledges',async()=>{
 const f=fixture(),record=f.input('s',f.original,f.conversation);record.ready=true;
 const ack=e=>f.document.dispatchEvent(new f.CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId:e.detail.sessionId,submissionId:e.detail.submissionId}}));
 f.document.addEventListener('sherlock:notes-submit',ack);await record.shell.sinkSerialized('改写');expect(record.shell.notifications).toBeUndefined();
 f.document.removeEventListener('sherlock:notes-submit',ack);await record.shell.sinkSerialized('重试');expect(record.shell.notifications).toEqual([{level:'error',text:'笔记还未就绪，输入已保留。'}]);
})
