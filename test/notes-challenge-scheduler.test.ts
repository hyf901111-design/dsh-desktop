import {afterEach,expect,it,vi} from 'vitest'
import {NoteChallengeScheduler,challengeDocumentBlocks,CHALLENGE_LEVELS} from '../src/preload/notes/challenge-scheduler'
import type {ChallengeRequest} from '../src/shared/notes-challenge'
const blocks=(text='这是一段已经完成的研究判断。')=>[{id:'p',type:'paragraph',text}]
const result={version:1 as const,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]}
afterEach(()=>vi.useRealTimers())
it('includes current review anchor context and charges its rolling character cost',async()=>{
 vi.useFakeTimers();const text='甲'.repeat(1899)+'乙'+'丙'.repeat(1899)+'丁'+'戊'.repeat(99)+'。',anchors=[{blockId:'p',quote:text.slice(0,1900)},{blockId:'p',quote:text.slice(1900,3800)}]
 const run=vi.fn(async(_r:ChallengeRequest)=>result),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:v=>states.push(v),getReviewAnchors:()=>anchors})
 s.update({title:'文稿',blocks:blocks(text),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 expect(run.mock.calls[0]![0].existingAnchors).toEqual(anchors)
 for(let n=0;n<4;n++){s.recheck();await vi.advanceTimersByTimeAsync(30000)}
 expect(run).toHaveBeenCalledTimes(5)
 s.recheck();await vi.advanceTimersByTimeAsync(30000)
 expect(run).toHaveBeenCalledTimes(5);expect(states.at(-1)).toMatchObject({phase:'limited',pending:1});s.dispose()
})
it('limits review anchor hints to reviewed targets even when adjacent context has its own marks',async()=>{
 vi.useFakeTimers();const anchors=[{blockId:'p',quote:'已有问题'},{blockId:'q',quote:'邻段'}]
 const run=vi.fn(async(r:ChallengeRequest)=>({...result,coveredBlockIds:r.changedIds!,completeBlockIds:r.changedIds!})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),getReviewAnchors:()=>anchors})
 const document=(n:number)=>[{id:'p',type:'paragraph',text:'已有问题。'+n},{id:'q',type:'paragraph',text:'邻段注释。'}]
 s.update({title:'',blocks:document(0),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 s.update({title:'',blocks:document(1),active:true});await vi.advanceTimersByTimeAsync(30000)
 expect(run.mock.calls[1]![0].blocks.map(b=>b.id)).toEqual(['p','q'])
 expect(run.mock.calls[1]![0].existingAnchors).toEqual([anchors[0]])
 s.dispose()
})
it('reads the latest review anchors on recheck without treating annotation changes as body edits',async()=>{
 vi.useFakeTimers();let anchors=[{blockId:'p',quote:'已有问题'}]
 const document=blocks('已有问题。另一个问题。'),run=vi.fn(async(_r:ChallengeRequest)=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),getReviewAnchors:()=>anchors})
 s.update({title:'',blocks:document,active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 expect(run.mock.calls[0]![0].existingAnchors).toEqual([{blockId:'p',quote:'已有问题'}])
 anchors=[{blockId:'p',quote:'另一个问题'}]
 s.update({title:'',blocks:document,active:true});await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce()
 s.recheck();await vi.advanceTimersByTimeAsync(1);expect(run.mock.calls[1]![0].existingAnchors).toEqual(anchors);s.dispose()
})
it('defaults off, waits for a stable pause and does not review formatting, comments or saves again',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),onResult=vi.fn(),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(20000);expect(run).not.toHaveBeenCalled()
 s.setLevel(2);await vi.advanceTimersByTimeAsync(1999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce()
 s.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce();expect(onResult).toHaveBeenCalledOnce();s.dispose()
})
it('waits for IME composition and a stable pause, then enforces the level minimum interval',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('还没有写完'),editingBlockId:'p',composing:true,active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(10000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('还没有写完'),editingBlockId:'p',composing:false,active:true});await vi.advanceTimersByTimeAsync(4999);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('现在已经写完。'),editingBlockId:'p',active:true});await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[2].pause);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks('现在修改了数字25%。'),active:true});await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[2].pause-1);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);s.dispose()
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
 await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[2].pause-1);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce();s.dispose()
})
it('does not reset the last-run interval when switching levels after an initial review',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 s.setLevel(1);await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[1].interval-1);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);s.dispose()
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
 vi.useFakeTimers();const calls:any[]=[],run=vi.fn(async(request:any)=>{calls.push(request);return{...result,coveredBlockIds:request.changedIds,completeBlockIds:request.changedIds}}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
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
 s.update({title:'',blocks:blocks('真正变化后的正文。'),active:true});await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[2].pause-1);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it('does not let a late failure from an old version block a newer pending edit',async()=>{
 vi.useFakeTimers();let reject:(error:Error)=>void=()=>{};const run=vi.fn(()=>new Promise<any>((_resolve,fail)=>{reject=fail})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000)
 s.update({title:'',blocks:blocks('请求中继续修改了正文。'),active:true});reject(Error('old version failed'));await vi.advanceTimersByTimeAsync(30000)
 expect(run).toHaveBeenCalledTimes(2);s.dispose()
})

