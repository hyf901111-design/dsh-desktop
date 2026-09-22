import { it, expect, vi } from 'vitest'
import { ResearchContextBridge } from '../src/main/state/research-context-bridge'
it('accepts only authenticated, validated completion notices', async () => {
  const notify=vi.fn()
  const bridge=new ResearchContextBridge({sessionCompleted:notify,readCanvas:()=>({files:[],artifacts:[]}),resolveFile:async()=>null})
  const endpoint=await bridge.start()
  const post=(body:unknown,token=endpoint.token)=>fetch(endpoint.url+'/session-completed',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})
  try {
    expect((await post({sessionId:'s1',seq:3,title:'Example'},'wrong')).status).toBe(403)
    expect((await post({sessionId:'s1',seq:-1,title:'Example'})).status).toBe(400)
    expect(notify).not.toHaveBeenCalled()
    expect((await post({sessionId:'s1',seq:3,title:'Example'})).status).toBe(200)
    expect(notify).toHaveBeenCalledWith({sessionId:'s1',seq:3,title:'Example'})
  } finally { await bridge.stop() }
})
