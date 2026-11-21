import {readFileSync} from 'node:fs'
import {describe, it, expect} from 'vitest'
import {registerFirstResponseEffort} from '../packages/dsh-research-task-runtime/first-response-effort.js'
import {patchFirstResponseEffort} from '../scripts/lib/first-response-effort.mjs'

const treasury = '把美国财政部三日10年期国债收益率写入工作表 A1:B4，2024-12-27 4.62%、2024-12-30 4.55%、2024-12-31 4.58%。'
function turn(text, mode = 'spreadsheet') {
  return {events:[{type:'user/message',data:{source:{kind:'user',clientMode:mode},content:[{type:'text',text}]}}]}
}

describe('first model response', () => {
  it('uses only an advertised default for the first step of a direct spreadsheet edit', async () => {
    let handler, lookup = 0
    registerFirstResponseEffort({
      on: (_event,callback) => { handler = callback },
      llm: {resolveModelInfo: async () => {lookup++;return {reasoning:{defaultEffort:'max',efforts:[{id:'low'},{id:'max'}]}}}}
    })
    const suggestions=[]
    const apply = (session,step,config) => handler({agent:{session},step,suggestFirstResponseEffort:value=>suggestions.push(value)},async()=>config)
    const base={provider:'ework-ark',model:'deepseek-v4.1-flash'}
    const session=turn(treasury)
    expect(await apply(session,1,base)).toBe(base)
    expect(suggestions).toEqual(['low'])
    await apply(session,2,base)
    await apply(session,1,{...base,reasoningEffort:'max'})
    await apply(turn(treasury+'需要严谨推导。'),1,base)
    expect(lookup).toBe(1)
  })
  it('expires a suggested budget in the installed agent loop before the next request', () => {
    const sdk=readFileSync('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js','utf8')
    const installed=patchFirstResponseEffort(sdk)
    expect(patchFirstResponseEffort(installed)).toEqual(installed)
    const proposal=Function('return ('+installed.match(/function requestProposal\(header\) \{[\s\S]*?\n\}/)[0]+')')()
    const config={provider:'ework-ark',model:'deepseek-v4.1-flash',reasoningEffort:'low',maxTokens:8192}
    expect(proposal({config,adapterDefaults:{reasoningEffort:true}})).toEqual({provider:config.provider,model:config.model,maxTokens:8192})
    expect(proposal({config,adapterDefaults:{}})).toEqual(config)
  })
})
