import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('renders the shared welcome and fills the matching draft, and restores sheet scope after references clear', async () => {
  const client = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const start = client.indexOf('const eworkModeWelcome=')
  const end = client.indexOf('function HomeGuideNativeOriginalConversationRoot(', start)
  const effectEnd = client.indexOf("'Workspace mode composer shortcuts');")
  const effectStart = client.lastIndexOf('ctx.effect(()=>{', effectEnd)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  expect(effectStart).toBeGreaterThan(0)
  expect(effectEnd).toBeGreaterThan(effectStart)
  const output = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import * as react from 'react';
      import {createRoot} from 'react-dom/client';
      ${client.slice(start, end)}
      const draft={draft:'已有草稿',draftRev:1,phase:'plain'}, notes={...draft};
      const makeShell=data=>({snapshot:data,insertText(text,span){
        if(span.start!==data.draft.length||span.end!==span.start||span.draftRev!==data.draftRev)throw Error('Unexpected draft offset');
        data.draft+=text;data.draftRev++;document.querySelector('textarea').value=data.draft;return true;
      }});
      const shell=makeShell(draft),noteShell=makeShell(notes),sessionId='sample';
      const sessions={list:{getSnapshot:()=>({current:sessionId})}},inputHub={shell:()=>shell};
      const eworkActiveInput=(_id,ordinary)=>document.body.dataset.workspaceSurface==='notes'?noteShell:ordinary;
      const ctx={effect:fn=>fn()};
      ${client.slice(effectStart, effectEnd)}'Workspace mode composer shortcuts');
      const root=createRoot(document.querySelector('#mount')),h=react.createElement;
      window.renderMode=(mode,selection)=>{
        if(mode==='notes')document.body.dataset.workspaceSurface='notes';else delete document.body.dataset.workspaceSurface;
        if(mode==='spreadsheet')document.body.dataset.eworkSpreadsheetSession=sessionId;else delete document.body.dataset.eworkSpreadsheetSession;
        document.querySelector('textarea').value=(mode==='notes'?notes:draft).draft;
        root.render(h(react.Fragment,null,
          h(EWorkModeWelcome,{sessionId,mode}),
          mode==='spreadsheet'&&h('div',{'data-composer-card':''},
            h(EWorkSpreadsheetContextBadge,{keyboard:shell,input:{occurrences:selection==='inline'?[{source:'spreadsheet-range'}]:[]}}),
            selection==='pending'&&h('span',{className:'ew-sheet-pending-reference'},'Sheet1!A1:B2'))));
      };
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser'
  })
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href) : await import('playwright')
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 740 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<main id="mount" class="sRp_messages"></main><div data-research-composer-host><textarea data-odyssey-file-reference-session="sample"></textarea></div>')
    await page.addStyleTag({ content: await readFile('src/preload/spreadsheet/view.css', 'utf8') })
    await page.addScriptTag({ content: output.outputFiles[0].text })

    const examples = {
      notes: ['整理会议纪要', '把资料整理成阅读笔记', '润色当前笔记'],
      research: ['搭建行业研究看板', '跟踪公司关键指标', '梳理投资逻辑与风险'],
      spreadsheet: ['制作消费行业可比估值表', '整理上传的数据并去重', '创建现金流预测模型']
    }
    for (const [mode, labels] of Object.entries(examples)) {
      await page.evaluate(mode => window.renderMode(mode), mode)
      const welcome = page.locator(`[data-mode-welcome="${mode}"]`)
      await welcome.waitFor()
      expect(await welcome.getByRole('button').allTextContents()).toEqual(labels)
      await welcome.getByRole('button', { name: labels[0], exact: true }).click()
      const input = page.getByRole('textbox')
      await expect.poll(() => input.evaluate(node => node === document.activeElement)).toBe(true)
      expect(await input.inputValue()).toContain('已有草稿\n请')
    }
    const badge = page.locator('[data-sheet-context-badge]')
    expect(await badge.textContent()).toBe('参考当前表格内容')
    await badge.click()
    await page.getByRole('button', { name: '不参考当前表格内容', exact: true }).click()
    expect(await badge.textContent()).toBe('不参考当前表格内容')
    await page.evaluate(() => window.renderMode('spreadsheet', 'pending'))
    await badge.waitFor({ state: 'hidden' })
    await page.evaluate(() => window.renderMode('spreadsheet', 'inline'))
    await expect.poll(() => badge.count()).toBe(0)
    await page.evaluate(() => window.renderMode('spreadsheet'))
    await badge.waitFor()
    expect(await badge.textContent()).toBe('不参考当前表格内容')
    await badge.click()
    await page.getByRole('button', { name: '参考当前表格内容', exact: true }).click()
    expect(await badge.textContent()).toBe('参考当前表格内容')
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
}, 20000)
