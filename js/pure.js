// Solfej Lab — js/pure.js
// Saf mantık (eski "PURE bölümü"): yardımcılar, nota teorisi, soru üreticisi, çalım planı, porte konumu, YIN,
// sustain, yönlendirme, durum makinesi, kilitli ilerleme, sınav oturumu, teşhis, geçmiş kaydı, doğrulama.
// DOM'a ve Web Audio'ya dokunmaz; Node birim testleri bu dosyayı doğrudan içe aktarır.

import { CONFIG, DEFAULT_CONFIG } from './config.js';

// ───────────────────────────────────────────────────────────────────────
// 1) GENEL YARDIMCILAR
// ───────────────────────────────────────────────────────────────────────
export const clamp   = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const dbToLin = (db) => Math.pow(10, db / 20);
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}
/** base'in derin kopyasına over'ı işler (diziler bütün olarak değiştirilir) */
export function deepMerge(base, over) {
  const out = deepClone(base);
  const walk = (dst, src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (isPlainObject(v) && isPlainObject(dst[k])) walk(dst[k], v);
      else dst[k] = deepClone(v);
    }
  };
  walk(out, over);
  return out;
}
/** Yalnızca base'den farklı yaprakları döndürür → "özel ayarlar" */
export function diffConfig(base, cur) {
  const out = {};
  for (const [k, v] of Object.entries(cur || {})) {
    const b = base?.[k];
    if (isPlainObject(v) && isPlainObject(b)) {
      const d = diffConfig(b, v);
      if (Object.keys(d).length) out[k] = d;
    } else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = deepClone(v);
  }
  return out;
}
export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (!isPlainObject(o[k])) o[k] = {}; o = o[k]; }
  o[keys[keys.length - 1]] = value;
  return obj;
}

// Yeni anahtar kabul eden sözlükler (değerleri sayı olmalı)
export const OPEN_MAPS = new Set(['INTERVAL_RULES.WEIGHTS', 'CHORD_RULES.MAIN_WEIGHTS', 'SCORING.TYPE_WEIGHTS']);

/**
 * Dışarıdan gelen (localStorage / içe aktarılan JSON) özel ayarları ayıklar:
 * bilinmeyen anahtarlar ve tür uyuşmazlıkları atılır, uyarı listesi döner.
 */
export function sanitizeOverrides(over, base = DEFAULT_CONFIG, path = '', warnings = []) {
  const clean = {};
  if (!isPlainObject(over)) { warnings.push(`${path || 'ayarlar'}: nesne bekleniyordu`); return { clean, warnings }; }
  for (const [k, v] of Object.entries(over)) {
    const p = path ? `${path}.${k}` : k;
    if (!path && k === 'PRESETS') { warnings.push('PRESETS: koddan düzenlenir'); continue; }
    if (!(k in base)) {
      if (OPEN_MAPS.has(path)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k] = v;
        else warnings.push(`${p}: sayı bekleniyordu`);
      } else warnings.push(`${p}: bilinmeyen ayar (yok sayıldı)`);
      continue;
    }
    const b = base[k];
    if (isPlainObject(b)) {
      const r = sanitizeOverrides(v, b, p, warnings);
      if (Object.keys(r.clean).length) clean[k] = r.clean;
    } else if (Array.isArray(b)) {
      const want = typeof (b[0] ?? 'string');
      if (Array.isArray(v) && v.every((x) => typeof x === want)) clean[k] = deepClone(v);
      else warnings.push(`${p}: liste bekleniyordu`);
    } else if (typeof b === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
      else warnings.push(`${p}: sayı bekleniyordu`);
    } else if (typeof v === typeof b || (k === 'FFT_SIZE' && typeof v === 'number')) {
      clean[k] = v;
    } else warnings.push(`${p}: ${typeof b} bekleniyordu`);
  }
  return { clean, warnings };
}

// Tohumlanabilir RNG (aynı tohum → aynı soru seti)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function weightedPick(items, weightOf, rng) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it) || 0);
  if (!(total > 0)) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const it of items) { r -= Math.max(0, weightOf(it) || 0); if (r < 0) return it; }
  return items[items.length - 1];
}

// Biçimlendirme (teşhis metinleri için)
export const NF0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export const NF1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const MINUS = '−';
export function fmtSigned(v, digits = 0) {
  const s = (digits ? NF1 : NF0).format(Math.abs(v));
  if (/^0([.,]0+)?$/.test(s)) return s;
  return (v < 0 ? MINUS : '+') + s;
}
export const fmtSeconds = (ms) => NF1.format(ms / 1000);


// ───────────────────────────────────────────────────────────────────────
// Nota teorisi — doğru enharmonik yazım (C–E♭–G♭ gibi) için diyatonik adım mantığı
// ───────────────────────────────────────────────────────────────────────
export const LETTERS     = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SOLFEGE     = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
export const NATURAL_PC  = [0, 2, 4, 5, 7, 9, 11];                          // doğal notaların yarım ses değerleri
export const ACC_GLYPH   = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '×' };   // × = çift diyez
export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const spell      = (letter, acc) => LETTERS[letter] + ACC_GLYPH[acc];
export const solfege    = (letter, acc) => SOLFEGE[letter] + ACC_GLYPH[acc];
export const midiToFreq = (midi, a4 = CONFIG.A4_HZ) => a4 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (freq, a4 = CONFIG.A4_HZ) => 69 + 12 * Math.log2(freq / a4);
export const midiName   = (m) => SHARP_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Kök listesi (kromatik sırada; enharmonik karşılıkları ayrı yazımlarla)
export const ROOTS = [
  { letter: 0, acc:  0 }, { letter: 0, acc:  1 },                       // C   C♯
  { letter: 1, acc: -1 }, { letter: 1, acc:  0 }, { letter: 1, acc: 1 }, // D♭  D  D♯
  { letter: 2, acc: -1 }, { letter: 2, acc:  0 },                       // E♭  E
  { letter: 3, acc:  0 }, { letter: 3, acc:  1 },                       // F   F♯
  { letter: 4, acc: -1 }, { letter: 4, acc:  0 }, { letter: 4, acc: 1 }, // G♭  G  G♯
  { letter: 5, acc: -1 }, { letter: 5, acc:  0 }, { letter: 5, acc: 1 }, // A♭  A  A♯
  { letter: 6, acc: -1 }, { letter: 6, acc:  0 },                       // B♭  B
];

// Bir soru tipi "tone" listesidir: steps = diyatonik adım (3'lü → 2), semis = yarım ses
export const ROOT_TONE = { steps: 0, semis: 0, role: 'Kök' };
export const third = (semis) => ({ steps: 2, semis, role: "3'lü" });
export const fifth = (semis) => ({ steps: 4, semis, role: "5'li" });
export const upper = (steps, semis) => [ROOT_TONE, { steps, semis, role: 'Üst ses' }];

