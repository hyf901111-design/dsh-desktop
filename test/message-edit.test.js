import {describe,it,expect,vi} from 'vitest'
import {messageEditCut,editedPromptContent,sendMessageRevision,patchMessageEditHost,patchMessageEditRuntime} from '../scripts/lib/message-edit.mjs'
import {readFile} from 'node:fs/promises'
import {noteForkBoundary} from '../scripts/lib/notes-reply-actions.mjs'
const e=(seq,type,data={})=>({seq,type,data})
const events=[e(0,'model/selected'),e(1,'turn/start'),e(2,'user/message',{source:{kind:'user'}}),e(3,'assistant/message'),e(4,'turn/end'),e(5,'turn/start'),e(6,'user/message',{source:{kind:'user'}}),e(7,'assistant/message'),e(8,'turn/end')]
describe('editing a sent message',()=>{
 it('cuts before the first or a later turn without old answers or open tool calls',()=>{
  expect(messageEditCut(events,2)).toBe(1);expect(messageEditCut(events,6)).toBe(5)
  expect(()=>messageEditCut(events,3)).toThrow();expect(()=>messageEditCut(events,99)).toThrow()
  expect(()=>messageEditCut(events.slice(0,-1),6)).toThrow()
 })
 it('does not silently discard an earlier user message in a steered turn',()=>{
  expect(()=>messageEditCut([...events.slice(0,-1),e(8,'user/message',{source:{kind:'user'}}),e(9,'turn/end')],8)).toThrow()
 })
 it('retains attachments and their original order, replacing only text',async()=>{
  const image={type:'image',attachment:{attachmentId:'img'}},read=vi.fn(async()=>({mediaType:'image/png',data:'cG5n'}))
  expect(await editedPromptContent([{type:'text',text:'old'},image],'new',read)).toEqual([{type:'text',text:'new'},{type:'image',mediaType:'image/png',data:'cG5n'}])
  expect(read).toHaveBeenCalledWith(image.attachment)
  await expect(editedPromptContent([{type:'unknown'}],'new',read)).rejects.toThrow()
 })
 it('checks busy state again after loading attachments and never forks on that race',async()=>{
  let busy=false;const fork=vi.fn()
  await expect(sendMessageRevision({isBusy:()=>busy,readImage:async()=>{busy=true;return{mediaType:'image/png',data:'cG5n'}},fork}, {seq:2,content:[{type:'image',attachment:{attachmentId:'a'}}],text:'new'})).rejects.toThrow(/处理/)
  expect(fork).not.toHaveBeenCalled()
 })
 it('resends edited text into the original session without creating or opening a branch',async()=>{
  const prompt=vi.fn(async()=>({ok:true})),open=vi.fn(),fork=vi.fn(async()=> 'child')
  await sendMessageRevision({sessionId:'original',isBusy:()=>false,fork,prompt,open},{seq:6,content:[{type:'text',text:'old'}],text:'new'})
  expect(fork).not.toHaveBeenCalled();expect(prompt).toHaveBeenCalledExactlyOnceWith('original',[{type:'text',text:'new'}]);expect(open).not.toHaveBeenCalled()
 })
 it('does not replay a submission when its outcome is unknown',async()=>{
  const prompt=vi.fn(async()=>{throw Error('transport')}),open=vi.fn()
  await expect(sendMessageRevision({sessionId:'original',isBusy:()=>false,fork:async()=> 'child',prompt,open},{seq:2,content:[{type:'text',text:'old'}],text:'new'})).rejects.toThrow(/未确认/)
  expect(prompt).toHaveBeenCalledTimes(1);expect(open).not.toHaveBeenCalled()
 })
 it('retries a definite rejection in the original session without losing edited text',async()=>{
  const fork=vi.fn(async()=> 'child'),prompt=vi.fn().mockResolvedValueOnce({ok:false,error:{code:'attachment-error',message:'图片不可用'}}).mockResolvedValueOnce({ok:true}),open=vi.fn()
  const api={sessionId:'original',isBusy:()=>false,fork,prompt,open},request={seq:2,content:[{type:'text',text:'old'}],text:'new'}
  await expect(sendMessageRevision(api,request)).rejects.toThrow('图片不可用');expect(open).not.toHaveBeenCalled()
  await sendMessageRevision(api,request);expect(fork).not.toHaveBeenCalled();expect(prompt).toHaveBeenCalledTimes(2);expect(prompt).toHaveBeenLastCalledWith('original',[{type:'text',text:'new'}])
 })
 it('uses the actual patched host boundary and rejects a busy source',async()=>{
  const source=patchMessageEditHost(await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js','utf8'))
  expect(patchMessageEditHost(source)).toBe(source)
  const start=source.indexOf('const events = source.events;',source.indexOf('async fork(request)')),end=source.indexOf('let workspace;',start)
  const cut=new Function('source','beforeMessageSeq','ctx','messageEditCut','noteForkBoundary','const atSeq=undefined,sessionId="source",request={};const err=(_,error)=>({error});'+source.slice(start,end)+'return source.events.slice(0,cut);')
  const idle={agents:{get:()=>({status:'idle',inbox:{nextTurn:[],nextStep:[]}})}}
  expect(cut({events},2,idle,messageEditCut,noteForkBoundary).map(e=>e.seq)).toEqual([0])
  expect(cut({events},6,idle,messageEditCut,noteForkBoundary).map(e=>e.seq)).toEqual([0,1,2,3,4])
  const busy={agents:{get:()=>({status:'running'})}}
  expect(cut({events},6,busy,messageEditCut,noteForkBoundary).error.code).toBe('fork-unavailable')
  const runtime=patchMessageEditRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'))
  expect(patchMessageEditRuntime(runtime)).toBe(runtime)
  expect(runtime.match(/beforeMessageSeq: opts.beforeMessageSeq/g)).toHaveLength(2)
 })
})
