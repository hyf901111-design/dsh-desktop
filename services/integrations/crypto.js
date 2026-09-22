import {randomBytes} from 'node:crypto'

async function encryptionKey(env){
  if(typeof env.INTEGRATION_TOKEN_KEY!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(env.INTEGRATION_TOKEN_KEY))throw Error('BROKER_NOT_CONFIGURED')
  const bytes=Buffer.from(env.INTEGRATION_TOKEN_KEY,'base64')
  if(bytes.length!==32)throw Error('BROKER_NOT_CONFIGURED')
  return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt'])
}
const additionalData=(userId,connectionId)=>new TextEncoder().encode(JSON.stringify(['ework-notion-token-v1',userId,connectionId]))
export async function sealTokens(env,userId,connectionId,tokens){
  const iv=randomBytes(12),key=await encryptionKey(env)
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:additionalData(userId,connectionId)},key,new TextEncoder().encode(JSON.stringify(tokens)))
  return JSON.stringify({v:1,iv:iv.toString('base64'),data:Buffer.from(ciphertext).toString('base64')})
}
export async function openTokens(env,userId,connectionId,value){
  const envelope=JSON.parse(value)
  if(envelope.v!==1||typeof envelope.iv!=='string'||typeof envelope.data!=='string')throw Error('AUTH_REQUIRED')
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:additionalData(userId,connectionId)},await encryptionKey(env),Buffer.from(envelope.data,'base64'))
  return JSON.parse(new TextDecoder().decode(plaintext))
}
