import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from pptx import Presentation
from pptx.util import Inches

sys.path.insert(
    0, str(Path(__file__).resolve().parents[1] / "skills/efund-ppt-maker/scripts")
)
from meeting_deck import create, optimize


class MeetingDeckTest(unittest.TestCase):
    def test_native_structure_and_preserved_unedited_parts(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            p = Presentation()
            p.slide_width, p.slide_height = Inches(10), Inches(5.625)
            for title in ["风险", "依据"]:
                slide = p.slides.add_slide(p.slide_layouts[1])
                slide.shapes.title.text = title
                tx = slide.placeholders[1].text_frame
                for i, text in enumerate(
                    ["交付延迟", "两项仍需验收", "数据缺口", "需复核样本"]
                ):
                    para = tx.add_paragraph() if i else tx.paragraphs[0]
                    r = para.add_run()
                    r.text = text
                    r.font.bold = i % 2 == 0
            p.save(root / "source.pptx")
            result = optimize(root / "source.pptx", root / "changed.pptx", [1])
            self.assertEqual(result["pages"], [[1, "list"]])
            with (
                ZipFile(root / "changed.pptx") as new,
                ZipFile(root / "source.pptx") as old,
            ):
                self.assertEqual(set(new.namelist()), set(old.namelist()))
                self.assertEqual(
                    [n for n in old.namelist() if new.read(n) != old.read(n)],
                    ["ppt/slides/slide1.xml"],
                )
            shapes = Presentation(root / "changed.pptx").slides[0].shapes
            self.assertEqual(
                [s.text for s in shapes if s.name == "meeting-number"], ["01", "02"]
            )
            with self.assertRaises(FileExistsError):
                optimize(root / "source.pptx", root / "changed.pptx", [1])

    def test_create_uses_source_values_and_native_cells(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            spec = root / "spec.json"
            spec.write_text(
                json.dumps(
                    {
                        "title": "周报",
                        "pages": [
                            {
                                "kind": "table",
                                "title": "覆盖进展",
                                "rows": [["地区", "目标"], ["南区", "75%"]],
                                "focus": 1,
                                "numeric": [1],
                            }
                        ],
                    }
                )
            )
            create(spec, root / "result.pptx")
            prs = Presentation(root / "result.pptx")
            self.assertEqual(len(prs.slides), 2)
            self.assertIn(
                "周报", [s.text for s in prs.slides[0].shapes if s.has_text_frame]
            )
            table = next(s.table for s in prs.slides[1].shapes if s.has_table)
            self.assertEqual(table.cell(1, 1).text, "75%")


if __name__ == "__main__":
    unittest.main()
