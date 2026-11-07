// Focused real Chromium acceptance; transforms a copy, never shared node_modules.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { patchFigmaFinalCanvas } from './lib/figma-canvas-client.mjs'
import { patchCanvasCreationTools } from './lib/canvas-creation-tools.mjs'
import { generationSource, generationCss } from './lib/figma-generation-client.mjs'

const output=fileURLToPath(new URL('../output/research-generation-design/',import.meta.url))
await mkdir(output,{recursive:true})
const playwrightModule=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const playwright=playwrightModule.default??playwrightModule
const installed=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const source=patchCanvasCreationTools(patchFigmaFinalCanvas(installed))
assert.equal(patchCanvasCreationTools(patchFigmaFinalCanvas(source)),source,'complete patch stack remains idempotent')
const dependencies=await build({stdin:{contents:`import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';window.testDeps={react,jsx,dom,createRoot};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const report={source:'Figma 1300:300378',cases:[],checks:[]}
try {
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[]
  page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE',error.message)})
  await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<style>body{margin:0}#mount{height:820px;width:1080px}</style><div id="mount"></div>'}):route.abort())
  await page.goto('https://generation.fixture/')
  await page.addScriptTag({content:dependencies.outputFiles[0].text})
  await page.evaluate(()=>{window.__ModuleLoader__={load:value=>window.descriptor=value};window.dshDesktop={}})
  await page.addScriptTag({content:source})
  // The packaged preload adds these gesture styles after the vendor module.
  // Loading the same stylesheet prevents its legacy 44px SVG corners leaking
  // into fixture screenshots; no fixture-only corner suppression is applied.
  await page.addStyleTag({content:await readFile('src/preload/figma-canvas-gestures.css','utf8')})
  await page.evaluate(()=>{
    const {react,jsx,dom,createRoot}=testDeps
    const fake=new Proxy(function(){return null},{get:()=>fake,construct:()=>({})})
    const primitives=new Proxy({MarkdownText:({text})=>react.createElement('div',null,text)},{get:(target,key)=>Reflect.get(target,key)??(String(key).startsWith('Icon')?()=>null:fake)})
    const client=descriptor.factory(id=>({'react':react,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/dsh-client-ui-primitives':primitives}[id]??fake))
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);return true}},registry=new client.ResearchWorkspaceRegistry(storage)
    window.addEventListener('sherlock:component-process',e=>{e.detail.handled=true;window.processAddress={parentSessionId:e.detail.parentSessionId,childSessionId:e.detail.childSessionId};e.detail.resolve()});
    window.workspace=registry.for('generation');window.root=createRoot(document.querySelector('#mount'))
    dom.flushSync(()=>root.render(react.createElement(client.ResearchCanvas,{sessionId:'generation',t:key=>key,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({ok:true})}})))
    window.reset=({theme='light',width=620,height=300,state='running'}={})=>dom.flushSync(()=>{
      document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
      workspace.setArtifacts([{id:'card',kind:'generated-container',messageId:'card',title:'基金筛选与比较',excerpt:'正在核验基金数据',containerPrompt:'筛选基金并比较表现',refreshMinutes:0,x:50+width/2,y:50+height/2,width,height,sizeMode:'manual',generationStatus:'running',generationTaskId:'task-'+state,generationChildSessionId:'child-'+state,generationStartedAt:Date.now()-18000,generationCompletedAt:['failed','cancelled'].includes(state)?Date.now():undefined,generationLastSeq:0,generationEvents:[{taskId:'task-'+state,canvasNodeId:'card',seq:1,type:'tool-started',tool:'基金数据核验',detail:'已核验 1,286 只基金的规模与经理任职，正在计算候选基金的收益和最大回撤。'}],generationError:state==='failed'?'数据源响应超时，已保留本次研究条件':undefined}])
      workspace.applyGenerationInspection('card',{taskId:'task-'+state,canvasNodeId:'card',state,lastSeq:1,events:[{taskId:'task-'+state,canvasNodeId:'card',seq:1,type:'tool-started',tool:'基金数据核验',detail:'已核验 1,286 只基金的规模与经理任职，正在计算候选基金的收益和最大回撤。'}],error:state==='failed'?'数据源响应超时，已保留本次研究条件':undefined})
      workspace.setViewport({x:0,y:0,scale:1});workspace.updateSelection([],'replace')
    })
    window.metrics=()=>{
      const surface=document.querySelector('[data-research-generation-process]'),card=document.querySelector('[data-research-node-id="card"]'),dots=surface.querySelector('[data-research-generation-dots]'),foreground=surface.querySelector('[data-research-generation-foreground]')
      const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
      return{node:workspace.getSnapshot().artifacts[0],card:box(card),surface:box(surface),foreground:box(foreground),foregroundTransform:getComputedStyle(foreground).transform,background:getComputedStyle(surface).backgroundColor,filter:getComputedStyle(surface).filter,backdrop:getComputedStyle(surface).backdropFilter,motion:getComputedStyle(dots).animationPlayState,animations:dots.getAnimations().map(a=>({currentTime:a.currentTime,playState:a.playState})),text:foreground.textContent,state:surface.dataset.generationUiState,overflow:foreground.scrollHeight>foreground.clientHeight}
    }
  })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('odyssey:creation-progress', {detail:{sessionId:'generation',intent:{id:'fixture-planning',kind:'workbench',request:'请创建金融行情工作台，包含蜡烛图、热力图和新闻列表',description:'请创建金融行情工作台，包含蜡烛图、热力图和新闻列表',types:['蜡烛图','热力图','新闻列表'],startedAt:Date.now()-5000,state:'planning',sawRunning:true}}})))
  await page.locator('[data-research-creation-planning="planning"]').waitFor()
  assert.match(await page.locator('[data-research-creation-planning]').innerText(),/创建工作台.*正在整理内容与布局/s)
  assert.match(await page.locator('[data-research-creation-planning] time').innerText(),/^00:0[5-9]$/)
  const planningLight=await page.locator('[data-research-creation-planning]').evaluate(el=>({
    size:[el.clientWidth,el.clientHeight],surface:getComputedStyle(el.querySelector('[data-research-generation-process]')).backgroundColor,
    dots:!!el.querySelector('[data-research-generation-dots]'),icon:!!el.querySelector('.odyssey-generation-state-icon')
  }))
  assert.deepEqual(planningLight,{size:[320,220],surface:'rgb(250, 250, 250)',dots:true,icon:true})
  const planningCard=page.locator('[data-research-creation-planning]')
  const initialBox=await planningCard.boundingBox()
  await page.mouse.move(initialBox.x+100,initialBox.y+100)
  await page.mouse.down()
  await page.mouse.move(initialBox.x+182,initialBox.y+148,{steps:4})
  assert.equal(await page.locator('[data-research-marquee]').count(),0,'dragging a planning card never starts a canvas selection rectangle')
  assert.equal(await page.locator('[data-research-canvas][data-research-operation]').count(),0,'the canvas does not capture the planning card pointer')
  await page.mouse.up()
  const draggedBox=await planningCard.boundingBox()
  assert.ok(draggedBox.x-initialBox.x>72 && draggedBox.y-initialBox.y>38,'planning card drags in canvas coordinates')
  const beforePan=await page.evaluate(()=>workspace.getSnapshot().viewport)
  await page.mouse.move(850,600)
  await page.mouse.wheel(0,100)
  await page.waitForFunction(y=>workspace.getSnapshot().viewport.y<y,beforePan.y)
  const pannedBox=await planningCard.boundingBox()
  assert.ok(pannedBox.y<draggedBox.y-5,'planning card moves with canvas pan')
  const beforeZoom=await page.evaluate(()=>workspace.getSnapshot().viewport.scale)
  await page.keyboard.down('Meta')
  await page.mouse.wheel(0,-150)
  await page.keyboard.up('Meta')
  await page.waitForFunction(scale=>workspace.getSnapshot().viewport.scale>scale,beforeZoom)
  const zoomedBox=await planningCard.boundingBox()
  assert.ok(zoomedBox.width>draggedBox.width,'planning card scales with the canvas')
  await page.evaluate(()=>workspace.setViewport({x:0,y:0,scale:1}))
  await page.locator('[data-research-creation-planning]').hover()
  assert.equal(await page.getByRole('button',{name:'停止生成'}).isVisible(),true)
  assert.equal(await page.getByRole('button',{name:'查看过程'}).isVisible(),true)
  await page.screenshot({path:output+'early-workbench-planning.png'})
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme',''))
  const planningDark = await page.locator('[data-research-creation-planning]').evaluate(el => ({
    background: getComputedStyle(el.querySelector('[data-research-generation-process]')).backgroundColor,
    text: getComputedStyle(el.querySelector('[data-research-generation-foreground]>strong')).color,
    phase: getComputedStyle(el.querySelector('.odyssey-generation-phase')).color
  }))
  assert.deepEqual(planningDark, { background: 'rgb(3, 3, 3)', text: 'rgb(245, 245, 245)', phase: 'rgb(219, 219, 219)' })
  await page.screenshot({path:output+'early-workbench-planning-dark.png'})
  await page.getByRole('button',{name:'查看过程'}).click()
  assert.equal(await page.getByRole('region',{name:'生成过程'}).isVisible(),true)
  await page.getByRole('button',{name:'返回卡片'}).click()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('odyssey:creation-progress', {detail:{sessionId:'generation',intent:{id:'fixture-planning',kind:'workbench',request:'请创建金融行情工作台',description:'请创建金融行情工作台',types:[],startedAt:Date.now()-5000,completedAt:Date.now(),state:'failed'}}})))
  await page.locator('[data-research-creation-planning="failed"]').waitFor()
  await page.locator('[data-research-creation-planning]').hover()
  assert.equal(await page.getByRole('button',{name:'重试生成'}).isVisible(),true)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('odyssey:creation-progress', {detail:{sessionId:'generation',intent:null}})))
  await page.locator('[data-research-creation-planning]').waitFor({state:'detached'})
  report.checks.push('workbench planning reuses the existing 320×220 Figma status card; it drags, pans and zooms with the canvas while preserving hover actions, elapsed time and terminal states')
  await page.evaluate(()=>workspace.applyWorkbench({id:'fixture-workbench',createdAt:Date.now(),panels:[
    {nodeId:'planned-metrics',taskId:'task-metrics',title:'模拟行情指标',prompt:'模拟行情指标',type:'market',size:'medium',x:0,y:0,width:896,height:144},
    {nodeId:'planned-candle',taskId:'task-candle',title:'模拟日 K 线',prompt:'variant: candlestick；模拟 OHLC 与成交量',type:'market',size:'large',x:0,y:160,width:536,height:264},
    {nodeId:'planned-news',taskId:'task-news',title:'模拟资讯列表',prompt:'模拟资讯列表',type:'news',size:'large',x:552,y:160,width:434,height:264}
  ]}))
  await page.locator('[data-research-node-id="planned-metrics"]').waitFor()
  assert.equal(await page.locator('[data-research-node-id^="planned-"]').count(),1,'first named card appears before the others')
  await page.locator('[data-research-node-id="planned-news"]').waitFor()
  assert.equal(await page.locator('[data-research-node-id^="planned-"]').count(),3)
  await page.evaluate(()=>workspace.applyGenerationInspection('planned-candle',{taskId:'task-candle',canvasNodeId:'planned-candle',state:'running',lastSeq:2,events:[
    {taskId:'task-candle',canvasNodeId:'planned-candle',seq:1,type:'started'},
    {taskId:'task-candle',canvasNodeId:'planned-candle',seq:2,type:'tool-started',tool:'数据准备',detail:'正在检查模拟 OHLC 字段'}
  ]}))
  await page.waitForFunction(()=>document.querySelector('[data-research-node-id="planned-candle"] .odyssey-generation-phase')?.textContent==='正在整理资料')
  await page.evaluate(()=>workspace.applyGenerationInspection('planned-candle',{taskId:'task-candle',canvasNodeId:'planned-candle',state:'running',lastSeq:3,events:[
    {taskId:'task-candle',canvasNodeId:'planned-candle',seq:3,type:'assistant-delta',text:'{"version":1,"type":"market","title":"模拟日 K 线","candles":[{"date":"2026-06-01","close":100}]}' }
  ]}))
  await page.waitForFunction(()=>document.querySelector('[data-research-node-id="planned-candle"] [data-research-generation-description]')?.textContent?.includes('已写入 2 个数据字段'))
  assert.equal(await page.locator('[data-research-node-id="planned-candle"] strong').first().textContent(),'模拟日 K 线')
  await page.screenshot({path:output+'planned-workbench-generation.png'})
  report.checks.push('accepted workbench reveals named cards sequentially, keeps them in canvas coordinates, and updates phase and execution text from real task events')
  await page.evaluate(() => {
    workspace.setArtifacts([]); workspace.setViewport({x:0,y:0,scale:1})
    workspace.applyWorkbench({id:'five-planned',createdAt:Date.now(),ready:false,panels:
      Array.from({length:5},(_,i)=>({nodeId:'five-'+i,taskId:'five-task-'+i,title:'模拟面板 '+(i+1),prompt:'生成模拟面板 '+(i+1),type:'markdown',size:'small',x:i%2*336,y:Math.floor(i/2)*236,width:320,height:220}))})
  })
  await page.waitForFunction(()=>document.querySelectorAll('[data-research-artifact-card^="five-"] [data-research-generation-process]').length===5)
  assert.equal(await page.locator('[data-research-artifact-card^="five-"] [data-research-generation-process]').count(),5)
  await page.screenshot({path:output+'five-planned-cards.png'})
  await page.evaluate(() => workspace.applyGenerationInspection('five-2',{
    taskId:'five-task-2',canvasNodeId:'five-2',state:'completed',lastSeq:1,
    events:[],finalOutput:JSON.stringify({version:1,type:'markdown',title:'模拟面板 3',content:'第三个面板已完成'})
  }))
  await page.waitForFunction(()=>document.querySelector('[data-research-artifact-card="five-2"]')?.getAttribute('data-research-generation-state')==='completed')
  assert.equal(await page.locator('[data-research-artifact-card^="five-"] [data-research-generation-process]').count(),4)
  assert.match(await page.locator('[data-research-artifact-card="five-2"]').innerText(),/第三个面板已完成/)
  report.checks.push('five planned panels all paint as independent waiting cards, and a completed panel immediately replaces only its own card')
  await page.evaluate(()=>{workspace.setArtifacts([]);workspace.setViewport({x:0,y:0,scale:1})})
  // These transparent PNGs are rasterized from the complete Figma SVGs with
  // paint alpha restored from the actual source vectors (see provenance).
  report.dotSourceParity=[]
  await page.emulateMedia({reducedMotion:'reduce'})
  for(const theme of ['light','dark']) for(const [shape,width,height] of [['wide',620,300],['tall',240,620],['compact',360,200]]) {
    await page.evaluate(value=>reset({...value,state:'queued'}),{theme,width,height})
    await page.waitForFunction(profile=>document.querySelector('[data-research-generation-dots]')?.dataset.dotProfile===profile,theme+'-'+shape)
    const reference='data:image/png;base64,'+(await readFile('build/figma-generation/reference/'+theme+'-'+shape+'.png')).toString('base64')
    const result=await page.locator('[data-research-generation-dots]').evaluate(async(canvas,reference)=>{
      const image=new Image();image.src=reference;await image.decode()
      const expected=document.createElement('canvas');expected.width=canvas.width;expected.height=canvas.height
      const context=expected.getContext('2d');context.drawImage(image,0,0,expected.width,expected.height)
      const a=context.getImageData(0,0,expected.width,expected.height).data,b=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
      let total=0,maximum=0,overOne=0
      for(let i=3;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i]);total+=delta;maximum=Math.max(maximum,delta);if(delta>1)overOne++}
      return{meanAlphaError:total/(a.length/4),maximumAlphaError:maximum,pixelsOverOne:overOne,pixels:a.length/4,phase:canvas.dataset.dotPhase,render:canvas.toDataURL()}
    },reference)
    assert.equal(result.phase,'0')
    assert.ok(result.meanAlphaError < .1,'full source field mean alpha error stays below 0.1/255')
    assert.ok(result.maximumAlphaError <= 5,'no source pixel alpha differs by more than 5/255')
    assert.ok(result.pixelsOverOne / result.pixels < .004,'at least 99.6% of pixels remain within 1/255 alpha')
    const {render,...parity}=result;report.dotSourceParity.push({theme,shape,...parity})
    await writeFile(output+theme+'-'+shape+'-source-phase0.png',Buffer.from(render.split(',')[1],'base64'))
    if(shape==='wide') {
      const compare=await browser.newPage({viewport:{width:1920,height:380}})
      const oldTile='data:image/svg+xml;base64,'+(await readFile('build/figma-generation/dot-grid.svg')).toString('base64')
      await compare.setContent(`<style>body{margin:0;background:${theme==='dark'?'#181818':'#ececec'};color:${theme==='dark'?'#eee':'#222'};font:14px sans-serif}.comparison{display:flex;gap:12px;padding:12px}.field{width:620px;height:300px;border-radius:8px;overflow:hidden;position:relative;background:${theme==='dark'?'#030303':'#fafafa'}}label{display:block;margin-bottom:10px}.old{position:absolute;inset:0;background-image:url('${oldTile}');background-size:9.921px 9.921px;mask-image:linear-gradient(115deg,rgba(0,0,0,.16) 0%,rgba(0,0,0,.30) 20%,rgba(0,0,0,.55) 42%,rgba(0,0,0,.21) 60%,rgba(0,0,0,.45) 80%,rgba(0,0,0,.16) 100%);mask-size:200% 100%;mask-position:200% 0}</style><div class="comparison"><section><label>Figma 完整点场 · 精确源 alpha</label><div class="field"><img src="${reference}"></div></section><section><label>旧实现 · 单点重复 + 遮罩</label><div class="field"><div class="old"></div></div></section><section><label>新实现 · 完整点场 phase 0</label><div class="field"><img src="${render}"></div></section></div>`)
      await compare.screenshot({path:output+theme+'-source-old-new.png'});await compare.close()
    }
  }
  report.checks.push('six phase-zero fields preserve full Figma dot geometry and alpha: mean error <0.1/255, maximum ≤5/255, 99.6% within 1/255')
  await page.emulateMedia({reducedMotion:'no-preference'})
  for(const state of ['cancelled','failed']) {
    await page.evaluate(state=>reset({state}),state)
    const alpha=await page.locator('.odyssey-generation-state-icon').evaluate(async el=>{
      const image=new Image();image.src=getComputedStyle(el).maskImage.match(/url\(["']?([^"')]+)["']?\)/)[1];await image.decode()
      const canvas=document.createElement('canvas');canvas.width=canvas.height=180
      const context=canvas.getContext('2d');context.drawImage(image,0,0,180,180)
      const at=(x,y)=>context.getImageData(Math.floor(x*10),Math.floor(y*10),1,1).data[3]
      return{outside:at(1,1),interior:[[4.5,9],[13.5,9],[9,4.5],[9,13.5]].map(([x,y])=>at(x,y)),ring:at(9,2.65),square:at(9,9),stem:at(9,7),point:at(9,11.9),gap:at(9,10.5)}
    })
    assert.equal(alpha.outside,0);assert.deepEqual(alpha.interior,[0,0,0,0],`${state} ring interior is transparent, not a solid circle`);assert.ok(alpha.ring>240)
    if(state==='cancelled')assert.ok(alpha.square>240,'stop square is present inside the transparent ring')
    else{assert.ok(alpha.stem>240);assert.ok(alpha.point>240);assert.equal(alpha.gap,0,'exclamation stem and point remain separated')}
  }
  report.checks.push('actual stopped/error SVG masks have transparent ring interiors and opaque center glyphs')
  for(const theme of ['light','dark']) for(const [shape,width,height] of [['wide',620,300],['tall',240,620],['compact',360,200]]) for(const state of ['running','cancelled','failed']) {
    await page.evaluate(value=>reset(value),{theme,width,height,state})
    try { await page.waitForSelector('[data-research-generation-process]',{timeout:4000}) }
    catch(error) { console.error(await page.evaluate(()=>({snapshot:workspace.getSnapshot(),html:document.querySelector('#mount').innerHTML.slice(0,5000)})));throw error }
    await page.waitForFunction(({width,height})=>document.querySelector('[data-research-generation-dots]')?.dataset.dotGeometry?.startsWith(width+':'+height+':'),{width,height})
    await page.mouse.move(1040,760)
    const before=await page.evaluate(()=>metrics())
    assert.equal(before.card.width,width);assert.equal(before.card.height,height);assert.equal(before.surface.width,width);assert.equal(before.surface.height,height)
    assert.equal(before.background,theme==='dark'?'rgb(3, 3, 3)':'rgb(250, 250, 250)','generated surface overrides old content backgrounds with the actual Figma paint');
    assert.equal(before.motion,state==='running'?'running':'paused');assert.equal(before.filter,'none');assert.equal(before.backdrop,'none')
    const dots=page.locator('[data-research-generation-dots]')
    const staticDots=createHash('sha256').update(await dots.evaluate(el=>el.toDataURL())).digest('hex')
    const first=await page.locator('[data-research-generation-process]').screenshot({animations:'allow'})
    await page.waitForTimeout(900)
    const second=await page.locator('[data-research-generation-process]').screenshot({animations:'allow'}),after=await page.evaluate(()=>metrics())
    assert.equal(createHash('sha256').update(await dots.evaluate(el=>el.toDataURL())).digest('hex'),staticDots,'dot geometry is painted once, not redrawn every animation frame')
    assert.deepEqual(after.foreground,before.foreground,'foreground never translates or reflows while background moves')
    assert.equal(after.foregroundTransform,'none')
    const different=createHash('sha256').update(first).digest('hex')!==createHash('sha256').update(second).digest('hex')
    assert.equal(different,state==='running','running dots receive moving light; stopped/error pixels remain unchanged')
    await page.locator('[data-research-generation-process]').hover()
    const action=state==='running'?'停止生成':state==='failed'?'重试生成':'重新生成'
    const button=page.getByRole('button',{name:action,exact:true});await button.hover()
    const buttonBox=await button.boundingBox();assert.equal(buttonBox.width,24);assert.equal(buttonBox.height,24)
    const actionTip=page.locator('[role=tooltip]').filter({hasText:action})
    assert.equal(await actionTip.isVisible(),true)
    assert.equal(await actionTip.textContent(),action)
    const bubble=await actionTip.boundingBox()
    assert.ok(bubble.y+bubble.height<=buttonBox.y,'generation tooltip matches the completed-card bubble above its button: '+JSON.stringify({bubble,buttonBox,theme,shape,state}))
    assert.equal(await actionTip.evaluate(el=>el.parentElement===document.body),true,'tooltip escapes clipped card surface')
    await page.waitForTimeout(750)
    assert.equal(await actionTip.isVisible(),true,'the action tooltip remains visible across progress and elapsed-time renders')
    assert.equal(await page.locator('[role=tooltip]').evaluateAll(tips=>tips.filter(el=>getComputedStyle(el).visibility==='visible').length),1,'only the hovered action shows a tooltip')
    const tipFits=await actionTip.evaluate(el=>{const box=el.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth})
    assert.equal(tipFits,true,'the action name bubble is fully visible above the card')
    assert.equal((await page.evaluate(()=>metrics())).motion,state==='running'?'running':'paused','hover does not pause motion')
    await page.screenshot({path:output+`${theme}-${shape}-${state}.png`,animations:'allow'})
    await button.focus();await page.keyboard.press('Escape');assert.equal(await actionTip.isVisible(),false)
    const process=page.getByRole('button',{name:'查看过程',exact:true});await process.hover()
    const processTip=page.locator('[role=tooltip]').filter({hasText:'查看过程'})
    assert.equal(await processTip.isVisible(),true)
    assert.equal(await processTip.textContent(),'查看过程')
    assert.equal(await actionTip.isVisible(),false)
    await process.click()
    assert.equal(await page.locator('[data-research-generation-records]').count(),0)
    assert.deepEqual(await page.evaluate(()=>processAddress),{parentSessionId:'generation',childSessionId:'child-'+state})
    assert.deepEqual((await page.evaluate(()=>metrics())).card,before.card,'opening process preserves card bounds')
    assert.equal(await page.locator('[data-research-generation-foreground]').isVisible(),true)
    report.cases.push({theme,shape,state,width,height,foreground:before.foreground,animationPixelsChanged:different,button:buttonBox,processPreservesBounds:true})
  }
  for(const theme of ['light','dark']) for(const [shape,width,height] of [['wide',620,300],['tall',240,620],['compact',360,200]]) {
    await page.evaluate(value=>{
      reset(value)
      workspace.applyGenerationInspection('card',{taskId:'task-running',canvasNodeId:'card',state:'running',lastSeq:12,events:Array.from({length:11},(_,index)=>({taskId:'task-running',canvasNodeId:'card',seq:index+2,type:'tool-started',tool:'核验步骤 '+(index+2),detail:'依据公开资料核对样本、时间口径、基金规模、经理任职、累计收益和最大回撤。'.repeat(7)}))})
    },{theme,width,height})
    const before=await page.evaluate(()=>metrics())
    await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'查看过程',exact:true}).click()
    assert.equal(await page.locator('[data-research-generation-records]').count(),0)
    const previous=await page.locator('[data-progress-ticker]').textContent()
    await page.waitForTimeout(650)
    assert.equal(await page.locator('[data-progress-ticker]').textContent(),previous,'unchanged task events must not replay stale activity')
    await page.evaluate(()=>workspace.applyGenerationInspection('card',{taskId:'task-running',canvasNodeId:'card',state:'running',lastSeq:13,events:[{taskId:'task-running',canvasNodeId:'card',seq:13,type:'tool-started',tool:'内容校验',detail:'正在核对新的样本与时间口径'}]}))
    assert.notEqual(await page.locator('[data-progress-ticker]').textContent(),previous)
    assert.deepEqual((await page.evaluate(()=>metrics())).card,before.card)
    assert.equal(await page.locator('[data-research-generation-foreground]').isVisible(),true)
    assert.equal(await page.locator('[data-research-generation-elapsed]').isVisible(),true)
    await page.screenshot({path:output+`${theme}-${shape}-progress-ticker.png`,animations:'allow'})
  }
  report.checks.push('Light/Dark wide/tall/compact execution text advances on actual task events and does not replay stale updates; process opens the exact child session without moving the card')
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{reset({theme,state:'failed'});workspace.updateSelection(['card'],'replace')},theme)
    await page.waitForFunction(()=>document.querySelector('[data-research-node-id="card"]')?.getAttribute('data-selected')==='true')
    const layer=await page.locator('[data-research-node-id="card"]').evaluate(el=>({
      foreground:getComputedStyle(el,'::after').zIndex,
      ring:getComputedStyle(el,'::after').boxShadow,
      native:getComputedStyle(el).boxShadow,
      surface:getComputedStyle(el.querySelector('[data-research-generation-process]')).zIndex
    }))
    assert.equal(layer.foreground,'50','selection ring is layered above card content')
    assert.match(layer.ring,/inset/)
    assert.equal(layer.native,'none','host shadow cannot be hidden behind the card')
    await page.screenshot({path:output+`${theme}-selected-foreground-ring.png`})
  }
  report.checks.push('Light/Dark selected ring and drag glow paint on a foreground pseudo-element above the full-bleed card')
  await page.evaluate(()=>{reset();workspace.setGenerationCancelSink(()=>new Promise(resolve=>{window.resolveCancel=resolve}))})
  await page.waitForFunction(()=>document.querySelector('[data-research-generation-dots]')?.dataset.dotGeometry?.startsWith('620:300:'))
  await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'停止生成',exact:true}).click()
  assert.equal((await page.evaluate(()=>metrics())).state,'stopping')
  const stoppedPhase=await page.locator('[data-research-generation-dots]').evaluate(el=>({phase:el.dataset.dotPhase,pixels:el.toDataURL().length,geometry:el.dataset.dotGeometry}))
  await page.waitForTimeout(150)
  assert.deepEqual(await page.locator('[data-research-generation-dots]').evaluate(el=>({phase:el.dataset.dotPhase,pixels:el.toDataURL().length,geometry:el.dataset.dotGeometry})),stoppedPhase,'stopping freezes the static background geometry')
  await page.evaluate(()=>resolveCancel({ok:true}));await page.waitForTimeout(20)
  assert.equal((await page.evaluate(()=>metrics())).state,'stopping','acknowledgement does not fake terminal status')
  await page.evaluate(()=>workspace.applyGenerationInspection('card',{taskId:'task-running',canvasNodeId:'card',state:'cancelled',lastSeq:2,events:[]}))
  await page.waitForFunction(()=>metrics().state==='stopped')
  report.checks.push('stop waits for real terminal inspection')
  for(const [width,height] of [[240,620],[360,200]]) {
    await page.evaluate(value=>reset({...value,state:'failed'}),{width,height})
    const before=await page.evaluate(()=>metrics().node)
    await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'重试生成',exact:true}).click()
    await page.waitForFunction(()=>workspace.getSnapshot().artifacts[0].generationStatus==='queued')
    const after=await page.evaluate(()=>workspace.getSnapshot().artifacts[0])
    for(const key of ['x','y','width','height','sizeMode'])assert.equal(after[key],before[key])
  }
  report.checks.push('manual retry 240×620 and 360×200 retains exact geometry')
  await page.evaluate(()=>reset({theme:'dark'}))
  const anchored=await page.evaluate(()=>metrics().foreground.y)
  await page.evaluate(()=>workspace.applyGenerationInspection('card',{taskId:'task-running',canvasNodeId:'card',state:'running',lastSeq:2,events:[{taskId:'task-running',canvasNodeId:'card',seq:2,type:'tool-started',tool:'分析',detail:'研究阶段的新信息与实际过程更新。'.repeat(18)}]}))
  assert.equal((await page.evaluate(()=>metrics())).foreground.y,anchored,'long process text cannot shift the foreground anchor')
  report.checks.push('long public process updates retain the exact foreground top')
  await page.evaluate(()=>reset({state:'queued'}))
  const waitingAtStart = await page.locator('[data-research-generation-elapsed]').textContent()
  assert.ok(/^00:(?:18|19)$/.test(waitingAtStart), 'queued card includes time since the request started')
  await page.waitForTimeout(1100)
  const waitingAfterTick = await page.locator('[data-research-generation-elapsed]').textContent()
  assert.ok(Number(waitingAfterTick.slice(-2)) > Number(waitingAtStart.slice(-2)), 'queued elapsed time keeps advancing')
  assert.equal((await page.evaluate(()=>metrics())).motion,'paused')
  report.checks.push('waiting keeps dots still while elapsed time advances from submission')
  await page.evaluate(()=>reset({theme:'dark'}));await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await page.locator('[data-research-generation-dots]').evaluate(el=>el.getAnimations().length),0)
  assert.equal(await page.locator('.odyssey-generation-state-icon').evaluate(el=>el.getAnimations().length),0)
  await page.screenshot({path:output+'dark-reduced-motion.png'})
  report.checks.push('reduced motion disables dot and state icon animations')
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{
      document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
      testDeps.dom.flushSync(()=>{workspace.setArtifacts([]);workspace.createContainerDraft({x:230,y:150,width:360,height:200,sizeMode:'manual'});workspace.setViewport({x:0,y:0,scale:1})})
    },theme)
    const input=page.locator('[data-research-container-prompt]')
    await input.focus();await input.press('Enter')
    assert.equal(await page.evaluate(()=>workspace.getSnapshot().artifacts[0].generationStatus),'draft','empty manual prompt cannot submit')
    await input.fill('核对原稿输入控件');await input.focus()
    const style=await input.evaluate(el=>{const probe=document.createElement('div');probe.style.border='1px solid var(--dsw-alias-border-l2)';el.parentElement.append(probe);const neutralBorder=getComputedStyle(probe).borderTopColor;probe.remove();return{border:getComputedStyle(el).borderTopColor,neutralBorder,shadow:getComputedStyle(el).boxShadow,padding:getComputedStyle(el.parentElement).padding}})
    assert.equal(style.border,style.neutralBorder,'focused manual input keeps the neutral border');assert.equal(style.shadow,'none');assert.equal(style.padding,'18px')
    const button=await page.locator('[data-research-container-submit]').boundingBox();assert.equal(button.width,92);assert.equal(button.height,32)
    await page.screenshot({path:output+`${theme}-manual-editor-focused.png`})
    await input.press('End');await input.press('Shift+Enter');await input.pressSequentially('保留第二行')
    assert.equal(await input.inputValue(),'核对原稿输入控件\n保留第二行','Shift+Enter inserts a real textarea newline')
    await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,isComposing:true,bubbles:true,cancelable:true})))
    assert.equal(await page.evaluate(()=>workspace.getSnapshot().artifacts[0].generationStatus),'draft','IME confirmation does not submit even with a modifier')
    const bounds=await page.evaluate(()=>{const {x,y,width,height,sizeMode}=workspace.getSnapshot().artifacts[0];return{x,y,width,height,sizeMode}})
    await input.press('Enter');await page.waitForFunction(()=>workspace.getSnapshot().artifacts[0].generationStatus==='queued')
    assert.deepEqual(await page.evaluate(()=>{const {x,y,width,height,sizeMode}=workspace.getSnapshot().artifacts[0];return{x,y,width,height,sizeMode}}),bounds)
  }
  report.checks.push('manual Light/Dark editor focus and caret are neutral; padding18 and button92×32')
  report.checks.push('manual composer: Enter submits, Shift+Enter inserts a newline, empty/IME Enter does not submit, world bounds remain unchanged')
  await page.evaluate(()=>{testDeps.dom.flushSync(()=>workspace.setArtifacts([]));workspace.setViewport({x:0,y:0,scale:1})})
  await page.locator('[data-research-global-link]').click()
  const link=page.locator('[data-research-link-draft]')
  await link.waitFor()
  const measureLink=()=>link.evaluate(card=>{
    const editor=card.querySelector('textarea'),footer=card.querySelector('.rScV5Q_containerDraftFooter'),button=footer.querySelector('button')
    const box=element=>{const rect=element.getBoundingClientRect();return{top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}}
    return{card:box(card),editor:box(editor),footer:box(footer),button:box(button),direction:getComputedStyle(editor.parentElement).flexDirection,flex:getComputedStyle(editor).flex}
  })
  const linkLayout=await measureLink()
  assert.equal(linkLayout.direction,'column')
  assert.ok(linkLayout.editor.height>44,'link editor fills the minimum card height: '+JSON.stringify(linkLayout))
  assert.ok(linkLayout.footer.top>=linkLayout.editor.bottom,'create action remains below the editor')
  assert.ok(linkLayout.card.bottom-linkLayout.footer.bottom<=28,'create action stays at the card bottom')
  assert.equal(linkLayout.button.width,92);assert.equal(linkLayout.button.height,32)
  await page.evaluate(()=>testDeps.dom.flushSync(()=>workspace.setArtifacts(workspace.getSnapshot().artifacts.map(node=>node.containerPrompt==='odyssey:link-draft'?{...node,width:561,height:422}:node))))
  const enlargedLink=await measureLink()
  assert.equal(enlargedLink.card.width,561);assert.equal(enlargedLink.card.height,422)
  assert.ok(enlargedLink.editor.height>linkLayout.editor.height+150,'link editor grows with the resized card: '+JSON.stringify({linkLayout,enlargedLink}))
  assert.ok(enlargedLink.card.bottom-enlargedLink.footer.bottom<=28,'create action stays at the enlarged card bottom')
  await page.screenshot({path:output+'link-draft-filled-editor.png'})
  report.checks.push('link draft editor grows from its 320×220 minimum to a 561×422 card; 92×32 action stays pinned at the bottom')
  // The shipped dot field paints once; a compositor-only masked gloss moves
  // above it. Sample actual pixels across time and after resize/stop/retry.
  const dotSource=generationSource.slice(generationSource.indexOf('function ResearchGenerationDots('),generationSource.indexOf('function ResearchGenerationAction('))
  async function dotPage({record=false}={}) {
    const context=await browser.newContext({viewport:{width:660,height:340},...(record?{recordVideo:{dir:output+'motion',size:{width:660,height:340}}}:{})})
    const preview=await context.newPage()
    await preview.setContent('<style>body{margin:0;background:#191919;padding:20px}#field{position:relative;isolation:isolate;width:620px;height:300px;overflow:hidden;border-radius:8px;background:#030303}</style><div id="field"></div>')
    await preview.addStyleTag({content:generationCss})
    await preview.addScriptTag({content:dependencies.outputFiles[0].text})
    await preview.addScriptTag({content:'const react=testDeps.react,react_jsx_runtime=testDeps.jsx;'+dotSource+';window.Dot=ResearchGenerationDots;'})
    await preview.evaluate(()=>{
      document.body.setAttribute('data-ds-dark-theme','')
      window.dotRoot=testDeps.createRoot(document.querySelector('#field'))
      window.move=value=>testDeps.dom.flushSync(()=>dotRoot.render(testDeps.react.createElement(Dot,{moving:value})))
      move(true)
    })
    await preview.waitForFunction(()=>document.querySelector('canvas')?.dataset.dotReady==='true')
    return{context,preview}
  }
  const {context:motionContext,preview}=await dotPage()
  const frame=async()=>createHash('sha256').update(await preview.locator('#field').screenshot({animations:'allow'})).digest('hex')
  const sourceFrame=async()=>preview.locator('canvas').evaluate(el=>({pixels:el.toDataURL(),geometry:el.dataset.dotGeometry}))
  const staticSource=await sourceFrame(),initial=await frame()
  await preview.waitForTimeout(1400)
  assert.notEqual(await frame(),initial,'a visible light sweep crosses stationary dots')
  assert.deepEqual(await sourceFrame(),staticSource,'running cards do not redraw dot paths on the main thread')
  await preview.evaluate(()=>{document.querySelector('#field').style.width='520px';window.dispatchEvent(new Event('resize'))})
  await preview.waitForFunction(()=>document.querySelector('canvas')?.dataset.dotGeometry?.startsWith('520:'))
  const resized=await sourceFrame()
  await preview.waitForTimeout(400)
  assert.deepEqual(await sourceFrame(),resized,'resize repaints geometry once, then remains static')
  await preview.evaluate(()=>move(false));const stopped=await frame()
  await preview.waitForTimeout(900);assert.equal(await frame(),stopped,'terminal cards have no moving gloss')
  await preview.evaluate(()=>move(true));const resumed=await frame()
  await preview.waitForTimeout(1000);assert.notEqual(await frame(),resumed,'retry resumes the compositor gloss')
  await preview.emulateMedia({reducedMotion:'reduce'});const reduced=await frame()
  await preview.waitForTimeout(900);assert.equal(await frame(),reduced,'reduced motion is static')
  assert.equal((await sourceFrame()).geometry,resized.geometry)
  report.dotMotion={durationSeconds:7,illumination:'compositor light sweep over stationary source dots',sourcePixelsStable:true,resizeRepaintsOnce:true,stopStatic:true,retryResumes:true,reducedMotionStatic:true}
  await motionContext.close()
  const {context:recordContext,preview:recordPage}=await dotPage({record:true})
  await recordPage.waitForTimeout(7300)
  const video=recordPage.video();await recordContext.close();await video.saveAs(output+'dot-gloss-dark.webm')
  report.checks.push('stationary Figma dot field with compositor gloss: no per-frame canvas paint; resize repaints once; stop/retry and reduced motion verified')
  assert.deepEqual(errors,[],'no real browser runtime errors')
  report.result='PASS';await writeFile(output+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:'PASS',cases:report.cases.length,checks:report.checks,output},null,2))
} finally { await browser.close() }
