import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {pathToFileURL} from 'node:url'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isFunctionDeclaration} from 'typescript'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
let browser,html,css
beforeAll(async()=>{
  const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),syntax=createSourceFile('native.js',source,ScriptTarget.Latest,false,ScriptKind.JS);let native
  const visit=node=>{if(isFunctionDeclaration(node)&&node.name?.text==='ContextMeter')native=node.getText(syntax);forEachChild(node,visit)};visit(syntax)
  const Meter=runInNewContext(native+';ContextMeter',{react:{useState:()=>[false,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}},react_jsx_runtime:jsx,_deepseek_ai_dsh_client_ui_primitives:{Tooltip:({children})=>children},contextOccupancy:()=>({percent:21}),ContextMeter_module_css_default:new Proxy({},{get:(_,key)=>'JObwrW_'+String(key)}),RADIUS:5.5,CIRCUMFERENCE:2*Math.PI*5.5,READING_SLOT:'\0',ROWS:[]})
  html=renderToStaticMarkup(jsx.jsx(Meter,{useProjection:()=>undefined,t:(_key,args)=>'上下文已用 '+args?.percent}))
  css=JSON.parse(source.match(/const css\$\d+ = ("\.JObwrW_root[^\n]+);/)[1])+await readFile('src/preload/figma-final-shell.css','utf8')+await readFile('src/preload/figma-refinements.css','utf8')
  const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js';const {chromium}=await import(/* @vite-ignore */pathToFileURL(runtime).href);browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>{await browser?.close()})
for(const dark of [false,true])it(`centers the actual native context ring inside its background (${dark?'dark':'light'})`,async()=>{
  const page=await browser.newPage();try{
    await page.setContent(`<body ${dark?'data-ds-dark-theme':''}><div class="sRp_composer"><div class="uV2eYG_card"><div class="uV2eYG_row"><div class="uV2eYG_trailing">${html}</div></div></div></div></body>`);await page.addStyleTag({content:css});await page.locator('.JObwrW_trigger').hover()
    const boxes=await page.evaluate(()=>['.JObwrW_trigger','.JObwrW_trigger>svg'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}}));expect(boxes[0]).toMatchObject({width:30,height:30});expect(boxes[1]).toMatchObject({width:14,height:14});expect(boxes[0].x).toBe(boxes[1].x);expect(boxes[0].y).toBe(boxes[1].y)
  }finally{await page.close()}
})

it('keeps a fixed reading gap below workspace reference buttons while the draft scrolls', async () => {
  const page = await browser.newPage({viewport: {width: 372, height: 900}})
  try {
    await page.setContent(`<section class="sRp_composer">
      <div data-composer-card class="uV2eYG_card" style="display:flex;flex-direction:column">
        <div data-research-context-anchor><button>参考当前画板资料 · 1个组件</button></div>
        <div data-input-scroll class="uV2eYG_scroll">
          <div class="uV2eYG_mirror" style="white-space:pre-wrap"></div>
        </div>
        <div class="uV2eYG_row"></div>
      </div>
    </section>`)
    await page.addStyleTag({content: css + await readFile('src/preload/figma-reading.css', 'utf8')})
    const scroller = page.locator('[data-input-scroll]')
    const reference = page.locator('button')
    const writingLayer = page.locator('.uV2eYG_mirror')
    const inset = () => writingLayer.evaluate(el => parseFloat(getComputedStyle(el).paddingTop))
    const gap = async () => (await scroller.boundingBox()).y - (await reference.boundingBox()).y - (await reference.boundingBox()).height
    expect(await gap() + await inset()).toBe(15)
    await writingLayer.evaluate(el => {
      el.textContent = [
        'Treasury Par Yield Curve Rates 的真实年化收益率（%），默认比较12月27日至31日，保留来源和全部精度。',
        'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202412',
        '日期 2年 5年 10年 30年', '2024-12-27  4.31 4.45 4.62 4.82',
        '2024-12-30  4.24 4.37 4.55 4.77', '2024-12-31  4.25 4.38 4.58 4.78'
      ].join('\n')
    })
    await scroller.evaluate(el => { el.style.height = '120px'; el.scrollTop = el.scrollHeight })
    expect(await scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    expect(await gap()).toBeGreaterThanOrEqual(8)
    await reference.evaluate(el => el.remove())
    expect(await scroller.evaluate(el => getComputedStyle(el).marginBlockStart)).toBe('0px')
    expect(await inset()).toBe(15)
  } finally {
    await page.close()
  }
})
