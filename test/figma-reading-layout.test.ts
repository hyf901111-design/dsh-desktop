import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { patchFigmaReadingConversation, patchFigmaReadingTables } from '../scripts/lib/figma-reading-client.mjs'
const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
function fn(name: string) {
  const a=source.indexOf(`function ${name}(`), b=source.indexOf('\n\t\t}',a)
  return source.slice(a,b+5)
}
describe('Figma long-content reading contract',()=>{
  it('keeps the reader in history for remote changes and follows only the tail or an explicit submission',()=>{
    const follow=runInNewContext(fn('shouldFollowConversationBottom')+'\nshouldFollowConversationBottom')
    for(const key of ['runningStarted','appendedSteering','tipMoved']) {
      expect(follow({[key]:true,atBottom:false})).toBe(false)
      expect(follow({[key]:true,atBottom:true})).toBe(true)
    }
    expect(follow({appendedUser:true,atBottom:false})).toBe(true)
  })
  it('uses the inner Research message viewport for follow and the central sibling viewport on send',()=>{
    const scroller=runInNewContext(fn('scrollerOf')+'\nscrollerOf')
    const messages={}, outer={}
    expect(scroller({closest:(selector:string)=>selector.includes('.sRp_messages')?messages:outer})).toBe(messages)
    const targets=runInNewContext(fn('composerScrollTargets')+'\ncomposerScrollTargets')
    const port={querySelector:()=>null},pane={querySelector:()=>port}
    expect(targets({closest:(selector:string)=>selector.includes('.wSkVaW_root')?pane:null})).toEqual([port])
  })
  it('installs once in both real bundles and fails visibly on missing renderer anchors',async()=>{
    expect(patchFigmaReadingConversation(source)).toBe(source)
    const primitive=await readFile('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8')
    expect(patchFigmaReadingTables(primitive)).toBe(primitive)
    expect(()=>patchFigmaReadingConversation('')).toThrow('anchor')
    expect(()=>patchFigmaReadingTables('')).toThrow('renderer')
  })
})
