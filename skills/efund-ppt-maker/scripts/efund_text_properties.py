"""DrawingML text-property sequence used by the authoring helper and gate.

This checks known ordering/choice constraints, not the whole OOXML schema.
"""
import re

GROUPS = (
    ('ln',), ('noFill','solidFill','gradFill','blipFill','pattFill','grpFill'),
    ('effectLst','effectDag'), ('highlight',), ('uLnTx','uLn'), ('uFillTx','uFill'),
    ('latin',), ('ea',), ('cs',), ('sym',), ('hlinkClick',), ('hlinkMouseOver',),
    ('rtl',), ('extLst',),
)
RANK = {tag: i for i, group in enumerate(GROUPS) for tag in group}
CJK = re.compile(r'[\u3400-\u9fff]')
BRAND_FONT = '华文黑体_易方达'


def invalid_text_properties(properties):
    ranks = [RANK[c.tag.split('}')[-1]] for c in properties if c.tag.split('}')[-1] in RANK]
    return ranks != sorted(ranks) or len(ranks) != len(set(ranks))


def normalize_run(run, ns):
    """Normalize rewritten CJK runs; preserve size, color, emphasis and geometry."""
    text = run.findtext('a:t', '', ns)
    props = run.find('a:rPr', ns)
    if props is None or not CJK.search(text):
        return
    # Do not replace foreign/user-template fonts. Explicit brand runs only.
    ea = props.find('a:ea', ns)
    if ea is None or ea.get('typeface') != BRAND_FONT:
        return
    props.set('lang', 'zh-CN')
    props.set('altLang', 'en-US')
    # Pure Chinese runs use the same native font as their East Asian face.
    if not re.search(r'[A-Za-z0-9]', text):
        for tag in ('latin', 'cs'):
            face = props.find('a:'+tag, ns)
            if face is not None:
                face.set('typeface', BRAND_FONT)
    for face in props:
        if face.tag.split('}')[-1] in ('latin','ea','cs') and face.get('typeface') == BRAND_FONT:
            for attr in ('charset','panose','pitchFamily'):
                face.attrib.pop(attr, None)


def canonicalize(properties):
    """Sort known children; conflicting duplicate properties require author input."""
    ranks = [RANK[c.tag.split('}')[-1]] for c in properties if c.tag.split('}')[-1] in RANK]
    if len(ranks) != len(set(ranks)):
        raise ValueError('Conflicting duplicate text properties; resolve explicitly')
    properties[:] = sorted(properties, key=lambda c: RANK.get(c.tag.split('}')[-1], 999))