it('reviews a stable paragraph without final punctuation while the caret stays inside it',async()=>{
 vi.useFakeTimers();const run=vi.fn(async(_r:ChallengeRequest)=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('这份报告已经提胶'),editingBlockId:'p',active:true});s.setLevel(3)
 await vi.advanceTimersByTimeAsync(4999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce()
 expect(run.mock.calls[0]![0].blocks[0]!.text).toBe('这份报告已经提胶');await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledOnce();s.dispose()
})
for(const level of [1,2,3,4] as const)it(`rechecks a fresh semantic edit promptly at enabled level ${level}`,async()=>{
 vi.useFakeTimers();const run=vi.fn(async(_r:ChallengeRequest)=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('这份报告已经提交。'),active:true});s.setLevel(level);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks('这份报告已经提胶。'),editingBlockId:'p',active:true})
 await vi.advanceTimersByTimeAsync(CHALLENGE_LEVELS[level].pause-1);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2)
 await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('coalesces continued typing and IME edits before checking an unpunctuated phrase',async()=>{
 vi.useFakeTimers();const run=vi.fn(async(_r:ChallengeRequest)=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks('错别'),editingBlockId:'p',composing:true,active:true});s.setLevel(3)
 await vi.advanceTimersByTimeAsync(12000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('错别字已经提胶'),editingBlockId:'p',composing:false,active:true});await vi.advanceTimersByTimeAsync(4000);expect(run).not.toHaveBeenCalled()
 s.update({title:'',blocks:blocks('错别字已经提胶给编辑'),editingBlockId:'p',active:true});await vi.advanceTimersByTimeAsync(4999);expect(run).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce();expect(run.mock.calls[0]![0].blocks[0]!.text).toBe('错别字已经提胶给编辑');s.dispose()
})
it('immediately rechecks a changed level after adjustment closes without the old interval delaying it',async()=>{
 vi.useFakeTimers();const run=vi.fn(async(_r:ChallengeRequest)=>result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks(),active:true,busy:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks(),active:true,busy:false});s.recheck(true);await vi.advanceTimersByTimeAsync(1)
 expect(run).toHaveBeenCalledTimes(2);expect(run.mock.calls[1]![0].level).toBe(4);s.dispose()
})

