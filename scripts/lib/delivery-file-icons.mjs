import { readFileSync } from 'node:fs'

// Original vscode-icons assets, pinned and attributed in delivery-file-icons/provenance.json.
// Files are read only while constructing the client patch; the injected selector is browser-only.
const provenance = JSON.parse(readFileSync(new URL('./delivery-file-icons/provenance.json', import.meta.url), 'utf8'))
const iconLicense = readFileSync(new URL('./delivery-file-icons/LICENSE', import.meta.url), 'utf8')

export const DELIVERY_FILE_ICONS = Object.freeze(Object.fromEntries(provenance.assets.map(asset => [
  asset.type,
  `data:image/svg+xml;base64,${readFileSync(new URL(`./delivery-file-icons/${asset.file}`, import.meta.url)).toString('base64')}`
])))

const DELIVERY_ICON_EXTENSIONS = Object.freeze({
  pdf: 'pdf',
  ppt: 'powerpoint', pptx: 'powerpoint', pps: 'powerpoint', ppsx: 'powerpoint', pot: 'powerpoint', potx: 'powerpoint', odp: 'powerpoint',
  doc: 'word', docx: 'word', dot: 'word', dotx: 'word', rtf: 'word', odt: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlsb: 'excel', xlt: 'excel', xltx: 'excel', ods: 'excel',
  html: 'html', htm: 'html', xhtml: 'html',
  csv: 'csv', tsv: 'csv',
  json: 'json', jsonl: 'json', ndjson: 'json',
  txt: 'text', text: 'text', log: 'text',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  zip: 'archive', gz: 'archive', gzip: 'archive', tar: 'archive', tgz: 'archive', bz2: 'archive', xz: 'archive', '7z': 'archive', rar: 'archive',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', avif: 'image', bmp: 'image', tiff: 'image', tif: 'image', heic: 'image', ico: 'image',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio', aiff: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', m4v: 'video', mpg: 'video', mpeg: 'video'
})

export function deliveryIconForPath(path) {
  if (typeof path !== 'string' || !path) return DELIVERY_FILE_ICONS.file
  let decoded = path
  try { decoded = decodeURIComponent(path) } catch { /* A literal percent is valid in a file name. */ }
  const name = decoded.replace(/\\/g, '/').split('/').pop()
  const extension = /\.([^.]+)$/.exec(name ?? '')?.[1].toLowerCase()
  return DELIVERY_FILE_ICONS[DELIVERY_ICON_EXTENSIONS[extension] ?? 'file']
}

export const deliveryIconSource = `
/*! vscode-icons/vscode-icons ${provenance.commit}
${iconLicense.replace(/\*\//g, '* /')} */
const DELIVERY_FILE_ICONS = Object.freeze(${JSON.stringify(DELIVERY_FILE_ICONS)});
const DELIVERY_ICON_EXTENSIONS = Object.freeze(${JSON.stringify(DELIVERY_ICON_EXTENSIONS)});
${deliveryIconForPath.toString()}
`
