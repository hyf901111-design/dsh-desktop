import { it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

it('uses regular subtitles and preserves TOC separators without a top rule', () => {
 const code = `import sys,copy,zipfile,xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import check_toc_rules,check_layout_choice,layout_selection_summary,NS
from check_efund_cover import open_package,xml_root,compare_text
asset='skills/efund-ppt-maker/assets/efund-template-v6.pptx'
pkg=open_package(__import__('pathlib').Path(asset))
for slide,sid in [(3,'3'),(4,'3'),(5,'8')]:
 root=xml_root(pkg,f'ppt/slides/slide{slide}.xml')
 shape=next(s for s in root.findall('.//p:sp',NS) if s.find('p:nvSpPr/p:cNvPr',NS).get('id')==sid)
 subtitle=shape.findall('p:txBody/a:p',NS)[1]
 assert all(r.get('b')=='0' for r in subtitle.findall('.//a:rPr',NS))
 bad=copy.deepcopy(shape)
 for r in bad.findall('p:txBody/a:p',NS)[1].findall('.//a:rPr',NS):r.set('b','1')
 assert compare_text(pkg,shape,pkg,bad,sid,'cover')
ai=open_package(__import__('pathlib').Path('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx'))
airoot=xml_root(ai,'ppt/slides/slide1.xml')
aisub=next(s for s in airoot.findall('.//p:sp',NS) if s.find('p:nvSpPr/p:cNvPr',NS).get('id')=='3')
assert all(r.get('b')=='0' for r in aisub.findall('.//a:rPr',NS))
ai.archive.close()
root=xml_root(pkg,'ppt/slides/slide19.xml')
page={'tocRows':[{'tableId':'5','rowIndex':i,'columnIndex':1,'numberCell':{'tableId':'5','rowIndex':i,'columnIndex':0}} for i in range(4)]}
assert check_toc_rules(root,page)==[]
for slide in [7,15,34,43]:assert check_toc_rules(xml_root(pkg,f'ppt/slides/slide{slide}.xml'),page)==[]
bad=copy.deepcopy(root)
edge=bad.find('.//a:tr/a:tc/a:tcPr/a:lnT',NS)
for c in list(edge):edge.remove(c)
ET.SubElement(edge,'{'+NS['a']+'}solidFill')
assert 'toc-top-rule-forbidden' in check_toc_rules(bad,page)
bad=copy.deepcopy(root)
for props in bad.findall('.//a:tr',NS)[0].findall('a:tc/a:tcPr',NS):
 edge=props.find('a:lnB',NS)
 for c in list(edge):edge.remove(c)
 ET.SubElement(edge,'{'+NS['a']+'}noFill')
assert 'toc-row-separator-mismatch' in check_toc_rules(bad,page)
assert check_layout_choice({'pageKind':'content'})==['layout-choice-missing']
assert check_layout_choice({'pageKind':'toc'})==[]
base={'pageKind':'content','layoutChoice':{'eligible':True,'selected':'left-text-right-visual','reason':'单一主张由右侧季度趋势支撑'}}
assert check_layout_choice(base)==[]
base['layoutChoice']['selected']='full-width-chart'
assert check_layout_choice(base)==['layout-alternative-reason-missing']
base['layoutChoice']['alternativeReason']='十二个类别标签需要整页宽度才能保持字号和可读性'
assert check_layout_choice(base)==[]
assert layout_selection_summary({'outputSlides':[base]})['reviewSuggested'] is True
base['layoutChoice']['selected']='left-text-right-visual'
assert layout_selection_summary({'outputSlides':[base]})['adoptionRate']==1
assert layout_selection_summary({'outputSlides':[]})['adoptionRate'] is None
pkg.archive.close()
`
 const p=spawnSync('python3',['-c',code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 expect(p.stderr).toBe(''); expect(p.status).toBe(0)
})
