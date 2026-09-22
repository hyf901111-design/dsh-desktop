import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { researchComponentHeaderNote, researchComponentHeaderNoteParts } from '../scripts/lib/research-component-header-note.mjs'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'

afterEach(() => vi.unstubAllGlobals())
function note(html:string) {
  vi.stubGlobal('DOMParser', new Window().DOMParser)
  return researchComponentHeaderNote({type:'html',html})
}
it('moves source header metadata into a text-only host note and decodes entities', () => {
  expect(note('<meta name="sherlock-header-note" content="2026中报 · 权重 &gt; 5%">')).toBe('2026中报 · 权重 > 5%')
  expect(note('<meta content="&lt;img src=x onerror=alert(1)&gt;" name="sherlock-header-note">')).toBe('<img src=x onerror=alert(1)>')
})
it('parses only meta elements, never other resources or executable markup', () => {
  const parseFromString=vi.fn(()=>({querySelector:()=>null}))
  vi.stubGlobal('DOMParser',class {parseFromString=parseFromString})
  researchComponentHeaderNote({type:'html',html:'<img src="private"><script>danger()</script><meta name="sherlock-header-note" content="source">'})
  expect(parseFromString).toHaveBeenCalledExactlyOnceWith('<meta name="sherlock-header-note" content="source">','text/html')
})
it('ignores unrelated artifact types and bounds long metadata', () => {
  expect(researchComponentHeaderNote({type:'table',html:'sherlock-header-note'})).toBe('')
  expect(note('<meta name="other" content="do not show">')).toBe('')
  expect(note('<meta name="sherlock-header-note" content="  a\n b  ">')).toBe('a b')
  expect(note('<meta name="sherlock-header-note" content="'+'x'.repeat(100)+'">')).toHaveLength(80)
})
it('ignores examples inside comments, scripts, raw text and templates', () => {
  const fake='<meta name="sherlock-header-note" content="旧示例">'
  for (const example of [`<!-- ${fake} -->`,`<script>const example='${fake}'</script>`,`<style>/* ${fake} */</style>`,`<textarea>${fake}</textarea>`,`<template>${fake}</template>`]) {
    expect(note(example+'<meta name="sherlock-header-note" content="2026中报">')).toBe('2026中报')
  }
})
it('preserves mixed source typography without moving percent punctuation into the numeric font', () => {
  expect(researchComponentHeaderNoteParts('09.22 · 研究模拟')).toEqual([{text:'09.22',numeric:true},{text:' · 研究模拟',numeric:false}])
  expect(researchComponentHeaderNoteParts('权重 %')).toEqual([{text:'权重 %',numeric:false}])
})
it('keeps the complete canvas patch idempotent with exactly one host note slot', async () => {
  const once=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  expect(patchFigmaFinalCanvas(once)).toBe(once)
  expect(once.match(/"data-research-component-header-note":/g)).toHaveLength(1)
  expect(once).toContain('children: part.text')
})
