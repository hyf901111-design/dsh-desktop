// @vitest-environment happy-dom
import {afterEach,expect,test,vi} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {createHomeGuidePointer} from '../src/preload/home-guide-pointer'
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
test('extends the native-colored Board connection to every intermediate virtual pointer frame and removes it on release',async()=>{
 const f=financialFixture(),click=vi.fn();f.source.addEventListener('click',click);f.target.addEventListener('click',click)
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source})
 void action.catch(()=>{})
 await vi.advanceTimersByTimeAsync(450)
 const svg=f.line();expect(svg).not.toBeNull();expect(svg?.getAttribute('aria-hidden')).toBe('true');expect(svg?.style.pointerEvents).toBe('none');expect(svg?.style.color).toBe('#249bfa')
 const path=svg!.querySelector('path')!,first=path.getAttribute('d')!,cursor=f.pointer.snapshot();expect(first.startsWith('M 90 110 C ')).toBe(true);expect(first.endsWith(` ${cursor.x} ${cursor.y}`)).toBe(true);expect(cursor.x).toBeGreaterThan(90);expect(cursor.x).toBeLessThan(360)
 await vi.advanceTimersByTimeAsync(160);expect(path.getAttribute('d')).not.toBe(first);expect(path.getAttribute('d')?.endsWith(` ${f.pointer.snapshot().x} ${f.pointer.snapshot().y}`)).toBe(true)
 await vi.runAllTimersAsync();await action;expect(f.line()).toBeNull();expect(click).not.toHaveBeenCalled();expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
})
test('keeps the in-flight connection fixed while paused and resumes without creating a second line',async()=>{
 const f=financialFixture(),action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source})
 void action.catch(()=>{})
 await vi.advanceTimersByTimeAsync(600);f.pause();await vi.advanceTimersByTimeAsync(80)
 const svg=f.line();expect(svg).not.toBeNull();const path=svg!.querySelector('path')!.getAttribute('d'),cursor=f.pointer.snapshot()
 await vi.advanceTimersByTimeAsync(4000);expect(f.line()).toBe(svg);expect(svg!.querySelector('path')!.getAttribute('d')).toBe(path);expect(f.pointer.snapshot()).toEqual(cursor)
 f.resume();await vi.advanceTimersByTimeAsync(160);expect(document.querySelectorAll('[data-home-guide-connection]').length).toBe(1);expect(svg!.querySelector('path')!.getAttribute('d')).not.toBe(path)
 await vi.runAllTimersAsync();await action;expect(f.line()).toBeNull()
})
test('re-measures both ports during a real Board drag instead of keeping a stale starting edge',async()=>{
 const f=financialFixture(),action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source})
 void action.catch(()=>{})
 await vi.advanceTimersByTimeAsync(600);expect(f.line()).not.toBeNull()
 f.source.getBoundingClientRect=()=>({left:120,top:120,right:140,bottom:140,width:20,height:20,x:120,y:120,toJSON:()=>({})})
 await vi.advanceTimersByTimeAsync(32);expect(f.line()!.querySelector('path')!.getAttribute('d')?.startsWith('M 130 130 C ')).toBe(true)
 await vi.runAllTimersAsync();await action;expect(f.line()).toBeNull()
})
test.each(['abort','dispose','source-removal','target-removal','canvas-change','run-change','disabled'])('cleans an in-flight Board connection on %s before the actor can commit',async reason=>{
 const f=financialFixture(),action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source}),result=action.catch(error=>error.name)
 await vi.advanceTimersByTimeAsync(600);expect(f.line()).not.toBeNull()
 if(reason==='abort')f.abort.abort();else if(reason==='dispose')f.pointer.dispose();else if(reason==='source-removal')f.source.remove();else if(reason==='target-removal')f.target.remove();else if(reason==='run-change')document.documentElement.dataset.homeGuidePointerRun='new-run';else if(reason==='disabled')f.source.disabled=true;else{const canvas=document.createElement('div');canvas.dataset.researchCanvas='';document.body.append(canvas);canvas.append(f.target)}
 await vi.runAllTimersAsync();expect(await result).toMatch(/AbortError|Error/);expect(f.line()).toBeNull()
})
test.each(['generic','slider','note','different-canvas','same-side','wrong-node'])('does not draw a financial connection for a %s drag',async kind=>{
 const f=financialFixture()
 if(kind==='generic'){delete f.source.dataset.financialPort;delete f.target.dataset.financialPort}
 else if(kind==='slider'){f.target.setAttribute('role','slider');delete f.target.dataset.financialPort}
 else if(kind==='note')f.guide.dataset.kind='note'
 else if(kind==='different-canvas'){const canvas=document.createElement('div');canvas.dataset.researchCanvas='';document.body.append(canvas);canvas.append(f.target.closest('[data-research-node-id]')!)}
 else if(kind==='same-side')f.target.dataset.financialPort='output'
 else f.target.dataset.financialPortNode='unowned-node'
 const action=f.pointer.perform({target:f.target,action:'drag',fromTarget:f.source});await vi.advanceTimersByTimeAsync(600);expect(f.line()).toBeNull();await vi.runAllTimersAsync();await action;expect(f.line()).toBeNull()
})
test('moves a DOM arrow then acknowledges its click without clicking or focusing the target',async()=>{
 const f=fixture(),click=vi.fn();f.target.addEventListener('click',click);let finished=false
 const action=f.pointer.perform({target:f.target,action:'click'}).then(()=>{finished=true})
 await vi.advanceTimersByTimeAsync(80);expect(finished).toBe(false);expect(document.querySelector('[data-home-guide-pointer]')?.getAttribute('aria-hidden')).toBe('true');expect(document.activeElement).not.toBe(f.target)
 await vi.runAllTimersAsync();await action;expect(finished).toBe(true);expect(click).not.toHaveBeenCalled();expect(f.pointer.snapshot()).toMatchObject({x:360,y:240,state:'idle'})
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
test('renders a visible intermediate SVG curve in a browser and keeps it still during a paused pointer clock',async()=>{
 const compiled=await build({stdin:{resolveDir:process.cwd(),contents:`
  import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
  let gate;window.abort=new AbortController();window.pause=()=>gate=new Promise(resolve=>window.resume=()=>{gate=undefined;resolve()});
  window.pointer=createHomeGuidePointer(document,{runId:'rendered-board',signal:window.abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>gate||Promise.resolve()});
  window.drag=()=>window.action=window.pointer.perform({target:document.querySelector('#target'),fromTarget:document.querySelector('#source'),action:'drag'}).then(()=>window.completed=true,error=>window.error=error.name);
 `},bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent'})
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 try{
  const page=await browser.newPage({viewport:{width:1000,height:800}});await page.clock.install()
  await page.setContent('<style>button{width:20px;height:20px;border:0;border-radius:50%;background:#249bfa}</style><section data-home-guide="rendered-board" data-kind="board"><main data-research-canvas data-ework-grid style="position:fixed;left:40px;top:60px;width:900px;height:650px;overflow:hidden;--fw-accent:#249bfa"><article data-research-node-id="watch"><section data-financial-widget="watchlist"><button id="source" data-financial-port="output" data-financial-port-node="watch" style="position:fixed;left:120px;top:160px"></button></section></article><article data-research-node-id="quote"><section data-financial-widget="quote"><button id="target" data-financial-port="input" data-financial-port-node="quote" style="position:fixed;left:640px;top:360px"></button></section></article></main></section>')
  await page.addScriptTag({content:compiled.outputFiles[0]!.text});await page.evaluate(()=>{(window as any).clicks=0;for(const button of document.querySelectorAll('button'))button.addEventListener('click',()=>{(window as any).clicks++});(window as any).drag()})
  await page.clock.runFor(600)
  const drawn=await page.locator('[data-home-guide-connection] path').evaluate((path:SVGPathElement)=>{const box=path.getBoundingClientRect(),svg=path.ownerSVGElement!;return{width:box.width,height:box.height,d:path.getAttribute('d'),color:getComputedStyle(path).stroke,clip:getComputedStyle(svg).clipPath,pointer:(window as any).pointer.snapshot()}})
  expect(drawn.width).toBeGreaterThan(0);expect(drawn.height).toBeGreaterThan(0);expect(drawn.color).toBe('rgb(36, 155, 250)');expect(drawn.clip).toBe('inset(60px 60px 90px 40px)');expect(drawn.d?.endsWith(` ${drawn.pointer.x} ${drawn.pointer.y}`)).toBe(true)
  await page.evaluate(()=>{(window as any).pause()});await page.clock.runFor(80);const paused=await page.locator('[data-home-guide-connection] path').getAttribute('d');await page.clock.runFor(4000);expect(await page.locator('[data-home-guide-connection] path').getAttribute('d')).toBe(paused)
  await page.evaluate(()=>(window as any).resume());await page.clock.runFor(1500);await page.evaluate(()=>(window as any).action);expect(await page.locator('[data-home-guide-connection]').count()).toBe(0);expect(await page.evaluate(()=>(window as any).clicks)).toBe(0)
  await page.evaluate(()=>{(window as any).drag()});await page.clock.runFor(600);expect(await page.locator('[data-home-guide-connection]').count()).toBe(1);await page.evaluate(()=>(window as any).abort.abort());await page.evaluate(()=>(window as any).action);expect(await page.locator('[data-home-guide-connection]').count()).toBe(0);expect(await page.evaluate(()=>(window as any).error)).toBe('AbortError')
 }finally{await browser.close()}
},20000)
