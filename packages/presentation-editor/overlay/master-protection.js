import legacyArtwork from './legacy-master-art.json'
const legacy = new Set(legacyArtwork)
const art = {
  'efund-cover-water.jpeg': {
    size: 582283,
    hash: 'e103fda4f259ce9f9cdc15a2758d6c70821ee015115b5a1bd70137b475e3638a'
  },
  'efund-header-strip.png': {
    size: 4397,
    hash: '32774ef7250fb16a74e6c9b119dcf780e461ae6a4f6f23a7fc7a3ee219bb2ddf'
  },
  'efund-footer-line.png': {
    size: 218,
    hash: '24815d2ceca7a173f85d8c93f416300264e22299a071846f49abe6bde5d98461'
  },
  'efund-logo.png': {
    size: 7051,
    hash: '70679a373937949ddd82b702ebac6f1a2d0d8c843e5f736a95e0b6057e54960b'
  }
}
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')

async function brandedImage(e, width, height) {
  if (e.type !== 'image' || typeof e.src !== 'string' || !e.src.startsWith('data:image/')) return false
  const idx = e.src.indexOf(',')
  if (idx < 0) return false
  const encoded = e.src.slice(idx + 1)
  const candidates = Object.entries(art).filter(
    ([name, a]) =>
      4 * Math.ceil(a.size / 3) === encoded.length &&
      (name.includes('header')
        ? e.top < height * 0.15
        : name.includes('footer')
          ? e.top > height * 0.75
          : name.includes('cover')
            ? e.left > width * 0.5
            : e.left > width * 0.65 && (e.top < height * 0.22 || e.top > height * 0.73))
  )
  if (!candidates.length) return false
  const hash = await digest(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))
  return candidates.some(([, a]) => a.hash === hash)
}

export async function protectMaster(slides, width, ratio, legacyDocument) {
  let changed = false
  for (const slide of slides) {
    if (slide.odysseyMasterVersion === 1) continue
    await Promise.all(
      slide.elements.map(async (e) => {
        if (e.odysseyMaster) return
        let inherited = await brandedImage(e, width, width * ratio)
        if (!inherited && legacyDocument && ['shape', 'text', 'image', 'line'].includes(e.type)) {
          const keys = Object.keys(e)
            .filter((k) => !['id', 'groupId', 'lock', 'odysseyMaster'].includes(k))
            .sort()
          const bytes = new TextEncoder().encode(JSON.stringify(keys.map((k) => [k, e[k]])))
          inherited = legacy.has(await digest(bytes))
        }
        if (inherited) {
          e.lock = true
          e.odysseyMaster = true
          changed = true
        }
      })
    )
    slide.odysseyMasterVersion = 1
  }
  return changed
}
