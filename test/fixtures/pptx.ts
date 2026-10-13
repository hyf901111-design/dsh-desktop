import { strToU8, zipSync } from 'fflate'
const p='http://schemas.openxmlformats.org/presentationml/2006/main', a='http://schemas.openxmlformats.org/drawingml/2006/main'
export function fixture() {
 return Buffer.from(zipSync({
  '[Content_Types].xml':strToU8('<Types/>'),'_rels/.rels':strToU8('<Relationships/>'),
  'ppt/presentation.xml':strToU8(`<p:presentation xmlns:p="${p}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>`),
  'ppt/_rels/presentation.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="second" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'),
  'ppt/slides/slide2.xml':strToU8(`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="标题"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1"/><a:t>年度</a:t></a:r><a:r><a:rPr i="1"/><a:t>报告</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="表格"/></p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>10 &amp; 20</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr sz="1200"/></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`),
  'ppt/slides/slide1.xml':strToU8(`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="正文"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>末页</a:t></a:r><a:br/><a:r><a:t>下一行</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`),
  'ppt/media/image1.png':new Uint8Array([137,80,78,71,0,1,2,3]),
  'ppt/charts/chart1.xml':strToU8('<chart>preserved</chart>')
 },{level:0}))
}