export const SINGLES   = 'Tek ses';
export const INTERVALS = 'İki ses · aralıklar (kök + üst ses)';
export const CHORDS    = "Üç ses · 5'li akorlar (kök – 3. – 5.)";
export const CHORD_TYPES = [
  { id: 'single',     kind: 'single',   group: SINGLES,   label: 'Tek ses',      tones: [{ steps: 0, semis: 0, role: 'Ses' }] },

  { id: 'm2', kind: 'interval', group: INTERVALS, label: "Küçük 2'li",             tones: upper(1, 1)  },
  { id: 'M2', kind: 'interval', group: INTERVALS, label: "Büyük 2'li",             tones: upper(1, 2)  },
  { id: 'm3', kind: 'interval', group: INTERVALS, label: "Küçük 3'lü",             tones: upper(2, 3)  },
  { id: 'M3', kind: 'interval', group: INTERVALS, label: "Büyük 3'lü",             tones: upper(2, 4)  },
  { id: 'P4', kind: 'interval', group: INTERVALS, label: "Tam 4'lü",               tones: upper(3, 5)  },
  { id: 'A4', kind: 'interval', group: INTERVALS, label: "Artmış 4'lü (triton)",   tones: upper(3, 6)  },
  { id: 'd5', kind: 'interval', group: INTERVALS, label: "Eksilmiş 5'li (triton)", tones: upper(4, 6)  },
  { id: 'P5', kind: 'interval', group: INTERVALS, label: "Tam 5'li",               tones: upper(4, 7)  },
  { id: 'm6', kind: 'interval', group: INTERVALS, label: "Küçük 6'lı",             tones: upper(5, 8)  },
  { id: 'M6', kind: 'interval', group: INTERVALS, label: "Büyük 6'lı",             tones: upper(5, 9)  },
  { id: 'm7', kind: 'interval', group: INTERVALS, label: "Küçük 7'li",             tones: upper(6, 10) },
  { id: 'M7', kind: 'interval', group: INTERVALS, label: "Büyük 7'li",             tones: upper(6, 11) },
  { id: 'P8', kind: 'interval', group: INTERVALS, label: "Tam 8'li (oktav)",       tones: upper(7, 12) },

  { id: 'major',      kind: 'chord', group: CHORDS, label: 'Majör',        tones: [ROOT_TONE, third(4), fifth(7)] },
  { id: 'minor',      kind: 'chord', group: CHORDS, label: 'Minör',        tones: [ROOT_TONE, third(3), fifth(7)] },
  { id: 'augmented',  kind: 'chord', group: CHORDS, label: 'Artmış (+)',   tones: [ROOT_TONE, third(4), fifth(8)] },
  { id: 'diminished', kind: 'chord', group: CHORDS, label: 'Eksilmiş (°)', tones: [ROOT_TONE, third(3), fifth(6)] },
];
export const TYPE_BY_ID     = Object.fromEntries(CHORD_TYPES.map((t) => [t.id, t]));
export const INTERVAL_TYPES = CHORD_TYPES.filter((t) => t.kind === 'interval');

// Sınav kategorileri
export const KINDS       = ['single', 'double', 'triple'];
export const KIND_LABEL  = { single: 'Tek ses', double: 'İki ses', triple: 'Üç ses' };
export const KIND_DETAIL = { single: 'tek ses tekrarı', double: 'aralık', triple: "5'li akor" };

/**
 * Kök + oktav + tipten nota listesi üretir (kökten yukarı doğru, sıralı).
 * Yazım: hedef harf = kök harfi + diyatonik adım; değiştirici (♭♭…×) = gerçek MIDI − doğal nota MIDI'si.
 */
export function buildNotes(root, octave, type, a4 = CONFIG.A4_HZ) {
  const rootMidi = 12 * (octave + 1) + NATURAL_PC[root.letter] + root.acc;
  return type.tones.map((tone, i) => {
    const absStep    = root.letter + tone.steps;
    const letter     = absStep % 7;
    const noteOctave = octave + Math.floor(absStep / 7);                  // B → C geçişinde oktav artar
    const midi       = rootMidi + tone.semis;
    const acc        = midi - (12 * (noteOctave + 1) + NATURAL_PC[letter]);
    return {
      index: i,
      role: tone.role,
      letter, acc, midi,
      octave: noteOctave,
      name: spell(letter, acc),
      solfege: solfege(letter, acc),
      fullName: spell(letter, acc) + noteOctave,
      freq: midiToFreq(midi, a4),
    };
  });
}


// ───────────────────────────────────────────────────────────────────────
// SORU ÜRETİCİSİ — register'a sığan, doğru yazılmış, kurallara uyan rastgele sorular
// ───────────────────────────────────────────────────────────────────────
/**
 * Bir tip için register'a sığan rastgele kök + oktav seçer.
 *  1) Tüm (yazım, oktav) adaylarını üret → register ve çift değiştirici süzgeci
 *  2) Kök MIDI'sini eşit olasılıkla seç (siyah tuşun iki yazımı var diye 2 kat seçilmesin)
 *  3) O kök için toplam değiştiricisi en az olan yazımı seç (D♭ majör, C♯ majör'e tercih edilir)
 */
export function pickVoicing(type, cfg = CONFIG, rng = Math.random, avoid = null) {
  const { minMidi, maxMidi } = cfg.REGISTER;
  const byRoot = new Map();
  for (const root of ROOTS) {
    for (let octave = 0; octave <= 8; octave++) {
      const notes = buildNotes(root, octave, type, cfg.A4_HZ);
      const lo = notes[0].midi, hi = notes[notes.length - 1].midi;
      if (lo < minMidi || hi > maxMidi) continue;
      if (!cfg.SPELLING.ALLOW_DOUBLE_ACCIDENTALS && notes.some((n) => Math.abs(n.acc) > 1)) continue;
      const key = `${type.id}:${lo}`;
      if (avoid && avoid.has(key)) continue;
      const accCount = notes.reduce((s, n) => s + Math.abs(n.acc), 0);
      if (!byRoot.has(lo)) byRoot.set(lo, []);
      byRoot.get(lo).push({ root, octave, notes, key, accCount });
    }
  }
  if (!byRoot.size) return null;
  const rootMidis = [...byRoot.keys()];
  let cands = byRoot.get(rootMidis[Math.floor(rng() * rootMidis.length)]);
  const minAcc = Math.min(...cands.map((c) => c.accCount));
  cands = cands.filter((c) => c.accCount === minAcc);
  if (cands.length > 1 && type.kind === 'single') {
    const pref = cfg.SPELLING.SINGLE_NOTE_ACCIDENTALS;
    const want = pref === 'sharp' ? 1 : pref === 'flat' ? -1 : 0;
    if (want) { const f = cands.filter((c) => Math.sign(c.notes[0].acc) === want); if (f.length) cands = f; }
  }
  return cands[Math.floor(rng() * cands.length)];
}

/** İki ses: havuzdan ağırlıklı, mümkün olduğunca tekrarsız ve art arda aynı olmayan aralıklar */
export function planIntervals(count, rules = CONFIG.INTERVAL_RULES, rng = Math.random) {
  const w = (id) => rules.WEIGHTS?.[id] ?? 1;
  const pool = (rules.POOL || []).filter((id) => TYPE_BY_ID[id]?.kind === 'interval' && w(id) > 0);
  if (!pool.length) throw Object.assign(new Error('Aralık havuzu boş: en az bir aralık seçin'), { code: 'CONFIG' });
  const out = [];
  let bag = [];
  for (let i = 0; i < count; i++) {
    if (!bag.length) bag = pool.slice();
    let choices = bag.filter((id) => id !== out[out.length - 1]);
    if (!choices.length) choices = bag;
    const id = weightedPick(choices, w, rng);
    bag.splice(bag.indexOf(id), 1);
    out.push(id);
  }
  return out.map((id) => TYPE_BY_ID[id]);
}

/**
 * Üç ses: her SET_SIZE'lık sette EN FAZLA MAX_ALTERED_PER_SET artmış/eksilmiş akor
 * (ALTERED_CHANCE olasılıkla), geri kalanı majör/minör (MAIN_WEIGHTS; MIN_EACH_MAIN garantisiyle).
 */
export function planTriads(count, rules = CONFIG.CHORD_RULES, rng = Math.random) {
  const setSize  = Math.max(1, Math.floor(rules.SET_SIZE || 5));
  const mainIds  = Object.keys(rules.MAIN_WEIGHTS || {}).filter((id) => TYPE_BY_ID[id]?.kind === 'chord' && rules.MAIN_WEIGHTS[id] > 0);
  const altIds   = (rules.ALTERED_TYPES || []).filter((id) => TYPE_BY_ID[id]?.kind === 'chord');
  if (!mainIds.length) throw Object.assign(new Error('CHORD_RULES.MAIN_WEIGHTS: en az bir ana akor tipi gerekli'), { code: 'CONFIG' });
  const out = [];
  for (let start = 0; start < count; start += setSize) {
    const size   = Math.min(setSize, count - start);
    const maxAlt = Math.min(Math.max(0, Math.floor(rules.MAX_ALTERED_PER_SET ?? 1)), size);
    let nAlt = 0;
    if (altIds.length && maxAlt > 0 && rng() < (rules.ALTERED_CHANCE ?? 0.5)) nAlt = 1 + Math.floor(rng() * maxAlt);
    const set = [];
    for (let k = 0; k < nAlt; k++) set.push(altIds[Math.floor(rng() * altIds.length)]);
    const mainSlots = size - nAlt;
    const main = [];
    const minEach = Math.max(0, Math.floor(rules.MIN_EACH_MAIN ?? 0));
    for (let r = 0; r < minEach; r++) for (const id of mainIds) if (main.length < mainSlots) main.push(id);
    while (main.length < mainSlots) main.push(weightedPick(mainIds, (id) => rules.MAIN_WEIGHTS[id], rng));
    set.push(...main);
    out.push(...shuffle(set, rng));
  }
  return out.map((id) => TYPE_BY_ID[id]);
}

