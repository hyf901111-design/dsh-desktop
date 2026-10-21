import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,refinements
beforeAll(async()=>{
 refinements=await readFile('src/preload/figma-refinements.css','utf8')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import {mountNotes} from './src/preload/notes/mount';
  const saved={title:'颜色菜单材质验收',blocks:Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段正文，用于检查菜单下方的文字被正确模糊。'})),yjs:'',revision:0};
  const bridge={request:async(method,input)=>method==='load'?{saved}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:{},draft:async()=>{}};
  mountNotes(document,bridge,{register:(_mode,surface)=>{surface.style.left='180px';surface.style.top='54px';surface.dataset.dark=String(document.body.hasAttribute('data-ds-dark-theme'));document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'});
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:(await build({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})).outputFiles[0].text,loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())

async function fixture(dark){
 const page=await browser.newPage({viewport:{width:1380,height:960}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/color-menu',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>${refinements}</style><body ${dark?'data-ds-dark-theme':''}><header data-ework-notes-session="color-note"></header><div data-ework-note-view="color-note"></div><div id="workspace-material" role="menu" style="position:fixed;left:-10000px"></div></body>`}))
 await page.goto('http://127.0.0.1/color-menu')
 await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段正文，用于检查菜单下方的文字被正确模糊。'}))))
 await page.locator('.bn-editor .bn-block-outer[data-id="body-0"]').waitFor()
 return{page,errors}
}
async function openColors(page,keyboard=false){
 await page.locator('.bn-editor .bn-block-outer[data-id="body-0"]').hover()
 await page.getByRole('button',{name:'打开菜单',exact:true}).click()
 const parent=page.locator('.bn-drag-handle-menu'),color=parent.getByRole('menuitem',{name:'颜色',exact:true})
 await parent.getByRole('menuitem',{name:'删除',exact:true}).waitFor()
 if(keyboard){await page.mouse.move(1250,800);await color.focus();await page.keyboard.press('ArrowRight')}else await color.hover()
 const submenu=page.locator('.bn-color-picker-dropdown');await submenu.waitFor()
 // The native enter transition creates a temporary opacity backdrop root.
 await expect.poll(()=>submenu.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
 if(keyboard)await expect.poll(()=>page.evaluate(()=>document.activeElement?.getAttribute('data-test'))).toBe('text-color-default')
 return{parent,color,submenu}
}
async function material(locator){return locator.evaluate(el=>{const surface=getComputedStyle(el),style=surface.backgroundColor==='rgba(0, 0, 0, 0)'?getComputedStyle(el,'::before'):surface;return{background:style.backgroundColor,border:style.borderTopColor,shadow:style.boxShadow,blur:style.backdropFilter}})}

for(const dark of [false,true])it(`opens the actual color submenu in the same unobstructed menu material in ${dark?'dark':'light'} theme`,async()=>{
 const {page,errors}=await fixture(dark)
 try{
  const {parent,submenu}=await openColors(page)
  await page.screenshot({path:'/tmp/notes-color-menu-'+(dark?'dark':'light')+'.png'})
  const shared=await material(page.locator('#workspace-material'))
  expect(await material(parent)).toEqual(shared);expect(await material(submenu)).toEqual(shared)
  expect(shared.background).toBe(dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)');expect(shared.blur).toBe('blur(36px) saturate(1.2)')
  const blockingAncestors=await submenu.evaluate(el=>{const ancestors=[];for(let node=el.parentElement;node;node=node.parentElement){const s=getComputedStyle(node);if(s.backdropFilter!=='none'||s.filter!=='none'||Number(s.opacity)<1)ancestors.push({className:node.className,blur:s.backdropFilter,filter:s.filter,opacity:s.opacity})}return ancestors})
  expect(blockingAncestors).toEqual([])
  expect(await submenu.locator('[data-test="text-color-blue"] .bn-color-icon[data-text-color="blue"]').count()).toBe(1)
  await submenu.locator('[data-test="text-color-blue"]').click();await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('body-0').props.textColor)).toBe('blue')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

for(const dark of [false,true])it(`preserves native submenu keyboard, color selection and outside dismissal in ${dark?'dark':'light'} theme`,async()=>{
 const {page,errors}=await fixture(dark)
 try{
  let {submenu}=await openColors(page,true)
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.getAttribute('data-test'))).toBe('text-color-default')
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('body-0').props.textColor)).toBe('red')
  await expect.poll(()=>page.locator('.bn-color-picker-dropdown').count()).toBe(0)
  ;({submenu}=await openColors(page));expect(await submenu.locator('[data-test="text-color-red"] .mantine-Menu-itemSection[data-position="right"] svg').count()).toBe(1)
  await submenu.locator('[data-test="background-color-yellow"]').click();await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('body-0').props.backgroundColor)).toBe('yellow')
  await openColors(page,true);await page.keyboard.press('ArrowLeft');await expect.poll(()=>page.locator('.bn-color-picker-dropdown').count()).toBe(0)
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.textContent)).toBe('颜色')
  await page.keyboard.press('ArrowRight');await page.locator('.bn-color-picker-dropdown').waitFor();await page.keyboard.press('Escape')
  await expect.poll(()=>page.locator('.bn-color-picker-dropdown,.bn-drag-handle-menu').count()).toBe(0)
  await openColors(page);await page.mouse.click(1250,800)
  await expect.poll(()=>page.locator('.bn-color-picker-dropdown,.bn-drag-handle-menu').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
