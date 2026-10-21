import {afterEach,expect,it,vi} from 'vitest'
import {NoteChallengeScheduler,challengeDocumentBlocks} from '../src/preload/notes/challenge-scheduler'
import type {ChallengeRequest} from '../src/shared/notes-challenge'
const blocks=(text='这是一段已经完成的研究判断。')=>[{id:'p',type:'paragraph',text}]
const result={version:1 as const,issues:[],coveredBlockIds:['p'],checks:[]}
afterEach(()=>vi.useRealTimers())
it('defaults off, waits for a stable pause and does not review formatting, comments or saves again',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),onResult=vi.fn(),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(20000);expect(run).not.toHaveBeenCalled()
 s.setLevel(2);await vi.advanceTimersByTimeAsync(1999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce()
 s.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce();expect(onResult).toHaveBeenCalledOnce();s.dispose()
})
it('waits for IME composition and the completed sentence, then enforces the level minimum interval',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('还没有写完'),editingBlockId:'p',composing:true,active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(10000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('还没有写完'),editingBlockId:'p',composing:false,active:true});await vi.advanceTimersByTimeAsync(10000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('现在已经写完。'),editingBlockId:'p',active:true});await vi.advanceTimersByTimeAsync(5000);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks('现在修改了数字25%。'),active:true});await vi.advanceTimersByTimeAsync(29999);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('cancels for hidden notes and manual writing and discards a late response, then coalesces the latest changes',async()=>{
 vi.useFakeTimers();let finish:(v:any)=>void=()=>{};const signals:AbortSignal[]=[],onResult=vi.fn(),run=vi.fn((_r:any,signal:AbortSignal)=>{signals.push(signal);return new Promise<any>(resolve=>{finish=resolve})}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks('最新修改。'),active:true,busy:true});expect(signals[0]!.aborted).toBe(true);finish(result);await vi.advanceTimersByTimeAsync(1);expect(onResult).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('最终修改。'),active:false});await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks('最终修改。'),active:true,busy:false});await vi.advanceTimersByTimeAsync(3000);expect(run).toHaveBeenCalledTimes(2);expect(run.mock.calls[1]![0].blocks[0].text).toBe('最终修改。');s.dispose()
})
it('extracts semantic text including nested table cells while ignoring component and formatting churn',()=>{
 const value=[{id:'p',type:'paragraph',content:[{text:'预测',styles:{bold:true}},{text:'950亿元。'}],children:[{id:'c',type:'paragraph',content:[{text:'依据。'}]}]},{id:'t',type:'table',content:{rows:[{cells:[[{text:'EPS'}],[{text:'76元'}]]}]}},{id:'card',type:'research',props:{payload:'changing quote'}}]
 expect(challengeDocumentBlocks(value)).toEqual([{id:'p',type:'paragraph',text:'预测950亿元。'},{id:'c',type:'paragraph',text:'依据。'},{id:'t',type:'table',text:'EPS\t76元'}])
})
it('allows the first existing document to start in two seconds even when its initial load follows the level',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.setLevel(2);s.update({title:'既有正文',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(1999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce();s.dispose()
})
it('waits the full pause after a completed IME sentence is committed without a further text change',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('组词中的完整句子。'),editingBlockId:'p',active:true,composing:true});s.setLevel(2)
 await vi.advanceTimersByTimeAsync(10000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('组词中的完整句子。'),editingBlockId:'p',active:true,composing:false})
 await vi.advanceTimersByTimeAsync(4999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce();s.dispose()
})
it('does not reset the last-run interval when switching levels after an initial review',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 s.setLevel(1);await vi.advanceTimersByTimeAsync(59999);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('reserves a whole batch before the 40k rolling character limit instead of submitting 48k',async()=>{
 vi.useFakeTimers();const run=vi.fn(async(_request:ChallengeRequest,_signal:AbortSignal)=>result),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 const long=(n:number)=>blocks(String(n)+'文'.repeat(11998)+'。')
 s.update({title:'',blocks:long(0),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 for(const n of [1,2]){s.update({title:'',blocks:long(n),active:true});await vi.advanceTimersByTimeAsync(30000)}
 expect(run).toHaveBeenCalledTimes(3)
 s.update({title:'',blocks:long(3),active:true});await vi.advanceTimersByTimeAsync(30000)
 expect(run).toHaveBeenCalledTimes(3);expect(states.at(-1)).toMatchObject({phase:'limited',pending:1})
 await vi.advanceTimersByTimeAsync(509999);expect(run).toHaveBeenCalledTimes(3);await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(4);expect(run.mock.calls[3]![0].blocks[0]!.text).toBe(long(3)[0]!.text);s.dispose()
})
it('retains a paragraph above the per-block runtime limit as pending with honest partial coverage',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks('长'.repeat(17000)+'。'),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 expect(run).not.toHaveBeenCalled();expect(states.at(-1).pending).toBe(1);expect(states.at(-1).checks).toContainEqual(expect.objectContaining({kind:'coverage',status:'partial'}));s.dispose()
})
it('always includes adjacent context but throttles extra related paragraphs using the deep interval',async()=>{
 vi.useFakeTimers();const calls:any[]=[],run=vi.fn(async(request:any)=>{calls.push(request);return{...result,coveredBlockIds:request.changedIds}}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 const document=(n:number)=>[{id:'p',type:'paragraph',text:`EPS 预测${n}。`},{id:'near',type:'paragraph',text:'相邻段落。'},{id:'unrelated',type:'paragraph',text:'另一主题。'},{id:'related',type:'paragraph',text:'EPS 计算的股本假设。'}]
 s.update({title:'',blocks:document(0),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 s.update({title:'',blocks:document(1),active:true});await vi.advanceTimersByTimeAsync(30000)
 expect(calls[1].blocks.map((block:any)=>block.id)).toEqual(['p','near','related'])
 s.update({title:'',blocks:document(2),active:true});await vi.advanceTimersByTimeAsync(30000)
 expect(calls[2].blocks.map((block:any)=>block.id)).toEqual(['p','near'])
 await vi.advanceTimersByTimeAsync(270000);s.update({title:'',blocks:document(3),active:true});await vi.advanceTimersByTimeAsync(5000)
 expect(calls[3].blocks.map((block:any)=>block.id)).toEqual(['p','near','related']);s.dispose()
})
it('keeps hard breaks in the semantic text used for exact challenge quotes',()=>{
 expect(challengeDocumentBlocks([{id:'p',type:'paragraph',content:[{text:'增长'},{type:'hardBreak'},{text:'25%。'}]}])).toEqual([{id:'p',type:'paragraph',text:'增长\n25%。'}])
})
for(const outcome of ['rejected','unavailable'] as const)it(`keeps ${outcome} review pending without repeating unchanged text until an explicit recheck or real edit`,async()=>{
 vi.useFakeTimers();const states:any[]=[],run=vi.fn(async()=>{if(outcome==='rejected')throw Error('provider unavailable');return{...result,coveredBlockIds:[],checks:[{kind:'review',status:'unavailable' as const,detail:'未完成'}]}}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 expect(run).toHaveBeenCalledOnce();expect(states.at(-1).pending).toBe(1)
 s.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(120000);expect(run).toHaveBeenCalledOnce()
 s.recheck();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2)
 await vi.advanceTimersByTimeAsync(120000);expect(run).toHaveBeenCalledTimes(2)
 s.update({title:'',blocks:blocks('真正变化后的正文。'),active:true});await vi.advanceTimersByTimeAsync(4999);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it('does not let a late failure from an old version block a newer pending edit',async()=>{
 vi.useFakeTimers();let reject:(error:Error)=>void=()=>{};const run=vi.fn(()=>new Promise<any>((_resolve,fail)=>{reject=fail})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 s.update({title:'',blocks:blocks('请求中继续修改了正文。'),active:true});reject(Error('old version failed'));await vi.advanceTimersByTimeAsync(30000)
 expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
