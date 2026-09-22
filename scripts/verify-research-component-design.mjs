// Chromium acceptance for the real sandbox renderer. No production profile/data access.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildResearchHtmlPreview } from '../packages/dsh-research-task-runtime/html-artifact.js'
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const chromium = playwright.chromium ?? playwright.default.chromium
const out = resolve(process.env.SHERLOCK_DESIGN_EVIDENCE || 'output/research-component-design')
await mkdir(out, { recursive: true })
const artifact = `<style>
main{padding:12px;display:grid;gap:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.research-metric{height:64px}.research-metric p{margin:0}.research-metric-value{margin-top:3px!important}.filters{display:flex;align-items:end;gap:8px}label{display:grid;gap:4px;color:var(--sherlock-muted)}input,select{width:160px}.chart{height:80px}button{background:blue!important;color:yellow!important;border-radius:30px!important;background-image:linear-gradient(blue,cyan)!important}a{color:blue!important}tbody td{height:34px}.research-metric small{color:var(--sherlock-muted);font-size:8px}
</style><main><div class="metrics">${[['穿透基金','8只'],['穿透覆盖率','92.6%'],['底层证券','186'],['前十大集中度','38.4%']].map(([l,v])=>`<div class="research-metric"><p class="research-metric-label">${l}</p><p class="research-metric-value">${v}</p><small>研究模拟 · 来源原稿结构</small></div>`).join('')}</div>
<div class="filters"><label>基金<input id="query" value="基金研究"></label><label>状态<select><option>全部</option></select></label><button id="search" type="submit">搜索</button><button id="reset">重置</button><input id="input-submit" type="submit" value="提交"><div role="checkbox" aria-checked="false"><svg width="16" height="16" viewBox="0 0 16 16"><path id="control-icon" d="M2 2H14V14H2Z" fill="blue"/></svg></div><label><input type="checkbox" checked>显示数值</label></div>
<table><thead><tr><th>对象</th><th class="research-numeric">权重</th><th>状态</th><th>操作</th></tr></thead><tbody><tr aria-selected="true"><td>权益核心组合</td><td class="research-numeric">24.6%</td><td><span data-sherlock-status="warning">待确认</span></td><td><a href="#detail">编辑</a></td></tr><tr><td>稳健均衡组合</td><td class="research-numeric">18.8%</td><td><span data-sherlock-status="success">已治理</span></td><td><a href="#detail">编辑</a></td></tr></tbody></table>
<svg class="chart" viewBox="0 0 860 80"><path id="series" d="M0 70L90 50 180 61 270 42 360 55 450 20 540 30 630 5 760 16 860 3" fill="none" stroke="var(--sherlock-chart-1)" stroke-width="2"/></svg><output id="count">0</output></main><script>document.querySelector('#search').onclick=()=>document.querySelector('#count').textContent=String(+document.querySelector('#count').textContent+1);document.querySelector('#reset').onclick=()=>document.querySelector('#query').value='';</script>`
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 896, height: 380 } })
  const errors=[];page.on('pageerror', e=>errors.push(e.message))
  await page.route('https://component.fixture/', route=>route.fulfill({contentType:'text/html',body:buildResearchHtmlPreview(artifact,'规范回归','light')}))
  await page.goto('https://component.fixture/')
  const inner = await page.locator('#preview').elementHandle().then(e=>e.contentFrame())
  await inner.waitForSelector('#search')
  await inner.locator('#query').fill('保留输入')
  await inner.locator('#search').click()
  await inner.evaluate(()=>{document.querySelector('#search').style.setProperty('background','blue','important');document.querySelector('#search').style.setProperty('color','red','important')})
  await inner.waitForFunction(()=>!document.querySelector('#search').style.getPropertyPriority('background'))
  const results=[]
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-theme',colorScheme:theme},'*'),theme)
    await inner.waitForFunction(theme=>document.documentElement.dataset.sherlockTheme===theme, theme)
    const state=await inner.evaluate(()=>{
      const style=id=>{const s=getComputedStyle(document.querySelector(id));return {bg:s.backgroundColor,color:s.color,h:s.height,r:s.borderRadius,image:s.backgroundImage,stroke:s.stroke}}
      return {theme:document.documentElement.dataset.sherlockTheme,button:style('#search'),secondary:style('#reset'),field:style('#query'),link:style('a'),series:style('#series'),warning:style('[data-sherlock-status=warning]'),submit:style('#input-submit'),iconFill:getComputedStyle(document.querySelector('#control-icon')).fill,input:document.querySelector('#query').value,count:document.querySelector('#count').textContent}
    })
    const dark=theme==='dark'
    assert.equal(state.button.bg,dark?'rgb(245, 245, 245)':'rgb(25, 25, 25)')
    assert.equal(state.button.color,dark?'rgb(25, 25, 25)':'rgb(255, 255, 255)')
    assert.equal(state.submit.r,'7px');assert.equal(state.submit.h,'28px');assert.equal(state.iconFill,dark?'rgb(245, 245, 245)':'rgb(51, 51, 51)');assert.equal(state.button.h,'28px');assert.equal(state.button.r,'7px');assert.equal(state.button.image,'none')
    assert.equal(state.field.h,'28px');assert.equal(state.field.r,'6px')
    assert.equal(state.link.color,dark?'rgb(245, 245, 245)':'rgb(51, 51, 51)')
    assert.equal(state.series.stroke,dark?'rgb(30, 185, 225)':'rgb(0, 80, 150)')
    assert.equal(state.warning.color,dark?'rgb(246, 208, 119)':'rgb(135, 96, 0)')
    assert.equal(state.input,'保留输入');assert.equal(state.count,'1')
    await page.screenshot({path:resolve(out,`component-${theme}.png`)})
    results.push(state)
  }
  await inner.locator('#reset').click();assert.equal(await inner.locator('#query').inputValue(),'')
  assert.deepEqual(errors,[])
  await writeFile(resolve(out,'html-design-checks.json'),JSON.stringify({pass:true,results},null,2))
  console.log(JSON.stringify({pass:true,evidence:out,checks:['Light/Dark neutral controls','28px geometry','authored CSS override','business chart/status preservation','same DOM and input/counter state','working reset']},null,2))
}finally{await browser.close()}
