import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('clicks the editable line below a long presentation chip that covers the textarea midpoint and preserves its native marker', async () => {
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
        <div data-input-scroll style="min-height:78px;width:316px"><div class="uV2eYG_grow" style="position:relative;height:39px">
          <textarea data-odyssey-file-reference-session="example" style="position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;padding:15px 17px 0;line-height:24px"></textarea>
        </div></div><button class="uV2eYG_primary">发送</button>
        </div></div></body>`})
    })
    await page.goto('http://localhost/')
    await page.addStyleTag({content:await readFile('src/preload/presentation/view.css','utf8')})
    await page.addScriptTag({content:script.outputFiles[0].text})
    const result=await page.evaluate(async()=>{
      let textarea=document.querySelector('textarea'), button=document.querySelector('button')
      const submitted=[]
      // The guide switches to its recorded agent before the native directory enables input.
      textarea.disabled=true
      let readyWaits=0, remounted=false, publishNotesReference
      button.addEventListener('click', onSend)
      function onSend(){submitted.push(textarea.value);textarea.value='';document.querySelectorAll('[data-reference-source]').forEach(el=>el.remove())}
      const guide=await guideFixture.mountPresentationEditGuideChat(document,{
        sessionId:'example',runId:'run',cwd:'/tmp/example',fresh:true,signal:new AbortController().signal,
        wait:async()=>{
          if(textarea.disabled && ++readyWaits===3)textarea.disabled=false
          if(publishNotesReference){publishNotesReference();publishNotesReference=undefined}
        },waitUntilPlaying:async()=>{},
        point:async action=>{
          if(!remounted && action.target===button){
            const replacement=button.cloneNode(true)
            button.replaceWith(replacement);button=replacement;button.addEventListener('click',onSend)
            const next=textarea.cloneNode(true);next.value=textarea.value;textarea.replaceWith(next);textarea=next
            remounted=true
          }
          const p=action.targetPoint()
          if(!(action.target.isConnected?action.target:button).contains(document.elementFromPoint(p.x,p.y)))throw Error('pointer missed the native control')
          const chip=textarea.parentElement.querySelector('[data-reference-source]')
          if(action.target===textarea && chip){
            const rect=chip.getBoundingClientRect()
            if(p.y <= rect.bottom || p.x > rect.left+24)throw Error('cursor did not land at the beginning of the editable line below the chip')
          }
          action.onClick()
        }
      })
      let covered=false
      for(const [label,prompt] of [['','撰写讲稿'],['标注 1','调整图表\n表格文字上下居中'],['AI 投资回报的 NPV 敏感性','把标题改为结论'],['这里请大家记住一个门槛','优化选中讲稿']]){
        if(label){
          const chip=document.createElement('span')
          chip.dataset.referenceSource='presentation-reference';chip.textContent=label
          chip.style.cssText='position:absolute;top:15px;left:17px;height:36px;width:'+(label.length>7?'218':'75')+'px;background:#333'
          textarea.parentElement.append(chip);textarea.value='\uE001 '
          const b=textarea.getBoundingClientRect()
          if(label.length>7)covered=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===chip
        }
        if(label==='标注 1') {
          const chip=document.createElement('span')
          chip.dataset.referenceSource='presentation-reference';chip.textContent='标注 2';textarea.parentElement.append(chip)
          textarea.value += '调整图表\uE002 表格文字上下居中'
        }
        if(label==='AI 投资回报的 NPV 敏感性'){
          const chip=textarea.parentElement.querySelector('[data-reference-source]')
          textarea.value='';chip.dataset.provisional='true'
          textarea.addEventListener('focusin',()=>{
            chip.replaceWith(chip.cloneNode(true))
            textarea.addEventListener('focusin',()=>{
              delete textarea.parentElement.querySelector('[data-reference-source]').dataset.provisional
              textarea.value='\uE001 '
            },{once:true})
          },{once:true})
        }
        const selectedNotes=label==='这里请大家记住一个门槛'
        if(selectedNotes){
          const chip=textarea.parentElement.querySelector('[data-reference-source]')
          chip.textContent='AI 投资回报的 NPV 敏感性'
          publishNotesReference=()=>{chip.textContent=label}
        }
        await guide.draft(prompt,{existing:label==='标注 1',referenceText:selectedNotes?label+'。':undefined})
        await guide.send();await guide.reply('已完成。')
      }
      guide.dispose();return {submitted,covered,readyWaits,remounted}
    })
    expect(result.readyWaits).toBe(3)
    expect(result.remounted).toBe(true)
    expect(result.covered).toBe(true)
    expect(result.submitted).toEqual(['撰写讲稿','\uE001 调整图表\uE002 表格文字上下居中','\uE001 把标题改为结论','\uE001 优化选中讲稿'])
    expect(messages.at(-1)).toEqual(['优化选中讲稿','这里请大家记住一个门槛'])
  } finally {await browser.close()}
})
