import {describe,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {verifyHomePresentationAssets} from '../scripts/lib/home-presentation-assets.mjs'
const source=resolve('packages/dsh-research-task-runtime/assets/home-presentation')
function fixture(){const root=mkdtempSync(join(tmpdir(),'home-presentation-package-')),dir=join(root,'node_modules/dsh-research-task-runtime/assets/home-presentation');mkdirSync(dir,{recursive:true});for(const file of ['source-metadata.json','source-report.pdf','company-research-briefing.pptx'])writeFileSync(join(dir,file),readFileSync(join(source,file)));return{root,dir,close:()=>rmSync(root,{recursive:true,force:true})}}
describe('packaged research tutorial assets',()=>{
 it('checks the complete source PDF and multi-page editable deck against their manifest',()=>{const f=fixture();try{expect(verifyHomePresentationAssets(f.root)).toMatchObject({sourcePages:28,presentationSlides:JSON.parse(readFileSync(join(f.dir,'source-metadata.json'),'utf8')).presentationSlides})}finally{f.close()}})
 it('rejects a missing report instead of shipping a tutorial with a fake attachment',()=>{const f=fixture();try{rmSync(join(f.dir,'source-report.pdf'));expect(()=>verifyHomePresentationAssets(f.root)).toThrow(/source-report/)}finally{f.close()}})
 it('rejects an incomplete presentation instead of accepting its filename',()=>{const f=fixture();try{writeFileSync(join(f.dir,'company-research-briefing.pptx'),'PK broken');expect(()=>verifyHomePresentationAssets(f.root)).toThrow(/checksum/)}finally{f.close()}})
})
