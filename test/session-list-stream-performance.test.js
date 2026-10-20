import { readFile } from 'node:fs/promises'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isVariableDeclaration } from 'typescript'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { patchSessionListStreamPerformance } from '../scripts/lib/session-list-stream-performance.mjs'

const native = await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
function fixture(flattenLineage = values => values) {
  const source = patchSessionListStreamPerformance(native), syntax = createSourceFile('runtime.js',source,ScriptTarget.Latest,false,ScriptKind.JS), classes = new Map()
  const visit = node => { if(isVariableDeclaration(node)&&['Notifier','SessionManager','ProjectionValueStore'].includes(node.name.getText(syntax)))classes.set(node.name.getText(syntax),node.initializer.getText(syntax));forEachChild(node,visit) }; visit(syntax)
  const microtasks = [], frames = []
  const {Notifier,SessionManager} = runInNewContext(`const Notifier=${classes.get('Notifier')};const ProjectionValueStore=${classes.get('ProjectionValueStore')};const SessionManager=${classes.get('SessionManager')};({Notifier,SessionManager})`,{queueMicrotask:fn=>microtasks.push(fn),requestAnimationFrame:fn=>frames.push(fn),flattenLineage})
  const manager=Object.create(SessionManager.prototype)
  Object.assign(manager,{summaries:[],projectionStores:new Map(),pendingInteractions:new Map(),completedNotifications:new Set(),entryCache:new Map(),itemsCache:[],addresses:new Map(),catalogs:new Map(),jobsBySession:new Map()})
  let rebuilds=0,notifications=0
  manager.notifier=new Notifier(()=>{rebuilds++;manager.listSnapshotCache=manager.buildListSnapshot()})
  manager.notifier.subscribe(()=>notifications++)
  const flush=queue=>{let count=0;while(queue.length){if(++count>1000)throw Error('notification loop');queue.shift()()}}
  return {manager,source,microtasks,frames,flush,counts:()=>({rebuilds,notifications})}
}

it('coalesces separately delivered streaming projections into a frame while retaining the latest value',()=>{
  const f=fixture();f.manager.summaries=[{sessionId:'child',title:'卡片'}]
  for(let n=0;n<200;n++){
    f.manager.handleMuxEnvelope({payload:{type:'session/projection',sessionId:'child',key:'title',value:'卡片 '+n,seq:n}})
    f.flush(f.microtasks)
  }
  expect(f.counts().rebuilds).toBe(0)
  f.flush(f.frames)
  expect(f.counts()).toEqual({rebuilds:1,notifications:1})
  expect(f.manager.getListSnapshot().items[0].title).toBe('卡片 199')
  // An urgent list state transition still preempts a pending frame.
  f.manager.handleMuxEnvelope({payload:{type:'session/projection',sessionId:'child',key:'title',value:'完成',seq:200}})
  f.manager.notifier.markDirty();f.flush(f.microtasks)
  expect(f.manager.getListSnapshot().items[0].title).toBe('完成')
  f.flush(f.frames);expect(f.counts().rebuilds).toBe(2)
})

it('prunes stale list entries in linear reads and preserves entry identities',()=>{
  let reads=0
  const f=fixture(values=>values.map(value=>{const {sessionId,...rest}=value;return {...rest,get sessionId(){reads++;return sessionId}}}))
  f.manager.summaries=Array.from({length:500},(_,n)=>({sessionId:'s'+n,title:'会话'+n}))
  const initial=f.manager.buildListSnapshot()
  f.manager.entryCache.set('removed',{sessionId:'removed'});reads=0
  const next=f.manager.buildListSnapshot()
  expect(reads).toBeLessThan(500*10)
  expect(f.manager.entryCache.has('removed')).toBe(false)
  expect(next.items).toBe(initial.items)
  expect(next.items[250]).toBe(initial.items[250])
})

it('is idempotent and fails on a drifted projection seam',()=>{
  const source=patchSessionListStreamPerformance(native)
  expect(patchSessionListStreamPerformance(source)).toBe(source)
  expect(()=>patchSessionListStreamPerformance('not the client runtime')).toThrow()
})
