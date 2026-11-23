"""Editable meeting-slide layouts shared by new decks and source-preserving revisions."""

import math
import re
import unicodedata

from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Pt

NAVY, CYAN, INK, PALE = "00548C", "08A9C9", "283D4D", "DFEEF4"
DATE = re.compile(
    r"^((?:\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?|\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|Q[1-4]\s+\d{4})[：:\s]+)(.+)$"
)


def units(text):
    return sum(1 if unicodedata.east_asian_width(c) in "WFA" else 0.57 for c in text)


def lines(text, width, pt):
    return sum(
        max(1, math.ceil(units(line) * pt * 1.42 / width)) for line in text.split("\n")
    )


def distribute(minimums, height):
    remaining = height - sum(minimums)
    if remaining < -0.1:
        raise ValueError("正文超出版心，请拆页或选择更适合的结构")
    return [m + max(0, remaining) / len(minimums) for m in minimums]


def style(paragraph, size, color, bold=False):
    paragraph.alignment = PP_ALIGN.LEFT
    paragraph.space_before = Pt(0)
    paragraph.space_after = Pt(0)
    paragraph.line_spacing = 1.10
    prop = paragraph._p.get_or_add_pPr()
    for key in ["marL", "indent"]:
        prop.set(key, "0")
    for child in list(prop):
        if child.tag.split("}")[-1].startswith("bu"):
            prop.remove(child)
    prop.insert_element_before(
        OxmlElement("a:buNone"), "a:tabLst", "a:defRPr", "a:extLst"
    )
    for r in paragraph.runs:
        r.font.name = "Arial"
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = RGBColor.from_string(color)
        rp = r._r.get_or_add_rPr()
        east = rp.find("{http://schemas.openxmlformats.org/drawingml/2006/main}ea")
        if east is None:
            east = OxmlElement("a:ea")
            rp.insert_element_before(
                east, "a:cs", "a:sym", "a:hlinkClick", "a:hlinkMouseOver", "a:extLst"
            )
        east.set("typeface", "华文黑体_易方达")


