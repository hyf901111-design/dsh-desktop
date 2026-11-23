"""Inspect and reflow selected native objects on a copy of an existing presentation."""
import argparse
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from math import isfinite
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Pt


def inventory(slides, scale, selected):
    pages = []
    for n, slide in enumerate(slides, 1):
        if selected and n not in selected:
            continue
        compact = not selected and len(slides) > 16
        objects = []
        for shape in slide.shapes:
            obj = {"id": shape.shape_id, "name": shape.name, "type": shape.shape_type.name}
            coords = [shape.left, shape.top, shape.width, shape.height]
            if None not in coords:
                obj["box"] = [round(v / scale, 1) for v in coords]
            if shape.has_table:
                tbl = shape.table
                obj["tableSize"] = [len(tbl.rows), len(tbl.columns)]
                obj["table"] = [[c.text[:80] if compact else c.text for c in row.cells]
                                for i, row in enumerate(tbl.rows) if not compact or i < 2]
                obj["merges"] = [[r, c, cell.span_height, cell.span_width]
                                 for r, row in enumerate(shape.table.rows)
                                 for c, cell in enumerate(row.cells) if cell.is_merge_origin]
            elif shape.has_text_frame:
                paragraphs = shape.text_frame.paragraphs
                obj["paragraphCount"] = len(paragraphs)
                obj["paragraphs"] = [p.text[:100] if compact else p.text
                                     for i, p in enumerate(paragraphs) if not compact or i < 2]
            objects.append(obj)
        pages.append({"slide": n, "layout": slide.slide_layout.name, "objects": objects})
    return pages


def dimensions(values, count, label, allow_zero=False):
    if not isinstance(values, list) or len(values) != count or not all(
        type(v) in (float, int) and isfinite(v) and (v >= 0 if allow_zero else v > 0) for v in values
    ):
        raise ValueError(f"{label}: expected {count} dimensions")
    return values


def box(values, scale, height):
    x, y, w, h = dimensions(values, 4, "box", allow_zero=True)
    if w <= 0 or h <= 0 or x + w > 960.01 or y + h > height + 0.01:
        raise ValueError(f"box outside slide: {values}")
    return tuple(round(n * scale) for n in (x, y, w, h))


def style_table(tbl, header):
    if not isinstance(header, bool):
        raise ValueError("header must be true or false")
    for r, row in enumerate(tbl.rows):
        for cell in row.cells:
            top = header and r == 0
            cell.fill.solid()
            cell.fill.fore_color.rgb = RGBColor.from_string('10A9CB' if top else ('F1F5F7' if r % 2 == 0 else 'FFFFFF'))
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left, cell.margin_right = Pt(5), Pt(5)
            cell.margin_top, cell.margin_bottom = Pt(1), Pt(1)
            for paragraph in cell.text_frame.paragraphs:
                paragraph.alignment = PP_ALIGN.LEFT
                for run in paragraph.runs:
                    run.font.color.rgb = RGBColor.from_string('FFFFFF' if top else '293F50')
                    if top:
                        run.font.bold = True
            # Set borders explicitly; table-style inheritance can otherwise draw a grid.
            prop = cell._tc.get_or_add_tcPr()
            for edge in reversed(['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr']):
                for old in prop.xpath('./a:' + edge):
                    prop.remove(old)
                line = OxmlElement('a:' + edge)
                line.append(OxmlElement('a:noFill'))
                prop.insert(0, line)


def split_text(slide, shape, blocks, scale, height):
    source = shape.text_frame
    paragraphs = list(source.paragraphs)
    if not blocks or any(set(b) != {'count', 'box'} or type(b['count']) is not int or b['count'] < 1 for b in blocks):
        raise ValueError("each text block needs a positive count and a box")
    if sum(b['count'] for b in blocks) != len(paragraphs):
        raise ValueError("blocks must cover all source paragraphs exactly once")
    # Reuse the original shape for the first block. Never split objects with shape-level
    # actions, animations, connectors or non-text artwork. Runs keep their local rIds.
    if shape.shape_type not in (MSO_SHAPE_TYPE.TEXT_BOX, MSO_SHAPE_TYPE.PLACEHOLDER):
        raise ValueError("blocks require a plain text box or text placeholder")
    element = shape._element
    if (slide._element.xpath('.//p:timing') or slide._element.xpath('.//p:cxnSp')
            or element.xpath('./p:nvSpPr/p:cNvPr/a:hlinkClick|./p:nvSpPr/p:cNvPr/a:hlinkHover')
            or element.xpath('./p:spPr/*[not(self::a:xfrm or self::a:prstGeom or self::a:noFill)]|./p:style')):
        raise ValueError("styled, linked or animated shapes need individual editing")
    copies = [deepcopy(p._p) for p in paragraphs]
    cursor = 0
    for index, item in enumerate(blocks):
        region = box(item['box'], scale, height)
        if index == 0:
            dest = shape
        else:
            # Cloning the same-slide placeholder keeps inherited bullets, theme styles and
            # hyperlink relationships. A new shape ID is required; keep the original ID on block 1.
            dest = slide.shapes.add_textbox(*region)
            new_id = dest.shape_id
            clone = deepcopy(element)
            lock = clone.xpath('./p:nvSpPr/p:cNvPr')[0]
            lock.set('id', str(new_id))
            lock.set('name', f'{shape.name} ({index + 1})')
            for ext in lock.xpath('./a:extLst'):
                lock.remove(ext)
            for ext in clone.xpath('./p:nvSpPr/p:nvPr/p:extLst'):
                clone.xpath('./p:nvSpPr/p:nvPr')[0].remove(ext)
            # Insert adjacent to source so layers above it stay above every block.
            dest._element.getparent().remove(dest._element)
            previous.addnext(clone)
            dest = next(s for s in slide.shapes if s.shape_id == new_id)
        dest.left, dest.top, dest.width, dest.height = region
        tx = dest.text_frame
        tx.vertical_anchor = MSO_ANCHOR.TOP
        for p in list(tx.paragraphs):
            tx._txBody.remove(p._p)
        for p in copies[cursor:cursor + item['count']]:
            tx._txBody.append(p)
        cursor += item['count']
        previous = dest._element


