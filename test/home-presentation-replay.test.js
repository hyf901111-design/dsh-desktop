import {afterEach,it,expect,vi} from 'vitest'
import * as runtime from '../packages/dsh-research-task-runtime/home-presentation-runtime.js'
const metadata={presentationTitle:'模拟研究汇报',presentationSlides:20,sourcePages:28,publisher:'Vanguard',publicationDate:'2025-12-10',chapters:[{id:'a',title:'模拟增长'},{id:'b',title:'模拟估值'},{id:'c',title:'模拟配置'},{id:'d',title:'模拟风险'}],pageOutline:Array.from({length:20},(_,i)=>({slide:i+1,title:'完整逐页提纲 '+(i+1),sourcePages:[2],kind:'content'}))}
afterEach(()=>vi.useRealTimers())
it('uses the delivered title/count and compact metadata chapters while retaining the full outline',()=>{
 expect(runtime.createHomePresentationReplay).toBeTypeOf('function')
 const before=structuredClone(metadata),replay=runtime.createHomePresentationReplay(metadata)
 expect(runtime.createHomePresentationBrief(metadata)).toContain('主题为「模拟研究汇报」')
 expect(replay.structure.split('\n').filter(line=>/^\d+\./u.test(line))).toHaveLength(4)
 for(const chapter of metadata.chapters)expect(replay.structure).toContain(chapter.title)
 expect(replay.structure).not.toContain('完整逐页提纲');expect(metadata).toEqual(before)
 expect(replay.delivery).toContain('《模拟研究汇报》20页');expect(replay.delivery).toContain('4个章节')
 expect(replay.intro).toContain('2025-12-10');expect(replay.intro).toContain('28页');expect(replay.intro).toContain('离线回放')
 expect(replay.delivery).toContain('离线预制');expect(replay.delivery).toContain('不调用模型')
 expect(JSON.stringify(replay)).not.toMatch(/Kimi|实时生成|正在调用|\/Users\//u)
 expect(replay.todos).toHaveLength(3);expect(replay.todos[0]).toContain('来源');expect(replay.todos[1]).toContain('章节');expect(replay.todos[1]).toContain('排版');expect(replay.todos[2]).toContain('保存')
})
it('derives chapter count from the actual metadata rather than forcing four or twenty page lines',()=>{
 const replay=runtime.createHomePresentationReplay({...metadata,presentationSlides:16,chapters:metadata.chapters.slice(0,3)})
 expect(replay.structure.split('\n').filter(line=>/^\d+\./u.test(line))).toHaveLength(3)
 expect(replay.delivery).toContain('16页');expect(replay.delivery).toContain('3个章节');expect(replay.delivery).not.toContain('20页')
 const fallback=runtime.createHomePresentationReplay({...metadata,chapters:undefined,pageOutline:[{slide:1,kind:'cover',title:'模拟封面'},{slide:2,kind:'toc',title:'目录：模拟第一章'},{slide:3,kind:'content',title:'逐页内容'},{slide:4,kind:'toc',title:'目录：模拟第二章'}]})
 expect(fallback.structure).toContain('模拟第一章');expect(fallback.structure).toContain('模拟第二章');expect(fallback.structure).not.toContain('逐页内容')
})
it('streams about fifty characters per second and keeps Unicode characters intact',async()=>{
 vi.useFakeTimers();expect(runtime.streamHomePresentationReplayText).toBeTypeOf('function')
 const stream=runtime.streamHomePresentationReplayText('一二三四五六七八九十🙂终',{waitUntilPlaying:async()=>{},signal:new AbortController().signal})
 expect((await stream.next()).value.type).toBe('block-start');expect((await stream.next()).value.text).toBe('一二三')
 let next=stream.next(),settled=false;void next.then(()=>settled=true)
 await vi.advanceTimersByTimeAsync(59);expect(settled).toBe(false)
 await vi.advanceTimersByTimeAsync(1);expect((await next).value.text).toBe('四五六')
 const rest=[]
 for(let i=0;i<2;i++){next=stream.next();await vi.advanceTimersByTimeAsync(60);rest.push((await next).value.text)}
 expect(rest.join('')).toBe('七八九十🙂终')
 next=stream.next();await vi.advanceTimersByTimeAsync(60);expect((await next).value.type).toBe('block-end')
})
it('blocks further text while paused and immediately rejects a cancelled stream',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let playing=true,release
 const gate=()=>playing?Promise.resolve():new Promise(resolve=>{release=resolve})
 const stream=runtime.streamHomePresentationReplayText('模拟正文继续阅读',{waitUntilPlaying:gate,signal:controller.signal})
 await stream.next();expect((await stream.next()).value.text).toBe('模拟正')
 playing=false;let settled=false;const next=stream.next();void next.then(()=>settled=true)
 await vi.advanceTimersByTimeAsync(1000);expect(settled).toBe(false)
 playing=true;release();expect((await next).value.text).toBe('文继续')
 const cancelled=stream.next().catch(error=>error.name);controller.abort();expect(await cancelled).toBe('AbortError')
})
it('cancels even while a playback gate is paused without emitting content',async()=>{
 const controller=new AbortController(),stream=runtime.streamHomePresentationReplayText('暂停期间不输出',{waitUntilPlaying:()=>new Promise(()=>{}),signal:controller.signal})
 await stream.next();const next=stream.next().catch(error=>error.name);controller.abort();expect(await next).toBe('AbortError')
})
it('retains the actual chapter count even when distinct chapters share a display title',()=>{
 const replay=runtime.createHomePresentationReplay({...metadata,chapters:metadata.chapters.map(chapter=>({...chapter,title:'模拟同名章节'}))})
 expect(replay.structure.split('\n').filter(line=>/^\d+\./u.test(line))).toHaveLength(4);expect(replay.delivery).toContain('4个章节')
})
