import {createServer} from 'node:http'
import {financeCases} from './lib/spreadsheet-finance-qa.mjs'
const fn=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}})
function toolData(messages,name){
 const call=messages.flatMap(x=>x.tool_calls??[]).findLast(x=>x.function.name===name)
 const result=messages.findLast(x=>x.role==='tool'&&x.tool_call_id===call?.id)
 if(!result)return null
 try{return JSON.parse(result.content)}catch{try{return JSON.parse(result.content[0].text)}catch{return null}}
}
const server=createServer(async(req,res)=>{
 if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return}
 const chunks=[];for await(const v of req)chunks.push(v)
 const {messages,model,tools,stream}=JSON.parse(Buffer.concat(chunks))
 const available=(tools??[]).map(t=>t.function.name)
 let calls,content=null
 const contentText=m=>typeof m.content==='string'?m.content:(m.content??[]).map(x=>x.text??'').join(' ')
 const promptText=contentText(messages.findLast(m=>m.role==='user'&&financeCases.some(c=>contentText(m).includes(c.key)))??{})
 const scenario=financeCases.find(c=>promptText.includes(c.key))
 if(!available.includes('client_capabilities')&&!available.includes('client_action')){
  // Other local model calls use the same endpoint (title/summaries).
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'qa-meta',object:'chat.completion',created:0,model,choices:[{index:0,message:{role:'assistant',content:'表格验收'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));return
 }
 const catalog=toolData(messages,'client_capabilities')
 const results=messages.filter(m=>m.role==='tool').map(m=>{try{return JSON.parse(m.content)}catch{return null}}).filter(m=>m?.capability?.startsWith('spreadsheet.'))
 const reads=results.filter(r=>r.capability==='spreadsheet.inspect')
 const last=results.at(-1)
 const invoke=(id,capability,args)=>[fn('call_'+id,'client_action',{requestId:id,capability,arguments:args})]
 try{
  if(!scenario)content='请发送验收场景。'
  else if(!catalog&&available.includes('client_capabilities'))calls=[fn('call_catalog','client_capabilities',{})]
  else if(catalog?.mode!=='spreadsheet')throw Error('能力目录没有进入表格模式')
  else if(last?.status==='failed')throw Error(last.message)
  else if(!reads.length)calls=invoke('read_book','spreadsheet.inspect',{scope:'workbook'})
  else if(scenario.key==='行情验收'&&reads.length<3){
   if(reads[0].data.references?.length!==2||!reads[0].data.references.every(r=>promptText.includes(r.marker)))throw Error('两枚选区没有与原话一同送达')
   if(!(promptText.indexOf('收盘价')<promptText.indexOf(reads[0].data.references[0].marker)&&promptText.indexOf(reads[0].data.references[0].marker)<promptText.indexOf('写到')&&promptText.indexOf('写到')<promptText.indexOf(reads[0].data.references[1].marker)))throw Error('两个引用未保持原话位置')
   calls=invoke('read_ref_'+reads.length,'spreadsheet.inspect',{scope:'reference',referenceIndex:reads.length})
  }else if(!results.some(r=>r.capability==='spreadsheet.apply')){
   calls=invoke('write_results','spreadsheet.apply',scenario.prepare(reads[0].data,reads.slice(1).map(r=>r.data)))
  }else if(last?.data?.saved===true)content=scenario.key+'：公式已写入并保存。'
  else throw Error('没有保存回执')
 }catch(error){content='验收失败：'+error.message}
 console.log(JSON.stringify({scenario:scenario?.key,stage:calls?.[0]?.id,catalog:catalog?.mode,results:results.map(x=>[x.capability,x.status,x.data?.range,x.data?.references?.map(r=>r.label)]),content}))
 const info={id:'chatcmpl-sheet-qa',created:Math.floor(Date.now()/1000),model}
 const message={role:'assistant',content,...calls?{tool_calls:calls}:{}}
 if(!stream){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...info,object:'chat.completion',choices:[{index:0,message,finish_reason:calls?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));return}
 res.setHeader('Content-Type','text/event-stream')
 const send=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({...info,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason}]})+'\n\n')
 send({role:'assistant',...(content?{content}:{}),...calls?{tool_calls:calls.map((x,index)=>({index,...x}))}:{}})
 send({},calls?'tool_calls':'stop');res.end('data: [DONE]\n\n')
})
server.listen(Number(process.env.EWORK_SPREADSHEET_MODEL_PORT??19692),'127.0.0.1')
