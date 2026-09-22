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
    await page.mouse.move(1040,760)
    const before=await page.evaluate(()=>metrics())
    assert.equal(before.card.width,width);assert.equal(before.card.height,height);assert.equal(before.surface.width,width);assert.equal(before.surface.height,height)
    assert.equal(before.background,theme==='dark'?'rgb(3, 3, 3)':'rgb(250, 250, 250)','generated surface overrides old content backgrounds with the actual Figma paint');
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
    await page.waitForTimeout(950)
    assert.notEqual(await page.locator('[data-progress-ticker]').textContent(),previous)
    assert.deepEqual((await page.evaluate(()=>metrics())).card,before.card)
    assert.equal(await page.locator('[data-research-generation-foreground]').isVisible(),true)
    assert.equal(await page.locator('[data-research-generation-elapsed]').isVisible(),true)
    await page.screenshot({path:output+`${theme}-${shape}-progress-ticker.png`,animations:'allow'})
  }
  report.checks.push('Light/Dark wide/tall/compact real progress rolls at 900ms; process emits exact child address without inline logs or bounds changes')
  await page.evaluate(()=>{reset();workspace.setGenerationCancelSink(()=>new Promise(resolve=>{window.resolveCancel=resolve}))})
  await page.locator('[data-research-generation-process]').hover();await page.getByRole('button',{name:'停止生成',exact:true}).click()
  assert.equal((await page.evaluate(()=>metrics())).state,'stopping')
  const stoppedPhase=await page.locator('[data-research-generation-dots]').evaluate(el=>({phase:el.dataset.dotPhase,pixels:el.toDataURL()}))
  await page.waitForTimeout(150)
  assert.deepEqual(await page.locator('[data-research-generation-dots]').evaluate(el=>({phase:el.dataset.dotPhase,pixels:el.toDataURL()})),stoppedPhase,'stopping freezes the actual current background phase and pixels')
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
  // Deterministic RAF drives the shipped renderer through a complete cycle;
  // this tests continuous intermediate frames and endpoint parity, not a CSS
  // animation declaration. A separate real-time page records the visible flow.
  const dotSource=generationSource.slice(generationSource.indexOf('function ResearchGenerationDots('),generationSource.indexOf('function ResearchGenerationAction('))
  async function dotPage({record=false,controlled=false}={}) {
    const context=await browser.newContext({viewport:{width:660,height:340},...(record?{recordVideo:{dir:output+'motion',size:{width:660,height:340}}}:{})})
    const preview=await context.newPage()
    await preview.setContent('<style>body{margin:0;background:#191919;padding:20px}#field{position:relative;isolation:isolate;width:620px;height:300px;overflow:hidden;border-radius:8px;background:#030303}</style><div id="field"></div>')
    await preview.addStyleTag({content:generationCss})
    await preview.addScriptTag({content:dependencies.outputFiles[0].text})
    await preview.addScriptTag({content:'const react=testDeps.react,react_jsx_runtime=testDeps.jsx;'+dotSource+';window.Dot=ResearchGenerationDots;'})
    await preview.evaluate(controlled=>{
      document.body.setAttribute('data-ds-dark-theme','')
      if(controlled){let stamp=1000,next=0;const callbacks=new Map();window.requestAnimationFrame=fn=>{callbacks.set(++next,fn);return next};window.cancelAnimationFrame=id=>callbacks.delete(id);window.advance=ms=>{const count=Math.ceil(ms/20)||1,step=ms/count;for(let i=0;i<count;i++){stamp+=step;const pending=[...callbacks.values()];callbacks.clear();pending.forEach(fn=>fn(stamp))}}}
      window.dotRoot=testDeps.createRoot(document.querySelector('#field'))
      window.move=value=>testDeps.dom.flushSync(()=>dotRoot.render(testDeps.react.createElement(Dot,{moving:value})))
      move(true)
    },controlled)
    await preview.waitForFunction(()=>document.querySelector('canvas')?.dataset.dotReady==='true')
    return{context,preview}
  }
  const {context:controlledContext,preview}=await dotPage({controlled:true})
  await preview.evaluate(()=>advance(0))
  const pixel=async()=>{const value=await preview.locator('canvas').evaluate(el=>({phase:Number(el.dataset.dotPhase),image:el.toDataURL()}));return{phase:value.phase,image:createHash('sha256').update(value.image).digest('hex')}}
  const initial=await pixel(),phases=[]
  for(let i=1;i<=4;i++) {
    await preview.evaluate(()=>advance(1750))
    const current=await pixel();phases.push({phase:current.phase,changed:current.image!==initial.image})
    await preview.screenshot({path:output+'dot-phase-'+i+'.png'})
  }
  assert.ok(phases[0].changed&&phases[1].changed&&phases[2].changed,'quarter-cycle phases visibly flow')
  assert.ok(Math.abs(phases[3].phase)<1e-10||Math.abs(phases[3].phase-1)<1e-10,'one cycle returns to phase zero')
  const ending=await pixel()
  assert.equal(ending.image,initial.image,'a complete loop has exactly matching pixels, without edge seams')
  await preview.evaluate(()=>advance(2100));await preview.evaluate(()=>move(false));const frozen=await pixel()
  await preview.evaluate(()=>advance(700));assert.deepEqual(await pixel(),frozen,'terminal background retains its exact phase')
  await preview.evaluate(()=>move(true));await preview.evaluate(()=>advance(0));await preview.evaluate(()=>advance(700));assert.notEqual((await pixel()).image,frozen.image,'retry resumes movement from the retained phase')
  await preview.emulateMedia({reducedMotion:'reduce'});await preview.waitForFunction(()=>document.querySelector('canvas').dataset.dotMoving==='false'&&document.querySelector('canvas').dataset.dotPhase==='0');const reduced=await pixel();await preview.evaluate(()=>advance(700));assert.deepEqual(await pixel(),reduced,'reduced motion remains a static source frame')
  assert.equal(reduced.phase,0)
  report.dotMotion={durationSeconds:7,grid:9.9208,travel:{x:-49.604,y:-9.9208},phaseSamples:phases,loopPixelsIdentical:true,stopFreezesPhase:true,retryResumes:true,reducedMotionStatic:true}
  await controlledContext.close()
  const {context:recordContext,preview:recordPage}=await dotPage({record:true})
  await recordPage.waitForTimeout(7300)
  const video=recordPage.video();await recordContext.close();await video.saveAs(output+'dot-flow-dark.webm')
  report.checks.push('continuous phase loop returns to identical pixels; stopping freezes its current phase; retry resumes; reduced motion remains static; real-time WebM recorded')
  assert.deepEqual(errors,[],'no real browser runtime errors')
  report.result='PASS';await writeFile(output+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:'PASS',cases:report.cases.length,checks:report.checks,output},null,2))
} finally { await browser.close() }
