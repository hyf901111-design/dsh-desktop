import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

let browser,css,script
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar,FluentOverlayScrollbar'],executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 css=await readFile('scripts/lib/research-grid-workbench.css','utf8')+'\n'+await readFile('scripts/lib/workbench-style.css','utf8')
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {createWorkbenchGridState,workbenchScrollExtent} from './scripts/lib/research-grid-state.mjs';
 import {createResearchGrid} from './packages/dsh-research-task-runtime/research-grid.js';
 const root=document.querySelector('main'),layer=root.firstElementChild,card=layer.firstElementChild;
 const values=new Map([['ework.research.grid.v1:jitter',{version:2,cells:[{id:'web',x:0,y:0,w:25,h:21}]}]]);
 const storage={getItem:key=>JSON.stringify(values.get(key)||null),setItem:(key,value)=>values.set(key,JSON.parse(value))};
 const grid=createWorkbenchGridState(storage,'jitter'),layout=createResearchGrid();
 let snapshot={files:[],artifacts:[{id:'web',kind:'web-link',url:'https://example.org/',x:320,y:260,width:600,height:500,sizeMode:'manual'}],viewport:{x:0,y:0,scale:1}};
 window.samples=[];
 const measure=()=>{
  grid.enable(root.clientWidth);snapshot=grid.reconcile(snapshot);
  const node=snapshot.artifacts[0],m=layout.metrics(root.clientWidth);
  Object.assign(card.style,{left:node.x-node.width/2+'px',top:node.y-node.height/2+'px',width:node.width+'px',height:node.height+'px'});
  layer.style.height=workbenchScrollExtent(node.y+node.height/2,root.clientHeight,m.rowStep,true)+'px';
  layer.style.width=root.clientWidth+'px';
 };
 const observer=new ResizeObserver(measure);observer.observe(root);measure();
 let frames=0;
 const sample=()=>{const r=card.getBoundingClientRect();window.samples.push({clientWidth:root.clientWidth,scrollHeight:root.scrollHeight,x:r.x,y:r.y,width:r.width,height:r.height});if(++frames<90)requestAnimationFrame(sample);else window.finished=true};
 requestAnimationFrame(sample);
 window.resizeWidth=width=>{document.querySelector('section').style.width=width+'px';window.samples=[];frames=0;window.finished=false;requestAnimationFrame(sample)};
 `},bundle:true,platform:'browser',format:'iife',write:false})
 script=result.outputFiles[0].text
},30000)
afterAll(()=>browser?.close())

it('settles square-grid geometry at the toolbar-clearance scrollbar boundary and after viewport resizing',async()=>{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setContent('<style>html,body{margin:0;height:100%}section{width:1012px;height:744px}main{position:relative}[data-research-content-layer]>article{position:absolute;background:#18181b;color:white}</style><section><main data-research-canvas data-ework-grid data-workbench-toolbar-space><div data-research-content-layer><article data-research-node-id="web">网页组件</article></div></main></section>')
  await page.addStyleTag({content:css})
  await page.addScriptTag({content:script})
  for(const width of [1012,1010,1014,800,1012,1100]){
   if(width!==1012||await page.evaluate(()=>window.finished))await page.evaluate(width=>window.resizeWidth(width),width)
   await page.waitForFunction(()=>window.finished)
   const samples=await page.evaluate(()=>window.samples.slice(-45))
   const widths=[...new Set(samples.map(s=>s.clientWidth))]
   await writeFile('/tmp/workbench-jitter-'+width+'-samples-20261021.json',JSON.stringify(samples))
   const boxes=[...new Set(samples.map(s=>JSON.stringify([s.x,s.y,s.width,s.height])))]
   expect(widths,JSON.stringify(samples.slice(-8))).toHaveLength(1)
   expect(boxes).toHaveLength(1)
  }
  for(const mode of ['light','dark','openterminal','enterprise']){
   const before=await page.locator('main').evaluate(el=>el.clientWidth)
   await page.locator('main').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode)
   expect(await page.locator('main').evaluate(el=>el.clientWidth)).toBe(before)
  }
  await page.locator('main').evaluate(el=>el.scrollTop=100)
  const scrolling=await page.locator('main').evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}))
  // Once there is real overflow, reserving a gutter must preserve scrolling.
  expect(scrolling.max).toBeGreaterThan(0)
  expect(scrolling.top).toBe(100)
  expect(errors).toEqual([])
  await mkdir('/tmp/workbench-jitter-20261021',{recursive:true})
  await page.screenshot({path:'/tmp/workbench-jitter-20261021/stable-grid.png'})
 }finally{await page.close()}
},15000)
