#!/usr/bin/env python3
"""Audit the presented slide tree and explicitly requested native chart count.

The count is distinct, valid chart parts referenced by c:chart objects in
non-hidden presentation slides. It does not measure chart quality or replace
render review. Shape-based infographics require no native charts by default.
"""
import argparse
import hashlib
from io import BytesIO
import json
import posixpath
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
import xml.etree.ElementTree as ET
from efund_chart_properties import audit_chart_properties

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
SLIDE_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'


def relationship_part(part):
    folder, name = posixpath.split(part)
    return posixpath.join(folder, '_rels', name + '.rels')


def resolve_target(part, target):
    """Resolve an internal OPC URI without accepting an external or escaping URI."""
    uri = urlsplit(target)
    if uri.scheme or uri.netloc or uri.query or uri.fragment or not uri.path:
        raise ValueError('关系目标不是包内 Part URI')
    path = unquote(uri.path)
    if '\\' in path:
        raise ValueError('关系目标含反斜杠')
    resolved = posixpath.normpath(path.lstrip('/') if path.startswith('/') else
                                  posixpath.join(posixpath.dirname(part), path))
    if resolved in ('', '.', '..') or resolved.startswith('../'):
        raise ValueError('关系目标越出包根目录')
    return resolved


def audit(pptx, require_clean_slide_tree=False, min_native_charts=None):
    issues = []
    result = {'ok': False, 'issues': issues, 'sha256': None, 'slideCount': 0,
              'visibleSlideCount': 0, 'nativeChartCount': 0,
              'chartObjectCount': 0, 'referencedChartParts': [],
              'unlistedSlideParts': [], 'unlistedSlideRelationships': []}

    def add(code, **detail):
        issues.append({'severity': 'error', 'code': code, **detail})

    valid_minimum = min_native_charts is None or (
        type(min_native_charts) is int and min_native_charts >= 0)
    if not valid_minimum:
        add('native-chart-minimum-invalid')
    try:
        snapshot = Path(pptx).read_bytes()
        result['sha256'] = hashlib.sha256(snapshot).hexdigest()
        with ZipFile(BytesIO(snapshot)) as archive:
            issues.extend(audit_chart_properties(archive))
            members = set(archive.namelist())
            roots = {}

            def root(part):
                if part not in roots:
                    roots[part] = ET.fromstring(archive.read(part))
                return roots[part]

            def relationships(part):
                name = relationship_part(part)
                if name not in members:
                    return {}
                relationships_root = root(name)
                if relationships_root.tag != '{' + PR + '}Relationships':
                    raise ValueError(name + ' 的关系根节点无效')
                values = {}
                for relation in relationships_root:
                    if relation.tag != '{' + PR + '}Relationship':
                        continue
                    identifier = relation.get('Id')
                    if not identifier or identifier in values:
                        add('relationship-id-invalid', part=part,
                            relationshipId=identifier)
                        continue
                    values[identifier] = relation
                return values

            def linked_part(part, relation, kind, slide):
                if relation is None:
                    add(kind + '-reference-unresolved', slide=slide, part=part)
                    return None
                if (relation.get('Type') != R + '/' + kind or
                        relation.get('TargetMode', 'Internal') != 'Internal'):
                    add(kind + '-relationship-invalid', slide=slide, part=part,
                        relationshipId=relation.get('Id'))
                    return None
                try:
                    target = resolve_target(part, relation.get('Target', ''))
                    if target not in members:
                        raise ValueError('目标 Part 不存在')
                    expected = '{' + (P if kind == 'slide' else C) + '}' + (
                        'sld' if kind == 'slide' else 'chartSpace')
                    if root(target).tag != expected:
                        raise ValueError('目标 Part 根节点无效')
                    return target
                except (ValueError, ET.ParseError) as error:
                    add(kind + '-target-invalid', slide=slide, part=part,
                        relationshipId=relation.get('Id'), message=str(error))
                    return None

            presentation = root('ppt/presentation.xml')
            if presentation.tag != '{' + P + '}presentation':
                raise ValueError('演示文稿根节点无效或命名空间不受支持')
            slide_ids = presentation.findall('./p:sldIdLst/p:sldId', {'p': P})
            result['slideCount'] = len(slide_ids)
            slide_rels = relationships('ppt/presentation.xml')
            presented, referenced_ids, charts = set(), set(), set()
            for number, slide_id in enumerate(slide_ids, 1):
                identifier = slide_id.get('{' + R + '}id')
                if identifier in referenced_ids:
                    add('slide-reference-duplicate', slide=number)
                referenced_ids.add(identifier)
                part = linked_part('ppt/presentation.xml', slide_rels.get(identifier),
                                   'slide', number)
                if part is None:
                    continue
                if part in presented:
                    add('slide-reference-duplicate', slide=number, part=part)
                    continue
                presented.add(part)
                slide = root(part)
                visible = slide.get('show', '1').lower() not in ('0', 'false')
                if visible:
                    result['visibleSlideCount'] += 1
                chart_rels = relationships(part)
                # Descendant traversal includes charts nested in shape groups.
                for chart in slide.iter('{' + C + '}chart'):
                    target = linked_part(part, chart_rels.get(chart.get('{' + R + '}id')),
                                         'chart', number)
                    if target is not None and visible:
                        result['chartObjectCount'] += 1
                        charts.add(target)

            # Content types identify slides even when their filenames or folders
            # differ from slideN.xml. Declared parts must contain actual slides.
            physical_slides = set()
            content_types = root('[Content_Types].xml')
            if content_types.tag != '{' + CT + '}Types':
                raise ValueError('包内容类型根节点无效')
            for override in content_types.findall('{' + CT + '}Override'):
                if override.get('ContentType') != SLIDE_MIME:
                    continue
                part = resolve_target('', override.get('PartName', ''))
                if part not in members or root(part).tag != '{' + P + '}sld':
                    add('slide-part-invalid', part=part)
                else:
                    physical_slides.add(part)
            for part in sorted(presented - physical_slides):
                add('slide-content-type-missing', part=part)
            result['unlistedSlideParts'] = sorted(physical_slides - presented)
            result['unlistedSlideRelationships'] = sorted(
                identifier for identifier, relation in slide_rels.items()
                if relation.get('Type') == R + '/slide' and identifier not in referenced_ids)
            if require_clean_slide_tree:
                if result['unlistedSlideParts']:
                    add('unlisted-slide-part', parts=result['unlistedSlideParts'])
                if result['unlistedSlideRelationships']:
                    add('unlisted-slide-relationship',
                        relationshipIds=result['unlistedSlideRelationships'])
            result['referencedChartParts'] = sorted(charts)
            result['nativeChartCount'] = len(charts)
    except Exception as error:
        add('package-audit-failed', message=str(error))
    if valid_minimum and min_native_charts is not None and result['nativeChartCount'] < min_native_charts:
        add('native-chart-count-below-minimum', required=min_native_charts,
            actual=result['nativeChartCount'])
    result['ok'] = not issues
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('--require-clean-slide-tree', action='store_true')
    parser.add_argument('--min-native-charts', type=int)
    parser.add_argument('--json-output', type=Path)
    args = parser.parse_args()
    result = audit(args.pptx, args.require_clean_slide_tree, args.min_native_charts)
    report = json.dumps(result, ensure_ascii=False, indent=2)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(report + '\n', encoding='utf-8')
    print(report)
    raise SystemExit(0 if result['ok'] else 1)
