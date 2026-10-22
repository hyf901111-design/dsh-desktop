import {expect,it,vi} from 'vitest'
import {createExternalNoteCapabilityLease} from '../src/preload/notes/external-capability-lease'
function fixture(){
 let visible=true,busy=false,finish!:()=>void,blocked=false
 const content:any={title:'Original',blocks:[],yjs:''},begins:string[]=[],retained:boolean[]=[],created:any[]=[],disposed:any[]=[],cancelled:string[]=[]
 const lease=createExternalNoteCapabilityLease({sessionId:'s',documentId:'doc',snapshot:()=>content,current:()=>visible,busy:()=>busy,begin:id=>begins.push(id),capture:async()=>{if(blocked)await new Promise<void>(r=>finish=r);return{selectedBlockIds:[],selectedParagraphIds:[],requestContext:{context:{scope:'note',components:[]}}}},retaining:value=>retained.push(value),create:options=>{created.push(options);return Object.assign(async(input:any)=>{if(input.cancel){cancelled.push(input.requestId);return}if(blocked)await new Promise<void>(r=>finish=r);return{status:options.current()?'succeeded':'cancelled'}},{dispose:()=>disposed.push(options)})}})
 const packet=(action='context.acquire',requestId='capture')=>({sessionId:'s',generationId:'harness:one',requestId,context:{documentId:'doc'},action,args:{}})
 return{lease,packet,content,begins,retained,created,disposed,cancelled,block:()=>blocked=true,release:()=>{blocked=false;finish()},hide:()=>visible=false,write:()=>busy=true}
}
it.each(['cancel','release','document-change','hidden','writer'])('does not create a late external lease after %s during asynchronous capture',async kind=>{
 const h=fixture();h.block();const pending=h.lease.handle(h.packet())
 if(kind==='cancel')await h.lease.handle({sessionId:'s',requestId:'capture',cancel:true})
 if(kind==='release')await h.lease.handle({sessionId:'s',generationId:'harness:one',documentId:'doc',release:true})
 if(kind==='document-change')h.content.title='New human title'
 if(kind==='hidden')h.hide()
 if(kind==='writer')h.write()
 h.release();await expect(pending).rejects.toThrow();expect(h.created).toEqual([]);expect(h.begins).toEqual([]);expect(h.lease.generationId()).toBe('');expect(h.lease.pending()).toBe(false)
})
it('keeps one fixed capture, refuses another pending mutation, and retains the old editor until cancellation settles',async()=>{
 const h=fixture();await h.lease.handle(h.packet());expect(h.begins).toEqual(['harness:one'])
 await expect(h.lease.handle(h.packet())).rejects.toThrow('不能重置')
 h.block();const pending=h.lease.handle(h.packet('notes.components.style','style'))
 await expect(h.lease.handle(h.packet('notes.export','export'))).rejects.toThrow('尚未完成')
 await h.lease.handle({sessionId:'s',requestId:'style',cancel:true});expect(h.cancelled).toEqual(['style']);expect(h.disposed).toEqual([]);expect(h.retained).toEqual([true])
 h.release();expect(await pending).toEqual({status:'cancelled'});expect(h.retained).toEqual([true,false]);expect(h.disposed).toHaveLength(1)
})
it('does not admit a different document or a local composer request as a Harness lease',async()=>{
 const h=fixture()
 await expect(h.lease.handle({...h.packet(),context:{documentId:'another'}})).rejects.toThrow()
 await expect(h.lease.handle({...h.packet(),generationId:'local-composer'})).rejects.toThrow()
 expect(h.created).toEqual([])
})
