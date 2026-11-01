import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {PNG} from 'pngjs'
import {patchSkillCommandLabels,patchSkillCommandPopup} from '../scripts/lib/skill-command-menu.mjs'

let browser,script,css,sources
const output=process.env.SHERLOCK_POINTER_MENU_OUTPUT||await mkdtemp(join(tmpdir(),'home-pointer-menu-'))
beforeAll(async()=>{
 await mkdir(output,{recursive:true});css=await readFile('src/preload/home-guides.css','utf8')
 sources=await Promise.all(['runtime','ui-commands','ui-input-trigger'].map(async name=>{const raw=await readFile('node_modules/@deepseek-ai/dsh-client-'+name+'/lib/client.js','utf8'),source=name==='ui-commands'?patchSkillCommandPopup(raw):name==='ui-input-trigger'?patchSkillCommandLabels(raw):raw;return source.replace('exports.apply = apply;','exports.apply = apply;'+(name==='ui-commands'?'exports.__Popup=PopupSelectView;':name==='ui-input-trigger'?'exports.__Menu=MenuView;':''))}))
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import{createRoot}from'react-dom/client';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake});const empty=()=>null,primitives=new Proxy({useAnchoredMaxHeight:()=>400},{get:(target,key)=>target[key]??empty});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/cordis'?{Service:class{}}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake;
 const rt=window.descriptors[0].factory(modules),load=value=>value.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),commands=load(window.descriptors[1]),triggers=load(window.descriptors[2]);
 const closed={open:false,hit:null,groups:[],highlight:null},menu=rt.createSnapshotStore(closed),events=[],popup=new commands.PopupSelectController({consume:()=>events.push('consume'),focusComposer:()=>document.querySelector('textarea').focus()});
 const openSkills=()=>{menu.set(closed);popup.open('skills',{options:async()=>[{value:'builtin:efund-ppt-maker',label:'PPT制作助手',detail:'公司规范'},{value:'builtin:ework-equity-research',label:'公司研究报告助手',detail:'专业研究'}],onSelect:async option=>events.push(option.value)},{sessionId:'ordinary'},null)};
 const t=key=>({'suggestions.aria':'命令建议','commands':'命令','search.aria':'搜索技能','overlay.aria':'选择技能'}[key]??key);
 const root=createRoot(document.getElementById('root'));root.render(<div data-composer-card style={{position:'fixed',left:80,top:350,width:520,height:100}}><button aria-haspopup="listbox">/</button><textarea defaultValue="用户草稿"/><triggers.__Menu menu={menu} onPick={openSkills} onHighlight={()=>{}} onDismiss={()=>menu.set(closed)} t={t}/><commands.__Popup popup={popup} t={t}/></div>);
 const abort=new AbortController(),pointer=createHomeGuidePointer(document,{runId:'menu-layer',signal:abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});
 window.menuFixture={events,pointer,openSlash(){popup.dismiss();menu.set({open:true,hit:{trigger:'/'},highlight:null,groups:[{source:'commands',status:'ready',items:[{name:'skills',description:'选择技能'},{name:'export',description:'导出会话'}]}]})},openSkills,async move(kind){await pointer.perform({action:'move',target:document.querySelector(kind==='slash'?'[role=option]':'[data-ework-command=skills] .mufS8W_row')})},abort:()=>abort.abort(),dispose(){pointer.dispose();popup.dispose();root.unmount()}};
 `},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'})).outputFiles[0].text
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())
async function fixture(mode){
 const page=await browser.newPage({viewport:{width:760,height:520},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<style>body{margin:0;background:#eee;color:#252525;font:14px/1.5 system-ui;--dsw-specific-menu:#fff;--dsw-alias-label-primary:#252525;--dsw-alias-label-tertiary:#777;--dsw-alias-border-inverted:#ccc}body[data-ds-dark-theme]{background:#171717;color:#ddd;--dsw-specific-menu:#2b2b2b;--dsw-alias-label-primary:#ddd;--dsw-alias-label-tertiary:#aaa;--dsw-alias-border-inverted:#555}textarea{display:block;width:480px;height:60px}</style><div id="root"></div><script>window.descriptors=[];window.__ModuleLoader__={load:value=>window.descriptors.push(value)}</script>')
 if(mode==='dark')await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''))
 for(const source of sources)await page.addScriptTag({content:source})
 await page.addStyleTag({content:css});await page.addStyleTag({content:await readFile('src/preload/figma-refinements.css','utf8')});await page.addScriptTag({content:script});await page.waitForSelector('textarea');return{page,errors}
}
async function raster(page,name){
 const position=await page.evaluate(()=>window.menuFixture.pointer.snapshot()),clip={x:Math.floor(position.x)-3,y:Math.floor(position.y)-3,width:22,height:24},visible=PNG.sync.read(await page.screenshot({path:join(output,name+'.png'),clip}));
 await page.screenshot({path:join(output,name+'-scene.png')})
 await page.locator('[data-home-guide-pointer]').evaluate(node=>node.style.visibility='hidden');const hidden=PNG.sync.read(await page.screenshot({clip}));await page.locator('[data-home-guide-pointer]').evaluate(node=>node.style.removeProperty('visibility'))
 let gray=0,difference=0;for(let i=0;i<visible.data.length;i+=4){if(Math.abs(visible.data[i]-69)<10&&Math.abs(visible.data[i+1]-71)<10&&Math.abs(visible.data[i+2]-74)<10)gray++;if(Math.max(...[0,1,2].map(channel=>Math.abs(visible.data[i+channel]-hidden.data[i+channel])))>15)difference++}
 const metrics=await page.evaluate(()=>{const pointer=document.querySelector('[data-home-guide-pointer]'),state=window.menuFixture.pointer.snapshot(),menu=document.querySelector('[data-ework-expanded-command]');return{position:state,pointerEvents:getComputedStyle(pointer).pointerEvents,menuPopover:menu.matches(':popover-open'),hit:document.elementFromPoint(state.x+3,state.y+5)?.closest('[data-ework-expanded-command]')===menu,focused:document.activeElement?.tagName}})
 await writeFile(join(output,name+'.json'),JSON.stringify({...metrics,gray,difference},null,2)+'\n');expect(metrics.menuPopover).toBe(true);expect(metrics.hit).toBe(true);expect(metrics.pointerEvents).toBe('none');expect(gray,'the sharp gray cursor is painted above the real top-layer menu').toBeGreaterThanOrEqual(10);expect(difference).toBeGreaterThan(15)
}
it.each(['light','dark'])('keeps the pointer above real slash and skill top-layer menus, including menus opened afterwards, in %s',async mode=>{
 const{page,errors}=await fixture(mode)
 try{
  await page.evaluate(()=>window.menuFixture.openSlash());await page.waitForSelector('[data-ework-expanded-command]:popover-open');await page.evaluate(()=>window.menuFixture.move('slash'));await raster(page,mode+'-slash')
  const commandWidth=(await page.locator('[data-ework-expanded-command]').boundingBox()).width;await page.getByRole('option').first().click();await page.waitForSelector('[data-ework-command=skills]:popover-open');expect((await page.locator('[data-ework-command=skills]').boundingBox()).width).toBe(commandWidth);await page.evaluate(()=>window.menuFixture.move('skills'));await raster(page,mode+'-skills')
  // The same live pointer must remain above a newly reopened menu even before its next movement.
  await page.evaluate(()=>{const card=document.querySelector('[data-ework-command=skills]');card.hidePopover();card.showPopover()});await page.waitForTimeout(30);await raster(page,mode+'-reopened')
  expect(await page.locator('[data-ework-command=skills] input').evaluate(node=>document.activeElement===node)).toBe(true)
  await page.locator('[data-ework-command=skills] .mufS8W_row').first().click();expect(await page.evaluate(()=>window.menuFixture.events)).toEqual(['builtin:efund-ppt-maker','consume']);expect(await page.locator('textarea').inputValue()).toBe('用户草稿');expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.menuFixture.dispose());await page.close()}
},15000)
it('closes the visual top layer on hide, abort and dispose without blocking or taking focus',async()=>{
 const{page,errors}=await fixture('light')
 try{
  await page.evaluate(()=>window.menuFixture.openSkills());await page.waitForSelector('[data-ework-command=skills]:popover-open');await page.evaluate(()=>window.menuFixture.move('skills'))
  const pointer=page.locator('[data-home-guide-pointer]');expect(await pointer.evaluate(node=>node.matches(':popover-open'))).toBe(true)
  await page.evaluate(()=>window.menuFixture.pointer.hide());expect(await pointer.evaluate(node=>node.matches(':popover-open'))).toBe(false);await page.evaluate(()=>window.menuFixture.move('skills'));expect(await pointer.evaluate(node=>node.matches(':popover-open'))).toBe(true)
  await page.evaluate(()=>{const card=document.querySelector('[data-ework-command=skills]');card.hidePopover();card.showPopover();window.menuFixture.abort()});expect(await pointer.evaluate(node=>node.matches(':popover-open'))).toBe(false)
  await page.evaluate(()=>{window.menuFixture.pointer.dispose();const card=document.querySelector('[data-ework-command=skills]');card.hidePopover();card.showPopover()});await page.waitForTimeout(30)
  expect(await pointer.count()).toBe(0);expect(await page.locator('[data-ework-command=skills] input').evaluate(node=>document.activeElement===node)).toBe(true);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.menuFixture.dispose());await page.close()}
})