const partial={...result,completeBlockIds:[],checks:[{kind:'review',status:'partial' as const,detail:'基础检查已完成，当前等级的深入检查尚未完成。'}]}
it('backs off and makes at most two supplemental passes for covered but incomplete paragraphs',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),onResult=vi.fn(),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult,onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce()
 await vi.advanceTimersByTimeAsync(5999);expect(run).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(2)
 await vi.advanceTimersByTimeAsync(11999);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(3)
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);expect(onResult).toHaveBeenCalledTimes(3)
 expect(states.at(-1)).toMatchObject({phase:'waiting',pending:1});expect(s.retryState().entries).toMatchObject([{id:'p',attempts:2,blocked:false}]);s.dispose()
})
it('stops supplemental checks as soon as this tier is complete',async()=>{
 vi.useFakeTimers();const run=vi.fn().mockResolvedValueOnce(partial).mockResolvedValue(result),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(8001);expect(run).toHaveBeenCalledTimes(2)
 expect(s.retryState().entries).toEqual([]);await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('only targets incomplete paragraphs on the supplemental pass while retaining adjacent context',async()=>{
 vi.useFakeTimers();const run=vi.fn(async(request:ChallengeRequest)=>({...result,coveredBlockIds:request.changedIds!,completeBlockIds:['p']})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:[...blocks(),{id:'q',type:'paragraph',text:'需要额外追问的结论。'}],active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(8001)
 expect(run.mock.calls[0]![0].changedIds).toEqual(['p','q']);expect(run.mock.calls[1]![0].changedIds).toEqual(['q']);expect(run.mock.calls[1]![0].blocks.map(b=>b.id)).toEqual(['q','p'])
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it('treats an old host without completion attestations as partial, with a bounded compatibility retry',async()=>{
 vi.useFakeTimers();const {completeBlockIds:_,...oldResult}=result,run=vi.fn(async()=>oldResult),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledTimes(3);expect(s.retryState().entries[0]?.attempts).toBe(2);s.dispose()
})
it('does not treat an unreviewed block as complete just because it is in completeBlockIds',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>({...result,coveredBlockIds:[]})),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(2);await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledOnce();expect(states.at(-1)).toMatchObject({pending:1});s.dispose()
})
it('restores old partial coverage as two delayed supplements instead of silently dropping it',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:false});s.setLevel(4);s.restoreCoverage(['p'],partial.checks,[]);s.update({title:'',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(5999);expect(run).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledOnce()
 await vi.advanceTimersByTimeAsync(12001);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('preserves the consumed allowance across repeated scheduler reopenings',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),create=()=>{const s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()});s.update({title:'文稿',blocks:blocks(),active:false});s.setLevel(4);return s}
 const first=create();first.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(8001)
 expect(run).toHaveBeenCalledTimes(2);const oneUsed=first.retryState();expect(oneUsed.entries[0]?.attempts).toBe(1);first.dispose()
 const second=create();second.restoreCoverage(['p'],partial.checks,[],oneUsed);second.update({title:'文稿',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(11999);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(3)
 const exhausted=second.retryState();expect(exhausted.entries[0]?.attempts).toBe(2);second.dispose()
 for(let n=0;n<3;n++){const reopened=create();reopened.restoreCoverage(['p'],partial.checks,[],exhausted);reopened.update({title:'文稿',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);reopened.dispose()}
})
it('does not supplement restored fully completed coverage',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks(),active:false});s.setLevel(4);s.restoreCoverage(['p'],[],['p']);s.update({title:'',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(1200000);expect(run).not.toHaveBeenCalled();expect(states.at(-1)).toMatchObject({phase:'idle',pending:0});s.dispose()
})
it.each(['title','text','type','level'] as const)('does not attach persisted retry exhaustion to a different %s',async change=>{
 vi.useFakeTimers();const before=new NoteChallengeScheduler({sessionId:'s',run:async()=>partial,onResult:vi.fn()})
 before.update({title:'文稿',blocks:blocks(),active:true});before.setLevel(4);await vi.advanceTimersByTimeAsync(20002);const exhausted=before.retryState();before.dispose()
 const title=change==='title'?'新的文稿':'文稿',current=blocks(change==='text'?'已经重新编辑的内容。':undefined);if(change==='type')current[0]!.type='heading'
 const run=vi.fn(async()=>partial),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()});s.update({title,blocks:current,active:false});s.setLevel(change==='level'?3:4);s.restoreCoverage(['p'],[],[],exhausted);s.update({title,blocks:current,active:true})
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it.each(['edit','title','level','recheck'] as const)('renews exhausted supplements on an explicit %s while preserving the rolling budget',async change=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'文稿',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(20002);expect(run).toHaveBeenCalledTimes(3)
 if(change==='edit')s.update({title:'文稿',blocks:blocks('修订后的正文。'),active:true})
 if(change==='title')s.update({title:'修订后的标题',blocks:blocks(),active:true})
 if(change==='level')s.setLevel(3,true)
 if(change==='recheck')s.recheck(true)
 await vi.advanceTimersByTimeAsync(60000);expect(run).toHaveBeenCalledTimes(6);expect(s.retryState().usage).toHaveLength(6);s.dispose()
})
it('does not renew exhausted supplements on focus, formatting or same-level updates',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(20002)
 for(let n=0;n<3;n++){s.update({title:'',blocks:blocks(),active:false});s.setLevel(4);s.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(60000)}
 expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it.each(['rejected','unavailable'] as const)('stops a failed supplemental %s pass and preserves that stop on reopening',async outcome=>{
 vi.useFakeTimers();const run=vi.fn().mockResolvedValueOnce(partial)
 if(outcome==='rejected')run.mockRejectedValue(Error('provider unavailable'))
 else run.mockResolvedValue({...partial,coveredBlockIds:[],checks:[{kind:'review',status:'unavailable',detail:'本轮未执行。'}]})
 const s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()});s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledTimes(2);const stopped=s.retryState();expect(stopped.entries[0]).toMatchObject({attempts:1,blocked:true});s.dispose()
 const reopened=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()});reopened.update({title:'',blocks:blocks(),active:false});reopened.setLevel(4);reopened.restoreCoverage(['p'],partial.checks,[],stopped);reopened.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledTimes(2);reopened.dispose()
})
it('charges interrupted supplemental attempts without repeatedly restarting them',async()=>{
 vi.useFakeTimers();const signals:AbortSignal[]=[],run=vi.fn((_request:ChallengeRequest,signal:AbortSignal)=>{signals.push(signal);return signals.length===1?Promise.resolve(partial):new Promise<any>(()=>{})}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(8001);expect(run).toHaveBeenCalledTimes(2)
 s.update({title:'',blocks:blocks(),active:true,busy:true});await vi.advanceTimersByTimeAsync(1);expect(signals[1]!.aborted).toBe(true)
 s.update({title:'',blocks:blocks(),active:true,busy:false});await vi.advanceTimersByTimeAsync(12000);expect(run).toHaveBeenCalledTimes(3)
 s.update({title:'',blocks:blocks(),active:true,busy:true});await vi.advanceTimersByTimeAsync(1);expect(signals[2]!.aborted).toBe(true)
 s.update({title:'',blocks:blocks(),active:true,busy:false});await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it('finishes a partial pass after losing focus but waits for the note to become active before supplementing',async()=>{
 vi.useFakeTimers();let finish!:(value:any)=>void;let signal!:AbortSignal
 const run=vi.fn((_request:ChallengeRequest,current:AbortSignal)=>{signal=current;return new Promise<any>(resolve=>{finish=resolve})}),onResult=vi.fn(),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(2000);s.update({title:'',blocks:blocks(),active:false});expect(signal.aborted).toBe(false)
 finish(partial);await vi.advanceTimersByTimeAsync(60000);expect(onResult).toHaveBeenCalledOnce();expect(run).toHaveBeenCalledOnce()
 s.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('keeps the rolling token budget after restoring partial coverage instead of using retries to bypass it',async()=>{
 vi.useFakeTimers();const run=vi.fn().mockResolvedValueOnce({...partial,usage:{inputTokens:40000,outputTokens:1}}).mockResolvedValue(result),first=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 first.update({title:'',blocks:blocks(),active:true});first.setLevel(4);await vi.advanceTimersByTimeAsync(2000);const saved=first.retryState();first.dispose()
 const states:any[]=[],reopened=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)});reopened.update({title:'',blocks:blocks(),active:false});reopened.setLevel(4);reopened.restoreCoverage(['p'],partial.checks,[],saved);reopened.update({title:'',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(599999);expect(run).toHaveBeenCalledOnce();expect(states.at(-1).phase).toBe('limited')
 await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(2);expect(reopened.retryState().entries).toEqual([]);reopened.dispose()
})
it('does not send a third large partial batch before the rolling character reservation permits it',async()=>{
 vi.useFakeTimers();const document=[{id:'p',type:'paragraph',text:'甲'.repeat(7999)+'。'},{id:'q',type:'paragraph',text:'乙'.repeat(7999)+'。'}],run=vi.fn(async()=>({...partial,coveredBlockIds:['p','q']})),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:document,active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(20002);expect(run).toHaveBeenCalledTimes(2);expect(states.at(-1)).toMatchObject({phase:'limited',pending:2})
 await vi.advanceTimersByTimeAsync(581997);expect(run).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(2);expect(run).toHaveBeenCalledTimes(3)
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);s.dispose()
})
it('still supplements a partial paragraph when its oversized neighbor remains pending',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>({...partial,coveredBlockIds:['q']})),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:[{id:'p',type:'paragraph',text:'长'.repeat(17000)},{id:'q',type:'paragraph',text:'可以完成深入检查的短段落。'}],active:true});s.setLevel(4)
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(3);expect(states.at(-1)).toMatchObject({pending:2,phase:'limited'});s.dispose()
})
it('does not let an old in-flight supplement consume or complete the edited text allowance',async()=>{
 vi.useFakeTimers();let finish!:(value:any)=>void,calls=0
 const run=vi.fn((_request:ChallengeRequest)=>++calls===2?new Promise<any>(resolve=>{finish=resolve}):Promise.resolve(partial)),onResult=vi.fn(),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(8001);expect(run).toHaveBeenCalledTimes(2)
 s.update({title:'',blocks:blocks('补查期间编辑的新正文。'),active:true});finish(result);await vi.advanceTimersByTimeAsync(60000)
 expect(run).toHaveBeenCalledTimes(5);expect(onResult).toHaveBeenCalledTimes(4);expect(run.mock.calls.slice(2).every(([request])=>request.blocks[0]!.text==='补查期间编辑的新正文。')).toBe(true)
 expect(s.retryState().entries[0]?.attempts).toBe(2);s.dispose()
})
it.each(['rejected','unavailable'] as const)('does not repeatedly reopen an unchanged initial %s failure',async outcome=>{
 vi.useFakeTimers();const run=vi.fn(async()=>{if(outcome==='rejected')throw Error('provider unavailable');return{...partial,coveredBlockIds:[]}}),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(2000);const saved=s.retryState();expect(saved.entries[0]).toMatchObject({id:'p',attempts:0,blocked:true});s.dispose()
 const reopened=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()});reopened.update({title:'',blocks:blocks(),active:false});reopened.setLevel(4);reopened.restoreCoverage([],[],[],saved);reopened.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledOnce();reopened.dispose()
})
it('uses only the bounded legacy allowance for malformed private retry metadata',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>partial),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:false});s.setLevel(4);const bad={...s.retryState(),entries:[{id:'p',attempts:-1,notBefore:NaN,blocked:false}],usage:'untrusted'}
 s.restoreCoverage(['p'],partial.checks,[],bad);s.update({title:'',blocks:blocks(),active:true});await vi.advanceTimersByTimeAsync(1200000)
 expect(run).toHaveBeenCalledTimes(2);expect(s.retryState().entries[0]?.attempts).toBe(2);s.dispose()
})

