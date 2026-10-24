import {it,expect} from 'vitest'
import {execFileSync} from 'node:child_process'

const setup=String.raw`
import sys,copy,tempfile,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from efund_chart_properties import chart_label_issues,normalize_label_positions,default_label_position
C='http://schemas.openxmlformats.org/drawingml/2006/chart'
def root():return ET.fromstring(f'<c:chartSpace xmlns:c="{C}"><c:chart><c:plotArea/></c:chart></c:chartSpace>')
def labels(plot,position):
 group=ET.SubElement(plot,'{'+C+'}dLbls');return ET.SubElement(group,'{'+C+'}dLblPos',val=position)
def codes(items):return {item['code'] for item in items}
`
function python(code){return execFileSync('python3',['-c',setup+code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}).trim()}

it('rejects the native P13 regression at plot level and normalizes the known incompatible line position',()=>{
 expect(python(String.raw`
r=root();line=ET.SubElement(r.find('.//{'+C+'}plotArea'),'{'+C+'}lineChart');position=labels(line,'outEnd')
assert default_label_position('lineChart')=='t' and default_label_position('barChart')=='outEnd'
issues=chart_label_issues(r,'ppt/charts/chart17.xml')
assert len(issues)==1 and 'chart-label-position-incompatible' in codes(issues)
assert issues[0]['part']=='ppt/charts/chart17.xml' and issues[0]['xpath'] and issues[0]['value']=='outEnd'
assert normalize_label_positions(r)==1 and position.get('val')=='t'
assert not chart_label_issues(r,'chart.xml') and normalize_label_positions(r)==0
print('passed')
`)).toBe('passed')
})
it('scopes type rules to the proper plot, including series and point overrides, while preserving bar outEnd and text',()=>{
 expect(python(String.raw`
r=root();area=r.find('.//{'+C+'}plotArea')
bar=ET.SubElement(area,'{'+C+'}barChart');bar_position=labels(bar,'outEnd')
line=ET.SubElement(area,'{'+C+'}lineChart');plot_position=labels(line,'outEnd')
series=ET.SubElement(line,'{'+C+'}ser');series_position=labels(series,'inEnd')
point=ET.SubElement(series.find('{'+C+'}dLbls'),'{'+C+'}dLbl');point_position=ET.SubElement(point,'{'+C+'}dLblPos',val='inBase')
ET.SubElement(ET.SubElement(point,'{'+C+'}tx'),'{'+C+'}v').text='负值 -2.7'
bar_before=ET.tostring(bar)
assert len(chart_label_issues(r,'mixed.xml'))==3
assert normalize_label_positions(r)==3
assert all(node.get('val')=='t' for node in (plot_position,series_position,point_position))
assert ET.tostring(bar)==bar_before and bar_position.get('val')=='outEnd'
assert point.find('{'+C+'}tx/{'+C+'}v').text=='负值 -2.7'
assert not chart_label_issues(r,'mixed.xml')
print('passed')
`)).toBe('passed')
})
it('preserves valid line positions, omitted native defaults and deleted labels, and refuses malformed values atomically',()=>{
 expect(python(String.raw`
for value in ('l','r','b','t','ctr'):
 r=root();line=ET.SubElement(r.find('.//{'+C+'}plotArea'),'{'+C+'}lineChart');labels(line,value);before=ET.tostring(r)
 assert not chart_label_issues(r,'chart.xml') and normalize_label_positions(r)==0 and ET.tostring(r)==before
r=root();line=ET.SubElement(r.find('.//{'+C+'}plotArea'),'{'+C+'}lineChart')
group=ET.SubElement(line,'{'+C+'}dLbls');ET.SubElement(group,'{'+C+'}delete',val='1');before=ET.tostring(r)
assert normalize_label_positions(r)==0 and ET.tostring(r)==before
labels(line,'outEnd');bad=labels(line,'above');before=ET.tostring(r)
assert 'chart-label-position-invalid' in codes(chart_label_issues(r,'chart.xml'))
try:normalize_label_positions(r);assert False
except ValueError:pass
assert ET.tostring(r)==before
print('passed')
`)).toBe('passed')
})
it('blocks the typed position in both default package and structure gates, even for an uncounted chart part',()=>{
 expect(python(String.raw`
from check_efund_package import audit
from qa_efund_pptx import analyze
P='http://schemas.openxmlformats.org/presentationml/2006/main';CT='http://schemas.openxmlformats.org/package/2006/content-types'
r=root();line=ET.SubElement(r.find('.//{'+C+'}plotArea'),'{'+C+'}lineChart');labels(line,'outEnd')
with tempfile.TemporaryDirectory() as d:
 deck=Path(d)/'deck.pptx'
 with zipfile.ZipFile(deck,'w') as z:
  z.writestr('ppt/presentation.xml',f'<p:presentation xmlns:p="{P}"><p:sldIdLst/><p:sldSz cx="9144000" cy="5143500"/></p:presentation>')
  z.writestr('[Content_Types].xml',f'<Types xmlns="{CT}"/>')
  z.writestr('custom/native-plot.xml',ET.tostring(r))
 assert 'chart-label-position-incompatible' in codes(audit(deck)['issues'])
 assert 'chart-label-position-incompatible' in codes(analyze(deck)['issues'])
print('passed')
`)).toBe('passed')
})
