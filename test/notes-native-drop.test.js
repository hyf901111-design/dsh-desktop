import {afterAll, beforeAll, expect, it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {execFileSync} from 'node:child_process'
import {createSourceFile, ScriptTarget, ScriptKind, forEachChild, isCallExpression, isArrowFunction} from 'typescript'

let source, effect
const windows=[]
beforeAll(async()=>{
  source=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripConversationGridOverlays}from'./test/fixtures/strip-conversation-transient-ui.mjs';import{stripPlainSlashInput}from'./scripts/lib/plain-slash-input.mjs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';import{stripHomeGuideNative}from'./scripts/lib/home-guide-native.mjs';import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';import{patchNotesComposer}from'./scripts/lib/notes-composer.mjs';let source=stripConversationGridOverlays(readFileSync(0,'utf8'));for(const patch of [stripPlainSlashInput,stripSidebarNewNoteConversation,stripPptxAnnotationMessages,stripPptxAnnotationInput,stripHomeGuidePresentationNative,stripHomeGuideNative,patchNotesComposer])source=patch(source);process.stdout.write(source)"],{input:await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),encoding:'utf8',maxBuffer:64*1024*1024})
  const tree=createSourceFile('conversation.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
  const visit=node=>{
    const callback=isCallExpression(node)&&node.arguments[0]
    if(callback&&isArrowFunction(callback)&&node.expression.getText(tree).includes('useEffect')){
      const text=callback.getText(tree)
      if(text.includes('dragDepthRef.current')&&text.includes('intakeImages'))effect=text
    }
    forEachChild(node,visit)
  }
  visit(tree)
  if(!effect)throw Error('Native InputBar image-drop effect was not found')
})
afterAll(async()=>{for(const window of windows)await window.happyDOM.close()})

function fixture(canAcceptDrop=true,ownerName='data-note-file-drop-owner'){
  const window=new Window({url:'https://notes.local/'}),document=window.document
  windows.push(window)
  document.body.innerHTML='<section id="outside"></section><main '+ownerName+'><span id="note"></span></main>'
  const owner=document.querySelector('main'),note=document.querySelector('#note'),outside=document.querySelector('#outside')
  // The editor owns these events before they reach document-level bubble handlers.
  for(const type of ['dragover','drop'])owner.addEventListener(type,event=>{event.preventDefault();event.stopPropagation()},true)
  const dragDepthRef={current:0},states=[],images=[]
  let active=false
  const cleanup=runInNewContext('('+effect+')()',{
    window,document,dragDepthRef,canAcceptDrop,
    setDragActive:value=>{active=value;states.push(value)},
    intakeImages:files=>images.push(files)
  })
  const transfer={types:['Files'],files:[new window.File(['image'],'draft.png',{type:'image/png'})],dropEffect:'none'}
  const dispatch=(target,type,dataTransfer=transfer,point={x:120,y:90})=>{
    const event=new window.Event(type,{bubbles:true,cancelable:true})
    Object.defineProperties(event,{dataTransfer:{value:dataTransfer},clientX:{value:point.x},clientY:{value:point.y}})
    target.dispatchEvent(event)
    return event
  }
  return {window,document,note,outside,transfer,dispatch,states,images,depth:()=>dragDepthRef.current,active:()=>active,cleanup}
}

it('never activates the native image overlay for a file entering the notes owner',()=>{
  const f=fixture()
  f.dispatch(f.note,'dragenter')
  f.dispatch(f.note,'dragover')
  expect(f.active()).toBe(false)
  expect(f.states).not.toContain(true)
  expect(f.depth()).toBe(0)
  f.dispatch(f.note,'drop')
  expect(f.images).toEqual([])
  f.cleanup()
})

it('clears an outside image drag when it enters notes and survives a stopped drop',()=>{
  const f=fixture()
  f.dispatch(f.outside,'dragenter')
  expect(f.active()).toBe(true)
  f.dispatch(f.note,'dragenter')
  expect(f.active()).toBe(false)
  f.dispatch(f.note,'dragover')
  f.dispatch(f.note,'drop')
  expect(f.active()).toBe(false)
  expect(f.depth()).toBe(0)
  expect(f.images).toEqual([])
  f.cleanup()
})

it.each(['data-note-file-drop-owner','data-knowledge-file-drop-owner'])('clears an outside overlay on %s dragover without a new dragenter',attribute=>{
  const f=fixture(true,attribute)
  f.dispatch(f.outside,'dragenter')
  expect(f.active()).toBe(true)
  f.dispatch(f.note,'dragover')
  expect(f.active()).toBe(false)
  expect(f.depth()).toBe(0)
  expect(f.images).toEqual([])
  f.cleanup()
})

it('resets on window drop capture before the notes owner stops document propagation',()=>{
  const f=fixture()
  f.window.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation()},true)
  f.dispatch(f.outside,'dragenter')
  expect(f.active()).toBe(true)
  f.dispatch(f.note,'drop')
  expect(f.active()).toBe(false)
  expect(f.depth()).toBe(0)
  expect(f.images).toEqual([])
  f.cleanup()
})

