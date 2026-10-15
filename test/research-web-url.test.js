import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'
import {normalizeResearchWebUrl} from '../packages/dsh-research-task-runtime/web-url.js'
import {patchFigmaFilePreview} from '../scripts/lib/figma-file-preview-client.mjs'

const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const installed=patchFigmaFilePreview(source)
function clientNormalizer(value){
 const start=value.indexOf('function normalizeResearchWebUrl('),end=value.indexOf('function researchWebUrlHostname(',start)
 return runInNewContext(value.slice(start,end)+';normalizeResearchWebUrl',{URL})
}
const research=clientNormalizer(installed)
it.each([
 ['baidu.com','https://baidu.com/'],
 [' www.baidu.com/path?q=1#article ','https://www.baidu.com/path?q=1#article'],
 ['example.com:8443/path','https://example.com:8443/path'],
 ['//example.com/path','https://example.com/path'],
 [' HTTPS://Example.com:443/path ','https://example.com/path'],
 ['http://Example.com:80/path','http://example.com/path'],
 ['http://%20www.baidu.com/','http://www.baidu.com/'],
 ['localhost','https://localhost/'],
 ['localhost:3000/notes','https://localhost:3000/notes'],
 ['http://localhost:3000/notes','http://localhost:3000/notes'],
 ['javascript:alert(1)',null],
 ['file:///tmp/note.html',null],
 ['data:text/html,hello',null],
 ['https://user:password@example.com/',null],
 ['普通文字',null],
 ['',null],
 [undefined,null],
 ['https://example.com/'+'x'.repeat(8192),null]
])('shares research and note URL handling for %s',(input,expected)=>{
 expect(normalizeResearchWebUrl(input)).toBe(expected)
 expect(research(input)).toBe(expected)
})
it('refreshes stale research normalizers from the shared helper without duplicate installation',()=>{
 const stale=installed.replace(normalizeResearchWebUrl.toString(),'function normalizeResearchWebUrl(){return null;}')
 expect(clientNormalizer(patchFigmaFilePreview(stale))('baidu.com')).toBe('https://baidu.com/')
 expect(patchFigmaFilePreview(installed)).toBe(installed)
})
