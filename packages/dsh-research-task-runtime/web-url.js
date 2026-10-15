/** Shared by research's injected client and the note creation form. Keep self-contained for injection. */
export function normalizeResearchWebUrl(value) {
  if (typeof value !== 'string') return null
  const source = value.trim().replace(/^(https?:\/\/)(?:(?:%0[9a-d])|%20|[\u0009-\u000d\u0020])+/i, '$1')
  if (source.length === 0 || source.length > 8192) return null
  try {
    const Url = typeof globalThis.URL === 'function' ? globalThis.URL : globalThis.window?.URL
    if (typeof Url !== 'function') return null
    /* ODYSSEY_WEB_ADDRESS_COMPLETION */
    let address = source
    if (address.startsWith('//')) address = 'https:' + address
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(address) || /^(?:localhost|[^/:]+\.[^/:]+):[0-9]+(?:[/?#]|$)/i.test(address)) {
      const host = address.split(/[/?#]/)[0]
      if (!host.includes('.') && !/^localhost(?::[0-9]+)?$/i.test(host)) return null
      address = 'https://' + address
    }
    const url = new Url(address)
    if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null
    url.hostname = url.hostname.toLowerCase()
    if (url.protocol === 'https:' && url.port === '443' || url.protocol === 'http:' && url.port === '80') url.port = ''
    return url.href
  } catch {
    return null
  }
}
