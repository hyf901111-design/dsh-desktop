import {it,expect} from 'vitest'
import {resolveFinderPath} from '../src/main/context-menu-template'

it('resolves generated relative PPT links against their session workspace',()=>{
 expect(resolveFinderPath(['outputs/报告%20终稿.pptx'],p=>p==='/work/outputs/报告 终稿.pptx','/work')).toBe('/work/outputs/报告 终稿.pptx')
 expect(resolveFinderPath(['https://example.com/a.pptx'],()=>true,'/work')).toBe('')
})
