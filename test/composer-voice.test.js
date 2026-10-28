import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {createComposerVoiceSession} from '../scripts/lib/composer-voice.mjs'
const clean=[]
afterEach(async()=>{for(const stop of clean.splice(0).reverse())await stop()})
function fixture(){
 const win=new Window(),doc=win.document;doc.body.innerHTML='<textarea></textarea><button>其它控件</button>'
 const input=doc.querySelector('textarea'),listeners=new Set(),subscribers=new Set(),states=[],errors=[];let snapshot={draft:'',draftRev:0,imageIds:[],phase:'plain'},blocked=false,composing=false
 const keyboard={disposed:false,get snapshot(){return snapshot},state:{subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)}},setDraft:vi.fn(text=>{snapshot={...snapshot,draft:text,draftRev:snapshot.draftRev+1};for(const fn of subscribers)fn()}),submit:vi.fn()}
 const bridge={startComposer:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true})),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}}
 const voice=createComposerVoiceSession({bridge,keyboard,input:()=>input,blocked:()=>blocked,composing:()=>composing,document:doc,onChange:state=>states.push(state),onError:error=>errors.push(error)})
 clean.push(async()=>{voice.dispose();await win.happyDOM.close()})
 const event=(type,extra={})=>{const e=new win.KeyboardEvent('keydown',{key:type,bubbles:true,cancelable:true,...extra});input.dispatchEvent(e);return e}
 const request=()=>bridge.startComposer.mock.calls.at(-1)?.[0]
 const emit=(value,id=request())=>{for(const fn of [...listeners])fn({...id,...value})}
 return{win,doc,input,voice,keyboard,bridge,states,errors,event,request,emit,snapshot:()=>snapshot,block:()=>{blocked=true;voice.reconcile()},compose:()=>{composing=true}}
}
it('writes cumulative partial/final through the controlled draft once and uses only actual levels',async()=>{
 const f=fixture();await f.voice.start();expect(f.doc.activeElement).toBe(f.input)
 f.emit({type:'partial',text:'今天'});f.emit({type:'partial',text:'今天研究'});f.emit({type:'partial',text:'今天研究'})
 expect(f.snapshot().draft).toBe('今天研究');expect(f.keyboard.setDraft).toHaveBeenCalledTimes(2)
 f.emit({type:'level',level:.7});expect(f.states.at(-1).levels.at(-1)).toBe(.7)
 f.emit({type:'level',level:NaN});expect(f.states.at(-1).levels.at(-1)).toBe(.7)
 f.emit({type:'final',text:'今天研究市场'});expect(f.snapshot().draft).toBe('今天研究市场');expect(f.states.at(-1).active).toBe(false);expect(f.keyboard.submit).not.toHaveBeenCalled()
})
it.each(['x','ArrowLeft','Tab','Escape','Shift'])('stops on %s while preserving the key and latest transcript',async key=>{
 const f=fixture();await f.voice.start();const id=f.request();f.emit({type:'partial',text:'已识别'})
 expect(f.event(key).defaultPrevented).toBe(false);expect(f.states.at(-1).active).toBe(false);expect(f.bridge.cancel).toHaveBeenCalledWith(id)
 f.emit({type:'final',text:'迟到覆盖'},id);expect(f.snapshot().draft).toBe('已识别')
})
it('consumes only the first non-IME Enter and lets composition commit normally',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'不要误发'});expect(f.event('Enter').defaultPrevented).toBe(true);expect(f.event('Enter').defaultPrevented).toBe(false)
 f.keyboard.setDraft('');await f.voice.start();f.compose();expect(f.event('Enter',{isComposing:true,keyCode:229}).defaultPrevented).toBe(false);expect(f.states.at(-1).active).toBe(false)
})
it('keeps Shift+Enter available for a normal newline while stopping recognition',async()=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'正文'})
 expect(f.event('Enter',{shiftKey:true}).defaultPrevented).toBe(false)
 expect(f.states.at(-1).active).toBe(false)
})
it.each(['Meta','Control','Alt'])('guards only the interrupted %s gesture through Enter or its release',async modifier=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'保留正文'})
 expect(f.event(modifier).defaultPrevented).toBe(false);expect(f.states.at(-1).active).toBe(false)
 expect(f.event('Enter',{[modifier==='Meta'?'metaKey':modifier==='Control'?'ctrlKey':'altKey']:true}).defaultPrevented).toBe(true)
 expect(f.event('Enter').defaultPrevented).toBe(false)
 f.keyboard.setDraft('');await f.voice.start();f.event(modifier)
 f.input.dispatchEvent(new f.win.KeyboardEvent('keyup',{key:modifier,bubbles:true}));expect(f.event('Enter').defaultPrevented).toBe(false)
 f.keyboard.setDraft('');await f.voice.start();f.event(modifier);expect(f.event('ArrowLeft').defaultPrevented).toBe(false);expect(f.event('Enter').defaultPrevented).toBe(false)
})
it('keeps Shift newlines and IME commits after modifier cancellation, and clears interrupted gestures on restart, blur and disposal',async()=>{
 const f=fixture()
 for(const action of ['shift','ime','restart','blur','dispose']){
  f.keyboard.setDraft('');await f.voice.start();f.event('Meta')
  if(action==='restart'){await f.voice.start();f.voice.stop()}
  if(action==='blur'){f.doc.querySelector('button').focus();f.input.focus()}
  if(action==='dispose')f.voice.dispose()
  expect(f.event('Enter',action==='shift'?{shiftKey:true}:action==='ime'?{isComposing:true,keyCode:229}:{}).defaultPrevented).toBe(false)
 }
})
it.each(['Meta','Control'])('restores Enter after window blur swallows the interrupted %s keyup',async modifier=>{
 const f=fixture();await f.voice.start();f.emit({type:'partial',text:'返回窗口继续发送'});f.event(modifier)
 f.win.dispatchEvent(new f.win.Event('blur'));f.win.dispatchEvent(new f.win.Event('focus'))
 expect(f.doc.activeElement).toBe(f.input);expect(f.event('Enter').defaultPrevented).toBe(false)
 expect(f.snapshot().draft).toBe('返回窗口继续发送');expect(f.bridge.cancel).toHaveBeenCalledTimes(1)
})
it('clears pending caret work on window blur without cancelling authorization, and removes the listener on disposal',async()=>{
 const f=fixture();let frame
 vi.spyOn(f.win,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 42})
 const cancelFrame=vi.spyOn(f.win,'cancelAnimationFrame'),selection=vi.spyOn(f.input,'setSelectionRange')
 await f.voice.start();f.win.dispatchEvent(new f.win.Event('blur'))
 expect(f.states.at(-1)).toMatchObject({active:true,state:'authorizing'});expect(f.bridge.cancel).not.toHaveBeenCalled()
 f.emit({type:'partial',text:'保留转写'});f.input.value=f.snapshot().draft
 f.win.dispatchEvent(new f.win.Event('blur'));frame()
 expect(selection).not.toHaveBeenCalled();expect(f.bridge.cancel).not.toHaveBeenCalled();expect(f.states.at(-1).active).toBe(true)
 f.voice.dispose();cancelFrame.mockClear();f.win.dispatchEvent(new f.win.Event('blur'));expect(cancelFrame).not.toHaveBeenCalled()
})
it.each(['blur','blocked','foreign-write','hidden','removed','dispose'])('revokes on %s before late callbacks can change the draft',async reason=>{
 const f=fixture();await f.voice.start();const id=f.request();f.emit({type:'partial',text:'保留转写'})
 if(reason==='blur')f.doc.querySelector('button').focus()
 if(reason==='blocked')f.block()
 if(reason==='foreign-write')f.keyboard.setDraft('手动编辑')
 if(reason==='hidden')f.input.hidden=true
 if(reason==='removed')f.input.remove()
 if(reason==='dispose')f.voice.dispose()
 f.emit({type:'partial',text:'迟到识别'},id);f.emit({type:'final',text:'迟到完成'},id)
 expect(f.snapshot().draft).toBe(reason==='foreign-write'?'手动编辑':'保留转写');expect(f.bridge.cancel).toHaveBeenCalledWith(id)
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
