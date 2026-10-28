import {expect,it,vi} from 'vitest'
import {createComponentDataStatusStore} from '../scripts/lib/component-data-status.mjs'

it('isolates native status and subscriptions by the actual host surface for identical session and node IDs',()=>{
 const store=createComponentDataStatusStore(),research=vi.fn(),notes=vi.fn(),conversation=vi.fn()
 store.subscribe('same','node',research);store.subscribe('same','node',notes,'notes');store.subscribe('same','node',conversation,'conversation')
 store.publishNative('same','node',{status:'success',lastSuccess:10})
 expect(store.read('same','node','notes')).toBeNull();expect(store.read('same','node','conversation')).toBeNull()
 store.publishNative('same','node',{status:'error',lastSuccess:20},'notes')
 store.publishNative('same','node',{status:'idle',lastSuccess:30},'conversation')
 expect(store.read('same','node').status).toBe('success');expect(store.read('same','node','notes').status).toBe('error');expect(store.read('same','node','conversation').status).toBe('idle')
 expect(research).toHaveBeenCalledOnce();expect(notes).toHaveBeenCalledOnce();expect(conversation).toHaveBeenCalledOnce()
 store.clearNative('same','node','notes')
 expect(store.read('same','node','notes')).toBeNull();expect(store.read('same','node').status).toBe('success');expect(store.read('same','node','conversation').status).toBe('idle')
 expect(research).toHaveBeenCalledOnce();expect(notes).toHaveBeenCalledTimes(2);expect(conversation).toHaveBeenCalledOnce()
})

it('never falls back to a canvas binding or publishes foreign native status into the canvas summary',()=>{
 const store=createComponentDataStatusStore()
 store.publish('same',[{nodeId:'node',status:'success',lastSuccess:1}])
 const summary=store.snapshotSession('same')
 store.publishNative('same','node',{status:'error',lastSuccess:2},'notes')
 store.publishNative('same','node',{status:'idle',lastSuccess:3},'conversation')
 expect(store.snapshotSession('same')).toBe(summary);expect(store.read('same','node').status).toBe('success')
 store.clear('same')
 expect(store.read('same','node','notes').status).toBe('error');expect(store.read('same','node','conversation').status).toBe('idle')
 store.clearNative('same','node','notes');expect(store.read('same','node','notes')).toBeNull()
 store.publishNative('same','node',{status:'error'},'unknown');expect(store.read('same','node','unknown')).toBeNull()
})

it('isolates real backend binding rows by surface and preserves native priority without changing the canvas summary',()=>{
 const store=createComponentDataStatusStore(),notes=vi.fn(),research=vi.fn();store.subscribe('same','node',research);store.subscribe('same','node',notes,'notes')
 store.publish('same',[{nodeId:'node',status:'success',lastSuccess:1}]);const summary=store.snapshotSession('same')
 store.publish('same',[{nodeId:'node',status:'error',lastSuccess:2}],'notes');expect(store.read('same','node','notes').status).toBe('error');expect(store.read('same','node').status).toBe('success');expect(store.snapshotSession('same')).toBe(summary);expect(notes).toHaveBeenCalledOnce();expect(research).toHaveBeenCalledOnce()
 store.publishNative('same','node',{status:'refreshing'},'notes');expect(store.read('same','node','notes').status).toBe('refreshing');store.clearNative('same','node','notes');expect(store.read('same','node','notes').status).toBe('error')
 store.suspend('same','notes');store.clear('same','notes');expect(store.read('same','node','notes')).toBeNull();expect(store.read('same','node').status).toBe('success');expect(store.snapshotSession('same')).toBe(summary)
})
