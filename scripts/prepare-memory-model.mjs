import {mkdir,readFile,writeFile,copyFile,rename,rm} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {MODEL_FILES,MODEL_REPOSITORY,MODEL_REVISION,MODEL_ID} from '../packages/dsh-memory-runtime/local/manifest.js'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),destination=join(root,'build/memory-model')
async function verified(path,expected){try{const hash=createHash('sha256');for await(const b of createReadStream(path))hash.update(b);return hash.digest('hex')===expected}catch{return false}}
for(const file of MODEL_FILES){
  const target=join(destination,file.path)
  if(await verified(target,file.sha256))continue
  await mkdir(dirname(target),{recursive:true})
  const partial=target+'.partial'
  try{
    const source=process.env.EWORK_MEMORY_MODEL_SOURCE&&join(process.env.EWORK_MEMORY_MODEL_SOURCE,file.path)
    if(source&&await verified(source,file.sha256))await copyFile(source,partial)
    else{
      const response=await fetch(`https://huggingface.co/${MODEL_REPOSITORY}/resolve/${MODEL_REVISION}/${file.path}?download=true`,{signal:AbortSignal.timeout(300000)})
      if(!response.ok||!response.body)throw Error(`Memory model download failed: ${response.status}`)
      const {Readable}=await import('node:stream'),{pipeline}=await import('node:stream/promises'),{createWriteStream}=await import('node:fs')
      await pipeline(Readable.fromWeb(response.body),createWriteStream(partial))
    }
    if(!await verified(partial,file.sha256))throw Error('Memory model integrity check failed')
    await rename(partial,target)
  }finally{await rm(partial,{force:true})}
}
await writeFile(join(destination,'manifest.json'),JSON.stringify({id:MODEL_ID,repository:MODEL_REPOSITORY,revision:MODEL_REVISION,license:'MIT',files:MODEL_FILES},null,2)+'\n')
await writeFile(join(destination,'NOTICE.txt'),`Local memory embedding: ${MODEL_REPOSITORY}\nRevision: ${MODEL_REVISION}\nModel authors: Liang Wang et al. (Microsoft)\nModel license: MIT (as declared by the model repository)\nSource and model card: https://huggingface.co/${MODEL_REPOSITORY}\n`)
console.log('Local memory model prepared and verified: '+destination)
