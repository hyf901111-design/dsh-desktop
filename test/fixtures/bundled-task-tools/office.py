import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from docx import Document
from lxml import etree
from openpyxl import Workbook, load_workbook
from PIL import Image
from pptx import Presentation

assert Path(sys.prefix).resolve() == Path(sys.argv[1]).resolve()
assert sys.dont_write_bytecode and sys.flags.no_user_site
assert not os.environ.get("PYTHONPATH")
assert requests.Session and etree.fromstring(b"<item/>").tag == "item"
Image.new("RGB", (4, 4)).save("check.png")
assert pd.Series(np.array([20, 22])).sum() == 42

document = Document()
document.add_paragraph("跨设备文稿")
document.save("probe.docx")
assert Document("probe.docx").paragraphs[0].text == "跨设备文稿"

book = Workbook()
book.active["B2"] = 42
book.save("probe.xlsx")
assert load_workbook("probe.xlsx").active["B2"].value == 42

slides = Presentation()
slides.slides.add_slide(slides.slide_layouts[0]).shapes.title.text = "跨设备演示"
slides.save("probe.pptx")
assert Presentation("probe.pptx").slides[0].shapes.title.text == "跨设备演示"
