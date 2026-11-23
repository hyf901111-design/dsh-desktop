"""Create a brand presentation from structured content, or recompose recognizable source pages."""

import argparse
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
import os
import re
from zipfile import ZipFile

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from layout_edit import save_copy
from meeting_layout import Page, DATE, lines, distribute, style, NAVY, INK
from meeting_attachments import attachments


def relative_widths(shares, total):
    return [total * n / sum(shares) for n in shares]


def row_sizes(table, widths, room, size=10.2):
    minimums = [
        max(
            25,
            max(
                (
                    lines(c.text, w - 12, size) * 16 + 5
                    for c, w in zip(row.cells, widths)
                    if not c.is_spanned and c.span_height == 1
                ),
                default=0,
            ),
        )
        for row in table.rows
    ]
    return distribute(minimums, room)


def safe_text(s):
    return (
        s.has_text_frame
        and s.shape_type in (MSO_SHAPE_TYPE.TEXT_BOX, MSO_SHAPE_TYPE.PLACEHOLDER)
        and not s._element.xpath(
            ".//a:hlinkClick|.//a:hlinkMouseOver|.//a:fld|.//a:blip|.//a:custGeom"
        )
    )


def remove(s):
    s._element.getparent().remove(s._element)


def para_groups(shape):
    paragraphs = [p for p in shape.text_frame.paragraphs if p.text.strip()]
    groups = []
    for p in paragraphs:
        explicit = [r for r in p.runs if r.text.strip()]
        if explicit and all(r.font.bold for r in explicit) and len(p.text) < 54:
            groups.append([p.text, []])
        elif groups:
            groups[-1][1].append(p.text)
        else:
            return []
    return [(k, "\n".join(v)) for k, v in groups] if all(v for _, v in groups) else []


def safe_table(frame):
    return not frame._element.xpath(
        ".//a:hlinkClick|.//a:hlinkMouseOver|.//a:fld|.//a:blip"
    )


