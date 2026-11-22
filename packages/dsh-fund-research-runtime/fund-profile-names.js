import { load } from 'cheerio/slim'
import { businessText } from './financial-contract.js'

// Public product-page evidence is separate from the hosted provider envelope.
// Only the six-digit fund code leaves the client. Account bridge credentials
// and the user's research conversation never go to the public source.
export async function readFundProfileNames(code, { signal, fetch: request = globalThis.fetch } = {}) {
  if (!/^\d{6}$/u.test(code)) throw new TypeError('Invalid fund code.')
  const url = `https://fund.eastmoney.com/data/xininfo_${code}.html`
  const timeout = AbortSignal.timeout(6000)
  const response = await request(url, {
    redirect: 'error', credentials: 'omit', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { accept: 'text/html' }
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    await response.body?.cancel()
    return null
  }
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > 512 * 1024) return null
    chunks.push(chunk)
  }
  const $ = load(Buffer.concat(chunks).toString('utf8'))
  const tables = $('table').filter((_i, table) =>
    $(table).find('th, td.th').toArray().some(cell => $(cell).text().trim() === '基金全称'))
  if (tables.length !== 1) return null
  const field = label => {
    const headers = tables.find('th, td.th').filter((_i, cell) => $(cell).text().trim() === label)
    if (headers.length !== 1) return null
    return businessText(headers.next('td').text().trim()) ?? null
  }
  const codes = field('基金代码')?.match(/(?<!\d)\d{6}(?!\d)/gu)
  const fullName = field('基金全称')
  if (!codes?.includes(code) || !fullName) return null
  return { code, full_name: fullName, short_name: field('基金简称'), source: '天天基金 · 基金基本资料', source_url: url }
}