def edit(slides, plan, scale, height):
    changed = {}
    seen = set()
    for op in plan:
        if set(op) - {'slide', 'id', 'box', 'columns', 'rows', 'header', 'blocks'}:
            raise ValueError("unknown layout operation")
        n, sid = op['slide'], op['id']
        if type(n) is not int or type(sid) is not int or not 1 <= n <= len(slides) or (n, sid) in seen:
            raise ValueError("invalid or repeated slide/object ID")
        seen.add((n, sid))
        slide = slides[n - 1]
        matches = [s for s in slide.shapes if s.shape_id == sid]
        if len(matches) != 1:
            raise ValueError(f"slide {n}: expected one object {sid}")
        shape = matches[0]
        if 'blocks' in op and shape.has_text_frame and set(op) == {'slide', 'id', 'blocks'}:
            split_text(slide, shape, op['blocks'], scale, height)
        elif shape.has_table and 'blocks' not in op:
            tbl = shape.table
            left, top, width, h = box(op['box'], scale, height)
            shape.left, shape.top = left, top
            for key, collection, attr, extent in [('columns', tbl.columns, 'width', width), ('rows', tbl.rows, 'height', h)]:
                sizes = dimensions(op[key], len(collection), key)
                if abs(sum(sizes) * scale - extent) > scale * 0.02:
                    raise ValueError(f"{key} must sum to the stated box dimension")
                for entry, size in zip(collection, sizes):
                    setattr(entry, attr, round(size * scale))
            if 'header' in op:
                style_table(tbl, op['header'])
        elif set(op) == {'slide', 'id', 'box'} and shape.has_text_frame:
            shape.left, shape.top, shape.width, shape.height = box(op['box'], scale, height)
        else:
            raise ValueError(f"unsupported layout operation on slide {n}, object {sid}")
        changed[str(slide.part.partname).lstrip('/')] = slide.part
    if not changed:
        raise ValueError("no layout edits")
    return changed


def save_copy(raw, changed, output):
    # Publish only a completed archive and refuse replacement even if two edits race.
    with NamedTemporaryFile(dir=output.parent, delete=False) as temp:
        path = Path(temp.name)
    try:
        with ZipFile(BytesIO(raw)) as src, ZipFile(path, 'w') as dst:
            for entry in src.infolist():
                if entry.filename in changed:
                    dst.writestr(entry, changed[entry.filename].blob)
                else:
                    dst.writestr(entry, src.read(entry))
        os.link(path, output)
    finally:
        path.unlink()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest='action', required=True)
    inspect = commands.add_parser('inspect')
    inspect.add_argument('source', type=Path)
    inspect.add_argument('--slides', nargs='+', type=int)
    apply = commands.add_parser('apply')
    apply.add_argument('source', type=Path)
    apply.add_argument('plan', type=Path)
    apply.add_argument('output', type=Path)
    args = cli.parse_args()
    raw = args.source.read_bytes()
    digest = sha256(raw).hexdigest()
    prs = Presentation(BytesIO(raw))
    # Presentation.slides renames parts by position. Keep original OPC paths for reordered slides.
    slides = [prs.part.related_slide(s.rId) for s in prs._element.get_or_add_sldIdLst()]
    scale = prs.slide_width / 960
    if args.action == 'inspect':
        if args.slides and any(n < 1 or n > len(slides) for n in args.slides):
            raise ValueError("requested slide outside presentation")
        result = {'sourceSha256': digest, 'canvas': [960, round(prs.slide_height / scale, 2)],
                  'slideCount': len(slides), 'slides': inventory(slides, scale, args.slides)}
    else:
        plan = json.loads(args.plan.read_text(encoding='utf-8'))
        if plan['sourceSha256'] != digest:
            raise ValueError("source changed; inspect the newest attachment and update the plan")
        if args.output.exists():
            raise FileExistsError(args.output)
        changes = edit(slides, plan['edits'], scale, prs.slide_height / scale)
        save_copy(raw, changes, args.output)
        result = {'file': str(args.output), 'slideCount': len(slides), 'changedSlides': len(changes)}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
