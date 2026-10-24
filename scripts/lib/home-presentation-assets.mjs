import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'

/** A formal app must carry both actual tutorial files, not only their names. */
export function verifyHomePresentationAssets(runtimeRoot) {
 const dir=join(runtimeRoot,'node_modules','dsh-research-task-runtime','assets','home-presentation')
 const manifest=JSON.parse(readFileSync(join(dir,'source-metadata.json'),'utf8'))
 if(manifest.schemaVersion!==1||manifest.sourceFile!=='source-report.pdf'||manifest.presentationFile!=='company-research-briefing.pptx'||manifest.sourcePages!==28||!Number.isInteger(manifest.presentationSlides)||manifest.presentationSlides<2||manifest.presentationSlides>32||manifest.pageOutline?.length!==manifest.presentationSlides)throw Error('Invalid research presentation manifest')
 for(const[file,hash]of[[manifest.sourceFile,manifest.sourceSha256],[manifest.presentationFile,manifest.presentationSha256]]){
  const data=readFileSync(join(dir,file))
  if(!/^[0-9a-f]{64}$/.test(hash)||createHash('sha256').update(data).digest('hex')!==hash)throw Error('Research tutorial asset checksum mismatch: '+file)
  if(file.endsWith('.pdf')?data.subarray(0,5).toString()!=='%PDF-':data.subarray(0,2).toString()!=='PK')throw Error('Invalid research tutorial asset: '+file)
 }
 return {sourcePages:manifest.sourcePages,presentationSlides:manifest.presentationSlides}
}
