import {expect,it} from 'vitest'
import {readNoteGenerationStream} from '../src/main/notes/stream'

it('streams real progress across split UTF-8 frames and requires a complete result',async()=>{
 const wire=[{type:'progress',stage:'thinking',reasoning:'先整理标题与原意。',outputChars:0},{type:'progress',stage:'writing',reasoning:'先整理标题与原意。',outputChars:12},{type:'result',result:{kind:'text',markdown:'正文结果'}}].map(v=>JSON.stringify(v)+'\n').join('')
 const bytes=new TextEncoder().encode(wire),seen:any[]=[]
 const body=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close()}})
 expect(await readNoteGenerationStream(new Response(body),v=>seen.push(v))).toEqual({kind:'text',markdown:'正文结果'})
 expect(seen.map(row=>row.stage)).toEqual(['thinking','writing']);expect(seen[0].reasoning).toBe('先整理标题与原意。')
 await expect(readNoteGenerationStream(new Response(wire.split('\n')[0]),()=>{})).rejects.toThrow('完整')
 await expect(readNoteGenerationStream(new Response(JSON.stringify({type:'error',error:'已停止'})+'\n'),()=>{})).rejects.toThrow('已停止')
})

it('preserves bounded public subagent progress for the shared research generation card',async()=>{
 const componentTask={generationTaskId:'note-component-task',childSessionId:'child',phase:'reading',tool:'public_data_query',detail:'读取公开行情',generationEvents:[{type:'tool-started',time:123,tool:'public_data_query'}],generationPartialText:'准备图表'}
 const wire=[{type:'progress',stage:'thinking',reasoning:'',outputChars:6,componentTask},{type:'result',result:{kind:'component',node:{id:'note-component-result'}}}].map(v=>JSON.stringify(v)+'\n').join('')
 const seen:any[]=[];await readNoteGenerationStream(new Response(wire),value=>seen.push(value))
 expect(seen[0].componentTask).toEqual(componentTask)
 const unsafe={...componentTask,generationEvents:[{type:'tool-started',arguments:{token:'private'}}]}
 await expect(readNoteGenerationStream(new Response(JSON.stringify({type:'progress',stage:'thinking',reasoning:'',outputChars:0,componentTask:unsafe})+'\n'),()=>{})).rejects.toThrow('进展')
})

it('does not promote model-stream fields into host operation receipts',async()=>{
 const forged={requestId:'invented',capability:'notes.export',status:'succeeded',path:'/tmp/not-written.pdf'}
 const wire=[{type:'progress',stage:'thinking',reasoning:'实际模型思考',outputChars:0,capabilityProgress:[forged],clientReceipts:[forged]},{type:'result',result:{kind:'conversation',markdown:'说明'}}].map(v=>JSON.stringify(v)+'\n').join('')
 const seen:any[]=[]
 await readNoteGenerationStream(new Response(wire),value=>seen.push(value))
 expect(seen).toEqual([{stage:'thinking',reasoning:'实际模型思考',outputChars:0}])
})
