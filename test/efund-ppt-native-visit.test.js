import {it,expect} from 'vitest'
import {execFileSync} from 'node:child_process'

it('requires a hash-bound PowerPoint visit of every slide and rejects cover-only or later repair evidence',()=>{
 const result=execFileSync('python3',['-c',String.raw`
import sys,tempfile,json,copy
from pathlib import Path
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_visual_review import audit,digest,CHECKS
with tempfile.TemporaryDirectory() as directory:
 d=Path(directory);deck=d/'deck.pptx';pdf=d/'deck.pdf';review=d/'review.json'
 deck.write_bytes(b'unit-test-deck');pdf.write_bytes(b'unit-test-pdf')
 pages=[]
 for number in (1,2):
  image=d/f'page-{number}.png';image.write_bytes(f'unit-test-image-{number}'.encode())
  record={'image':image.name,'imageSha256':digest(image),'renderer':'fixture renderer','notes':'Metadata fixture, not a native inspection','checks':{check:'pass' for check in CHECKS}}
  pages.append({'page':number,'pptx':record,'pdf':record})
 data={'pptxSha256':digest(deck),'pdfSha256':digest(pdf),'method':'human','reviewer':'unit fixture','pages':pages}
 def check(value):
  review.write_text(json.dumps(value));return audit(deck,pdf,review,2)
 # Per-page pass flags and rendered images alone do not prove a native walk.
 assert 'pptx-native-visit-missing' in check(data)
 visit={'application':'Microsoft PowerPoint','pptxSha256':digest(deck),'visitedPages':[1,2],'repairObserved':False,'contentLossObserved':False,'notes':'Fixture for complete native-visit evidence; no actual UI action'}
 data['pptxNativeVisit']=visit
 assert not check(data)
 for visited in ([1],[],[1,1],[1,True],[1,2,3]):
  bad=copy.deepcopy(data);bad['pptxNativeVisit']['visitedPages']=visited
  assert 'pptx-native-visit-incomplete' in check(bad),visited
 for field in ('repairObserved','contentLossObserved'):
  for value in (True,None,0):
   bad=copy.deepcopy(data);bad['pptxNativeVisit'][field]=value
   assert 'pptx-native-visit-not-passed' in check(bad),(field,value)
 bad=copy.deepcopy(data);bad['pptxNativeVisit']['pptxSha256']='old-generation'
 assert 'pptx-native-visit-stale' in check(bad)
 bad=copy.deepcopy(data);bad['pptxNativeVisit']['application']='LibreOffice'
 assert 'pptx-native-visit-not-performed' in check(bad)
 bad=copy.deepcopy(data);bad['pptxNativeVisit']['notes']=''
 assert 'pptx-native-visit-not-performed' in check(bad)
 # Any save creates a new candidate requiring a fresh native walk.
 deck.write_bytes(b'next-generation')
 assert 'pptx-native-visit-stale' in check(data)
print('passed')
`],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 expect(result.trim()).toBe('passed')
})
