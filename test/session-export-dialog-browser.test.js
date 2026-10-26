import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'

let browser,script,nativeCss,workbenchCss,shellCss
const output=process.env.SHERLOCK_EXPORT_DIALOG_OUTPUT||await mkdtemp(join(tmpdir(),'session-export-dialog-'))
beforeAll(async()=>{
 await mkdir(output,{recursive:true})
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',fs=await import('node:fs/promises'),files=await fs.readdir(assets)
 nativeCss=await readFile(join(assets,files.find(file=>/^index-.*\.css$/.test(file))),'utf8')
 // Run the production native-presentation transform. Its bare button selector
 // is the actual global rule loaded by the research-grid client, not a mock.
 const grid=await readFile('scripts/lib/research-grid-workbench.mjs','utf8'),expression=grid.match(/const nativePresentation=([^\n]+)/)?.[1]
 expect(expression).toBeTruthy();workbenchCss=new Function('WORKBENCH_PRESENTATION_CSS','return '+expression)(WORKBENCH_PRESENTATION_CSS)
 const shell=await readFile('src/preload/shell-style.ts','utf8');shellCss=shell.match(/const desktopShellStyles = `([\s\S]*?)`/)?.[1];expect(shellCss).toBeTruthy()
 const exported=await readFile('node_modules/@deepseek-ai/dsh-session-log-export/lib/client.js','utf8'),start=exported.indexOf('function SessionLogDownloadDialog('),end=exported.indexOf('\n\t\t//#endregion',start)
 expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start)
 const dialog=exported.slice(start,end)
 const buttonNames={button:'_button_kz6gm_4',md:'_md_kz6gm_24',sm:'_sm_kz6gm_30',primary:'_primary_kz6gm_38',ghost:'_ghost_kz6gm_47',outline:'_outline_kz6gm_56',toolbar:'_toolbar_kz6gm_65',icon:'_icon_kz6gm_73'}
 const names={root:'_root_15u5s_2',mask:'_mask_15u5s_14',dialog:'_dialog_15u5s_22',content:'_content_15u5s_37',header:'_header_15u5s_45',title:'_title_15u5s_53',close:'_close_15u5s_61',description:'_description_15u5s_80',body:'_body_15u5s_89',footer:'_footer_15u5s_97'}
 for(const name of Object.values(names))expect(nativeCss).toContain('.'+name)
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';import * as _deepseek_ai_dsh_client_ui_primitives from '@deepseek-ai/dsh-client-ui-primitives';
 ${dialog}
 const copies={zh:{'dialog.successTitle':'Session 导出已开始下载','dialog.successDescription':'浏览器正在下载 Session ZIP 文件。','dialog.close':'关闭'},en:{'dialog.successTitle':'Session export download started','dialog.successDescription':'The browser is downloading the Session ZIP file.','dialog.close':'Close'}};
 function App(){const[open,setOpen]=React.useState(true),[custom,setCustom]=React.useState(false);const dismiss=()=>{window.dismissed++;setOpen(false)};window.exportDialog={show:()=>setOpen(true),custom:()=>setCustom(true)};const t=key=>copies[window.locale][key]??key;return <><SessionLogDownloadDialog sessionId='fixture' useSessionLogDownload={select=>select({bySession:{fixture:{status:'success',open:open&&!custom}}})} dismiss={dismiss} t={t}/>{custom&&<_deepseek_ai_dsh_client_ui_primitives.Modal open onClose={dismiss} title='自定义弹窗' headless><button className='custom-close' onClick={dismiss}>×</button><p>自定义内容</p></_deepseek_ai_dsh_client_ui_primitives.Modal>}</>};window.dismissed=0;createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,jsx:'automatic',platform:'browser',format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'native-modal-css-map',setup(b){b.onLoad({filter:/dsh-client-ui-primitives\/lib\/index\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('var Modal_module_css_default = {};','var Modal_module_css_default = '+JSON.stringify(names)+';').replace('var Button_module_css_default = {};','var Button_module_css_default = '+JSON.stringify(buttonNames)+';'),loader:'js'}))}}]})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(mode,locale){
 const page=await browser.newPage({viewport:{width:780,height:520},deviceScaleFactor:2}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<div id="root"></div>');await page.evaluate(({mode,locale})=>{window.locale=locale;if(mode==='dark')document.body.setAttribute('data-ds-dark-theme','')},{mode,locale})
 await page.addStyleTag({content:nativeCss+'\n'+workbenchCss+'\n:root{--dsw-alias-button-primary-fill:#252525;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-bg-layer-2:#fff;--dsw-alias-label-primary:#252525;--dsw-alias-label-secondary:#777;--dsw-alias-border-inverted:#ddd;--dsw-alias-bg-mask-1:#0007}body[data-ds-dark-theme]{--dsw-alias-button-primary-fill:#f8f9fa;--dsw-alias-label-primary-foreground:#171717;--dsw-alias-bg-layer-2:#2b2b2b;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa;--dsw-alias-border-inverted:#555}.custom-close{width:40px;height:36px;padding:4px 9px}'});await page.addScriptTag({content:script});await page.locator('._close_15u5s_61').waitFor();return{page,errors}
}
async function metrics(page){return page.locator('._close_15u5s_61').evaluate(button=>{const svg=button.querySelector('svg'),rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{button:rect(button),svg:rect(svg),padding:getComputedStyle(button).padding,svgShrink:getComputedStyle(svg).flexShrink,footer:rect(document.querySelector('._footer_15u5s_97 button'))}})}
it.each([['light','zh'],['dark','zh'],['light','en'],['dark','en']])('keeps the real export Modal close icon centered and usable in %s/%s after workbench styles load',async(mode,locale)=>{
 const{page,errors}=await fixture(mode,locale)
 try{
  const before=await metrics(page);expect(before.svg.width).toBe(4);expect(before.padding).toBe('5px 12px')
  await page.addStyleTag({content:shellCss});const after=await metrics(page);await writeFile(join(output,mode+'-'+locale+'.json'),JSON.stringify({before,after},null,2)+'\n');await page.screenshot({path:join(output,mode+'-'+locale+'.png')})
  expect(after.button.width).toBe(28);expect(after.button.height).toBe(28);expect(after.svg.width).toBe(14);expect(after.svg.height).toBe(14);expect(after.padding).toBe('0px');expect(after.svgShrink).toBe('0')
  expect(after.svg.x+7).toBeCloseTo(after.button.x+14,3);expect(after.svg.y+7).toBeCloseTo(after.button.y+14,3);expect(after.footer).toEqual(before.footer)
  const b=after.button;await page.mouse.click(b.x+2,b.y+2);expect(await page.evaluate(()=>window.dismissed)).toBe(1);expect(await page.getByRole('dialog').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},10000)
it('preserves native Escape/footer dismissal and custom headless dialog controls',async()=>{
 const{page,errors}=await fixture('dark','en')
 try{
  await page.addStyleTag({content:shellCss});await page.keyboard.press('Escape');expect(await page.evaluate(()=>window.dismissed)).toBe(1)
  await page.evaluate(()=>window.exportDialog.show());await page.locator('._footer_15u5s_97 button').click();expect(await page.evaluate(()=>window.dismissed)).toBe(2)
  await page.evaluate(()=>window.exportDialog.custom());const button=page.locator('.custom-close');await button.waitFor();expect(await button.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,padding:getComputedStyle(el).padding}))).toEqual({width:40,height:36,padding:'4px 9px'});expect(errors).toEqual([])
 }finally{await page.close()}
},10000)
