import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import { it } from 'vitest'
import {patchFigmaInlineReferences} from '../scripts/lib/figma-inline-references-client.mjs'
const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
it('preserves business handlers, exact occurrence deletion and provisional cleanup', () => {
const patched=patchFigmaInlineReferences(source)
new Function(patched)
assert.equal(patchFigmaInlineReferences(patched),patched)
assert.throws(()=>patchFigmaInlineReferences(source.replace('/* sherlock-figma-inline-reference-v1 */', '').replace('const next = e.target.value;', 'const next = unexpectedValue;')),/anchor drifted/)
function namedFunction(name){const start=patched.indexOf('\t\tfunction '+name+'(');const end=patched.indexOf('\n\t\t}',start);assert(start>=0&&end>start);return patched.slice(start,end+5)}
const createDeletion=new Function('CHAT_FILE_REFERENCE_SOURCE','RESEARCH_FILE_REFERENCE_SOURCE','RESEARCH_ARTIFACT_REFERENCE_SOURCE',namedFunction('deleteResearchReferenceOccurrence')+'\n'+namedFunction('deleteProvisionalResearchReferenceOccurrence')+'\nreturn {deleteResearchReferenceOccurrence,deleteProvisionalResearchReferenceOccurrence}')
const delegates=createDeletion('chat','file','artifact')
const start=patched.indexOf('const removeFigmaReference = (occurrenceId, el) => {'),end=patched.indexOf('\n            const onKeyDown',start)
const createRemove=new Function('keyboard','provisionalResearchReferencesRef','publishProvisionalResearchReferences','setSelectedResearchOccurrenceId','restoreCaret','deleteResearchReferenceOccurrence','deleteProvisionalResearchReferenceOccurrence',patched.slice(start,end)+';return removeFigmaReference')
for(const provisional of [false,true]){
 const draft=provisional?'甲\uFFFC乙\uFFFC 尾':'甲\uFFFC乙\uFFFC尾'
 const calls=[]
 const keyboard={snapshot:{draft,occurrences:[{occurrenceId:1,offset:1,source:'file'},{occurrenceId:2,offset:3,source:'file'}]},setDraft(next,edit){calls.push(['set',next,edit]);this.snapshot.draft=next},track(next,caret){calls.push(['track',next,caret])}}
 const ref={current:new Map(provisional?[[2,{trailingSpace:true}],[99,{trailingSpace:false}]]:[])},input={focus(options){calls.push(['focus',options])}}
 const remove=createRemove(keyboard,ref,next=>{ref.current=next},id=>calls.push(['selected',id]),(el,caret)=>calls.push(['restore',el===input,caret]),delegates.deleteResearchReferenceOccurrence,delegates.deleteProvisionalResearchReferenceOccurrence)
 remove(2,input)
 assert.equal(keyboard.snapshot.draft,'甲\uFFFC乙尾')
 assert.deepEqual(calls[0],['set','甲\uFFFC乙尾',{start:3,end:provisional?5:4,insertedLength:0}])
 assert.deepEqual(calls.slice(1),[['selected',null],['restore',true,3],['track','甲\uFFFC乙尾',3],['focus',{preventScroll:true}]])
 if(provisional){assert.equal(ref.current.has(2),false);assert.equal(ref.current.has(99),true)}
}
const inputStart=patched.indexOf('\t\tfunction InputBar('),inputEnd=patched.indexOf('\n\t\t//#endregion',inputStart)
const actualInput=patched.slice(inputStart,inputEnd)
assert.match(actualInput,/onPaste,/) // Original structured-paste and copy/cut handlers remain installed.
assert.match(actualInput,/onCopyOrCut\(e, false\)/)
assert.match(actualInput,/keyboard\.moveReferenceOccurrence\(occurrenceId, targetOffset\)/)
assert.match(actualInput,/keyboard\.submit\(resolveSubmitMode/)
assert.match(actualInput,/children: figmaReferences.ready \? figmaReferences.projection.text \+ "\\n" : measurement/)
assert.equal(patched.slice(inputEnd).includes('sherlock-inline-reference-remove'),false)
assert.equal(patched.slice(inputEnd),source.slice(source.indexOf('\n\t\t//#endregion',source.indexOf('\t\tfunction InputBar('))))

})