def reflow(page, archive, extra):
    slide = page.slide
    if slide._element.xpath("./p:timing|.//p:cxnSp"):
        return None
    title = slide.shapes.title
    if title is None or not title.text.strip():
        return None
    others = [s for s in slide.shapes if s.shape_id != title.shape_id]
    tables = [s for s in others if s.has_table]
    words = [s for s in others if safe_text(s)]
    files = [s for s in others if s.shape_type == MSO_SHAPE_TYPE.EMBEDDED_OLE_OBJECT]
    if len(words) + len(files) + len(tables) != len(others) or not all(
        safe_table(f) for f in tables
    ):
        return None
    if not tables and len(words) == 1 and len(files) <= 2:
        source = words[0]
        content = [p.text for p in source.text_frame.paragraphs if p.text.strip()]
        if not content:
            return None
        start = next((i for i, t in enumerate(content[:2]) if DATE.match(t)), None)
        if (
            start is not None
            and all(DATE.match(t) for t in content[start:])
            and len(content) - start >= 2
        ):
            items = [DATE.match(t).groups() for t in content[start:]]
            top = 135 if start else 105
            bottom = page.height - (133 if files else 60)
            page.groups("timeline", items, top, bottom)
            if start:
                page.text(
                    "meeting-timeline-title",
                    38,
                    96,
                    884,
                    29,
                    content[0],
                    14,
                    NAVY,
                    True,
                )
            if files and not attachments(page, archive, extra, files, bottom + 15):
                raise ValueError("附件显示方式需要保留并逐页复核")
            remove(source)
            return "timeline"
        groups = para_groups(source)
        if len(groups) < 2 or files:
            return None
        lead = bool(
            re.search("总结|结论|摘要|建议|决策|summary|decision", title.text, re.I)
        )
        kind = "summary" if lead else "list"
        page.groups(kind, groups)
        remove(source)
        return kind

    if tables and not files:
        table = tables[0].table
        header = [c.text.strip() for c in table.rows[0].cells]
        years = [i for i, t in enumerate(header) if re.search(r"(?:19|20)\d{2}", t)]
        if (
            len(tables) == 1
            and len(years) >= 2
            and len(words) <= 1
            and len(table.rows) >= 2
        ):
            focus = next(
                (i for i in years if "*" in header[i] or "重点" in header[i]), None
            )
            widths = relative_widths(
                [
                    104 if i in years else 178 if i == 0 else 280
                    for i in range(len(header))
                ],
                884,
            )
            note = words[0] if words else None
            note_text = note.text.strip() if note else ""
            note_lines = lines(note_text, 877, 9) if note_text else 0
            note_h = note_lines * 15 + 5 if note_text else 0
            bottom = page.height - 67
            room = bottom - 104 - note_h - (12 if note else 0)
            heights = row_sizes(table, widths, room)
            page.table(tables[0], 38, 104, widths, heights, focus=focus, numeric=years)
            if note:
                page.text(
                    "meeting-table-note",
                    38,
                    bottom - note_h,
                    884,
                    note_h,
                    note_text,
                    9,
                    "435A67",
                )
                remove(note)
            return "metrics"
        strips = sorted(
            (f for f in tables if len(f.table.rows) == 1 and len(f.table.columns) == 2),
            key=lambda f: f.top,
        )
        matrix = sorted((f for f in tables if f not in strips), key=lambda f: f.top)
        if len(strips) == 2 and len(matrix) in (1, 2) and not words:
            computed = []
            for idx, f in enumerate(matrix):
                table = f.table
                separator = [
                    j
                    for j in range(len(table.columns))
                    if all(r.cells[j].text.strip() == "|" for r in table.rows)
                ]
                if separator and not any(
                    c.span_width > 1 for r in table.rows for c in r.cells
                ):
                    for j in reversed(separator):
                        table._tbl.tblGrid.remove(table.columns[j]._gridCol)
                        for row in table.rows:
                            row._tr.remove(row.cells[j]._tc)
                impact = len(table.columns) == 4 and all(
                    "影响" in r.cells[2].text for r in table.rows
                )
                header = idx == 0 and impact
                if header and table.cell(0, 2).text != "影响程度":
                    tr = deepcopy(table.rows[0]._tr)
                    for tc in tr.tc_lst:
                        tc.attrib.clear()
                    table.rows[0]._tr.addprevious(tr)
                    for c, label in zip(
                        table.rows[0].cells, ["类别", "项目", "影响程度", "说明"]
                    ):
                        c.text = label
                widths = (
                    [108, 244, 85, 447]
                    if impact
                    else relative_widths([c.width for c in table.columns], 884)
                )
                hs = [
                    max(
                        21,
                        max(
                            (
                                lines(c.text, w - 10, 9.9) * 14.8 + 4
                                for c, w in zip(r.cells, widths)
                                if not c.is_spanned and c.span_height == 1
                            ),
                            default=0,
                        ),
                    )
                    for r in table.rows
                ]
                computed.append((f, widths, hs, header, impact))
            all_h = [v for _, _, hs, _, _ in computed for v in hs]
            heights = iter(
                distribute(all_h, page.height - 61 - 171 - 3 * (len(matrix) - 1))
            )
            for i, f in enumerate(strips):
                page.table(f, 38 + 448 * i, 104, [100, 336], [60], header=False)
            y = 171
            for f, widths, hs, header, impact in computed:
                row_h = [next(heights) for _ in hs]
                # A status color is data in an impact matrix. Preserve the original
                # text paint (including theme transforms) while restyling the grid.
                colors = []
                if impact:
                    for row in list(f.table.rows)[int(header):]:
                        for paint in row.cells[2]._tc.xpath(".//a:rPr/a:solidFill"):
                            colors.append((paint.getparent(), deepcopy(paint)))
                page.table(f, 38, y, widths, row_h, header=header)
                for props, paint in colors:
                    current = props.xpath("./a:solidFill")[0]
                    props.replace(current, paint)
                y += sum(row_h) + 3
            return "comparison"
        if len(tables) == len(words) == 2:
            pairs = list(
                zip(
                    sorted(words, key=lambda s: s.top),
                    sorted(tables, key=lambda s: s.top),
                )
            )
            if any(
                not s.text.strip()
                or sum(bool(p.text.strip()) for p in s.text_frame.paragraphs) > 4
                or s.top > f.top
                or s.top + s.height < f.top
                for s, f in pairs
            ):
                return None
            y = 99
            bottom = page.height - 62
            for s, f in pairs:
                t = [p.text for p in s.text_frame.paragraphs if p.text.strip()]
                if not t:
                    return None
                page.text("meeting-section", 38, y, 884, 25, t[0], 14, NAVY, True)
                y += 29
                if len(t) > 1:
                    desc = "\n".join(t[1:])
                    h = lines(desc, 884, 11) * 19
                    page.text("meeting-section-description", 38, y, 884, h, desc, 11)
                    y += h + 5
                widths = relative_widths(
                    [max(1, c.width) for c in f.table.columns], 884
                )
                widths = relative_widths(
                    [
                        max(0.14, w / 884) if i == 0 else w / 884
                        for i, w in enumerate(widths)
                    ],
                    884,
                )
                if len(widths) == 3 and all(
                    len(r.cells[0].text) < 15 for r in f.table.rows
                ):
                    widths = [145, 385, 354]
                min_h = [
                    max(
                        24,
                        max(
                            lines(c.text, w - 12, 10.2) for c, w in zip(r.cells, widths)
                        )
                        * 16
                        + 4,
                    )
                    for r in f.table.rows
                ]
                if y + sum(min_h) > bottom:
                    raise ValueError("两组表格需要单独调整")
                page.table(f, 38, y, widths, min_h)
                y += sum(min_h) + 17
                remove(s)
            return "tables"
    return None


