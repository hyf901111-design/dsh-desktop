"""Keep embedded Word objects actionable while replacing unreadable legacy icon captions."""

from hashlib import sha256
from io import BytesIO
from pathlib import PurePosixPath
from posixpath import dirname, basename, join, normpath, relpath
import re
from zipfile import ZipFile, BadZipFile

from lxml import etree as ET
from PIL import Image, ImageDraw

R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE = "urn:schemas-microsoft-com:office:office"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"


def rels_path(name):
    return join(dirname(name), "_rels", basename(name) + ".rels")


def xml(node):
    return ET.tostring(node, encoding="utf-8", xml_declaration=True, standalone=True)


def caption(data):
    with ZipFile(BytesIO(data)) as doc:
        entry = doc.getinfo("word/document.xml")
        if entry.file_size > 8_000_000:
            return None
        root = ET.fromstring(
            doc.read(entry), parser=ET.XMLParser(resolve_entities=False)
        )
        texts = [
            "".join(p.itertext()).strip() for p in root.findall("./{*}body/{*}p")[:8]
        ]
        texts = [x for x in texts if x]
        if not texts or len(texts[0]) > 100:
            return None
        title = texts[0]
        quoted = re.search("《([^》]+)》", title)
        if quoted:
            title = quoted[1]
        reference = (
            texts[1]
            if len(texts) > 1
            and re.fullmatch(r".{1,24}[〔（(\[]\d{4}[〕）)\]]\s*\d+号", texts[1])
            else ""
        )
        return title, reference


def icon_data():
    im = Image.new("RGBA", (80, 96), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    d.polygon(
        [(7, 2), (49, 2), (72, 25), (72, 91), (7, 91)],
        fill="white",
        outline="#2A5474",
        width=4,
    )
    d.line([(49, 4), (49, 25), (70, 25)], fill="#2A5474", width=3)
    d.rounded_rectangle((2, 38, 59, 72), radius=3, fill="#176598")
    d.line([(9, 46), (14, 64), (19, 51), (24, 64), (29, 46)], fill="white", width=3)
    for y in (49, 55, 61):
        d.line([(35, y), (50, y)], fill="white", width=2)
    b = BytesIO()
    im.save(b, format="PNG")
    return b.getvalue()


def attachments(page, archive, extra, objects, y):
    if not objects:
        return
    slide = page.slide
    name = str(slide.part.partname).lstrip("/")
    relname = rels_path(name)
    rels = ET.fromstring(archive.read(relname))
    icon = icon_data()
    media = f"ppt/media/meeting-document-{sha256(icon).hexdigest()[:16]}.png"

    def target(rel):
        return normpath(join(dirname(name), rel.get("Target"))).lstrip("/")

    def icon_rel(root, owner):
        used = {r.get("Id") for r in root}
        i = 1
        while f"rId{i}" in used:
            i += 1
        rid = f"rId{i}"
        ET.SubElement(
            root,
            f"{{{PKG}}}Relationship",
            Id=rid,
            Type=R + "/image",
            Target=relpath(media, dirname(owner)),
        )
        return rid

    # Validate every object before changing geometry; other OLE types keep their source appearance.
    prepared = []
    for obj in objects:
        elements = obj._element.xpath(".//p:oleObj")
        if not elements or not all(e.get("showAsIcon") == "1" for e in elements):
            return
        rid = elements[0].get(f"{{{R}}}id")
        rel = next(
            (
                r
                for r in rels
                if r.get("Id") == rid and r.get("TargetMode") != "External"
            ),
            None,
        )
        if rel is None or PurePosixPath(target(rel)).suffix.lower() != ".docx":
            return
        try:
            info = caption(archive.read(target(rel)))
        except (KeyError, BadZipFile, ET.XMLSyntaxError):
            return
        if not info:
            return
        prepared.append((obj, elements, info))
    vml = []
    for r in rels:
        if (
            r.get("Type", "").endswith("/vmlDrawing")
            and r.get("TargetMode") != "External"
        ):
            part = target(r)
            vname = rels_path(part)
            vml.append(
                (
                    part,
                    ET.fromstring(archive.read(part)),
                    vname,
                    ET.fromstring(archive.read(vname)),
                )
            )
    iconid = icon_rel(rels, name)
    page.mark("meeting-document-divider", 38, y - 9, 884, 1, "D0DFE5")
    slot = 884 / len(prepared)
    for i, (obj, elements, (title, reference)) in enumerate(prepared):
        x = 38 + i * slot
        region = page.region(x, y + 3, 33, 40)
        obj.left, obj.top, obj.width, obj.height = region
        for el in elements:
            el.set("imgW", str(region[2]))
            el.set("imgH", str(region[3]))
            for blip in el.xpath(".//a:blip"):
                blip.set(f"{{{R}}}embed", iconid)
            for xf in el.xpath(".//p:pic/p:spPr/a:xfrm"):
                xf.off.x, xf.off.y, xf.ext.cx, xf.ext.cy = region
            for part, tree, vname, vrels in vml:
                for shape in tree.findall(".//{urn:schemas-microsoft-com:vml}shape"):
                    if not el.get("spid") or shape.get("id") != el.get("spid"):
                        continue
                    scale = page.scale / 12700
                    shape.set(
                        "style",
                        f"position:absolute;left:{x * scale}pt;top:{(y + 3) * scale}pt;width:{33 * scale}pt;height:{40 * scale}pt;",
                    )
                    for img in shape.findall(
                        "{urn:schemas-microsoft-com:vml}imagedata"
                    ):
                        img.set(f"{{{OFFICE}}}relid", icon_rel(vrels, part))
        page.text(
            "meeting-document-title",
            x + 42,
            y,
            slot - 49,
            36,
            title,
            10.4,
            "00548C",
            True,
        )
        if reference:
            page.text(
                "meeting-document-reference",
                x + 42,
                y + 42,
                slot - 49,
                16,
                reference,
                9.1,
            )
    for part, tree, vname, vrels in vml:
        extra[part] = xml(tree)
        extra[vname] = xml(vrels)
    extra[relname] = xml(rels)
    extra[media] = icon
    types = ET.fromstring(
        extra.get("[Content_Types].xml", archive.read("[Content_Types].xml"))
    )
    if not any(d.get("Extension", "").lower() == "png" for d in types):
        ET.SubElement(
            types, f"{{{CT}}}Default", Extension="png", ContentType="image/png"
        )
        extra["[Content_Types].xml"] = xml(types)
    return True
