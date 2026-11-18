import {afterAll, beforeAll, expect, it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'

let browser, bootstrap, resident
beforeAll(async () => {
  const pw = await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT ||
    '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await pw.chromium.launch({headless:true, executablePath:process.env.SHERLOCK_TEST_CHROMIUM ||
    '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
  resident = notesResidentProductionSource().replace('exports.ResearchCanvas = ResearchCanvas;',
    'exports.__containerContent=ResearchContainerContent; exports.__export=exportWorkbenchContent; exports.ResearchCanvas = ResearchCanvas;')
  const entry = `
    import * as react from 'react';import * as reactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';
    import {createRoot} from 'react-dom/client';import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
    const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
    window.dshDesktop={researchClipboard:{copy:async ({nodes})=>{window.copied=nodes;return {ok:true}}}};
    window.__ModuleLoader__={load:descriptor=>{
      const deps={'react':react,'react-dom':reactDom,'react/jsx-runtime':jsx,'@deepseek-ai/dsh-client-ui-primitives':primitives};
      const bundle=descriptor.factory(id=>deps[id]??fake);
      const registry=new bundle.ResearchWorkspaceRegistry(localStorage),sessionId='reading-sections';
      const workspace=registry.for(sessionId),root=createRoot(document.getElementById('host'));
      const ordinary=createRoot(document.getElementById('other'));
      window.reader={workspace, set:(spec,extra={})=>{
        const node={kind:'generated-container',id:'brief',messageId:'brief',workbenchId:'saved-plan',workbenchIndex:0,refreshMinutes:0,generationStatus:'completed',
          title:spec.title,excerpt:spec.content,containerSpec:spec,containerPrompt:'原始组件需求',sizeMode:'manual',x:320,y:170,width:640,height:340,...extra};
        workspace.setArtifacts([node]);return node;
      }, showOther:node=>ordinary.render(react.createElement(bundle.__containerContent,{node,sessionId,visible:true,preserveHeading:true})),
      export:()=>bundle.__export(document.querySelector('[data-research-node-id="brief"]'),workspace.getSnapshot().artifacts[0],
        'svg',{save:async request=>request.content})};
      root.render(react.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}));
    }};`
  const output = await build({stdin:{contents:entry,resolveDir:process.cwd()}, bundle:true, write:false,
    format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})
  bootstrap = output.outputFiles[0].text
}, 35000)
afterAll(() => browser?.close())

function markdown(title, content) { return {version:1, type:'markdown', title, content} }
const framework = markdown('期货研究框架与交易机制', [
  '## 自上而下五层研究框架', '1. **宏观驱动**：结合产业库存和开工率逐项核对公开的观测口径。'.repeat(3),
  '## 交易机制要点', '客户保证金与每日结算的口径可参见[交易所说明][rules]。', '### 逐日盯市', '先核对结算价，再对照持仓变动。'.repeat(5),
  '## 风控纪律', '风险窗口需要记录合约变动、移仓安排和持仓上限。'.repeat(5),
  '[rules]: https://example.org/rules'
].join('\n\n'))
const topics = ['黑色系（钢材）','黑色系（双焦）','有色金属（铜）','贵金属（黄金）','能源化工（原油）','农产品（油脂）']
const commentary = markdown('市场综述与机构观点', [
  '### 市场综述与机构观点（检索日期）', '本期综述覆盖六个商品板块，观测时点和研究机构附在文末。',
  ...topics.map((topic, i) => '**' + (i + 1) + '. ' + topic + '：本周机构判断及其主要依据**\n' +
    topic + '的原文观点和各自依据。' + '价格口径、报告日期和机构意见保留在本栏。'.repeat(3)),
  '---', '说明：按各篇报告的日期引用。', '[机构原文](https://example.org/report)'
].join('\n\n'))

async function open(spec, width=970) {
  const page = await browser.newPage({viewport:{width,height:700}, reducedMotion:'reduce'})
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://reading.test/', route => route.fulfill({contentType:'text/html',
    body:'<style>' + canvasCss + '\nhtml,body{margin:0}#host{width:100vw;height:660px}[data-research-canvas]{height:620px!important}</style><div id="host"></div><div id="other"></div>'}))
  await page.goto('https://reading.test/')
  await page.addScriptTag({content:bootstrap})
  await page.addScriptTag({content:resident})
  await page.locator('[data-ework-grid]').waitFor()
  await page.evaluate(spec => window.reader.set(spec), spec)
  const card = page.locator('[data-research-node-id="brief"]')
  await card.waitFor()
  return {page, card, panel:card.getByRole('tabpanel'), tabs:card.getByRole('tab'), errors}
}