const researchDocument=(text='预计2026年EPS为76元，12%阈值用于本报告。')=>[
 {id:'header',type:'paragraph',text:'研究标的：贵州茅台（600519.SH）。报告基准日：2026年10月20日。'},
 {id:'policy',type:'paragraph',text:'一致预期偏离阈值：12%。一致预期统计周期：180天。'},
 {id:'business',type:'paragraph',text:'公司主营高端消费产品。'},
 {id:'channel',type:'paragraph',text:'渠道价格需要跟踪验证。'},
 {id:'forecast',type:'paragraph',text},
 {id:'risk',type:'paragraph',text:'消费需求仍有不确定性。'}
]
it.each(['预计2026年EPS为76元，12%阈值用于本报告。','预计2027年EPS为76元。'])('retains exact distant research metadata on both supplements for %s',async text=>{
 vi.useFakeTimers();const {extractConsensusClaims,consensusPolicyFromBlocks}=await import(new URL('../packages/dsh-research-task-runtime/notes-challenge-consensus.js',import.meta.url).href)
 const document=researchDocument(text),run=vi.fn(async(_request:ChallengeRequest)=>({...partial,coveredBlockIds:['forecast']})),onResult=vi.fn(),s=new NoteChallengeScheduler({sessionId:'s',run,onResult})
 s.update({title:'研究记录',blocks:document,active:false});s.setLevel(4);s.restoreCoverage(document.map(b=>b.id),[],document.filter(b=>b.id!=='forecast').map(b=>b.id));s.update({title:'研究记录',blocks:document,active:true})
 await vi.advanceTimersByTimeAsync(18002);expect(run).toHaveBeenCalledTimes(2)
 for(const [request] of run.mock.calls){
  expect(request.changedIds).toEqual(['forecast']);expect(request.blocks.filter(b=>['header','policy'].includes(b.id))).toEqual(document.slice(0,2))
  expect(extractConsensusClaims(request.blocks)).toEqual([expect.objectContaining({blockId:'forecast',windCode:'600519.SH',baseDate:'20261020',year:text.includes('2027')?2027:2026,value:76})])
  expect(consensusPolicyFromBlocks(request.blocks)).toEqual({threshold:.12,cycle:'263003000'})
 }
 expect(onResult.mock.calls.every(([response])=>response.coveredBlockIds.join(',')==='forecast')).toBe(true)
 expect(s.retryState().usage.map(v=>v.chars)).toEqual(run.mock.calls.map(([request])=>request.blocks.reduce((sum,block)=>sum+block.text.length,0)))
 await vi.advanceTimersByTimeAsync(1200000);expect(run).toHaveBeenCalledTimes(2);s.dispose()
})
it('preserves every conflicting explicit metadata paragraph instead of choosing a default policy',async()=>{
 vi.useFakeTimers();const {consensusPolicyFromBlocks}=await import(new URL('../packages/dsh-research-task-runtime/notes-challenge-consensus.js',import.meta.url).href)
 const document=[...researchDocument(),{id:'other-policy',type:'paragraph',text:'一致预期偏离阈值：20%。一致预期统计周期：90天。'}],run=vi.fn(async(_request:ChallengeRequest)=>({...partial,coveredBlockIds:['forecast']})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'研究记录',blocks:document,active:false});s.setLevel(4);s.restoreCoverage(document.map(b=>b.id),[],document.filter(b=>b.id!=='forecast').map(b=>b.id));s.update({title:'研究记录',blocks:document,active:true});await vi.advanceTimersByTimeAsync(18002)
 expect(run).toHaveBeenCalledTimes(2);for(const [request] of run.mock.calls){expect(request.blocks).toContainEqual(document.at(-1));expect(()=>consensusPolicyFromBlocks(request.blocks)).toThrow(/冲突/)}s.dispose()
})
it.each(['characters','blocks','oversized'] as const)('fails closed when exact research metadata cannot fit the %s capacity',async limit=>{
 vi.useFakeTimers();let document=researchDocument()
 if(limit==='characters'){document[0]!.text+='甲'.repeat(10000);document[1]!.text+='乙'.repeat(3000);document[4]!.text+='丙'.repeat(4000)}
 if(limit==='blocks')document=[...document,...Array.from({length:24},(_,n)=>({id:'metadata-'+n,type:'paragraph',text:'报告基准日：2026年10月20日。'}))]
 if(limit==='oversized')document[0]!.text+='甲'.repeat(12000)
 const source=JSON.stringify(document),run=vi.fn(async()=>({...result,coveredBlockIds:['forecast'],completeBlockIds:['forecast']})),onResult=vi.fn(),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult,onState:value=>states.push(value)})
 s.update({title:'研究记录',blocks:document,active:false});s.setLevel(4);s.restoreCoverage(document.map(b=>b.id),[],document.filter(b=>b.id!=='forecast').map(b=>b.id));s.update({title:'研究记录',blocks:document,active:true});await vi.advanceTimersByTimeAsync(1200000)
 expect(run).not.toHaveBeenCalled();expect(onResult).not.toHaveBeenCalled();expect(states.at(-1)).toMatchObject({phase:'limited',pending:1});expect(states.at(-1).checks).toContainEqual(expect.objectContaining({kind:'coverage',status:'partial',detail:expect.stringContaining('研究元数据')}));expect(JSON.stringify(document)).toBe(source);s.dispose()
})
it('reserves whole metadata before filling ordinary batches without duplicating blocks or charging free context',async()=>{
 vi.useFakeTimers();const metadata=researchDocument().slice(0,2),document=[...Array.from({length:30},(_,n)=>({id:'body-'+n,type:'paragraph',text:'待校验正文第'+n+'段。'})),...metadata],run=vi.fn(async(request:ChallengeRequest)=>({...result,coveredBlockIds:request.changedIds!,completeBlockIds:request.changedIds!})),s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn()})
 s.update({title:'研究记录',blocks:document,active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(10000);expect(run).toHaveBeenCalledTimes(2)
 for(const [request] of run.mock.calls){expect(request.blocks).toEqual(expect.arrayContaining(metadata));expect(request.blocks.length).toBeLessThanOrEqual(24);expect(new Set(request.blocks.map(b=>b.id)).size).toBe(request.blocks.length)}
 expect(s.retryState().usage.map(v=>v.chars)).toEqual(run.mock.calls.map(([request])=>request.blocks.reduce((sum,block)=>sum+block.text.length,0)));s.dispose()
})
it('does not restore another session rolling ledger into this note',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>result),s=new NoteChallengeScheduler({sessionId:'other',run,onResult:vi.fn()})
 s.update({title:'',blocks:blocks(),active:false});s.setLevel(4);s.restoreUsage({version:1,sessionId:'original',usage:[{at:Date.now(),chars:100,input:40000,output:1}]});s.update({title:'',blocks:blocks(),active:true})
 await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledOnce();s.dispose()
})
it('does not replace resident reserved usage with an empty restored ledger after editing',async()=>{
 vi.useFakeTimers();const run=vi.fn(async()=>({...result,usage:{inputTokens:40000,outputTokens:1}})),states:any[]=[],s=new NoteChallengeScheduler({sessionId:'s',run,onResult:vi.fn(),onState:value=>states.push(value)})
 s.update({title:'',blocks:blocks(),active:true});s.setLevel(4);await vi.advanceTimersByTimeAsync(2000)
 s.update({title:'',blocks:blocks('新正文不应获得额外额度。'),active:true});s.restoreUsage({version:1,sessionId:'s',usage:[]})
 await vi.advanceTimersByTimeAsync(120000);expect(run).toHaveBeenCalledOnce();expect(states.at(-1).phase).toBe('limited');expect(s.usageState().usage[0]?.input).toBe(40000);s.dispose()
})
