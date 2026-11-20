"""Regenerate the offline layout gallery from the two PPT masters bundled with the skill.

Maintenance only: python-pptx, Pillow, LibreOffice and Poppler are needed here.
The desktop build uses the checked-in PNGs and layout coordinates.
"""
from hashlib import sha256
from io import BytesIO
import json
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
        slots.append(dict(role=role, x=x, y=y, w=min(w, 1-x), h=min(h, 1-y)))
    if not any(slot["role"] == "title" for slot in slots):
        slots.insert(0, dict(role="title", x=.036, y=.025, w=.68, h=.074))
    if "图形内容" in layout.name:
        slots.append(dict(role="chart", x=.555, y=.235, w=.40, h=.53))
    return slots


def render(group, filename, temp):
    deck = Presentation(ASSETS / filename)
    slide_ids = deck.slides._sldIdLst
    for item in list(slide_ids):
        deck.part.drop_rel(item.rId)
        slide_ids.remove(item)
    layouts = sorted((layout for master in deck.slide_masters for layout in master.slide_layouts),
                     key=lambda item: int(re.search(r"(\d+)\.xml$", str(item.part.partname))[1]))
    for owner in [*deck.slide_masters, *layouts]:
        for shape in list(owner.shapes):
            if shape.is_placeholder and shape.placeholder_format.type.name == "SLIDE_NUMBER":
                shape._element.getparent().remove(shape._element)
    for layout in layouts:
        slide = deck.slides.add_slide(layout)
        for shape in list(slide.shapes):
            shape._element.getparent().remove(shape._element)
    ppt = temp / f"{group}.pptx"
    deck.save(ppt)
    subprocess.run(["soffice", f"-env:UserInstallation={(temp/'lo').as_uri()}", "--headless",
                    "--convert-to", "pdf", "--outdir", str(temp), str(ppt)], check=True)
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
                           art=art, slots=get_slots(layout, deck.slide_width, deck.slide_height)))
    return result


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    with TemporaryDirectory() as work:
        catalog = [item for group, source in SOURCES.items() for item in render(group, source, Path(work))]
    (ROOT / "overlay/efund-layouts.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
