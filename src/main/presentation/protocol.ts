import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
// The editor gets its own origin, with no desktop bridge and no network access.
export async function handleEditorAsset(root: string, request: Request): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname.slice(1) || 'index.html'
  if (
    request.method !== 'GET' ||
    url.hostname !== 'editor' ||
    !/^([\w-]+\/)*[\w.-]+$/.test(path) ||
    path.includes('..')
  )
    return new Response(null, { status: 404 })
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.tgz': 'application/gzip'
  }
  try {
    const data = await readFile(join(root, 'out/presentation-editor', path))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'"
      }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
