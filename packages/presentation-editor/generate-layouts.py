"""Regenerate the offline layout gallery from the two PPT masters bundled with the skill.

Maintenance only: python-pptx, Pillow, PowerPoint for macOS and Poppler are needed here.
The desktop build uses the checked-in PNGs and layout coordinates.
"""
from hashlib import sha256
from io import BytesIO
import json
from lxml import etree
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image
from pptx import Presentation

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parents[1] / "skills/efund-ppt-maker/assets"
OUTPUT = ROOT / "layout-art"
SOURCES = {"v6": "efund-template-v6.pptx", "master": "efund-master-skeleton.pptx"}


def placeholder_style(ph, layout, width):
    """Read the editable placeholder's first-level typography from the master and layout."""
    master = layout.slide_master
    family = "titleStyle" if ph.placeholder_format.type.name in {"TITLE", "CENTER_TITLE"} else "bodyStyle"
    nodes = list(master._element.xpath(f"./p:txStyles/p:{family}/a:lvl1pPr/a:defRPr"))
    nodes.extend(ph._element.xpath("./p:txBody/a:lstStyle/a:lvl1pPr/a:defRPr"))
    nodes.extend(ph._element.xpath("./p:txBody/a:p[1]/a:pPr/a:defRPr|./p:txBody/a:p[1]/a:r[1]/a:rPr"))
    theme = etree.fromstring(master.part.part_related_by(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme").blob)
    colors = {etree.QName(n).localname: n[0].get("lastClr") or n[0].get("val")
              for n in theme.xpath("/*/*[local-name()='themeElements']/*[local-name()='clrScheme']/*")}
    mapping = master._element.xpath("./p:clrMap")[0]
    result = {}
    for node in nodes:
        if node.get("sz"):
            result["size"] = round(int(node.get("sz")) * 127 / width, 7)
        if node.get("b") is not None:
            result["bold"] = node.get("b") in {"1", "true"}
        fonts = node.xpath("./a:ea")
        if fonts and not fonts[0].get("typeface", "").startswith("+"):
            result["font"] = fonts[0].get("typeface")
        for fill in node.xpath("./a:solidFill/*"):
            value = fill.get("val")
            if etree.QName(fill).localname == "schemeClr":
                value = colors.get(mapping.get(value, value))
            if value and re.fullmatch(r"[0-9a-fA-F]{6}", value):
                result["color"] = "#" + value
    props = ph._element.xpath("./p:txBody/a:bodyPr")
    if props:
        result["inset"] = [round(int(props[0].get(key, default)) / width, 7)
                           for key, default in (("tIns",45720),("rIns",91440),("bIns",45720),("lIns",91440))]
        result["anchor"] = {"ctr":"middle","b":"bottom"}.get(props[0].get("anchor"), "top")
    return result


def get_slots(layout, width, height):
    slots = []
    for ph in layout.placeholders:
        kind = ph.placeholder_format.type.name
        if kind in {"FOOTER", "DATE", "SLIDE_NUMBER"} or not ph.width or not ph.height:
            continue
        x, y, w, h = (round(v / dim, 5) for v, dim in
                       zip((ph.left, ph.top, ph.width, ph.height), (width, height, width, height)))
        if x < 0 or y < 0 or x >= 1 or y >= 1:
            continue
        if kind in {"TITLE", "CENTER_TITLE"} or (not slots and any(s in layout.name for s in ("首页", "封面", "结尾", "业务介绍"))):
            role = "title"
        elif kind == "TABLE":
            role = "table"
        else:
            role = "body"
        style = placeholder_style(ph, layout, width)
        if role == "body" and y > .18 and style.get("color") == "#FFFFFF":
            style.update(color="#005096", bold=False, inset=[0, 0, 0, 0])
        slots.append(dict(role=role, x=x, y=y, w=min(w, 1-x), h=min(h, 1-y), **style))
    if not any(slot["role"] == "title" for slot in slots):
        slots.insert(0, dict(role="title", x=.036, y=.025, w=.68, h=.074))
    if "图形内容" in layout.name:
        slots.append(dict(role="chart", x=.555, y=.235, w=.40, h=.53))
    return slots


def render(group, filename, temp):
    deck = Presentation(ASSETS / filename)
    # Section lists refer to the source slide IDs, which the gallery replaces.
    for obsolete in deck._element.xpath('./p:extLst|./p:custShowLst'):
        deck._element.remove(obsolete)
    slide_ids = deck.slides._sldIdLst
    for item in list(slide_ids):
        deck.part.drop_rel(item.rId)
        slide_ids.remove(item)
    layouts = sorted((layout for master in deck.slide_masters for layout in master.slide_layouts),
                     key=lambda item: int(re.search(r"(\d+)\.xml$", str(item.part.partname))[1]))
    def page_number(layout):
        for owner in (layout, layout.slide_master):
            for shape in owner.shapes:
                if not shape._element.xpath('.//a:fld[@type="slidenum"]'):
                    continue
                if not (shape.width and shape.height):
                    continue
                return dict(x=shape.left/deck.slide_width, y=shape.top/deck.slide_height,
                            w=shape.width/deck.slide_width, h=shape.height/deck.slide_height)
        return None
    fields = [page_number(layout) for layout in layouts]
    for owner in [*deck.slide_masters, *layouts]:
        for shape in list(owner.shapes):
            if ((shape.is_placeholder and shape.placeholder_format.type.name == "SLIDE_NUMBER")
                    or shape._element.xpath('.//a:fld[@type="slidenum"]')):
                shape._element.getparent().remove(shape._element)
    for layout in layouts:
        slide = deck.slides.add_slide(layout)
        for shape in list(slide.shapes):
            shape._element.getparent().remove(shape._element)
    ppt = temp / f"{group}.pptx"
    deck.save(ppt)
    subprocess.run(["osascript", "-", str(ppt), str(ppt.with_suffix(".pdf"))], check=True, input="""
on run argv
    set src to POSIX file (item 1 of argv)
    set dest to POSIX file (item 2 of argv)
    tell application "Microsoft PowerPoint"
        open src
        set p to active presentation
        try
            save p in dest as save as PDF
        on error reason
            close p saving no
            error reason
        end try
        close p saving no
    end tell
end run
""", text=True)
    subprocess.run(["pdftoppm", "-scale-to", "1280", "-png", str(ppt.with_suffix(".pdf")), str(temp/group)], check=True)
    pictures = sorted(temp.glob(f"{group}-*.png"))
    assert len(layouts) == len(pictures)
    result = []
    for number, (layout, picture) in enumerate(zip(layouts, pictures), 1):
        data = BytesIO()
        with Image.open(picture) as image:
            image.convert("RGB").save(data, "PNG", optimize=True)
        png = data.getvalue()
        art = sha256(png).hexdigest()[:16] + ".png"
        (OUTPUT / art).write_bytes(png)
        result.append(dict(id=f"{group}-{number}", group=group, name=layout.name.split("，")[0],
                           art=art, slots=get_slots(layout, deck.slide_width, deck.slide_height),
                           **({"pageNumber": fields[number-1]} if fields[number-1] else {})))
    return result


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    previous = {item["art"] for item in json.loads((ROOT / "overlay/efund-layouts.json").read_text())}
    with TemporaryDirectory(prefix='odyssey-layouts-', dir='/tmp') as work:
        catalog = [item for group, source in SOURCES.items() for item in render(group, source, Path(work))]
    for stale in previous - {item["art"] for item in catalog}:
        (OUTPUT / stale).unlink(missing_ok=True)
    (ROOT / "overlay/efund-layouts.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
