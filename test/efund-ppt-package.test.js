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