// ───────────────────────────────────────────────────────────────────────
// ÇALIM PLANI — hangi ses ne zaman, ne kadar çalınır; toplam süre kadar beklenip dinlemeye geçilir
//  'harmonic' → hepsi birlikte CHORD_DURATION_S
//  'melodic'  → kökten yukarı tek tek: her ses MELODIC_NOTE_S, aralarında MELODIC_GAP_S
//  'both'     → önce ayrı ayrı, BOTH_PAUSE_S bekleme, sonra birlikte
//  Tek seste 'melodic' ile 'both' aynıdır: ses bir kez, MELODIC_NOTE_S boyunca çalınır.
// ───────────────────────────────────────────────────────────────────────
export const PLAYBACK_MODES = ['harmonic', 'melodic', 'both'];

/** @returns {{total:number, steps:Array<{start:number, dur:number, indices:number[]}>}}  süreler saniye */
export function playbackPlan(mode, count, audio = CONFIG.AUDIO) {
  const n = Math.max(0, Math.floor(count || 0));
  if (!n) return { total: 0, steps: [] };
  const all = Array.from({ length: n }, (_, i) => i);
  const chord = (start) => ({ start, dur: audio.CHORD_DURATION_S, indices: all });
  if (mode !== 'melodic' && mode !== 'both') return { total: audio.CHORD_DURATION_S, steps: [chord(0)] };
  const step = audio.MELODIC_NOTE_S + audio.MELODIC_GAP_S;
  const steps = all.map((i) => ({ start: i * step, dur: audio.MELODIC_NOTE_S, indices: [i] }));
  let total = n * audio.MELODIC_NOTE_S + (n - 1) * audio.MELODIC_GAP_S;
  if (mode === 'both' && n > 1) {
    steps.push(chord(total + audio.BOTH_PAUSE_S));
    total += audio.BOTH_PAUSE_S + audio.CHORD_DURATION_S;
  }
  return { total, steps };
}
/** Çalım süresi (sn): biçime ve ses sayısına göre */
export const playbackDuration = (mode, count, audio = CONFIG.AUDIO) => playbackPlan(mode, count, audio).total;

export function questionTitle(type, notes) {
  if (type.kind === 'single')   return `${notes[0].fullName} · ${notes[0].solfege}`;
  if (type.kind === 'interval') return `${type.label} · ${notes.map((n) => n.fullName).join('–')}`;
  return `${notes[0].name} ${type.label} · ${notes.map((n) => n.fullName).join('–')}`;
}

/**
 * Sınav oturumu üretir: QUESTION_COUNTS kadar tek / iki / üç ses sorusu.
 * @returns {Array<{index, kind, type, notes, key, title}>}
 */
export function generateSession(cfg = CONFIG, rng = Math.random) {
  const plan = [];
  for (const kind of KINDS) {
    const n = Math.max(0, Math.floor(cfg.QUESTION_COUNTS?.[kind] ?? 0));
    if (!n) continue;
    const types = kind === 'single' ? Array.from({ length: n }, () => TYPE_BY_ID.single)
      : kind === 'double' ? planIntervals(n, cfg.INTERVAL_RULES, rng)
      : planTriads(n, cfg.CHORD_RULES, rng);
    for (const type of types) plan.push({ kind, type });
  }
  if (!plan.length) throw Object.assign(new Error('Soru sayılarının hepsi 0: en az bir soru olmalı'), { code: 'CONFIG' });
  if (cfg.QUESTION_ORDER === 'shuffled') shuffle(plan, rng);
  const used = new Set();
  return plan.map(({ kind, type }, index) => {
    const v = pickVoicing(type, cfg, rng, cfg.NO_REPEAT ? used : null) || pickVoicing(type, cfg, rng, null);
    if (!v) {
      throw Object.assign(new Error(`Register ${midiName(cfg.REGISTER.minMidi)}–${midiName(cfg.REGISTER.maxMidi)} "${type.label}" için çok dar`), { code: 'REGISTER' });
    }
    used.add(v.key);
    return { index, kind, type, notes: v.notes, key: v.key, title: questionTitle(type, v.notes) };
  });
}


// ───────────────────────────────────────────────────────────────────────
// Sent hesabı, oktav modu ve bölge sınıflandırması
// ───────────────────────────────────────────────────────────────────────
/**
 * cents = 1200 · log2(okunan / hedef). Oktav moduna göre:
 *  'off'      → mutlak karşılaştırma
 *  'free'     → en yakın oktava katlanır ([−600, +600])
 *  'anchored' → ilk ses doğrulanana kadar 'free'; sonra o sesin oktav kayması (anchorK) sabitlenir
 * @returns {{cents:number, octave:number}}  octave = katlanan oktav sayısı (k)
 */
export function compareToTarget(freq, targetFreq, mode = 'free', anchorK = null) {
  const raw = 1200 * Math.log2(freq / targetFreq);
  if (mode === 'off') return { cents: raw, octave: 0 };
  if (mode === 'anchored' && anchorK !== null) return { cents: raw - 1200 * anchorK, octave: anchorK };
  const k = Math.round(raw / 1200);
  return { cents: raw - 1200 * k, octave: k };
}
/** Egzersiz için geçerli oktav modu. 'free' modda aynı perde sınıfı iki kez geçiyorsa (oktav aralığı) sabit oktava geçilir. */
export function octaveModeFor(exercise, foldOn, cfg = CONFIG) {
  if (!foldOn) return 'off';
  if (cfg.OCTAVE_MODE === 'free' && !exercise.foldable) return 'anchored';
  return cfg.OCTAVE_MODE;
}

export function zoneOf(absCents, cfg = CONFIG) {
  if (absCents <= cfg.TOLERANCE_CENTS) return 'perfect';   // ±20 sent → doğru
  if (absCents <= cfg.WARNING_CENTS)   return 'ok';        // ±35 sent → sınırda
  return 'bad';                                            // ötesi → detone
}

export function nearestNoteName(freq, a4 = CONFIG.A4_HZ) {
  return midiName(Math.round(freqToMidi(freq, a4)));
}

export function rootMeanSquare(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = buf[i]; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}


// ───────────────────────────────────────────────────────────────────────
// PORTE KONUMU — perde (ondalıklı MIDI) → porte basamağı
//  Basamak = oktav·7 + harf: Do4 = 28, Mi4 = 30 (sol anahtarının alt çizgisi), La3 = 26 (fa anahtarının üst çizgisi).
//  Bir basamak = bir çizgi ya da bir aralık (yarım çizgi aralığı).
//  "Çapalar": doğal notalar kendi yerinde; alıştırmanın notaları YAZILDIKLARI harfin yerinde
//  (Re majörde Fa♯ → Fa'nın yeri). Çapayla çakışan doğal nota çıkarılır. Çapalar arasındaki perdeler
//  sent cinsinden orantılı yerleşir → hedefin tam perdesi nota başının tam ortasından geçer.
// ───────────────────────────────────────────────────────────────────────
export const staffStep = (n) => n.octave * 7 + n.letter;

