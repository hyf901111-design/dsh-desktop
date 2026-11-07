import {createEmbedding} from './embedding.js'
import {LocalSemanticIndex} from './index.js'
let embedding,index,queue=Promise.resolve()
process.on('message',message=>{
  queue=queue.then(async()=>{
    try{
      const command=message.command
      if(!embedding)embedding=await createEmbedding(process.env.EWORK_MEMORY_MODEL_DIRECTORY)
      if(!index)index=new LocalSemanticIndex()
      let value
      if(command.type==='index')value={cache:await index.index(command.rows,command.cache,embedding.embed,progress=>process.send?.({id:message.id,progress}))}
      else if(command.type==='search')value={candidates:index.search(command.query,await embedding.embed(command.query),command.projectId,command.now)}
      else throw Error('Unknown memory command')
      process.send?.({id:message.id,value})
    }catch{process.send?.({id:message.id,error:'Local memory unavailable'})}
  })
})
process.on('disconnect',()=>process.exit())
