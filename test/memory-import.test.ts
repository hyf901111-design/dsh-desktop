import {expect,it} from 'vitest'
import {splitMemoryImport} from '../src/main/memory/import'
it('splits long imports on complete paragraphs and refuses an oversized indivisible statement',()=>{
  const paragraphs=['项目目标：'+'读取中文资料。'.repeat(40),'验收要求：'+'保留原来的布局。'.repeat(40),'项目约束：'+'采用本地存储。'.repeat(40)]
  const result=splitMemoryImport(paragraphs.join('\n\n'))
  expect(result).toHaveLength(3)
  expect(result).toEqual(paragraphs)
  expect(()=>splitMemoryImport('长'.repeat(601))).toThrow(/精简|拆分/)
})
