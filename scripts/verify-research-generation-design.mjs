// Focused real Chromium acceptance; transforms a copy, never shared node_modules.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { patchFigmaFinalCanvas } from './lib/figma-canvas-client.mjs'
import { patchCanvasCreationTools } from './lib/canvas-creation-tools.mjs'

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
    window.workspace=registry.for('generation');window.root=createRoot(document.querySelector('#mount'))
    dom.flushSync(()=>root.render(react.createElement(client.ResearchCanvas,{sessionId:'generation',t:key=>key,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({ok:true})}})))
    window.reset=({theme='light',width=620,height=300,state='running'}={})=>dom.flushSync(()=>{
      document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
      workspace.setArtifacts([{id:'card',kind:'generated-container',messageId:'card',title:'基金筛选与比较',excerpt:'正在核验基金数据',containerPrompt:'筛选基金并比较表现',refreshMinutes:0,x:50+width/2,y:50+height/2,width,height,sizeMode:'manual',generationStatus:'running',generationTaskId:'task-'+state,generationStartedAt:Date.now()-18000,generationCompletedAt:['failed','cancelled'].includes(state)?Date.now():undefined,generationLastSeq:0,generationEvents:[{taskId:'task-'+state,canvasNodeId:'card',seq:1,type:'tool-started',tool:'基金数据核验',detail:'已核验 1,286 只基金的规模与经理任职，正在计算候选基金的收益和最大回撤。'}],generationError:state==='failed'?'数据源响应超时，已保留本次研究条件':undefined}])
      workspace.applyGenerationInspection('card',{taskId:'task-'+state,canvasNodeId:'card',state,lastSeq:1,events:[{taskId:'task-'+state,canvasNodeId:'card',seq:1,type:'tool-started',tool:'基金数据核验',detail:'已核验 1,286 只基金的规模与经理任职，正在计算候选基金的收益和最大回撤。'}],error:state==='failed'?'数据源响应超时，已保留本次研究条件':undefined})
      workspace.setViewport({x:0,y:0,scale:1});workspace.updateSelection([],'replace')
    })
    window.metrics=()=>{
      const surface=document.querySelector('[data-research-generation-process]'),card=document.querySelector('[data-research-node-id="card"]'),dots=surface.querySelector('[data-research-generation-dots]'),foreground=surface.querySelector('[data-research-generation-foreground]')
      const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
      return{node:workspace.getSnapshot().artifacts[0],card:box(card),surface:box(surface),foreground:box(foreground),foregroundTransform:getComputedStyle(foreground).transform,filter:getComputedStyle(surface).filter,backdrop:getComputedStyle(surface).backdropFilter,motion:getComputedStyle(dots).animationPlayState,animations:dots.getAnimations().map(a=>({currentTime:a.currentTime,playState:a.playState})),text:foreground.textContent,state:surface.dataset.generationUiState,overflow:foreground.scrollHeight>foreground.clientHeight}
    }
  })
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
    await page.mouse.move(1040,760)
    const before=await page.evaluate(()=>metrics())
    assert.equal(before.card.width,width);assert.equal(before.card.height,height);assert.equal(before.surface.width,width);assert.equal(before.surface.height,height)
    assert.equal(before.motion,state==='running'?'running':'paused');assert.equal(before.filter,'none');assert.equal(before.backdrop,'none')
    const clip={x:before.surface.x+110,y:before.surface.y+5,width:Math.min(110,before.surface.width-115),height:36}
    const first=await page.screenshot({clip,animations:'allow'})
    await page.waitForTimeout(300)
    const second=await page.screenshot({clip,animations:'allow'}),after=await page.evaluate(()=>metrics())
    assert.deepEqual(after.foreground,before.foreground,'foreground never translates or reflows while background moves')
    assert.equal(after.foregroundTransform,'none')
    const different=createHash('sha256').update(first).digest('hex')!==createHash('sha256').update(second).digest('hex')
    assert.equal(different,state==='running','running background pixels flow; stopped/error pixels remain unchanged')
    await page.locator('[data-research-generation-process]').hover()
    const action=state==='running'?'停止生成':state==='failed'?'重试生成':'重新生成'
    const button=page.getByRole('button',{name:action,exact:true});await button.hover()
    const buttonBox=await button.boundingBox();assert.equal(buttonBox.width,24);assert.equal(buttonBox.height,24)
    assert.equal(await page.getByRole('tooltip').textContent(),action)
    assert.equal((await page.evaluate(()=>metrics())).motion,state==='running'?'running':'paused','hover does not pause motion')
    await page.screenshot({path:output+`${theme}-${shape}-${state}.png`,animations:'allow'})
    await button.focus();await page.keyboard.press('Escape');assert.equal(await page.getByRole('tooltip').count(),0)
    const process=page.getByRole('button',{name:'查看过程',exact:true});await process.click()
    await page.waitForSelector('[data-research-generation-records]')
    assert.deepEqual((await page.evaluate(()=>metrics())).card,before.card,'opening process preserves card bounds')
    assert.match(await page.locator('[data-research-generation-records]').textContent(),/核验|数据源/)
    await page.getByRole('button',{name:'收起过程',exact:true}).click()
    report.cases.push({theme,shape,state,width,height,foreground:before.foreground,animationPixelsChanged:different,button:buttonBox,processPreservesBounds:true})
  }
  for(const theme of ['light','dark']) for(const [shape,width,height] of [['wide',620,300],['tall',240,620],['compact',360,200]]) {
    await page.evaluate(value=>{
      reset(value)
      workspace.applyGenerationInspection('card',{taskId:'task-running',canvasNodeId:'card',state:'running',lastSeq:12,events:Array.from({length:11},(_,index)=>({taskId:'task-running',canvasNodeId:'card',seq:index+2,type:'tool-started',tool:'核验步骤 '+(index+2),detail:'依据公开资料核对样本、时间口径、基金规模、经理任职、累计收益和最大回撤。'.repeat(7)}))})
    },{theme,width,height})
    const before=await page.evaluate(()=>metrics())
    await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'查看过程',exact:true}).click()
    const records=page.locator('[data-research-generation-records]')
    const panel=await records.evaluate(el=>({background:getComputedStyle(el).backgroundColor,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,rows:el.querySelectorAll('[data-research-generation-row]').length}))
    assert.equal(panel.background,theme==='dark'?'rgb(3, 3, 3)':'rgb(250, 250, 250)');assert.ok(panel.rows>=8);assert.ok(panel.scrollHeight>panel.clientHeight,'long real process rows scroll inside the original card')
    assert.equal(await page.locator('[data-research-generation-foreground]').evaluate(el=>getComputedStyle(el).visibility),'hidden')
    await records.evaluate(el=>{el.scrollTop=el.scrollHeight})
    assert.ok(await records.evaluate(el=>el.scrollTop)>0)
    assert.deepEqual((await page.evaluate(()=>metrics())).card,before.card);assert.deepEqual((await page.evaluate(()=>metrics())).foreground,before.foreground)
    assert.equal(await page.locator('[data-research-generation-elapsed]').isVisible(),true);assert.equal(await page.getByRole('button',{name:'停止生成',exact:true}).isVisible(),true)
    await page.screenshot({path:output+`${theme}-${shape}-process-scrolled.png`,animations:'allow'})
    await page.getByRole('button',{name:'收起过程',exact:true}).click()
    assert.equal(await page.locator('[data-research-generation-foreground]').evaluate(el=>getComputedStyle(el).visibility),'visible');assert.deepEqual((await page.evaluate(()=>metrics())).foreground,before.foreground)
  }
  report.checks.push('Light/Dark wide/tall/compact multiline records are opaque and scroll without foreground overlap or bounds changes; timer/actions stay visible')
  await page.evaluate(()=>{reset();workspace.setGenerationCancelSink(()=>new Promise(resolve=>{window.resolveCancel=resolve}))})
  await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'停止生成',exact:true}).click()
  assert.equal((await page.evaluate(()=>metrics())).state,'stopping')
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
  assert.equal(await page.locator('[data-research-generation-elapsed]').textContent(),'00:00')
  await page.waitForTimeout(1100)
  assert.equal(await page.locator('[data-research-generation-elapsed]').textContent(),'00:00')
  assert.equal((await page.evaluate(()=>metrics())).motion,'paused')
  report.checks.push('waiting shows static dots and 00:00 after the execution clock advances')
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
    const style=await input.evaluate(el=>({border:getComputedStyle(el).borderTopColor,caret:getComputedStyle(el).caretColor,shadow:getComputedStyle(el).boxShadow,padding:getComputedStyle(el.parentElement).padding}))
    assert.equal(style.border,theme==='dark'?'rgb(245, 245, 245)':'rgb(51, 51, 51)');assert.equal(style.caret,style.border);assert.equal(style.padding,'18px')
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
  assert.deepEqual(errors,[],'no real browser runtime errors')
  report.result='PASS';await writeFile(output+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:'PASS',cases:report.cases.length,checks:report.checks,output},null,2))
} finally { await browser.close() }
