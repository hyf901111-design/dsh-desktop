import { it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

function python(code) {
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}

it('rejects whitespace retained from a cover placeholder without changing its locked geometry', () => python(String.raw`
import sys,copy
from pathlib import Path
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_cover import open_package,xml_root,compare_text,element_geometry,NS
pkg=open_package(Path('skills/efund-ppt-maker/assets/efund-template-v6.pptx'))
try:
 root=xml_root(pkg,'ppt/slides/slide3.xml')
 source=next(s for s in root.findall('.//p:sp',NS) if s.find('p:nvSpPr/p:cNvPr',NS).get('id')=='12')
 output=copy.deepcopy(source)
 for node,text in zip(output.findall('p:txBody/a:p',NS)[0].findall('a:r/a:t',NS),[' ','研报','研读']):node.text=text
 assert 'cover-text-edge-whitespace' in [i['code'] for i in compare_text(pkg,source,pkg,output,'12','cover-slide')]
 output.find('p:txBody/a:p/a:r/a:t',NS).text=''
 assert not compare_text(pkg,source,pkg,output,'12','cover-slide')
 assert element_geometry(source)==element_geometry(output)
 output.findall('p:txBody/a:p',NS)[1].findall('a:r/a:t',NS)[-1].text='月\u3000'
 assert 'cover-text-edge-whitespace' in [i['code'] for i in compare_text(pkg,source,pkg,output,'12','cover-slide')]
finally:pkg.archive.close()
`))

it('checks actual table cells for centered headers and matching column alignment and insets', () => python(String.raw`
import sys,copy,xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import check_data_table_layout,NS
def cell(text,align='l'):
 return f'<a:tc><a:txBody><a:bodyPr/><a:p><a:pPr algn="{align}"/><a:r><a:t>{text}</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr" marL="91440" marR="91440" marT="45720" marB="45720"/></a:tc>'
root=ET.fromstring(f'<p:sld xmlns:p="{NS["p"]}" xmlns:a="{NS["a"]}"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="data-table"/></p:nvGraphicFramePr><a:tbl><a:tr>{cell("指标")}{cell("数值")}</a:tr><a:tr>{cell("增长")}{cell("2.25%")}</a:tr></a:tbl></p:graphicFrame></p:sld>')
page={'pageKind':'content'}
assert check_data_table_layout(root,page)==[]
bad=copy.deepcopy(root);del bad.find('.//a:tcPr',NS).attrib['anchor']
assert 'table-header-not-vertically-centered' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);bad.find('.//a:pPr',NS).set('algn','ctr')
assert 'table-column-alignment-mismatch' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);bad.findall('.//a:tr',NS)[1].find('a:tc/a:tcPr',NS).set('marL','182880')
assert 'table-column-insets-mismatch' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);del bad.find('.//a:tcPr',NS).attrib['marR']
assert 'table-cell-insets-not-explicit' in check_data_table_layout(bad,page)
assert check_data_table_layout(bad,{'pageKind':'toc'})==[]
bad=copy.deepcopy(root);bad.find('.//a:tcPr',NS).set('marB','0')
assert 'table-header-vertical-insets-mismatch' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);bad.findall('.//a:tr',NS)[1].find('a:tc/a:txBody/a:p/a:pPr',NS).set('marL','182880')
assert 'table-column-paragraph-indent-mismatch' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);body=bad.findall('.//a:tr',NS)[1].find('a:tc/a:txBody',NS)
style=ET.Element('{'+NS['a']+'}lstStyle');ET.SubElement(style,'{'+NS['a']+'}defPPr',marL='182880',indent='91440');body.insert(1,style)
assert 'table-column-paragraph-indent-mismatch' in check_data_table_layout(bad,page)
bad=copy.deepcopy(root);bad.findall('.//a:tr',NS)[1].find('a:tc/a:txBody/a:p/a:r/a:t',NS).text=' 增长'
assert 'table-cell-edge-whitespace' in check_data_table_layout(bad,page)
# Exceptions are tied to an actual table and column; only numeric bodies can opt into right alignment.
numeric=copy.deepcopy(root)
for row in numeric.findall('.//a:tr',NS):row.findall('a:tc',NS)[1].find('a:txBody/a:p/a:pPr',NS).set('algn','r')
exception={'tableId':'7','kind':'numeric-columns','columns':[1],'reason':'百分比数值列按小数和符号扫描'}
assert check_data_table_layout(numeric,{**page,'tableLayoutExceptions':[exception]})==[]
assert 'table-column-alignment-mismatch' in check_data_table_layout(numeric,page)
invalid={**exception,'columns':[0]}
assert 'table-layout-exception-invalid' in check_data_table_layout(root,{**page,'tableLayoutExceptions':[invalid]})
invalid={**exception,'tableId':'missing'}
assert 'table-layout-exception-invalid' in check_data_table_layout(root,{**page,'tableLayoutExceptions':[invalid]})
labels=copy.deepcopy(root)
labels.findall('.//a:tr',NS)[1].findall('a:tc',NS)[1].find('.//a:t',NS).text='高'
for row in labels.findall('.//a:tr',NS):row.findall('a:tc',NS)[1].find('a:txBody/a:p/a:pPr',NS).set('algn','ctr')
short={**exception,'kind':'short-label-columns','reason':'风险等级只有高、中、低短标签'}
assert check_data_table_layout(labels,{**page,'tableLayoutExceptions':[short]})==[]
assert 'table-layout-exception-invalid' in check_data_table_layout(labels,{**page,'tableLayoutExceptions':[exception]})
paragraph=labels.findall('.//a:tr',NS)[1].findall('a:tc',NS)[1].find('a:txBody/a:p',NS)
ET.SubElement(paragraph,'{'+NS['a']+'}br')
run=ET.SubElement(paragraph,'{'+NS['a']+'}r');ET.SubElement(run,'{'+NS['a']+'}t').text='低'
assert 'table-layout-exception-invalid' in check_data_table_layout(labels,{**page,'tableLayoutExceptions':[short]})
`))

it('requires top anchors and rendered title-to-body spacing on narrative pages', () => python(String.raw`
import sys,copy,xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import check_narrative_anchors,NS
from check_efund_readability import audit_layout
def shape(name):return f'<p:sp><p:nvSpPr><p:cNvPr id="{name}" name="{name}"/></p:nvSpPr><p:txBody><a:bodyPr anchor="t"/><a:p><a:r><a:t>说明</a:t></a:r></a:p></p:txBody></p:sp>'
root=ET.fromstring(f'<p:sld xmlns:p="{NS["p"]}" xmlns:a="{NS["a"]}">{shape("standard-narrative-title")}{shape("standard-narrative-body")}</p:sld>')
assert check_narrative_anchors(root,{'pageKind':'content'})==[]
root.find('.//a:bodyPr',NS).set('anchor','ctr')
assert 'narrative-text-not-top-anchored' in check_narrative_anchors(root,{'pageKind':'content'})
root.remove(root.findall('p:sp',NS)[1])
assert 'narrative-text-pair-missing' in check_narrative_anchors(root,{'pageKind':'content'})
def element(name,frame,ink,text):return {'id':name,'name':name,'scope':'slide','bbox':frame,'text':text,'textLayout':{'source':'rendered','lineCount':1,'lines':[text],'bbox':ink}}
data={'elements':[element('standard-narrative-title',[38,111,315,71],[50,123,291,20],'解释小标题'),element('standard-narrative-body',[38,193,315,177],[50,205,291,20],'解释正文')]}
assert 'narrative-title-body-gap' in [i['code'] for i in audit_layout(data)]
data['elements'][0]['bbox'][3]=32
data['elements'][1]['bbox'][1]=143
data['elements'][1]['textLayout']['bbox'][1]=155
assert not audit_layout(data)
del data['elements'][0]['textLayout']['bbox']
assert 'narrative-rendered-bounds-required' in [i['code'] for i in audit_layout(data)]
`))
