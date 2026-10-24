import { it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

const fixture = String.raw`
import sys, tempfile, zipfile
from pathlib import Path
sys.path.insert(0, 'skills/efund-ppt-maker/scripts')
from check_efund_package import audit
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
C='http://schemas.openxmlformats.org/drawingml/2006/chart'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PR='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
SLIDE='application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
def package(order=('slide1.xml',), charts=None, hidden=(), extra=()):
    charts=charts or {}
    parts={}
    parts['ppt/presentation.xml']=f'<p:presentation xmlns:p="{P}" xmlns:r="{R}"><p:sldIdLst>'+''.join(f'<p:sldId id="{256+i}" r:id="s{i}"/>' for i,_ in enumerate(order))+'</p:sldIdLst></p:presentation>'
    parts['ppt/_rels/presentation.xml.rels']=f'<Relationships xmlns="{PR}">'+''.join(f'<Relationship Id="s{i}" Type="{R}/slide" Target="slides/{name}"/>' for i,name in enumerate(order))+'</Relationships>'
    for name in set(order).union(extra):
        objects=''.join(f'<p:graphicFrame><a:graphic><a:graphicData><c:chart r:id="c{i}"/></a:graphicData></a:graphic></p:graphicFrame>' for i,_ in enumerate(charts.get(name, ())))
        parts['ppt/slides/'+name]=f'<p:sld xmlns:p="{P}" xmlns:a="{A}" xmlns:c="{C}" xmlns:r="{R}" show="{0 if name in hidden else 1}"><p:cSld><p:spTree><p:grpSp>{objects}</p:grpSp></p:spTree></p:cSld></p:sld>'
        if charts.get(name):
            parts['ppt/slides/_rels/'+name+'.rels']=f'<Relationships xmlns="{PR}">'+''.join(f'<Relationship Id="c{i}" Type="{R}/chart" Target="../charts/{chart}"/>' for i,chart in enumerate(charts[name]))+'</Relationships>'
            for chart in charts[name]: parts['ppt/charts/'+chart]=f'<c:chartSpace xmlns:c="{C}"><c:chart/></c:chartSpace>'
    parts['[Content_Types].xml']=f'<Types xmlns="{CT}">'+''.join(f'<Override PartName="/ppt/slides/{name}" ContentType="{SLIDE}"/>' for name in set(order).union(extra))+'</Types>'
    return parts
def check(parts, **options):
    with tempfile.TemporaryDirectory() as d:
        path=Path(d)/'deck.pptx'
        with zipfile.ZipFile(path, 'w') as z:
            for name, data in parts.items(): z.writestr(name, data)
        return audit(path, **options)
def codes(result): return {item['code'] for item in result['issues']}
`

function python(code) {
  return execFileSync('python3', ['-c', fixture + code], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  })
}

it('checks the presentation slide list and makes orphan rejection explicit', () => {
  expect(python(String.raw`
p=package(order=('slide3.xml','slide1.xml'), extra=('unused.xml',))
r=check(p)
assert r['ok'] and r['slideCount']==2 and r['unlistedSlideParts']==['ppt/slides/unused.xml'], r
r=check(p, require_clean_slide_tree=True)
assert 'unlisted-slide-part' in codes(r), r
assert check(package(), require_clean_slide_tree=True)['ok']
print('passed')
` ).trim()).toBe('passed')
})

it('counts only distinct native charts referenced by visible presented slides', () => {
  expect(python(String.raw`
p=package(order=('slide3.xml','slide1.xml'), charts={'slide3.xml':['chartA.xml','chartA.xml'],'slide1.xml':['chartB.xml']})
r=check(p, min_native_charts=2)
assert r['ok'] and r['nativeChartCount']==2 and r['chartObjectCount']==3, r
p=package(order=('slide1.xml','hidden.xml'), charts={'hidden.xml':['chartH.xml']}, hidden=('hidden.xml',))
p['ppt/charts/orphan.xml']=f'<c:chartSpace xmlns:c="{C}"/>'
r=check(p, require_clean_slide_tree=True, min_native_charts=1)
assert r['slideCount']==2 and r['nativeChartCount']==0 and 'native-chart-count-below-minimum' in codes(r), r
assert 'unlisted-slide-part' not in codes(r), r
assert check(package())['ok']
print('passed')
` ).trim()).toBe('passed')
})

