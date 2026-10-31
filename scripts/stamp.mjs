// Solfej Lab — sürüm etiketi
// index.html'deki css/js adreslerinin ?v=… etiketini yeniler ve import map'i js/ klasöründen yeniden üretir.
// Böylece yayından sonra tarayıcı önbelleğinde eski ve yeni dosyalar karışmaz (adres değişince dosya yeniden indirilir).
// Kullanım: npm run stamp            → etiket = şu anki tarih-saat (UTC, YYYYMMDDHHMM)
//           npm run stamp -- 2026a   → elle verilen etiket
// css/ ya da js/ altında bir dosyayı değiştirdikten (ya da yeni modül ekledikten) sonra, göndermeden önce çalıştırın.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'index.html');
const tag = process.argv[2] || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
if (!/^[\w.-]+$/.test(tag)) throw new Error(`geçersiz etiket: ${tag}`);

const modules = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort();
const map = JSON.stringify({ imports: Object.fromEntries(modules.map((f) => [`./js/${f}`, `./js/${f}?v=${tag}`])) }, null, 2);

let html = fs.readFileSync(HTML, 'utf8');
const before = html;
html = html.replace(/(<script type="importmap">\n)[\s\S]*?(\n<\/script>)/, `$1${map}$2`);
if (html === before && !before.includes(map)) throw new Error('index.html içinde <script type="importmap"> bulunamadı');
html = html.replace(/(\.\/(?:css|js)\/[\w-]+\.(?:css|js))\?v=[\w.-]+/g, `$1?v=${tag}`);
fs.writeFileSync(HTML, html);
console.log(`Sürüm etiketi: ${tag} · ${modules.length} modül import map'te · index.html güncellendi`);
