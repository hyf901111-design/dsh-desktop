"""Run with the client task Python (pptx and lxml are bundled)."""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from lxml import etree as ET
from pptx import Presentation
from pptx.util import Inches


HELPER = Path(__file__).resolve().parents[1] / "skills/efund-ppt-maker/scripts/layout_edit.py"


class LayoutEditTest(unittest.TestCase):
    def test_logical_order_rich_text_and_atomic_publication(self):
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            source, plan, out = (root / n for n in ("original.pptx", "plan.json", "edited.pptx"))
            prs = Presentation()
            first = prs.slides.add_slide(prs.slide_layouts[6])
            frame = first.shapes.add_table(2, 2, 10000, 10000, Inches(5), Inches(2))
            frame.table.cell(0, 0).merge(frame.table.cell(0, 1))
            frame.table.cell(0, 0).text = "目标"
            frame.table.cell(1, 1).text = "≥50%"
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            shape = slide.shapes.add_textbox(0, 0, Inches(3), Inches(2))
            shape.text = "说明"
            run = shape.text_frame.add_paragraph().add_run()
            run.text = "资料"
            run.hyperlink.address = "https://example.com/reference"
            data = BytesIO()
            prs.save(data)
            # Change the logical order without renaming the underlying parts.
            with ZipFile(data) as z, ZipFile(source, "w") as copy:
                for part in z.infolist():
                    contents = z.read(part)
                    if part.filename == "ppt/presentation.xml":
                        xml = ET.fromstring(contents)
                        slides = xml.find("{*}sldIdLst")
                        slides.insert(0, slides[-1])
                        contents = ET.tostring(xml)
                    copy.writestr(part, contents)
            cmd = [sys.executable, "-B", str(HELPER)]
            inventory = json.loads(subprocess.check_output([*cmd, "inspect", source]))
            self.assertEqual(inventory["slides"][0]["objects"][0]["paragraphs"], ["说明", "资料"])
            table_edit = {"slide": 2, "id": frame.shape_id, "box": [20, 20, 400, 60],
                          "columns": [160, 240], "rows": [30, 30], "header": True}
            text_edit = {"slide": 1, "id": shape.shape_id, "blocks": [
                {"count": 1, "box": [20, 100, 200, 60]}, {"count": 1, "box": [240, 100, 200, 60]}]}
            recipe = {"sourceSha256": inventory["sourceSha256"], "edits": [table_edit, text_edit]}
            for invalid in ("fingerprint", "overflow", "paragraphs"):
                invalid_recipe = deepcopy(recipe)
                if invalid == "fingerprint":
                    invalid_recipe["sourceSha256"] = "outdated"
                elif invalid == "overflow":
                    invalid_recipe["edits"][1]["blocks"][0]["box"][0] = 950
                else:
                    invalid_recipe["edits"][1]["blocks"][0]["count"] = 2
                plan.write_text(json.dumps(invalid_recipe))
                self.assertNotEqual(subprocess.run([*cmd, "apply", source, plan, out], capture_output=True).returncode, 0)
                self.assertFalse(out.exists())
            plan.write_text(json.dumps(recipe))
            subprocess.run([*cmd, "apply", source, plan, out], check=True, capture_output=True)
            original_bytes = out.read_bytes()
            self.assertNotEqual(subprocess.run([*cmd, "apply", source, plan, out], capture_output=True).returncode, 0)
            self.assertEqual(out.read_bytes(), original_bytes)
            with ZipFile(source) as before, ZipFile(out) as after:
                self.assertEqual(before.namelist(), after.namelist())
                self.assertEqual({p for p in before.namelist() if before.read(p) != after.read(p)},
                                 {"ppt/slides/slide1.xml", "ppt/slides/slide2.xml"})
            result = Presentation(out)
            self.assertEqual([s.text for s in result.slides[0].shapes], ["说明", "资料"])
            self.assertEqual(result.slides[0].shapes[1].text_frame.paragraphs[0].runs[0].hyperlink.address,
                             "https://example.com/reference")
            self.assertTrue(result.slides[1].shapes[0].table.cell(0, 0).is_merge_origin)
            self.assertEqual(result.slides[1].shapes[0].table.cell(1, 1).text, "≥50%")


if __name__ == "__main__":
    unittest.main()
