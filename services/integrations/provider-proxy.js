import {BrokerError,validId,notionFetch,loadConnectionTokens,refreshTokens,json} from './oauth-broker.js'
const resourceId=value=>typeof value==='string'&&/^([a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/.test(value)
export async function proxyNotion(user,input,env,fetchRequest){
  if(!validId(input.connectionId)||!['me','search','page_read','block_children'].includes(input.operationId)||!input.args||typeof input.args!=='object'||Array.isArray(input.args)||Object.keys(input).some(key=>!['connectionId','operationId','args'].includes(key)))throw new BrokerError('INVALID_REQUEST')
  const args=input.args,operation=input.operationId
  const keys=operation==='me'?[]:operation==='search'?['query','cursor','pageSize']:operation==='page_read'?['pageId']:['blockId','cursor','pageSize']
  if(Object.keys(args).some(key=>!keys.includes(key))||Object.entries(args).some(([key,value])=>key==='pageSize'?!Number.isInteger(value)||value<1||value>100:typeof value!=='string'||!value||value.length>2048))throw new BrokerError('INVALID_REQUEST')
  if(operation==='page_read'&&!resourceId(args.pageId)||operation==='block_children'&&!resourceId(args.blockId))throw new BrokerError('INVALID_REQUEST')
  const suffix=operation==='me'?'/users/me':operation==='search'?'/search':operation==='page_read'?`/pages/${args.pageId}`:`/blocks/${args.blockId}/children`
  const url=new URL(`/v1${suffix}`,'https://api.notion.com'),body={}
  if(operation==='search'){body.page_size=args.pageSize??100;if(args.query)body.query=args.query;if(args.cursor)body.start_cursor=args.cursor}
  if(operation==='block_children'){url.searchParams.set('page_size',String(args.pageSize??100));if(args.cursor)url.searchParams.set('start_cursor',args.cursor)}
  const call=tokens=>notionFetch(env,`${url.pathname}${url.search}`,{method:operation==='search'?'POST':'GET',headers:{authorization:`Bearer ${tokens.access_token}`},...(operation==='search'?{body:JSON.stringify(body)}:{})},fetchRequest)
  let {tokens}=await loadConnectionTokens(user,input.connectionId,env)
  let result=await call(tokens)
  // These operations are all reads. Only one refresh and one safe read replay are allowed.
  if(result.status===401){tokens=await refreshTokens(user,input.connectionId,env,fetchRequest);result=await call(tokens)}
  if(!result.ok)throw new BrokerError([401,403].includes(result.status)?'AUTH_REQUIRED':'PROVIDER_UNAVAILABLE',[401,403].includes(result.status)?401:502)
  let content=JSON.stringify(result.data)
  for(const token of [tokens.access_token,tokens.refresh_token])content=content.split(token).join('[凭据已隐藏]')
  return json(JSON.parse(content))
}
