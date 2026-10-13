/** Incremental NDJSON, bounded per frame, with a required terminal result. */
export async function readNoteGenerationStream(response: Response, progress: (value: {stage:string;reasoning:string;outputChars:number;seq?:number;startedAt?:number}) => void): Promise<any> {
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
    progress({stage:value.stage,reasoning:value.reasoning,outputChars:value.outputChars,...Number.isSafeInteger(value.seq)&&value.seq>=0?{seq:value.seq,startedAt:value.startedAt}: {}})
  }
  try {
    while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let newline;while((newline=buffer.indexOf('\n'))>=0){frame(buffer.slice(0,newline));buffer=buffer.slice(newline+1)}if(buffer.length>512000)throw Error('笔记生成消息过长。');if(done)break}
    frame(buffer);if(!finished)throw Error('生成未完整结束，请重试。');return result
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
}
