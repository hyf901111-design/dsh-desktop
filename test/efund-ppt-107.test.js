import {it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
it('rejects misplaced title, table grid and missing chapter transitions',()=>{
 const code=`import sys, xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import check_title, check_table, check_chapters
ns='http://schemas.openxmlformats.org/drawingml/2006/main'
assert 'title-anchor-mismatch' in check_title((0,0,50,10),(4,3,50,10))
assert check_title((4,3,50,10),(4,3,50,10)) == []
cell=ET.fromstring('<a:tcPr xmlns:a="'+ns+'"><a:lnL><a:solidFill/></a:lnL></a:tcPr>')
assert 'table-border-visible' in check_table(cell)
clean=ET.fromstring('<a:tcPr xmlns:a="'+ns+'">'+''.join('<a:'+x+'><a:noFill/></a:'+x+'>' for x in ['lnL','lnR','lnT','lnB','lnTlToBr','lnBlToTr'])+'</a:tcPr>')
assert check_table(clean)==[]
chapters=[{'id':'a','title':'甲'},{'id':'b','title':'乙'}]
good=[{'pageKind':'toc','activeChapterId':'a'},{'pageKind':'content','chapterId':'a'},{'pageKind':'toc','activeChapterId':'b'},{'pageKind':'content','chapterId':'b'}]
assert check_chapters(chapters,good)==[]
assert 'chapter-toc-missing' in check_chapters(chapters,[good[0],good[1],good[3]])
assert 'chapter-highlight-mismatch' in check_chapters(chapters,[{**good[0],'activeChapterId':'b'},*good[1:]])
`
 const p=spawnSync('python3',['-c',code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});expect(p.stderr).toBe('');expect(p.status).toBe(0)
})

it('audits final PPTX XML rather than trusting the declared title position',()=>{
 const code=`import sys, tempfile, zipfile
from pathlib import Path
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_delivery import audit
p='http://schemas.openxmlformats.org/presentationml/2006/main'
a='http://schemas.openxmlformats.org/drawingml/2006/main'
r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
pr='http://schemas.openxmlformats.org/package/2006/relationships'
def write(path,x):
 with zipfile.ZipFile(path,'w') as z:
  z.writestr('ppt/presentation.xml',f'<p:presentation xmlns:p="{p}" xmlns:r="{r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>')
  z.writestr('ppt/_rels/presentation.xml.rels',f'<Relationships xmlns="{pr}"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>')
  z.writestr('ppt/slides/slide1.xml',f'<p:sld xmlns:p="{p}" xmlns:a="{a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="title"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="300000"/><a:ext cx="5000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>正文</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>')
with tempfile.TemporaryDirectory() as temp:
 source=Path(temp)/'source.pptx';output=Path(temp)/'output.pptx'
 mapping={'chapters':[{'id':'a','title':'正文'}],'outputSlides':[{'outputSlide':1,'pageKind':'content','chapterId':'a','layoutChoice':{'eligible':False,'selected':'full-width','reason':'此页仅用于题名几何验证'},'titleAnchor':{'sourceSlide':1,'sourceShapeId':'2','outputShapeId':'2'}}]}
 write(source,400000);write(output,400000)
 assert audit(output,source,mapping)==[]
 write(output,0)
 assert 'title-anchor-mismatch' in [i['code'] for i in audit(output,source,mapping)]
`
 const p=spawnSync('python3',['-c',code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 expect(p.stderr).toBe('');expect(p.status).toBe(0)
})