/** Alıştırmanın yazımına göre perde → basamak dönüştürücüsü üretir (bir kez kurulur, her karede çağrılır) */
export function makeStaffMap(notes = []) {
  const fixed = notes.map((n) => ({ midi: n.midi, pos: staffStep(n) }));
  const all = [...fixed];
  for (let oct = -1; oct <= 9; oct++) {
    for (let letter = 0; letter < 7; letter++) {
      const midi = 12 * (oct + 1) + NATURAL_PC[letter], pos = oct * 7 + letter;
      // Aynı perde, aynı yer ya da sırayı bozan doğal nota alıştırma notasına yer açar
      if (fixed.some((a) => a.midi === midi || a.pos === pos || (a.midi - midi) * (a.pos - pos) < 0)) continue;
      all.push({ midi, pos });
    }
  }
  all.sort((a, b) => a.midi - b.midi || a.pos - b.pos);
  const anchors = [];
  for (const a of all) {
    const p = anchors[anchors.length - 1];
    if (!p || (a.midi > p.midi && a.pos > p.pos)) anchors.push(a);   // kesin artan: perde ↑ → konum ↑
  }
  const n = anchors.length;
  return (midi) => {
    if (!Number.isFinite(midi)) return NaN;
    let lo = 0, hi = n - 1;
    if (midi <= anchors[0].midi) hi = 1;                  // uçlarda en yakın iki çapadan doğrusal uzatma
    else if (midi >= anchors[n - 1].midi) lo = n - 2;
    else {
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (anchors[mid].midi <= midi) lo = mid; else hi = mid; }
    }
    const a = anchors[lo], b = anchors[hi];
    return a.pos + ((midi - a.midi) / (b.midi - a.midi)) * (b.pos - a.pos);
  };
}
/** Tek seferlik kullanım: staffPosition(66, dMajorNotes) → 31 (Fa'nın yeri) */
export function staffPosition(midi, notes = []) { return makeStaffMap(notes)(midi); }

/**
 * Bir yarım ses aşağıdaki ve yukarıdaki notanın yazımı (dikey akort aletinin uçları için).
 * Adaylar: aynı harf (♭ / ♯ eklenerek) ya da komşu harf. Değiştiricisi en az olan seçilir;
 * eşitlikte aynı harf: Mi → alt Mi♭, üst Fa · Do → alt Si, üst Do♯ · Fa♯ → alt Fa, üst Sol.
 */
export function semitoneNeighbors(note) {
  const pick = (dir) => {
    const pc = (((note.midi + dir) % 12) + 12) % 12;
    const l2 = (note.letter + dir + 7) % 7;
    let a2 = (((pc - NATURAL_PC[l2]) % 12) + 12) % 12;
    if (a2 > 6) a2 -= 12;
    const cands = [{ letter: note.letter, acc: note.acc + dir }, { letter: l2, acc: a2 }]
      .filter((c) => Math.abs(c.acc) <= 1);
    const best = cands.length ? cands.reduce((b, c) => (Math.abs(c.acc) < Math.abs(b.acc) ? c : b)) : { letter: l2, acc: a2 };
    return { ...best, name: spell(best.letter, best.acc), solfege: solfege(best.letter, best.acc) };
  };
  return { below: pick(-1), above: pick(1) };
}


// ───────────────────────────────────────────────────────────────────────
// PERDE ALGILAMA — YIN (de Cheveigné & Kawahara, 2002)
//  1) fark fonksiyonu  d(τ) = Σ (x[j] − x[j+τ])²
//  2) birikimli ortalamayla normalize (CMNDF)  d′(τ) = d(τ)·τ / Σ_{k≤τ} d(k)
//  3) mutlak eşik: d′ eşiğin altına inen İLK çukur → oktav-altı hatalarını önler.
//     Uyarlamalı ek: eşik = min(T, 1 − k·(1 − d′min)). Çok belirgin bir periyot varsa (d′min ≈ 0)
//     yarım/üçte bir periyottaki sığ çukurlar reddedilir → baskın üst harmonikli ünlülerde
//     oktav-üstü hata azalır (MPM'deki "anahtar tepe" kuralının YIN karşılığı). k = 0 → klasik YIN.
//  4) parabolik ara değerleme → alt-örnek hassasiyeti
//  Netlik (clarity) = 1 − d′(τ): pitchy'nin "clarity" değeriyle aynı ölçekte (0–1) yorumlanır.
// ───────────────────────────────────────────────────────────────────────
export class YinDetector {
  constructor(size, { threshold = 0.15, adaptiveK = 0.95, minFreq = 55, maxFreq = 1400 } = {}) {
    this.size = size;
    this.w = size >> 1;                         // entegrasyon penceresi W = N/2
    this.d = new Float32Array(this.w + 2);      // bir kez ayrılır → sıcak döngüde bellek tahsisi yok
    this.threshold = threshold;
    this.adaptiveK = adaptiveK;
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
  }
  /** @returns {[number, number]} [frekans (Hz), netlik 0–1] */
  findPitch(buf, sampleRate) {
    const W = this.w, d = this.d;
    const tauMin = Math.max(2, Math.floor(sampleRate / this.maxFreq));
    const tauMax = Math.min(W, Math.ceil(sampleRate / this.minFreq) + 1);
    if (tauMax <= tauMin + 2 || buf.length < W + tauMax) return [0, 0];

    for (let tau = 1; tau <= tauMax; tau++) {                 // 1) fark fonksiyonu
      let sum = 0;
      for (let j = 0; j < W; j++) { const diff = buf[j] - buf[j + tau]; sum += diff * diff; }
      d[tau] = sum;
    }
    d[0] = 1;                                                 // 2) CMNDF (yerinde)
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }
    let dMin = 1;                                             // 3) mutlak (uyarlamalı) eşik
    for (let t = tauMin; t < tauMax; t++) if (d[t] < dMin) dMin = d[t];
    const thr = this.adaptiveK > 0 ? Math.min(this.threshold, 1 - this.adaptiveK * (1 - dMin)) : this.threshold;
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (d[t] < thr) {
        while (t + 1 < tauMax && d[t + 1] < d[t]) t++;        // çukurun dibine in
        tau = t;
        break;
      }
    }
    if (tau < 0) {                                            // eşik altı çukur yok → genel minimum (düşük netlik)
      tau = tauMin;
      for (let t = tauMin + 1; t < tauMax; t++) if (d[t] < d[tau]) tau = t;
    }
    let better = tau;                                         // 4) parabolik ara değerleme
    if (tau > 1 && tau < tauMax) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const den = s0 - 2 * s1 + s2;
      if (den > 0) better = tau + clamp((s0 - s2) / (2 * den), -1, 1);
    }
    return [sampleRate / better, clamp(1 - d[tau], 0, 1)];
  }
}

/** Tek karelik oktav sıçramalarını süzer (perde MIDI değeri üzerinde, log ölçekte) */
export class MedianFilter {
  constructor(size = 3) { this.size = Math.max(1, Math.floor(size)); this.buf = []; }
  reset() { this.buf.length = 0; }
  push(v) {
    if (this.size <= 1) return v;
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    if (this.buf.length < this.size) return v;
    const s = this.buf.slice().sort((a, b) => a - b);
    return s[(s.length - 1) >> 1];
  }
}


// ───────────────────────────────────────────────────────────────────────
// SÜREKLİLİK (SUSTAIN) FİLTRESİ
//  • Yalnızca ±TOLERANCE_CENTS bandındaki GEÇERLİ kareler süre biriktirir.
//  • Geçerli ama bant DIŞI bir kare → sayaç anında sıfırlanır (glissando koruması).
//  • Geçersiz kare (sessizlik / düşük netlik) → sayaç dondurulur; kopma
//    SUSTAIN_DROPOUT_GRACE_MS'i aşarsa sıfırlanır. 0 → tamamen katı.
//  • Süre kare sayısıyla değil gerçek zamanla (ms) ölçülür; banda giren ilk kare süre eklemez.
//  • Ayarlar her karede CONFIG'ten okunur → panelden yapılan değişiklik anında geçerli olur.
// ───────────────────────────────────────────────────────────────────────
export class SustainTracker {
  constructor(cfg = CONFIG) { this.cfg = cfg; this.reset(); }
  reset() { this.ms = 0; this.dropoutMs = 0; this.armed = false; }
  get requiredMs() { return this.cfg.SUSTAIN_TIME_MS; }
  get progress() { return Math.min(1, this.ms / this.requiredMs); }

