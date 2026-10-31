import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
import {createNoteCapabilityActions,noteCapabilityFingerprint} from '../src/preload/notes/client-capability-actions'
import {createClientCapabilityRegistry,createCapabilityExecutor} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {changeNoteAlignment} from '../src/preload/notes/block-alignment'
import {defaultBlockSpecs} from '@blocknote/core'
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
const spec=(text='原有组件')=>({version:1,type:'markdown',title:'数据',content:text})
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'note-capability-edit-'));roots.push(root);const store=new NotesStore(root)
 const node={id:'node-one',kind:'generated-container',generationStatus:'completed',noteSize:{width:330,height:240},notePresentation:{theme:'enterprise'},custom:'保留',containerSpec:spec()}
 const content:any={title:'原文标题',yjs:'',blocks:[{id:'p',type:'paragraph',props:{textAlignment:'left',noteIndent:2},content:[{type:'text',text:'保留正文',styles:{bold:true}}],children:[{id:'r',type:'research',props:{textAlignment:'left',payload:JSON.stringify(node)}}]},{id:'p2',type:'paragraph',props:{textAlignment:'left'},content:'未选正文'},{id:'other',type:'research',props:{textAlignment:'left',payload:JSON.stringify({...node,id:'node-other',containerSpec:spec('未选组件')})}},{id:'file',type:'attachment',props:{textAlignment:'left',payload:'{"authorizationId":"private-file"}'}}]}
 let selected=['r'],paragraphs=['p'],generation='generation',active=true,revision=0,cancelOnUpdate=false,initial=noteCapabilityFingerprint(content)
 const effects:any[]=[],exports:any[]=[]
 const editor:any={isEditable:true,get document(){return content.blocks},getBlock(id:string){let found:any;const visit=(blocks:any[])=>blocks.forEach(block=>{if(block.id===id)found=block;visit(block.children??[])});visit(content.blocks);return found},updateBlock(id:string,value:any){const block=this.getBlock(id);block.props={...block.props,...value.props};if(cancelOnUpdate)active=false},transact(fn:()=>void){fn()}}
 const context=()=>({owner:'alice',sessionId:'session',documentId:'doc',mode:'notes' as const,editable:editor.isEditable,selectedBlockIds:[...selected],selectedParagraphIds:[...paragraphs]})
 const handler=createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>active,generationId:()=>generation,initialFingerprint:()=>initial,documentId:'doc',selectedBlockIds:()=>selected,selectedParagraphIds:()=>paragraphs,reportEffect:async(_id,effect)=>{effects.push(effect)},persist:async()=>{const saved=store.save('alice','session',revision,content,'client');if(saved.status!=='saved')throw Error('save conflict');revision=saved.saved.revision},settle:async()=>{},exportNote:async()=>{exports.push(structuredClone(content));return{status:'saved',path:'/tmp/test.pdf'}}})
 let sequence=0
 const call=(action:string,args:any={},bound=context())=>handler({action,args,context:bound,generationId:generation,requestId:'call-'+(++sequence)})
 const retry=()=>{generation+='-retry';initial=noteCapabilityFingerprint(content)}
 return {content,node,editor,context,call,handler,effects,exports,retry,saved:()=>store.load('alice','session').saved,select:(ids:string[])=>{selected=ids},selectParagraphs:(ids:string[])=>{paragraphs=ids},cancelAfterUpdate:()=>{cancelOnUpdate=true},deactivate:()=>{active=false}}
}
it('aligns all research containers through the shared manual handler without changing paragraphs, width or payload',async()=>{
 const f=fixture(),before=structuredClone(f.content),payload=f.editor.getBlock('r').props.payload
 expect(await f.call('notes.blocks.align',{scope:'note',target:'researchComponents',alignment:'right'})).toMatchObject({status:'succeeded',effect:{state:'saved',kind:'alignment',changedBlockIds:['r','other']}})
 expect(f.saved().blocks[0].children[0].props).toEqual({textAlignment:'right',payload});expect(f.editor.getBlock('p')).toEqual(before.blocks[0]&&{...before.blocks[0],children:f.content.blocks[0].children});expect(f.editor.getBlock('file')).toEqual(before.blocks[3]);expect(f.editor.getBlock('other').props.textAlignment).toBe('right')
 const manual=fixture();changeNoteAlignment(manual.editor,['r','other'],'right');expect(manual.content).toEqual(f.content)
})
it('separately aligns only referenced paragraphs and preserves unselected text and components',async()=>{
 const f=fixture(),before=structuredClone(f.content)
 await f.call('notes.blocks.align',{scope:'selected',target:'paragraphs',alignment:'center'})
 expect(f.editor.getBlock('p').props).toEqual({textAlignment:'center',noteIndent:2});expect(f.editor.getBlock('p').content).toEqual(before.blocks[0].content);expect(f.editor.getBlock('p2')).toEqual(before.blocks[1]);expect(f.editor.getBlock('r')).toEqual(before.blocks[0].children[0]);expect(f.saved().blocks[0].props.textAlignment).toBe('center')
})
it('rejects a changed alignment selection and permits a fresh request against the new selection',async()=>{
 const f=fixture(),bound=f.context();f.select(['other'])
 await expect(f.call('notes.blocks.align',{scope:'selected',target:'researchComponents',alignment:'right'},bound)).rejects.toThrow('目标已变化')
 expect(f.editor.getBlock('r').props.textAlignment).toBe('left');f.retry();await f.call('notes.blocks.align',{scope:'selected',target:'researchComponents',alignment:'right'});expect(f.editor.getBlock('other').props.textAlignment).toBe('right');expect(f.editor.getBlock('r').props.textAlignment).toBe('left')
})
it('inspects and applies only the selected component with real payload CAS, then exports the saved result',async()=>{
 const f=fixture(),before=structuredClone(f.content),inspect:any=await f.call('notes.components.inspect')
 expect(inspect).toMatchObject({status:'succeeded',data:{blockId:'r',nodes:[{id:'node-one',content:{containerSpec:spec()}}]}});expect(JSON.stringify(inspect)).not.toMatch(/保留正文|未选组件|private-file/)
 const args={blockId:'r',revision:inspect.data.revision,containerSpec:spec('实际修改')}
 expect(await f.call('notes.components.apply',args)).toMatchObject({status:'succeeded',effect:{state:'saved',kind:'content',changedBlockIds:['r']}})
 expect(JSON.parse(f.editor.getBlock('r').props.payload)).toEqual({...f.node,containerSpec:spec('实际修改')});expect(f.editor.getBlock('r').props.textAlignment).toBe('left');expect(f.content.blocks.slice(1)).toEqual(before.blocks.slice(1));expect(f.content.blocks[0].content).toEqual(before.blocks[0].content)
 await f.call('notes.export',{format:'pdf'});expect(f.saved()).toMatchObject(f.exports[0])
})
it('rejects stale note and payload versions without poisoning a fresh inspect/apply retry',async()=>{
 const f=fixture(),inspect:any=await f.call('notes.components.inspect');f.editor.getBlock('r').props.payload=JSON.stringify({...f.node,noteSize:{width:500,height:240}})
 await expect(f.call('notes.components.apply',{blockId:'r',revision:inspect.data.revision,containerSpec:spec('旧结果')})).rejects.toThrow('笔记内容已变化')
 f.retry();await expect(f.call('notes.components.apply',{blockId:'r',revision:inspect.data.revision,containerSpec:spec('旧结果')})).rejects.toThrow('组件内容已变化')
 const fresh:any=await f.call('notes.components.inspect');await f.call('notes.components.apply',{blockId:'r',revision:fresh.data.revision,containerSpec:spec('新结果')});expect(JSON.parse(f.editor.getBlock('r').props.payload)).toMatchObject({noteSize:{width:500},containerSpec:spec('新结果')})
})
it.each(['selection','text','session'])('preserves newer %s state changed during asynchronous component hashing',async change=>{
 const f=fixture(),inspect:any=await f.call('notes.components.inspect'),digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve});vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return digest(...args)})
 const pending=f.call('notes.components.apply',{blockId:'r',revision:inspect.data.revision,containerSpec:spec('旧结果')})
 if(change==='selection')f.select(['other']);if(change==='text')f.editor.getBlock('p').content='用户新正文';if(change==='session')f.deactivate();release()
 await expect(pending).rejects.toThrow();expect(JSON.parse(f.editor.getBlock('r').props.payload).containerSpec).toEqual(spec());expect(f.effects).toEqual([])
})
it('rejects unrelated targets, malformed structures and unselected scope before any mutation',async()=>{
 const f=fixture(),before=structuredClone(f.content),inspect:any=await f.call('notes.components.inspect')
 await expect(f.call('notes.components.apply',{blockId:'other',revision:inspect.data.revision,containerSpec:spec('不允许')})).rejects.toThrow('引用范围')
 await expect(f.call('notes.components.apply',{blockId:'r',revision:inspect.data.revision,containerSpec:{version:1,type:'table',columns:[],rows:[]}})).rejects.toThrow('结构约定')
 f.select([]);await expect(f.call('notes.components.inspect')).rejects.toThrow('选中组件已变化');expect(f.content).toEqual(before);expect(f.effects).toEqual([])
})
it('exposes inspect/apply only with one selected component and requires explicit alignment target schemas',async()=>{
 const f=fixture(),registry=createClientCapabilityRegistry({inspectNoteComponent:async()=>({status:'succeeded'}),applyNoteComponent:async()=>({status:'succeeded'}),alignBlocks:async()=>({status:'succeeded'})}),bound=f.context(),executor=createCapabilityExecutor(registry,()=>bound)
 expect(registry.catalog({...bound,selectedBlockIds:[]}).filter(entry=>entry.id.startsWith('notes.components.')&&['notes.components.inspect','notes.components.apply'].includes(entry.id)).every(entry=>!entry.available)).toBe(true)
 const invalid:any={requestId:'align',capability:'notes.blocks.align',arguments:{scope:'note',alignment:'right'}};expect(await executor.execute(invalid,bound)).toMatchObject({status:'failed'})
 expect(await executor.execute({...invalid,requestId:'valid',arguments:{...invalid.arguments,target:'researchComponents'}},bound)).toMatchObject({status:'succeeded'})
})

