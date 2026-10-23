import {expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {updateNoteComponentLayout,noteComponentSizeBounds} from '../src/preload/notes/component-size-state'
import {createClientCapabilityRegistry,createCapabilityExecutor,capabilityReceiptText} from '../packages/dsh-research-task-runtime/client-capabilities.js'

const context:any={owner:'alice',sessionId:'layout',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]}
function fixture(){
 const content:any={title:'保留标题',yjs:'',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'保留粗体正文',styles:{bold:true}}],children:[{id:'one',type:'research',props:{textAlignment:'right',payload:JSON.stringify({id:'n1',noteSize:{width:440,height:350,extra:'保留'},notePresentation:{theme:'enterprise'},containerSpec:{version:1,type:'table',title:'表一',columns:['值'],rows:[[0],[-2]]},extra:'原属性'})}}]},{id:'two',type:'research',props:{textAlignment:'center',payload:JSON.stringify({id:'n2',noteSize:{width:500,height:400},containerSpec:{version:1,type:'markdown',title:'表二',content:'原内容'}})}}]}
 const find=(id:string,blocks=content.blocks):any=>{for(const b of blocks){if(b.id===id)return b;const v=find(id,b.children??[]);if(v)return v}}
 const stopCapturing=vi.fn(),updates:string[]=[],editor:any={isEditable:true,get document(){return content.blocks},getBlock:find,updateBlock(id:string,value:any){Object.assign(find(id).props,value.props);updates.push(id)},transact(fn:any){fn()},_tiptapEditor:{state:{plugins:[{key:'y-undo$',getState:()=>({undoManager:{stopCapturing}})}]}}}
 return {content,editor,find,updates,stopCapturing}
}
it('shares bounded size mutations with the GUI and clears only requested manual axes',()=>{
 const f=fixture(),before=structuredClone(f.content)
 expect(updateNoteComponentLayout(f.editor,['one','two'],{width:99999,height:1},{availableWidth:()=>640})).toEqual(['one','two'])
 for(const id of ['one','two'])expect(JSON.parse(f.find(id).props.payload).noteSize).toMatchObject({width:640,height:180})
 expect(f.stopCapturing).toHaveBeenCalledTimes(2)
 updateNoteComponentLayout(f.editor,['one','two'],{width:'full',height:'auto'},{availableWidth:()=>640})
 expect(JSON.parse(f.find('one').props.payload).noteSize).toEqual({extra:'保留'})
 expect(JSON.parse(f.find('two').props.payload).noteSize).toEqual({})
 for(const [i,id]of ['one','two'].entries()){const actual=JSON.parse(f.find(id).props.payload),old=JSON.parse((i?before.blocks[1]:before.blocks[0].children[0]).props.payload);delete actual.noteSize;delete old.noteSize;expect(actual).toEqual(old)}
 expect(f.content.blocks[0].content).toEqual(before.blocks[0].content)
 expect(f.find('one').props.textAlignment).toBe('right');expect(f.find('two').props.textAlignment).toBe('center')
 expect(noteComponentSizeBounds(230)).toEqual({minWidth:230,maxWidth:230,minHeight:180,maxHeight:2400})
 updateNoteComponentLayout(f.editor,['one'],{width:1,height:99999},{availableWidth:()=>230})
 expect(JSON.parse(f.find('one').props.payload).noteSize).toMatchObject({width:230,height:2400})
})
it('preflights every target and invalid dimension before making any partial update',()=>{
 const f=fixture(),before=structuredClone(f.content)
 expect(()=>updateNoteComponentLayout(f.editor,['one','gone'],{width:500},{availableWidth:()=>640})).toThrow()
 for(const width of [0,-1,NaN,Infinity,'auto'])expect(()=>updateNoteComponentLayout(f.editor,['one'],{width} as any,{availableWidth:()=>640})).toThrow()
 expect(f.content).toEqual(before);expect(f.updates).toEqual([])
})
it('retains the requested width when a component and its editor have no measurable DOM instead of silently saving 320',()=>{
 const f=fixture();updateNoteComponentLayout(f.editor,['one','two'],{width:700})
 expect(JSON.parse(f.find('one').props.payload).noteSize.width).toBe(700);expect(JSON.parse(f.find('two').props.payload).noteSize.width).toBe(700)
 updateNoteComponentLayout(f.editor,['one'],{width:200});expect(JSON.parse(f.find('one').props.payload).noteSize.width).toBe(200)
})
it('resets only the requested axis and preserves the other manual dimension and unknown size properties',()=>{
 const f=fixture();updateNoteComponentLayout(f.editor,['one'],{width:'full'})
 expect(JSON.parse(f.find('one').props.payload).noteSize).toEqual({height:350,extra:'保留'})
 updateNoteComponentLayout(f.editor,['two'],{height:'auto'})
 expect(JSON.parse(f.find('two').props.payload).noteSize).toEqual({width:500})
})
it('does not mutate when cancelled before layout starts and reports an applied effect when saving fails',async()=>{
 const f=fixture(),before=structuredClone(f.content),handler=createNoteCapabilityActions({editor:f.editor,snapshot:()=>f.content,current:()=>true,generationId:()=> 'g',documentId:'doc',selectedBlockIds:()=>[],persist:async()=>{throw Error('磁盘写入失败')},exportNote:async()=>({}),settle:async()=>{}})
 const call:any={requestId:'cancel',generationId:'g',context,action:'notes.components.layout',args:{scope:'note',height:250}}
 await handler({requestId:'cancel',cancel:true});await expect(handler(call)).rejects.toThrow('已取消');expect(f.content).toEqual(before)
 expect(await handler({...call,requestId:'save-fail'})).toMatchObject({status:'failed',effect:{kind:'layout',state:'applied'},message:expect.stringContaining('未确认保存')})
 expect(JSON.parse(f.find('one').props.payload).noteSize.height).toBe(250)
})
it('routes whole-note and selected layout through saved effects, preserves payloads, and rejects stale leases',async()=>{
 const f=fixture(),root=mkdtempSync(join(tmpdir(),'note-layout-')),store=new NotesStore(root);let revision=0,selected=['one','two'],generation='g',active=true
 const effects:any[]=[],handler=createNoteCapabilityActions({editor:f.editor,snapshot:()=>f.content,current:()=>active,generationId:()=>generation,documentId:'doc',selectedBlockIds:()=>selected,componentWidth:()=>640,persist:async()=>{const r=store.save('alice','layout',revision,f.content,'client');if(r.status!=='saved')throw Error('保存冲突');revision=r.saved.revision},settle:async()=>{},exportNote:async()=>({}),reportEffect:async(_id,e)=>{effects.push(e)}})
 const call:any={requestId:'layout1',generationId:'g',context,action:'notes.components.layout',args:{scope:'note',width:'full',height:'auto'}}
 try{
  expect(await handler(call)).toMatchObject({status:'succeeded',effect:{kind:'layout',state:'saved',changedBlockIds:['one','two']}})
  expect(store.load('alice','layout').saved.blocks).toEqual(f.content.blocks)
  expect(await handler({...call,requestId:'layout2',context:{...context,selectedBlockIds:selected},args:{scope:'selected',width:470,height:220}})).toMatchObject({status:'succeeded',effect:{kind:'layout',state:'saved'}})
  expect(effects.map(e=>e.state)).toEqual(['applied','saved','applied','saved'])
  selected=['two'];await expect(handler({...call,requestId:'stale',context:{...context,selectedBlockIds:['one','two']},args:{scope:'selected',width:500}})).rejects.toThrow('选中组件已变化')
  f.content.blocks[0].content[0].text='用户较新输入';await expect(handler({...call,requestId:'changed'})).rejects.toThrow('内容已变化')
  generation='other';await expect(handler({...call,requestId:'old'})).rejects.toThrow('会话已变化')
 }finally{rmSync(root,{recursive:true,force:true})}
})
it.each(['before-save','during-save','after-save'])('keeps real layout effects on cancellation %s without undoing already applied sizes',async when=>{
 const f=fixture(),saved:any[]=[],effects:any[]=[];let handler:any
 handler=createNoteCapabilityActions({editor:f.editor,snapshot:()=>f.content,current:()=>true,generationId:()=> 'g',documentId:'doc',selectedBlockIds:()=>[],componentWidth:()=>640,reportEffect:async(_id,e)=>{effects.push(e);if(when==='before-save'&&e.state==='applied')await handler({requestId:'a',cancel:true})},persist:async()=>{saved.push(structuredClone(f.content));if(when==='during-save')await handler({requestId:'a',cancel:true})},settle:async()=>{if(when==='after-save')await handler({requestId:'a',cancel:true})},exportNote:async()=>({})})
 const receipt=await handler({requestId:'a',generationId:'g',context,action:'notes.components.layout',args:{scope:'note',height:270}})
 expect(receipt).toMatchObject({status:'cancelled',effect:{kind:'layout',state:when==='before-save'?'applied':'saved'}})
 expect(saved).toHaveLength(when==='before-save'?0:1);expect(JSON.parse(f.find('one').props.payload).noteSize.height).toBe(270)
 expect(effects.map(e=>e.state)).toEqual(when==='before-save'?['applied']:['applied','saved'])
})
it('registers strict layout arguments, caches duplicate execution and localizes persisted receipts',async()=>{
 const apply=vi.fn(async()=>({status:'succeeded' as const,effect:{kind:'layout' as const,state:'saved' as const,changedBlockIds:['one','two']},message:'已保存 2 个组件的布局。'})),registry=createClientCapabilityRegistry({layoutComponents:apply}),executor=createCapabilityExecutor(registry,()=>context)
 const call:any={requestId:'same',capability:'notes.components.layout',arguments:{scope:'note',width:'full',height:'auto'}}
 const receipt=await executor.execute(call,context);expect(receipt.status).toBe('succeeded');expect(await executor.execute(call,context)).toEqual(receipt);expect(apply).toHaveBeenCalledOnce()
 expect(capabilityReceiptText([receipt],'en')).toContain('Saved layout for 2 components.')
 expect(capabilityReceiptText([{...receipt,message:'Saved layout for 2 components.'}],'zh')).toContain('已保存 2 个组件的布局。')
 for(const args of [{scope:'note'},{scope:'note',width:'auto'},{scope:'note',height:'full'},{scope:'note',width:0},{scope:'note',height:-1},{scope:'note',width:'500'},{scope:'note',width:500,containerSpec:{}}])expect((await executor.execute({...call,requestId:JSON.stringify(args),arguments:args} as any,context)).status).toBe('failed')
 expect(apply).toHaveBeenCalledOnce()
})
