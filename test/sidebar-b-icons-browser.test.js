import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
let browser
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
beforeAll(async()=>{const pw=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');browser=await(pw.default||pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})},20000)
afterAll(()=>browser?.close())
it('keeps 36px hit areas with compact 44px center steps across nested groups, and centered panel glyphs',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:800}})
 await page.route('http://fixture.test/**',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill({body:read('build/brand/'+file),contentType:'image/svg+xml'})})
 const scheduled=vm.runInNewContext(read('src/preload/scheduled/style.ts').replace(/^import[^\n]*\n/u,'').replace('export const scheduledStyles','const scheduledStyles')+';scheduledStyles',{icons:{chat:'',research:'',note:''}})
 const base=JSON.parse(read('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js').match(/const css = ("[^\n]*");/u)[1])
 const workspaceCss=[...read('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js').matchAll(/const css(?:\$\d+)? = ("[^\n]*");/gu)].map(match=>JSON.parse(match[1])).find(value=>value.includes('.qDHVXG_rail'))
 expect(workspaceCss).toBeTruthy()
 const svg='<svg viewBox="0 0 18 18"><path d="M0 0h18v18H0z"/></svg>',button=(label,cls='hHd-Xa_iconButton',children=svg)=>`<button aria-label="${label}" class="${cls}">${children}</button>`
 await page.setContent(`<base href="http://fixture.test/"><style>${base}${workspaceCss}${scheduled}${read('src/preload/figma-final-shell.css')}${read('src/preload/figma-refinements.css')}${read('src/preload/figma-b-icons.css')}</style><aside class="hHd-Xa_root hHd-Xa_collapsed" data-dsh-sidebar-root data-dsh-sidebar-wide="false" style="width:80px"><div class="hHd-Xa_logoRow">${button('搜索会话')}${button('打开侧边栏','hHd-Xa_iconButton hHd-Xa_toggle')}</div><div data-srb-navigation-scroll><div class="hHd-Xa_regionArea"><div class="qDHVXG_root qDHVXG_rail"><div class="qDHVXG_sectionHeader"><div class="qDHVXG_headerActions">${button('添加工作区','qDHVXG_iconButton')}</div></div><div class="qDHVXG_listArea" data-srb-workspace-list></div></div></div></div><div class="hHd-Xa_newSessionGroup">${button('新建对话','hHd-Xa_newSession','')}${button('新建研究','hHd-Xa_newSession','')}<button class="hHd-Xa_newSession" data-sidebar-new-note aria-label="新建笔记"></button><span class="st-more-zone">${button('更多','st-more','<i class="st-icon"></i>')}</span></div><div class="hHd-Xa_footArea"></div></aside><div class="t8lSSG_panel"><button class="t8lSSG_toggleButton"><svg data-odyssey-panel-toggle="right">${svg}</svg></button></div>`)
 const labels=['打开侧边栏','搜索会话','添加工作区','新建对话','新建研究','新建笔记','更多']
 const boxes=[]
 for(const label of labels)boxes.push(await page.getByLabel(label,{exact:true}).boundingBox())
 boxes.forEach((box,i)=>{expect(box.width).toBe(36);expect(box.height).toBe(36);if(i){expect(box.y-boxes[i-1].y).toBe(44);expect(box.x).toBe(boxes[0].x)}})
 const glyphs=await page.locator('.hHd-Xa_logoRow>button>svg').evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,mask:getComputedStyle(el).maskImage,hidden:getComputedStyle(el.firstElementChild).visibility})))
 expect(glyphs.every(glyph=>glyph.width===20&&glyph.mask.includes('odyssey-b-')&&glyph.hidden==='hidden')).toBe(true)
 expect(await page.getByLabel('添加工作区',{exact:true}).locator('svg').evaluate(el=>getComputedStyle(el).maskImage)).toContain('odyssey-b-workspace-add-20.svg')
 const panel=await page.locator('.t8lSSG_toggleButton').boundingBox(),glyph=await page.locator('[data-odyssey-panel-toggle]').boundingBox()
 expect(panel.width).toBe(32);expect(glyph.width).toBe(18);expect(glyph.x-panel.x).toBe(7);expect(glyph.y-panel.y).toBe(7)
 await page.locator('[data-dsh-sidebar-root]').evaluate(el=>el.dataset.dshSidebarWide='true')
 await page.getByLabel('搜索会话',{exact:true}).hover()
 const hover=await page.getByLabel('搜索会话',{exact:true}).evaluate(el=>{const css=getComputedStyle(el);return {radius:css.borderRadius,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}})
 expect(hover).toEqual({radius:'8px',width:32,height:32})
 const leftPlus=await page.getByLabel('添加工作区',{exact:true}).locator('svg').evaluate(el=>({mask:getComputedStyle(el).maskImage,width:el.getBoundingClientRect().width}))
 expect(leftPlus.mask).toContain('odyssey-b-workspace-add-18.svg');expect(leftPlus.width).toBe(18)
 await page.locator('[data-dsh-sidebar-root]').evaluate((el,svg)=>el.insertAdjacentHTML('beforeend','<button aria-label="新建研究看板">'+svg+'</button>'),svg)
 expect(await page.getByLabel('新建研究看板',{exact:true}).locator('svg').evaluate(el=>getComputedStyle(el).maskImage)).toContain('odyssey-b-new-tab-18.svg')
 await page.close()
})
