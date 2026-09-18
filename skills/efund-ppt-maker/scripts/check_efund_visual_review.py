#!/usr/bin/env python3
"""Fail closed on absent/stale per-page visual review of the final PPTX and PDF.

This validates review evidence completeness, not truthfulness of an inspection.
The reviewer must actually inspect images; this script cannot replace vision.
"""
import argparse
import hashlib
import json
from pathlib import Path

CHECKS = ('titleColor', 'noShadow', 'tocStyle', 'overflow', 'brandFurniture')

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def audit(pptx, pdf, review_path, page_count):
    errors = []
    try:
        review = json.loads(Path(review_path).read_text())
        if review.get('pptxSha256') != digest(pptx) or review.get('pdfSha256') != digest(pdf):
            errors.append('visual-review-artifact-stale')
        if review.get('method') not in ('image-capable-model', 'human') or not review.get('reviewer'):
            errors.append('visual-review-not-performed')
        pages = review.get('pages', [])
        if [p.get('page') for p in pages] != list(range(1, page_count + 1)):
            errors.append('visual-review-pages-incomplete')
        for page in pages:
            for format in ('pptx', 'pdf'):
                record = page.get(format, {})
                image = Path(review_path).parent / record.get('image', '')
                if not image.is_file() or record.get('imageSha256') != digest(image):
                    errors.append('visual-review-image-missing-or-stale')
                if not record.get('renderer') or not str(record.get('notes', '')).strip():
                    errors.append('visual-review-observation-missing')
                if any(record.get('checks', {}).get(key) != 'pass' for key in CHECKS):
                    errors.append('visual-review-not-passed')
    except (OSError, ValueError, TypeError, AttributeError, KeyError):
        errors.append('visual-review-missing-or-invalid')
    return sorted(set(errors))

if __name__ == '__main__':
    from check_efund_cover import open_package, xml_root, NS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--json-output', type=Path)
    args = parser.parse_args()
    package = open_package(args.pptx)
    try:
        count = len(xml_root(package, 'ppt/presentation.xml').findall('p:sldIdLst/p:sldId', NS))
    finally:
        package.archive.close()
    errors = audit(args.pptx, args.pdf, args.review, count)
    result = json.dumps({'ok': not errors, 'status': 'passed' if not errors else 'review-required', 'issues': errors}, indent=2)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(result)
    print(result)
    raise SystemExit(bool(errors))
