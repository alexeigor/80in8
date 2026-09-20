import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** An isolated production origin which a test can take completely offline. */
export async function serveBuild(
  options: { root?: () => string } = {},
): Promise<{ origin: string; stop: () => Promise<void> }> {
  const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url))
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  }
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      const root = options.root?.() ?? defaultRoot
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (!file.startsWith(`${resolve(root)}${sep}`)) {
        response.writeHead(403).end()
        return
      }
      const data = await readFile(file)
      // A successful reload after shutdown must come from the service worker,
      // never from the browser's ordinary HTTP cache.
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      response.end(data)
    })().catch(() => response.writeHead(404).end())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing server address')
  let stopped = false
  return {
    origin: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      if (stopped) return
      stopped = true
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    },
  }
}
