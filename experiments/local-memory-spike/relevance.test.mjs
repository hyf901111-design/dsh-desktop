import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectRelevant} from './relevance.mjs'

test('high nearest-neighbor similarity alone cannot authorize evidence',()=>{
  const rows=[{id:'a',similarity:.98,relevance:.02},{id:'b',similarity:.93,relevance:.90}]
  assert.deepEqual(selectRelevant(rows,.5).map(r=>r.id),['b'])
})
test('missing, nonfinite or failed relevance scores fail closed',()=>{
  assert.deepEqual(selectRelevant([{id:'a'},{id:'b',relevance:NaN},{id:'c',relevance:Infinity}],.5),[])
})
test('selected evidence retains full source text, including negation',()=>{
  const row={id:'a',content:'允许离线阅读，不允许离线编辑。',relevance:.9}
  assert.deepEqual(selectRelevant([row],.5),[row])
})
