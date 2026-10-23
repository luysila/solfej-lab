// Solfej Lab — geliştirme sunucusu (Python gerektirmez; yalnızca Node.js 18+).
// Kullanım: npm run serve  →  http://localhost:8000
// Farklı port: PORT=9000 npm run serve  (PowerShell: $env:PORT=9000; npm run serve)
//
// Proje klasörünü durağan (statik) dosya olarak sunar. Yalnızca bu bilgisayardan erişilir
// (127.0.0.1); mikrofon izni için tarayıcı localhost'u güvenli bağlam sayar.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8000;

// Uzantıya göre içerik türü (MIME). ES modülleri için .mjs/.js doğru türle gitmeli.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Yalnızca GET');

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Geçersiz adres');
  }

  // Klasör dışına çıkmayı (../) engelle.
  let file = path.resolve(ROOT, '.' + urlPath);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Erişim yok');

  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = path.join(file, 'index.html');
      info = await stat(file);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store', // geliştirirken her yenilemede güncel dosya gelsin
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Bulunamadı: ' + urlPath);
  }
  console.log(`${res.statusCode} ${req.method} ${urlPath}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} kullanımda. Başka bir sunucu açık olabilir; kapatın ya da PORT=9000 gibi başka port seçin.`);
  } else {
    console.error('Sunucu başlatılamadı:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Solfej Lab hazır → http://localhost:${PORT}  (durdurmak için Ctrl+C)`);
});
