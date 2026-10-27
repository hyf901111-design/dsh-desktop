import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {annotationMessageFixture} from './fixtures/pptx-annotation-message.js'
const req=createRequire(import.meta.url)
let api={};try{api=req('../scripts/lib/pptx-annotation-message.mjs')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
const request=value=>api.pptxAnnotationMessageRequest?.(value.text,value.sessionId,{kind:'user',rpcId:value.rpcId},9)
const project=(input,value)=>api.pptxAnnotationMessageSegments?.(input,value)
const windows=[];afterEach(()=>{windows.splice(0).forEach(w=>w.happyDOM.abort());vi.unstubAllGlobals()})
it('requests only a unique prepared hint with actual durable native session, seq and human RPC',()=>{
 const value=annotationMessageFixture()
 expect(request(value)).toEqual({sendingSessionId:value.sessionId,preparedId:value.proof.preparedId,userSeq:9,submissionId:value.rpcId,text:value.text})
 for(const [text,session,source,seq]of [[value.text,'',{kind:'user',rpcId:value.rpcId},9],[value.text,value.sessionId,{kind:'plugin',rpcId:value.rpcId},9],[value.text,value.sessionId,{kind:'user'},9],[value.text,value.sessionId,{kind:'user',rpcId:value.rpcId},undefined],['用户自己写的内容',value.sessionId,{kind:'user',rpcId:value.rpcId},9],[value.text+'\n修改清单：`.ework/pptx-annotations/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/manifest.json`',value.sessionId,{kind:'user',rpcId:value.rpcId},9]])expect(api.pptxAnnotationMessageRequest?.(text,session,source,seq)).toBeNull()
})
it('replaces only authenticated exact UTF16 spans and retains every authored character around them',()=>{
 const value=annotationMessageFixture(),before=JSON.stringify(value.proof),parts=project(request(value),value.proof)
 expect(parts?.filter(part=>part.kind==='pptx-annotation').map(part=>part.ordinal)).toEqual([1,2])
 expect(parts?.filter(part=>part.kind==='skill').map(part=>part.label)).toEqual(['/efund-ppt-maker'])
 expect(parts?.filter(part=>part.kind==='text').map(part=>part.text).join('')).toBe('\n'+value.comments[0]+'\n\n\n\n'+value.comments[1]+'\n\n\n'+value.overall)
 expect(parts?.filter(part=>part.kind==='pptx-annotation').map(part=>part.reference)).toEqual(value.proof.spans.map(span=>span.reference))
 expect(JSON.stringify(value.proof)).toBe(before)
})
it.each(['text','submissionId','userSeq','preparedId','referenceSession','offset','ordinal','overlap','duplicate','skillId','skillText'])('rejects a changed or ambiguous %s presentation as a whole',field=>{
 const value=annotationMessageFixture(),proof=structuredClone(value.proof)
 if(field==='text')proof.text+=' altered'
 if(field==='submissionId')proof.submissionId='another-rpc'
 if(field==='userSeq')proof.userSeq=10
 if(field==='preparedId')proof.preparedId='another-prepared'
 if(field==='referenceSession')proof.spans[0].reference.sessionId='foreign'
 if(field==='offset')proof.spans[1].start--
 if(field==='ordinal')proof.spans[0].ordinal=0
 if(field==='overlap')proof.skill={...proof.skill,start:proof.spans[0].start,end:proof.spans[0].end,text:proof.spans[0].text}
 if(field==='duplicate')proof.spans.push({...proof.spans[0]})
 if(field==='skillId')proof.skill.id='some-other-skill'
 if(field==='skillText')proof.skill.text='unknown'
 expect(project(request(value),proof)).toBeNull()
})
it('does not infer a skill or conceal unknown slash prose when the readonly proof has no skill',()=>{
 const value=annotationMessageFixture();delete value.proof.skill
 const parts=project(request(value),value.proof)
 expect(parts?.some(part=>part.kind==='skill')).toBe(false)
 expect(parts?.at(-1).text).toBe('\n'+value.comments[1]+'\n\n\n'+value.overall+value.skill)
 expect(project(request(value),null)).toBeNull()
})
it('invalidates outstanding views on actual account resets and removes listeners with the last subscriber',()=>{
 const window=new Window();windows.push(window)
 const scope=api.createPptxAnnotationMessageScope?.(window);expect(scope).toBeDefined()
 let called=0;const off=scope.subscribe(()=>called++)
 window.dispatchEvent(new window.CustomEvent('sherlock:skill-presentation',{detail:{owner:'a'}}));const epoch=scope.getSnapshot()
 window.dispatchEvent(new window.CustomEvent('sherlock:skill-presentation',{detail:{owner:'a'}}));expect(scope.getSnapshot()).toBe(epoch)
 expect(epoch).toBe(0)
 window.dispatchEvent(new window.CustomEvent('sherlock:skill-presentation',{detail:{owner:'b'}}));expect(scope.getSnapshot()).toBeGreaterThan(epoch)
 window.dispatchEvent(new window.CustomEvent('sherlock:skill-menu-reset'));expect(scope.getSnapshot()).toBeGreaterThan(epoch)
 off();const before=scope.getSnapshot();window.dispatchEvent(new window.CustomEvent('sherlock:skill-presentation',{detail:{owner:'b'}}));expect(scope.getSnapshot()).toBe(before);expect(called).toBe(2)
})
it('refuses duplicate locators at different ranges and a skill range that claims ordinary prose',()=>{
 const value=annotationMessageFixture(),duplicate=structuredClone(value.proof)
 duplicate.spans[1].reference=duplicate.spans[0].reference
 expect(project(request(value),duplicate)).toBeNull()
 const prose=structuredClone(value.proof),start=value.text.indexOf(value.comments[0]);prose.skill={start,end:start+value.comments[0].length,text:value.comments[0],id:'builtin:efund-ppt-maker',label:'/efund-ppt-maker'}
 expect(project(request(value),prose)).toBeNull()
})
it('uses a full known transport structure only to qualify a bounded neutral loading state',()=>{
 const value=annotationMessageFixture(),input=request(value)
 expect(api.pptxAnnotationMessageLoadingCandidate?.(input)).toBe(true)
 expect(api.pptxAnnotationMessageLoadingCandidate?.({...input,text:input.text.replaceAll('保留原件。\n','保留原件。 同行备注📌\n')})).toBe(true)
 for(const text of ['这是文件位置：.ework/pptx-annotations/'+value.proof.preparedId+'/manifest.json',value.text.replaceAll('必须另存到：','用户自己写的正文：'),value.text.replaceAll('保留原件。','用户自行编写这句。')])expect(api.pptxAnnotationMessageLoadingCandidate?.({...input,text})).toBe(false)
})
it('uses only the exact submitted display mapping after Main proves canonical ordinals and keeps old history frozen',()=>{
 const value=annotationMessageFixture();value.text=value.text.replace('[PPT 标注 1','[PPT 标注 7').replace('[PPT 标注 2','[PPT 标注 9');value.proof.text=value.text
 value.proof.spans.forEach((span,index)=>{span.ordinal=index?9:7;span.text=span.text.replace('[PPT 标注 '+(index+1),'[PPT 标注 '+span.ordinal)})
 const input=request(value),original=JSON.stringify(value.proof),mapping={sessionId:input.sendingSessionId,preparedId:input.preparedId,submissionId:input.submissionId,text:input.text,marks:value.proof.spans.map((span,index)=>({reference:span.reference,canonicalOrdinal:span.ordinal,ordinal:index+1}))}
 vi.stubGlobal('window',{[Symbol.for('sherlock:pptx-annotation-input')]:{messageDisplayOrdinals:query=>JSON.stringify(query)===JSON.stringify({sessionId:input.sendingSessionId,preparedId:input.preparedId,submissionId:input.submissionId,text:input.text})?mapping:null}})
 expect(project(input,value.proof).filter(part=>part.kind==='pptx-annotation').map(part=>[part.ordinal,part.canonicalOrdinal])).toEqual([[1,7],[2,9]])
 expect(JSON.stringify(value.proof)).toBe(original)
 mapping.submissionId='another-rpc';expect(project(input,value.proof).filter(part=>part.kind==='pptx-annotation').map(part=>part.ordinal)).toEqual([7,9])
 vi.unstubAllGlobals();expect(project(input,value.proof).filter(part=>part.kind==='pptx-annotation').map(part=>part.ordinal)).toEqual([7,9])
})