it('retains an honest applied effect when the existing sink detects cancellation just after mutation',async()=>{
 const f=fixture(),inspect:any=await f.call('notes.components.inspect');f.cancelAfterUpdate()
 const result=await f.call('notes.components.apply',{blockId:'r',revision:inspect.data.revision,containerSpec:spec('已发生的修改')})
 expect(result).toMatchObject({status:'cancelled',effect:{state:'applied',kind:'content',changedBlockIds:['r']}});expect(JSON.parse(f.editor.getBlock('r').props.payload).containerSpec).toEqual(spec('已发生的修改'));expect(f.effects.map(e=>e.state)).toEqual(['applied'])
})

it('retains native image manual alignment while capability scopes do not expand to media blocks',async()=>{
 const f=fixture(),image={id:'image',type:'image',props:{url:'https://example.com/image.png',textAlignment:'left',previewWidth:280}}
 f.content.blocks.push(image);f.editor.schema={blockSchema:{image:defaultBlockSpecs.image.config}}
 changeNoteAlignment(f.editor,['image'],'right');expect(image.props).toEqual({url:'https://example.com/image.png',textAlignment:'right',previewWidth:280})
 f.retry();await f.call('notes.blocks.align',{scope:'note',target:'researchComponents',alignment:'center'});expect(image.props.textAlignment).toBe('right');expect(f.editor.getBlock('r').props.textAlignment).toBe('center')
})

it('refuses a Main preview-only component content request if its composer preview lease is absent',async()=>{
 const f=fixture(),inspect:any=await f.call('notes.components.inspect'),before=structuredClone(f.content)
 await expect(f.handler({action:'notes.components.apply',args:{blockId:'r',revision:inspect.data.revision,containerSpec:spec('不应写入')},context:f.context(),generationId:'generation',requestId:'requires-preview',previewOnly:true})).rejects.toThrow('本次未写入正文')
 expect(f.content).toEqual(before);expect(f.effects).toEqual([])
})
