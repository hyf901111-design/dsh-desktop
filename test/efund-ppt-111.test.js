import { it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

it('rejects touching visuals, orphan rendered lines, asymmetric flow and malformed text properties', () => {
 const result=execFileSync('python3',['-c',String.raw`
import sys,copy
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_readability import audit_layout
from efund_text_properties import invalid_text_properties, canonicalize, normalize_run
from check_efund_cover import open_package,xml_root,NS
from sanitize_pptx_metadata import clean_app,SanitizePolicy
from check_efund_visual_review import CHECKS
assert 'glyphs' in CHECKS and 'nativeOpen' in CHECKS
p=ET.fromstring('<a:rPr xmlns:a="'+NS['a']+'"><a:latin/><a:cs/><a:ea/></a:rPr>')
assert invalid_text_properties(p);canonicalize(p);assert not invalid_text_properties(p)
p.append(ET.Element('{'+NS['a']+'}ea'));assert invalid_text_properties(p)
try:canonicalize(p);assert False
except ValueError:pass
run=ET.fromstring('<a:r xmlns:a="'+NS['a']+'"><a:rPr sz="4500"><a:latin typeface="Arial"/><a:ea typeface="华文黑体_易方达" charset="-122"/><a:cs typeface="Arial"/></a:rPr><a:t>谢谢</a:t></a:r>')
normalize_run(run,NS)
assert run.find('a:rPr/a:latin',NS).get('typeface')=='华文黑体_易方达'
assert run.find('a:rPr',NS).get('sz')=='4500'
assert 'charset' not in run.find('a:rPr/a:ea',NS).attrib
assert b'AppVersion' not in clean_app(b'<Properties><AppVersion></AppVersion><Slides>15</Slides></Properties>',SanitizePolicy())
assert b'AppVersion' not in clean_app(b'<Properties><AppVersion/></Properties>',SanitizePolicy())
def e(name,box,text='',**rest):return {'id':name,'name':name,'scope':'slide','bbox':box,'text':text,**rest}
d={'elements':[e('table-title',[38,130,400,22],'heading'),e('task-list-table',[38,158,880,200],kind='table')]}
assert any(x['code']=='heading-visual-clearance' for x in audit_layout(d))
d['elements'][1]['bbox'][1]=168;assert not audit_layout(d)
d={'elements':[e('boundary-card-1',[394,142,169,84],'不直连生产业务数据库',textLayout={'source':'rendered','lineCount':2,'lines':['不直连生产业务数据','库']})]}
assert any(x['code']=='orphan-cjk-line' for x in audit_layout(d))
d['elements'][0]['textLayout']['lines']=['禁止直连','生产业务数据库'];assert not audit_layout(d)
d={'elements':[e('standard-visual-title',[394,114,529,18],'flow'),e('version-node-1',[414,142,200,40],'one'),e('version-node-2',[414,204,200,40],'two')]}
assert any(x['code']=='process-region-unbalanced' for x in audit_layout(d))
for e1 in d['elements'][1:]:e1['bbox'][0]=558.5
assert not audit_layout(d)
for asset,slots in [('efund-template-v6.pptx',[(3,'3',1),(4,'3',1),(5,'8',1)]),('efund-ai-platform-v21.pptx',[(1,'3',0)])]:
 pkg=open_package(Path('skills/efund-ppt-maker/assets')/asset)
 for slide,sid,index in slots:
  r=xml_root(pkg,f'ppt/slides/slide{slide}.xml');s=next(x for x in r.findall('.//p:sp',NS) if x.find('p:nvSpPr/p:cNvPr',NS).get('id')==sid)
  for props in s.findall('p:txBody/a:p',NS)[index].findall('.//a:rPr',NS):assert props.get('sz')=='1800' and props.get('b')=='0'
 pkg.archive.close()
print('passed')
`],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 expect(result.trim()).toBe('passed')
})
