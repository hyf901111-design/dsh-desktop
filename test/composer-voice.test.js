import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {createComposerVoiceSession} from '../scripts/lib/composer-voice.mjs'
const clean=[]
afterEach(async()=>{for(const stop of clean.splice(0).reverse())await stop()})
function fixture(syncInput=true){
 const win=new Window(),doc=win.document;doc.body.innerHTML='<textarea></textarea><button>其它控件</button>'
 const input=doc.querySelector('textarea'),listeners=new Set(),subscribers=new Set(),states=[],errors=[];let snapshot={draft:'',draftRev:0,imageIds:[],phase:'plain'},blocked=false,composing=false
 const keyboard={disposed:false,get snapshot(){return snapshot},state:{subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)}},setDraft:vi.fn(text=>{if(syncInput)input.value=text;snapshot={...snapshot,draft:text,draftRev:snapshot.draftRev+1};for(const fn of subscribers)fn()}),submit:vi.fn()}
 const bridge={startComposer:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true})),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}}
 const voice=createComposerVoiceSession({bridge,keyboard,input:()=>input,blocked:()=>blocked,composing:()=>composing,document:doc,onChange:state=>states.push(state),onError:error=>errors.push(error)})
 clean.push(async()=>{voice.dispose();await win.happyDOM.close()})
 const event=(type,extra={})=>{const e=new win.KeyboardEvent('keydown',{key:type,bubbles:true,cancelable:true,...extra});input.dispatchEvent(e);return e}
 const edit=(text,trusted=true)=>{const event=new win.InputEvent('input',{bubbles:true,inputType:'insertText'});Object.defineProperty(event,'isTrusted',{value:trusted});input.value=text;input.dispatchEvent(event);keyboard.setDraft(text)}
 const request=()=>bridge.startComposer.mock.calls.at(-1)?.[0]
 const emit=(value,id=request())=>{for(const fn of [...listeners])fn({...id,...value})}
 return{win,doc,input,voice,keyboard,bridge,states,errors,event,edit,request,emit,snapshot:()=>snapshot,block:()=>{blocked=true;voice.reconcile()},compose:()=>{composing=true}}
}
it('writes cumulative partial/final through the controlled draft once and uses only actual levels',async()=>{
 const f=fixture();await f.voice.start();expect(f.doc.activeElement).toBe(f.input)
 f.emit({type:'partial',text:'今天'});f.emit({type:'partial',text:'今天研究'});f.emit({type:'partial',text:'今天研究'})
 expect(f.snapshot().draft).toBe('今天研究');expect(f.keyboard.setDraft).toHaveBeenCalledTimes(2)
 f.emit({type:'level',level:.7});expect(f.states.at(-1).levels.at(-1)).toBe(.7)
 f.emit({type:'level',level:NaN});expect(f.states.at(-1).levels.at(-1)).toBe(.7)
 f.emit({type:'final',text:'今天研究市场'});expect(f.snapshot().draft).toBe('今天研究市场');expect(f.states.at(-1).active).toBe(false);expect(f.keyboard.submit).not.toHaveBeenCalled()
})
it.each(['x','ArrowLeft','Tab','Shift','Meta','Control','Alt'])('keeps recording through %s and accepts later partials',async key=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'已识别'})
 expect(f.event(key).defaultPrevented).toBe(false);f.emit({type:'partial',text:'已识别的新文字'})
 expect(f.states.at(-1).active).toBe(true);expect(f.snapshot().draft).toBe('已识别的新文字');expect(f.bridge.cancel).not.toHaveBeenCalled()
})
it('consumes Escape and rejects late callbacks after explicit stop',async()=>{
 const f=fixture();await f.voice.start();const id=f.request();f.emit({type:'partial',text:'已识别'})
 expect(f.event('Escape').defaultPrevented).toBe(true);expect(f.states.at(-1).active).toBe(false);expect(f.bridge.cancel).toHaveBeenCalledWith(id)
 f.emit({type:'final',text:'迟到覆盖'},id);expect(f.snapshot().draft).toBe('已识别')
})
it('guards every ordinary and accelerated Enter without stopping, while allowing Shift and IME commits',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'不要误发'})
 for(const extra of [{},{},{metaKey:true},{ctrlKey:true}])expect(f.event('Enter',extra).defaultPrevented).toBe(true)
 expect(f.event('Enter',{shiftKey:true}).defaultPrevented).toBe(false);f.compose();expect(f.event('Enter',{isComposing:true,keyCode:229}).defaultPrevented).toBe(false)
 expect(f.states.at(-1).active).toBe(true);expect(f.bridge.cancel).not.toHaveBeenCalled();expect(f.keyboard.submit).not.toHaveBeenCalled()
})
it('continues after input and window blur without taking focus back',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'原文'});f.doc.querySelector('button').focus();f.win.dispatchEvent(new f.win.Event('blur'))
 f.emit({type:'partial',text:'原文继续'});expect(f.snapshot().draft).toBe('原文继续');expect(f.doc.activeElement).toBe(f.doc.querySelector('button'));expect(f.states.at(-1).active).toBe(true);expect(f.bridge.cancel).not.toHaveBeenCalled()
})
it('keeps user additions around the owned span while replacing cumulative speech only once',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'你好世界'})
 f.edit('前言你好世界');f.edit('前言你好世界备注');f.emit({type:'partial',text:'你好世界和平'});f.emit({type:'partial',text:'你好世界和平'})
 expect(f.snapshot().draft).toBe('前言你好世界和平备注');expect(f.states.at(-1).active).toBe(true)
})
it('keeps edits before an intact voice span and preserves its correction ownership',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'今天研究'})
 f.edit('前言今天研究');f.emit({type:'partial',text:'今天研究市场'})
 expect(f.snapshot().draft).toBe('前言今天研究市场')
})
it('does not resurrect user-deleted speech or duplicate a repeated cumulative final',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'你好世界'})
 f.edit('你好');f.emit({type:'partial',text:'你好世界和平'});expect(f.snapshot().draft).toBe('你好和平')
 f.emit({type:'partial',text:'你好世界和平'});f.emit({type:'final',text:'你好世界和平'});expect(f.snapshot().draft).toBe('你好和平');expect(f.states.at(-1).active).toBe(false)
})
it('preserves a manual replacement when ASR rewrites earlier wording at the same time',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'你好世界'})
 f.edit('您好世界');f.emit({type:'partial',text:'你好，世界和平'});f.emit({type:'partial',text:'你好，世界和平'})
 expect(f.snapshot().draft).toBe('您好世界和平');expect(f.states.at(-1).active).toBe(true)
})
it('never revives deleted words after a shorter or ambiguously punctuated ASR revision',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'你好世界'});f.edit('你好')
 f.emit({type:'partial',text:'你好'});f.emit({type:'partial',text:'你好世，界和平'});expect(f.snapshot().draft).toBe('你好')
 f.emit({type:'partial',text:'你好世界和平'});expect(f.snapshot().draft).toBe('你好和平')
})
it('retains ownership of appended speech across an ambiguous ASR rewrite',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'你好世界'});f.edit('你好')
 f.emit({type:'partial',text:'你好世界和平'});f.emit({type:'partial',text:'你好世，界和平'});expect(f.snapshot().draft).toBe('你好和平')
 f.emit({type:'partial',text:'你好世界和平万岁'});expect(f.snapshot().draft).toBe('你好和平万岁')
})
it('lets a final result settle without moving a caret changed after natural completion',async()=>{
 const f=fixture(false);let frame;vi.spyOn(f.win,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 42})
 await f.voice.start();f.emit({type:'partial',text:'正文'});f.input.value='正文';frame();f.emit({type:'final',text:'正文续'});f.input.value='正文续'
 f.event('ArrowLeft');f.input.setSelectionRange(2,2);frame();expect(f.input.selectionStart).toBe(2)
})
it('buffers partial/final through IME until the final input commits',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'原文'})
 f.input.dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));f.edit('原文候选')
 f.emit({type:'partial',text:'原文继续'});f.emit({type:'final',text:'原文继续完成'});expect(f.snapshot().draft).toBe('原文候选');expect(f.states.at(-1).active).toBe(true)
 f.input.dispatchEvent(new f.win.CompositionEvent('compositionend',{bubbles:true}));f.edit('原文中文')
 await new Promise(resolve=>f.win.setTimeout(resolve,25));expect(f.snapshot().draft).toBe('原文继续完成中文');expect(f.states.at(-1).active).toBe(false)
})
it('keeps the newest transcript during the composition-end settling task',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'原文'})
 f.input.dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));f.edit('原文中文');f.emit({type:'partial',text:'原文继续'})
 f.input.dispatchEvent(new f.win.CompositionEvent('compositionend',{bubbles:true}));f.emit({type:'partial',text:'原文继续完成'})
 await new Promise(resolve=>f.win.setTimeout(resolve,25));expect(f.snapshot().draft).toBe('原文继续完成中文');expect(f.states.at(-1).active).toBe(true)
})
it('never moves a manually positioned selection for later speech or pending caret frames',async()=>{
 const f=fixture();let frame;vi.spyOn(f.win,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 42})
 await f.voice.start();f.emit({type:'partial',text:'语音正文'});f.input.value=f.snapshot().draft;f.event('ArrowLeft');f.input.setSelectionRange(1,1)
 frame();f.emit({type:'partial',text:'语音正文继续'});f.input.value=f.snapshot().draft;frame()
 expect(f.input.selectionStart).toBe(1);expect(f.states.at(-1).active).toBe(true)
})
it('clears pending caret work on window blur without cancelling authorization, and removes the listener on disposal',async()=>{
 const f=fixture();let frame
 vi.spyOn(f.win,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 42})
 const cancelFrame=vi.spyOn(f.win,'cancelAnimationFrame'),selection=vi.spyOn(f.input,'setSelectionRange')
 await f.voice.start();f.win.dispatchEvent(new f.win.Event('blur'))
 expect(f.states.at(-1)).toMatchObject({active:true,state:'authorizing'});expect(f.bridge.cancel).not.toHaveBeenCalled()
 f.emit({type:'partial',text:'保留转写'});f.input.value=f.snapshot().draft
 f.win.dispatchEvent(new f.win.Event('blur'));frame?.()
 expect(selection).not.toHaveBeenCalled();expect(f.bridge.cancel).not.toHaveBeenCalled();expect(f.states.at(-1).active).toBe(true)
 f.voice.dispose();cancelFrame.mockClear();f.win.dispatchEvent(new f.win.Event('blur'));expect(cancelFrame).not.toHaveBeenCalled()
})
it.each(['blocked','foreign-write','untrusted-edit','hidden','removed','dispose'])('revokes on %s before late callbacks can change the draft',async reason=>{
 const f=fixture();await f.voice.start();const id=f.request();f.emit({type:'partial',text:'保留转写'})
 if(reason==='blocked')f.block()
 if(reason==='foreign-write')f.keyboard.setDraft('手动编辑')
 if(reason==='untrusted-edit')f.edit('手动编辑',false)
 if(reason==='hidden')f.input.hidden=true
 if(reason==='removed')f.input.remove()
 if(reason==='dispose')f.voice.dispose()
 f.emit({type:'partial',text:'迟到识别'},id);f.emit({type:'final',text:'迟到完成'},id)
 expect(f.snapshot().draft).toBe(['foreign-write','untrusted-edit'].includes(reason)?'手动编辑':'保留转写');expect(f.bridge.cancel).toHaveBeenCalledWith(id)
})
it('cancels a late start acknowledgement by its exact ID without cancelling the next request',async()=>{
 const f=fixture();let release;f.bridge.startComposer.mockImplementationOnce(()=>new Promise(resolve=>release=resolve))
 const pending=f.voice.start(),old=f.request();f.voice.stop();await f.voice.start();const current=f.request();release({ok:true});await pending
 f.emit({type:'partial',text:'旧回调'},old);expect(f.snapshot().draft).toBe('')
 f.emit({type:'partial',text:'新录音'},current);expect(f.snapshot().draft).toBe('新录音');expect(f.states.at(-1).active).toBe(true)
 expect(f.bridge.cancel.mock.calls.every(([value])=>value.requestId===old.requestId)).toBe(true)
})
it('reports denied/unavailable starts inline and can retry without losing text',async()=>{
 const f=fixture();f.bridge.startComposer.mockResolvedValueOnce({ok:false,error:'请允许麦克风'})
 await f.voice.start();expect(f.errors).toEqual(['请允许麦克风']);expect(f.states.at(-1).active).toBe(false)
 await f.voice.start();f.emit({type:'partial',text:'重试文字'});f.voice.stop();expect(f.snapshot().draft).toBe('重试文字')
})
it('does not begin over existing typed text',async()=>{
 const f=fixture();f.keyboard.setDraft('原文');await f.voice.start();expect(f.bridge.startComposer).not.toHaveBeenCalled()
})
