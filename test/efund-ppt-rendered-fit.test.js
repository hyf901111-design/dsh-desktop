import { it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

function python(code) {
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}

it('rejects wrapped narrative ink outside its frame and text hidden behind a takeaway', () => python(String.raw`
import sys,copy
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_readability import audit_layout
def e(name,frame,ink,text):
 return {'id':name,'name':name,'scope':'slide','bbox':frame,'text':text,'textLayout':{'source':'rendered','lineCount':1,'lines':[text],'bbox':ink}}
def codes(data):return {i['code'] for i in audit_layout(data)}
title=e('standard-narrative-title',[38,102,320,22],[38,105,300,20],'解释标题')
body=e('standard-narrative-body',[38,136,320,200],[38,140,300,120],'解释正文')
callout={'id':'takeaway','name':'takeaway-13','scope':'slide','bbox':[38,372,320,84],'text':'研读结论'}
good={'elements':[title,body,callout]}
assert not audit_layout(good)
# The observed new P13 title rendered to y=150.3 inside a frame ending at y=124.
wrapped=copy.deepcopy(good)
wrapped['elements'][0]['textLayout'].update(bbox=[37.984,104.8853,319.9333,45.4128],lineCount=2,lines=['只有强护城河与低成本资本组合','NPV为正'])
assert 'narrative-text-outside-frame' in codes(wrapped)
# A safe shape gap (36px) cannot prove the body is clear of the takeaway.
overflow=copy.deepcopy(good)
overflow['elements'][1]['textLayout']['bbox']=[38,140,300,300]
assert 'narrative-text-outside-frame' in codes(overflow)
assert 'narrative-callout-clearance' in codes(overflow)
# The comparison uses actual ink rather than the blank part of a tall text box.
tall=copy.deepcopy(good)
tall['elements'][1]['bbox'][3]=300
assert not audit_layout(tall)
# Takeaways in another column or above the body are not lower-callout collisions.
elsewhere=copy.deepcopy(good);elsewhere['elements'][2]['bbox']=[500,200,320,84]
assert not audit_layout(elsewhere)
above=copy.deepcopy(good);above['elements'][2]['bbox']=[38,20,320,32]
assert not audit_layout(above)
`))

it('checks rendered category/value ink without banning values placed inside data bars', () => python(String.raw`
import sys,copy
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_readability import audit_layout
def e(name,frame,ink,text):
 return {'id':name,'name':name,'scope':'slide','bbox':frame,'text':text,'textLayout':{'source':'rendered','lineCount':1,'lines':[text],'bbox':ink}}
def codes(data):return {i['code'] for i in audit_layout(data)}
# New P13: the negative value –1.7 overlaps the last word of its category.
category=e('chart-label-3',[392,255,130,16],[391.9747,256.336,93.8093,13.4128],'高风险·强护城河')
value=e('chart-value-3',[475,255,60,16],[475.5773,256.336,23.3523,13.4128],'–1.7')
bad={'elements':[category,value]}
assert 'chart-category-value-overlap' in codes(bad)
good=copy.deepcopy(bad);good['elements'][1]['textLayout']['bbox'][0]=535
good['elements'].append({'id':'mark','name':'chart-bar-3','scope':'slide','bbox':[530,250,80,26]})
assert not audit_layout(good)
del good['elements'][0]['textLayout']['bbox']
assert 'chart-rendered-bounds-required' in codes(good)
good['elements'][0]['textLayout']['bbox']=[392,255,float('nan'),16]
assert 'chart-rendered-bounds-required' in codes(good)
for invalid in (None,[],['rendered'],'rendered'):
 good['elements'][0]['textLayout']=invalid
 assert 'chart-rendered-bounds-required' in codes(good)
# A generic diagram label has no category/value slot contract.
assert not audit_layout({'elements':[e('node-label',[0,0,100,20],[0,0,100,20],'节点'),e('metric-value',[0,0,100,20],[0,0,100,20],'42')]})
`))

it('uses rendered body ink for callout clearance instead of unused text-frame height', () => python(String.raw`
import sys,json,tempfile
from pathlib import Path
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from lint_efund_layouts import analyze_file
data={'slide':{'slide':1},'elements':[
 {'id':'body','name':'standard-narrative-body','scope':'slide','bbox':[38,136,320,300],'text':'真实正文','resolvedFontSize':16,'textLayout':{'source':'rendered','lineCount':4,'lines':['第1行正文','第2行正文','第3行正文','第4行正文'],'bbox':[38,140,300,120]}},
 {'id':'takeaway','name':'takeaway-13','scope':'slide','bbox':[38,372,320,84],'text':'研读结论'}]}
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'slide.layout.json';p.write_text(json.dumps(data));codes=lambda:{x['code'] for x in analyze_file(p)[1]}
 assert 'narrative-callout-clearance' not in codes()
 data['elements'][0]['textLayout']['bbox'][3]=300;p.write_text(json.dumps(data))
 assert 'narrative-callout-clearance' in codes()
`))

it('matches complete narrative text to rendered lines without accepting partial or other-column text', () => python(String.raw`
import sys,copy
sys.path.insert(0,'skills/efund-ppt-maker/scripts')
from check_efund_readability import audit_layout
full='报告测算 2025—2027 年 AI 相关投资 3.1 万亿美元的净现值：基准情形为 –0.9 万亿美元。\n强护城河（捕获 70% 价值）加低折现率（10%）：NPV +4.1 万亿美元；弱护城河（20%）加高折现率（25%）：–2.7 万亿美元。\n口径：EBITDA 利润率 37%（标普 500 第 75 分位）、25 年 EBIT 折现、股东捕获 40%。'
def data(lines):
 return {'elements':[{'id':'body','name':'standard-narrative-body','scope':'slide','bbox':[38,128,320,236],'text':full,'textLayout':{'source':'rendered','lineCount':len(lines),'lines':lines,'bbox':[38,140,300,180]}}]}
def codes(d):return {i['code'] for i in audit_layout(d)}
# Current real P13 export matched only the first line and called its bbox complete.
assert 'narrative-rendered-text-mismatch' in codes(data(['报告测算 2025—2027 年 AI 相关投资 3.1']))
# Earlier real P13 export mixed in labels from the right-hand chart.
assert 'narrative-rendered-text-mismatch' in codes(data([full,'低风险·强护城河']))
assert 'narrative-rendered-text-mismatch' in codes(data([full[:int(len(full)*.9)]]))
# Reflow, paragraph boundaries, spaces between runs and CJK line breaks are valid.
wrapped=full.replace('AI','A I').replace('（捕获','\n（捕获').replace('股东捕获','股东\t捕获').replace('万亿美元','万亿\u3000美元')
assert not audit_layout(data(wrapped.split('\n')))
assert 'narrative-rendered-text-mismatch' in codes(data([full.replace('–0.9','-0.9')]))
assert 'narrative-rendered-text-mismatch' in codes(data([full.replace('（10%）','(10%)')]))
# This completeness contract is limited to the two standard narrative objects.
ordinary=data(['部分文字']);ordinary['elements'][0]['name']='module-description'
assert 'narrative-rendered-text-mismatch' not in codes(ordinary)
title=data(['错误标题']);title['elements'][0].update(name='standard-narrative-title',text='完整标题')
assert 'narrative-rendered-text-mismatch' in codes(title)
# Literal symbols in XML text remain content; no punctuation is stripped.
literal=data(['• 2026 年增长 2.25%。']);literal['elements'][0]['text']='•2026年增长2.25%。'
assert not audit_layout(literal)
generated=data(['•'+full])
assert 'narrative-rendered-text-mismatch' in codes(generated)
# Explicit renderer-generated list glyphs need a separate list-aware review,
# never blanket removal of prefixes that might be semantic numbers/symbols.
generated['elements'][0]['textLayout']['generatedListMarkers']=True
assert 'narrative-rendered-text-review-required' in codes(generated)
assert 'narrative-rendered-text-mismatch' not in codes(generated)
ordinary['elements'][0]['text']='第1条\n第2条'
ordinary['elements'][0]['textLayout'].update(lines=['1. 第1条','2. 第2条'],lineCount=2)
assert 'narrative-rendered-text-mismatch' not in codes(ordinary)
`))
