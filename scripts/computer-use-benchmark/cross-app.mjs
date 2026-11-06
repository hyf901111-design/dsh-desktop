// Real cross-application screenshot delivery with the configured Volcengine Flash model.
// Only the dedicated fixture and a new Doubao test chat may be operated.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import YAML from 'yaml'
import { createBackend, resultForHost } from '../../packages/dsh-computer-backends/index.js'

const candidate=process.env.BENCH_BACKEND||'peekaboo'
if(candidate!=='peekaboo')throw Error('Unknown benchmark backend')
const root=resolve(import.meta.dirname,'../..'), output=join(root,'output/computer-use-latency',candidate+'-'+Date.now())
await mkdir(output,{recursive:true})
const profile=join(process.env.HOME,'Library/Application Support/sherlock-desktop/harness')
const settings=YAML.parse(await readFile(join(profile,'settings.yaml'),'utf8'))
const provider=settings['llm-pi-ai'].providers['volcengine-agent-plan']
const key=YAML.parse(await readFile(join(profile,'.credentials.yaml'),'utf8'))[provider.apiKeyEnv]
if(!key||provider.baseURL!=='https://ark.cn-beijing.volces.com/api/plan/v3')throw Error('缺少已配置的火山模型')
const model='deepseek-v4-1-flash-261017', dir=await mkdtemp(join(tmpdir(),'ework-cross-app-'))
const html='<html lang="zh"><meta charset="utf-8"><title>EWork Computer Use Benchmark</title><body style="background:#1f1f1f;color:white;padding:64px;font:24px system-ui"><h1>EWork 界面验收示例</h1><p>这是一张不含用户资料的测试页面。</p><section style="padding:32px;background:#333;border-radius:16px">研究看板 · 笔记 · 对话</section><p>测试码：FLASH-CROSS-APP</p></body></html>'
const fixture=spawn(join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),[join(import.meta.dirname,'electron.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'',BENCH_PROFILE:dir,BENCH_URL:'data:text/html;charset=utf-8,'+encodeURIComponent(html)},stdio:'ignore'})
let backend;const started=Date.now(),trace=[]
try{
 await new Promise(r=>setTimeout(r,1800))
 backend=await createBackend(candidate,{nativeDirectory:join(root,'build/native'),signal:AbortSignal.timeout(30000)})
 const messages=[{role:'system',content:'你正在进行授权桌面验收。只操作 EWork Computer Use Benchmark 自有测试窗口和豆包的新测试对话，不操作 Codex、终端或其他应用。不用脚本、隐藏API或网络工具。每次只调用一个桌面工具，根据真实截图/元素操作；不要把投递回执当业务成功。'+backend.guidance},{role:'user',content:'打开豆包，新建一个测试对话。把标题为 EWork Computer Use Benchmark 的测试页面截成图片，发送给豆包，并附上“这是一张专门用于电脑操作验收的测试界面，测试码 FLASH-CROSS-APP，请简评排版。”。只发送一次，确认图片和文字已发送就结束，不必等完整回答。'}]
 const functions=backend.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}))
 for(let turn=0;turn<36&&Date.now()-started<240000;turn++){
  const llmStart=Date.now()
  const response=await fetch(provider.baseURL+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({model,messages,tools:functions,max_tokens:8192,parallel_tool_calls:false}),signal:AbortSignal.timeout(60000)})
  const body=await response.json();if(!response.ok)throw Error('模型请求失败 '+response.status)
  const m=body.choices?.[0]?.message;if(!m)throw Error('模型未返回消息')
  messages.push(m);trace.push({turn,llmMs:Date.now()-llmStart,usage:body.usage,actualModel:body.model})
  if(!m.tool_calls?.length){trace.push({final:m.content});break}
  for(const call of m.tool_calls){
   const at=Date.now();let args,result;try{args=JSON.parse(call.function.arguments);result=await backend.call(call.function.name,args,AbortSignal.timeout(30000))}catch(e){result={isError:true,content:[{type:'text',text:e.message}]}}
   const host=resultForHost(result)
   trace.push({turn,tool:call.function.name,arguments:args,toolMs:Date.now()-at,result:host.data,images:host.screenshots.length})
   console.log('STEP',turn,call.function.name,Math.round((Date.now()-started)/1000)+'s',result.isError?'unverified/error':'ok')
   messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(host.data)})
   if(host.screenshots.length){
    messages.push({role:'user',content:host.screenshots.map(i=>({type:'image_url',image_url:{url:`data:${i.mimeType};base64,${i.dataBase64}`}}))})
    for(let i=0;i<host.screenshots.length;i++)await writeFile(join(output,`cross-${turn}-${i}.png`),Buffer.from(host.screenshots[i].dataBase64,'base64'))
   }
  }
  const visuals=messages.flatMap((m,i)=>Array.isArray(m.content)?[i]:[])
  for(const i of visuals.slice(0,-2))messages[i]={role:'user',content:'较早截图已省略，以最新截图为准。'}
 }
}catch(e){trace.push({error:e.message})}finally{await backend?.close();fixture.kill('SIGTERM')}
const report={candidate,model,durationMs:Date.now()-started,trace}
await writeFile(join(output,'cross-app.json'),JSON.stringify(report,null,2))
console.log('DONE',JSON.stringify({output,seconds:report.durationMs/1000,toolCalls:trace.filter(t=>t.tool).length,final:trace.at(-1)}))
