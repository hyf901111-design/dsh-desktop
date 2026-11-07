import test from 'node:test'
import assert from 'node:assert/strict'
import { score, percentile, packEvidence } from './metrics.mjs'
import * as metrics from './metrics.mjs'

test('multiple gold sources require all sources, with duplicate IDs ignored', () => {
  const queries = [{id:'q',expected:['a','b']}]
  assert.equal(score(queries,[{id:'q',ids:['a','a']}]).completeHitRate,0)
  assert.equal(score(queries,[{id:'q',ids:['a','b']}]).completeHitRate,1)
})
test('unknown questions have their own false-positive denominator', () => {
  const m=score([{id:'yes',expected:['a']},{id:'no',expected:[]}],[{id:'yes',ids:['a']},{id:'no',ids:['x']}])
  assert.equal(m.completeHitRate,1)
  assert.equal(m.negativeFalsePositiveRate,1)
})
test('failed and missing queries remain in the hit-rate denominator', () => {
  const m=score([{id:'ok',expected:['a']},{id:'bad',expected:['b']},{id:'missing',expected:['c']}],[{id:'ok',ids:['a'],latencyMs:2},{id:'bad',error:'timeout',latencyMs:2000}])
  assert.equal(m.completeHitRate,1/3)
  assert.equal(m.failures,2)
  assert.equal(m.latencyMs.p95,2000)
})
test('percentiles use nearest rank and handle empty samples', () => {
  assert.equal(percentile([100,1,10,5],0.95),100)
  assert.equal(percentile([100,1,10,5],0.5),5)
  assert.equal(percentile([],0.95),null)
})
test('context limit counts UTF-8 bytes and does not split a record', () => {
  const rows=[{id:'a',title:'甲',content:'你好世界'},{id:'b',title:'乙',content:'abcdef'}]
  const first=packEvidence(rows,1000,'提示\n')
  const cut=packEvidence(rows,Buffer.byteLength(first.text)-1,'提示\n')
  assert.deepEqual(cut.ids,['a'])
  assert.ok(Buffer.byteLength(cut.text)<=Buffer.byteLength(first.text)-1)
})
test('byte-budget coverage counts evidence beyond rank five independently of top-5', () => {
  const rows=Array.from({length:8},(_,i)=>({id:'m'+i,title:'来源',content:'合成证据'}))
  const packed=packEvidence(rows,1200,'背景\n')
  const queries=[{id:'q',expected:['m0','m6']}]
  const results=[{id:'q',ids:packed.ids,packed,latencyMs:1}]
  assert.equal(score(queries,results).completeHitRate,0)
  assert.equal(metrics.scoreEvidenceBudget(queries,results).completeHitRate,1)
})
