"""Portable appearance checks. Missing explicit paint is a failure, not guessed black.

These checks deliberately reject ambiguous theme effects even when one renderer
honors a local empty effectLst: PowerPoint and PDF exporters can disagree.
"""
import xml.etree.ElementTree as ET
from check_efund_cover import NS, object_id, xml_root, relationships, resolve_target


def check_title_paint(shape):
    runs = shape.findall('.//a:r', NS) if shape is not None else []
    errors = []
    for run in runs:
        if not (run.findtext('a:t', '', NS)).strip():
            continue
        color = run.find('a:rPr/a:solidFill/a:srgbClr', NS)
        if color is None:
            errors.append('title-color-not-explicit')
        elif color.get('val', '').upper() != 'FFFFFF' or len(color):
            errors.append('title-color-mismatch')
    if not runs:
        errors.append('title-paint-unresolved')
    return sorted(set(errors))


def check_portable_slide(package, part):
    # Follow only rendering dependencies, never orphan slides or unused themes.
    pending, seen, errors = [part], set(), set()
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        root = xml_root(package, name)
        for element in root.iter():
            tag = element.tag.split('}')[-1]
            if tag in ('outerShdw', 'innerShdw', 'prstShdw', 'glow'):
                errors.add('render-shadow-or-glow')
            if tag == 'effectRef' and element.get('idx', '0') != '0':
                errors.add('render-theme-effect-reference')
        for target, mode in relationships(package, name).values():
            linked = resolve_target(name, target)
            if mode != 'External' and linked.endswith('.xml') and any(
                linked.startswith(prefix) for prefix in ('ppt/slideLayouts/', 'ppt/slideMasters/', 'ppt/charts/', 'ppt/diagrams/')
            ):
                pending.append(linked)
    return sorted(errors)


def _frame(root, identifier):
    return next((x for x in root.findall('.//p:graphicFrame', NS) if object_id(x) == str(identifier)), None)


def check_toc_style(root, source, page):
    """Check actual table styles, not the author-supplied style summary."""
    errors = set()
    try:
        original = _frame(source, page['tocLayout']['sourceTableId'])
        ref_cols = [int(x.get('w')) for x in original.findall('.//a:tblGrid/a:gridCol', NS)]
        ref_rows = original.findall('.//a:tbl/a:tr', NS)
        for i, item in enumerate(page['tocRows']):
            if 'tableId' not in item:
                errors.add('toc-style-manual-review-required')
                continue
            frame = _frame(root, item['tableId'])
            cols = [int(x.get('w')) for x in frame.findall('.//a:tblGrid/a:gridCol', NS)]
            if cols != ref_cols:
                errors.add('toc-column-width-mismatch')
            if frame.find('p:xfrm/a:off', NS).get('x') != original.find('p:xfrm/a:off', NS).get('x'):
                errors.add('toc-horizontal-anchor-mismatch')
            table = frame.find('.//a:tbl', NS)
            props = table.find('a:tblPr', NS)
            if props is None or any(props.get(k, '0') not in ('0', 'false') for k in ('firstRow','lastRow','firstCol','lastCol','bandRow','bandCol')):
                errors.add('toc-theme-banding-enabled')
            row = table.findall('a:tr', NS)[item['rowIndex']]
            cells = row.findall('a:tc', NS)
            refs = ref_rows[i].findall('a:tc', NS)
            for col, (cell, ref) in enumerate(zip(cells, refs)):
                cp = cell.find('a:tcPr', NS)
                bottom = cp.find('a:lnB', NS)
                if bottom is None or bottom.get('w') != '6350' or bottom.find('a:solidFill/a:srgbClr', NS) is None or bottom.find('a:solidFill/a:srgbClr', NS).get('val','').upper() != 'CCCCCC' or bottom.find('a:prstDash', NS) is None or bottom.find('a:prstDash', NS).get('val') != 'dash':
                    errors.add('toc-separator-style-mismatch')
                for edge in ('lnL','lnR','lnT','lnTlToBr','lnBlToTr'):
                    if cp.find('a:'+edge+'/a:noFill', NS) is None:
                        errors.add('toc-inherited-edge-not-disabled')
                fill = cp.find('a:solidFill/a:srgbClr', NS)
                if fill is None or fill.get('val','').upper() != 'FFFFFF':
                    errors.add('toc-fill-not-explicit-white')
                ref_run = ref.find('.//a:rPr', NS)
                for run in cell.findall('.//a:rPr', NS):
                    if any(run.get(key) != ref_run.get(key) for key in ('sz','b')):
                        errors.add('toc-text-style-mismatch')
                if col == 0:
                    expected = ref.find('.//a:rPr/a:solidFill/a:srgbClr', NS)
                    for run in cell.findall('.//a:rPr', NS):
                        paint = run.find('a:solidFill/a:srgbClr', NS)
                        if expected is None or paint is None or paint.get('val') != expected.get('val'):
                            errors.add('toc-number-color-mismatch')
    except (KeyError, AttributeError, IndexError, TypeError, ValueError):
        errors.add('toc-style-unresolved')
    return sorted(errors)
