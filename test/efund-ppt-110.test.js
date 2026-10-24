import { it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

it('rejects inherited title paint, theme shadows, TOC theme styling and stale visual evidence', () => {
  const result = execFileSync('python3', ['-c', String.raw`
import sys, tempfile, json, copy
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0, 'skills/efund-ppt-maker/scripts')
from check_efund_portability import *
from check_efund_visual_review import audit, digest, CHECKS
from check_efund_cover import open_package, logical_slide_part
p = open_package(Path('skills/efund-ppt-maker/assets/efund-template-v6.pptx'))
r = xml_root(p, logical_slide_part(p, 10))
title = next(x for x in r.findall('.//p:sp', NS) if object_id(x) == '4')
assert 'title-color-not-explicit' in check_title_paint(title)
for rp in title.findall('.//a:rPr', NS):
    fill = ET.SubElement(rp, '{'+NS['a']+'}solidFill')
    ET.SubElement(fill, '{'+NS['a']+'}srgbClr', val='FFFFFF')
assert not check_title_paint(title)
title.find('.//a:srgbClr',NS).set('val','000000')
assert 'title-color-mismatch' in check_title_paint(title)
bad = ET.fromstring('<a:rPr xmlns:a="'+NS['a']+'"><a:latin typeface="Arial"/><a:solidFill><a:srgbClr val="005096"/></a:solidFill></a:rPr>')
assert has_misordered_text_fill(bad)
fill=bad.find('a:solidFill',NS);bad.remove(fill);bad.insert(0,fill)
assert not has_misordered_text_fill(bad)
# Actual source TOC retains theme banding, even though its screenshot can look fine.
r = xml_root(p, logical_slide_part(p,7)); source=copy.deepcopy(r)
page={'tocLayout':{'sourceTableId':'5'},'tocRows':[{'tableId':'5','rowIndex':0}]}
assert 'toc-theme-banding-enabled' in check_toc_style(r,source,page)
tbl=r.find('.//a:tbl',NS)
for key in ('firstRow','bandRow'): tbl.find('a:tblPr',NS).set(key,'0')
for cell in tbl.findall('a:tr',NS)[0].findall('a:tc',NS):
    cp=cell.find('a:tcPr',NS)
    for edge in ('lnL','lnR','lnT','lnTlToBr','lnBlToTr'):
        for old in cp.findall('a:'+edge,NS):cp.remove(old)
        ln=ET.SubElement(cp,'{'+NS['a']+'}'+edge);ET.SubElement(ln,'{'+NS['a']+'}noFill')
    for old in cp.findall('a:solidFill',NS):cp.remove(old)
    fill=ET.SubElement(cp,'{'+NS['a']+'}solidFill');ET.SubElement(fill,'{'+NS['a']+'}srgbClr',val='FFFFFF')
assert not check_toc_style(r,source,page)
tbl.find('.//a:lnB',NS).set('w','12700')
assert 'toc-separator-style-mismatch' in check_toc_style(r,source,page)
# A referenced effect must fail even with a local empty effect list.
from unittest.mock import patch
fake=ET.fromstring('<p:sld xmlns:p="'+NS['p']+'" xmlns:a="'+NS['a']+'"><p:sp><p:spPr><a:effectLst/></p:spPr><p:style><a:effectRef idx="2"/></p:style></p:sp></p:sld>')
with patch('check_efund_portability.xml_root',return_value=fake),patch('check_efund_portability.relationships',return_value={}):
    assert 'render-theme-effect-reference' in check_portable_slide(None,'slide')
    fake.find('.//a:effectRef',NS).set('idx','0')
    assert not check_portable_slide(None,'slide')
with tempfile.TemporaryDirectory() as d:
    d=Path(d); deck=d/'deck';pdf=d/'pdf';im=d/'page.png';rev=d/'review.json'
    deck.write_bytes(b'deck');pdf.write_bytes(b'pdf');im.write_bytes(b'fixture')
    assert audit(deck,pdf,rev,1)
    record={'image':'page.png','imageSha256':digest(im),'renderer':'test','notes':'fixture only','checks':{k:'pass' for k in CHECKS}}
    data={'pptxSha256':digest(deck),'pdfSha256':digest(pdf),'method':'human','reviewer':'test fixture','pages':[{'page':1,'pptx':record,'pdf':record}]}
    data['pptxNativeVisit']={'application':'Microsoft PowerPoint','pptxSha256':digest(deck),'visitedPages':[1],'repairObserved':False,'contentLossObserved':False,'notes':'Metadata fixture only; not an actual native inspection'}
    rev.write_text(json.dumps(data));assert not audit(deck,pdf,rev,1)
    deck.write_bytes(b'changed');assert 'visual-review-artifact-stale' in audit(deck,pdf,rev,1)
p.archive.close()
print('passed')
`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  expect(result.trim()).toBe('passed')
})