  /** @returns {boolean} süreklilik şartı bu karede tamamlandı mı */
  update(dtMs, valid, absCents) {
    const c = this.cfg;
    if (valid) {
      this.dropoutMs = 0;
      if (absCents <= c.TOLERANCE_CENTS) {
        if (this.armed) this.ms = Math.min(c.SUSTAIN_TIME_MS, this.ms + dtMs);
        this.armed = true;
      } else {
        this.ms = 0;                       // yeşil alandan çıktı → baştan
        this.armed = false;
      }
    } else {
      this.dropoutMs += dtMs;
      if (this.dropoutMs > c.SUSTAIN_DROPOUT_GRACE_MS) { this.ms = 0; this.armed = false; }
    }
    return this.ms >= c.SUSTAIN_TIME_MS - 1e-6;   // kayan nokta birikimine karşı küçük pay
  }
}


// ───────────────────────────────────────────────────────────────────────
// YÖNLENDİRME (koç) — anlık uyarı yerine her UI.COACH_INTERVAL_MS'de bir, son aralığın özetinden tek sakin cümle
//  CoachWindow: kareleri biriktirir (ses var mı, perde net mi, ortalama sapma, dalgalanma, tolerans içi oran, oktav farkı)
//  coachMessage: özetten bir durum anahtarı seçer, CONFIG.TEXTS.COACH'tan o duruma ait bir söyleyiş verir;
//                aynı cümle üst üste gelmez. Canlı geri bildirim kapalıysa pes/tiz yönü söylenmez.
// ───────────────────────────────────────────────────────────────────────
export class CoachWindow {
  constructor() { this.reset(); }
  reset() { this.ms = 0; this.frames = 0; this.loud = 0; this.valid = 0; this.octave = 0; this.held = 0; this.n = 0; this.sum = 0; this.sumSq = 0; }
  /** Bir dinleme karesi. cents: katlanmış sapma (geçerliyse); held: tolerans içinde mi */
  push(dtMs, { loud = false, valid = false, cents = 0, held = false } = {}) {
    this.ms += dtMs;
    this.frames++;
    if (loud) this.loud++;
    if (!valid) return;
    this.valid++;
    if (held) this.held++;
    if (Math.abs(cents) > 600) { this.octave++; return; }      // oktav farkı: sapma ortalamasına katılmaz
    this.n++;
    this.sum += cents;
    this.sumSq += cents * cents;
  }
  summary() {
    const mean = this.n ? this.sum / this.n : null;
    return {
      ms: this.ms,
      loudRatio: this.frames ? this.loud / this.frames : 0,         // ses var mı
      clearRatio: this.loud ? this.valid / this.loud : 0,           // perde net mi (sesli karelerin geçerli olanı)
      octaveRatio: this.valid ? this.octave / this.valid : 0,       // oktav farkı
      inTolRatio: this.valid ? this.held / this.valid : 0,          // tolerans içinde kalma oranı
      mean,                                                          // ortalama sapma (sent; − pes, + tiz)
      spread: this.n ? Math.sqrt(Math.max(0, this.sumSq / this.n - mean * mean)) : null,   // dalgalanma (std. sapma)
    };
  }
}

/** Özetten durum anahtarı: quiet · unclear · blind · octave · octaveOff · good · farLow · farHigh · low · high · unsteady */
export function coachKeyFor(s, { live = true, fold = true } = {}, cfg = CONFIG) {
  if (!s || s.ms < Math.min(1500, cfg.UI.COACH_INTERVAL_MS / 2)) return null;
  if (s.loudRatio < 0.3) return 'quiet';
  if (s.clearRatio < 0.4) return 'unclear';
  if (!live) return 'blind';                                   // sınav provası: yön söylenmez
  if (s.octaveRatio >= 0.4) return fold ? 'octave' : 'octaveOff';
  if (s.mean == null) return 'unclear';
  const tol = cfg.TOLERANCE_CENTS, far = cfg.UI.COACH_FAR_CENTS;
  if (s.inTolRatio >= 0.6 && s.spread <= tol) return 'good';
  if (Math.abs(s.mean) > far) return s.mean < 0 ? 'farLow' : 'farHigh';
  if (Math.abs(s.mean) >= tol * 0.6) return s.mean < 0 ? 'low' : 'high';
  return 'unsteady';
}

/**
 * Bir sonraki yönlendirme cümlesi. state = { last, turns } çağrılar arasında korunur (aynı cümle üst üste gelmez).
 * @returns {{key, text, path} | null}   path: CONFIG.TEXTS içindeki yer (ör. 'COACH.low.b')
 */
export function coachMessage(summary, state, opts = {}, cfg = CONFIG) {
  const key = coachKeyFor(summary, opts, cfg);
  const group = key && cfg.TEXTS?.COACH?.[key];
  if (!isPlainObject(group)) return null;
  const variants = Object.entries(group).filter(([, t]) => typeof t === 'string' && t.trim());
  if (!variants.length) return null;
  state.turns ||= {};
  let i = ((state.turns[key] ?? -1) + 1) % variants.length;
  if (variants.length > 1 && variants[i][1] === state.last) i = (i + 1) % variants.length;
  state.turns[key] = i;
  state.last = variants[i][1];
  return { key, text: variants[i][1], path: `COACH.${key}.${variants[i][0]}` };
}


// ───────────────────────────────────────────────────────────────────────
// DURUM MAKİNESİ (FSM) — yalnızca tablodaki geçişler serbest
//   IDLE → PLAYING → LISTENING → VERIFIED → (LISTENING …) → COMPLETE → PLAYING (sıradaki soru) … → SUMMARY
// ───────────────────────────────────────────────────────────────────────
export const S = Object.freeze({
  IDLE: 'IDLE', PLAYING: 'PLAYING', LISTENING: 'LISTENING', VERIFIED: 'VERIFIED', COMPLETE: 'COMPLETE', SUMMARY: 'SUMMARY',
});
export const ALLOWED = Object.freeze({
  IDLE:      ['PLAYING'],
  PLAYING:   ['LISTENING', 'IDLE', 'SUMMARY'],
  LISTENING: ['VERIFIED', 'PLAYING', 'COMPLETE', 'IDLE', 'SUMMARY'],   // PLAYING: tekrar çal · COMPLETE: geç / süre doldu
  VERIFIED:  ['LISTENING', 'COMPLETE', 'IDLE', 'SUMMARY'],
  COMPLETE:  ['PLAYING', 'SUMMARY', 'IDLE'],
  SUMMARY:   ['PLAYING', 'IDLE'],
});

export function createMachine(table, initial, onChange) {
  let state = initial;
  return {
    get state() { return state; },
    can(next) { return table[state].includes(next); },
    go(next, payload) {
      if (!table[state].includes(next)) {
        console.warn(`[FSM] yasak geçiş: ${state} → ${next}`);
        return false;
      }
      const prev = state;
      state = next;                                // önce durumu değiştir, sonra dinleyiciyi çağır
      onChange(next, prev, payload);
      return true;
    },
  };
}


// ───────────────────────────────────────────────────────────────────────
// KİLİTLİ İLERLEME — sıradaki nota doğrulanmadan bir sonrakine geçilemez
// ───────────────────────────────────────────────────────────────────────
export class Exercise {
  constructor(notes) {
    this.notes = notes;
    // Aynı perde sınıfından iki nota varsa (oktav aralığı) 'free' katlama anlamsızdır
    this.foldable = new Set(notes.map((n) => ((n.midi % 12) + 12) % 12)).size === notes.length;
    this.restart();
  }
  restart()       { this.index = 0; this.verified = this.notes.map(() => false); this.anchorK = null; this.abandoned = false; }
  get current()   { return this.notes[this.index] ?? null; }
  get finished()  { return this.index >= this.notes.length; }
  markVerified()  { if (!this.finished) this.verified[this.index] = true; }
  advance() {
    if (this.finished || !this.verified[this.index]) throw new Error('Kilit: doğrulanmamış nota atlanamaz');
    this.index++;
    return this.finished;                          // true → tüm notalar tamam
  }
  abandon()       { this.abandoned = true; }       // soru geçildi / süre doldu
}