it('still admits an ordinary native image drop once through the bubble handler',()=>{
  const f=fixture()
  f.dispatch(f.outside,'dragenter')
  expect(f.active()).toBe(true)
  f.dispatch(f.outside,'dragover')
  expect(f.transfer.dropEffect).toBe('copy')
  expect(f.dispatch(f.outside,'drop').defaultPrevented).toBe(true)
  expect(f.images).toHaveLength(1)
  expect(f.images[0]).toEqual(f.transfer.files)
  expect(f.active()).toBe(false)
  expect(f.depth()).toBe(0)
  f.cleanup()
})

it('keeps a blocked native image drop blocked while clearing its overlay',()=>{
  const f=fixture(false)
  f.dispatch(f.outside,'dragenter')
  f.dispatch(f.outside,'dragover')
  expect(f.transfer.dropEffect).toBe('none')
  f.dispatch(f.outside,'drop')
  expect(f.images).toEqual([])
  expect(f.active()).toBe(false)
  f.cleanup()
})

it.each(['dragend','blur','escape','viewport-leave'])('clears the native overlay on %s after cancellation',kind=>{
  const f=fixture()
  f.dispatch(f.outside,'dragenter')
  expect(f.active()).toBe(true)
  if(kind==='viewport-leave')f.dispatch(f.document.documentElement,'dragleave',{types:[],files:[]},{x:0,y:0})
  else if(kind==='escape')f.document.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
  else f.window.dispatchEvent(new f.window.Event(kind))
  expect(f.active()).toBe(false)
  expect(f.depth()).toBe(0)
  expect(f.images).toEqual([])
  f.cleanup()
})

it('does not claim text drags and releases all listeners on effect cleanup',()=>{
  const f=fixture()
  const text={types:['text/plain'],files:[],dropEffect:'none'}
  expect(f.dispatch(f.outside,'dragenter',text).defaultPrevented).toBe(false)
  expect(f.active()).toBe(false)
  f.dispatch(f.outside,'dragenter')
  f.cleanup()
  expect(f.active()).toBe(false)
  const count=f.states.length
  f.dispatch(f.outside,'dragenter')
  f.dispatch(f.outside,'drop')
  f.window.dispatchEvent(new f.window.Event('blur'))
  expect(f.states).toHaveLength(count)
  expect(f.images).toEqual([])
})

it('keeps the native composer patch repeatable under the production Node serializer',()=>{
 const result=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripConversationGridOverlays}from'./test/fixtures/strip-conversation-transient-ui.mjs';import{patchNotesComposer}from'./scripts/lib/notes-composer.mjs';const source=stripConversationGridOverlays(readFileSync(0,'utf8'));if(patchNotesComposer(source)!==source)throw Error('Native Notes second pass changed bytes');process.stdout.write('same')"],{input:source,encoding:'utf8',maxBuffer:64*1024*1024})
 expect(result).toBe('same')
})
