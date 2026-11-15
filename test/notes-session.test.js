import { expect, it, vi } from 'vitest'
import { installNoteSessionTitles, patchNoteSessionClient, patchNoteSessionRuntime, patchNoteSessionHost, patchNoteSessionCatalog } from '../scripts/lib/notes-session.mjs'
import { patchStandardModeClient, patchStandardModeRuntime } from '../scripts/lib/standard-mode-only.mjs'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session, KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { PersistenceCoordinator } from '@deepseek-ai/dsh-session-persistence'
import { runInNewContext } from 'node:vm'
import {engageNoteSession} from '../packages/dsh-research-task-runtime/notes-session.js'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isFunctionDeclaration} from 'typescript'

function fixture(events=[]) {
  const session={id:'s',events,append(type,data){this.events.push({type,data,seq:this.events.length,time:Date.now()})}}
  const rename=vi.fn((s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}})
  return {session,rename,ctx:{sessions:{get:id=>id==='s'?session:undefined},sessionTitle:{rename}}}
}
it('durably records note participation and follows its title after native event replay',()=>{
  const f=fixture();engageNoteSession(f.ctx,{sessionId:'s',title:''});expect(f.rename).toHaveBeenCalledWith(f.session,'新笔记')
  const reopened=fixture(JSON.parse(JSON.stringify(f.session.events)))
  engageNoteSession(reopened.ctx,{sessionId:'s',title:'每周研究笔记'})
  expect(reopened.rename).toHaveBeenCalledWith(reopened.session,'每周研究笔记')
  expect(reopened.session.events.findLast(e=>e.type==='workspace-note/edited').data.automatic).toBe(true)
})
it('preserves existing names and manual renames, including a manual rename to the same text',()=>{
  const f=fixture([{type:'session/title',seq:0,data:{title:'既有会话名'}}]);engageNoteSession(f.ctx,{sessionId:'s',title:'文档标题'});expect(f.rename).not.toHaveBeenCalled()
  const owned=fixture();engageNoteSession(owned.ctx,{sessionId:'s',title:'笔记标题'});owned.session.append('session/title',{title:'笔记标题',source:{kind:'user'}})
  engageNoteSession(owned.ctx,{sessionId:'s',title:'新文档标题'});expect(owned.rename).toHaveBeenCalledTimes(1)
  expect(owned.session.events.findLast(e=>e.type==='workspace-note/edited').data.automatic).toBe(false)
})
it('optimistically retains only known current-account sessions before the durable reply',()=>{
  const doc=new EventTarget(),retain=vi.fn(),sessions={list:{getSnapshot:()=>({byId:{s:{}}})},retainNoteSession:retain};const dispose=installNoteSessionTitles(sessions,doc)
  doc.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId:'s'}}));doc.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId:'foreign'}}));expect(retain.mock.calls).toEqual([['s']]);dispose()
})
it('the real native host classifies replayed note and knowledge-copy events as non-blank',async()=>{
  const source=patchNoteSessionHost(await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js','utf8'))
  const syntax=createSourceFile('host.js',source,ScriptTarget.Latest,false,ScriptKind.JS),functions=new Map();const visit=node=>{if(isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(syntax));forEachChild(node,visit)};visit(syntax)
  const api=runInNewContext(['sessionBlank','applySessionListMetadata','sessionListMetadata'].map(name=>functions.get(name)).join('\n')+';({sessionBlank,sessionListMetadata})')
  const f=fixture();engageNoteSession(f.ctx,{sessionId:'s',title:'笔记'});const replay=JSON.parse(JSON.stringify(f.session.events))
  expect(api.sessionBlank({events:replay})).toBe(false);expect(api.sessionListMetadata(replay).blank).toBe(false);expect(replay.some(e=>e.type==='turn/start')).toBe(false)
  const copy = [{ type: 'workspace-knowledge/copied', data: {} }]
  expect(api.sessionBlank({ events: copy })).toBe(false)
  expect(api.sessionListMetadata(copy).blank).toBe(false)
  expect(api.sessionBlank({events:[{type:'session/title',data:{title:'临时会话'}}]})).toBe(true);expect(patchNoteSessionHost(source)).toBe(source)
})
it('writes real Session events and reloads through the native persistence reader', async () => {
  expect(KNOWN_SESSION_EVENT_TYPES.has('workspace-note/edited')).toBe(true)
  expect(KNOWN_SESSION_EVENT_TYPES.has('workspace-knowledge/copied')).toBe(true)
  for (const path of ['lib/index.js','lib/types/known-event-types.js']) {
    const source = await readFile('node_modules/@deepseek-ai/dsh-session/' + path, 'utf8')
    expect(patchNoteSessionCatalog(source)).toBe(source)
  }
  const dir = await mkdtemp(join(tmpdir(), 'ework-note-persistence-')), file = join(dir, 'session.json')
  const ctx = { effect:()=>{}, on:()=>{}, sessions:{list:()=>[], get:()=>undefined, prepare:(id, options)=>Session.fromRestore(id, options.seed, options.meta)} }
  const backend = { name:'note-test-disk', loadStored:async()=>{try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return undefined;throw e}}, appendBatch:async(meta, events, materialized)=>{const old=materialized?await backend.loadStored():{events:[]};await writeFile(file,JSON.stringify({meta,events:[...old.events,...events],revision:'r1'}))}, readStoredRevision:async()=> 'r1' }
  try {
    const session = Session.create('note-test')
    const titleService = {rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
    engageNoteSession({sessions:{get:()=>session},sessionTitle:titleService},{sessionId:session.id,title:'重启前标题'})
    const writer = new PersistenceCoordinator(ctx,backend)
    await writer.create(session.header); await writer.append(session.id,session.events)
    const reader = new PersistenceCoordinator(ctx,backend), stored = await reader.load(session.id)
    const restored = Session.fromRestore(session.id,structuredClone(stored.events),structuredClone(stored.meta))
    engageNoteSession({sessions:{get:()=>restored},sessionTitle:titleService},{sessionId:restored.id,title:'重启后标题'})
    expect(restored.events.findLast(e=>e.type==='session/title').data.title).toBe('重启后标题')
    expect(restored.events.some(e=>e.type==='turn/start')).toBe(false)
    const bad = {...await backend.loadStored(),events:[{seq:0,time:0,type:'unknown/required',data:{}}]}
    await writeFile(file,JSON.stringify(bad))
    await expect(new PersistenceCoordinator(ctx,backend).load(session.id)).rejects.toThrow('unknown/required')
  } finally { await rm(dir,{recursive:true,force:true}) }
})
it('patches the native note title and retention seams idempotently', async () => {
  const client = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'), runtime = await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js', 'utf8')
  const patched = patchNoteSessionClient(client), retained = patchNoteSessionRuntime(runtime)
  expect(patchNoteSessionClient(patched)).toBe(patched); expect(patchNoteSessionRuntime(retained)).toBe(retained)
  expect(patched).toContain("notes:'新笔记'"); expect(patched).toContain("notes:'New Note'")
})
it('uses Standard as the native default even if the saved preference was Build', async () => {
  const source = patchStandardModeClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js', 'utf8'))
  const functionSource = source.slice(source.indexOf('async function normalizeStandardPresetRoster('), source.indexOf('\n\t\t/**', source.indexOf('async function normalizeStandardPresetRoster(')))
  const write = vi.fn(async () => undefined), normalize = runInNewContext(functionSource + ';normalizeStandardPresetRoster', { writeDefaultPreset: write })
  const result = await normalize({}, { presets: [{ id: 'standard' }, { id: 'build', isDefault: true }] })
  expect(result.roster.presets.map(p => p.id)).toEqual(['standard']); expect(write).toHaveBeenCalledWith({}, 'standard')
  expect(patchStandardModeClient(source)).toBe(source)
  const runtime = patchStandardModeRuntime(await readFile('node_modules/@deepseek-ai/dsh-agent-presets/lib/index.js', 'utf8'))
  expect(patchStandardModeRuntime(runtime)).toBe(runtime)
})