class Page:
    def __init__(self, slide, scale, height):
        self.slide, self.scale, self.height = slide, scale, height

    def region(self, x, y, w, h):
        return tuple(round(v * self.scale) for v in (x, y, w, h))

    def mark(self, name, x, y, w, h, color, ellipse=False):
        kind = MSO_SHAPE.OVAL if ellipse else MSO_SHAPE.RECTANGLE
        s = self.slide.shapes.add_shape(kind, *self.region(x, y, w, h))
        s.name = name
        s.fill.solid()
        s.fill.fore_color.rgb = RGBColor.from_string(color)
        s.line.fill.background()
        for ref in s._element.xpath("./p:style/a:effectRef"):
            ref.set("idx", "0")
        return s

    def text(self, name, x, y, w, h, value, size, color=INK, bold=False):
        s = self.slide.shapes.add_textbox(*self.region(x, y, w, h))
        s.name = name
        tx = s.text_frame
        tx.auto_size = MSO_AUTO_SIZE.NONE
        tx.word_wrap = True
        tx.vertical_anchor = MSO_ANCHOR.TOP
        tx.margin_left = tx.margin_right = tx.margin_top = tx.margin_bottom = 0
        for i, line in enumerate(value.split("\n")):
            p = tx.add_paragraph() if i else tx.paragraphs[0]
            p.text = line
            style(p, size, color, bold)
        return s

    def groups(self, kind, items, top=104, bottom=None):
        bottom = self.height - 63 if bottom is None else bottom
        if not 1 <= len(items) <= 12 or any(
            not a.strip() or not b.strip() for a, b in items
        ):
            raise ValueError("每一项需要标题和完整说明")
        lead = kind == "summary"
        timeline = kind == "timeline"
        if lead and len(items) < 2:
            raise ValueError("结论页需要主结论与至少一项依据")
        if lead:
            title, detail = items[0]
            if (
                lines(title, 242, 16) * 27 + lines(detail, 242, 15) * 25 + 60
                > bottom - top
            ):
                raise ValueError("主结论超过左栏容量")
            items = items[1:]
        minimums = []
        for label, value in items:
            if lead:
                minimums.append(
                    lines(label, 562, 14) * 23 + lines(value, 562, 12) * 20 + 18
                )
            else:
                minimums.append(
                    max(
                        lines(label, 155 if timeline else 252, 13) * 22,
                        lines(value, 685 if timeline else 553, 12) * 21,
                    )
                    + 12
                )
        heights = distribute(minimums, bottom - top)
        if lead:
            self.mark("meeting-summary-panel", 38, top, 283, bottom - top, NAVY)
            h = lines(title, 242, 16) * 27
            self.text("meeting-lead", 57, top + 21, 242, h, title, 16, "FFFFFF", True)
            self.text(
                "meeting-lead-detail",
                57,
                top + 34 + h,
                242,
                bottom - top - h - 44,
                detail,
                15,
                "FFFFFF",
            )
        if timeline:
            self.mark(
                "meeting-time-axis",
                46,
                top + 10,
                2,
                max(1, sum(heights[:-1])),
                "B2D8E6",
            )
        y = top
        for i, ((label, value), h) in enumerate(zip(items, heights), 1):
            if timeline:
                self.mark("meeting-time-node", 41, y + 4, 12, 12, CYAN, True)
                self.text("meeting-date", 62, y, 155, h - 3, label, 13, NAVY, True)
                self.text("meeting-event", 226, y, 690, h - 3, value, 12)
            elif lead:
                title_h = lines(label, 562, 14) * 23
                self.text(
                    "meeting-detail-heading",
                    345,
                    y,
                    568,
                    title_h,
                    label,
                    14,
                    NAVY,
                    True,
                )
                self.text(
                    "meeting-detail",
                    345,
                    y + title_h + 4,
                    572,
                    h - title_h - 7,
                    value,
                    12,
                )
            else:
                self.text(
                    "meeting-number", 38, y - 1, 51, h - 3, f"{i:02}", 18, CYAN, True
                )
                self.text("meeting-heading", 98, y, 247, h - 3, label, 13, NAVY, True)
                self.text("meeting-explanation", 360, y, 562, h - 3, value, 12)
            y += h
            if not timeline and i < len(items):
                self.mark(
                    "meeting-divider",
                    345 if lead else 38,
                    y - 7,
                    577 if lead else 884,
                    0.9,
                    "D0DFE5",
                )

    def table(self, frame, x, y, widths, heights, header=True, focus=None, numeric=()):
        from layout_edit import style_table

        tbl = frame.table
        if len(tbl.columns) != len(widths) or len(tbl.rows) != len(heights):
            raise ValueError("表格维度不匹配")
        frame.left, frame.top, _, _ = self.region(x, y, 0, 0)
        for c, w in zip(tbl.columns, widths):
            c.width = round(w * self.scale)
        for r, h in zip(tbl.rows, heights):
            r.height = round(h * self.scale)
        style_table(tbl, header)
        for i, row in enumerate(tbl.rows):
            for j, c in enumerate(row.cells):
                if c.is_spanned:
                    continue
                top = header and i == 0
                c.margin_left = c.margin_right = Pt(4)
                if j == focus or c.span_height > 1:
                    c.fill.fore_color.rgb = RGBColor.from_string(NAVY if top else PALE)
                for k, p in enumerate(c.text_frame.paragraphs):
                    size = 11 if j in numeric or top else 10.2
                    if c.span_height > 1 and k == 0:
                        size = 13
                    style(
                        p,
                        size,
                        "FFFFFF"
                        if top
                        else NAVY
                        if j == focus or c.span_height > 1
                        else INK,
                        top or j == focus or (c.span_height > 1 and k == 0),
                    )
                    if j in numeric:
                        p.alignment = PP_ALIGN.CENTER