it.each(['numbered','field label'])('opens %s inline research headings as tabs and retains each explanation', async style => {
  const titles=['宏观与产业基本面','价格结构与信号','资金与行为','风险与执行']
  const spec=markdown('研究框架',['系统性研究一个期货品种时，按四层展开：',
    ...titles.map((title,i)=>(style==='numbered'?'**'+(i+1)+'. '+title+'** — ':'**'+title+'**：')+
      ('按'+title+'核对指标的定义、对应的合约及交易日期。').repeat(3))].join('\n\n'))
  const {page,panel,tabs}=await open(spec)
  try {
    await tabs.first().waitFor()
    expect(await tabs.allTextContents()).toEqual(titles)
    expect(await panel.innerText()).toContain('按四层展开')
    await tabs.nth(2).click()
    expect(await panel.innerText()).toContain('按资金与行为核对指标')
    expect(await panel.innerText()).not.toContain('按价格结构与信号核对指标')
  } finally {await page.close()}
}, 22000)

it('opens the original workbench card, switches its actual Markdown, resolves cross-section links, and copies/exports from the host', async () => {
  const {page,card,panel,tabs,errors} = await open(framework)
  try {
    await tabs.first().waitFor()
    expect(await tabs.allTextContents()).toEqual(['自上而下五层研究框架','交易机制要点','风控纪律'])
    expect(await panel.getByText('宏观驱动', {exact:true}).first().isVisible()).toBe(true)
    await tabs.nth(1).click()
    const link = panel.getByRole('link', {name:'交易所说明'})
    expect(await link.getAttribute('href')).toBe('https://example.org/rules')
    expect(await panel.innerText()).toContain('先核对结算价')
    expect(await panel.innerText()).not.toContain('宏观驱动')
    await expect.poll(() => tabs.nth(1).getAttribute('aria-selected')).toBe('true')
    expect(await tabs.nth(1).getAttribute('aria-controls')).toBe(await panel.getAttribute('id'))
    expect(await panel.getAttribute('aria-labelledby')).toBe(await tabs.nth(1).getAttribute('id'))
    const exported = await page.evaluate(() => reader.export())
    expect(exported).toContain('<svg')
    expect(exported).toContain('交易所说明')
    await page.evaluate(async () => {reader.workspace.updateSelection(['brief'],'replace');await reader.workspace.copySelectedNodes()})
    expect(await page.evaluate(() => copied[0].containerSpec.content)).toBe(framework.content)
    expect(await card.locator('[data-workbench-more]').count()).toBe(1)
    for (const [key, index] of [['ArrowRight',2],['ArrowRight',0],['End',2],['Home',0],['ArrowLeft',2]]) {
      await page.keyboard.press(key)
      expect(await tabs.nth(index).evaluate(tab => tab === document.activeElement && tab.getAttribute('aria-selected') === 'true')).toBe(true)
    }
    await page.keyboard.press('Tab')
    expect(await panel.evaluate(element => element === document.activeElement)).toBe(true)
    expect(await panel.innerText()).toContain('移仓安排')
    await card.locator('[data-workbench-more]').click()
    const settings = page.getByRole('menuitem', {name:'组件设置'})
    await settings.hover()
    await page.getByRole('menuitem', {name:'编辑需求',exact:true}).click()
    const edit = card.getByRole('dialog', {name:'编辑需求'})
    expect(await edit.locator('textarea').inputValue()).toBe('原始组件需求')
    await edit.locator('textarea').press('Escape')
    await expect.poll(() => edit.count()).toBe(0)
    expect(await tabs.nth(2).getAttribute('aria-selected')).toBe('true')
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 22000)

it('keeps the overview, numbered bold topics and source appendix reachable on a narrow card', async () => {
  const {page,card,panel,tabs,errors} = await open(commentary, 420)
  try {
    await tabs.first().waitFor()
    expect(await tabs.allTextContents()).toEqual(['概览',...topics,'来源与说明'])
    expect(await panel.innerText()).toContain('本期综述覆盖六个商品板块')
    const picker = card.getByRole('combobox', {name:'全部栏目'})
    await picker.selectOption('5')
    expect(await panel.innerText()).toContain('能源化工（原油）的原文观点')
    expect(await panel.innerText()).not.toContain('黑色系（钢材）的原文观点')
    await tabs.nth(5).focus()
    await page.keyboard.press('End')
    expect(await panel.getByRole('link', {name:'机构原文'}).isVisible()).toBe(true)
    expect(await panel.innerText()).toContain('按各篇报告的日期引用')
    const widths = await card.locator('.ew-reading-nav').evaluate(nav => ({width:nav.clientWidth,
      tabs:nav.querySelector('[role=tablist]').scrollWidth, card:nav.closest('[data-research-node-id]').clientWidth,
      active:nav.querySelector('[aria-selected=true]').getBoundingClientRect().right, right:nav.getBoundingClientRect().right}))
    expect(widths.tabs).toBeGreaterThan(widths.width)
    expect(widths.width).toBeLessThanOrEqual(widths.card)
    expect(widths.active).toBeLessThanOrEqual(widths.right + 1)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 22000)

it('leaves manual notes, ordinary component hosts, short/single-section and unsuccessful results in their existing reading views', async () => {
  const {page,card,tabs,errors} = await open(framework)
  try {
    await tabs.first().waitFor()
    await page.evaluate(() => reader.showOther(reader.workspace.getSnapshot().artifacts[0]))
    expect(await page.locator('#other').getByRole('tablist').count()).toBe(0)
    expect(await page.locator('#other').innerText()).toContain('移仓安排')
    for (const [spec, extra] of [
      [framework, {workbenchId:undefined}],
      [markdown('短文', '## 分析\n\n短句。\n\n## 说明\n\n另一短句。'), {}],
      [markdown('单节', '## 单节研究说明\n\n' + '正文保留在一节。'.repeat(60)), {}],
      [markdown('期限结构——数据缺失，暂无法绘制', framework.content), {}],
      [framework, {deliveryStatus:'partial',recoveryMode:'data-missing',unmetRequirements:['暂缺结算价']}]
    ]) {
      await page.evaluate(([spec, extra]) => reader.set(spec, extra), [spec,extra])
      await expect.poll(() => card.locator('[data-workbench-reading]').count()).toBe(0)
      expect(await card.locator('[data-research-container-markdown]').count()).toBe(1)
    }
    expect(await card.getByText('查看缺数说明').count()).toBe(1)
    await page.evaluate(spec => reader.set(spec,{kind:'pasted-text'}), framework)
    await expect.poll(() => card.innerText()).toContain('风控纪律')
    expect(await tabs.count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 22000)

it('uses authored bold headings under a document title, retains footnotes and source headers, and updates the active section on refresh', async () => {
  const long = '同一份原始材料中的口径、日期和解释。'.repeat(6)
  const spec = markdown('研究记录', ['# 研究记录', '简要概述。', '**供需条件**', '供需依据。' + long,
    '**持仓变化**', '持仓依据及原注[^m]。' + long, '## 来源', '[原始材料](https://example.org/research)',
    '[^m]: 已核对的合约注释。'].join('\n\n'))
  const {page,panel,tabs,errors} = await open(spec)
  try {
    await tabs.first().waitFor()
    expect(await tabs.allTextContents()).toEqual(['概览','供需条件','持仓变化','来源与说明'])
    await tabs.nth(2).click()
    const updated = {...spec,content:spec.content.replace('持仓依据及原注','补充持仓依据及原注')}
    await page.evaluate(spec => reader.set(spec), updated)
    await expect.poll(() => panel.innerText()).toContain('补充持仓依据')
    expect(await tabs.nth(2).getAttribute('aria-selected')).toBe('true')
    await tabs.last().click()
    expect(await panel.getByRole('link', {name:'原始材料'}).getAttribute('href')).toBe('https://example.org/research')
    expect(await panel.innerText()).toContain('已核对的合约注释')
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 22000)
