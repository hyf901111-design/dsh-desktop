import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { patchFigmaReadingConversation } from '../scripts/lib/figma-reading-client.mjs'
import { patchTaskProgressClient } from '../scripts/lib/task-progress-client.mjs'
// Match the real installer order instead of depending on the local SDK already
// having the continuation footer installed before this fixture is loaded.
const source=patchTaskProgressClient(patchFigmaReadingConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
const start=source.indexOf('function useOdysseyCompactTasks('),end=source.indexOf('function OdysseyTaskSheet(',start)
function fixture() {
 let compact=false,previousDeps:any[]|undefined,cleanup:any,effect:any,frameId=0
 const frames=new Map<number,()=>void>(),observers:any[]=[]
 let readingHeight=127,taskHeight=216,paneHeight=621,listHeight=196,continuationHeight=0
 const rect=(height:number)=>({height,width:780})
 const reading={getBoundingClientRect:()=>rect(readingHeight)},list={get scrollHeight(){return listHeight}},footer={}
 const continuation={getBoundingClientRect:()=>rect(continuationHeight)}
 const pane={clientHeight:paneHeight,getBoundingClientRect:()=>rect(paneHeight),matches:()=>false,querySelector:(selector:string)=>selector.includes('scrollBody')?reading:null}
 const root={getBoundingClientRect:()=>rect(taskHeight),querySelector:(selector:string)=>selector==='.lXshSW_list'?list:selector==='[data-task-continuation]'&&continuationHeight>0?continuation:null,closest:(selector:string)=>selector.includes('.wSkVaW_root')?pane:footer}
 const ref:{current:any}={current:null}
 const react={useState:()=>[compact,(value:any)=>{compact=typeof value==='function'?value(compact):value}],useLayoutEffect:(fn:any,deps?:any[])=>{const changed=deps===undefined||previousDeps===undefined||deps.some((v,i)=>v!==previousDeps?.[i]);if(changed)effect=()=>{cleanup?.();cleanup=fn();previousDeps=deps}}}
 class ResizeObserver {callback:any;targets:any[]=[];active=true;constructor(callback:any){this.callback=callback;observers.push(this)}observe(target:any){this.targets.push(target)}disconnect(){this.active=false}}
 const context={react,ResizeObserver,requestAnimationFrame:(callback:()=>void)=>{frames.set(++frameId,callback);return frameId},cancelAnimationFrame:(id:number)=>frames.delete(id)}
 const hook=runInNewContext(source.slice(start,end)+';useOdysseyCompactTasks',context)
 const render=()=>{effect=undefined;hook(ref);effect?.()}
 const resize=()=>{observers.filter(o=>o.active).forEach(o=>o.callback());const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn())}
 return {ref,root,reading,footer,list,pane,observers,render,resize,frames,get compact(){return compact},setGeometry:(reading:number,task:number,pane=621,rows=196)=>{readingHeight=reading;taskHeight=task;paneHeight=pane;listHeight=rows},setContinuationHeight:(height:number)=>{continuationHeight=height},cleanup:()=>cleanup?.()}
}
it('attaches after an initially empty todo render and observes the actual reading/footer budget',()=>{
 const f=fixture();f.render();expect(f.observers).toHaveLength(0)
 f.ref.current=f.root;f.render()
 expect(f.observers).toHaveLength(1)
 expect(f.observers[0].targets).toContain(f.reading)
 expect(f.observers[0].targets).toContain(f.footer)
 expect(f.compact).toBe(true)
 f.cleanup();expect(f.observers[0].active).toBe(false)
})
it('keeps at least 240px when input grows and never oscillates across collapse animation frames',()=>{
 const f=fixture();f.ref.current=f.root
 f.setGeometry(252,216,710);f.render();expect(f.compact).toBe(false)
 // 34px of new textarea height with no window resize consumes the reading budget.
 f.setGeometry(218,216,710);f.resize();expect(f.compact).toBe(true)
 for(const task of [180,128,70,40]) {f.setGeometry(218+216-task,task,710);f.resize();expect(f.compact).toBe(true)}
 expect(218+176).toBeGreaterThanOrEqual(240)
 f.setGeometry(428,40,744);f.resize();expect(f.compact).toBe(false)
 for(const task of [76,160,216]) {f.setGeometry(428+40-task,task,744);f.resize();expect(f.compact).toBe(false)}
 f.cleanup()
})
it('uses actual task natural height and cancels pending resize work on unmount',()=>{
 const f=fixture();f.ref.current=f.root
 // A one-row card needs 76px, so a pane below the old 740px threshold can keep it open.
 f.setGeometry(260,76,621,28);f.render();expect(f.compact).toBe(false)
 f.observers[0].callback();expect(f.frames.size).toBe(1)
 f.cleanup();expect(f.frames.size).toBe(0)
})
it('reserves the actual continuation footer height and releases it when the action disappears',()=>{
 const f=fixture();f.ref.current=f.root
 f.setGeometry(260,76,621,28);f.render();expect(f.compact).toBe(false)
 // The 40px action consumes the same 40px of reading space. Omitting it from
 // the measured expanded budget would incorrectly keep the card unfolded.
 f.setContinuationHeight(40);f.setGeometry(220,116,621,28);f.resize()
 expect(f.compact).toBe(true)
 f.setContinuationHeight(0);f.setGeometry(260,76,621,28);f.resize()
 expect(f.compact).toBe(false)
 expect(f.observers[0].targets).toContain(f.footer)
 f.cleanup()
})
