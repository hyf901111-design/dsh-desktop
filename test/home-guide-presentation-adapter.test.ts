import {Window} from 'happy-dom'
import {expect,it} from 'vitest'
import {mountHomePresentationGuide} from '../src/preload/home-guide-presentation'

it('correlates native replies, preserves the host and enforces one ordered guide without creating UI facsimiles',async()=>{
 const win=new Window(),doc=win.document,scope=new AbortController(),commands:string[]=[]
 doc.body.innerHTML='<textarea>保留草稿</textarea><div id="host"></div>'
 const host=doc.getElementById('host')!,input=doc.querySelector('textarea')
 win.addEventListener('sherlock:home-guide-presentation-request',((event:any)=>{
  const detail=event.detail;commands.push(detail.command)
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-presentation-reply',{detail:{...detail,runId:'wrong',ok:true}}))
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-presentation-reply',{detail:{...detail,ok:true}}))
 }) as any)
 try{
  const guide=await mountHomePresentationGuide(doc as any,host as any,{signal:scope.signal,sessionId:'owner',runId:'run'})
  await expect(guide.runStep('layout')).rejects.toThrow(/顺序/)
  for(const step of ['brief','plan','layout','deliver','open'] as const)await guide.runStep(step)
  expect(commands).toEqual(['mount','brief','plan','layout','deliver','open'])
  expect(host.childElementCount).toBe(0);expect(doc.querySelector('textarea')).toBe(input)
  guide.dispose();guide.dispose();expect(commands.at(-1)).toBe('dispose');expect(commands.filter(c=>c==='dispose')).toHaveLength(1)
  await expect(guide.runStep('open')).rejects.toThrow()
 }finally{await win.happyDOM.close()}
})
it('cancels a pending mount immediately and removes its temporary host identity',async()=>{
 const win=new Window(),doc=win.document,scope=new AbortController(),commands:string[]=[]
 const host=doc.createElement('div');doc.body.append(host)
 win.addEventListener('sherlock:home-guide-presentation-request',((event:any)=>commands.push(event.detail.command)) as any)
 const pending=mountHomePresentationGuide(doc as any,host as any,{signal:scope.signal,sessionId:'owner',runId:'run'})
 scope.abort()
 await expect(pending).rejects.toThrow(/演示已结束/)
 expect(commands).toEqual(['mount','dispose']);expect(host.id).toBe('')
 await win.happyDOM.close()
})
