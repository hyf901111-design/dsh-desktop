import {it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
it('keeps four source TOC rows compact and rejects stretched rows or displaced numbering',()=>{
 const code=`import sys,copy,zipfile,xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import check_toc_spacing,table_rows,NS
with zipfile.ZipFile('skills/efund-ppt-maker/assets/efund-template-v6.pptx') as z:
 source=ET.fromstring(z.read('ppt/slides/slide19.xml'))
output=copy.deepcopy(source)
table=output.find('.//a:tbl',NS)
for row in table.findall('a:tr',NS)[4:]: table.remove(row)
page={'tocLayout':{'sourceTableId':'5'},'tocRows':[{'tableId':'5','rowIndex':i,'columnIndex':1,'numberCell':{'tableId':'5','rowIndex':i,'columnIndex':0}} for i in range(4)]}
assert check_toc_spacing(output,source,page,100)==[]
assert table_rows(output,'5')[-1][0] < table_rows(source,'5')[-1][0]
for row in table.findall('a:tr',NS):row.set('h',str(int(int(row.get('h'))*7/4)))
assert check_toc_spacing(output,source,page,100)==['toc-row-spacing-mismatch']
output=copy.deepcopy(source)
page['tocRows'][0]['numberCell']['rowIndex']=1
assert check_toc_spacing(output,source,page,100)==['toc-row-spacing-mismatch']
page['tocLayout']['sourceTableId']='missing'
assert check_toc_spacing(output,source,page,100)==['toc-layout-unresolved']
`
 const p=spawnSync('python3',['-c',code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 expect(p.stderr).toBe('');expect(p.status).toBe(0)
})
