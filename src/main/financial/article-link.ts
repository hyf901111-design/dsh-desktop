export async function openFinancialArticle(
  value: unknown,
  openExternal: (url: string) => Promise<void>
): Promise<{ ok: true }> {
  if (typeof value !== 'string' || !value || value.length > 4096) throw Error('链接无效')
  let url: URL
  try { url = new URL(value) } catch { throw Error('链接无效') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('链接无效')
  await openExternal(url.href)
  return { ok: true }
}
