import {beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {runInNewContext} from 'node:vm'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {patchMarkdownFileLinks} from '../scripts/lib/markdown-file-links.mjs'
let MarkdownText
beforeAll(async()=>{
 const directory=resolve('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib')
 const source=patchMarkdownFileLinks(readFileSync(directory+'/index.js','utf8'))
 const result=await build({stdin:{contents:source,resolveDir:directory},bundle:true,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime'],write:false})
 const module={exports:{}}
 runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),process,console,Buffer,TextDecoder,TextEncoder,URL,setTimeout,clearTimeout})
 MarkdownText=module.exports.MarkdownText
})
it('renders the real relative PPT markdown link as an actionable file button',()=>{
 const paths=[]
 const html=renderToStaticMarkup(createElement(MarkdownText,{text:'**下载：** [`人类命运共同体介绍.pptx`](outputs/人类命运共同体介绍.pptx)',fileMentions:{resolve(path){paths.push(path);return {title:path,label:'Open PPT',open(){}}}}}))
 expect(paths).toEqual(['outputs/人类命运共同体介绍.pptx'])
 expect(html).toContain('<button')
 expect(html).toContain('<code>人类命运共同体介绍.pptx</code>')
})
it('keeps ordinary web links and unsafe protocols out of local file resolution',()=>{
 const resolve=()=>{throw Error('must not resolve a URL as a local file')}
 const html=renderToStaticMarkup(createElement(MarkdownText,{text:'[Web PDF](https://example.com/file.pdf) [Unsafe](javascript:alert)',fileMentions:{resolve}}))
 expect(html).toContain('href="https://example.com/file.pdf"')
 expect(html).not.toContain('href="javascript:')
})
