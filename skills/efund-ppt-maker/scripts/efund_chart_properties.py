"""Known native chart constraints, shared by generation and both gates.

c:axId/c:crossAx use UInt32 in the schema; Office additionally limits their
value to 2147483647. Open XML SDK 3.5.1/Office2019 reproduces both constraints.
This is a bounded compatibility check, not a complete OOXML schema validator.
Line-label positions also include a native PowerPoint regression that passes
generic schema validation: plot-level outEnd repairs the containing slide.
"""
import re
import xml.etree.ElementTree as ET

C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
AXIS_TAGS = {'{' + C + '}' + tag for tag in ('axId', 'crossAx')}
AXIS_KINDS = {'{' + C + '}' + tag for tag in ('catAx', 'valAx', 'dateAx', 'serAx')}
OFFICE_AXIS_MAX = 2147483647
INTEGER = re.compile(r'[+-]?[0-9]+\Z')
DLBL_POSITIONS = frozenset(('l', 'r', 'b', 't', 'ctr', 'bestFit', 'inBase', 'inEnd', 'outEnd'))
LINE_POSITIONS = frozenset(('l', 'r', 'b', 't', 'ctr'))


def axis_integer(value):
    text = value.strip(' \t\r\n') if isinstance(value, str) else ''
    if not INTEGER.fullmatch(text):
        raise ValueError('轴 ID 必须是十进制整数')
    return int(text)


def _axis_graph(root):
    """Read declared identities first; never invent axes for dangling references."""
    declared = []
    for axis in root.iter():
        if axis.tag not in AXIS_KINDS:
            continue
        identifiers = axis.findall('{' + C + '}axId')
        if len(identifiers) != 1:
            raise ValueError('每条轴必须恰有一个 axId 声明')
        value = axis_integer(identifiers[0].get('val'))
        if value in declared:
            raise ValueError('图表中出现重复轴 ID 声明')
        declared.append(value)
    references = [(node, axis_integer(node.get('val')))
                  for node in root.iter() if node.tag in AXIS_TAGS]
    if any(value not in declared for _, value in references):
        raise ValueError('轴引用没有对应的轴声明')
    return declared, references


def chart_axis_issues(root, part):
    if root.tag != '{' + C + '}chartSpace':
        return []
    issues, counts = [], {}
    for node in root.iter():
        if node.tag not in AXIS_TAGS:
            continue
        tag = node.tag.split('}')[-1]
        counts[tag] = counts.get(tag, 0) + 1
        try:
            value = axis_integer(node.get('val'))
            valid = 0 <= value <= OFFICE_AXIS_MAX
        except ValueError:
            valid = False
        if not valid:
            issues.append({'severity': 'error', 'code': 'chart-axis-id-out-of-range',
                           'part': part, 'xpath': f'(//c:{tag})[{counts[tag]}]/@val',
                           'value': node.get('val'),
                           'message': '轴 ID 须符合 UInt32 及 Office 约束：0..2147483647'})
    if not issues:
        try:
            _axis_graph(root)
        except ValueError as error:
            issues.append({'severity': 'error', 'code': 'chart-axis-graph-invalid',
                           'part': part, 'message': str(error)})
    return issues


def default_label_position(chart_type):
    """Use the plot's vocabulary; never reuse a bar's outEnd for a line."""
    return {'lineChart': 't', 'barChart': 'outEnd'}.get(chart_type)


def _line_label_nodes(root):
    if root.tag != '{' + C + '}chartSpace':
        return []
    return [node for plot in root.findall('./c:chart/c:plotArea/c:lineChart', {'c': C})
            for node in plot.iter('{' + C + '}dLblPos')]


def chart_label_issues(root, part):
    # Constrain the proper plot and its series/point overrides, not every label
    # in a combination chart. Bar labels, omitted defaults and delete stay intact.
    positions = {node: index for index, node in
                 enumerate(root.iter('{' + C + '}dLblPos'), 1)}
    issues = []
    for node in _line_label_nodes(root):
        value = node.get('val')
        if value not in LINE_POSITIONS:
            code = ('chart-label-position-incompatible' if value in DLBL_POSITIONS
                    else 'chart-label-position-invalid')
            issues.append({'severity': 'error', 'code': code, 'part': part,
                           'xpath': f'(//c:dLblPos)[{positions[node]}]/@val',
                           'value': value, 'chartType': 'lineChart',
                           'message': '折线图标签位置须为 l/r/b/t/ctr；原生兼容性默认使用 t'})
    return issues


def _audit_charts(archive, checks):
    # Validate every packaged chart, including hidden/orphan parts, without
    # counting them toward the visible native-chart quota. Namespace, not a
    # conventional folder or filename, identifies the chart part.
    issues = []
    for name in sorted(archive.namelist()):
        if name.endswith('.xml'):
            root = ET.fromstring(archive.read(name))
            for check in checks:
                issues.extend(check(root, name))
    return issues


def audit_chart_axis_ids(archive):
    return _audit_charts(archive, (chart_axis_issues,))


def audit_chart_properties(archive):
    return _audit_charts(archive, (chart_axis_issues, chart_label_issues))


def normalize_label_positions(root):
    """Repair only known line-position incompatibilities in a new output.

    Validate all positions before changing any node. Unknown values require
    author correction. Data, label text, chart type and frame are untouched;
    render the resulting label placement again before native acceptance.
    """
    changes = []
    for node in _line_label_nodes(root):
        value = node.get('val')
        if value not in DLBL_POSITIONS:
            raise ValueError('未知折线图标签位置，须修正生成过程')
        if value not in LINE_POSITIONS:
            changes.append(node)
    for node in changes:
        node.set('val', default_label_position('lineChart'))
    return len(changes)


def normalize_axis_ids(root):
    """Renumber a known 32-bit axis graph atomically; preserve legal charts.

    Signed IDs and unsigned wraparound IDs cannot be repaired by abs() or
    +2**32: the latter can exceed Office's signed-positive upper bound.
    Reassign declared identities in their existing order and rewrite every
    reference together. Values, zero crossings, geometry and data are untouched.
    """
    if root.tag != '{' + C + '}chartSpace':
        return 0
    declared, references = _axis_graph(root)
    if any(not -(2**31) <= value <= 2**32 - 1 for _, value in references):
        raise ValueError('轴 ID 超出可识别的 32 位范围，须修正生成过程')
    if all(0 <= value <= OFFICE_AXIS_MAX for _, value in references):
        return 0
    mapping = {value: str(index + 1) for index, value in enumerate(declared)}
    if len(mapping) > OFFICE_AXIS_MAX:
        raise ValueError('图表轴数超出 Office 可用 ID 范围')
    changes = [(node, mapping[value]) for node, value in references
               if node.get('val') != mapping[value]]
    for node, value in changes:
        node.set('val', value)
    return len(changes)
