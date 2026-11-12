import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

// Browser plugin not available. This isolated Chromium fixture mounts the real
// connection renderer with production CSS; the client test owns workspace/data QA.
const native=createRequire(import.meta.url),evidence='/tmp/board-tabs-rounded-20261028'
let browser,entry,styles
beforeAll(async()=>{
 const {FinancialConnections,FinancialConnectionPort}=native('../scripts/lib/financial-widget-link.mjs')
 const {financialLinkSourceId,financialCanLink,financialWidgetDefaults}=native('../packages/dsh-research-task-runtime/financial-widget-contract.js')
 const {workbenchSmartCreateTarget,workbenchCanCreateFrom}=native('../scripts/lib/research-grid-ui.mjs')
 const {financialEnterpriseCss,financialOpenTerminalCss}=native('../scripts/lib/financial-widget-client.mjs')
 styles=(await Promise.all(['src/preload/figma-final-shell.css','src/preload/figma-refinements.css','scripts/lib/research-grid-workbench.css','scripts/lib/workbench-style.css','scripts/lib/financial-widget.css','scripts/lib/board-tabs.css'].map(p=>readFile(p,'utf8')))).join('\n')+'\n'+financialEnterpriseCss()+'\n'+financialOpenTerminalCss()
 const source={id:'watch',kind:'generated-container',containerSpec:financialWidgetDefaults('watchlist')},target={id:'quote',kind:'generated-container',containerSpec:{...financialWidgetDefaults('quote'),linkedWatchlistId:'watch'}}
 entry=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import * as react_dom from 'react-dom';import {createRoot} from 'react-dom/client';
 const React=react,financialLinkSinks=new Map(),workbenchText=value=>value;
 ${[financialLinkSourceId,financialCanLink,workbenchSmartCreateTarget,workbenchCanCreateFrom,FinancialConnectionPort,FinancialConnections].map(fn=>fn.toString()).join('\n')}
 const nodes=${JSON.stringify([source,target])};let setView;
 function App(){
  const [view,update]=react.useState({active:'market',selected:['watch'],mode:'openterminal',overflow:false,vertical:false});setView=update;react.useLayoutEffect(()=>update(v=>({...v})),[]);
  const rootRef=react.useRef(null),list=react.useRef(null),state=react.useRef(null);
  const tabs=[{id:'market',name:'我的自选',nodeIds:['watch']},...(view.overflow?Array.from({length:8},(_,i)=>({id:'extra-'+i,name:'市场研究 '+(i+1),nodeIds:[]})):[]),{id:'remote',name:'新闻公告',nodeIds:['quote']}];
  const snapshot={files:[],artifacts:[...nodes,{id:'nav',containerSpec:{type:'board-tabs',tabs}}],selection:{selectedNodeIds:view.selected},viewport:{x:0,y:0,scale:1}};state.current={view,snapshot,tabs};
  const workspace=react.useMemo(()=>({getSnapshot:()=>state.current.snapshot,getVisibleBoardSnapshot:()=>({files:[],artifacts:nodes.filter(n=>state.current.tabs.find(t=>t.id===state.current.view.active).nodeIds.includes(n.id))}),isBoardNodeVisible:id=>state.current.tabs.find(t=>t.id===state.current.view.active).nodeIds.includes(id),updateSelection:ids=>update(v=>({...v,selected:ids}))}),[]);
  const page=id=>update(v=>({...v,active:id,selected:[]}));
  return <main ref={rootRef} data-research-canvas data-ework-grid data-workbench-style={view.mode} style={{position:'relative',width:760,height:620,margin:24}}>
   <div data-research-content-layer style={{height:620}}>
    <div data-board-tabs-nav className="ew-board-tabs-nav" data-board-tabs-theme={view.mode} data-board-tabs-orientation={view.vertical?"vertical":"horizontal"} style={{width:view.vertical?180:view.overflow?320:736,height:view.vertical?522:undefined}}>
     <div ref={list} role="tablist" className="ew-board-tabs-list">{tabs.map(t=><button key={t.id} role="tab" data-board-tab={t.id} aria-selected={t.id===view.active} onClick={()=>page(t.id)}>{t.name}</button>)}</div>
     {view.overflow&&<div data-board-tabs-paging className="ew-board-tabs-paging"><button aria-label="向左翻页" onClick={()=>list.current.scrollBy({left:-120})}>‹</button><button aria-label="向右翻页" onClick={()=>list.current.scrollBy({left:120})}>›</button></div>}
     <button data-board-tabs-more aria-label="页签更多操作">···</button>
    </div>
    {nodes.map(n=><article key={n.id} data-research-node-id={n.id} data-board-tab-hidden={workspace.isBoardNodeVisible(n.id)?undefined:''} onClick={()=>update(v=>({...v,selected:[n.id]}))} style={{position:'absolute',left:view.vertical?204:12,top:94,width:520,height:440}}>
     <div className="ew-financial-widget" style={{height:'100%'}}><header style={{padding:'12px 16px',color:'var(--fw-accent)',borderBottom:'1px solid var(--fw-border)'}}>{n.id==='watch'?'自选':'行情面板'}</header>
      <div style={{padding:16,color:'var(--fw-muted)',lineHeight:'34px'}}>名称　／代码　　　　　 最新价　　涨跌幅<br/>中国国贸　　　　　　22.38　　 +0.22%<br/>地产指数　　　　　3,846.25　　 +0.09%<br/>沪深300　　　　　3,905.44　　 +0.11%<br/>万科A　　　　　　　　6.89　　 +0.05%</div>
      <footer className="ew-financial-footer" style={{position:'absolute',bottom:4,left:12,right:12}}>{n.id==='quote'&&<FinancialConnectionPort surface="research" node={n} side="input"/>}<span style={{flex:1}}>分市场　腾讯财经　行情　09:31</span><FinancialConnectionPort surface="research" node={n} side="output"/></footer>
     </div></article>)}
   </div>
   <FinancialConnections rootRef={rootRef} workspace={workspace} sessionId="visual" snapshot={snapshot} readOnly={false}/>
  </main>
 }
 const root=createRoot(document.querySelector('#fixture'));root.render(<App/>);
 window.fixture={mode:mode=>setView(v=>({...v,mode})),select:ids=>setView(v=>({...v,selected:ids})),overflow:()=>setView(v=>({...v,overflow:true})),vertical:()=>setView(v=>({...v,vertical:true})),unmount:()=>root.unmount()};
 `},bundle:true,format:'iife',platform:'browser',write:false,target:'chrome120',logLevel:'silent'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(async()=>browser?.close())
async function fixture(){
 const page=await browser.newPage({viewport:{width:820,height:710},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setContent(`<title>看板跨页连线视觉验证</title><style>${styles}\nhtml,body{height:100%;margin:0;font-family:system-ui}#fixture{height:100%}</style><div id="fixture"></div>`)
 await page.addScriptTag({content:entry});await page.waitForSelector('[data-financial-link] .ew-financial-connection-line',{state:'attached',timeout:5000}).catch(async error=>{await page.screenshot({path:evidence+'/fixture-error.png'});throw Error(error.message+'; page errors: '+JSON.stringify(errors))})
 return {page,errors}
}
it('真实Chromium中四模式标签描边与实际连线同色，末端穿过导航padding且不改变标签宽度或拦截切页',async()=>{
 const {page,errors}=await fixture()
 try{
  expect(await page.title()).toBe('看板跨页连线视觉验证');expect(await page.locator('article:visible').textContent()).toContain('中国国贸')
  const target=page.locator('[data-board-tab=remote]'),initialWidth=await target.evaluate(el=>el.getBoundingClientRect().width),modes=[]
  for(const mode of ['openterminal','light','dark','enterprise']){
   await page.evaluate(mode=>window.fixture.mode(mode),mode)
   await page.waitForFunction(mode=>document.querySelector('main').dataset.workbenchStyle===mode&&document.querySelector('[data-board-tabs-nav]').dataset.boardTabsTheme===mode,mode)
   const paint=await target.evaluate(el=>{const css=getComputedStyle(el),line=document.querySelector('.ew-financial-connection-line'),stem=document.querySelector('[data-financial-connection-stem]');return {border:css.borderTopColor,stroke:getComputedStyle(line).stroke,width:el.getBoundingClientRect().width,stem:stem&&{color:getComputedStyle(stem).backgroundColor,rect:stem.getBoundingClientRect().toJSON(),pointer:getComputedStyle(stem).pointerEvents},tab:el.getBoundingClientRect().toJSON(),bar:el.closest('[data-board-tabs-nav]').getBoundingClientRect().toJSON(),d:line.getAttribute('d')}})
   await page.screenshot({path:evidence+'/'+(paint.border===paint.stroke?'after':'before')+'-'+mode+'.png'})
   expect(paint.border).toBe(paint.stroke);expect(paint.width).toBe(initialWidth);expect(paint.stem).not.toBeNull()
   expect(paint.stem.color).toBe(paint.stroke);expect(paint.stem.pointer).toBe('none');expect(paint.stem.rect.y).toBeLessThanOrEqual(paint.tab.bottom);expect(paint.stem.rect.bottom).toBeGreaterThanOrEqual(paint.bar.bottom)
   expect(paint.d).toContain(' A ');expect(paint.d).not.toContain(' C ');modes.push({mode,...paint})
  }
  await writeFile(evidence+'/paint.json',JSON.stringify(modes,null,2))
  await target.hover();const bg=await target.evaluate(el=>getComputedStyle(el).backgroundColor)
  await target.evaluate(el=>el.setAttribute('data-tab-accept',''))
  expect(await target.evaluate(el=>getComputedStyle(el).borderTopStyle)).toBe('dashed');expect(await target.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(bg)
  await target.evaluate(el=>el.removeAttribute('data-tab-accept'))
  await target.click();expect(await target.getAttribute('aria-selected')).toBe('true');expect(await page.locator('[data-financial-connection-target]').count()).toBe(0)
  await page.evaluate(()=>window.fixture.select(['quote']));await page.waitForSelector('[data-financial-link]')
  const inputEnd=await page.evaluate(()=>{const path=document.querySelector('.ew-financial-connection-line'),p=path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()),r=document.querySelector('[data-financial-port-node=quote][data-financial-port=input]').getBoundingClientRect();return {dx:Math.abs(p.x-r.left-r.width/2),dy:Math.abs(p.y-r.top-r.height/2),d:path.getAttribute('d')}})
  expect(inputEnd.dx).toBeLessThan(.01);expect(inputEnd.dy).toBeLessThan(.01);expect(inputEnd.d).toContain(' A ')
  await page.screenshot({path:evidence+'/incoming-enterprise.png'})
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it('溢出时描边转移至实际翻页箭头，真实点击仍滚动列表，解除选择后清除描边与末端',async()=>{
 const {page,errors}=await fixture()
 try{
  await page.evaluate(()=>window.fixture.overflow());await page.waitForSelector('[data-board-tabs-paging]')
  const arrow=page.getByRole('button',{name:'向右翻页',exact:true}),list=page.getByRole('tablist')
  await page.waitForFunction(()=>document.querySelector('[aria-label="向右翻页"]').hasAttribute('data-financial-connection-target'))
  const colors=await arrow.evaluate(el=>({border:getComputedStyle(el).borderTopColor,stroke:getComputedStyle(document.querySelector('.ew-financial-connection-line')).stroke}))
  expect(colors.border).toBe(colors.stroke)
  await page.screenshot({path:evidence+'/overflow-openterminal.png'})
  await arrow.click();await page.waitForFunction(()=>document.querySelector('[role=tablist]').scrollLeft>0)
  expect(await list.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
  await page.evaluate(()=>window.fixture.select([]));await page.waitForFunction(()=>!document.querySelector('[data-financial-connection-target]')&&!document.querySelector('[data-financial-connection-stem]'));expect(await page.locator('[data-financial-connection-target]').count()).toBe(0);expect(await page.locator('[data-financial-connection-stem]').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)


it('竖向页签的跨页连线从标签右侧接出，保留可点击的页签',async()=>{
 const {page,errors}=await fixture()
 try{
  await page.evaluate(()=>window.fixture.vertical())
  await page.waitForSelector('[data-financial-connection-stem][data-side=right]')
  const route=await page.evaluate(()=>{
   const stem=document.querySelector('[data-financial-connection-stem]'),tab=document.querySelector('[data-board-tab=remote]')
   const line=document.querySelector('.ew-financial-connection-line'),p=line.getPointAtLength(line.getTotalLength()).matrixTransform(line.getScreenCTM())
   return {stem:stem.getBoundingClientRect().toJSON(),tab:tab.getBoundingClientRect().toJSON(),end:{x:p.x,y:p.y},right:tab.closest('[data-board-tabs-nav]').getBoundingClientRect().right}
  })
  expect(route.end.x).toBeCloseTo(route.right)
  expect(route.end.y).toBeCloseTo(route.tab.y+route.tab.height/2)
  expect(route.stem.height).toBeCloseTo(1.5)
  expect(route.stem.right).toBeCloseTo(route.right)
  await page.locator('[data-board-tab=remote]').click()
  expect(await page.locator('[data-board-tab=remote]').getAttribute('aria-selected')).toBe('true')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('看板缩放并滚动后，连线仍从实际端口接出',async()=>{
 const {page,errors}=await fixture()
 try{
  const aligned=()=> {
   const path=document.querySelector('.ew-financial-connection-line'),port=document.querySelector('[data-financial-port-node=watch][data-financial-port=output]')
   const root=document.querySelector('main')
   if(!path||!port||root.scrollTop===0)return false
   const p=path.getPointAtLength(0).matrixTransform(path.getScreenCTM()),r=port.getBoundingClientRect()
   return Math.hypot(p.x-r.left-r.width/2,p.y-r.top-r.height/2)<1
  }
  for(const zoom of [.7,1.3]){
   await page.locator('main').evaluate((root,zoom)=>{
    Object.assign(root.style,{zoom,border:'2px solid transparent'})
    root.style.setProperty('height','440px','important')
    root.style.setProperty('overflow','auto','important')
    root.scrollTop=80
   },zoom)
   await page.waitForFunction(aligned,null,{timeout:3000})
  }
  expect(errors).toEqual([])
 }finally{await page.close()}
})
