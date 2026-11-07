import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {dependencies} from './engine.mjs'

export function selectRelevant(rows, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw Error('Invalid relevance threshold')
  return rows.filter(row => Number.isFinite(row.relevance) && row.relevance >= threshold && row.relevance <= 1)
    .sort((a,b) => b.relevance - a.relevance)
}

export async function createReranker(runtime, modelDirectory) {
  const require=dependencies(runtime),ort=require('onnxruntime-node'),{Tokenizer}=require('@huggingface/tokenizers')
  const model=join(modelDirectory,'onnx/model_qint8_arm64.onnx')
  if(createHash('sha256').update(readFileSync(model)).digest('hex')!=='1825907d6c1a9001ff78124780bbde20a614a8c3df3b63409cf3c72c6fe5c8b4')throw Error('Reranker hash mismatch')
  const tokenizer=new Tokenizer(JSON.parse(readFileSync(join(modelDirectory,'tokenizer.json'))),JSON.parse(readFileSync(join(modelDirectory,'tokenizer_config.json'))))
  const session=await ort.InferenceSession.create(model,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential'})
  const encode=(query,document)=>tokenizer.encode(query,{text_pair:document,return_token_type_ids:true})
  async function score(query,document){
    const encoded=encode(query,document)
    // Overlong pairs are omitted instead of scoring a possibly negation-truncated fact.
    if(encoded.ids.length>512)return {relevance:0,reason:'overlong'}
    const feeds={}
    for(const name of session.inputNames){const values=name==='input_ids'?encoded.ids:name==='attention_mask'?encoded.attention_mask:encoded.token_type_ids;feeds[name]=new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,encoded.ids.length])}
    const outputs=await session.run(feeds),logit=Number(outputs[session.outputNames[0]].data[0])
    return {logit,relevance:1/(1+Math.exp(-logit))}
  }
  return {score,encode,close:()=>session.release()}
}
