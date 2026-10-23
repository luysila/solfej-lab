// index.html içindeki saf mantık bölümünü (PURE:BEGIN … PURE:END) Node'da test edilebilir bir modüle çevirir.
// Çıktı: tests/.generated/pure.mjs — git'e eklenmez, her `npm test` başında yeniden üretilir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!script) throw new Error('index.html içinde <script type="module"> bulunamadı');
const pure = script[1].match(/\/\* >>> PURE:BEGIN[^\n]*\n([\s\S]*?)\/\* <<< PURE:END \*\//);
if (!pure) throw new Error('PURE:BEGIN / PURE:END işaretleri bulunamadı (bu işaretler silinmemeli)');

// Testlerin kullandığı adlar. PURE bölümüne eklediğin ve test edeceğin yeni adları buraya ekle.
const EXPORTS = [
  'CONFIG', 'DEFAULT_CONFIG', 'deepMerge', 'diffConfig', 'sanitizeOverrides', 'validateConfig', 'getPath', 'setPath',
  'buildNotes', 'ROOTS', 'TYPE_BY_ID', 'CHORD_TYPES', 'INTERVAL_TYPES', 'KINDS', 'midiName', 'freqToMidi', 'midiToFreq',
  'nearestNoteName', 'pickVoicing', 'generateSession', 'planIntervals', 'planTriads', 'mulberry32',
  'compareToTarget', 'octaveModeFor', 'zoneOf', 'YinDetector', 'MedianFilter', 'SustainTracker',
  'createMachine', 'ALLOWED', 'S', 'Exercise', 'ExamSession', 'recordPitchFrame',
  'computeDiagnostics', 'buildAdvice', 'tendencyOf', 'makeHistoryEntry', 'normalizeHistory', 'pianoSampleMap', 'fmtSigned',
  'makeStaffMap', 'staffPosition', 'semitoneNeighbors',
];

const outDir = path.join(HERE, '.generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pure.mjs'), `${pure[1]}\nexport { ${EXPORTS.join(', ')} };\n`);
console.log(`PURE bölümü çıkarıldı → tests/.generated/pure.mjs (${EXPORTS.length} ad)`);
