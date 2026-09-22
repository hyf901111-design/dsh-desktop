import {expect,it} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {IntegrationStore} from '../src/main/integrations/store'
import {OperationManager} from '../src/main/integrations/operations'
it('deduplicates repeated request IDs before starting external work and persists the result',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-operation-'))
  try {
    const store=await IntegrationStore.open(root), manager=new OperationManager(store)
    let calls=0
    const work=async()=>{calls++}
    const [first,second]=await Promise.all([manager.start('install','one','request-123',work),manager.start('install','one','request-123',work)])
    expect(first.operationId).toBe(second.operationId)
    await manager.wait(first.operationId)
    expect(calls).toBe(1)
    expect((await IntegrationStore.open(root)).snapshot().operations[first.operationId]?.phase).toBe('succeeded')
  } finally {await rm(root,{recursive:true,force:true})}
})
