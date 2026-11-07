import {readFile} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {Tokenizer} from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-node'
import {MODEL_FILES} from './manifest.js'

export async function createEmbedding(directory){
  for(const file of MODEL_FILES){const hash=createHash('sha256');for await(const block of createReadStream(join(directory,file.path)))hash.update(block);if(hash.digest('hex')!==file.sha256)throw Error('Memory model integrity check failed')}
  const tokenizer=new Tokenizer(JSON.parse(await readFile(join(directory,'tokenizer.json'),'utf8')),JSON.parse(await readFile(join(directory,'tokenizer_config.json'),'utf8')))
  const session=await ort.InferenceSession.create(join(directory,MODEL_FILES[0].path),{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'all'})
  async function embed(text,mode='query'){
    let ids=tokenizer.encode(`${mode}: ${text}`).ids
    if(ids.length>512)ids=[...ids.slice(0,511),ids.at(-1)]
    const feeds={}
    for(const name of session.inputNames){const values=name==='input_ids'?ids:name==='attention_mask'?ids.map(()=>1):ids.map(()=>0);feeds[name]=new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,ids.length])}
    const output=await session.run(feeds),hidden=output.last_hidden_state??output[session.outputNames[0]],vector=new Float32Array(384)
    if(hidden.dims[0]!==1||hidden.dims[1]!==ids.length||hidden.dims[2]!==384)throw Error('Unexpected embedding shape')
    for(let i=0;i<ids.length;i++)for(let d=0;d<384;d++)vector[d]+=hidden.data[i*384+d]/ids.length
    const norm=Math.hypot(...vector);if(!Number.isFinite(norm)||norm===0)throw Error('Invalid embedding')
    for(let d=0;d<384;d++)vector[d]/=norm
    return vector
  }
  return {embed,close:()=>session.release()}
}
