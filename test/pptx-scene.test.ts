import {describe,it,expect} from 'vitest'
import {strToU8,strFromU8,unzipSync,zipSync} from 'fflate'
import {fixture} from './fixtures/pptx'
import * as scene from '../src/main/pptx/scene'

function drawingFixture(){
 const parts=unzipSync(fixture())
 parts['ppt/slides/slide2.xml']=strToU8(strFromU8(parts['ppt/slides/slide2.xml']!).replace('<p:spPr/>','<p:spPr><a:xfrm rot="60000"><a:off x="95250" y="190500"/><a:ext cx="1905000" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr>'))
 return zipSync(parts,{level:0})
}
describe('PPTX editable scene',()=>{
 it('identifies real slide objects, local geometry and paragraph identities',()=>{
  expect(typeof scene.readPptxScene).toBe('function')
  const doc=scene.readPptxScene(drawingFixture())
  expect(doc.slides[0]!.nodes[0]).toMatchObject({nodeId:'2',type:'shape',geometry:{x:10,y:20,width:200,height:100,rotation:1},fill:'FF0000'})
  expect(doc.slides[0]!.fields[0]).toMatchObject({nodeId:'2',paragraphIndex:0})
 })
 it('writes geometry and shape/text formatting while leaving media and other slides intact',()=>{
  const bytes=drawingFixture(),doc=scene.readPptxScene(bytes),id=doc.slides[0]!.nodes[0]!.id
  const changed=scene.editPptxScene(bytes,[{id,geometry:{x:30,y:40,width:240,height:150,rotation:15},fill:'00FF00',stroke:'0000FF',strokeWidth:2,fontSize:24,bold:false,color:'112233',preset:'ellipse'}])
  const updated=scene.readPptxScene(changed).slides[0]!.nodes[0]!
  expect(updated).toMatchObject({geometry:{x:30,y:40,width:240,height:150,rotation:15},fill:'00FF00',stroke:'0000FF',fontSize:24,bold:false,color:'112233',preset:'ellipse'})
  const oldParts=unzipSync(bytes),parts=unzipSync(changed)
  for(const name of Object.keys(oldParts).filter(n=>n!=='ppt/slides/slide2.xml'))expect(parts[name]).toEqual(oldParts[name])
 })
 it('rejects invalid dimensions and absent object identities without producing a file',()=>{
  const bytes=drawingFixture(),id=scene.readPptxScene(bytes).slides[0]!.nodes[0]!.id
  expect(()=>scene.editPptxScene(bytes,[{id,geometry:{x:0,y:0,width:-5,height:10,rotation:0}}])).toThrow()
  expect(()=>scene.editPptxScene(bytes,[{id:'unknown',fill:'fff'}])).toThrow()
 })
})

function chartFixture(){
 const parts=unzipSync(drawingFixture()), C='http://schemas.openxmlformats.org/drawingml/2006/chart',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
 parts['ppt/slides/slide2.xml']=strToU8(strFromU8(parts['ppt/slides/slide2.xml']!).replace('</p:spTree>',`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="销售图表"/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="3810000" cy="1905000"/></p:xfrm><a:graphic><a:graphicData><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="chart1"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree>`))
 parts['ppt/slides/_rels/slide2.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="chart1" Target="../charts/chart1.xml" Type="${R}/chart"/></Relationships>`)
 parts['ppt/charts/chart1.xml']=strToU8(`<c:chartSpace xmlns:c="${C}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>收入</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>一季度</c:v></c:pt><c:pt idx="1"><c:v>二季度</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea><c:legend><c:legendPos val="b"/></c:legend></c:chart><c:externalData r:id="workbook"/></c:chartSpace>`)
 parts['ppt/charts/_rels/chart1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="workbook" Target="../embeddings/data.xlsx" Type="${R}/package"/></Relationships>`)
 parts['ppt/embeddings/data.xlsx']=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'_rels/.rels':strToU8('<Relationships/>'),'xl/workbook.xml':strToU8(`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="sheet"/></sheets></workbook>`),'xl/_rels/workbook.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="sheet" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/worksheets/sheet1.xml':strToU8(`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>收入</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>一季度</t></is></c><c r="B2"><v>10</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>二季度</t></is></c><c r="B3"><v>20</v></c></row></sheetData></worksheet>`)},{level:0})
 return zipSync(parts,{level:0})
}
it('updates chart caches, title, colors and its embedded workbook cells together',()=>{
 const bytes=chartFixture(),doc=scene.readPptxScene(bytes),node=doc.slides[0]!.nodes.find((n:any)=>n.type==='chart')!
 expect(node.chart).toMatchObject({categories:['一季度','二季度'],series:[{name:'收入',values:[10,20]}],legend:true})
 const changed=scene.editPptxScene(bytes,[{id:node.id,chart:{...node.chart!,title:'销售增长',categories:['Q1','Q2'],legend:false,series:[{name:'销售额',values:[30,50],color:'FF8800'}]}}])
 const reopened=scene.readPptxScene(changed).slides[0]!.nodes.find((n:any)=>n.type==='chart')!.chart
 expect(reopened).toMatchObject({title:'销售增长',categories:['Q1','Q2'],legend:false,series:[{name:'销售额',values:[30,50],color:'FF8800'}]})
 const workbook=unzipSync(unzipSync(changed)['ppt/embeddings/data.xlsx']!),sheet=strFromU8(workbook['xl/worksheets/sheet1.xml']!)
 expect(sheet).toContain('销售额');expect(sheet).toContain('<v>30</v>');expect(sheet).toContain('<v>50</v>');expect(sheet).toContain('Q2')
 expect(unzipSync(changed)['ppt/media/image1.png']).toEqual(unzipSync(bytes)['ppt/media/image1.png'])
})

