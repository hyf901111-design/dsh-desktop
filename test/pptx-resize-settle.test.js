import {it,expect,vi,afterEach} from 'vitest'
import {Window} from 'happy-dom'
import {schedulePptxResize,cancelPptxResize,createPptxScrollWindow} from '../scripts/lib/pptx-resize-settle.mjs'
afterEach(()=>vi.unstubAllGlobals())
it('coalesces continuous width changes into one final render and cancels on destruction',()=>{
 vi.useFakeTimers();const viewer={queueRender:vi.fn(),presentation:{},container:{clientWidth:500}}
 for(let i=0;i<40;i++){viewer.container.clientWidth=500+i;schedulePptxResize(viewer);vi.advanceTimersByTime(16)}
 expect(viewer.queueRender).not.toHaveBeenCalled();vi.advanceTimersByTime(180);expect(viewer.queueRender).toHaveBeenCalledOnce()
 schedulePptxResize(viewer);cancelPptxResize(viewer);vi.runAllTimers();expect(viewer.queueRender).toHaveBeenCalledOnce();vi.useRealTimers()
})

it('resizes list slides in place without blanking or rebuilding, including unmounted placeholders',()=>{
 const slide={style:{},identity:'original'}
 const wrapper={style:{},firstElementChild:slide}
 const placeholder={style:{},firstElementChild:null}
 const viewer={presentation:{},activeRenderMode:'list',queueRender:vi.fn(),container:{querySelectorAll:()=>[{firstElementChild:wrapper},{firstElementChild:placeholder}]},getDisplayMetrics:()=>({scale:0.5,displayWidth:480,displayHeight:270})}
 for(let i=0;i<40;i++)schedulePptxResize(viewer)
 expect(viewer.queueRender).not.toHaveBeenCalled()
 expect(wrapper.firstElementChild).toBe(slide)
 expect(slide.style.transform).toBe('scale(0.5)')
 expect(wrapper.style.width).toBe('480px')
 expect(placeholder.style.height).toBe('270px')
})

function scrollFixture(){
 const win=new Window({width:800,height:700}),doc=win.document,outer=doc.createElement('section'),root=doc.createElement('div'),content=doc.createElement('div')
 outer.style.overflow='auto';root.style.overflow='auto';outer.append(root);root.append(content);doc.body.append(outer)
 let rootTop=20,outerTop=0,outerLeft=0
 const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height})
 outer.getBoundingClientRect=()=>rect(outerLeft,outerTop,500,650)
 root.getBoundingClientRect=()=>rect(10,rootTop,400,300)
 for(const [element,width,height] of [[outer,500,650],[root,400,300]])Object.defineProperties(element,{offsetWidth:{value:width},clientWidth:{value:width},offsetHeight:{value:height},clientHeight:{value:height}})
 Object.defineProperty(root,'scrollHeight',{value:3000})
 const wrappers=Array.from({length:10},(_,index)=>{const el=doc.createElement('div');el.getBoundingClientRect=()=>rect(10,rootTop+index*300-root.scrollTop,400,300);content.append(el);return el})
 const observers=[],frames=new Map();let clock=0,frameId=0
 vi.spyOn(win.performance,'now').mockImplementation(()=>clock)
 win.IntersectionObserver=class{constructor(callback,options){this.callback=callback;this.options=options;observers.push(this)}observe(){}disconnect(){}}
 win.ResizeObserver=class{observe(){}disconnect(){}}
 vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',callback=>{frames.set(++frameId,callback);return frameId});vi.stubGlobal('cancelAnimationFrame',id=>frames.delete(id))
 const viewer={container:content,viewerOptions:{scrollContainer:root},listOptions:{overscanViewport:1},mountedSlides:new Set(),isRenderStale:()=>false}
 const mount=index=>{if(viewer.mountedSlides.has(index))return;wrappers[index].textContent='Slide '+index;viewer.mountedSlides.add(index)}
 const unmount=index=>{wrappers[index].replaceChildren();viewer.mountedSlides.delete(index)}
 const scheduler=createPptxScrollWindow(viewer,wrappers,mount,unmount,1)
 const scroll=()=>root.dispatchEvent(new win.Event('scroll'))
 scroll()
 const wheel=(options={},element=root)=>{const event=new win.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:900,...options});element.dispatchEvent(event);return event}
 const tick=ms=>{clock+=ms;const pending=[...frames.values()];frames.clear();for(const frame of pending)frame(clock)}
 return{win,root,outer,content,wrappers,viewer,scheduler,observers,scroll,wheel,mount,tick,moveRoot:top=>{rootTop=top},moveOuter:(top,left=0)=>{outerTop=top;outerLeft=left}}
}

