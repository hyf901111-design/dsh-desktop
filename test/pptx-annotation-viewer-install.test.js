import {expect,it} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {Script} from 'node:vm'
const req=createRequire(import.meta.url),{patchPptxEditor,stripPptxEditorPatch}=req('../scripts/lib/pptx-editor-ui.mjs'),{patchSherlockOfficePreviewClient}=req('../scripts/lib/patch-sherlock-office-preview.mjs'),{stripPptxResizePatch}=req('../scripts/lib/pptx-resize-settle.mjs')
const raw=readFileSync('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8'),base=stripPptxEditorPatch(patchSherlockOfficePreviewClient(stripPptxResizePatch(raw)))
it('upgrades the complete real v6 editor and strictly reinstalls/strips the annotation-enabled resident',async()=>{
 const prior=execFileSync('git',['show','63c15067:scripts/lib/pptx-editor-ui.mjs'],{encoding:'utf8'}).replace("'./pptx-direct-editor.mjs'",JSON.stringify(pathToFileURL(process.cwd()+'/scripts/lib/pptx-direct-editor.mjs').href))
 const legacy=await import(/* @vite-ignore */'data:text/javascript;base64,'+Buffer.from(prior).toString('base64'))
 const installed=patchPptxEditor(legacy.patchPptxEditor(base)),fresh=patchPptxEditor(base)
 expect(installed).toBe(fresh);expect(()=>new Script(installed)).not.toThrow();expect(patchPptxEditor(installed)).toBe(installed);expect(stripPptxEditorPatch(installed)).toBe(base);expect(installed).toContain('annotationSource: props.annotationSource')
 expect(()=>patchPptxEditor(installed.replace('function attachPptxAnnotationViewer(','function unverifiedAnnotationViewer('))).toThrow(/drifted/)
})
it('upgrades the real v7 count-span viewer to the cold-mark list without leaving an old resident',async()=>{
 const oldViewer=execFileSync('git',['show','adc43df1:scripts/lib/pptx-annotation-viewer.mjs'],{encoding:'utf8'})
 const viewerUrl='data:text/javascript;base64,'+Buffer.from(oldViewer).toString('base64')
 let prior=execFileSync('git',['show','adc43df1:scripts/lib/pptx-editor-ui.mjs'],{encoding:'utf8'})
 for(const name of ['pptx-direct-editor','pptx-annotation-assets'])prior=prior.replace("'./"+name+".mjs'",JSON.stringify(pathToFileURL(process.cwd()+'/scripts/lib/'+name+'.mjs').href))
 prior=prior.replace("'./pptx-annotation-viewer.mjs'",JSON.stringify(viewerUrl))
 const legacy=await import(/* @vite-ignore */'data:text/javascript;base64,'+Buffer.from(prior).toString('base64')),old=legacy.patchPptxEditor(base)
 expect(old).toContain("const count=node('span','pptxa-count',toolbar)")
 const upgraded=patchPptxEditor(old),fresh=patchPptxEditor(base)
 expect(upgraded).toBe(fresh);expect(upgraded).toContain("'aria-label','标注列表'");expect(patchPptxEditor(upgraded)).toBe(upgraded);expect(stripPptxEditorPatch(upgraded)).toBe(base)
 expect(()=>new Script(upgraded)).not.toThrow()
})
it('ships exactly the ten original local SVG slots at their intrinsic 14/16/18/20/28px root dimensions',()=>{
 const files=readdirSync('src/preload/pptx-annotation-icons').sort()
 expect(files).toEqual(['close16.svg','mark16-normal.svg','mark16-selected.svg','pin18-normal.svg','pin18-selected.svg','pin20-selected.svg','pin28-normal.svg','pin28-selected.svg','point14-normal.svg','rect14-selected.svg'].sort())
 for(const name of files){const svg=readFileSync('src/preload/pptx-annotation-icons/'+name,'utf8'),size=Number(name.match(/\d+/)[0]);expect(svg).toMatch(new RegExp('width="'+size+'"'));expect(svg).toMatch(new RegExp('height="'+size+'"'));expect(svg).toContain('viewBox="0 0 '+size+' '+size+'"');expect(svg).not.toMatch(/<image|(?:href|src)=["']https?:\/\//)}
})
