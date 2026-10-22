import {expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
const module=await import('../src/preload/notes/client-capability-actions').catch(()=>null)
it('styles every embedded research block without selection and persists rich text and nested payloads',async()=>{
 expect(module,'note capability adapter is absent').not.toBeNull()
 const root=mkdtempSync(join(tmpdir(),'note-capability-')),store=new NotesStore(root),content:any={title:'原文',yjs:'',blocks:[{id:'text',type:'paragraph',content:[{type:'text',text:'不要改动正文',styles:{bold:true}}],children:[{id:'nested',type:'research',props:{payload:JSON.stringify({id:'node-one',containerSpec:{version:1,type:'table',title:'表',columns:['值'],rows:[[1]]}})}}]},{id:'two',type:'research',props:{payload:JSON.stringify({id:'node-two',noteSize:{width:400},containerSpec:{version:1,type:'markdown',title:'二',content:'保留'}})}}]}
 const before=JSON.stringify(content.blocks[0].content),updates:any[]=[];let revision=0,current=true
 const editor={get document(){return content.blocks},getBlock(id:string){let result:any;const visit=(blocks:any[])=>{for(const b of blocks){if(b.id===id)result=b;visit(b.children??[])}};visit(content.blocks);return result},updateBlock(id:string,value:any){const b=this.getBlock(id);b.props={...b.props,...value.props};updates.push(id)},transact(fn:any){fn()}}
 const context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]},handler=module!.createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>current,generationId:()=> 'generation',documentId:'doc',selectedBlockIds:()=>[],persist:async()=>{const result=store.save('alice','note',revision,content,'client');if(result.status!=='saved')throw Error('conflict');revision=result.saved.revision},exportNote:async()=>({status:'saved',path:'/tmp/real.pdf'}),settle:async()=>{}})
 const call={requestId:'a',generationId:'generation',sessionId:'note',context,action:'notes.components.style',args:{scope:'note',theme:'enterprise',titleBar:false}}
 try{
  expect(await handler(call)).toMatchObject({status:'succeeded',changedBlockIds:['nested','two']})
  const saved=store.load('alice','note').saved;expect(JSON.parse(saved.blocks[0].children[0].props.payload)).toMatchObject({notePresentation:{theme:'enterprise',titleBar:false}});expect(JSON.stringify(saved.blocks[0].content)).toBe(before);expect(JSON.parse(saved.blocks[1].props.payload).noteSize.width).toBe(400)
  expect(await handler({...call,requestId:'b',action:'notes.export',args:{format:'pdf'}})).toMatchObject({status:'succeeded',path:'/tmp/real.pdf'})
  content.title='用户正在输入';await expect(handler({...call,requestId:'c'})).rejects.toThrow('内容已变化')
  current=false;await expect(handler({...call,requestId:'d'})).rejects.toThrow('会话已变化')
 }finally{rmSync(root,{recursive:true,force:true})}
})
it.each(['before-save','during-save','after-save'])('keeps accurate style effects when cancelled %s without undoing the edit',async(when)=>{
 const content:any={title:'原文',yjs:'',blocks:[{id:'r',type:'research',props:{payload:JSON.stringify({id:'n'})}}]},effects:any[]=[],saved:any[]=[]
 const editor={document:content.blocks,getBlock:()=>content.blocks[0],updateBlock:(_id:string,value:any)=>Object.assign(content.blocks[0].props,value.props)}
 const call={requestId:'style',generationId:'generation',context:{documentId:'doc'},action:'notes.components.style',args:{scope:'note',theme:'enterprise'}}
 let handler:any
 const cancel=()=>handler({requestId:'style',cancel:true})
 handler=module!.createNoteCapabilityActions({editor,snapshot:()=>content,current:()=>true,generationId:()=> 'generation',documentId:'doc',selectedBlockIds:()=>[],
  reportEffect:async(_id:string,effect:any)=>{effects.push(effect);if(when==='before-save'&&effect.state==='applied')await cancel()},
  persist:async()=>{if(when==='during-save')await cancel();saved.push(JSON.parse(JSON.stringify(content)))},
  settle:async()=>{if(when==='after-save')await cancel()},exportNote:async()=>({})} as any)
 const result=await handler(call)
 expect(result).toMatchObject({status:'cancelled',effect:{state:when==='before-save'?'applied':'saved',changedBlockIds:['r']}})
 expect(saved).toHaveLength(when==='before-save'?0:1);expect(JSON.parse(content.blocks[0].props.payload).notePresentation.theme).toBe('enterprise')
 expect(effects.map(e=>e.state)).toEqual(when==='before-save'?['applied']:['applied','saved'])
})

it('does not apply a style when cancellation was acknowledged before mutation',async()=>{
 const content:any={title:'原文',yjs:'',blocks:[{id:'r',type:'research',props:{payload:JSON.stringify({id:'n'})}}]}
 const handler=module!.createNoteCapabilityActions({editor:{document:content.blocks},snapshot:()=>content,current:()=>true,generationId:()=> 'generation',documentId:'doc',selectedBlockIds:()=>[],persist:async()=>{throw Error('must not save')},exportNote:async()=>({}),settle:async()=>{}})
 await handler({requestId:'style',cancel:true})
 await expect(handler({requestId:'style',generationId:'generation',context:{documentId:'doc'},action:'notes.components.style',args:{scope:'note',theme:'enterprise'}})).rejects.toThrow('已取消')
 expect(JSON.parse(content.blocks[0].props.payload)).not.toHaveProperty('notePresentation')
})
it('journals placeholder, generated and saved creation effects when cancelled after persistence',async()=>{
 const content:any={title:'原文',yjs:'',blocks:[]},effects:any[]=[],saved:any[]=[];let handler:any
 const call={requestId:'create',generationId:'generation',context:{documentId:'doc'},action:'notes.components.create',args:{prompt:'表格'}}
 handler=module!.createNoteCapabilityActions({editor:{document:content.blocks},snapshot:()=>content,current:()=>true,generationId:()=> 'generation',documentId:'doc',selectedBlockIds:()=>[],
  createComponent:async(_args:any,_current:any,_id:any,report:any)=>{content.blocks.push({id:'created',type:'research',props:{payload:'{}'}});await report?.({state:'placeholder',blockId:'created'});content.blocks[0].props.payload=JSON.stringify({containerSpec:{type:'table',columns:['值'],rows:[[1]]}});return{status:'succeeded',blockId:'created'}},
  reportEffect:async(_id:string,effect:any)=>{effects.push(effect)},persist:async()=>{saved.push(structuredClone(content));await handler({requestId:'create',cancel:true})},settle:async()=>{},exportNote:async()=>({})} as any)
 const result=await handler(call)
 expect(result).toMatchObject({status:'cancelled',blockId:'created',effect:{state:'saved',blockId:'created'}})
 expect(saved[0].blocks[0].id).toBe('created');expect(effects.map(e=>e.state)).toEqual(['placeholder','applied','saved'])
})