// ───────────────────────────────────────────────────────────────────────
// SINAV OTURUMU — sorular + her ses için ölçüm kaydı
// ───────────────────────────────────────────────────────────────────────
export function newNoteStats() {
  return {
    verified: false,
    timeMs: 0,                                      // bu ses için dinleme süresi (çalım süresi hariç)
    valid: 0, far: 0,                               // geçerli kare sayısı · hedefe uzak kare sayısı
    near: { n: 0, sum: 0, sumAbs: 0 },              // hedefe ±BIAS_WINDOW içindeki kareler → eğilim
    held: { n: 0, sum: 0 },                         // tolerans içindeki kareler
  };
}
/** Bir ölçüm karesini ses istatistiğine ekler (yalnızca LISTENING sırasında çağrılır) */
export function recordPitchFrame(stats, cents, cfg = CONFIG) {
  stats.valid++;
  const a = Math.abs(cents);
  if (a <= cfg.ANALYSIS.BIAS_WINDOW_CENTS) { stats.near.n++; stats.near.sum += cents; stats.near.sumAbs += a; }
  else stats.far++;
  if (a <= cfg.TOLERANCE_CENTS) { stats.held.n++; stats.held.sum += cents; }
}

export class ExamSession {
  constructor(questions, { seed = 0, startedAt = Date.now() } = {}) {
    this.questions = questions;
    this.seed = seed;
    this.startedAt = startedAt;
    this.finishedAt = null;
    this.aborted = false;
    this.index = 0;
    this.results = questions.map((q) => ({
      kind: q.kind, typeId: q.type.id, label: q.type.label, title: q.title,
      notes: q.notes.map((n) => ({ midi: n.midi, name: n.fullName, role: n.role })),
      noteResults: q.notes.map(() => newNoteStats()),
      replays: 0, listenMs: 0,
      status: 'pending',                            // pending · done · partial · skipped · timeout · unanswered
      endReason: null,
    }));
  }
  get current() { return this.questions[this.index] ?? null; }
  get result()  { return this.results[this.index] ?? null; }
  get isLast()  { return this.index >= this.questions.length - 1; }
  /** Geçerli soruyu kapatır. reason: 'done' | 'skipped' | 'timeout' */
  finishQuestion(reason = 'done') {
    const r = this.result;
    if (!r || r.status !== 'pending') return r;
    const ok = r.noteResults.filter((n) => n.verified).length;
    r.endReason = reason;
    r.status = ok === r.noteResults.length ? 'done' : ok > 0 ? 'partial' : reason === 'timeout' ? 'timeout' : 'skipped';
    return r;
  }
  /** Testi yarıda bitirir: hiç denenmemiş sorular "cevaplanmadı" olur */
  abort() {
    this.aborted = true;
    for (const r of this.results) if (r.status === 'pending') r.status = 'unanswered';
  }
  get attempted() { return this.results.filter((r) => r.status !== 'pending' && r.status !== 'unanswered'); }
}


// ───────────────────────────────────────────────────────────────────────
// ANALİTİK — teşhis ekranının tüm hesapları (düzenlenebilir tek fonksiyon)
//  • Puan: soru kredisi (kısmi puan seçeneğiyle) × tip ağırlığı, 0–100
//  • Zorlanma (0–1): başarısızlık, süre, tekrar ve sapma bileşenlerinin ağırlıklı ortalaması
//  • Eğilim: hedefe ±BIAS_WINDOW içindeki karelerin işaretli ortalaması (+ tiz / − pes)
// ───────────────────────────────────────────────────────────────────────
export const TENDENCY_LABEL = { sharp: 'Tiz', flat: 'Pes', balanced: 'Dengeli', unknown: 'Belirsiz' };

export function tendencyOf(bias, A = CONFIG.ANALYSIS) {
  if (bias == null || !Number.isFinite(bias)) return 'unknown';
  if (Math.abs(bias) < A.BIAS_NEUTRAL_CENTS) return 'balanced';
  return bias > 0 ? 'sharp' : 'flat';
}