it('rejects malformed slide references and does not trust relationship filenames', () => {
  expect(python(String.raw`
for mutation in ('external','wrong-type','missing','wrong-root'):
 p=package()
 if mutation=='external': p['ppt/_rels/presentation.xml.rels']=p['ppt/_rels/presentation.xml.rels'].replace('Target="slides/', 'TargetMode="External" Target="slides/')
 if mutation=='wrong-type': p['ppt/_rels/presentation.xml.rels']=p['ppt/_rels/presentation.xml.rels'].replace('/slide"', '/image"')
 if mutation=='missing': del p['ppt/slides/slide1.xml']
 if mutation=='wrong-root': p['ppt/slides/slide1.xml']=f'<p:sldLayout xmlns:p="{P}"/>'
 assert not check(p)['ok'], mutation
assert 'slide-reference-duplicate' in codes(check(package(order=('slide1.xml','slide1.xml'))))
print('passed')
` ).trim()).toBe('passed')
})

it('rejects external, unresolved and wrongly typed chart links without counting them', () => {
  expect(python(String.raw`
for mutation in ('external','wrong-type','missing','wrong-root','missing-rel'):
 p=package(charts={'slide1.xml':['chartA.xml']})
 key='ppt/slides/_rels/slide1.xml.rels'
 if mutation=='external': p[key]=p[key].replace('Target="../', 'TargetMode="External" Target="../')
 if mutation=='wrong-type': p[key]=p[key].replace('/chart"','/image"')
 if mutation=='missing': del p['ppt/charts/chartA.xml']
 if mutation=='wrong-root': p['ppt/charts/chartA.xml']=f'<c:chart xmlns:c="{C}"/>'
 if mutation=='missing-rel': del p[key]
 r=check(p, min_native_charts=1)
 assert not r['ok'] and r['nativeChartCount']==0, (mutation,r)
 assert 'native-chart-count-below-minimum' in codes(r), (mutation,r)
print('passed')
` ).trim()).toBe('passed')
})

it('finds slide MIME parts outside the conventional folder and validates requested counts', () => {
  expect(python(String.raw`
p=package(extra=('unused.xml',))
p['custom/retained.xml']=p.pop('ppt/slides/unused.xml')
p['[Content_Types].xml']=p['[Content_Types].xml'].replace('/ppt/slides/unused.xml','/custom/retained.xml')
r=check(p, require_clean_slide_tree=True)
assert 'custom/retained.xml' in r['unlistedSlideParts'] and not r['ok'], r
for value in (-1, True, 1.5): assert 'native-chart-minimum-invalid' in codes(check(package(), min_native_charts=value))
print('passed')
` ).trim()).toBe('passed')
})

it('normalizes legal OPC targets and refuses targets escaping the package', () => {
  expect(python(String.raw`
p=package(charts={'slide1.xml':['chart A.xml']})
p['ppt/slides/_rels/slide1.xml.rels']=p['ppt/slides/_rels/slide1.xml.rels'].replace('../charts/chart A.xml','/ppt/charts/chart%20A.xml')
r=check(p, require_clean_slide_tree=True, min_native_charts=1)
assert r['ok'] and r['referencedChartParts']==['ppt/charts/chart A.xml'], r
p['ppt/slides/_rels/slide1.xml.rels']=p['ppt/slides/_rels/slide1.xml.rels'].replace('/ppt/charts/chart%20A.xml','../../../chart.xml')
assert 'chart-target-invalid' in codes(check(p)), check(p)
p=package()
p['[Content_Types].xml']=f'<Types xmlns="{CT}"/>'
assert 'slide-content-type-missing' in codes(check(p)), check(p)
print('passed')
` ).trim()).toBe('passed')
})

