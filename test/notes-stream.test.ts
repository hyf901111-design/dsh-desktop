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
