import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
// Mirrors the observed generated component: valid initial rows, a mismatched
// move helper returning an unreadable order, and an independent selection.
const html=`<!doctype html><html><body><output id="order"></output><output id="selection"></output><button id="move">上移</button><button id="select">选择B02</button><script>
const names={B01:'一',B02:'二'},ORDER=['B01','B02'];
function move(a,type){let i=ORDER.indexOf(a.id),j=type==='up'?i-1:i+1;if(j<0||j>=ORDER.length)return null;let n=ORDER.slice();n[i]=n[j];n[j]=a.id;return {order:n};}
const shared=window.sherlockShared.register({initialState:{order:ORDER,selected:null},reduce:(s,a)=>a.type==='move'?{...s,...move(s,a)}:{...s,selected:a.id},render:(s,ctx)=>{document.getElementById('order').textContent=s.order.map(id=>names[id].toString()).join('');document.getElementById('selection').textContent=s.selected||'未选择';document.getElementById('move').disabled=ctx.readOnly||!ctx.connected;document.getElementById('select').disabled=ctx.readOnly||!ctx.connected;}});
document.getElementById('move').onclick=()=>shared.dispatch({type:'move',id:'B02'});document.getElementById('select').onclick=()=>shared.dispatch({type:'select',id:'B02'});
</script></body></html>`
async function open(saved){
 const page=await browser.newPage({viewport:{width:656,height:480}})
 const preview=buildResearchHtmlPreview(html,'本地交互回归','dark',{workbench:true,notoFont:'runtime'})
 await page.setContent('<iframe id=preview style="width:100%;height:460px" sandbox="allow-scripts" srcdoc="'+preview.replaceAll('&','&amp;').replaceAll('\"','&quot;')+'"></iframe>')
 const frame=page.frameLocator('#preview').frameLocator('iframe');await frame.locator('#move').waitFor()
 await page.evaluate(saved=>{
  window.checkEvents=[];addEventListener('message',e=>{if(e.data?.type==='sherlock-component-send'||e.data?.type==='sherlock-content-failed')window.checkEvents.push(e.data)})
  document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-component-context',shared:false,online:true,readOnly:false,userId:'local',...(saved?{saved}:{})},'*')
 },saved)
 await expect.poll(()=>frame.locator('#move').isEnabled()).toBe(true)
 return {page,frame}
}
it('keeps the interactive iframe and valid saved state after a generated move fails',async()=>{
 const {page,frame}=await open()
 try{
  await frame.locator('#move').click()
  await expect.poll(()=>frame.locator('[data-sherlock-operation-error]').textContent()).toContain('已保留')
  expect(await frame.locator('#order').textContent()).toBe('一二')
  const events=await page.evaluate(()=>window.checkEvents)
  expect(events.filter(e=>e.type==='sherlock-content-failed')).toEqual([])
  expect(events.filter(e=>e.message?.op==='localCommit')).toEqual([])
  await frame.locator('#select').click()
  await expect.poll(()=>frame.locator('#selection').textContent()).toBe('B02')
  expect(await frame.locator('[data-sherlock-operation-error]').count()).toBe(0)
  const commit=(await page.evaluate(()=>window.checkEvents)).filter(e=>e.message?.op==='localCommit').at(-1).message
  expect(commit).toMatchObject({revision:1,state:{order:['B01','B02'],selected:'B02'}})
 }finally{await page.close()}
},20000)
it('reopens an old unreadable snapshot without the host plain-text fallback',async()=>{
 const {page,frame}=await open({revision:7,state:{order:[null,'B01'],selected:null}})
 try{
  expect(await frame.locator('#order').textContent()).toBe('一二')
  expect(await frame.locator('[data-sherlock-operation-error]').textContent()).toContain('先前')
  expect((await page.evaluate(()=>window.checkEvents)).some(e=>e.type==='sherlock-content-failed')).toBe(false)
  await frame.locator('#select').click()
  await expect.poll(()=>frame.locator('#selection').textContent()).toBe('B02')
  const commits=(await page.evaluate(()=>window.checkEvents)).filter(e=>e.message?.op==='localCommit')
  expect(commits).toHaveLength(1);expect(commits[0].message).toMatchObject({revision:8,state:{order:['B01','B02'],selected:'B02'}})
 }finally{await page.close()}
},20000)
