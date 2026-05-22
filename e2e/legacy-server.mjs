import { createServer } from 'node:http'
import { createReadStream, statSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4174
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.gpx':  'application/gpx+xml',
}

createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0])
  const filePath = join(ROOT, pathname)

  try {
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      const idx = join(filePath, 'index.html')
      if (existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        createReadStream(idx).pipe(res)
        return
      }
      res.writeHead(403); res.end('Forbidden'); return
    }
    const mime = MIME[extname(filePath)] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    createReadStream(filePath).pipe(res)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('404 Not Found')
  }
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Legacy static server ready on http://localhost:${PORT}\n`)
})
