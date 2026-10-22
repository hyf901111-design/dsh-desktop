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
