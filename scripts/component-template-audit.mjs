// Run this function via a Playwright page against component-template-gallery.mjs output.
export default async (page, baseUrl = 'http://127.0.0.1:8896') => {
const manifest=await (await page.request.get(baseUrl+'/manifest.json')).json();
const audit=[];
for(const t of manifest){
 for(const theme of ['light','dark']){
  const errors=[];const onerror=e=>errors.push(e.message);page.on('pageerror',onerror);
  await page.emulateMedia({colorScheme:theme});
  await page.goto(baseUrl+'/'+t.id+'-'+theme+'.html');
  for(const width of [...new Set([320,t.width,960])]){
   await page.setViewportSize({width,height:Math.max(t.height,240)});
   const frame=page.mainFrame().childFrames()[0]||page.mainFrame();
   await frame.locator('body').waitFor({state:'attached'});
   const state=await frame.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const horizontallyScrollable=e=>{for(let p=e.parentElement;p;p=p.parentElement){const style=getComputedStyle(p);if(/auto|scroll/.test(style.overflowX)&&p.scrollWidth>p.clientWidth+2)return true}return false};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};const controls=[...document.querySelectorAll('button,input,select,summary')].filter(visible);return {width:innerWidth,theme:document.documentElement.dataset.sherlockTheme,background:getComputedStyle(document.body).backgroundColor,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,bodyHeight:document.body.getBoundingClientRect().height,text:document.body.innerText.slice(0,110),controls:controls.length,disabled:controls.filter(e=>e.disabled).map(e=>e.textContent),overflowControls:controls.filter(e=>!horizontallyScrollable(e)&&(e.getBoundingClientRect().right>innerWidth+2||e.getBoundingClientRect().left< -2)).map(e=>e.textContent?.slice(0,40)),smallText:[...document.querySelectorAll('p,span,small,button,select,td,th,label,summary')].filter(visible).filter(e=>e.textContent.trim()&&parseFloat(getComputedStyle(e).fontSize)<10).length}});
   audit.push({id:t.id,theme,...state,errors:[...errors]});
  }
  page.off('pageerror',onerror);
 }
}
return audit;

}