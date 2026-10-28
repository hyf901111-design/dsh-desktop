import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {patchFigmaRefinementSubagent} from '../scripts/lib/figma-refinements-client.mjs'
let browser,server,origin,script,styles,catalog,detail,runtime,temporary
const artifact='/tmp/subagent-avatars-rotation-20261028'
function nativeConversation(source){
 // Restore installed outer layers in production order before repatching the
 // actual child header. Keep Node's literal installer bytes out of transforms.
 return execFileSync(process.execPath,['--input-type=module','-e',`
 import{readFileSync}from'node:fs';
 import{stripConversationGridOverlays}from'./test/fixtures/strip-conversation-transient-ui.mjs';
 import{stripHomeGuideNative}from'./scripts/lib/home-guide-native.mjs';
 import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';
 import{patchSubagentPanelConversation}from'./scripts/lib/figma-subagent-panel.mjs';
 let source=readFileSync(0,'utf8');
 if(source.includes('sherlock:composer-voice:'))source=(await import('./scripts/lib/composer-voice.mjs')).stripComposerVoice(source);
 for(const patch of [stripConversationGridOverlays,stripHomeGuidePresentationNative,stripHomeGuideNative,patchSubagentPanelConversation])source=patch(source);
 process.stdout.write(source);
 `],{input:source,encoding:'utf8',timeout:10000,maxBuffer:32*1024*1024})
}
beforeAll(async()=>{
 temporary=await mkdtemp(join(tmpdir(),'subagent-avatar-native-'));await mkdir(artifact,{recursive:true})
 catalog=patchFigmaRefinementSubagent(await readFile('node_modules/@deepseek-ai/dsh-client-ui-subagent/lib/client.js','utf8'))
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const native=nativeConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const start=native.indexOf('function OdysseySubagentPanelHeader('),end=native.indexOf('\nclass ResearchSidebarCoordinator',start),definition=native.indexOf('/* sherlock:subagent-avatars:definition:v1 */')
 detail=native.slice(definition>=0?definition:start,end)
 script=(await build({entryPoints:['test/fixtures/subagent-avatars-browser.tsx'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text
 styles=await readFile('src/preload/figma-refinements.css','utf8')
 server=createServer(async(req,res)=>{try{if(req.url==='/noto.woff2'){res.setHeader('Content-Type','font/woff2');res.end(await readFile('build/fonts/NotoSansSC.woff2'))}else if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script)}else if(req.url.startsWith('/subagent-avatars/')){const name=req.url.slice('/subagent-avatars/'.length);if(!/^[a-z0-9.-]+$/.test(name))throw Error('path');const file=join('build/brand/subagent-avatars',name);res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':'image/png');res.end(await readFile(file))}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Noto;src:url(/noto.woff2)}body{margin:24px;background:#eee;color:#292b2e;font-family:Noto,sans-serif;--odyssey-font-ui:Noto,sans-serif}body[data-ds-dark-theme]{background:#171717;color:#e8e8e8}body[data-ds-dark-theme] .detail{background:#262626}.gallery{display:grid;grid-template-columns:repeat(6,1fr);gap:20px}.gallery figure{margin:0;padding:12px;display:flex;gap:8px;align-items:center}.gallery figcaption{font-size:12px}.entry{width:440px}.detail{position:absolute;left:510px;top:20px;width:360px;background:#fff}'+styles+'</style><div id="root"></div><script>window.avatarInput='+JSON.stringify({catalog,detail,runtime})+'</script><script src="/app.js"></script>')}}catch{res.statusCode=404;res.end()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(temporary)await rm(temporary,{recursive:true,force:true})})
it('uses the real native catalog registration and child header with stable matching avatars',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin)
 await page.getByRole('button',{name:/子代理/}).click()
 await expect.poll(()=>page.locator('.h8S2Va_menu [data-odyssey-subagent-avatar]').count()).toBe(3)
 const roles=await page.locator('.h8S2Va_menu [data-odyssey-subagent-avatar]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.childSessionId,n.dataset.avatarRole])))
 expect(await page.locator('.detail [data-odyssey-subagent-avatar]').getAttribute('data-avatar-role')).toBe(Object.values(roles)[0])
 await page.evaluate(()=>window.avatarFixture.reorder());expect(await page.locator('.h8S2Va_menu [data-odyssey-subagent-avatar]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.childSessionId,n.dataset.avatarRole])))).toEqual(roles)
 await page.evaluate(()=>window.avatarFixture.idle());expect(await page.locator('.h8S2Va_menu [data-odyssey-subagent-avatar]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.childSessionId,n.dataset.avatarRole])))).toEqual(roles)
 expect(await page.locator('.h8S2Va_menu [data-avatar-state="running"]').count()).toBe(0)
 await page.reload();await page.getByRole('button',{name:/子代理/}).click();expect(await page.locator('.h8S2Va_menu [data-odyssey-subagent-avatar]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.childSessionId,n.dataset.avatarRole])))).toEqual(roles)
 await page.screenshot({path:join(artifact,'light.png')});expect(errors).toEqual([]);await page.close()
},20000)
it('centers both actual entry sizes on the first title line and preserves native long-title and disclosure behavior',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:720}});await page.goto(origin);await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:/子代理/}).click()
 const geometry=await page.evaluate(()=>{
  const center=node=>{const r=node.getBoundingClientRect();return r.top+r.height/2},row=document.querySelector('.h8S2Va_menu [role=treeitem]'),header=document.querySelector('.detail .odyssey-subagent-panel-header')
  return{catalog:center(row.querySelector('.odyssey-subagent-avatar-image'))-center(row.querySelector('.h8S2Va_label')),detail:center(header.querySelector('.odyssey-subagent-avatar-image'))-center(header.querySelector('strong')),ringSizes:[...document.querySelectorAll('.odyssey-subagent-avatar-ring')].map(n=>n.getBoundingClientRect().width),long:[...document.querySelectorAll('.h8S2Va_label')].find(n=>n.textContent.startsWith('很长')).scrollWidth>[...document.querySelectorAll('.h8S2Va_label')].find(n=>n.textContent.startsWith('很长')).clientWidth}
 })
 expect(Math.abs(geometry.catalog)).toBeLessThan(.1);expect(Math.abs(geometry.detail)).toBeLessThan(.1);expect(geometry.ringSizes.sort()).toEqual([20,24]);expect(geometry.long).toBe(true)
 await page.getByRole('button',{name:/展开 研究任务 1/}).click();expect(await page.evaluate(()=>window.avatarFixture.events.filter(e=>e.type==='open').length)).toBe(0)
 const row=page.locator('[role=treeitem]').filter({has:page.locator('[data-odyssey-subagent-avatar]')}).first();await row.focus();await row.press('Enter');expect(await page.evaluate(()=>window.avatarFixture.events.filter(e=>e.type==='open').at(-1).address)).toEqual({parentSessionId:'parent',childSessionId:'session-1b68c91d-e219-4675-bcf1-a043f520df51',mode:'one-shot'})
 await page.getByRole('button',{name:/子代理/}).click();await page.evaluate(()=>window.avatarFixture.diagnostic());const broken=page.getByRole('treeitem',{name:/broken/});expect(await broken.getAttribute('aria-disabled')).toBe('true');expect(await broken.locator('[data-odyssey-subagent-avatar]').count()).toBe(0);await page.close()
},20000)
it('rotates only the running arc in the catalog and child header and respects reduced motion',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:720}});await page.goto(origin);await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:/子代理/}).click()
 const motion=await page.locator('.odyssey-subagent-avatar-arc').evaluateAll(async nodes=>{
  const samples=nodes.map(()=>[])
  for(let i=0;i<3;i++){await new Promise(resolve=>setTimeout(resolve,120));nodes.forEach((node,index)=>samples[index].push(getComputedStyle(node).transform))}
  return nodes.map((node,index)=>({samples:samples[index],rotation:samples[index].map(value=>{const matrix=new DOMMatrixReadOnly(value);return{angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,scaleX:Math.hypot(matrix.a,matrix.b),scaleY:Math.hypot(matrix.c,matrix.d),x:matrix.e,y:matrix.f}}),duration:node.getAnimations()[0].effect.getTiming().duration,easing:getComputedStyle(node).animationTimingFunction,direction:node.getAnimations()[0].effect.getTiming().direction,imageTransform:getComputedStyle(node.closest('.odyssey-subagent-avatar-art').querySelector('img')).transform,trackTransform:getComputedStyle(node.previousElementSibling).transform,color:getComputedStyle(node).backgroundColor,trackOpacity:getComputedStyle(node.previousElementSibling).opacity}))
 })
 expect(motion).toHaveLength(2)
 for(const item of motion){expect(new Set(item.rotation.map(sample=>sample.angle)).size).toBe(3);for(const sample of item.rotation){expect(sample.scaleX).toBeCloseTo(1,4);expect(sample.scaleY).toBeCloseTo(1,4);expect(sample.x).toBe(0);expect(sample.y).toBe(0)}expect(item.duration).toBe(900);expect(item.easing).toBe('linear');expect(item.direction).toBe('normal');expect(item.imageTransform).toBe('none');expect(item.trackTransform).toBe('none');expect(item.trackOpacity).toBe('1');expect(item.color).toBe('rgb(65, 106, 204)')}
 await writeFile(join(artifact,'catalog-header-motion.json'),JSON.stringify(motion,null,2))
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));expect(await page.locator('.h8S2Va_menu .odyssey-subagent-avatar-arc').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(141, 172, 255)');await page.screenshot({path:join(artifact,'dark.png')})
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.h8S2Va_menu .odyssey-subagent-avatar-arc').evaluate(n=>({name:getComputedStyle(n).animationName,opacity:getComputedStyle(n).opacity}))).toEqual({name:'none',opacity:'1'});await page.close()
},20000)
it('renders all thirty actual local characters with the two Figma sizes and inner ring clearance',async()=>{
 const page=await browser.newPage({viewport:{width:1100,height:760}}),failures=[];page.on('requestfailed',r=>failures.push(r.url()));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.avatarFixture.gallery())
 await expect.poll(()=>page.locator('.gallery img').evaluateAll(nodes=>nodes.filter(n=>n.complete&&n.naturalWidth===64).length)).toBe(60)
 // Measure the 50% foreground silhouette separately from the resampling fringe.
 // Preserve the exact Figma export; do not shrink artwork to remove a faint halo.
 const measured=await page.locator('.gallery .odyssey-subagent-avatar-slot').evaluateAll(nodes=>nodes.map(n=>{const img=n.querySelector('img'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,64,64).data;let radius=0,fringe=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++){const a=data[(y*64+x)*4+3],r=Math.hypot(x+.5-32,y+.5-32);if(a>=128)radius=Math.max(radius,r);if(a>=32)fringe=Math.max(fringe,r)}const compact=n.dataset.avatarSize==='24',imageWidth=img.getBoundingClientRect().width,innerRadius=compact?9.0625:10.875;return{key:n.dataset.avatarRole,size:n.dataset.avatarSize,gap:innerRadius-radius/64*imageWidth,fringeGap:innerRadius-fringe/64*imageWidth}}))
 expect(new Set(measured.map(x=>x.key)).size).toBe(30);expect(Math.min(...measured.map(x=>x.gap))).toBeGreaterThanOrEqual(2);expect(Math.min(...measured.map(x=>x.fringeGap))).toBeGreaterThan(1.8)
 await page.screenshot({path:join(artifact,'all-characters-light.png')});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.screenshot({path:join(artifact,'all-characters-dark.png')});await writeFile(join(artifact,'geometry.json'),JSON.stringify(measured,null,2));expect(failures).toEqual([]);await page.close()
},20000)
