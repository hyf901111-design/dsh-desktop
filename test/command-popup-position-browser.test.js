import{readFile,mkdir,writeFile}from'node:fs/promises'
import{createRequire}from'node:module'
import{pathToFileURL}from'node:url'
import{build}from'esbuild'
import{afterAll,beforeAll,expect,it}from'vitest'
import{patchSkillCommandPopup,patchSkillCommandLabels}from'../scripts/lib/skill-command-menu.mjs'
import{patchKnowledgeConversation}from'../scripts/lib/knowledge-client.mjs'
import{knowledgeDirectoryIcons}from'../src/shared/knowledge-directory-icons.mjs'
const require=createRequire(import.meta.url),{PNG}=require('pngjs'),artifacts='/tmp/command-popup-position-20261027'
let browser,script,css,sources
beforeAll(async()=>{
 await mkdir(artifacts,{recursive:true});sources={runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),conversation:patchKnowledgeConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__InputBar=InputBar;'),triggers:patchSkillCommandLabels(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.__Menu=MenuView;exports.apply = apply;'),commands:patchSkillCommandPopup(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.apply = apply;','exports.__Popup=PopupSelectView;exports.apply = apply;')}
 const output=await build({entryPoints:['test/fixtures/command-popup-position-browser.tsx'],bundle:true,write:false,outfile:'fixture.js',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},format:'iife',platform:'browser',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}});script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const shell=await readFile('src/preload/shell-style.ts','utf8'),imports=[...shell.matchAll(/import (\w+) from '([^']+\.css)\?raw'/g)];css=(output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')+'\n'+(await Promise.all(imports.map(match=>readFile(match[2].startsWith('./')?'src/preload/'+match[2].slice(2):require.resolve(match[2]),'utf8')))).join('\n')
 const{chromium}=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture({mode='home',width=1380,dark=false,reducedMotion='reduce'}={}){const page=await browser.newPage({viewport:{width,height:900},reducedMotion}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});page.setDefaultTimeout(4000);await page.route('**/*',route=>route.abort());await page.setContent(`<style id="sherlock-desktop-shell-style">${css}body{margin:0}.pI_x6G_centerCol{position:fixed!important;inset:20px 20px 20px ${width<900?80:280}px!important}.wSkVaW_root{height:100%;min-height:0}.detail-background{position:absolute;inset:0;background:repeating-conic-gradient(#fff 0% 25%,#000 0% 50%) 0/8px 8px;pointer-events:none}[data-center-composer-host]{width:100%;position:relative!important;padding:0 24px!important;box-sizing:border-box}.wSkVaW_root[data-odyssey-page=home]{justify-content:center}.wSkVaW_root[data-odyssey-page=conversation]{justify-content:flex-end}</style><body ${dark?'data-ds-dark-theme':''}><div id="root"></div></body>`);await page.evaluate(options=>window.positionOptions=options,{mode});await page.evaluate(sources=>{window.nativeModules={};for(const[key,source]of Object.entries(sources)){window.__ModuleLoader__={load:descriptor=>window.nativeModules[key]=descriptor};new Function(source)()}},sources);await page.addScriptTag({content:script});await page.locator('textarea').waitFor().catch(async error=>{console.log(errors,await page.locator('body').innerHTML());throw error});return{page,errors}}
