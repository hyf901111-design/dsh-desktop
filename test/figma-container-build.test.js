import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {patchFigmaContainerMenu} from '../scripts/lib/figma-container-menu.mjs'
it('applies the menu patch to clean input before or after the deferred-container wrapper',()=>{
 const patch=readFileSync('patches/@deepseek-ai+dsh-client-ui-conversation+0.1.0-rc.7.patch','utf8')
 const added=patch.split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++')).map(line=>line.slice(1)).join('\n')
 const start=added.indexOf('function ResearchContainerMenu('),end=added.indexOf('\n\t\tfunction ResearchGeneratedContainer(',start)
 expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start)
 const menu=added.slice(start,end)
 for(const boundary of ['\n\t\tfunction ResearchGeneratedContainer(){}','\n        function ResearchDeferredGeneratedContainer(){}\n        function ResearchGeneratedContainer(){}']){
  const result=patchFigmaContainerMenu(menu+boundary)
  expect(result).toContain('odyssey:container-refresh-submenu:20260912')
  expect(result).toContain('data-odyssey-refresh-options')
  expect(patchFigmaContainerMenu(result)).toBe(result)
 }
})
