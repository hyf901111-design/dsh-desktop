import { it } from 'vitest'
import assert from 'node:assert/strict'
import {projectReferenceDraft as project, unprojectReferenceEdit as decode, referenceMarkerForDraft as marker} from '../scripts/lib/figma-inline-references-client.mjs'
it('projects only the chosen occurrence and round-trips native UTF-16 edits', () => {
const draft='😀甲\uFFFC乙\uFFFC尾', occurrences=[{occurrenceId:1,offset:3},{occurrenceId:2,offset:5}]
const p=project(draft,occurrences,2)
assert.equal(p.text.length,draft.length)
assert.equal(p.offset,5)
assert.equal(p.text[3],'\uFFFC')
assert.equal(decode(p.text,p),draft)
assert.equal(decode('前'+p.text,p),'前'+draft)
assert.equal(decode(p.text.slice(0,5)+p.text.slice(6),p),'😀甲\uFFFC乙尾')
assert.equal(decode(p.text.slice(0,5)+'文'+p.text.slice(6),p),'😀甲\uFFFC乙文尾')
for (const at of [p.offset,p.offset+1]) {
  const next=p.text.slice(0,at)+p.marker+p.text.slice(at)
  assert.equal(decode(next,p,{value:p.text,start:at,end:at,inputType:'insertText'}),
    draft.slice(0,at)+p.marker+draft.slice(at))
}
assert.notEqual(marker('\uE000真实字符'),'\uE000')
assert.equal(project(draft,occurrences,2,false).text,draft)
assert.equal(project(draft,occurrences,999).text,draft)
assert.equal(decode(p.text.slice(0,5)+p.marker+p.text.slice(6),p,
  {value:p.text,start:5,end:6,inputType:'insertCompositionText'}),'😀甲\uFFFC乙'+p.marker+'尾')

})

it('does not replace any real private-use character, even when every BMP marker is occupied', () => {
 const all = Array.from({length:0xf8ff-0xe000+1},(_,i)=>String.fromCharCode(0xe000+i)).join('')
 assert.equal(marker(all),null)
 const canonical = all + '\uFFFC'
 const view = project(canonical,[{occurrenceId:1,offset:all.length}],1)
 assert.equal(view.text,canonical)
 assert.equal(view.offset,-1)
})