it('replays note requests, reasoning and adoption in the native session without agent turn collisions',async()=>{
 const {recordNoteConversation,noteConversationRows,sharedNoteConversationContext,registerNoteConversationContext}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('conversation-test')
 session.append('user/message',{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'先讨论本周报告'}]},{surfaceOp:'append'})
 const first=recordNoteConversation(session,{requestId:'r',phase:'preparing',prompt:'根据讨论撰写报告'})
 recordNoteConversation(session,{requestId:'r',phase:'ready',reasoning:'真实模型思考',result:{kind:'text',markdown:'本周报告正文'},finishedAt:1000})
 recordNoteConversation(session,{requestId:'r',phase:'accepted',finishedAt:2000})
 const replay=Session.fromRestore(session.id,structuredClone(session.events),structuredClone(session.header))
 expect(noteConversationRows(replay)).toMatchObject([{requestId:'r',phase:'accepted',seq:first.seq,finishedAt:1000,reasoning:'真实模型思考',result:{markdown:'本周报告正文'}}])
 expect(sharedNoteConversationContext(replay).map(r=>r.role)).toEqual(['user','note'])
 let context;registerNoteConversationContext({systemPrompt:{context:value=>{context=value;return()=>{}}}})
 expect(context.text({agent:{session:replay}})).toContain('本周报告正文');expect(context.text({agent:{session:Session.create('other')}})).toBe('')
 expect(session.events.some(e=>e.type==='turn/start')).toBe(false)
})

it('stops abandoned requests on replay while keeping the actual live request running',async()=>{
 const {recordNoteConversation,noteConversationRows,setNoteConversationRunning}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('interrupted-note');setNoteConversationRunning(session,'live',true);recordNoteConversation(session,{requestId:'live',phase:'preparing',prompt:'任务'})
 expect(noteConversationRows(session)[0].phase).toBe('preparing')
 const replay=Session.fromRestore(session.id,structuredClone(session.events),structuredClone(session.header));expect(noteConversationRows(replay)[0].phase).toBe('stopped')
 setNoteConversationRunning(session,'live',false);expect(noteConversationRows(session)[0].phase).toBe('stopped')
})

it('restores conversation replies as shared context without treating them as unadopted document content',async()=>{
 const {recordNoteConversation,noteConversationRows,sharedNoteConversationContext,registerNoteConversationContext}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('clarification-replay');recordNoteConversation(session,{requestId:'r',phase:'preparing',prompt:'写一篇文章'});recordNoteConversation(session,{requestId:'r',phase:'replied',reasoning:'需要确定主题。',result:{kind:'conversation',markdown:'文章主题是什么？'},finishedAt:1000})
 const replay=Session.fromRestore(session.id,structuredClone(session.events),structuredClone(session.header));expect(noteConversationRows(replay)[0]).toMatchObject({phase:'replied',result:{kind:'conversation'},finishedAt:1000})
 expect(sharedNoteConversationContext(replay)[0]).toMatchObject({reply:'文章主题是什么？'});expect(sharedNoteConversationContext(replay)[0]).not.toHaveProperty('suggestion')
 let context;registerNoteConversationContext({systemPrompt:{context:value=>{context=value;return()=>{}}}});expect(context.text({agent:{session:replay}})).toContain('文章主题是什么？');expect(context.text({agent:{session:replay}})).toContain('replied 是对话回复')
})
