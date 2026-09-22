import {expect,it} from 'vitest'
import {startIntegrationBridge} from '../src/main/integrations/runtime-bridge'
it('requires the startup token and fixed routes before reaching the service',async()=>{
  let calls=0
  const bridge=await startIntegrationBridge({runtimeSnapshot:()=>({revision:1}),execute:async(call)=>{calls++;return {callId:call.callId,content:[{type:'text' as const,text:'real-result'}]}},readSkill:async()=>({content:'skill'})})
  try {
    expect((await fetch(`${bridge.url}/snapshot`)).status).toBe(401)
    const headers={authorization:`Bearer ${bridge.token}`,'content-type':'application/json'}
    expect(await (await fetch(`${bridge.url}/snapshot`,{headers})).json()).toEqual({revision:1})
    expect((await fetch(`${bridge.url}/arbitrary`,{headers})).status).toBe(404)
    const result=await (await fetch(`${bridge.url}/execute`,{method:'POST',headers,body:JSON.stringify({callId:'one'})})).json()
    expect(result).toMatchObject({callId:'one',content:[{text:'real-result'}]});expect(calls).toBe(1)
  }finally{await bridge.dispose()}
})