it('keeps the rest of a presentation editable when one chart exceeds the editing limit',()=>{
 const parts=unzipSync(chartFixture());parts['ppt/charts/chart1.xml']=strToU8(strFromU8(parts['ppt/charts/chart1.xml']!).replace(/val="2"/g,'val="2000"'))
 const opened=scene.readPptxScene(zipSync(parts,{level:0}));expect(opened.slides[0]!.fields.length).toBeGreaterThan(0)
 expect(opened.slides[0]!.nodes.find(n=>n.type==='chart')?.chartWarning).toContain('数据点')
})
it('preserves chart XML child order and literal series-name representation',()=>{
 const parts=unzipSync(chartFixture());parts['ppt/charts/chart1.xml']=strToU8(strFromU8(parts['ppt/charts/chart1.xml']!).replace(/<c:tx>.*?<\/c:tx>/,'<c:tx><c:v>收入</c:v></c:tx>'))
 const bytes=zipSync(parts,{level:0}),node=scene.readPptxScene(bytes).slides[0]!.nodes.find(n=>n.chart)!
 const changed=scene.editPptxScene(bytes,[{id:node.id,chart:{...node.chart!,series:[{name:'新名称',values:[30,40],color:'112233'}]}}]),chart=strFromU8(unzipSync(changed)['ppt/charts/chart1.xml']!)
 expect(chart).toContain('<c:tx><c:v>新名称</c:v></c:tx>');expect(chart.indexOf('<c:spPr>')).toBeLessThan(chart.indexOf('<c:cat>'))
})
it('retains a workbook-linked title and data formulas when only chart style changes',()=>{
 const parts=unzipSync(chartFixture());parts['ppt/charts/chart1.xml']=strToU8(strFromU8(parts['ppt/charts/chart1.xml']!).replace('<c:chart>','<c:chart><c:title><c:tx><c:strRef><c:f>Sheet1!$C$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>工作簿标题</c:v></c:pt></c:strCache></c:strRef></c:tx></c:title>'))
 const book=unzipSync(parts['ppt/embeddings/data.xlsx']!);book['xl/worksheets/sheet1.xml']=strToU8(strFromU8(book['xl/worksheets/sheet1.xml']!).replace('<c r="B2"><v>10</v></c>','<c r="B2"><f>SUM(10)</f><v>10</v></c>'));parts['ppt/embeddings/data.xlsx']=zipSync(book,{level:0})
 const bytes=zipSync(parts,{level:0}),node=scene.readPptxScene(bytes).slides[0]!.nodes.find(n=>n.chart)!
 expect(node.chart?.title).toBe('工作簿标题')
 const styled=scene.editPptxScene(bytes,[{id:node.id,chart:{...node.chart!,series:node.chart!.series.map(s=>({...s,color:'112233'}))}}])
 expect(unzipSync(styled)['ppt/embeddings/data.xlsx']).toEqual(parts['ppt/embeddings/data.xlsx'])
 expect(strFromU8(unzipSync(styled)['ppt/charts/chart1.xml']!)).toContain('<c:title><c:tx><c:strRef>')
 const data=scene.editPptxScene(bytes,[{id:node.id,chart:{...node.chart!,series:[{...node.chart!.series[0]!,values:[10,50]}]}}])
 expect(strFromU8(unzipSync(unzipSync(data)['ppt/embeddings/data.xlsx']!)['xl/worksheets/sheet1.xml']!)).toContain('<f>SUM(10)</f>')
})
it('updates cached chart data without an embedded workbook and preserves unchanged color transforms',()=>{
 const parts=unzipSync(chartFixture());parts['ppt/charts/chart1.xml']=strToU8(strFromU8(parts['ppt/charts/chart1.xml']!).replace('<c:externalData r:id="workbook"/>','').replace('<c:cat>','<c:spPr><a:solidFill><a:srgbClr val="112233"><a:alpha val="50000"/></a:srgbClr></a:solidFill></c:spPr><c:cat>'))
 const bytes=zipSync(parts,{level:0}),node=scene.readPptxScene(bytes).slides[0]!.nodes.find(n=>n.chart)!,changed=scene.editPptxScene(bytes,[{id:node.id,chart:{...node.chart!,title:'新标题',categories:['Q1','Q2'],series:[{...node.chart!.series[0]!,name:'新系列',values:[30,40]}]}}])
 expect(scene.readPptxScene(changed).slides[0]!.nodes.find(n=>n.chart)?.chart).toMatchObject({categories:['Q1','Q2'],series:[{name:'新系列',values:[30,40]}]})
 expect(strFromU8(unzipSync(changed)['ppt/charts/chart1.xml']!)).toContain('<a:alpha val="50000"/>')
})
