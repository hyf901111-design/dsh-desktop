import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'
import {createPptxAnnotationShellBinding,annotationLocatorKey} from '../scripts/lib/pptx-annotation-input.mjs'

async function nativeShell(){
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const load=async(name,dependencies={})=>{let descriptor;runInNewContext(await readFile('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),{window:{__ModuleLoader__:{load:value=>descriptor=value}},AbortController,AbortSignal,queueMicrotask,setTimeout,clearTimeout,console,crypto});return descriptor.factory(id=>dependencies[id]??fake)}
 const runtime=await load('dsh-client-runtime'),native=await load('dsh-client-ui-conversation',{'@deepseek-ai/dsh-client-runtime/client':runtime})
 return new native.SessionInputShell({actx:{},defaultSink(){}})
}
const locator=id=>({version:1,sessionId:'actual-session',documentId:'a'.repeat(64),fileVersion:'b'.repeat(64),markId:id})
const reference=id=>({source:'pptx-annotation',ref:JSON.stringify(locator(id)),label:'#'+id,clipboardText:'标注 '+id})
it('inserts two native references and explicitly owned remarks while preserving the global text and foreign file/skill refs',async()=>{
 const shell=await nativeShell();shell.setDraft('整体要求📌：保留品牌');shell.insertReference({source:'chat-file',ref:'file',label:'附件',clipboardText:'附件'},{start:0,end:0,draftRev:shell.snapshot.draftRev});shell.insertReference({source:'ework-managed-skill',ref:'existing-skill',label:'原技能',clipboardText:'原技能'},{start:0,end:0,draftRev:shell.snapshot.draftRev})
 const before=shell.snapshot.draft,changes=[],binding=createPptxAnnotationShellBinding(shell,{onComments:value=>changes.push(...value)})
 binding.insert(reference('1'),'第一页\n调整📈图');binding.insert(reference('2'),'第二页意见')
 expect(shell.snapshot.occurrences.map(value=>value.source)).toEqual(['ework-managed-skill','chat-file','pptx-annotation','pptx-annotation'])
 expect(shell.snapshot.draft.startsWith(before)).toBe(true);expect(binding.ranges().map(value=>shell.snapshot.draft.slice(value.start,value.end))).toEqual(['第一页\n调整📈图','第二页意见'])
 binding.dispose()
})
it('deletes the selected tag and only its owned block in one native undo/redo transaction',async()=>{
 const shell=await nativeShell();shell.setDraft('原整体要求');const binding=createPptxAnnotationShellBinding(shell)
 binding.insert(reference('1'),'意见不能孤立发送');const full=shell.snapshot.draft,range=binding.ranges()[0]
 shell.setDraft(full.slice(0,range.tagOffset)+full.slice(range.tagOffset+1),{start:range.tagOffset,end:range.tagOffset+1,insertedLength:0})
 expect(shell.snapshot.draft).toBe('原整体要求');expect(shell.snapshot.occurrences).toHaveLength(0)
 shell.undo();expect(shell.snapshot.draft).toBe(full);expect(shell.snapshot.occurrences).toHaveLength(1);expect(binding.ranges()[0].comment).toBe('意见不能孤立发送')
 shell.redo();expect(shell.snapshot.draft).toBe('原整体要求');binding.dispose()
})
it('keeps one native undo unit for inserting a pin and its remark',async()=>{
 const shell=await nativeShell();shell.setDraft('整体');const binding=createPptxAnnotationShellBinding(shell)
 binding.insert(reference('1'),'正文');shell.undo();expect(shell.snapshot.draft).toBe('整体');expect(shell.snapshot.occurrences).toHaveLength(0);binding.dispose()
})
it('synchronizes real UTF16 edits both directions and preserves later overall instructions',async()=>{
 const shell=await nativeShell(),changes=[];shell.setDraft('整体');const binding=createPptxAnnotationShellBinding(shell,{onComments:value=>changes.push(...value)})
 binding.insert(reference('1'),'原📈\n意见');let range=binding.ranges()[0]
 binding.setSelection({start:range.start,end:range.end});shell.insertText('新中文\n意见',{start:range.start,end:range.end,draftRev:shell.snapshot.draftRev})
 expect(changes.at(-1)).toEqual({key:annotationLocatorKey(locator('1')),comment:'新中文\n意见'})
 shell.setDraft(shell.snapshot.draft+'用户追加整体');binding.update(annotationLocatorKey(locator('1')),'右侧修改')
 expect(shell.snapshot.draft).toContain('右侧修改');expect(shell.snapshot.draft.endsWith('用户追加整体')).toBe(true);binding.dispose()
})
it('retains ambiguous cross-range edits verbatim and stops automatic remark writeback',async()=>{
 const shell=await nativeShell(),changes=[];const binding=createPptxAnnotationShellBinding(shell,{onComments:value=>changes.push(...value)})
 binding.insert(reference('1'),'旧备注');const range=binding.ranges()[0],draft=shell.snapshot.draft
 const next=draft.slice(0,range.start-1)+'用户跨边界文本'+draft.slice(range.end+1);shell.setDraft(next)
 expect(shell.snapshot.draft).toBe(next);expect(binding.ranges()).toEqual([]);expect(changes).toEqual([]);binding.dispose()
})
it('does not persist intermediate IME remarks and restores native shell methods on disposal',async()=>{
 const shell=await nativeShell(),changes=[],original=shell.setDraft;let composing=false
 const binding=createPptxAnnotationShellBinding(shell,{onComments:value=>changes.push(...value),isComposing:()=>composing})
 binding.insert(reference('1'),'');let range=binding.ranges()[0];composing=true;binding.setSelection({start:range.start,end:range.end})
 shell.insertText('zhong',{start:range.start,end:range.end,draftRev:shell.snapshot.draftRev});expect(changes).toEqual([])
 range=binding.ranges()[0];binding.setSelection({start:range.start,end:range.end});shell.insertText('中文',{start:range.start,end:range.end,draftRev:shell.snapshot.draftRev});composing=false;binding.flush()
 expect(changes.at(-1).comment).toBe('中文');binding.dispose();expect(shell.setDraft).toBe(original)
})
