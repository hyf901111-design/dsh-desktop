#!/usr/bin/env python3
"""Normalize brand text and known chart compatibility faults into a NEW PPTX.

Requires lxml (python-pptx dependency). Axis references are reassigned together
to Office-safe IDs; incompatible line-label positions become top. Data, label
text, chart type and outer frame are not changed. Re-render labels afterwards.

Preserves XML namespaces, ZIP metadata and untouched members. Does not certify
PowerPoint compatibility. Re-render and run all affected gates on the new file.
"""
import argparse
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as ET
from efund_text_properties import normalize_run, canonicalize
from efund_chart_properties import normalize_axis_ids, normalize_label_positions
from check_efund_cover import NS
from sanitize_pptx_metadata import clean_app, SanitizePolicy


def normalize(source, output):
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve() or output.exists():
        raise ValueError('Output must be a new file; original is never overwritten')
    with ZipFile(source) as archive:
        entries = []
        for info in archive.infolist():
            data = archive.read(info.filename)
            if info.filename == "docProps/app.xml":
                data = clean_app(data, SanitizePolicy())
            if info.filename.startswith('ppt/') and info.filename.endswith('.xml'):
                root = ET.fromstring(data)
                before = ET.tostring(root)
                normalize_axis_ids(root)
                normalize_label_positions(root)
                for run in root.findall('.//a:r', NS):
                    normalize_run(run, NS)
                for tag in ('rPr','defRPr','endParaRPr'):
                    for props in root.findall('.//a:'+tag, NS):
                        canonicalize(props)
                if ET.tostring(root) != before:
                    data = ET.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
            entries.append((info, data))
    with ZipFile(output, 'x') as archive:
        for info, data in entries:
            archive.writestr(info, data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    normalize(args.source, args.output)
