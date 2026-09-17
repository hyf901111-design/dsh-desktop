import { expect,it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { patchSidebarFileRefresh } from '../scripts/lib/sidebar-file-refresh.mjs'
it('refreshes newly created files and rejects stale responses after switching scope',async()=>{
 const fixture='function FileTree(props) {\n\t\t\tconst loadDir = (0, react.useCallback)((dir) => {oldLoader()});\n\t\t\t/** Copy `text`; */\n}'
 const out=patchSidebarFileRefresh(fixture)
 expect(patchSidebarFileRefresh(out)).toBe(out)
 let effect,tick,rows={},requests=[]
 runInNewContext(out+';FileTree({})',{
  react:{useEffect:fn=>{effect=fn}},cwd:'/project',sessionId:'one',expanded:[],refreshTick:0,
  storeLevel:(dir,level)=>rows[dir]=level,dataRef:{current:rows},AbortController,
  document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  window:{setInterval(fn){tick=fn;return 1},clearInterval(){},addEventListener(){},removeEventListener(){}},
  api:{fsTree(scope,dir,signal){return new Promise(resolve=>requests.push({scope,dir,signal,resolve}))}}
 })
 const cleanup=effect()
 requests[0].resolve({entries:[]});await new Promise(r=>setTimeout(r,0))
 tick();requests[1].resolve({entries:[{name:'outputs',isDir:true}]});await new Promise(r=>setTimeout(r,0))
 expect(rows['/project'].entries[0].name).toBe('outputs')
 tick();const stale=requests[2];cleanup();expect(stale.signal.aborted).toBe(true)
 stale.resolve({entries:[]});await new Promise(r=>setTimeout(r,0))
 expect(rows['/project'].entries).toHaveLength(1)
})
it('reports manual refresh completion only after all open directories settle, including errors',async()=>{
 const fixture='function FileTree(props) {\n\t\t\tconst loadDir = (0, react.useCallback)((dir) => {oldLoader()});\n\t\t\t/** Copy `text`; */\n}'
 let effect,requests=[],completed=[]
 runInNewContext(patchSidebarFileRefresh(fixture)+';FileTree({onRefreshComplete:result=>completed.push(result)})',{
  completed,react:{useEffect:fn=>{effect=fn}},cwd:'/project',sessionId:'one',expanded:['/project/sub'],refreshTick:1,
  storeLevel(){},dataRef:{current:{}},AbortController,
  document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  window:{setInterval(){return 1},clearInterval(){},addEventListener(){},removeEventListener(){}},
  api:{fsTree(){return new Promise((resolve,reject)=>requests.push({resolve,reject}))}}
 })
 const cleanup=effect()
 requests[0].resolve({entries:[]});await new Promise(r=>setTimeout(r,0));expect(completed).toEqual([])
 requests[1].reject(Error('offline'));await new Promise(r=>setTimeout(r,0));expect(completed).toEqual([false]);cleanup()
})
