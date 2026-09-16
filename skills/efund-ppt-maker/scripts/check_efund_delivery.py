#!/usr/bin/env python3
"""Check actual PPTX title anchors, explicit table edges, and chapter navigation."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from check_efund_cover import (open_package, logical_slide_part, linked_layout_part,
                              xml_root, object_id, element_geometry, NS)


def check_title(actual, reference, tolerance=0):
    if actual is None or reference is None:
        return ['title-anchor-unresolved']
    return ['title-anchor-mismatch'] if any(abs(a-b) > tolerance for a, b in zip(actual, reference)) else []


def check_table(cell):
    for edge in ['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr']:
        line = cell.find('a:' + edge, NS)
        if line is None or line.find('a:noFill', NS) is None:
            return ['table-border-visible']
    return []


def check_chapters(chapters, pages, require_toc=True):
    errors = []
    known = [chapter['id'] for chapter in chapters]
    if len(set(known)) != len(known):
        errors.append('chapter-id-duplicate')
    previous = None
    entered = []
    for i, page in enumerate(pages):
        kind = page.get('pageKind')
        if kind == 'toc':
            if previous is not None and previous == page.get('activeChapterId'):
                errors.append('chapter-toc-inside-chapter')
            if i+1 >= len(pages) or pages[i+1].get('pageKind') != 'content':
                errors.append('chapter-toc-without-content')
            elif page.get('activeChapterId') != pages[i+1].get('chapterId'):
                errors.append('chapter-highlight-mismatch')
        if kind != 'content':
            continue
        chapter = page.get('chapterId')
        if chapter not in known:
            errors.append('chapter-id-missing')
        if chapter != previous:
            if require_toc and (i == 0 or pages[i-1].get('pageKind') != 'toc'):
                errors.append('chapter-toc-missing')
            if chapter in entered:
                errors.append('chapter-content-not-contiguous')
            entered.append(chapter)
        previous = chapter
    if entered != known:
        errors.append('chapter-order-mismatch')
    return errors


def find_shape(root, shape_id):
    return next((e for e in root.iter() if e.tag.endswith('}sp') and object_id(e) == str(shape_id)), None)


def resolved_shape(package, part, shape):
    """Use matching layout placeholder when the slide inherits its geometry."""
    if shape is None or element_geometry(shape) is not None:
        return shape
    ph = shape.find('./p:nvSpPr/p:nvPr/p:ph', NS)
    if ph is None:
        return shape
    layout = xml_root(package, linked_layout_part(package, part))
    for candidate in layout.findall('.//p:sp', NS):
        other = candidate.find('./p:nvSpPr/p:nvPr/p:ph', NS)
        if other is not None and other.get('idx', '0') == ph.get('idx', '0') and other.get('type', 'body') == ph.get('type', 'body'):
            return candidate
    return shape


def table_rows(root, table_id):
    frame = next((e for e in root.findall('.//p:graphicFrame', NS)
                  if object_id(e) == str(table_id)), None)
    if frame is None:
        raise ValueError('TOC table missing')
    y = int(frame.find('p:xfrm/a:off', NS).get('y'))
    result = []
    for row in frame.findall('.//a:tbl/a:tr', NS):
        height = int(row.get('h'))
        result.append((y + height / 2, row))
        y += height
    return result


def toc_item(root, item):
    if 'tableId' in item:
        center, row = table_rows(root, item['tableId'])[item['rowIndex']]
        return row.findall('a:tc', NS)[item['columnIndex']], center
    shape = find_shape(root, item.get('shapeId'))
    geometry = element_geometry(shape) if shape is not None else None
    if geometry is None:
        raise ValueError('TOC shape geometry missing')
    return shape, geometry[1] + geometry[3] / 2


def check_toc_spacing(root, source_root, page, tolerance):
    try:
        expected = table_rows(source_root, page['tocLayout']['sourceTableId'])
        rows = page['tocRows']
        if len(rows) > len(expected):
            return ['toc-source-capacity-exceeded']
        for index, row in enumerate(rows):
            _, center = toc_item(root, row)
            number = row.get('numberCell', {'shapeId': row.get('numberShapeId')})
            _, number_center = toc_item(root, number)
            if abs(center - expected[index][0]) > tolerance or abs(number_center - expected[index][0]) > tolerance:
                return ['toc-row-spacing-mismatch']
        return []
    except (KeyError, ValueError, TypeError, IndexError, AttributeError):
        return ['toc-layout-unresolved']


def audit(pptx, source, mapping):
    output, reference = open_package(pptx), open_package(source)
    issues = []
    def add(code, slide=0):
        issues.append({'severity': 'error', 'code': code, 'slide': slide})
    try:
        pages = mapping.get('outputSlides', [])
        count = len(xml_root(output, 'ppt/presentation.xml').findall('./p:sldIdLst/p:sldId', NS))
        if [p.get('outputSlide') for p in pages] != list(range(1, count+1)):
            add('delivery-map-incomplete')
        chapters = mapping.get('chapters')
        if not isinstance(chapters, list) or not chapters:
            add('chapter-plan-missing')
        else:
            for code in check_chapters(chapters, pages, require_toc=len(chapters) > 1): add(code)
        for page in pages:
            number = page['outputSlide']
            part = logical_slide_part(output, number)
            root = xml_root(output, part)
            # Tables must override inherited styles explicitly, including merged edges.
            for cell in root.findall('.//a:tc', NS):
                props = cell.find('a:tcPr', NS)
                for code in check_table(props if props is not None else ET.Element('empty')): add(code, number)
            for shape in root.findall('.//p:sp', NS):
                nv = shape.find('./p:nvSpPr/p:cNvPr', NS)
                name = nv.get('name', '') if nv is not None else ''
                if name.startswith(('table-', 'grouped-table-', 'comparison-table-')):
                    line = shape.find('./p:spPr/a:ln', NS)
                    if line is None or line.find('a:noFill', NS) is None: add('table-border-visible', number)
            if page.get('pageKind') in ('content', 'toc'):
                anchor = page.get('titleAnchor', {})
                if not all(k in anchor for k in ('sourceShapeId','outputShapeId','sourceSlide')):
                    add('title-anchor-missing', number)
                else:
                    ref_part = logical_slide_part(reference, anchor['sourceSlide'])
                    if anchor.get('sourceScope') == 'layout': ref_part = linked_layout_part(reference, ref_part)
                    ref_shape = resolved_shape(reference, ref_part, find_shape(xml_root(reference, ref_part), anchor['sourceShapeId']))
                    actual = resolved_shape(output, part, find_shape(root, anchor['outputShapeId']))
                    for code in check_title(element_geometry(actual) if actual is not None else None,
                                            element_geometry(ref_shape) if ref_shape is not None else None,
                                            tolerance=output.canvas[0]/1920): add(code, number)
                    if actual is not None and ref_shape is not None:
                        a, b = actual.find('p:txBody/a:bodyPr', NS), ref_shape.find('p:txBody/a:bodyPr', NS)
                        for key in ('anchor','lIns','rIns','tIns','bIns','vert'):
                            if (a.get(key) if a is not None else None) != (b.get(key) if b is not None else None): add('title-text-frame-mismatch',number)
            if page.get('pageKind') == 'toc' and chapters:
                rows = page.get('tocRows', [])
                if [r.get('chapterId') for r in rows] != [c['id'] for c in chapters]: add('toc-rows-incomplete',number)
                layout = page.get('tocLayout', {})
                if 'sourceSlide' not in layout:
                    add('toc-layout-unresolved', number)
                else:
                    source_root = xml_root(reference, logical_slide_part(reference, layout['sourceSlide']))
                    for code in check_toc_spacing(root, source_root, page, output.canvas[0]/1920): add(code, number)
                for row, chapter in zip(rows,chapters):
                    try:
                        shape, _ = toc_item(root, row)
                    except (KeyError, ValueError, TypeError, IndexError, AttributeError):
                        shape = None
                    if shape is None: add('toc-shape-missing',number); continue
                    if ''.join(t.text or '' for t in shape.findall('.//a:t',NS)).strip() != chapter['title']: add('toc-label-mismatch',number)
                    active = chapter['id'] == page.get('activeChapterId')
                    expected = page.get('tocActiveColor','00529B') if active else page.get('tocInactiveColor','D9D9D9')
                    runs = shape.findall('.//a:r',NS)
                    if not runs or any(r.find('a:rPr/a:solidFill/a:srgbClr',NS) is None or r.find('a:rPr/a:solidFill/a:srgbClr',NS).get('val','').upper()!=expected.upper() for r in runs): add('toc-highlight-color-mismatch',number)
    finally:
        output.archive.close(); reference.archive.close()
    return issues


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx',type=Path);parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--map',type=Path,required=True);parser.add_argument('--json-output',type=Path)
    args=parser.parse_args()
    try:
        issues=audit(args.pptx,args.source,json.loads(args.map.read_text()))
    except Exception as error:
        issues=[{'severity':'error','code':'delivery-audit-failed','message':str(error)}]
    result=json.dumps({'ok':not issues,'issues':issues},ensure_ascii=False,indent=2)
    if args.json_output: args.json_output.parent.mkdir(parents=True,exist_ok=True);args.json_output.write_text(result)
    print(result);raise SystemExit(bool(issues))
