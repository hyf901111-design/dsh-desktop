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
    expect(notify).toHaveBeenCalledWith({sessionId:'s1',seq:3,title:'Example',preview:''})
    expect((await post({sessionId:'s1',seq:4,title:'Example',preview:'回答摘要'})).status).toBe(200)
    expect(notify).toHaveBeenLastCalledWith({sessionId:'s1',seq:4,title:'Example',preview:'回答摘要'})
    expect((await post({sessionId:'s1',seq:5,title:'Example',preview:'x'.repeat(243)})).status).toBe(400)
  } finally { await bridge.stop() }
})