async function geometry(card){return card.evaluate(el=>{const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},overlay=el.closest('.uV2eYG_overlayAnchor');return{popup:rect(el),immediate:rect(el.parentElement),slot:el.parentElement.getAttribute('data-slot'),display:getComputedStyle(el.parentElement).display,overlay:rect(overlay),composer:rect(el.closest('[data-composer-card]')),inline:el.getAttribute('style'),popover:el.matches(':popover-open'),focus:el.contains(document.activeElement)}})}
for(const[mode,width,dark]of[['home',1380,false],['conversation',1380,true],['home',680,true],['conversation',680,false]])it(`anchors the real ${mode} command popup through Native SlotOutlet at width ${width}`,async()=>{const{page,errors}=await fixture({mode,width,dark});try{await page.evaluate(()=>window.probe.open());const card=page.locator('[data-ework-command=permission]');await card.waitFor();await page.waitForTimeout(100);const g=await geometry(card);await writeFile(`${artifacts}/${mode}-${width}.json`,JSON.stringify(g,null,2));await page.screenshot({path:`${artifacts}/${mode}-${width}.png`});expect(g.slot).toBe('conversation.input.overlay');expect(g.display).toBe('contents');expect(g.immediate.width).toBe(0);expect(g.overlay.width).toBeGreaterThan(220);expect(g.overlay.height).toBe(0);expect(g.popover).toBe(true);expect(g.focus).toBe(true);expect(Math.abs(g.popup.x-g.overlay.x)).toBeLessThanOrEqual(1);expect(Math.abs(g.popup.bottom-g.overlay.y+4)).toBeLessThanOrEqual(1);expect(g.popup.right).toBeLessThanOrEqual(width-8);expect(g.popup.height).toBeGreaterThan(100);expect(g.popup.width).toBeLessThanOrEqual(g.overlay.width);expect(errors).toEqual([])}finally{await page.close()}},15000)
it('follows actual composer height and notice layout changes without waiting for a viewport resize',async()=>{const{page,errors}=await fixture({mode:'home'});try{await page.evaluate(()=>window.probe.open('plan'));const card=page.locator('[data-ework-command=plan]');await card.waitFor();await page.waitForTimeout(100);const before=await geometry(card);await page.evaluate(()=>window.probe.extra(true));await expect.poll(async()=>{const g=await geometry(card);return Math.abs(g.popup.bottom-g.overlay.y+4)}).toBeLessThanOrEqual(1);const expanded=await geometry(card);expect(expanded.composer.height).toBeGreaterThan(before.composer.height+100);expect(Math.abs(expanded.overlay.y-before.overlay.y)).toBeGreaterThan(30);expect(expanded.focus).toBe(true);await page.evaluate(()=>{window.probe.shell.notify({level:'info',text:'Local fixture notice'});window.probe.reflow()});await expect.poll(async()=>{const g=await geometry(card);return Math.abs(g.popup.bottom-g.overlay.y+4)}).toBeLessThanOrEqual(1);expect(await card.locator('input').evaluate(el=>document.activeElement===el)).toBe(true);expect(errors).toEqual([])}finally{await page.close()}},15000)
it('selects permission through the actual native slash launcher, slot menu and popup without sending',async()=>{const{page,errors}=await fixture();try{await page.locator('textarea').focus();await page.locator('button[aria-haspopup=listbox]').first().click();const slash=page.locator('[data-ework-command-menu-selection]');await slash.waitFor();await slash.getByRole('option').first().click();const card=page.locator('[data-ework-command=permission]');await card.waitFor();const g=await geometry(card);expect(Math.abs(g.popup.x-g.overlay.x)).toBeLessThanOrEqual(1);expect(g.focus).toBe(true);await card.getByRole('option',{name:'Workspace Write',exact:true}).click();await expect.poll(()=>card.count()).toBe(0);expect(await page.evaluate(()=>window.probe.events)).toEqual(['choice-1','consume']);expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('');expect(await page.locator('textarea').evaluate(el=>document.activeElement===el)).toBe(true);expect(errors).toEqual([])}finally{await page.close()}},15000)
it('keeps search focused through native style rerenders, viewport resize and filtered-height changes, then cleans up',async()=>{const{page,errors}=await fixture({mode:'conversation'});try{await page.evaluate(()=>{window.probe.shell.setDraft('用户草稿保持不变');window.probe.open('model',24)});const card=page.locator('[data-ework-command=model]'),input=card.locator('input');await input.waitFor();await page.waitForTimeout(100);const before=await page.evaluate(()=>window.probe.shell.snapshot),handle=await input.elementHandle();expect((await geometry(card)).popup.height).toBeLessThanOrEqual(320);expect(await card.locator('.mufS8W_viewport').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await page.setViewportSize({width:680,height:900});await page.evaluate(()=>window.probe.reflow());await expect.poll(async()=>{const g=await geometry(card);return Math.abs(g.popup.x-g.overlay.x)+Math.abs(g.popup.bottom-g.overlay.y+4)}).toBeLessThanOrEqual(2);expect(await input.evaluate((el,prior)=>el===prior,handle)).toBe(true);expect(await input.evaluate(el=>document.activeElement===el)).toBe(true);await input.fill('Model 12');await expect.poll(()=>card.getByRole('option').count()).toBe(1);await expect.poll(async()=>{const g=await geometry(card);return Math.abs(g.popup.bottom-g.overlay.y+4)}).toBeLessThanOrEqual(1);await page.keyboard.press('Escape');await expect.poll(()=>card.count()).toBe(0);expect(await page.evaluate(()=>window.probe.shell.snapshot)).toEqual(before);expect(await page.locator('textarea').evaluate(el=>document.activeElement===el)).toBe(true);expect(await page.locator('[data-ework-command-surface]').count()).toBe(0);expect(errors).toEqual([])}finally{await page.close()}},15000)
for(const dark of[false,true])it(`retains actual frosted backdrop and one material layer with the real slot ancestry (${dark?'dark':'light'})`,async()=>{const{page,errors}=await fixture({dark});try{await page.evaluate(()=>window.probe.open('permission'));const card=page.locator('[data-ework-command=permission]');await card.waitFor();await page.waitForTimeout(100);const g=await geometry(card);expect(g.popover).toBe(true);expect(await card.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('blur(36px) saturate(1.2)');expect(await card.locator('input').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');const image=PNG.sync.read(await page.screenshot({path:`${artifacts}/glass-${dark?'dark':'light'}.png`})),values=[];for(let y=Math.ceil(g.popup.bottom-14);y<g.popup.bottom-5;y++)for(let x=Math.ceil(g.popup.x+15);x<g.popup.x+65;x++)values.push(image.data[(y*image.width+x)*4]);const mean=values.reduce((a,b)=>a+b,0)/values.length,std=Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length);expect(std).toBeLessThan(1.5);const sample=buffer=>{const p=PNG.sync.read(buffer),at=(Math.ceil(g.popup.bottom-10)*p.width+Math.ceil(g.popup.x+20))*4;return Array.from(p.data.subarray(at,at+3))};await page.locator('.detail-background').evaluate(el=>el.style.background='rgb(255,0,0)');const red=sample(await page.screenshot());await page.locator('.detail-background').evaluate(el=>el.style.background='rgb(0,0,255)');const blue=sample(await page.screenshot());expect(red[0]-blue[0]).toBeGreaterThan(dark?60:40);expect(blue[2]-red[2]).toBeGreaterThan(dark?60:40);await writeFile(`${artifacts}/glass-${dark?'dark':'light'}.json`,JSON.stringify({std,red,blue,geometry:g},null,2));await page.evaluate(()=>window.probe.dispose());expect(await page.locator('[data-slot="root"] :popover-open').count()).toBe(0);expect(errors).toEqual([])}finally{await page.close()}},15000)

it.each(['no-preference','reduce'])('navigates slash categories with %s motion without consuming the draft',async reducedMotion=>{
 const{page,errors}=await fixture({mode:'conversation',reducedMotion});
 const animation=reducedMotion==='reduce'?'none':'odyssey-panel-menu-enter';
 const checkMotion=async menu=>expect(await menu.evaluate(el=>getComputedStyle(el).animationName)).toBe(animation);
 try{
  await page.evaluate(()=>window.probe.shell.setDraft('保留现有草稿'));
  const launcher=page.locator('button[data-odyssey-command-launcher]');
  await launcher.click();
  const slash=page.locator('[data-ework-command-menu-selection]');
  await checkMotion(slash);
  await slash.getByRole('option',{name:/Permission options/i}).click();
  const permission=page.locator('[data-ework-command=permission]');
  await permission.locator('[data-ework-command-back]').click();
  await slash.getByRole('option',{name:/Knowledge Base options/i}).click();
  const kb=page.locator('[data-ework-command=knowledge]');
  await checkMotion(kb);
  const shared=kb.getByRole('group',{name:'他人共享分类'});
  const input=kb.getByRole('textbox');
  expect(await kb.locator('[data-knowledge-slash-group]').allTextContents()).toEqual(['分类','文件夹']);
  const all=kb.getByRole('option',{name:'所有文件',exact:true});
  expect(await all.locator('svg path').getAttribute('d')).toBe(knowledgeDirectoryIcons.all);
  const folder=kb.getByRole('option',{name:'研究资料',exact:true});
  expect(await folder.locator('svg path').getAttribute('d')).toBe(knowledgeDirectoryIcons.folder);
  const parent=kb.getByRole('option',{name:'他人共享',exact:true});
  expect(await parent.locator('svg path').last().getAttribute('d')).toBe(knowledgeDirectoryIcons.next);
  expect(await parent.evaluate(el=>{
   const row=el.getBoundingClientRect(),arrow=el.lastElementChild.getBoundingClientRect();
   return Math.round(row.right-arrow.right);
  })).toBe(8);
  await input.fill('他人共享');
  expect(await kb.locator('[data-knowledge-slash-group]').count()).toBe(0);
  await input.press('Enter');
  await shared.getByRole('button',{name:'行业研究'}).waitFor();
  await shared.getByRole('button',{name:'他人共享',exact:true}).click();
  await expect.poll(()=>shared.count()).toBe(0);
  expect(await input.inputValue()).toBe('');
  await kb.getByRole('option',{name:'他人共享',exact:false}).hover();
  const industry = shared.getByRole('button',{name:'行业研究'});
  await industry.waitFor();
  await checkMotion(shared);
  const position = await industry.evaluate(button => {
   const card = button.closest('[data-ework-command=knowledge]').getBoundingClientRect();
   const target = button.getBoundingClientRect();
   return {
    beside: target.left >= card.right - 1,
    onScreen: target.right <= innerWidth && target.bottom <= innerHeight,
    clickable: button.contains(document.elementFromPoint(target.left + 8, target.top + target.height / 2))
   };
  });
  expect(position).toEqual({beside:true,onScreen:true,clickable:true});
  await input.press('ArrowLeft');
  await expect.poll(()=>shared.count()).toBe(0);
  await input.press('ArrowRight');
  await shared.getByRole('button',{name:'行业研究'}).waitFor();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect.poll(()=>kb.count()).toBe(0);
  expect(await page.evaluate(()=>window.probe.events)).toEqual(['data']);
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('保留现有草稿');
  await launcher.click();
  await slash.getByRole('option',{name:/Knowledge Base options/i}).click();
  await kb.getByRole('option',{name:'他人共享',exact:false}).hover();
  await shared.getByRole('button',{name:'行业研究'}).click();
  await expect.poll(()=>kb.count()).toBe(0);
  expect(await page.evaluate(()=>window.probe.events)).toEqual(['data','industry']);
  expect(errors).toEqual([]);
 }finally{await page.close()}
},15000)
