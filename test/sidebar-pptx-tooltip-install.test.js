import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
const resident=await readFile('/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')
const moduleUrl=pathToFileURL(resolve('scripts/lib/sidebar-pptx-toolbar.mjs')).href
function apply(source,strip=false){const code='import{patchSidebarPptxToolbar as patch,stripSidebarPptxToolbarHints as strip}from '+JSON.stringify(moduleUrl)+';import{readFileSync}from"node:fs";try{const source=readFileSync(0,"utf8"),result='+(strip?'strip(source)':'patch(source)')+';process.stdout.write(JSON.stringify({source:result}))}catch(error){process.stdout.write(JSON.stringify({error:error.message}))}';const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{input:source,encoding:'utf8',maxBuffer:8*1024*1024}));if(result.error)throw Error(result.error);return result.source}
const raw=apply(resident,true)
it('upgrades the actual installed v2 header and round-trips all original owner, busy, dirty and save code exactly',()=>{
 const installed=apply(raw);expect(installed).not.toBe(raw);expect(apply(installed)).toBe(installed);expect(apply(installed,true)).toBe(raw)
})
it('rejects altered, duplicate and orphan tooltip layers without weakening the original mode/source guards',()=>{
 const installed=apply(raw)
 for(const changed of [installed.replace('sherlock:pptx-toolbar-hints:v1','sherlock:pptx-toolbar-hints:v99'),installed.replace('delayMs:500','delayMs:501'),installed.replace('data-odyssey-pptx-mode-toggle','foreign-mode'),installed.replace('hint:true,label:pptToolbarLabel("annotation")','hint:true,label:"foreign"'),installed+'\n/* sherlock:pptx-toolbar-hints:unknown */',installed+installed])expect(()=>apply(changed)).toThrow(/drift/)
})
it('ships both new map-pin assets through the real Office preparation chain while preserving every other annotation asset',()=>{
 const directory=resolve('scripts/lib'),url=file=>JSON.stringify(pathToFileURL(resolve(directory,file)).href)
 const code='import{readFileSync}from"node:fs";import{patchSherlockOfficePreviewClient as office}from '+url('patch-sherlock-office-preview.mjs')+';import{patchPptxResize as resize,stripPptxResizePatch as stripResize}from '+url('pptx-resize-settle.mjs')+';import{patchPptxEditor as editor}from '+url('pptx-editor-ui.mjs')+';import{patchHomeGuidePresentationOffice as guide}from '+url('home-guide-presentation-native.mjs')+';import{pptxAnnotationAssets as expected}from '+url('pptx-annotation-assets.mjs')+';const original=readFileSync(process.argv[1],"utf8"),patch=source=>guide(editor(resize(office(stripResize(source))))),installed=patch(original),extract=source=>JSON.parse(source.match(/const pptxAnnotationAssets = (.*);\\n/)[1]),prior=extract(original),next=extract(installed);if(patch(installed)!==installed)throw Error("Office second pass drift");for(const key of Object.keys(next)){if(next[key]!==expected[key])throw Error("asset not current: "+key);if(!key.startsWith("mark16-")&&next[key]!==prior[key])throw Error("unrelated asset changed: "+key)}process.stdout.write(JSON.stringify({count:Object.keys(next).length,changed:Object.keys(next).filter(key=>next[key]!==prior[key])}))'
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code,'/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js'],{encoding:'utf8',maxBuffer:1024*1024}))
 expect(result.count).toBe(10)
 // A resident package may already contain this accepted asset pair after the
 // real pipeline ran. Both states must preserve every other byte/asset above.
 expect(result.changed).toEqual(result.changed.length?['mark16-normal','mark16-selected']:[])
})
