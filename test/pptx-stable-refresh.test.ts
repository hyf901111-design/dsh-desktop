import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {createStablePptxViewer} from '../scripts/lib/pptx-editor-ui.mjs'

function fixture(media=false){
 const win=new Window(),host=win.document.createElement('div');win.document.body.appendChild(host)
 const mount=win.document.createElement('div');host.appendChild(mount);mount.innerHTML='<section data-slide-index="10"><div data-mounted="1">旧幻灯片<img data-old-media></div></section><section data-slide-index="11"><div data-mounted="1">旧相邻幻灯片</div></section>'
 const replies:Array<{resolve:()=>void;reject:(e:Error)=>void}>=[],instances:any[]=[];let finishMedia:()=>void=()=>{}
 class Viewer{
  container:any;viewerOptions:any;currentSlide=10;zoomPercent=150;destroyed=0;prepared:number[]=[];slideHandles=new Map<number,any>();get currentSlideIndex(){return this.currentSlide}
  constructor(container:any,options:any={scrollContainer:host}){this.container=container;this.viewerOptions=options;instances.push(this)}
  destroy(){this.destroyed++;this.container.replaceChildren()}
  async open(){this.destroy();await new Promise<void>((resolve,reject)=>replies.push({resolve,reject}));this.container.innerHTML='<section data-slide-index="10"><div></div></section><section data-slide-index="11"><div></div></section>'}
  ensureListSlideMountedFn=(index:number)=>{this.prepared.push(index);const wrapper=this.container.querySelector(`[data-slide-index="${index}"]`)?.firstElementChild;if(!wrapper||wrapper.dataset.mounted)return;wrapper.dataset.mounted='1';wrapper.textContent='新幻灯片'+index;const ready=media&&index===10?new Promise<void>(resolve=>{finishMedia=()=>{const img=this.container.ownerDocument.createElement('img');img.dataset.newMedia='';img.decode=async()=>{};wrapper.appendChild(img);resolve()}}):Promise.resolve();this.slideHandles.set(index,{ready})}
 }
 host.scrollTop=60;host.scrollLeft=7
 const initial=new Viewer(mount),stable=createStablePptxViewer(initial)
 return{host,mount,initial,stable,replies,instances,finishMedia:()=>finishMedia()}
}

it('retains the old slide and zoom while parsing and swaps only after the new slide is ready',async()=>{
 const f=fixture(),old=f.mount.firstElementChild,work=f.stable.open(new Uint8Array([1]))
 expect(old!.isConnected).toBe(true);expect(f.initial.destroyed).toBe(0)
 expect(f.host.querySelector('[data-pptx-staging]')?.getAttribute('aria-hidden')).toBe('true')
 f.replies[0]!.resolve();expect(await work).toBe(true)
 expect(f.host.textContent).toBe('新幻灯片10新幻灯片11');expect(f.host.querySelector('[data-pptx-staging]')).toBeNull()
 expect(f.initial.destroyed).toBe(1);expect(f.instances[1].viewerOptions.zoomPercent).toBe(150)
 expect(f.instances[1].prepared).toContain(11);expect(f.host.scrollTop).toBe(60);expect(f.host.scrollLeft).toBe(7)
 f.stable.destroy()
})

it('discards a completed refresh if typing or source changes make the draft obsolete',async()=>{
 const f=fixture(),old=f.mount.firstElementChild;let current=true
 const work=f.stable.open(new Uint8Array([1]),{},()=>current)
 current=false;f.replies[0]!.resolve();expect(await work).toBe(false)
 expect(f.host.textContent).toBe('旧幻灯片旧相邻幻灯片');expect(old!.isConnected).toBe(true);expect(f.initial.destroyed).toBe(0)
 expect(f.host.querySelector('[data-pptx-staging]')).toBeNull();f.stable.destroy()
})

it('retains the current slide on renderer failure and cleans an in-flight stage on teardown',async()=>{
 const f=fixture(),failed=f.stable.open(new Uint8Array([1]))
 f.replies[0]!.reject(new Error('解析失败'));await expect(failed).rejects.toThrow('解析失败')
 expect(f.host.textContent).toBe('旧幻灯片旧相邻幻灯片');expect(f.initial.destroyed).toBe(0)
 const work=f.stable.open(new Uint8Array([2]));f.stable.destroy()
 expect(f.host.querySelector('[data-pptx-staging]')).toBeNull()
 f.replies[1]!.resolve();expect(await work).toBe(false);expect(f.host.textContent).toBe('')
})

it('keeps the latest scroll position if the user navigates while a replacement is parsing',async()=>{
 const f=fixture(),work=f.stable.open(new Uint8Array([1]))
 f.host.scrollTop=800;f.host.scrollLeft=20;f.initial.currentSlide=11
 f.replies[0]!.resolve();await work
 expect(f.host.scrollTop).toBe(800);expect(f.host.scrollLeft).toBe(20);expect(f.stable.currentSlideIndex).toBe(11)
 f.stable.destroy()
})
it('retains old media until asynchronously rendered slide media is ready',async()=>{
 const f=fixture(true);let committed=false
 const work=f.stable.open(new Uint8Array([1])).then(()=>{committed=true})
 f.replies[0]!.resolve();await new Promise(resolve=>setTimeout(resolve,0))
 expect(committed).toBe(false);expect(f.host.querySelector('[data-old-media]')?.isConnected).toBe(true)
 f.finishMedia();await work
 expect(f.host.querySelector('[data-new-media]')?.isConnected).toBe(true);expect(f.host.querySelector('[data-old-media]')).toBeNull()
 f.stable.destroy()
})
