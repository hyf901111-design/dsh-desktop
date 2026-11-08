import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,styles
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 styles=await Promise.all(['src/preload/figma-final-shell.css','src/preload/figma-refinements.css','scripts/lib/research-grid-workbench.css','scripts/lib/workbench-style.css','scripts/lib/board-tabs.css'].map(path=>readFile(path,'utf8')))
},30000)
afterAll(async()=>browser?.close())

const html='<main data-research-canvas data-ework-grid><div class="ew-board-tabs-nav" data-board-tabs-nav data-board-tabs-theme="light" style="width:600px"><div class="ew-board-tabs-list" role="tablist"><button role="tab" aria-selected="true">我的自选</button><button role="tab" aria-selected="false">新闻公告</button></div><button data-board-tabs-more><span class="ew-board-tabs-icon"></span></button></div><article data-research-node-id="native"><header class="ew-grid-header"><span class="ew-grid-title">行情面板</span><button data-native-more><span class="ew-grid-icon"></span></button></header></article></main><div class="ew-grid-menu" role="menu" id="ordinary"><button role="menuitem"><span class="ew-grid-icon"></span><span>组件设置</span></button></div><div class="ew-grid-menu ew-board-tabs-menu" role="menu" data-board-tabs-menu data-board-tabs-theme="light"><button role="menuitem"><span class="ew-grid-icon"></span><span>页签设置</span></button></div>'
async function mode(page,appDark,board){await page.evaluate(({appDark,board})=>{document.body.toggleAttribute('data-ds-dark-theme',appDark);document.querySelector('main').dataset.workbenchStyle=board;document.querySelectorAll('[data-board-tabs-theme]').forEach(el=>el.dataset.boardTabsTheme=board)},{appDark,board})}

it('页签菜单与普通组件菜单在应用主题和四种看板模式交叉时保持同一前景及磨砂材质',async()=>{
 const page=await browser.newPage()
 try{
  await page.setContent(html)
  // Both preload-first and client-first styles must preserve the menu's own palette.
  for(const order of [styles,[...styles.slice(2),...styles.slice(0,2)]]){
   await page.locator('style').evaluateAll(els=>els.forEach(el=>el.remove()))
   await page.addStyleTag({content:order.join('\n')})
   for(const appDark of [false,true])for(const board of ['light','dark','enterprise','openterminal']){
    await mode(page,appDark,board)
    const menus=await page.locator('[role=menu]').evaluateAll(els=>els.map(el=>{const css=getComputedStyle(el),button=getComputedStyle(el.querySelector('button'));return {color:css.color,background:css.backgroundColor,blur:css.backdropFilter,button:button.color}}))
    expect(menus[1],JSON.stringify({appDark,board})).toEqual(menus[0])
    expect(menus[1].color).toBe(appDark?'rgb(229, 229, 229)':'rgb(37, 37, 37)')
   }
  }
 }finally{await page.close()}
})

it('四模式选中态还原设计颜色，更多图标沿用同模式原生组件的前景色',async()=>{
 const page=await browser.newPage()
 const palettes={
  light:{surface:'rgb(255, 255, 255)',selected:'rgb(232, 242, 252)',text:'rgb(22, 140, 240)',idle:'rgb(119, 119, 129)',radius:'4px'},
  dark:{surface:'rgb(21, 21, 24)',selected:'rgb(34, 49, 71)',text:'rgb(22, 140, 240)',idle:'rgb(160, 160, 171)',radius:'4px'},
  enterprise:{surface:'rgb(255, 255, 255)',selected:'rgb(236, 239, 241)',text:'rgb(48, 54, 61)',idle:'rgb(107, 114, 128)',radius:'0px'},
  openterminal:{surface:'rgb(10, 10, 10)',selected:'rgb(28, 25, 18)',text:'rgb(255, 153, 0)',idle:'rgb(128, 128, 128)',radius:'0px'}
 }
 try{
  await page.setContent(html);await page.addStyleTag({content:styles.join('\n')})
  for(const appDark of [false,true])for(const [board,want] of Object.entries(palettes)){
   await mode(page,appDark,board)
   const paint=await page.evaluate(()=>{
    const nav=document.querySelector('[data-board-tabs-nav]'),bar=getComputedStyle(nav),selected=getComputedStyle(document.querySelector('[aria-selected=true]')),idle=getComputedStyle(document.querySelector('[aria-selected=false]'))
    nav.dataset.boardTabsOrientation='horizontal'
    return {surface:bar.backgroundColor,selected:selected.backgroundColor,text:selected.color,idle:idle.color,radius:bar.borderRadius}
   })
   expect(paint,JSON.stringify({appDark,board})).toEqual(want)
   expect(await page.locator('[data-board-tabs-more]').evaluate(el=>getComputedStyle(el).color)).toBe(await page.locator('[data-native-more]').evaluate(el=>getComputedStyle(el).color))
   expect(await page.locator('[data-board-tabs-nav]').evaluate(el=>el.getBoundingClientRect().height)).toBe(34)
   const borders=await page.locator('[data-board-tabs-nav],[data-research-node-id="native"]').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return ['Top','Right','Bottom','Left'].map(side=>({width:s['border'+side+'Width'],style:s['border'+side+'Style'],color:s['border'+side+'Color']}))}))
   if(board==='openterminal'){
    expect(borders[0]).toEqual(borders[1])
    expect(borders[0].every(side=>side.width==='1px'&&side.style==='solid'&&side.color==='rgb(48, 48, 48)')).toBe(true)
   }else expect(borders[0].every(side=>side.width==='0px')).toBe(true)
  }
 }finally{await page.close()}
})

it('长页签标题完整占用自然宽度，横向溢出由页签列表承接而不截断文字',async()=>{
 const page=await browser.newPage()
 try{
  await page.setContent(html);await page.addStyleTag({content:styles.join('\n')})
  const titles=['我的自选跨市场重点股票研究','新闻公告与每日市场事件跟踪','中英文研究 Research Watchlist 2026']
  await page.locator('[role=tablist]').evaluate((list,titles)=>{list.replaceChildren(...titles.map(name=>{const button=document.createElement('button');button.setAttribute('role','tab');button.textContent=name;return button}))},titles)
  for(const width of [600,260]){
   await page.locator('[data-board-tabs-nav]').evaluate((el,width)=>el.style.width=width+'px',width)
   for(const tab of await page.locator('[role=tab]').all()){
    const size=await tab.evaluate(el=>({width:el.clientWidth,content:el.scrollWidth,height:el.getBoundingClientRect().height,ellipsis:getComputedStyle(el).textOverflow}))
    expect(size.content).toBeLessThanOrEqual(size.width)
    expect(size.width).toBeGreaterThan(64)
    expect(size.height).toBe(26)
    expect(size.ellipsis).not.toBe('ellipsis')
   }
   expect(await page.locator('[role=tablist]').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true)
  }
 }finally{await page.close()}
})
