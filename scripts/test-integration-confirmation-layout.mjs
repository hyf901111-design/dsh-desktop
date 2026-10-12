// Render the production view in isolated Chromium; no user account or app is connected.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const { default: playwright } = await import(process.env.SHERLOCK_PLAYWRIGHT_MODULE ||
  '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const fixture = await build({
  stdin:{resolveDir:process.cwd(),contents:`
    import { IntegrationView } from './src/preload/integrations/view.ts';
    window.openConfirmation = async (action, count, dark) => {
      window.view?.dispose();
      document.body.innerHTML='<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"></main>';
      document.body.toggleAttribute('data-ds-dark-theme',dark);
      const calls=[];
      const kind=action==='rollback'?'plugin':'connection';
      const row={id:'test',kind,tab:kind==='plugin'?'plugins':'mcp',name:'测试连接'+('长名称'.repeat(24)),description:'test',enabled:true,status:'已连接',source:'个人',revision:1,removable:true,canRollback:true};
      const descriptions=Array.from({length:count},(_,i)=>'定时任务 component-data:'+i+'-'+('a'.repeat(128))+' 曾使用此能力');
      const view=new IntegrationView(document,{request:async c=>{
        calls.push(c);
        if(c.type==='snapshot')return {type:'snapshot',snapshot:{revision:1,rows:[row]}};
        if(c.type==='dependencies')return {type:'dependencies',descriptions};
        throw Error('UNEXPECTED_MUTATION');
      }});
      window.view=view;window.calls=calls;
      view.mount();await view.open();
      if(kind==='connection')document.querySelector('[data-tab=mcp]').click();
      document.querySelector('[data-more=test]').click();
      document.querySelector('[data-menu-action='+action+']').click();
    };
  `},bundle:true,write:false,format:'iife',
  plugins:[{name:'production-raw-styles',setup(b){
    b.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-style'}))
    b.onLoad({filter:/.*/,namespace:'raw-style'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))
  }}]
})
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_CHROMIUM_PATH ||
  '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try {
  const page=await browser.newPage()
  await page.setContent('<body></body>')
  await page.addScriptTag({content:fixture.outputFiles[0].text})
  for(const dark of [false,true])for(const [width,height] of [[1280,800],[720,420],[360,480]])for(const action of ['uninstall','disconnect','rollback']) {
    await page.setViewportSize({width,height})
    await page.evaluate(({action,dark})=>window.openConfirmation(action,120,dark),{action,dark})
    await page.waitForSelector('[role=dialog]')
    const before=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}
      const dialog=document.querySelector('[role=dialog]'),body=dialog.querySelector('.ig-dialog-body')
      return {dialog:rect(dialog),footer:rect(dialog.querySelector('footer')),buttons:[...dialog.querySelectorAll('footer button')].map(rect),
        body:body&&{...rect(body),clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,clientWidth:body.clientWidth,scrollWidth:body.scrollWidth},
        items:dialog.querySelectorAll('li').length,title:rect(dialog.querySelector('h2'))}
    })
    assert.ok(before.dialog.top>=16 && before.dialog.bottom<=height-16,JSON.stringify({dark,width,height,action,...before}))
    assert.ok(before.dialog.left>=16 && before.dialog.right<=width-16)
    assert.equal(before.items,120,'all dependency effects remain readable')
    assert.ok(before.body && before.body.scrollHeight>before.body.clientHeight,'only the dependency body scrolls')
    assert.equal(before.body.scrollWidth,before.body.clientWidth,'long task identifiers wrap without horizontal overflow')
    for(const r of before.buttons)assert.ok(r.top>=before.dialog.top && r.bottom<=height-16 && r.left>=16 && r.right<=width-16)
    const after=await page.evaluate(()=>{
      const body=document.querySelector('.ig-dialog-body');body.scrollTop=body.scrollHeight;
      const footer=document.querySelector('.ig-dialog footer').getBoundingClientRect();
      return {scrollTop:body.scrollTop,footerTop:footer.top,footerBottom:footer.bottom}
    })
    assert.ok(after.scrollTop>0);assert.equal(after.footerTop,before.footer.top);assert.equal(after.footerBottom,before.footer.bottom)
    const cancelled=await page.evaluate(()=>{
      document.querySelector('[data-action=cancel-dialog]').click();
      return {closed:!document.querySelector('[role=dialog]'),mutated:window.calls.some(c=>['uninstall','disconnect','rollback'].includes(c.type))}
    })
    assert.deepEqual(cancelled,{closed:true,mutated:false})
    console.log(JSON.stringify({dark,width,height,action,items:before.items,dialog:before.dialog,bodyHeight:before.body.clientHeight,buttonsVisible:true}))
  }
  await page.evaluate(()=>window.view.dispose())
} finally {await browser.close()}
