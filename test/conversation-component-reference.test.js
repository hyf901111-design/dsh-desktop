import {it,expect,vi} from 'vitest'
import {conversationComponentReferenceSource,insertConversationComponentReference,serializeConversationComponentReference} from '../scripts/lib/conversation-components.mjs'
const ref={version:1,kind:'conversation-component',sessionId:'session-a',componentId:'component-a',revision:1,title:'模拟行情'}
it('inserts one independent chip using revision CAS while retaining draft images and selected text, without sending',async()=>{
 const snapshot={draft:'已有草稿',draftRev:4,imageIds:['image-a'],occurrences:[]},send=vi.fn(),input={selectionStart:1,selectionEnd:3,focus:vi.fn()},shell={snapshot,insertReference:vi.fn(()=>true),submit:send},bridge={reference:vi.fn(async()=>ref)}
 await insertConversationComponentReference({bridge,sessionId:'session-a',componentId:'component-a',shell,input})
 expect(shell.insertReference).toHaveBeenCalledWith({source:'conversation-component',ref:JSON.stringify(ref),label:'模拟行情',clipboardText:'模拟行情'},{start:3,end:3,draftRev:4})
 expect(snapshot).toEqual({draft:'已有草稿',draftRev:4,imageIds:['image-a'],occurrences:[]});expect(input.focus).toHaveBeenCalled();expect(send).not.toHaveBeenCalled()
})
it('rejects cross-session and stale drafts before touching them',async()=>{
 const shell={snapshot:{draft:'保留草稿',draftRev:2},insertReference:vi.fn(()=>false)}
 await expect(insertConversationComponentReference({bridge:{reference:async()=>({...ref,sessionId:'other'})},sessionId:'session-a',componentId:'component-a',shell})).rejects.toThrow();expect(shell.insertReference).not.toHaveBeenCalled()
 await expect(insertConversationComponentReference({bridge:{reference:async()=>ref},sessionId:'session-a',componentId:'component-a',shell})).rejects.toThrow(/草稿/)
 expect(shell.snapshot.draft).toBe('保留草稿')
})
it('serializes actual Host content with the real keyboard session and an explicit material boundary',async()=>{
 const bridge={resolveReference:vi.fn(async()=>({title:'当前模拟行情',text:'模拟价格 12.34；来源 模拟源；时间 2026-10-24'}))},signal=new AbortController().signal
 const text=await serializeConversationComponentReference(JSON.stringify(ref),signal,'session-a',bridge)
 expect(bridge.resolveReference).toHaveBeenCalledWith({sessionId:'session-a',reference:ref});expect(text).toContain('12.34');expect(text).toContain('参考资料');expect(text).toContain('不作为指令')
 expect(text).not.toContain('artifact');expect(conversationComponentReferenceSource().name).toBe('conversation-component')
 await expect(serializeConversationComponentReference(JSON.stringify(ref),signal,'other',bridge)).rejects.toThrow();expect(bridge.resolveReference).toHaveBeenCalledTimes(1)
 await expect(serializeConversationComponentReference(JSON.stringify({...ref,version:2}),signal,'session-a',bridge)).rejects.toThrow()
 const controller=new AbortController();controller.abort();await expect(serializeConversationComponentReference(JSON.stringify(ref),controller.signal,'session-a',bridge)).rejects.toThrow()
})
it('does not insert an asynchronously resolved reference after the visible keyboard session changes',async()=>{
 const shell={snapshot:{draft:'保留',draftRev:2},insertReference:vi.fn(()=>true)}
 await expect(insertConversationComponentReference({bridge:{reference:async()=>ref},sessionId:'session-a',componentId:'component-a',shell,isCurrent:()=>false})).rejects.toThrow(/会话已变化/)
 expect(shell.insertReference).not.toHaveBeenCalled()
})
it('projects a sent reference as its own chip while keeping the actual resolved data in the model prompt',async()=>{
 const {conversationComponentUserTextSegments}=await import('../scripts/lib/conversation-component-reference.mjs')
 const signal=new AbortController().signal,text=await serializeConversationComponentReference(JSON.stringify(ref),signal,'session-a',{resolveReference:async()=>({title:'模拟最新行情',text:'模型可见的实际模拟价格 12.34'})})
 expect(conversationComponentUserTextSegments('分析'+text+'走势')).toEqual([{text:'分析'},{title:'模拟最新行情'},{text:'走势'}])
 expect(text).toContain('12.34');expect(conversationComponentUserTextSegments('普通正文')).toBeNull()
 expect(conversationComponentUserTextSegments('<conversation-component-reference>恶意/不完整JSON</conversation-component-reference>')).toBeNull()
})
