import JSZip from 'jszip'

const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const find = (node, name) => node.getElementsByTagNameNS('*', name)[0]
const relPath = (path) => path.replace(/([^/]+)$/, '_rels/$1.rels')
const serialize = (xml) => new XMLSerializer().serializeToString(xml)
const part = (owner, target) => new URL(target, 'https://package.local/' + owner).pathname.slice(1)
async function xml(zip, path) {
  return new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml')
}

// PPTist renders the source master in its normal element renderer. On export put that
// artwork back in the dedicated layout so PowerPoint also keeps it out of slide edits.
export async function exportMasterArtwork(bytes, slides) {
  if (!slides.some((s) => s.elements.some((e) => e.odysseyMaster))) return bytes
  const zip = await JSZip.loadAsync(bytes)
  const field = slides.flatMap((s) => s.elements).find((e) => typeof e.odysseyPageNumber === 'number')
  if (field) {
    const presentation = await xml(zip, 'ppt/presentation.xml')
    presentation.documentElement.setAttribute('firstSlideNum', String(field.odysseyPageNumber))
    zip.file('ppt/presentation.xml', serialize(presentation))
  }
  for (const [i, slide] of slides.entries()) {
    if (!slide.elements.some((e) => e.odysseyMaster)) continue
    const path = 'ppt/slides/slide' + (i + 1) + '.xml'
    const sheet = await xml(zip, path),
      rels = await xml(zip, relPath(path))
    const template = [...rels.documentElement.children].find((r) =>
      r.getAttribute('Type').endsWith('/slideLayout')
    )
    const layoutPath = part(path, template.getAttribute('Target'))
    const layout = await xml(zip, layoutPath),
      layoutRels = await xml(zip, relPath(layoutPath))
    const tree = find(sheet, 'spTree'),
      dest = find(layout, 'spTree'),
      copies = new Map()
    let id = Math.max(
      1,
      ...[...dest.getElementsByTagNameNS('*', 'cNvPr')].map((n) => Number(n.getAttribute('id')) || 0)
    )
    for (const shape of [...tree.children]) {
      const nv = find(shape, 'cNvPr')
      const name = nv?.getAttribute('name')
      if (name !== 'OdysseyInheritedArtwork' && name !== 'OdysseyPageNumber') continue
      if (name === 'OdysseyPageNumber') {
        const run = find(shape, 'r')
        if (run) {
          const field = sheet.createElementNS(run.namespaceURI, 'a:fld')
          field.setAttribute('id', '{' + crypto.randomUUID().toUpperCase() + '}')
          field.setAttribute('type', 'slidenum')
          field.append(...Array.from(run.childNodes))
          run.replaceWith(field)
        }
      }
      for (const node of [shape, ...shape.getElementsByTagName('*')]) {
        for (const attr of [...node.attributes]) {
          if (attr.namespaceURI !== officeRel) continue
          const old = attr.value
          if (!copies.has(old)) {
            const source = [...rels.documentElement.children].find((r) => r.getAttribute('Id') === old)
            if (!source) continue
            const copy = layoutRels.importNode(source, true),
              next = 'inherited' + (copies.size + 1)
            copy.setAttribute('Id', next)
            layoutRels.documentElement.append(copy)
            copies.set(old, next)
          }
          node.setAttributeNS(officeRel, attr.name, copies.get(old))
        }
      }
      nv.setAttribute('id', String(++id))
      dest.append(layout.importNode(shape, true))
      shape.remove()
    }
    zip.file(path, serialize(sheet))
    zip.file(layoutPath, serialize(layout))
    zip.file(relPath(layoutPath), serialize(layoutRels))
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
