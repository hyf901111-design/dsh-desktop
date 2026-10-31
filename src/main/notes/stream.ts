/** Incremental NDJSON, bounded per frame, with a required terminal result. */
export async function readNoteGenerationStream(response: Response, progress: (value: {stage:string;reasoning:string;outputChars:number;seq?:number;startedAt?:number;componentTask?:any;documentIntent?:boolean}) => void): Promise<any> {
  if(!response.body)throw Error('笔记生成连接已中断。')
  const reader=response.body.getReader(),decoder=new TextDecoder()
  let buffer='',result:any,finished=false
  const frame=(line:string)=>{
    if(!line.trim())return
    if(line.length>512000||finished)throw Error('笔记生成消息格式无效。')
    const value=JSON.parse(line)
    if(value.type==='error')throw Error(String(value.error||'笔记生成失败。'))
    if(value.type==='result'){result=value.result;finished=true;return}
    if(value.type!=='progress'||!['model','thinking','writing','validating'].includes(value.stage)||typeof value.reasoning!=='string'||value.reasoning.length>30000||!Number.isFinite(value.outputChars)||value.outputChars<0)throw Error('笔记生成进展格式无效。')
    const task=value.componentTask
    if(task!==undefined){
      const keys=new Set(['generationTaskId','childSessionId','phase','tool','detail','generationStartedAt','generationEvents','generationPartialText']),eventKeys=new Set(['taskId','canvasNodeId','seq','time','type','tool','detail','text','failed'])
      if(!task||typeof task!=='object'||Array.isArray(task)||Object.keys(task).some(key=>!keys.has(key))||JSON.stringify(task).length>160000||!['starting','running','reading','writing','validating'].includes(task.phase)||typeof task.generationTaskId!=='string'||task.generationTaskId.length>256||['childSessionId','tool','detail'].some(key=>task[key]!==undefined&&(typeof task[key]!=='string'||task[key].length>(key==='detail'?1000:256)))||task.generationStartedAt!==undefined&&!Number.isFinite(task.generationStartedAt)||typeof task.generationPartialText!=='string'||task.generationPartialText.length>30000||!Array.isArray(task.generationEvents)||task.generationEvents.length>24||task.generationEvents.some((event:any)=>!event||typeof event!=='object'||Object.keys(event).some(key=>!eventKeys.has(key))||!['started','tool-started','tool-finished','sources-ready','assistant-delta'].includes(event.type)||Object.entries(event).some(([key,item])=>['seq','time'].includes(key)?!Number.isFinite(item):key==='failed'?typeof item!=='boolean':typeof item!=='string'||item.length>(key==='text'?30000:1000))))throw Error('笔记组件生成进展格式无效。')
    }
    progress({...(value.documentIntent===true?{documentIntent:true}:{}),stage:value.stage,reasoning:value.reasoning,outputChars:value.outputChars,...Number.isSafeInteger(value.seq)&&value.seq>=0?{seq:value.seq,startedAt:value.startedAt}: {},...task?{componentTask:task}:{}})
  }
  try {
    while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let newline;while((newline=buffer.indexOf('\n'))>=0){frame(buffer.slice(0,newline));buffer=buffer.slice(newline+1)}if(buffer.length>512000)throw Error('笔记生成消息过长。');if(done)break}
    frame(buffer);if(!finished)throw Error('生成未完整结束，请重试。');return result
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
}
