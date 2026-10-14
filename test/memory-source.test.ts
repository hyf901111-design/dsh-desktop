import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
it('locates an exact event rather than the first repeated excerpt and fails for changed source',async()=>{
  const {waitForMemorySource}=await import('../src/preload/memory/source').catch(()=>({waitForMemorySource:undefined}))
  expect(waitForMemorySource).toBeTypeOf('function')
  const window=new Window(),doc=window.document as unknown as Document
  doc.body.innerHTML='<div data-event-seq="2">相同原文</div><div data-event-seq="7">相同原文</div>'
  const source={kind:'conversation' as const,sessionId:'a',seq:7,title:'来源',excerpt:'相同原文',createdAt:1}
  let current='b'
  const promise=waitForMemorySource!(doc,source,()=>current,{attempts:3,intervalMs:1})
  current='a';expect(await promise).toBe(doc.querySelector('[data-event-seq="7"]'))
  expect(await waitForMemorySource!(doc,{...source,excerpt:'改后已不存在'},()=>current,{attempts:1})).toBeNull()
  await window.happyDOM.close()
})
it('requires the original note block and saved revision for note navigation',async()=>{
  const {waitForMemorySource}=await import('../src/preload/memory/source').catch(()=>({waitForMemorySource:undefined}))
  expect(waitForMemorySource).toBeTypeOf('function')
  const window=new Window(),doc=window.document as unknown as Document
  doc.body.innerHTML='<div data-note-source-session="a" data-note-source-revision="3"><div data-id="block-b">同一段文字</div></div>'
  const source={kind:'note' as const,sessionId:'a',noteId:'block-b',noteRevision:3,title:'笔记',excerpt:'同一段文字',createdAt:1}
  expect(await waitForMemorySource!(doc,source,()=> 'a',{attempts:1})).toBe(doc.querySelector('[data-id="block-b"]'))
  expect(await waitForMemorySource!(doc,{...source,noteRevision:2},()=> 'a',{attempts:1})).toBeNull()
  await window.happyDOM.close()
})
it('adds exact durable seq anchors to the installed user message renderer without changing its layout',async()=>{
  const {patchMemorySourceAnchors}=await import('../scripts/lib/memory-source-anchors.mjs').catch(()=>({patchMemorySourceAnchors:undefined}))
  expect(patchMemorySourceAnchors).toBeTypeOf('function')
  const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
  const patched=patchMemorySourceAnchors!(source)
  expect(patched).toContain('"data-event-seq": eventSeq')
  expect(patched).toContain('eventSeq: data.seq,')
  expect(patchMemorySourceAnchors!(patched)).toBe(patched)
})
