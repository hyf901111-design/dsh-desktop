import {describe, expect, it} from 'vitest'
import {componentCreationRequest} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import {planningPrototypeEvidence, workbenchSourceText} from '../packages/dsh-research-task-runtime/workbench-prototype-evidence.js'

const message = (id,text,mode='research') => ({
  type:'user/message',data:{id,role:'user',source:{kind:'user',clientMode:mode},content:[{type:'text',text}]}
})
const original = message('plan','📎 文件：`/report.md` 根据这个文档，做一个工作台看板')
const retry = message('retry','继续')
function session({prior=original, current=retry, reason='max-tokens', operations=[], intervening=[]}={}) {
  return {header:{},events:[
    {type:'turn/start',data:{turn:1}},prior,...operations,{type:'turn/end',data:{turn:1,reason:{kind:reason}}},
    ...intervening,{type:'turn/start',data:{turn:2}},current
  ]}
}

describe('手动续作上次截断的看板',()=>{
  it('opens a new turn with the same board request and exact original attachment',()=>{
    const state=session({operations:[{type:'tool/call',data:{name:'read',callId:'read-file'}}]})
    const human=componentCreationRequest(state)
    expect(human).toMatchObject({messageId:'retry',resumedFromMessageId:'plan',target:'workbench'})
    expect(planningPrototypeEvidence(state,human,{messages:[retry.data]}).files).toEqual(['/report.md'])
    expect(planningPrototypeEvidence(state,human,{messages:[original.data]}).files).toEqual([])
    expect(workbenchSourceText(state,human)).toBe(original.data.content[0].text)
  })

  it.each([
    ['a completed turn',{reason:'completed'}],
    ['a canceled turn',{reason:'aborted'}],
    ['an unrelated completed turn',{intervening:[
      {type:'turn/start',data:{turn:9}},message('different','今天星期几'),
      {type:'turn/end',data:{turn:9,reason:{kind:'completed'}}}
    ]}],
    ['an acknowledged or unconfirmed creation',{operations:[{type:'tool/call',data:{name:'research_workbench_create'}}]}],
    ['a different side effect',{operations:[{type:'tool/call',data:{name:'write'}}]}],
    ['a rejected read',{operations:[{type:'tool/result',data:{error:{code:'PERMISSION_DENIED'}}}]}],
    ['a normal explanation',{prior:message('plan','解释利率变化')}],
    ['a different current workspace',{current:message('retry','继续','conversation')}],
    ['an attachment alongside continue',{current:{...retry,data:{...retry.data,content:[...retry.data.content,{type:'image'}]}}}],
    ['a new unprocessed human instruction',{intervening:[message('other','停止看板任务')]}],
  ])('does not restart %s',(_label,options)=>{
    expect(componentCreationRequest(session(options))?.resumedFromMessageId).toBeUndefined()
  })
})
