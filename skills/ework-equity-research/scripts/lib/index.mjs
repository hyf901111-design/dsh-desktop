import { realpath } from 'node:fs/promises'
import { digest, verifySources, verifyFacts } from './evidence.mjs'
import { schemaDiagnostics, diagnostic } from './schema.mjs'
import { runCalculations } from './calculations.mjs'
import { runDCF } from './dcf.mjs'
const receipts = new WeakMap()
export async function validatePacket(packet, { root } = {}) {
  const result = { ok: false, diagnostics: [], facts: [], sources: [] }
  let input
  try {
    input = JSON.stringify(packet)
    packet = JSON.parse(input)
  }
  catch {
    result.diagnostics.push(diagnostic('SCHEMA', '$', '研究包必须可序列化为JSON对象'))
    return result
  }
  result.diagnostics.push(...schemaDiagnostics(packet))
  if (result.diagnostics.length) return result
  result.synthetic = packet.synthetic
  try {
    if (typeof root !== 'string' || !root) throw new Error('必须显式提供快照根目录root')
    const base = await realpath(root)
    const checked = await verifySources(packet, base, result.diagnostics)
    result.sources = checked.sources
    result.facts = verifyFacts(packet, checked.sources, checked.texts, result.diagnostics)
  } catch (error) {
    result.diagnostics.push(diagnostic('ROOT', 'root', error.message))
  }
  result.ok = !result.diagnostics.some(d => d.severity === 'error')
  result.packetSha256 = digest(input)
  // Keep a private immutable copy: a caller cannot forge verification by editing a returned fact.
  receipts.set(result, {
    digest: result.packetSha256, facts: structuredClone(result.facts),
    diagnostics: structuredClone(result.diagnostics),
  })
  return result
}
export function calculatePacket(packet, validated) {
  const result = { ok: false, synthetic: packet?.synthetic === true, diagnostics: [], calculations: [], dcf: null }
  const receipt = receipts.get(validated)
  let hash
  try { hash = digest(JSON.stringify(packet)) } catch { /* diagnostic below */ }
  if (!receipt || receipt.digest !== hash) {
    result.diagnostics.push(diagnostic('VALIDATION_REQUIRED', '$',
      '须传入针对同一研究包在本进程实际核验所得的结果；编辑或反序列化后需重新validatePacket'))
    return result
  }
  result.diagnostics = structuredClone(receipt.diagnostics)
  result.calculations = runCalculations(packet, receipt.facts, result.diagnostics)
  result.dcf = runDCF(packet, receipt.facts, result.diagnostics)
  result.ok = !result.diagnostics.some(d => d.severity === 'error')
  return result
}
