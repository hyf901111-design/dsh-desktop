import { expect, it } from 'vitest'
import { generatedFileFinderPath } from '../src/main/generated-file-finder'

it('locates a basename-only link in its actual outputs directory', () => {
  expect(generatedFileFinderPath({matches:['outputs/报告.pptx'],truncated:false}, '报告.pptx', '/work', p => p === '/work/outputs/报告.pptx')).toBe('/work/outputs/报告.pptx')
})
it('never guesses across duplicates, truncation, missing files or workspaces', () => {
  for (const result of [
    {matches:['a/报告.pptx','b/报告.pptx'],truncated:false},
    {matches:['outputs/报告.pptx'],truncated:true},
    {matches:['/other/报告.pptx'],truncated:false},
    {matches:['../报告.pptx'],truncated:false}
  ]) expect(generatedFileFinderPath(result,'报告.pptx','/work',()=>true)).toBe('')
  expect(generatedFileFinderPath({matches:['outputs/报告.pptx'],truncated:false},'报告.pptx','/work',()=>false)).toBe('')
})