it('validates hidden chart references without adding them to the visible quota', () => {
  expect(python(String.raw`
p=package(order=('slide1.xml','hidden.xml'), charts={'hidden.xml':['chartH.xml']}, hidden=('hidden.xml',))
del p['ppt/charts/chartH.xml']
r=check(p)
assert not r['ok'] and 'chart-target-invalid' in codes(r), r
assert r['visibleSlideCount']==1 and r['nativeChartCount']==0 and r['chartObjectCount']==0, r
print('passed')
` ).trim()).toBe('passed')
})

it('writes an optional UTF-8 JSON report identical to stdout', () => {
  expect(python(String.raw`
import subprocess, json
with tempfile.TemporaryDirectory() as d:
 deck=Path(d)/'deck.pptx'
 with zipfile.ZipFile(deck,'w') as z:
  for name,data in package().items(): z.writestr(name,data)
 report=Path(d)/'新目录'/'报告.json'
 completed=subprocess.run([sys.executable,'skills/efund-ppt-maker/scripts/check_efund_package.py',str(deck),'--json-output',str(report)],capture_output=True,text=True)
 assert completed.returncode==0, completed.stderr
 assert json.loads(report.read_text(encoding='utf-8'))==json.loads(completed.stdout)
 assert report.read_text(encoding='utf-8').strip()==completed.stdout.strip()
print('passed')
` ).trim()).toBe('passed')
})

