import {expect,it} from 'vitest'
import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {pathToFileURL} from 'node:url'

it('loads PDF.js from the offline profile when the desktop app runs outside the workspace',async()=>{
 const root=await mkdtemp(join(tmpdir(),'research pdf bundle '))
 try{
  const resources=join(root,'EWork Odyssey.app','Contents','Resources')
  const loader=join(resources,'app','node_modules','dsh-research-task-runtime','pdf-library.js')
  await mkdir(dirname(loader),{recursive:true})
  await copyFile(new URL('../packages/dsh-research-task-runtime/pdf-library.js',import.meta.url),loader)
  const library=join(resources,'sherlock-plugin-profile','modules','pdfjs-dist','legacy','build','pdf.mjs')
  await mkdir(dirname(library),{recursive:true})
  await writeFile(library,'export const getDocument = () => "bundled PDF.js"')
  const {loadPdfLibrary}=await import(pathToFileURL(loader).href)
  expect((await loadPdfLibrary()).getDocument()).toBe('bundled PDF.js')
 }finally{await rm(root,{recursive:true,force:true})}
})
