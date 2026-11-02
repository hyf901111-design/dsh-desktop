import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {mergeDeliveryPaths} from '../scripts/lib/delivery-file-model.mjs'

it('recovers both original PPT 1.1.6 paths without rewriting the saved closing or its pending QA statement',()=>{
 const text=readFileSync(new URL('./fixtures/ppt-116-missing-delivery-closing.txt',import.meta.url),'utf8')
 expect(mergeDeliveryPaths([],text,'/work')).toEqual(['/work/outputs/宁德时代2025年报深度点评.pptx','/work/outputs/宁德时代2025年报深度点评.pdf'])
 expect(text).toContain('待原生兼容性复核');expect(text).toContain('qa/qa-review.txt')
})

it.each(['## Delivered files','## Final deliverables','## 交付文件','交付文件'])('accepts standalone delivery heading %s without colon, ending at the next section',heading=>{
 expect(mergeDeliveryPaths([],heading+'\n\n- `out/final.pptx`\n\n## Sources\n- `inputs/reference.pdf`','/work')).toEqual(['/work/out/final.pptx'])
})

it.each(['说明：文件还未完成，请勿使用上述路径。','Files are not yet complete; do not use the paths above.','## 质量门禁\n文件还未完成，请勿使用上述路径。','## Quality assurance\nThe files are incomplete; do not use the paths above.','## QA\nDrafts only.','## 质量门禁\n上述两份文件仍是草稿，仅供检查。'])('preserves the refusal contract for incomplete, withdrawn and draft files: %s',qualification=>{
 expect(mergeDeliveryPaths([],'已完成。\n\n## 交付文件\n- `outputs/final.pptx`\n- `outputs/final.pdf`\n\n'+qualification,'/work')).toEqual([])
})