export function computeDiagnostics(results, cfg = CONFIG) {
  const A = cfg.ANALYSIS, SC = cfg.SCORING;
  const pool = (list) => list.reduce((acc, s) => {
    acc.n += s.n; acc.sum += s.sum; acc.sumAbs += s.sumAbs || 0; return acc;
  }, { n: 0, sum: 0, sumAbs: 0 });

  // 1) Puan
  const credits = results.map((r) => {
    const total = r.noteResults.length;
    const ok = r.noteResults.filter((n) => n.verified).length;
    const base = SC.PARTIAL_CREDIT ? ok / total : (ok === total ? 1 : 0);
    return Math.max(0, base - (SC.REPLAY_PENALTY || 0) * r.replays);
  });
  let wSum = 0, sSum = 0;
  results.forEach((r, i) => { const w = Math.max(0, SC.TYPE_WEIGHTS?.[r.kind] ?? 1); wSum += w; sSum += w * credits[i]; });
  const score = wSum > 0 ? Math.round((1000 * sSum) / wSum) / 10 : 0;

  // 2) Soru tipine göre
  const byType = {};
  for (const kind of KINDS) {
    const idx = results.map((r, i) => (r.kind === kind ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const rs = idx.map((i) => results[i]);
    const notes = rs.flatMap((r) => r.noteResults);
    const verified = notes.filter((n) => n.verified);
    const accuracy = notes.length ? verified.length / notes.length : 0;
    const meanTimeMs = verified.length ? verified.reduce((s, n) => s + n.timeMs, 0) / verified.length : null;
    const replaysPerQuestion = rs.reduce((s, r) => s + r.replays, 0) / rs.length;
    const near = pool(notes.map((n) => n.near));
    const biasCents = near.n >= A.MIN_FRAMES ? near.sum / near.n : null;
    const meanAbsCents = near.n >= A.MIN_FRAMES ? near.sumAbs / near.n : null;
    const components = {
      failure: 1 - accuracy,
      time: meanTimeMs == null ? 1 : clamp(meanTimeMs / A.TIME_REF_MS, 0, 1),
      replays: clamp(replaysPerQuestion / A.REPLAY_REF, 0, 1),
      deviation: meanAbsCents == null ? 1 : clamp(meanAbsCents / A.DEVIATION_REF_CENTS, 0, 1),
    };
    let wt = 0, acc = 0;
    for (const [k, v] of Object.entries(components)) { const w = Math.max(0, A.DIFFICULTY_WEIGHTS?.[k] ?? 0); wt += w; acc += w * v; }
    byType[kind] = {
      kind, questions: rs.length, notes: notes.length, verified: verified.length,
      accuracy, meanTimeMs, replaysPerQuestion, biasCents, meanAbsCents, frames: near.n,
      difficulty: wt > 0 ? acc / wt : 0, components,
      score: Math.round((1000 * idx.reduce((s, i) => s + credits[i], 0)) / idx.length) / 10,
    };
  }

  // 3) Genel eğilim ve ses konumuna göre (kök / 3. ses / 5. ses / üst ses)
  const allNear = pool(results.flatMap((r) => r.noteResults.map((n) => n.near)));
  const overallBias = allNear.n >= A.MIN_FRAMES ? allNear.sum / allNear.n : null;
  const roleMap = {};
  results.forEach((r) => r.noteResults.forEach((n, i) => {
    const role = r.notes[i]?.role ?? '?';
    (roleMap[role] ||= []).push(n.near);
  }));
  const byRole = {};
  for (const [role, list] of Object.entries(roleMap)) {
    const p = pool(list);
    byRole[role] = { frames: p.n, biasCents: p.n >= A.MIN_FRAMES ? p.sum / p.n : null };
  }

  // 4) En çok zorlanılan tip
  const ranked = Object.values(byType).sort((a, b) => b.difficulty - a.difficulty);
  const allNotes = results.flatMap((r) => r.noteResults);
  const diag = {
    score, byType, byRole,
    overall: {
      biasCents: overallBias, tendency: tendencyOf(overallBias, A), frames: allNear.n,
      meanAbsCents: allNear.n >= A.MIN_FRAMES ? allNear.sumAbs / allNear.n : null,
    },
    hardest: ranked.length ? ranked[0].kind : null,
    ranked: ranked.map((t) => t.kind),
    totals: {
      questions: results.length,
      full: results.filter((r) => r.status === 'done').length,
      partial: results.filter((r) => r.status === 'partial').length,
      failed: results.filter((r) => r.status === 'skipped' || r.status === 'timeout').length,
      notes: allNotes.length,
      verified: allNotes.filter((n) => n.verified).length,
    },
  };
  diag.messages = buildAdvice(diag, cfg);
  return diag;
}

/** Teşhis ekranındaki yorum cümleleri */
export function buildAdvice(d, cfg = CONFIG) {
  const A = cfg.ANALYSIS, out = [], t = d.totals;
  const typeCount = Object.keys(d.byType).length;
  out.push(`Tam doğrulanan soru: ${t.full} / ${t.questions}${t.partial ? ` · kısmi: ${t.partial}` : ''}${t.failed ? ` · geçilen: ${t.failed}` : ''}. Doğrulanan ses: ${t.verified} / ${t.notes}.`);

  const h = d.hardest ? d.byType[d.hardest] : null;
  if (h && typeCount > 1 && h.difficulty >= A.NOTABLE_DIFFICULTY) {
    out.push(`En çok zorlandığınız tip: ${KIND_LABEL[h.kind]} (${KIND_DETAIL[h.kind]}). Seslerin %${NF0.format(h.accuracy * 100)} kadarı doğrulandı${h.meanTimeMs != null ? `; doğrulanan ses başına ortalama ${fmtSeconds(h.meanTimeMs)} sn sürdü` : ''}.`);
  } else if (h && typeCount > 1) {
    out.push('Soru tipleri arasında belirgin bir zorlanma farkı yok.');
  }

  const o = d.overall;
  if (o.tendency === 'sharp') {
    out.push(`Genel eğilim tiz: hedefe yakın söylediğiniz anlarda ortalama ${fmtSigned(o.biasCents, 1)} sent yukarıdasınız. Tizleşme sık sık fazla nefes basıncı ya da gerginlikle ilişkilidir; sesi daha rahat, bastırmadan verin.`);
  } else if (o.tendency === 'flat') {
    out.push(`Genel eğilim pes: hedefe yakın söylediğiniz anlarda ortalama ${fmtSigned(o.biasCents, 1)} sent aşağıdasınız. Pes kalma sık sık sesin sonuna doğru düşen nefes desteğiyle ilişkilidir; desteği tutma süresi boyunca koruyun.`);
  } else if (o.tendency === 'balanced') {
    out.push(`Belirgin bir tiz/pes eğilimi yok: ortalama sapma ${fmtSigned(o.biasCents, 1)} sent (±${A.BIAS_NEUTRAL_CENTS} sent içinde).`);
  } else {
    out.push('Tiz/pes eğilimini yorumlamak için yeterli ses verisi toplanamadı.');
  }

  for (const kind of KINDS) {                                   // tipe göre ters / belirgin eğilim
    const bt = d.byType[kind];
    if (!bt || bt.biasCents == null) continue;
    const tk = tendencyOf(bt.biasCents, A);
    if (typeCount > 1 && tk !== 'balanced' && tk !== o.tendency && Math.abs(bt.biasCents) >= A.BIAS_NEUTRAL_CENTS * 1.5) {
      out.push(`${KIND_LABEL[kind]} sorularında eğilim farklı: ${fmtSigned(bt.biasCents, 1)} sent (${TENDENCY_LABEL[tk].toLocaleLowerCase('tr')}).`);
    }
  }

  // Ses konumu (kök / 3'lü / 5'li / üst ses) genel ortalamadan belirgin ayrışıyorsa söyle
  const roles = Object.entries(d.byRole)
    .filter(([, r]) => r.biasCents != null && o.biasCents != null
      && Math.abs(r.biasCents) >= A.BIAS_NEUTRAL_CENTS && Math.abs(r.biasCents - o.biasCents) >= A.BIAS_NEUTRAL_CENTS)
    .sort((a, b) => Math.abs(b[1].biasCents - o.biasCents) - Math.abs(a[1].biasCents - o.biasCents));
  if (roles.length && Object.keys(d.byRole).length > 1) {
    const [role, r] = roles[0];
    out.push(`"${role}" konumundaki sesler genel ortalamadan ayrışıyor: ortalama ${fmtSigned(r.biasCents, 1)} sent (${r.biasCents > 0 ? 'tiz' : 'pes'}).`);
  }

  const rep = KINDS.map((k) => d.byType[k]).filter((bt) => bt && bt.replaysPerQuestion >= 1)
    .sort((a, b) => b.replaysPerQuestion - a.replaysPerQuestion)[0];
  if (rep) out.push(`${KIND_LABEL[rep.kind]} sorularında soru başına ortalama ${NF1.format(rep.replaysPerQuestion)} kez tekrar dinlediniz; sesleri tek dinleyişte belleğe almayı hedefleyin.`);
  return out;
}


// ───────────────────────────────────────────────────────────────────────
// GEÇMİŞ KAYDI (localStorage'a yazılan özet) ve yapılandırma doğrulama
// ───────────────────────────────────────────────────────────────────────
export const round1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
export const round3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

export function makeHistoryEntry(session, diag, cfg = CONFIG) {
  return {
    v: 1,
    id: `${session.startedAt}-${session.seed}`,
    at: session.startedAt,
    durationMs: Math.max(0, (session.finishedAt ?? session.startedAt) - session.startedAt),
    seed: session.seed,
    score: diag.score,
    complete: !session.aborted,
    answered: diag.totals.questions,
    total: session.questions.length,
    tendency: diag.overall.tendency,
    biasCents: round1(diag.overall.biasCents),
    hardest: diag.hardest,
    byType: Object.fromEntries(Object.entries(diag.byType).map(([k, t]) => [k, {
      accuracy: round3(t.accuracy), meanTimeMs: t.meanTimeMs == null ? null : Math.round(t.meanTimeMs),
      biasCents: round1(t.biasCents), difficulty: round3(t.difficulty), score: t.score,
    }])),
    settings: {
      tol: cfg.TOLERANCE_CENTS, sustainMs: cfg.SUSTAIN_TIME_MS, counts: { ...cfg.QUESTION_COUNTS },
      algo: cfg.PITCH.ALGORITHM, a4: cfg.A4_HZ,
    },
  };
}
export function normalizeHistory(raw, max = CONFIG.HISTORY.MAX_ENTRIES) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => isPlainObject(e) && Number.isFinite(e.score) && Number.isFinite(e.at)).slice(-max);
}

/** Piyano örnek haritası: register ±3 yarım ses içindeki her SAMPLE_EVERY'inci nota (C, D♯, F♯, A) */
export function pianoSampleMap(reg, every = 3, pattern = '{name}.mp3') {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const lo = Math.max(21, reg.minMidi - 3), hi = Math.min(108, reg.maxMidi + 3);
  const urls = {};
  for (let m = lo; m <= hi; m++) {
    if (m % every !== 0) continue;
    const name = NAMES[m % 12] + (Math.floor(m / 12) - 1);
    urls[name] = pattern.replace('{name}', name.replace('#', 's'));
  }
  return urls;
}

/** TEXTS ağacının yaprakları: [['btnStart', '▶ Teste Başla'], ['COACH.low.a', '…'], …] */
export function textLeaves(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) out.push(...textLeaves(v, p)); else out.push([p, v]);
  }
  return out;
}
/** Ad en fazla 80 karakter; yönlendirme cümleleri (COACH.*) en fazla 160 */
export const textMaxLen = (path) => (path.startsWith('COACH.') ? 160 : 80);

