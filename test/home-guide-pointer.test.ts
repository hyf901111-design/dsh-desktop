import {readFileSync} from 'node:fs'
// @vitest-environment happy-dom
import {afterEach,expect,test,vi} from 'vitest'
import {createHomeGuidePointer,homeGuideTargetPoint} from '../src/preload/home-guide-pointer'
const releases:Array<()=>void>=[]
afterEach(()=>{for(const release of releases.splice(0))release();document.body.innerHTML='';delete document.documentElement.dataset.homeGuidePointerRun;vi.useRealTimers()})
function fixture(){
 vi.useFakeTimers();const abort=new AbortController(),target=document.createElement('button'),source=document.createElement('button');document.body.append(target,source)
 target.getBoundingClientRect=()=>({left:320,top:220,right:400,bottom:260,width:80,height:40,x:320,y:220,toJSON:()=>({})})
 source.getBoundingClientRect=()=>({left:80,top:100,right:100,bottom:120,width:20,height:20,x:80,y:100,toJSON:()=>({})})
 let gate:Promise<void>|undefined,resume:()=>void=()=>{}
 const pointer=createHomeGuidePointer(document,{runId:'run',signal:abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>gate??Promise.resolve()})
 releases.push(pointer.dispose);return{pointer,abort,target,source,pause:()=>{gate=new Promise(resolve=>{resume=()=>{gate=undefined;resolve()}})},resume:()=>resume()}
}
function financialFixture(){
 const f=fixture(),guide=document.createElement('section'),canvas=document.createElement('div')
 guide.dataset.homeGuide='run';guide.dataset.kind='board';canvas.dataset.researchCanvas='';canvas.dataset.eworkGrid='';canvas.style.setProperty('--fw-accent','#249bfa');canvas.style.overflow='hidden'
 canvas.getBoundingClientRect=()=>({left:20,top:40,right:760,bottom:600,width:740,height:560,x:20,y:40,toJSON:()=>({})})
 const port=(button:HTMLElement,id:string,side:string,widget:string)=>{const card=document.createElement('article'),content=document.createElement('section');card.dataset.researchNodeId=id;content.dataset.financialWidget=widget;button.dataset.financialPort=side;button.dataset.financialPortNode=id;content.append(button);card.append(content);canvas.append(card)}
 port(f.source,'watchlist-node','output','watchlist');port(f.target,'quote-node','input','quote');guide.append(canvas);document.body.append(guide)
 return{...f,guide,canvas,line:()=>document.querySelector<SVGSVGElement>('[data-home-guide-connection="run"]')}
}
test('can move through a menu without hovering intermediate rows',async()=>{
 const {pointer,source,target}=fixture(),adjacent=document.createElement('button')
 document.body.append(adjacent)
 const hit=vi.spyOn(document,'elementFromPoint').mockImplementation(x=>x<100?source:x<320?adjacent:target)
 const entered=vi.fn(),landed=vi.fn()
 adjacent.addEventListener('mouseover',entered)
 target.addEventListener('mouseover',landed)
 try{
  const start=pointer.perform({target:source,action:'move'})
  await vi.runAllTimersAsync();await start
  const choose=pointer.perform({target,action:'click',hover:'target'})
  await vi.runAllTimersAsync();await choose
  expect(entered).not.toHaveBeenCalled()
  expect(landed).toHaveBeenCalledOnce()
  expect(pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
 }finally{hit.mockRestore()}
})
test('targets the visible text fragment of a wrapped AI mark rather than its empty union center',()=>{
 const f=fixture(),mark=document.createElement('span');mark.dataset.bnThreadId='one';document.body.append(mark)
 const rect=(left:number,top:number,right:number,bottom:number)=>({left,top,right,bottom,width:right-left,height:bottom-top,x:left,y:top,toJSON:()=>({})})
 mark.getBoundingClientRect=()=>rect(100,100,400,160)
 mark.getClientRects=()=>[rect(100,100,400,120),rect(100,140,125,160)] as unknown as DOMRectList
 const hit=vi.spyOn(document,'elementFromPoint').mockImplementation((x,y)=>y<120?mark:document.body)
 try{expect(homeGuideTargetPoint(document,mark)).toEqual({x:112,y:110});expect(homeGuideTargetPoint(document,mark)).not.toEqual({x:250,y:130});hit.mockReturnValue(document.body);expect(()=>homeGuideTargetPoint(document,mark)).toThrow('文字标记')}finally{hit.mockRestore();mark.remove()}
})
test('publishes each optional drag frame after painting the same native pointer position',async()=>{
 const f=fixture(),frames:Array<{x:number;y:number;phase:string}>=[]
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source,onFrame:frame=>{
  expect(f.pointer.snapshot()).toMatchObject({x:frame.x,y:frame.y,state:frame.phase});frames.push(frame)
 }})
 void action.catch(()=>{})
 await vi.advanceTimersByTimeAsync(600)
 const midway=frames.filter(frame=>frame.phase==='dragging');expect(midway.length).toBeGreaterThan(1);expect(midway.at(-1)!.x).toBeGreaterThan(midway[0]!.x)
 f.pause();await vi.advanceTimersByTimeAsync(80);const count=frames.length;await vi.advanceTimersByTimeAsync(1000);expect(frames).toHaveLength(count)
 f.resume();await vi.runAllTimersAsync();await action;expect(frames.at(-1)).toMatchObject({x:360,y:240,phase:'idle'})
})
test('stops the optional drag frame hook after a rejection or abort without applying a real click',async()=>{
 const f=fixture(),click=vi.fn(),frames=vi.fn(()=>{throw Error('选区已变化。')});f.target.addEventListener('click',click)
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source,onFrame:frames}).catch(error=>error.message)
 await vi.runAllTimersAsync();expect(await action).toBe('选区已变化。');const count=frames.mock.calls.length;await vi.advanceTimersByTimeAsync(1000);expect(frames).toHaveBeenCalledTimes(count);expect(click).not.toHaveBeenCalled()
})
test('reports every Board drag frame to its native owner without drawing a second connection or mutating selection',async()=>{
 const f=financialFixture(),frames:Array<{x:number;y:number;phase:string}>=[],click=vi.fn();f.source.addEventListener('click',click);f.target.addEventListener('click',click)
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source,onFrame:frame=>frames.push(frame)})
 await vi.advanceTimersByTimeAsync(600);expect(f.line()).toBeNull();expect(frames.some(frame=>frame.phase==='pressed')).toBe(true);expect(frames.filter(frame=>frame.phase==='dragging').length).toBeGreaterThan(1)
 f.pause();await vi.advanceTimersByTimeAsync(80);const count=frames.length,cursor=f.pointer.snapshot();await vi.advanceTimersByTimeAsync(4000);expect(frames).toHaveLength(count);expect(f.pointer.snapshot()).toEqual(cursor)
 f.resume();await vi.runAllTimersAsync();await action;expect(f.line()).toBeNull();expect(click).not.toHaveBeenCalled();expect(frames.at(-1)).toMatchObject({x:360,y:240,phase:'idle'});expect(frames.some(frame=>frame.phase==='released')).toBe(true)
})
test.each(['abort','dispose','source-removal','target-removal','canvas-change','run-change','disabled'])('stops Board progress on %s before its native owner can commit',async reason=>{
 const f=financialFixture(),frames=vi.fn(),action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source,onFrame:frames}),result=action.catch(error=>error.name)
 await vi.advanceTimersByTimeAsync(600)
 if(reason==='abort')f.abort.abort();else if(reason==='dispose')f.pointer.dispose();else if(reason==='source-removal')f.source.remove();else if(reason==='target-removal')f.target.remove();else if(reason==='run-change')document.documentElement.dataset.homeGuidePointerRun='new-run';else if(reason==='disabled')f.source.disabled=true;else{const canvas=document.createElement('div');canvas.dataset.researchCanvas='';document.body.append(canvas);canvas.append(f.target)}
 await vi.runAllTimersAsync();expect(await result).toMatch(/AbortError|Error/);expect(f.line()).toBeNull();expect(frames.mock.calls.some(([frame])=>frame.phase==='released')).toBe(false)
})
test('moves a DOM arrow then acknowledges its click without clicking or focusing the target',async()=>{
 const f=fixture(),click=vi.fn();f.target.addEventListener('click',click);let finished=false
 const action=f.pointer.perform({target:f.target,action:'click'}).then(()=>{finished=true})
 await vi.advanceTimersByTimeAsync(80);expect(finished).toBe(false);expect(document.querySelector('[data-home-guide-pointer]')?.getAttribute('aria-hidden')).toBe('true');expect(document.activeElement).not.toBe(f.target)
 await vi.runAllTimersAsync();await action;expect(finished).toBe(true);expect(click).not.toHaveBeenCalled();expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('paces a shared control approach and click about thirty percent slower without adding actor sleeps',async()=>{
 const f=fixture(),started=Date.now(),phases=new Map<string,number>()
 const action=f.pointer.perform({target:f.target,action:'click',onFrame:frame=>{if(!phases.has(frame.phase))phases.set(frame.phase,Date.now()-started)}})
 await vi.runAllTimersAsync();await action
 const moving=phases.get('pressed')!,pressed=phases.get('released')!-moving,released=phases.get('idle')!-phases.get('released')!
 expect(moving).toBeGreaterThanOrEqual(330);expect(moving).toBeLessThanOrEqual(380)
 expect(pressed).toBeGreaterThanOrEqual(100);expect(pressed).toBeLessThanOrEqual(110)
 expect(released).toBeGreaterThanOrEqual(200);expect(released).toBeLessThanOrEqual(215)
 expect(Date.now()-started).toBeGreaterThanOrEqual(650);expect(Date.now()-started).toBeLessThanOrEqual(710)
})
test('slows the whole precision drag on the same playing clock while keeping its exact endpoints',async()=>{
 const f=fixture(),started=Date.now(),action=f.pointer.perform({target:f.target,fromTarget:f.source,action:'drag'})
 await vi.runAllTimersAsync();await action
 expect(Date.now()-started).toBeGreaterThanOrEqual(1660);expect(Date.now()-started).toBeLessThanOrEqual(1780)
 expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('retains an immediate reduced-motion acknowledgement instead of adding the slower visual clock',async()=>{
 const f=fixture(),media=vi.spyOn(window,'matchMedia').mockReturnValue({matches:true} as MediaQueryList),started=Date.now()
 try{
  const action=f.pointer.perform({target:f.target,action:'click'});await vi.runAllTimersAsync();await action
  expect(Date.now()-started).toBeLessThan(16);expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
 }finally{media.mockRestore()}
})
test('approaches controls along a small smooth arc with slower endpoints while keeping precision drags on their selected path',async()=>{
 const f=fixture(),first=f.pointer.perform({target:f.source,action:'move'});await vi.runAllTimersAsync();await first
 const frames:Array<{x:number;y:number;phase:string}>=[],move=f.pointer.perform({target:f.target,action:'move',onFrame:frame=>frames.push(frame)})
 await vi.runAllTimersAsync();await move
 const moving=frames.filter(frame=>frame.phase==='moving'),offset=(p:{x:number;y:number})=>Math.abs((p.x-90)*130-(p.y-110)*270)/Math.hypot(270,130)
 expect(Math.max(...moving.map(offset))).toBeGreaterThan(2);expect(Math.max(...moving.map(offset))).toBeLessThan(14)
 const speeds=moving.slice(1).map((p,i)=>Math.hypot(p.x-moving[i]!.x,p.y-moving[i]!.y));expect(Math.max(...speeds)).toBeGreaterThan(speeds[0]!*5);expect(Math.max(...speeds)).toBeGreaterThan(speeds.at(-1)!*5);expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
 const dragFrames:Array<{x:number;y:number;phase:string}>=[],drag=f.pointer.perform({target:f.target,fromTarget:f.source,action:'drag',onFrame:frame=>dragFrames.push(frame)})
 await vi.runAllTimersAsync();await drag;expect(Math.max(...dragFrames.filter(frame=>frame.phase==='dragging').map(offset))).toBeLessThan(.01)
})
test('carries an owned PDF tile with the virtual pointer before the drop is acknowledged',async()=>{
 const f=fixture();f.source.dataset.homeGuideDragFile='run'
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source})
 await vi.advanceTimersByTimeAsync(600)
 const first=f.source.style.transform
 expect(first).toContain('translate3d');expect(first).not.toBe('translate3d(0px,0px,0)')
 await vi.advanceTimersByTimeAsync(100);expect(f.source.style.transform).not.toBe(first)
 await vi.runAllTimersAsync();await action
 expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
 expect(f.source.isConnected).toBe(true)
})
test('pauses mid-travel and only finishes the same action after resume',async()=>{
 const f=fixture();let finished=false;const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source}).then(()=>{finished=true})
 await vi.advanceTimersByTimeAsync(160);f.pause();await vi.advanceTimersByTimeAsync(80);const paused=f.pointer.snapshot();await vi.advanceTimersByTimeAsync(4000)
 expect(f.pointer.snapshot()).toEqual(paused);expect(finished).toBe(false);f.resume();await vi.runAllTimersAsync();await action;expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('abort or a disappearing target rejects before an actor may submit its operation',async()=>{
 const f=fixture();const action=f.pointer.perform({target:f.target,action:'click'});const result=action.catch(error=>error.name)
 await vi.advanceTimersByTimeAsync(80);f.abort.abort();expect(await result).toBe('AbortError');expect(document.querySelector<HTMLElement>('[data-home-guide-pointer]')?.hidden).toBe(true)
})
test('rejects a vanished target and serializes actions rather than leaving a late visual click',async()=>{
 const f=fixture(),first=f.pointer.perform({target:f.target,action:'move'}),result=first.catch(error=>error.message)
 await expect(f.pointer.perform({target:f.source,action:'click'})).rejects.toThrow('上一项')
 await vi.advanceTimersByTimeAsync(60);f.target.remove();await vi.runAllTimersAsync();expect(await result).toContain('不可用');expect(f.pointer.snapshot().state).toBe('idle')
})
test('rejects targets clipped out by a scroll ancestor rather than pointing at hidden content',async()=>{
 const f=fixture(),parent=document.createElement('div');parent.style.overflow='hidden';parent.getBoundingClientRect=()=>({left:20,top:20,right:100,bottom:100,width:80,height:80,x:20,y:20,toJSON:()=>({})});document.body.append(parent);parent.append(f.target)
 const result=f.pointer.perform({target:f.target}).catch(error=>error.message);await vi.runAllTimersAsync();expect(await result).toContain('不可用')
})
test('animates actual cell coordinates in a canvas inside a clipped spreadsheet shell',async()=>{
 const f=fixture(),shell=document.createElement('div')
 shell.style.overflow='hidden'
 shell.getBoundingClientRect=()=>new DOMRect(0,0,40,40)
 document.body.append(shell)
 shell.append(f.target)
 expect(()=>homeGuideTargetPoint(document,f.target)).toThrow('不可用')
 const frames:Array<{x:number;y:number;phase:string}>=[]
 const action=f.pointer.perform({fromTarget:f.target,target:f.target,action:'drag',
  canvasPoints:{from:()=>({x:120,y:148}),to:()=>({x:436,y:296})},onFrame:frame=>frames.push(frame)})
 await vi.runAllTimersAsync()
 await action
 expect(frames.find(frame=>frame.phase==='pressed')).toMatchObject({x:120,y:148})
 expect(frames.filter(frame=>frame.phase==='dragging').length).toBeGreaterThan(1)
 expect(frames.find(frame=>frame.phase==='released')).toMatchObject({x:436,y:296})
})
test('raises its non-interactive cursor after any newly opened manual popover, including component menus',async()=>{
 const prototype=HTMLElement.prototype,show=Object.getOwnPropertyDescriptor(prototype,'showPopover'),hide=Object.getOwnPropertyDescriptor(prototype,'hidePopover'),matches=prototype.matches,open=new Set<Element>(),order:Element[]=[]
 Object.defineProperty(prototype,'showPopover',{configurable:true,value:function(){open.add(this);order.push(this)}});Object.defineProperty(prototype,'hidePopover',{configurable:true,value:function(){open.delete(this)}})
 prototype.matches=function(selector:string){if(selector.includes(':popover-open'))return open.has(this)&&(!selector.replace(':popover-open','')||matches.call(this,selector.replace(':popover-open','')));return matches.call(this,selector)}
 const f=fixture();try{
  const style=document.createElement('style');style.textContent=readFileSync('src/preload/home-guides.css','utf8');document.body.append(style)
  const action=f.pointer.perform({target:f.target});await vi.runAllTimersAsync();await action
  const cursor=document.querySelector<HTMLElement>('[data-home-guide-pointer]')!,menu=document.createElement('div');menu.setAttribute('popover','manual');document.body.append(menu);menu.showPopover()
  const event=new Event('beforetoggle',{bubbles:true});Object.defineProperty(event,'newState',{value:'open'});menu.dispatchEvent(event);await vi.runAllTimersAsync()
  expect(order.at(-1)).toBe(cursor);expect(cursor.style.pointerEvents||getComputedStyle(cursor).pointerEvents).not.toBe('auto');f.pointer.dispose();expect(open.has(cursor)).toBe(false)
 }finally{prototype.matches=matches;show?Object.defineProperty(prototype,'showPopover',show):delete(prototype as any).showPopover;hide?Object.defineProperty(prototype,'hidePopover',hide):delete(prototype as any).hidePopover}
})
