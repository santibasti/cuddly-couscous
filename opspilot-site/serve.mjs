// Tiny static server for local preview of dist/ (no dependencies). Works on Windows and POSIX.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
const root = resolve(import.meta.dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const port = process.env.PORT || 4173;
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(join(root, p));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`Preview running at http://localhost:${port}`));