/** Birleştirilmiş yapılandırmayı denetler; hata listesi döner (boş = geçerli) */
export function validateConfig(cfg) {
  const errs = [];
  const num = (v, lo, hi, name) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) errs.push(`${name}: ${lo}–${hi} arasında olmalı`);
  };
  const oneOf = (v, list, name) => { if (!list.includes(v)) errs.push(`${name}: ${list.join(' | ')} olmalı`); };

  num(cfg.TOLERANCE_CENTS, 1, 200, 'TOLERANCE_CENTS');
  num(cfg.WARNING_CENTS, 1, 600, 'WARNING_CENTS');
  if (cfg.WARNING_CENTS < cfg.TOLERANCE_CENTS) errs.push('WARNING_CENTS, TOLERANCE_CENTS değerinden küçük olamaz');
  num(cfg.SUSTAIN_TIME_MS, 20, 10000, 'SUSTAIN_TIME_MS');
  num(cfg.SUSTAIN_DROPOUT_GRACE_MS, 0, 1000, 'SUSTAIN_DROPOUT_GRACE_MS');
  num(cfg.A4_HZ, 380, 480, 'A4_HZ');
  for (const k of KINDS) num(cfg.QUESTION_COUNTS?.[k], 0, 100, `QUESTION_COUNTS.${k}`);
  num(cfg.REGISTER?.minMidi, 21, 108, 'REGISTER.minMidi');
  num(cfg.REGISTER?.maxMidi, 21, 108, 'REGISTER.maxMidi');
  if (!(cfg.REGISTER?.maxMidi > cfg.REGISTER?.minMidi)) errs.push('REGISTER: üst sınır alt sınırdan büyük olmalı');
  oneOf(cfg.OCTAVE_MODE, ['anchored', 'free', 'off'], 'OCTAVE_MODE');
  oneOf(cfg.QUESTION_ORDER, ['grouped', 'shuffled'], 'QUESTION_ORDER');
  oneOf(cfg.EXAM?.REVEAL_NOTE_NAMES, ['after', 'end', 'always', 'never'], 'EXAM.REVEAL_NOTE_NAMES');
  num(cfg.EXAM?.QUESTION_TIME_LIMIT_S, 0, 3600, 'EXAM.QUESTION_TIME_LIMIT_S');
  num(cfg.EXAM?.NEXT_QUESTION_DELAY_MS, 0, 20000, 'EXAM.NEXT_QUESTION_DELAY_MS');
  oneOf(cfg.SPELLING?.SINGLE_NOTE_ACCIDENTALS, ['mixed', 'sharp', 'flat'], 'SPELLING.SINGLE_NOTE_ACCIDENTALS');
  num(cfg.CHORD_RULES?.SET_SIZE, 1, 100, 'CHORD_RULES.SET_SIZE');
  num(cfg.CHORD_RULES?.MAX_ALTERED_PER_SET, 0, 100, 'CHORD_RULES.MAX_ALTERED_PER_SET');
  num(cfg.CHORD_RULES?.ALTERED_CHANCE, 0, 1, 'CHORD_RULES.ALTERED_CHANCE');
  for (const id of Object.keys(cfg.CHORD_RULES?.MAIN_WEIGHTS || {})) {
    if (TYPE_BY_ID[id]?.kind !== 'chord') errs.push(`CHORD_RULES.MAIN_WEIGHTS: bilinmeyen akor "${id}"`);
  }
  for (const id of cfg.CHORD_RULES?.ALTERED_TYPES || []) {
    if (TYPE_BY_ID[id]?.kind !== 'chord') errs.push(`CHORD_RULES.ALTERED_TYPES: bilinmeyen akor "${id}"`);
  }
  for (const id of cfg.INTERVAL_RULES?.POOL || []) {
    if (TYPE_BY_ID[id]?.kind !== 'interval') errs.push(`INTERVAL_RULES.POOL: bilinmeyen aralık "${id}"`);
  }
  num(cfg.SCORING?.REPLAY_PENALTY, 0, 1, 'SCORING.REPLAY_PENALTY');
  oneOf(cfg.PITCH?.ALGORITHM, ['YIN', 'MPM'], 'PITCH.ALGORITHM');
  if (!(cfg.PITCH?.FFT_SIZE === 'auto' || [1024, 2048, 4096, 8192, 16384].includes(cfg.PITCH?.FFT_SIZE))) {
    errs.push('PITCH.FFT_SIZE: "auto" ya da 1024 / 2048 / 4096 / 8192 / 16384 olmalı');
  }
  num(cfg.PITCH?.YIN_THRESHOLD, 0.01, 0.9, 'PITCH.YIN_THRESHOLD');
  num(cfg.PITCH?.YIN_ADAPTIVE_K, 0, 0.99, 'PITCH.YIN_ADAPTIVE_K');
  num(cfg.PITCH?.MIN_CLARITY, 0, 1, 'PITCH.MIN_CLARITY');
  num(cfg.PITCH?.MEDIAN_FRAMES, 1, 15, 'PITCH.MEDIAN_FRAMES');
  num(cfg.PITCH?.MIN_FREQ, 20, 500, 'PITCH.MIN_FREQ');
  num(cfg.PITCH?.MAX_FREQ, 200, 4000, 'PITCH.MAX_FREQ');
  if (!(cfg.PITCH?.MAX_FREQ > cfg.PITCH?.MIN_FREQ)) errs.push('PITCH: MAX_FREQ, MIN_FREQ değerinden büyük olmalı');
  num(cfg.PITCH?.NOISE_GATE_DB, -100, 0, 'PITCH.NOISE_GATE_DB');
  oneOf(cfg.AUDIO?.INSTRUMENT, ['piano', 'synth'], 'AUDIO.INSTRUMENT');
  num(cfg.AUDIO?.CHORD_DURATION_S, 0.2, 10, 'AUDIO.CHORD_DURATION_S');
  num(cfg.AUDIO?.MELODIC_NOTE_S, 0.1, 5, 'AUDIO.MELODIC_NOTE_S');
  num(cfg.AUDIO?.MELODIC_GAP_S, 0, 3, 'AUDIO.MELODIC_GAP_S');
  num(cfg.AUDIO?.BOTH_PAUSE_S, 0, 5, 'AUDIO.BOTH_PAUSE_S');
  oneOf(cfg.AUDIO?.PRACTICE_PLAYBACK, PLAYBACK_MODES, 'AUDIO.PRACTICE_PLAYBACK');
  oneOf(cfg.EXAM?.PLAYBACK, PLAYBACK_MODES, 'EXAM.PLAYBACK');
  num(cfg.AUDIO?.PIANO?.SAMPLE_EVERY, 1, 12, 'AUDIO.PIANO.SAMPLE_EVERY');
  num(cfg.UI?.CONTOUR_SECONDS, 1, 30, 'UI.CONTOUR_SECONDS');
  num(cfg.UI?.CONTOUR_RANGE_CENTS, 20, 1200, 'UI.CONTOUR_RANGE_CENTS');
  num(cfg.UI?.COACH_INTERVAL_MS, 1000, 60000, 'UI.COACH_INTERVAL_MS');
  num(cfg.UI?.COACH_FAR_CENTS, 30, 600, 'UI.COACH_FAR_CENTS');
  num(cfg.HISTORY?.MAX_ENTRIES, 1, 1000, 'HISTORY.MAX_ENTRIES');
  for (const [p, v] of textLeaves(cfg.TEXTS)) {                // arayüz adları: boş olamaz, uzunluk sınırı
    if (typeof v !== 'string' || !v.trim()) errs.push(`TEXTS.${p}: ad boş olamaz`);
    else if (v.length > textMaxLen(p)) errs.push(`TEXTS.${p}: en fazla ${textMaxLen(p)} karakter`);
  }
  // Uygulanabilirlik: bu ayarlarla bir oturum gerçekten üretilebiliyor mu? (dar register vb. burada yakalanır)
  if (!errs.length) {
    try { generateSession(cfg, mulberry32(1)); }
    catch (err) { errs.push(err.message); }
  }
  return errs;
}
