/** Small, self-authored PDF: empty pages and named destinations, no reference content. */
export function paginationPdf(pages: Record<string, number>, count = 4): Buffer {
  const namesId = count + 3, streamId = count + 4
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /Names << /Dests ${namesId} 0 R >> >>`,
    `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${count} >>`,
    ...Array.from({ length: count }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents ${streamId} 0 R >>`),
    `<< /Names [${Object.entries(pages).sort(([a], [b]) => a.localeCompare(b)).map(([id, page]) => `(${id}) [${page + 2} 0 R /XYZ 0 800 null]`).join(' ')}] >>`,
    '<< /Length 0 >>\nstream\n\nendstream'
  ]
  let pdf = '%PDF-1.7\n', offsets = [0]
  for (const [i, body] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n` }
  const start = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(pdf)
}