it('keeps visible content when an old false IO delivery arrives and restores before a fresh IO callback',()=>{
 const f=scrollFixture()
 try{
  expect(f.wrappers[0].textContent).toBe('Slide 0')
  f.observers.find(observer=>!observer.options).callback([{isIntersecting:false}])
  expect(f.wrappers[0].textContent).toBe('Slide 0')
  f.moveRoot(900);f.scroll();expect(f.viewer.mountedSlides.size).toBe(0)
  f.moveRoot(20);f.scroll();expect(f.wrappers[0].textContent).toBe('Slide 0')
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('uses the current ancestor clip on both axes even when IO still says visible',()=>{
 const f=scrollFixture()
 try{
  f.moveOuter(400);f.scroll();expect(f.viewer.mountedSlides.size).toBe(0)
  f.moveOuter(0);f.scroll();expect(f.wrappers[0].textContent).toBe('Slide 0')
  f.moveOuter(0,600);f.scroll();expect(f.viewer.mountedSlides.size).toBe(0)
  f.moveOuter(0);f.scroll();expect(f.wrappers[0].textContent).toBe('Slide 0')
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('prepares only a cold wheel destination synchronously and clamps at the list end',()=>{
 const f=scrollFixture()
 try{
  expect(f.wheel().defaultPrevented).toBe(true)
  expect(f.root.scrollTop).toBe(900);expect(f.wrappers[3].textContent).toBe('Slide 3')
  expect(f.viewer.mountedSlides.size).toBeLessThan(5)
  expect(f.wheel({deltaY:100000}).defaultPrevented).toBe(true)
  expect(f.root.scrollTop).toBe(2700);expect(f.wrappers[9].textContent).toBe('Slide 9')
  expect(f.wheel({deltaY:100}).defaultPrevented).toBe(false)
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('preserves warm, prevented, horizontal and nested paragraph wheel paths',()=>{
 const f=scrollFixture()
 try{
  f.mount(1)
  expect(f.wheel({deltaY:20}).defaultPrevented).toBe(false);expect(f.root.scrollTop).toBe(0)
  for(const options of [{deltaX:1},{deltaY:0},{deltaMode:1},{deltaMode:2}]){
   expect(f.wheel(options).defaultPrevented,JSON.stringify(options)).toBe(false);expect(f.root.scrollTop).toBe(0)
  }
  const paragraph=f.win.document.createElement('p');paragraph.style.overflowY='auto';f.wrappers[0].append(paragraph)
  Object.defineProperties(paragraph,{scrollHeight:{value:800},clientHeight:{value:100}})
  expect(f.wheel({},paragraph).defaultPrevented).toBe(false);expect(f.root.scrollTop).toBe(0)
  const prevented=new f.win.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:900});prevented.preventDefault();f.root.dispatchEvent(prevented)
  expect(f.root.scrollTop).toBe(0);expect(f.wrappers[3].textContent).toBe('')
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('prepares a noncancelable wheel burst destination without adding a second scroll',()=>{
 const f=scrollFixture()
 try{
  expect(f.wheel({cancelable:false}).defaultPrevented).toBe(false)
  expect(f.root.scrollTop).toBe(0)
  expect(f.wrappers[3].textContent).toBe('Slide 3')
  // Model the browser's default scroll after dispatch: content was already ready.
  f.root.scrollTop=900;f.scroll()
  expect(f.root.scrollTop).toBe(900);expect(f.wrappers[3].textContent).toBe('Slide 3')
  expect(f.viewer.mountedSlides.size).toBeLessThan(5)
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('leaves wheel ownership with the live viewer during staging and removes it on disconnect',()=>{
 const f=scrollFixture()
 try{
  f.content.dataset.pptxStaging=''
  expect(f.wheel().defaultPrevented).toBe(false);expect(f.root.scrollTop).toBe(0)
  delete f.content.dataset.pptxStaging
  f.scheduler.disconnect()
  expect(f.wheel().defaultPrevented).toBe(false);expect(f.wrappers[3].textContent).toBe('')
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('defers only neighboring warm work during rapid wheel and resumes one slide per idle frame',()=>{
 const f=scrollFixture()
 try{
  f.wheel();expect(f.wrappers[3].textContent).toBe('Slide 3')
  for(let frame=0;frame<4;frame++){f.tick(16);expect(f.wrappers[2].textContent).toBe('');expect(f.wrappers[4].textContent).toBe('')}
  f.tick(16);expect(f.wrappers[2].textContent).toBe('Slide 2');expect(f.wrappers[4].textContent).toBe('')
  f.tick(16);expect(f.wrappers[4].textContent).toBe('Slide 4')
  expect(f.viewer.mountedSlides.size).toBe(3)
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})

it('uses actual vertical scrolling for diagonal wheel and scrollbar quiet periods without extending them on IO',()=>{
 const f=scrollFixture()
 try{
  expect(f.wheel({deltaX:1}).defaultPrevented).toBe(false)
  // The browser's default diagonal wheel, scrollbar or programmatic scroll
  // changes scrollTop before delivering the same real scroller event.
  f.root.scrollTop=900;f.scroll();expect(f.wrappers[3].textContent).toBe('Slide 3')
  for(let frame=0;frame<4;frame++){f.observers[0].callback([]);f.tick(16);expect(f.wrappers[2].textContent).toBe('')}
  f.observers[0].callback([]);f.tick(16);expect(f.wrappers[2].textContent).toBe('Slide 2')
  f.root.scrollTop=0;f.scroll();expect(f.wrappers[0].textContent).toBe('Slide 0')
  f.tick(16);expect(f.wrappers[1].textContent).toBe('')
  f.tick(64);expect(f.wrappers[1].textContent).toBe('Slide 1')
 }finally{f.scheduler.disconnect();f.win.happyDOM.abort()}
})
it('prepares only the current offscreen note viewport for a snapshot and restores its prior mount set without scrolling',async()=>{
 const f=scrollFixture();f.outer.className='en-root'
 try{
  f.root.scrollTop=900;f.scroll();f.moveRoot(900);f.scroll();expect(f.viewer.mountedSlides.size).toBe(0)
  const before=f.root.scrollTop
  const lease=await f.root.__sherlockPrepareNoteSnapshot()
  expect(f.viewer.mountedSlides.has(3)).toBe(true);expect(f.viewer.mountedSlides.size).toBe(1)
  f.observers[0].callback([]);expect(f.viewer.mountedSlides.has(3)).toBe(true)
  expect(f.root.scrollTop).toBe(before);lease.release();expect(f.viewer.mountedSlides.size).toBe(0);expect(f.root.scrollTop).toBe(before)
 }finally{f.scheduler.disconnect();expect(f.root.__sherlockPrepareNoteSnapshot).toBeUndefined();f.win.happyDOM.abort()}
})
