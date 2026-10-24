#!/usr/bin/env python3
"""Check spacing, rendered line endings and standard diagram balance.

Input uses the normalized layout JSON interface. Rendered lines must come from
actual final rendering, not text-length estimates. Missing evidence fails closed.
Only ordinary content pages are checked; locked cover/TOC/ending whitespace is exempt.
"""
import argparse
import json
import math
import re
from pathlib import Path


def rendered_bounds(element):
    layout = element.get('textLayout', {})
    if not isinstance(layout, dict):
        return None
    box = layout.get('bbox')
    if (layout.get('source') == 'rendered' and isinstance(box, list) and len(box) == 4
            and all(type(v) in (int, float) and math.isfinite(v) for v in box)
            and box[2] > 0 and box[3] > 0):
        return box
    return None


def audit_layout(data):
    elements = [e for e in data.get('elements', []) if e.get('scope') == 'slide' and len(e.get('bbox', [])) == 4]
    width = float(data.get('slide', {}).get('frame', {}).get('width', 960))
    scale = width / 960
    errors = []
    def label(e): return str(e.get('name') or e.get('id') or '')
    def add(code, *items): errors.append({'code': code, 'objects': [label(e) for e in items]})
    narrative = {label(e): e for e in elements
                 if label(e) in ('standard-narrative-title', 'standard-narrative-body')}
    if narrative:
        boxes = {}
        for name, e in narrative.items():
            box = rendered_bounds(e)
            if box is None:
                add('narrative-rendered-bounds-required', e)
            else:
                boxes[name] = box
                x, y, w, h = e['bbox']
                if (box[0] < x - 2 * scale or box[1] < y - 2 * scale
                        or box[0] + box[2] > x + w + 2 * scale
                        or box[1] + box[3] > y + h + 2 * scale):
                    add('narrative-text-outside-frame', e)
        if len(boxes) == 2:
            title, body = boxes['standard-narrative-title'], boxes['standard-narrative-body']
            gap = body[1] - title[1] - title[3]
            # The contract is 12–16px between actual glyph bounds, with 2px
            # tolerance for renderer rounding. Shape bounds cannot prove it.
            if not 10 * scale <= gap <= 18 * scale:
                add('narrative-title-body-gap', *narrative.values())
        body = boxes.get('standard-narrative-body')
        if body:
            for callout in elements:
                if not any(token in label(callout) for token in
                           ('takeaway', 'recommendation', 'suggestion', 'advice', 'conclusion', 'callout', 'summary-block')):
                    continue
                x, y, w, h = callout['bbox']
                if (min(body[0] + body[2], x + w) - max(body[0], x) > 2 * scale
                        and y + h > body[1] and y - body[1] - body[3] < 14 * scale):
                    add('narrative-callout-clearance', narrative['standard-narrative-body'], callout)
    # Category and value text are separate chart slots. A number may be inside
    # its own data bar, but it must never cover a category's rendered glyphs.
    categories = [e for e in elements if str(e.get('text', '')).strip() and
                  (label(e).startswith('chart-label-') or e.get('textRole') == 'chart-category-label')]
    values = [e for e in elements if str(e.get('text', '')).strip() and
              (label(e).startswith('chart-value-') or e.get('textRole') == 'chart-value-label')]
    if categories and values:
        ink = {}
        for e in categories + values:
            box = rendered_bounds(e)
            if box is None:
                add('chart-rendered-bounds-required', e)
            else:
                ink[id(e)] = box
        for category in categories:
            for value in values:
                a, b = ink.get(id(category)), ink.get(id(value))
                if (a is not None and b is not None
                        and min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]) > scale
                        and min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]) > scale):
                    add('chart-category-value-overlap', category, value)
    for e in elements:
        name = label(e)
        if any(x in name for x in ('footer', 'source-note', 'page-number', 'page-title')): continue
        text = str(e.get('text', '')).strip()
        layout = e.get('textLayout', {})
        if not isinstance(layout, dict):
            layout = {}
        if text and layout.get('lineCount', 0) > 1:
            lines = layout.get('lines')
            if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines) or len(lines) != layout['lineCount'] or layout.get('source') != 'rendered':
                add('rendered-lines-required', e)
            else:
                for line in lines:
                    chars = re.sub(r'[\s，。；：、！？,.!?;:（）()“”「」]', '', line)
                    if len(chars) == 1 and re.fullmatch(r'[\u3400-\u9fff]', chars):
                        add('orphan-cjk-line', e); break
        if 'table-title' in name or 'chart-title' in name:
            x,y,w,h=e['bbox']
            for visual in elements:
                if visual is e or visual.get('kind') not in ('table','chart','graphicFrame') and not any(t in label(visual) for t in ('task-list-table','chart-plot')): continue
                a,b,c,d=visual['bbox']
                if min(x+w,a+c)>max(x,a) and y <= b and b-(y+h)<16*scale:
                    add('heading-visual-clearance',e,visual)
    # Standard right column: center the complete process, including edge labels.
    region = next((e['bbox'] for e in elements if label(e)=='standard-visual-title'),None)
    nodes = [e for e in elements if re.search(r'-node-\d+$',label(e))]
    if region and len(nodes)>=2:
        prefix=label(nodes[0]).rsplit('-node-',1)[0]
        group=[e for e in elements if label(e).startswith(prefix+'-') and any(t in label(e) for t in ('-node-','-flow-label-','-connector-'))]
        left=min(e['bbox'][0] for e in group); right=max(e['bbox'][0]+e['bbox'][2] for e in group)
        gutter_left=left-region[0];gutter_right=region[0]+region[2]-right
        if abs(gutter_left-gutter_right)>max(32*scale,region[2]*.15):add('process-region-unbalanced',*group)
    cards=[e for e in elements if re.search(r'-card-\d+$',label(e))]
    for i,a in enumerate(cards):
        x,y,w,h=a['bbox']
        for b in cards[i+1:]:
            xx,yy,ww,hh=b['bbox']
            if min(y+h,yy+hh)>max(y,yy):
                gap=max(x,xx)-min(x+w,xx+ww)
                if 0<=gap<12*scale:add('peer-card-clearance',a,b)
            if min(x+w,xx+ww)>max(x,xx):
                gap=max(y,yy)-min(y+h,yy+hh)
                if 0<=gap<12*scale:add('peer-card-clearance',a,b)
    return errors


def audit(directory, mapping):
    pages={int(p['outputSlide']):p for p in mapping['outputSlides']}
    results=[];seen=set()
    for path in sorted(Path(directory).glob('*.layout.json')):
        data=json.loads(path.read_text());number=int(data['slide']['slide']);seen.add(number)
        if pages.get(number,{}).get('pageKind')=='content':
            results.extend({'slide':number,**e} for e in audit_layout(data))
    for number,page in pages.items():
        if page.get('pageKind')=='content' and number not in seen:results.append({'slide':number,'code':'layout-missing'})
    return results

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('layouts',type=Path);parser.add_argument('--map',type=Path,required=True)
    parser.add_argument('--json-output',type=Path)
    args=parser.parse_args();errors=audit(args.layouts,json.loads(args.map.read_text()))
    output=json.dumps({'ok':not errors,'issues':errors},ensure_ascii=False,indent=2)
    if args.json_output:args.json_output.parent.mkdir(parents=True,exist_ok=True);args.json_output.write_text(output)
    print(output);raise SystemExit(bool(errors))
