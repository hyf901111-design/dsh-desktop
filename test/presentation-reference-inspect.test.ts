import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { installPresentation } from '../src/main/presentation/service'
import { blankDeck, PresentationStore } from '../src/main/presentation/store'

vi.mock('electron', () => ({ dialog: {} }))

it('inspects only admitted notes, elements and marked chart values from their real slides', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'odyssey-reference-inspect-'))
  const store = new PresentationStore(directory)
  try {
    const key = { owner: 'reviewer', sessionId: 'review' }
    const deck = blankDeck('美国财政部每日国债收益率')
    const first = deck.slides[0]!
    first.remark = '<p>2024-12-27｜4.62%。2024-12-30｜4.55%。</p>'
    const box = { left: 20, top: 20, width: 100, height: 40 }
    first.elements.push({ ...box, id: 'observed', type: 'text', content: '<p>10 年期国债收益率</p>' })
    const chart = { ...box, id: 'yield', type: 'chart', chartType: 'line',
      data: { labels: ['2024-12-27','2024-12-30','2024-12-31'], legends: ['10 年期'], series: [[4.62,4.55,4.58]] } }
    deck.slides.push({ id:'historical', remark:'<p>2024-12-31｜4.58%。</p>',elements:[chart],
      marks:[{id:'closing',ordinal:1,kind:'point',region:{x:1,y:1,width:1,height:1},nodeIds:['yield'],comment:'年末读数',
        chartPoints:[{elementId:'yield',seriesIndex:0,pointIndex:2,label:'2024-12-31'}]}] })
    store.save(key,0,deck,true)
    const handlers=new Map(),frame={processId:1,routingId:2}
    const window={isDestroyed:()=>false,webContents:{mainFrame:frame}}
    const host=installPresentation({store,canWrite:()=>true,getWindow:()=>window as any,
      ipcMain:{handle:(name:string,handler:any)=>handlers.set(name,handler)} as any,
      visible:()=>({mode:'presentation',sessionId:key.sessionId,ownerAccountId:key.owner,generation:'g'})})
    const prompt='只读选中范围'
    const makeRef=(kind:string,slideId:string,label:string,props:object)=>({documentId:deck.id,kind,slideId,label,...props})
    const refs=[makeRef('notes',first.id,'4.62%',{start:11,quote:'4.62%'}),makeRef('element',first.id,'10 年期国债收益率',{id:'observed'}),
      makeRef('mark','historical','标注 1',{id:'closing'})]
    const admit=(instruction:string,references:unknown[],useSlide:boolean)=>handlers.get('presentation:request')(
      {sender:window.webContents,senderFrame:frame},'admit',
      {sessionId:key.sessionId,documentId:deck.id,slideId:first.id,prompt:instruction,references,useSlide})
    await admit(prompt,refs,false)
    await admit('默认页',[],true)
    await admit('关闭当前页',[],false)
    store.setPosition(key,deck.id,'historical')
    expect(host.referenceSettings(key,prompt).referenceScope).toBe('selection')
    const inspect=(instruction:string,args:any)=>host.handlers(key,()=>true,instruction).inspectPresentation(args,{} as any)
    const result:any=await inspect(prompt,{scope:'reference'})
    expect(result.data.references).toMatchObject([{quote:'4.62%'},{element:{text:'10 年期国债收益率'}},
      {slideId:'historical',comment:'年末读数',targets:[{points:[{label:'2024-12-31',value:4.58}]}]}])
    expect(JSON.stringify(result.data)).not.toContain('4.55')
    expect(Object.keys(result.data).sort()).toEqual(['references','revision'])
    expect((await inspect('默认页',{}) as any).data.currentSlide.id).toBe(first.id)
    expect((await inspect('关闭当前页',{}) as any).data.currentSlide).toBeUndefined()
    await expect(inspect('关闭当前页',{scope:'reference'})).rejects.toThrow('已受理')
  } finally {
    store.close()
    rmSync(directory,{force:true,recursive:true})
  }
})
