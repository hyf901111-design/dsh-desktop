import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('types beside a long presentation chip that covers the textarea midpoint and preserves its native marker', async () => {
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
    : await import('playwright')
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage()
    const script = await build({entryPoints:['src/preload/presentation/edit-guide-chat.ts'],bundle:true,
      write:false,format:'iife',globalName:'guideFixture'})
    const messages=[]
    await page.route('http://localhost/**', route => {
      if (route.request().method() === 'POST') {
        const body=route.request().postDataJSON()
        if(body.action==='arm')messages.push([body.prompt,body.referenceLabel])
        return route.fulfill({json:{ok:true}})
      }
      return route.fulfill({contentType:'text/html',body:`<body data-ework-presentation-session="example">
        <div data-research-composer-host><div class="uV2eYG_root" style="position:relative">
        <textarea data-odyssey-file-reference-session="example" style="width:310px;height:38px"></textarea><button class="uV2eYG_primary">发送</button>
        </div></div></body>`})
    })
    await page.goto('http://localhost/')
    await page.addScriptTag({content:script.outputFiles[0].text})
    const result=await page.evaluate(async()=>{
      const textarea=document.querySelector('textarea'), button=document.querySelector('button'), submitted=[]
      button.onclick=()=>{submitted.push(textarea.value);textarea.value='';document.querySelector('[data-reference-source]')?.remove()}
      const guide=await guideFixture.mountPresentationEditGuideChat(document,{
        sessionId:'example',runId:'run',cwd:'/tmp/example',fresh:true,signal:new AbortController().signal,
        wait:async()=>{},waitUntilPlaying:async()=>{},
        point:async action=>{
          const p=action.targetPoint()
          if(!action.target.contains(document.elementFromPoint(p.x,p.y)))throw Error('pointer missed the native control')
          action.onClick()
        }
      })
      let covered=false
      for(const [label,prompt] of [['','撰写讲稿'],['标注 1','调整图表'],['AI 投资回报的 NPV 敏感性','把标题改为结论']]){
        if(label){
          const chip=document.createElement('span')
          chip.dataset.referenceSource='presentation-reference';chip.textContent=label
          chip.style.cssText='position:absolute;top:1px;left:1px;height:30px;width:'+(label.length>7?'218':'75')+'px;background:#333'
          textarea.parentElement.append(chip);textarea.value='\uE001 '
          const b=textarea.getBoundingClientRect()
          if(label.length>7)covered=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===chip
        }
        await guide.draft(prompt);await guide.send();await guide.reply('已完成。')
      }
      guide.dispose();return {submitted,covered}
    })
    expect(result.covered).toBe(true)
    expect(result.submitted).toEqual(['撰写讲稿','\uE001 调整图表','\uE001 把标题改为结论'])
    expect(messages.at(-1)).toEqual(['把标题改为结论','AI 投资回报的 NPV 敏感性'])
  } finally {await browser.close()}
})