const axes = String.raw`
def chart_axes(first='-2068027336',second='-2113994440'):
 return f'<c:chartSpace xmlns:c="{C}"><c:chart><c:plotArea><c:barChart><c:axId val="{first}"/><c:axId val="{second}"/></c:barChart><c:catAx><c:axId val="{first}"/><c:crossAx val="{second}"/></c:catAx><c:valAx><c:axId val="{second}"/><c:crossAx val="{first}"/><c:crossesAt val="-3"/></c:valAx></c:plotArea></c:chart></c:chartSpace>'
`
it('rejects the actual signed axis IDs and unsigned wrap overflow in every chart, without requiring a chart quota',()=>{
 expect(python(axes+String.raw`
for values in [('-2068027336','-2113994440'),('2226939960','2180972856')]:
 for mode in ('visible','hidden','orphan'):
  p=package(charts={'slide1.xml':['chartA.xml']} if mode!='orphan' else {},hidden=('slide1.xml',) if mode=='hidden' else ())
  p['ppt/charts/chartA.xml']=chart_axes(*values)
  r=check(p)
  assert not r['ok'] and 'chart-axis-id-out-of-range' in codes(r), (mode,r)
  errors=[i for i in r['issues'] if i['code']=='chart-axis-id-out-of-range']
  assert len(errors)==6 and all(i['part']=='ppt/charts/chartA.xml' and i['xpath'] for i in errors), errors
print('passed')
`).trim()).toBe('passed')
})
it('runs the same axis safety guard in structure QA and binds the package result to the inspected bytes',()=>{
 expect(python(axes+String.raw`
import hashlib,re
from qa_efund_pptx import analyze
with tempfile.TemporaryDirectory() as d:
 path=Path(d)/'deck.pptx';p=package(charts={'slide1.xml':['chartA.xml']});p['ppt/charts/chartA.xml']=chart_axes()
 p['ppt/presentation.xml']=p['ppt/presentation.xml'].replace('</p:presentation>','<p:sldSz cx="9144000" cy="5143500"/></p:presentation>')
 with zipfile.ZipFile(path,'w') as z:
  for name,data in p.items():z.writestr(name,data)
 assert 'chart-axis-id-out-of-range' in codes(analyze(path))
 assert audit(path)['sha256']==hashlib.sha256(path.read_bytes()).hexdigest()
print('passed')
`).trim()).toBe('passed')
})
it('hashes and audits one byte snapshot when a generator replaces the path during validation',()=>{
 expect(python(axes+String.raw`
import io,hashlib
from unittest.mock import patch
import check_efund_package as module
def packed(parts):
 data=io.BytesIO()
 with zipfile.ZipFile(data,'w') as z:
  for name,value in parts.items():z.writestr(name,value)
 return data.getvalue()
bad=package(charts={'slide1.xml':['chartA.xml']});bad['ppt/charts/chartA.xml']=chart_axes()
good={**bad,'ppt/charts/chartA.xml':chart_axes('1','2')}
bad_bytes,good_bytes=packed(bad),packed(good)
with tempfile.TemporaryDirectory() as d:
 path=Path(d)/'live.pptx';path.write_bytes(bad_bytes);original_read=Path.read_bytes
 def read_and_replace(self):
  snapshot=original_read(self)
  if self==path:self.write_bytes(good_bytes)
  return snapshot
 with patch.object(Path,'read_bytes',read_and_replace):r=module.audit(path)
 assert r['sha256']==hashlib.sha256(bad_bytes).hexdigest()
 assert not r['ok'] and 'chart-axis-id-out-of-range' in codes(r),r
 assert path.read_bytes()==good_bytes
print('passed')
`).trim()).toBe('passed')
})
it('reassigns declared axes consistently to small positive IDs and preserves negative data and legal charts',()=>{
 expect(python(axes+String.raw`
import xml.etree.ElementTree as ET
from efund_chart_properties import normalize_axis_ids,chart_axis_issues
for values in [('-2068027336','-2113994440'),('2226939960','2180972856')]:
 root=ET.fromstring(chart_axes(*values))
 # A data value with a negative sign is unrelated to the axis identity.
 data=ET.SubElement(root.find('.//{'+C+'}barChart'),'{'+C+'}ser')
 ET.SubElement(ET.SubElement(data,'{'+C+'}val'),'{'+C+'}v').text='-3'
 assert len(chart_axis_issues(root,'chart.xml'))==6
 assert normalize_axis_ids(root)==6
 assert [x.get('val') for x in root.iter() if x.tag in ('{'+C+'}axId','{'+C+'}crossAx')]==['1','2','1','2','2','1']
 assert root.find('.//{'+C+'}crossesAt').get('val')=='-3'
 assert root.find('.//{'+C+'}ser/{'+C+'}val/{'+C+'}v').text=='-3'
 assert not chart_axis_issues(root,'chart.xml')
 after=ET.tostring(root);assert normalize_axis_ids(root)==0 and ET.tostring(root)==after
for values in [('2118791784','2140495176'),('0','2147483647')]:
 legal=ET.fromstring(chart_axes(*values));before=ET.tostring(legal)
 assert normalize_axis_ids(legal)==0 and ET.tostring(legal)==before
print('passed')
`).trim()).toBe('passed')
})
it('refuses ambiguous axis graphs and malformed values atomically instead of guessing or taking absolute values',()=>{
 expect(python(axes+String.raw`
import xml.etree.ElementTree as ET
from efund_chart_properties import normalize_axis_ids,chart_axis_issues
for value in ('','abc','1.5','4294967296','-2147483649','１２'):
 root=ET.fromstring(chart_axes());root.find('.//{'+C+'}crossAx').set('val',value);before=ET.tostring(root)
 assert chart_axis_issues(root,'chart.xml')
 try:normalize_axis_ids(root);assert False,value
 except ValueError:pass
 assert ET.tostring(root)==before
for mode in ('duplicate','unresolved','missing'):
 root=ET.fromstring(chart_axes())
 if mode=='duplicate':root.find('.//{'+C+'}valAx/{'+C+'}axId').set('val','-2068027336')
 if mode=='unresolved':root.find('.//{'+C+'}crossAx').set('val','12345')
 if mode=='missing':root.find('.//{'+C+'}catAx').remove(root.find('.//{'+C+'}catAx/{'+C+'}axId'))
 before=ET.tostring(root)
 try:normalize_axis_ids(root);assert False,mode
 except ValueError:pass
 assert ET.tostring(root)==before
print('passed')
`).trim()).toBe('passed')
})
