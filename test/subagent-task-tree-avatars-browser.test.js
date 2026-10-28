import {beforeAll,afterAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {homedir} from 'node:os'
import {createServer} from 'node:http'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

let browser,server,origin,script,sidebar,catalog,styles
const artifact='/tmp/subagent-task-tree-avatars-rotation-20261028'
const local='build/sherlock-plugin-profile/vendor/dsh-better-sidebar',canonical='/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/'+local
const packageRoot=process.env.SHERLOCK_TEST_SIDEBAR_ROOT??(existsSync(local)?local:existsSync(canonical)?canonical:join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar'))
function patchNode(source,file,name){return execFileSync(process.execPath,['--input-type=module','-e','import{'+name+' as patch}from '+JSON.stringify(pathToFileURL(resolve('scripts/lib/'+file)).href)+';import{readFileSync}from"node:fs";process.stdout.write(patch(readFileSync(0,"utf8")))'],{input:source,encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024})}
beforeAll(async()=>{
 await mkdir(artifact,{recursive:true})
 sidebar=patchNode(await readFile(join(packageRoot,'lib/client.js'),'utf8'),'patch-sherlock-better-sidebar.mjs','patchBetterSidebarClient')
 catalog=patchNode(await readFile('node_modules/@deepseek-ai/dsh-client-ui-subagent/lib/client.js','utf8'),'figma-refinements-client.mjs','patchFigmaRefinementSubagent')
 styles=await readFile('src/preload/figma-refinements.css','utf8')
 script=(await build({entryPoints:['test/fixtures/subagent-task-tree-avatars-browser.tsx'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text
 server=createServer(async(req,res)=>{try{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script)}
  else if(req.url==='/noto.woff2'){res.setHeader('Content-Type','font/woff2');res.end(await readFile('build/fonts/NotoSansSC.woff2'))}
  else if(req.url.startsWith('/subagent-avatars/')){const name=req.url.slice('/subagent-avatars/'.length);if(!/^[a-z0-9.-]+$/.test(name))throw Error('path');res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':'image/png');res.end(await readFile(join('build/brand/subagent-avatars',name)))}
  else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Noto;src:url(/noto.woff2)}body{margin:24px;background:#eee;color:#252525;font-family:Noto,sans-serif;--odyssey-font-ui:Noto,sans-serif;--dsw-font-s-14:400 14px/20px Noto,sans-serif;--dsw-font-xxxs-11:400 11px/16px Noto,sans-serif;--dsw-alias-label-primary:#252525;--dsw-alias-label-secondary:#737373;--dsw-alias-label-tertiary:#777;--dsw-alias-border-l2:#ccc;--dsw-alias-interactive-bg-hover:#eee;--dsw-alias-interactive-bg-active:#ddd}.task-pane{width:340px;height:650px;padding:12px;background:white;box-sizing:border-box}.catalog-reference{position:absolute;left:410px;top:45px;display:flex;align-items:center;gap:8px;font-size:13px}body[data-ds-dark-theme]{background:#171717;color:#e5e5e5;--dsw-alias-label-primary:#e5e5e5;--dsw-alias-label-secondary:#aaa;--dsw-alias-label-tertiary:#999;--dsw-alias-border-l2:#444;--dsw-alias-interactive-bg-hover:#333;--dsw-alias-interactive-bg-active:#444}body[data-ds-dark-theme] .task-pane{background:#252525}[hidden]{display:none!important}'+styles+'</style><div id="root"></div><script>window.taskAvatarInput='+JSON.stringify({sidebar,catalog})+'</script><script src="/app.js"></script>')}
 }catch{res.statusCode=404;res.end()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))})
const childRows=page=>page.locator('.task-pane [role=treeitem]:has([data-odyssey-subagent-avatar])')
const roleMap=page=>page.locator('.task-pane [data-odyssey-subagent-avatar]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.childSessionId,node.dataset.avatarRole])))

it('uses the actual Tasks tab descriptor for nested avatars, narrow titles, native selection and opening',async()=>{
 const page=await browser.newPage({viewport:{width:820,height:730}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready)
 await expect.poll(()=>childRows(page).count()).toBe(3)
 await expect.poll(()=>page.locator('.task-pane [data-odyssey-subagent-avatar] img').evaluateAll(nodes=>nodes.every(node=>node.complete&&node.naturalWidth===64))).toBe(true)
 const ids=await page.evaluate(()=>window.taskAvatarFixture.ids),before=await roleMap(page)
 expect(await page.locator('.catalog-reference [data-odyssey-subagent-avatar]').getAttribute('data-avatar-role')).toBe(before[ids[0]])
 const geometry=await childRows(page).evaluateAll(rows=>rows.map(row=>{const label=row.querySelector('.fHGW1G_subagentLabel'),image=row.querySelector('.odyssey-subagent-avatar-image'),r=label.getBoundingClientRect(),a=image.getBoundingClientRect(),bounds=row.getBoundingClientRect();return{level:row.getAttribute('aria-level'),center:a.top+a.height/2-r.top-r.height/2,inside:a.left>=bounds.left&&a.right<=bounds.right,long:label.scrollWidth>label.clientWidth}}))
 expect(geometry.map(item=>item.level)).toEqual(['1','2','1']);expect(geometry.every(item=>Math.abs(item.center)<.1&&item.inside)).toBe(true);expect(geometry[0].long).toBe(true)
 await childRows(page).first().click()
 expect(await page.evaluate(()=>window.taskAvatarFixture.events.filter(event=>event.type==='open').at(-1).address)).toEqual({parentSessionId:'parent',childSessionId:ids[0],mode:'one-shot'})
 await childRows(page).last().focus();await childRows(page).last().press('Space')
 expect(await page.evaluate(()=>window.taskAvatarFixture.events.filter(event=>event.type==='open').at(-1).address)).toEqual({parentSessionId:'parent',childSessionId:ids[1],mode:'continuable'})
 await page.evaluate(id=>window.taskAvatarFixture.select(id),ids[1]);expect(await page.locator('.task-pane [role=treeitem][aria-current=true] [data-odyssey-subagent-avatar]').getAttribute('data-child-session-id')).toBe(ids[1])
 expect(await page.locator('.task-pane [aria-disabled=true] [data-odyssey-subagent-avatar]').count()).toBe(0)
 expect(await page.locator('.task-pane [aria-disabled=true] [data-native-icon=StateDot]').getAttribute('data-state')).toBe('error')
 expect(await page.locator('.fHGW1G_jobsRow [data-odyssey-subagent-avatar]').count()).toBe(0)
 await page.evaluate(()=>window.taskAvatarFixture.reorder());expect(await roleMap(page)).toEqual(before)
 await page.evaluate(()=>window.taskAvatarFixture.remount());expect(await roleMap(page)).toEqual(before)
 await page.screenshot({path:join(artifact,'task-tree-light.png')});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.screenshot({path:join(artifact,'task-tree-dark.png')})
 await writeFile(join(artifact,'task-tree-geometry.json'),JSON.stringify(geometry,null,2));expect(errors).toEqual([]);await page.close()
},20000)

it('keeps hydration and reload identities while the running arc turns and idle stays quiet',async()=>{
 const page=await browser.newPage({viewport:{width:820,height:730}});await page.goto(origin);await expect.poll(()=>childRows(page).count()).toBe(3)
 const before=await roleMap(page),ids=await page.evaluate(()=>window.taskAvatarFixture.ids)
 await page.evaluate(()=>window.taskAvatarFixture.loading());await expect.poll(()=>childRows(page).count()).toBe(2)
 expect(await roleMap(page)).toEqual({[ids[0]]:before[ids[0]],[ids[1]]:before[ids[1]]});expect(await childRows(page).evaluateAll(rows=>rows.every(row=>row.getAttribute('aria-disabled')==='true'))).toBe(true)
 await page.screenshot({path:join(artifact,'task-tree-loading.png')});await page.evaluate(()=>window.taskAvatarFixture.ready())
 const arc=page.locator('.task-pane .odyssey-subagent-avatar-arc')
 const motion=await arc.evaluate(async node=>{
  const samples=[]
  for(let i=0;i<3;i++){await new Promise(resolve=>setTimeout(resolve,120));samples.push(getComputedStyle(node).transform)}
  const rotation=samples.map(value=>{const matrix=new DOMMatrixReadOnly(value);return{angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,scaleX:Math.hypot(matrix.a,matrix.b),scaleY:Math.hypot(matrix.c,matrix.d),x:matrix.e,y:matrix.f}})
  const animation=node.getAnimations()[0];return{samples,rotation,duration:animation.effect.getTiming().duration,easing:getComputedStyle(node).animationTimingFunction,direction:animation.effect.getTiming().direction,color:getComputedStyle(node).backgroundColor,imageTransform:getComputedStyle(node.closest('.odyssey-subagent-avatar-art').querySelector('img')).transform,trackTransform:getComputedStyle(node.previousElementSibling).transform}
 })
 expect(new Set(motion.rotation.map(sample=>sample.angle)).size).toBe(3);for(const sample of motion.rotation){expect(sample.scaleX).toBeCloseTo(1,4);expect(sample.scaleY).toBeCloseTo(1,4);expect(sample.x).toBe(0);expect(sample.y).toBe(0)}expect({...motion,samples:undefined,rotation:undefined}).toEqual({samples:undefined,rotation:undefined,duration:900,easing:'linear',direction:'normal',color:'rgb(65, 106, 204)',imageTransform:'none',trackTransform:'none'})
 await writeFile(join(artifact,'task-tree-motion.json'),JSON.stringify(motion,null,2))
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));expect(await arc.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(141, 172, 255)')
 await page.evaluate(()=>window.taskAvatarFixture.hide());expect(await arc.evaluate(node=>getComputedStyle(node).animationPlayState)).toBe('paused');await page.evaluate(()=>window.taskAvatarFixture.show())
 await page.emulateMedia({reducedMotion:'reduce'});expect(await arc.evaluate(node=>({name:getComputedStyle(node).animationName,opacity:getComputedStyle(node).opacity}))).toEqual({name:'none',opacity:'1'})
 await page.evaluate(()=>window.taskAvatarFixture.idle());expect(await page.locator('.task-pane .odyssey-subagent-avatar-ring').count()).toBe(0);expect(await roleMap(page)).toEqual(before)
 await page.reload();await expect.poll(()=>childRows(page).count()).toBe(3);expect(await roleMap(page)).toEqual(before);await page.close()
},20000)
