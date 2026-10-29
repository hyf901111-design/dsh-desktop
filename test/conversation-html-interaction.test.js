import {expect,it} from 'vitest'
import {createConversationHtmlInteraction} from '../scripts/lib/conversation-html-interaction.mjs'
import {createNoteHtmlInteractionBridge,createNoteHtmlSharedStateBridge} from '../scripts/lib/notes-html-interaction.mjs'
function fixture(){
 const html='<p>离线计数</p>',statuses=[];let view={id:'card',sessionId:'session',revision:1,node:{containerSpec:{type:'html',html}}},resolve,current=true
 const bridge={commitHtmlInteraction:()=>new Promise(yes=>{resolve=yes}),read:async()=>structuredClone(view)}
 const host=createConversationHtmlInteraction({bridge,sessionId:'session',componentId:'card',html,read:()=>view,update:next=>{view=next},current:()=>current,createJournal:createNoteHtmlInteractionBridge,createShared:createNoteHtmlSharedStateBridge,status:(value,error)=>statuses.push({value,error})})
 const saved=(revision,count)=>({id:'card',sessionId:'session',revision,node:{containerSpec:{type:'html',html},config:{sharedComponentState:{version:'v',revision:revision-1,state:{count}}}}})
 return{host,statuses,get:()=>view,set:next=>{view=next},saved,release:()=>resolve(saved(2,1)),leave:()=>{current=false}}
}
it('never calls a rejected queued readonly admission saved',async()=>{
 const f=fixture();f.set({...f.get(),readOnly:true})
 expect(await f.host.sharedBridge.commit('v',1,{count:1})).toBeUndefined()
 expect(f.statuses.some(value=>value.value==='saved')).toBe(false);expect(f.statuses.at(-1).value).toBe('error')
})
it('does not write presentation over a failed HTML interaction or a departed owner',async()=>{
 const f=fixture();f.set({...f.get(),readOnly:true});await f.host.sharedBridge.commit('v',1,{count:1});f.set({...f.get(),readOnly:false})
 await expect(f.host.commitPresentation(async()=>{f.set({...f.get(),node:{...f.get().node,componentTheme:'dark'}})})).rejects.toThrow('交互尚未保存')
 expect(f.get().node.componentTheme).toBeUndefined()
 const other=fixture();other.leave();await expect(other.host.commitPresentation(async()=>{other.set({...other.get(),node:{...other.get().node,componentTheme:'dark'}})})).rejects.toThrow('已变化')
 expect(other.get().node.componentTheme).toBeUndefined()
})
it.each(['newer','readonly','session'])('does not ACK or replace a newer/locked Conversation view after an old save returns: %s',async kind=>{
 const f=fixture(),pending=f.host.sharedBridge.commit('v',1,{count:1});await Promise.resolve();await Promise.resolve()
 if(kind==='newer')f.set(f.saved(3,2))
 if(kind==='readonly')f.set({...f.get(),readOnly:true})
 if(kind==='session')f.leave()
 f.release();expect(await pending).toBeUndefined()
 if(kind==='newer')expect(f.get().revision).toBe(3)
 if(kind==='readonly')expect(f.get().readOnly).toBe(true)
 expect(f.statuses.some(value=>value.value==='saved')).toBe(false)
})