def optimize(source, output, selected):
    if output.exists():
        raise FileExistsError(output)
    raw = source.read_bytes()
    p = Presentation(BytesIO(raw))
    ids = p._element.get_or_add_sldIdLst()
    if selected and any(i < 1 or i > len(ids) for i in selected):
        raise ValueError("页号越界")
    changed = {}
    extra = {}
    report = []
    with ZipFile(BytesIO(raw)) as archive:
        for i, entry in enumerate(ids, 1):
            if selected and i not in selected:
                continue
            s = p.part.related_slide(entry.rId)
            if not 0.52 <= p.slide_height / p.slide_width <= 0.65:
                report.append([i, "custom-aspect"])
                continue
            local = {}
            try:
                role = reflow(
                    Page(s, p.slide_width / 960, p.slide_height * 960 / p.slide_width),
                    archive,
                    local,
                )
            except ValueError as error:
                report.append([i, "individual review: " + str(error)])
                continue
            if role:
                changed[str(s.part.partname).lstrip("/")] = s.part
                extra.update(local)
            report.append([i, role or "source-layout"])
    if changed:
        save_copy(raw, changed, output, extra)
    return {"file": str(output) if changed else None, "pages": report}


def replace_slot(shape, value):
    first = True
    for p in shape.text_frame.paragraphs:
        for run in p.runs:
            run.text = value if first else ""
            first = False
    if first:
        shape.text_frame.paragraphs[0].add_run().text = value


def create(spec, output):
    data = json.loads(spec.read_text(encoding="utf-8"))
    if not data.get("title") or not data.get("pages"):
        raise ValueError("需要封面题名和正文页")
    prs = Presentation(
        Path(__file__).resolve().parents[1] / "assets/efund-template-v6.pptx"
    )
    ids = prs._element.get_or_add_sldIdLst()
    cover = prs.part.related_slide(ids[1].rId)
    for i, entry in enumerate(list(ids)):
        if i != 1:
            prs.part.drop_rel(entry.rId)
            ids.remove(entry)
    slots = {s.shape_id: s for s in cover.shapes}
    replace_slot(slots[3], data["title"])
    replace_slot(slots[12], data.get("date", ""))
    remove(slots[4])  # Instruction to the template author.
    layout = prs.slide_layouts.get_by_name("标题和内容")
    for page in data["pages"]:
        s = prs.slides.add_slide(layout)
        for ph in list(s.placeholders):
            remove(ph)
        body = Page(s, prs.slide_width / 960, 960 * prs.slide_height / prs.slide_width)
        if lines(page["title"], 660, 22) > 1:
            raise ValueError("请精简顶栏题名以避开 Logo")
        body.text("page-title", 38, 20, 670, 40, page["title"], 22, "FFFFFF", True)
        kind = page["kind"]
        if kind == "table":
            rows = page["rows"]
            n = len(rows[0])
            if not n or any(len(row) != n for row in rows):
                raise ValueError("表格各行列数须一致")
            widths = relative_widths(page.get("widths", [1] * n), 884)
            if len(widths) != n or min(widths) <= 12:
                raise ValueError("列宽无效")
            frame = s.shapes.add_table(len(rows), n, *body.region(38, 105, 884, 310))
            for i, row in enumerate(rows):
                for j, val in enumerate(row):
                    frame.table.cell(i, j).text = str(val)
            note = page.get("note", "")
            room = min(
                360, body.height - 165 - (lines(note, 884, 10) * 17 + 9 if note else 0)
            )
            heights = row_sizes(
                frame.table, widths, min(room, max(180, len(rows) * 44))
            )
            focus = page.get("focus")
            if focus is not None and (type(focus) != int or not 0 <= focus < n):
                raise ValueError("重点列无效")
            body.table(
                frame,
                38,
                105,
                widths,
                heights,
                focus=focus,
                numeric=page.get("numeric", []),
            )
            if note:
                body.text(
                    "meeting-table-note",
                    38,
                    116 + sum(heights),
                    884,
                    lines(note, 884, 10) * 17 + 5,
                    note,
                    10,
                )
        elif kind in ("list", "summary", "timeline"):
            body.groups(kind, page["items"])
        else:
            raise ValueError("此内容关系需要自定义图表或专用页型")
    with NamedTemporaryFile(dir=output.parent, delete=False) as tmp:
        name = Path(tmp.name)
    try:
        prs.save(name)
        os.link(name, output)
    finally:
        name.unlink()
    return {"file": str(output), "slides": len(data["pages"]) + 1}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    cmds = ap.add_subparsers(dest="command", required=True)
    opt = cmds.add_parser("optimize")
    opt.add_argument("source", type=Path)
    opt.add_argument("output", type=Path)
    opt.add_argument("--slides", nargs="+", type=int)
    new = cmds.add_parser("create")
    new.add_argument("spec", type=Path)
    new.add_argument("output", type=Path)
    args = ap.parse_args()
    print(
        json.dumps(
            optimize(args.source, args.output, args.slides)
            if args.command == "optimize"
            else create(args.spec, args.output),
            ensure_ascii=False,
        )
    )
