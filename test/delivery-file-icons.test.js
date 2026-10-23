import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const icons = await import('../scripts/lib/delivery-file-icons.mjs').catch(() => ({}))

describe('delivery file icons', () => {
  it('supplies distinct real SVG icons for the supported delivery types', () => {
    expect(typeof icons.deliveryIconForPath).toBe('function')
    const types = ['pdf', 'powerpoint', 'word', 'excel', 'html', 'csv', 'json', 'text', 'markdown', 'archive', 'image', 'audio', 'video', 'file']
    const values = types.map(type => icons.DELIVERY_FILE_ICONS[type])
    expect(new Set(values).size).toBe(types.length)
    for (const value of values) {
      expect(value).toMatch(/^data:image\/svg\+xml;base64,/)
      const svg = Buffer.from(value.split(',')[1], 'base64').toString('utf8')
      expect(svg).toMatch(/<svg[\s>]/)
      expect(svg).not.toMatch(/<script\b|<foreignObject\b|\son\w+\s*=/i)
      for (const reference of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']|url\(\s*([^)]*)\)/gi)) {
        expect((reference[1] ?? reference[2]).replace(/^["']|["']$/g, '')).toMatch(/^#[A-Za-z][\w:.-]*$/)
      }
    }
  })

  it.each([
    ['报告.PDF', 'pdf'], ['演示.PPTX', 'powerpoint'], ['演示.ppt', 'powerpoint'],
    ['方案.docx', 'word'], ['方案.doc', 'word'], ['模型.xlsx', 'excel'], ['模型.xls', 'excel'],
    ['页面.htm', 'html'], ['页面.html', 'html'], ['数据.csv', 'csv'], ['数据.tsv', 'csv'],
    ['台账.json', 'json'], ['记录.txt', 'text'], ['说明.md', 'markdown'],
    ['资料.tar.gz', 'archive'], ['资料.zip', 'archive'], ['图.png', 'image'], ['图.svg', 'image'],
    ['声音.mp3', 'audio'], ['视频.mp4', 'video'], ['交付.custom-format', 'file']
  ])('uses the matching icon for %s', (path, type) => {
    expect(typeof icons.deliveryIconForPath).toBe('function')
    expect(icons.deliveryIconForPath(path)).toBe(icons.DELIVERY_FILE_ICONS[type])
  })

  it('supports Chinese, URI escapes and Windows paths without guessing unknown formats', () => {
    expect(typeof icons.deliveryIconForPath).toBe('function')
    expect(icons.deliveryIconForPath('/交付/%E6%AD%A3%E5%BC%8F%20%E6%8A%A5%E5%91%8A%2EPDF')).toBe(icons.DELIVERY_FILE_ICONS.pdf)
    expect(icons.deliveryIconForPath('C:\\交付\\方案.PPTX')).toBe(icons.DELIVERY_FILE_ICONS.powerpoint)
    for (const path of [null, undefined, {}, '', '/资料/目录.pdf/', '未知.bin', '无扩展名', '/work/100%.pdf', '/work/bad%E0%A4%A.pdf']) {
      expect(icons.deliveryIconForPath(path)).toBe(path === '/work/100%.pdf' || path === '/work/bad%E0%A4%A.pdf' ? icons.DELIVERY_FILE_ICONS.pdf : icons.DELIVERY_FILE_ICONS.file)
    }
  })

  it('injects the same icon mapping and selector into a browser without Node dependencies', () => {
    expect(typeof icons.deliveryIconSource).toBe('string')
    const license = readFileSync(new URL('../scripts/lib/delivery-file-icons/LICENSE', import.meta.url), 'utf8')
    expect(icons.deliveryIconSource).toContain(license)
    const runtime = runInNewContext(`${icons.deliveryIconSource}\n({ DELIVERY_FILE_ICONS, deliveryIconForPath })`, {})
    expect(runtime.deliveryIconForPath('/交付/报告.PDF')).toBe(icons.DELIVERY_FILE_ICONS.pdf)
    expect(runtime.deliveryIconForPath('/交付/未定义.rptx')).toBe(icons.DELIVERY_FILE_ICONS.file)
    expect(JSON.stringify(runtime.DELIVERY_FILE_ICONS)).toBe(JSON.stringify(icons.DELIVERY_FILE_ICONS))
  })

  it('pins original SVG bytes and the upstream MIT license with verifiable provenance', () => {
    const folder = new URL('../scripts/lib/delivery-file-icons/', import.meta.url)
    const provenance = JSON.parse(readFileSync(new URL('provenance.json', folder), 'utf8'))
    expect(provenance.repository).toBe('https://github.com/vscode-icons/vscode-icons')
    expect(provenance.commit).toMatch(/^[a-f0-9]{40}$/)
    expect(provenance.assets).toHaveLength(14)
    for (const asset of [...provenance.assets, provenance.license]) {
      const raw = readFileSync(new URL(asset.file, folder))
      expect(createHash('sha256').update(raw).digest('hex')).toBe(asset.sha256)
      expect(asset.sourceUrl).toBe(`https://raw.githubusercontent.com/vscode-icons/vscode-icons/${provenance.commit}/${asset.originalPath}`)
      if (asset.type) expect(icons.DELIVERY_FILE_ICONS[asset.type]).toBe(`data:image/svg+xml;base64,${raw.toString('base64')}`)
    }
    expect(readFileSync(new URL('LICENSE', folder), 'utf8')).toMatch(/MIT License/)
  })
})
