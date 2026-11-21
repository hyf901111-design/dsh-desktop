import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {pathToFileURL} from 'node:url'
import vm from 'node:vm'
import {it,expect} from 'vitest'
import {compactHostDashboardHtml,buildResearchHtmlPreview,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {storedViewFlowFields} from '../packages/dsh-research-task-runtime/stored-view-flow-signs.js'
import {patchLegacyDashboardPreview} from '../scripts/lib/patch-research-board-client.mjs'

const original = gunzipSync(readFileSync(new URL('./fixtures/stored-view-flow-comparison.html.gz',import.meta.url))).toString()
const jsonSources = html => [...html.matchAll(/<script id="(?:dataset-view-source|sherlock-template-data)" type="application\/json">([^<]*)<\/script>/g)].map(match => match[1])
const readData = () => JSON.parse(jsonSources(original)[0])
const expectedIds = ['row-1','row-4']

it('upgrades the signed presentation of the saved BlackRock exception rows in both client code paths', () => {
  const html = compactHostDashboardHtml(original)
  for (const amount of ['+24367','-8473','+32840','+9374','-55125','+64499']) expect(html).toContain('>'+amount+' 百万美元</td>')
  expect(jsonSources(html)).toEqual(jsonSources(original))
  expect(researchInteractionVersion(html)).toBe(researchInteractionVersion(original))
  expect(compactHostDashboardHtml(html)).toBe(html)
  const bundle = patchLegacyDashboardPreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  const start = bundle.indexOf('const MARKET_PRESENTATION_CSS = '), end = bundle.indexOf('const TERMINAL_PRESENTATION_CSS = ',start)
  const serialized = vm.runInNewContext(bundle.slice(start,end)+'\nrefineStoredTemplateHtml')
  expect(serialized(original)).toBe(html)
})

it('preserves current, custom and inconsistent templates byte for byte', () => {
  const current = original.replace('<body data-research-kind="view">','<body data-research-kind="view" data-view-signed-fields="v1">')
  const alteredProgram = original.replace('cell.textContent=valueText(value,field,section.title)','cell.textContent=valueText(value,field,section.title)+"!"')
  const wrongSource = original.replace('"column4":24367','"column4":24000')
  const wrongScope = original.replaceAll('"op":"lt"','"op":"gte"')
  for (const html of [current,alteredProgram,wrongSource,wrongScope,original.replace('"templateId":"view"','"templateId":"custom"'),
                      original.replace('id="sherlock-template-data"','id="user-template-data"'),original+'<script>const custom=true</script>']) {
    expect(compactHostDashboardHtml(html)).toBe(html)
  }
})

it('requires comparable annual flows and a separately proven difference; excludes balances, unrelated metrics and percentages', () => {
  const {dataset,view} = readData()
  const keys = ['column5','column4','净流入同比变化']
  view.sections[0].fields.push('column2','column3')
  expect(storedViewFlowFields(dataset,view)).toEqual(keys)
  dataset.records[0]['净流入同比变化']++
  expect(storedViewFlowFields(dataset,view)).toEqual(keys.slice(0,2))
  dataset.fields.find(f=>f.key==='column4').unit='%'
  expect(storedViewFlowFields(dataset,view)).toEqual([])
  dataset.fields.find(f=>f.key==='column5').unit='%'
  expect(storedViewFlowFields(dataset,view)).toEqual([])
})

it('retains the host formatter for zero, null and balances while applying signs to positive flows only', () => {
  const edited = original.replaceAll('"column4":24367','"column4":0').replaceAll('"column4":9374','"column4":null')
    .replace('>24367 百万美元</td>','>0 百万美元</td>').replace('>9374 百万美元</td>','>未提供</td>')
  const html = compactHostDashboardHtml(edited)
  expect(html).toContain('data-view-signed-fields="v1"')
  expect(html).toContain('>0 百万美元</td>')
  expect(html).toContain('>未提供</td>')
  expect(html).not.toContain('>+32840 百万美元</td>')
  expect(jsonSources(html)).toEqual(jsonSources(edited))
})

it('keeps leading signs through real filtering, sorting and saved-state remount in the hosted preview', async () => {
  const pw = await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  const browser = await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
  try {
    const page = await browser.newPage()
    const open = async saved => {
      const preview = buildResearchHtmlPreview(original,'原存量例外卡','dark',{workbench:true,notoFont:'runtime'})
      await page.setContent('<iframe id="preview" style="width:100%;height:700px;border:0" sandbox="allow-scripts" srcdoc="'+preview.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>')
      const frame = page.frameLocator('#preview').frameLocator('iframe')
      await frame.locator('.dv-shell').waitFor()
      await page.evaluate(saved=>{
        window.lastViewCommit = null
        addEventListener('message',e=>{if(e.data?.type==='sherlock-component-send' && e.data.message?.op==='localCommit') window.lastViewCommit=e.data.message})
        document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-component-context',shared:false,online:true,readOnly:false,userId:'local',saved},'*')
      },saved)
      await expect.poll(()=>frame.locator('html').evaluate(()=>window.sherlockShared.inspect()?.connected)).toBe(true)
      return frame
    }
    const rows = frame => frame.locator('.dv-records tbody tr:not([hidden])').evaluateAll(list=>list.map(row=>row.dataset.recordId))
    let frame = await open(null)
    expect(await rows(frame)).toEqual(expectedIds)
    expect(await frame.locator('.dv-records tbody').textContent()).toContain('+24367 百万美元')
    await frame.locator('[data-view-sort="column4"]').click()
    expect(await rows(frame)).toEqual([...expectedIds].reverse())
    await frame.locator('[data-view-search]').fill('机构指数')
    await expect.poll(()=>rows(frame)).toEqual(['row-4'])
    await expect.poll(()=>page.evaluate(()=>window.lastViewCommit?.state?.query)).toBe('机构指数')
    const saved = await page.evaluate(()=>window.lastViewCommit)
    frame = await open(saved)
    expect(await rows(frame)).toEqual(['row-4'])
    expect(await frame.locator('.dv-records tbody').innerText()).toContain('+64499 百万美元')
    expect(await frame.locator('aside[data-component-source-info] a').getAttribute('href')).toBe(readData().dataset.sourceUrl)
    await frame.locator('[data-view-search]').fill('')
    await expect.poll(()=>rows(frame)).toEqual(expectedIds)
    await frame.locator('[data-view-sort="column4"]').click()
    expect(await rows(frame)).toEqual([...expectedIds].reverse())
  } finally {await browser.close()}
},20000)
