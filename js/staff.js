// Solfej Lab — js/staff.js
// Perde grafiği (sent grafiği), porte görünümü (canvas çift porte, nota başları) ve ayrı VexFlow porte paneli.

import { CONFIG } from './config.js';
import { loadUiState, saveUiState } from './nav.js';
import { LETTERS, MINUS, S, VIEW_MODES, clamp, makeStaffMap, staffStep } from './pure.js';
import { loadScriptGlobal } from './audio.js';
import { exercise, fsm, isNoteRevealed, mode, noteState, practiceTitle, session, setText, ui } from './ui.js';

// ── Perde grafiği (zaman içinde hedefe göre sapma) — canvas ──
//  staffMode = true → porte görünümü (drawStaffContour); false → eski sent grafiği
//  lineMode  = false → "Porte" görünümü: akan çizgi ve olay işaretleri çizilmez (yalnız hedef ve canlı nota başı)
export const contour = {
  pts: [], marks: [], w: 0, h: 0, dpr: 1, ctx: null, colors: null, mono: 'monospace',
  staffMode: false, lineMode: true, G: null, layer: null, map: null, mapNotes: null,
};
export function setupContour() {
  const cv = ui.contour;
  contour.ctx = cv.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  // Renkler css/style.css'teki :root değişkenlerinden (palet tek yerden değişir); ikinci değer yedek
  contour.colors = {
    accent: v('--accent', '#8aa4ff'), green: v('--green', '#34d399'), red: v('--red', '#f87171'),
    yellow: v('--yellow', '#fbbf24'),
    muted: v('--muted', '#8894ab'), grid: v('--chart-grid', 'rgba(148,163,184,.14)'), zero: v('--chart-zero', 'rgba(255,255,255,.30)'),
    band: v('--chart-band', 'rgba(52,211,153,.12)'), mark: v('--chart-mark', 'rgba(148,163,184,.40)'),
    staff: v('--staff-line', 'rgba(203,213,225,.42)'), clef: v('--staff-clef', 'rgba(226,232,240,.82)'), c4: v('--staff-c4', 'rgba(203,213,225,.30)'),
    head: v('--staff-head', 'rgba(203,213,225,.78)'), guide: v('--staff-guide', 'rgba(138,164,255,.55)'),
  };
  contour.mono = v('--mono', 'monospace');
  // CSS boyutu (genişlik %100, yükseklik --view-h) ekrandan okunur; iç çözünürlük = CSS boyutu × devicePixelRatio (en fazla 2)
  const measure = () => {
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === contour.w && h === contour.h && dpr === contour.dpr && cv.width === Math.round(w * dpr)) return;   // değişmediyse tuval silinmez
    contour.w = w; contour.h = h; contour.dpr = dpr;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    drawContour(performance.now());
  };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
  contour.w = 0;
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(cv);
  window.addEventListener('resize', schedule);
  // Telefon/tablet döndürülünce: tarayıcı yeni boyutu biraz gecikmeyle verir
  window.addEventListener('orientationchange', () => { schedule(); setTimeout(schedule, 300); });
  // Piksel oranı değişince (yakınlaştırma, başka ekrana taşıma) boyut aynı kalsa da iç çözünürlük yenilenir
  const watchDpr = () => {
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq?.addEventListener?.('change', () => { schedule(); watchDpr(); }, { once: true });
  };
  watchDpr();
}
/** midi: puanlamadaki gibi katlanmış perde (hedef.midi + sent/100) → porte basamağı burada, yazım bağlamıyla hesaplanır */
export function pushContour(t, cents, held, midi = NaN, zone = 'none') {
  contour.pts.push({ t, c: cents, h: held, s: staffMapFor(exercise.notes)(midi), z: zone });
  const cutoff = t - CONFIG.UI.CONTOUR_SECONDS * 1000 - 500;
  while (contour.pts.length && contour.pts[0].t < cutoff) contour.pts.shift();
}
export function markContour(t, label) {
  contour.marks.push({ t, label });
  const cutoff = t - CONFIG.UI.CONTOUR_SECONDS * 1000 - 500;
  while (contour.marks.length && contour.marks[0].t < cutoff) contour.marks.shift();
}
export function drawContour(now) {
  const { ctx, w: W, h: H, dpr, colors: C } = contour;
  if (!ctx || !C) return;
  if (document.hidden || !ui.contour.offsetParent) return;   // görünmeyen bölüm / kapalı porte çizilmez (telefonda pil ve işlemci)
  if (contour.staffMode) { drawStaffContour(now); return; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const span = CONFIG.UI.CONTOUR_SECONDS * 1000, R = CONFIG.UI.CONTOUR_RANGE_CENTS;
  const L = 42, RM = 10, T = 10, B = 10, pw = Math.max(1, W - L - RM), ph = Math.max(1, H - T - B);
  const X = (t) => L + ((t - (now - span)) / span) * pw;
  const Y = (c) => T + ph / 2 - (clamp(c, -R, R) / R) * (ph / 2);

  const tol = Math.min(CONFIG.TOLERANCE_CENTS, R);              // tolerans bandı (hafif yeşil yıkama)
  ctx.fillStyle = C.band;
  ctx.fillRect(L, Y(tol), pw, Y(-tol) - Y(tol));

  ctx.font = `11px ${contour.mono}`;                             // ızgara: ince, düz çizgiler
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const c of [R, R / 2, 0, -R / 2, -R]) {
    const y = Math.round(Y(c)) + 0.5;
    ctx.strokeStyle = c === 0 ? C.zero : C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(c === 0 ? '0' : `${c > 0 ? '+' : MINUS}${Math.round(Math.abs(c))}`, L - 6, y);
  }

  ctx.textAlign = 'left';                                        // olay işaretleri (▶ soru, ✓ doğrulama)
  ctx.textBaseline = 'top';
  for (const m of contour.marks) {
    const x = Math.round(X(m.t)) + 0.5;
    if (x < L || x > L + pw) continue;
    ctx.strokeStyle = C.mark;
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(m.label, x + 3, T + 1);
  }

  const pts = contour.pts;                                       // okunan perde: 2 px çizgi
  const stroke = (pick, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let open = false, prevT = -Infinity;
    for (const p of pts) {
      const ok = Number.isFinite(p.c) && pick(p) && p.t - prevT < 120;
      const x = X(p.t), y = Y(p.c);
      if (!Number.isFinite(p.c) || !pick(p)) { open = false; prevT = p.t; continue; }
      if (!open || !ok) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      open = true;
      prevT = p.t;
    }
    ctx.stroke();
  };
  stroke(() => true, C.accent, 2);
  stroke((p) => p.h, C.green, 3);
  ctx.fillStyle = C.red;                                         // aralık dışına taşan kareler: kenarda kırmızı çentik
  for (const p of pts) {
    if (!Number.isFinite(p.c) || Math.abs(p.c) <= R) continue;
    const x = X(p.t);
    if (x < L) continue;
    ctx.fillRect(x - 1, p.c > 0 ? T : T + ph - 3, 2, 3);
  }
}


// ── Porte görünümü: perde grafiği sol + fa anahtarlı çift porte üzerinde (canvas; VexFlow gerekmez) ──
//  Konumlar makeStaffMap() ile (PURE). Değişmeyen katman (çizgiler, anahtarlar, Do4) önbellekte tutulur;
//  her karede yalnızca çizgi, kılavuz ve nota başları çizilir.
export const STAFF_LINES = [18, 20, 22, 24, 26, 30, 32, 34, 36, 38];   // fa: Sol2 Si2 Re3 Fa3 La3 · sol: Mi4 Sol4 Si4 Re5 Fa5
export const C4_STEP = 28;
export const CLEF_FONT = '"Bravura Text", "Noto Music", "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "FreeSerif", serif';
export let musicGlyphs = null;                 // 𝄞 / 𝄢 yazı tipinde var mı? (ilk çizimde bir kez sınanır)

/** Alıştırmanın yazım bağlamına göre perde → basamak (alıştırma değişince yeniden kurulur) */
export function staffMapFor(notes) {
  if (contour.mapNotes !== notes || !contour.map) { contour.map = makeStaffMap(notes); contour.mapNotes = notes; }
  return contour.map;
}

/** Anahtar karakteri gerçekten çiziliyor mu? Eksik karakter kutusuyla (atanmamış U+1D127) karşılaştırılır */
export function musicGlyphsAvailable() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d', { willReadFrequently: true });
    const ink = (ch) => {
      g.clearRect(0, 0, 48, 48);
      g.font = `32px ${CLEF_FONT}`;
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(ch, 8, 24);
      return g.getImageData(0, 0, 48, 48).data;
    };
    const clef = ink('\u{1D11E}'), missing = ink('\u{1D127}');
    let filled = 0, differ = 0;
    for (let i = 3; i < clef.length; i += 4) { if (clef[i] > 40) filled++; if (Math.abs(clef[i] - missing[i]) > 40) differ++; }
    return filled > 30 && differ > 30;
  } catch { return false; }
}

/** Yerleşim: basamak aralığı register'a göre (en az Do2 altı – La5 üstü), yarım aralık = canvas yüksekliğine göre */
export function staffGeometry() {
  const key = `${contour.w}x${contour.h}@${contour.dpr}|${CONFIG.REGISTER.minMidi}-${CONFIG.REGISTER.maxMidi}`;
  if (contour.G && contour.G.key === key && contour.layer) return contour.G;
  const W = contour.w, H = contour.h, base = makeStaffMap();
  const lo = Math.min(16, Math.floor(base(CONFIG.REGISTER.minMidi)) - 2);
  const hi = Math.max(42, Math.ceil(base(CONFIG.REGISTER.maxMidi)) + 3);
  const T = 6, half = Math.max(2, (H - 12) / (hi - lo));
  const G = {
    key, W, H, lo, hi, T, half, x0: 8, L: 52, right: W - 6,
    xNow: W - Math.max(36, half * 4.4),                       // "şimdi": nota başları sütunu
    Y: (p) => T + (hi - clamp(p, lo, hi)) * half,
  };
  contour.G = G;
  buildStaffLayer(G);
  return G;
}

/** Değişmeyen katman: porte çizgileri, sistem çizgisi, anahtarlar, Do4 kılavuzu (önbellek canvas'ı) */
export function buildStaffLayer(G) {
  const cv = contour.layer || (contour.layer = document.createElement('canvas'));
  cv.width = Math.max(1, Math.round(G.W * contour.dpr));
  cv.height = Math.max(1, Math.round(G.H * contour.dpr));
  const g = cv.getContext('2d'), C = contour.colors;
  g.setTransform(contour.dpr, 0, 0, contour.dpr, 0, 0);
  g.clearRect(0, 0, G.W, G.H);
  const hline = (p, x1, x2) => { const y = Math.round(G.Y(p)) + 0.5; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); };
  g.lineWidth = 1;
  g.strokeStyle = C.c4;                                          // ortada Do4: kesik ek çizgi
  g.setLineDash([3, 5]);
  hline(C4_STEP, G.L, G.right);
  g.setLineDash([]);
  g.strokeStyle = C.staff;
  for (const p of STAFF_LINES) hline(p, G.x0, G.right);
  g.beginPath();                                                 // iki porteyi bağlayan sistem çizgisi
  g.moveTo(G.x0 + 0.5, Math.round(G.Y(38)) + 0.5);
  g.lineTo(G.x0 + 0.5, Math.round(G.Y(18)) + 0.5);
  g.stroke();
  drawClefs(g, G);
  g.fillStyle = C.muted;
  g.font = `10px ${contour.mono}`;
  g.textAlign = 'left';
  g.textBaseline = 'bottom';
  g.fillText('Do4', G.L + 2, G.Y(C4_STEP) - 2);
}

export function drawClefs(g, G) {
  const s = 2 * G.half, x = G.x0 + 6;                            // s = çizgi aralığı
  g.fillStyle = g.strokeStyle = contour.colors.clef;
  if (musicGlyphs === null) musicGlyphs = musicGlyphsAvailable();
  if (musicGlyphs) {
    fitGlyph(g, '\u{1D11E}', x, G.Y(41.2), G.Y(27.3));           // sol anahtarı: kıvrımı Sol4 çizgisinde
    fitGlyph(g, '\u{1D122}', x, G.Y(26.3), G.Y(19.6));           // fa anahtarı: noktaları Fa3 çizgisinin iki yanında
  } else {
    drawTrebleClef(g, x, G.Y(32), s);
    drawBassClef(g, x, G.Y(24), s);
  }
}
/** Karakteri ölçüp verilen üst–alt sınıra sığdırır (yazı tipleri arasındaki boyut farkını giderir) */
export function fitGlyph(g, ch, x, top, bottom) {
  g.font = `100px ${CLEF_FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const m = g.measureText(ch);
  const asc = m.actualBoundingBoxAscent || 0, desc = m.actualBoundingBoxDescent || 0;
  if (!(asc + desc > 0)) return;
  const k = (bottom - top) / (asc + desc);
  g.font = `${(100 * k).toFixed(2)}px ${CLEF_FONT}`;
  g.fillText(ch, x + (m.actualBoundingBoxLeft || 0) * k, top + asc * k);
}
/** Yedek çizim (müzik yazı tipi yoksa): sol anahtarı — kıvrım Sol çizgisinde (yG), s = çizgi aralığı */
export function drawTrebleClef(g, x, yG, s) {
  const X = (u) => x + u * s, Y = (v) => yG + v * s;
  g.lineWidth = Math.max(1.3, s * 0.14);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(X(0.85), Y(0.05));
  g.bezierCurveTo(X(0.95), Y(-0.35), X(0.8), Y(-0.55), X(0.55), Y(-0.55));
  g.bezierCurveTo(X(0.2), Y(-0.55), X(0), Y(-0.2), X(0), Y(0.2));
  g.bezierCurveTo(X(0), Y(0.75), X(0.35), Y(1.05), X(0.75), Y(1.05));
  g.bezierCurveTo(X(1.2), Y(1.05), X(1.5), Y(0.6), X(1.45), Y(0.1));
  g.bezierCurveTo(X(1.4), Y(-0.45), X(0.95), Y(-0.7), X(0.75), Y(-1.1));
  g.bezierCurveTo(X(0.3), Y(-1.8), X(0.55), Y(-3.4), X(0.95), Y(-3.4));
  g.bezierCurveTo(X(1.35), Y(-3.4), X(1.25), Y(-2.6), X(0.85), Y(-2.2));
  g.lineTo(X(0.6), Y(1.8));
  g.bezierCurveTo(X(0.55), Y(2.3), X(0.1), Y(2.25), X(0.05), Y(1.75));
  g.stroke();
  g.beginPath();
  g.arc(X(0.2), Y(1.72), s * 0.2, 0, Math.PI * 2);
  g.fill();
}
/** Yedek çizim: fa anahtarı — baş noktası Fa çizgisinde (yF), iki nokta Fa çizgisinin üstünde ve altında */
export function drawBassClef(g, x, yF, s) {
  const X = (u) => x + u * s, Y = (v) => yF + v * s;
  g.lineWidth = Math.max(1.3, s * 0.16);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(X(0.25), Y(0), s * 0.24, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(X(0.12), Y(-0.05));
  g.bezierCurveTo(X(0.1), Y(-0.75), X(0.45), Y(-0.98), X(0.85), Y(-0.98));
  g.bezierCurveTo(X(1.3), Y(-0.92), X(1.58), Y(-0.55), X(1.55), Y(-0.1));
  g.bezierCurveTo(X(1.5), Y(0.95), X(0.8), Y(1.65), X(0.1), Y(2.0));
  g.stroke();
  for (const v of [-0.5, 0.5]) { g.beginPath(); g.arc(X(1.95), Y(v), s * 0.13, 0, Math.PI * 2); g.fill(); }
}
/** Değiştirici (♯ ♭ × ♭♭) — her tarayıcıda aynı görünsün diye yazı tipiyle değil çizgiyle; xr = sağ kenar */
export function drawAccidental(g, acc, xr, y, half, color) {
  const s = 2 * half;
  g.strokeStyle = color;
  g.lineCap = 'butt';
  const seg = (x1, y1, x2, y2, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  if (acc === 1) {
    const thin = Math.max(1, s * 0.09), thick = Math.max(1.6, s * 0.2);
    seg(xr - 0.62 * s, y - 1.25 * s, xr - 0.62 * s, y + 1.35 * s, thin);
    seg(xr - 0.28 * s, y - 1.35 * s, xr - 0.28 * s, y + 1.25 * s, thin);
    for (const d of [-0.36, 0.36]) seg(xr - 0.9 * s, y + (d + 0.12) * s, xr, y + (d - 0.12) * s, thick);
  } else if (acc === -1 || acc === -2) {
    for (let k = 0; k < -acc; k++) {
      const xl = xr - 0.72 * s - k * 0.8 * s;
      seg(xl, y - 1.7 * s, xl, y + 0.5 * s, Math.max(1, s * 0.1));
      g.lineWidth = Math.max(1.2, s * 0.16);
      g.beginPath();
      g.moveTo(xl, y + 0.5 * s);
      g.bezierCurveTo(xl + 0.75 * s, y + 0.05 * s, xl + 0.6 * s, y - 0.6 * s, xl, y - 0.15 * s);
      g.stroke();
    }
  } else if (acc === 2) {
    const w = Math.max(1.4, s * 0.16), c = xr - 0.4 * s, r = 0.32 * s;
    seg(c - r, y - r, c + r, y + r, w);
    seg(c - r, y + r, c + r, y - r, w);
  }
}
export const accWidth = (acc, half) => 2 * half * (acc === -2 ? 1.6 : 0.95);
/** Ek çizgiler: Do4 ve porte dışındaki notalar için, nota başı genişliğinde */
export function drawLedgers(g, G, pos, x, rx, color) {
  const ps = [];
  if (Math.abs(pos - C4_STEP) < 0.5) ps.push(C4_STEP);
  for (let p = 40; p <= pos + 0.5; p += 2) ps.push(p);
  for (let p = 16; p >= pos - 0.5; p -= 2) ps.push(p);
  g.strokeStyle = color;
  g.lineWidth = 1;
  for (const p of ps) {
    const y = Math.round(G.Y(p)) + 0.5;
    g.beginPath(); g.moveTo(x - rx * 1.6, y); g.lineTo(x + rx * 1.6, y); g.stroke();
  }
}
export function drawHead(g, x, y, half, color, filled, width = 1.6) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.32);
  g.beginPath();
  g.ellipse(0, 0, half * 1.3, half * 0.9, 0, 0, Math.PI * 2);
  if (filled) { g.fillStyle = color; g.fill(); }
  else { g.strokeStyle = color; g.lineWidth = width; g.stroke(); }
  g.restore();
}
/** Alıştırma notalarının yerleşimi: 2'li aralıkta üstteki baş sağa kayar, yakın değiştiriciler sola kademelenir */
export function layoutHeads(notes, G) {
  const rx = G.half * 1.3;
  const items = notes.map((n, i) => ({ i, n, pos: staffStep(n), shift: 0 })).sort((a, b) => a.pos - b.pos);
  items.forEach((it, k) => { const p = items[k - 1]; if (p && it.pos - p.pos === 1 && !p.shift) it.shift = 1; });
  const cols = [];                                               // değiştirici sütunları: [son konum, ...]
  for (const it of [...items].sort((a, b) => b.pos - a.pos)) {
    it.x = G.xNow + it.shift * rx * 2.05;
    it.y = G.Y(it.pos);
    if (!it.n.acc) continue;
    let c = 0;
    while (cols[c] !== undefined && cols[c] - it.pos < 6) c++;
    cols[c] = it.pos;
    let xr = G.xNow - rx - 3;
    for (let k = 0; k < c; k++) xr -= accWidth(-2, G.half) + 2;
    it.accX = xr;
  }
  return items;
}

export function drawStaffContour(now) {
  const { ctx, dpr, colors: C } = contour;
  const G = staffGeometry();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ui.contour.width, ui.contour.height);
  ctx.drawImage(contour.layer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const span = CONFIG.UI.CONTOUR_SECONDS * 1000;
  const X = (t) => G.L + ((t - (now - span)) / span) * (G.xNow - G.L);
  const top = G.Y(G.hi), bottom = G.Y(G.lo);

  ctx.font = `11px ${contour.mono}`;                             // olay işaretleri (▶ soru, ✓ doğrulama)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;
  for (const m of contour.lineMode ? contour.marks : []) {
    const x = Math.round(X(m.t)) + 0.5;
    if (x < G.L || x > G.xNow) continue;
    ctx.strokeStyle = C.mark;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(m.label, x + 3, top + 1);
  }

  const map = staffMapFor(exercise.notes);
  const cur = exercise.current, st = fsm.state;
  if (cur && isNoteRevealed(exercise.index) && (st === S.LISTENING || st === S.VERIFIED)) {   // hedef kılavuzu
    const y = Math.round(G.Y(map(cur.midi))) + 0.5;
    ctx.strokeStyle = C.guide;
    ctx.beginPath(); ctx.moveTo(G.L, y); ctx.lineTo(G.xNow, y); ctx.stroke();
  }

  // Okunan perde: her parça kendi karesinin rengiyle (tolerans içinde yeşil, dışında kırmızı; isteğe bağlı sarı)
  const pts = contour.pts;
  if (contour.lineMode) drawStaffLine(ctx, G, X, pts, top, bottom);   // "Porte" görünümünde akan çizgi yok

  // "Şimdi" sütunu: alıştırmanın sesleri içi boş nota başı (sınavda yalnızca açılanlar)
  drawStaffHeads(ctx, G, pts, now, st);
}
/** Akan çizgi: her parça kendi karesinin rengiyle; porte aralığı dışına taşan kareler kenarda çentik */
export function drawStaffLine(ctx, G, X, pts, top, bottom) {
  const C = contour.colors;
  ctx.save();
  ctx.beginPath();
  ctx.rect(G.L, 0, G.xNow - G.L + 2, G.H);                       // anahtarların üstüne taşmasın
  ctx.clip();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let prev = null;
  for (const p of pts) {
    if (!Number.isFinite(p.s)) { prev = null; continue; }
    if (prev && p.t - prev.t < 120) {
      ctx.strokeStyle = zoneColor(p.z);
      ctx.beginPath();
      ctx.moveTo(X(prev.t), G.Y(prev.s));
      ctx.lineTo(X(p.t), G.Y(p.s));
      ctx.stroke();
    }
    prev = p;
  }
  ctx.restore();
  ctx.fillStyle = C.red;                                         // porte aralığı dışına taşan kareler: kenarda çentik
  for (const p of pts) {
    if (!Number.isFinite(p.s) || (p.s >= G.lo && p.s <= G.hi)) continue;
    const x = X(p.t);
    if (x < G.L) continue;
    ctx.fillRect(x - 1, p.s > G.hi ? top : bottom - 3, 2, 3);
  }
}
/** Nota başları: alıştırmanın sesleri (içi boş) ve okunan sesin canlı nota başı (dolu) */
export function drawStaffHeads(ctx, G, pts, now, st) {
  const C = contour.colors;
  const states = staffStates();
  const COLOR = { done: C.green, missed: C.red, active: C.accent, pending: C.head };
  const heads = layoutHeads(exercise.notes, G);
  for (const it of heads) {
    if (!isNoteRevealed(it.i)) continue;
    const s = states[it.i], color = COLOR[s] ?? C.head;
    drawLedgers(ctx, G, it.pos, it.x, G.half * 1.3, C.staff);
    if (it.n.acc) drawAccidental(ctx, it.n.acc, it.accX, it.y, G.half, color);
    if (s === 'active') { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    drawHead(ctx, it.x, it.y, G.half, color, false, s === 'active' ? Math.max(2, G.half * 0.36) : Math.max(1.4, G.half * 0.26));
    ctx.shadowBlur = 0;
  }

  // Canlı nota başı: okunan ses, sıradaki notanın sütununda hareket eder; doğru seste hedef başın üstüne biner
  const last = pts[pts.length - 1];
  if (last && Number.isFinite(last.s) && now - last.t < 160 && st === S.LISTENING) {
    const x = heads.find((h) => h.i === exercise.index)?.x ?? G.xNow;
    const color = zoneColor(last.z), pos = clamp(last.s, G.lo, G.hi);
    drawLedgers(ctx, G, pos, x, G.half * 1.3, C.staff);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    drawHead(ctx, x, G.Y(pos), G.half * 0.92, color, true);
    ctx.shadowBlur = 0;
  }
}
/** Bölge rengi: tolerans içinde yeşil; sınırda sarı (UI.STAFF_WARN_YELLOW açıksa) ya da kırmızı; ötesi kırmızı */
export function zoneColor(zone) {
  const C = contour.colors;
  if (zone === 'perfect') return C.green;
  if (zone === 'ok' && CONFIG.UI.STAFF_WARN_YELLOW) return C.yellow;
  return C.red;
}


// ── Porte (VexFlow) ──
//  staffView.on    → "Portede göster": perde grafiği porte üzerinde (canvas)
//  staffView.panel → ayrı VexFlow paneli görünür (on && CONFIG.UI.VEXFLOW_PANEL)
export const staffView = { on: false, panel: false, VF: null, loading: null, error: null, key: '' };
export const VEX_ACC = { '-2': 'bb', '-1': 'b', '1': '#', '2': '##' };
export const vexKey = (n) => `${LETTERS[n.letter].toLowerCase()}${VEX_ACC[n.acc] ?? ''}/${n.octave}`;
export let staffRaf = 0;

// ── Görünüm: 'staff' (yalnız porte) · 'staff+graph' (porte + akan çizgi) · 'graph' (sent grafiği) ──
// Sınav ve Serbest çalışma için ayrı ayrı hatırlanır (solfejlab.ui.v1 → viewMode.exam / viewMode.practice).
export let viewMode = 'staff+graph';
/** Telefon: dokunmatik ve ekranın kısa kenarı ≤ 600 px (dikey ve yatay aynı sonuç) */
export const phoneScreen = () => !!window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
/** Görünüm varsayılanı: telefonda CONFIG.UI.VIEW_MODE_MOBILE ('Porte'), masaüstü ve tablette CONFIG.UI.VIEW_MODE */
export const defaultViewMode = () => (phoneScreen() && VIEW_MODES.includes(CONFIG.UI.VIEW_MODE_MOBILE) ? CONFIG.UI.VIEW_MODE_MOBILE : CONFIG.UI.VIEW_MODE);
/** Bir çalışma modunun hatırlanan görünümü (yoksa cihaza göre varsayılan) */
export function viewModeFor(m) {
  const v = loadUiState().viewMode?.[m];
  return VIEW_MODES.includes(v) ? v : defaultViewMode();
}
export function setViewMode(vm, { persist = true } = {}) {
  if (!VIEW_MODES.includes(vm)) vm = defaultViewMode();
  viewMode = vm;
  const staffOn = vm !== 'graph';
  staffView.on = staffOn;
  contour.staffMode = staffOn;
  contour.lineMode = vm !== 'staff';
  for (const b of document.querySelectorAll('#viewSeg [data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === vm));
  for (const n of document.querySelectorAll('.contour .ch-staff')) n.hidden = !staffOn;
  for (const n of document.querySelectorAll('.contour .ch-cents')) n.hidden = staffOn;
  for (const n of document.querySelectorAll('.contour .ch-time')) n.hidden = vm === 'staff';
  ui.contour.setAttribute('aria-label', staffOn ? 'Okunan perde, nota portesi üzerinde' : 'Okunan perdenin hedefe göre zaman içindeki sapması');
  drawContour(performance.now());
  if (persist) saveUiState({ viewMode: { ...(loadUiState().viewMode || {}), [mode]: vm } });
  updateVexPanel();
}
/** Sıradaki görünüme geç (kısayol için) */
export function cycleViewMode() { setViewMode(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length]); }
/** Eski ad korunur: açık → Porte + grafik, kapalı → Grafik */
export function setStaffEnabled(on, opts) { setViewMode(on ? 'staff+graph' : 'graph', opts); }

// ── Sınavdaki "Porte" anahtarı: kapalıyken porte/grafik alanı gizlenir; dikey gösterge ve yönlendirme kalır ──
export function examStaffOn() { return loadUiState().examStaffOn !== false; }
export function setExamStaff(on, { persist = true } = {}) {
  ui.examStaffToggle.checked = on;
  ui.examStaffSwitch.hidden = mode !== 'exam';
  ui.tuner.classList.toggle('no-staff', mode === 'exam' && !on);
  if (persist) saveUiState({ examStaffOn: on });
  drawContour(performance.now());
}
/** Ayrı VexFlow panelini gösterir/gizler; gerekiyorsa kütüphaneyi yükler */
export function updateVexPanel() {
  const on = staffView.on && !!CONFIG.UI.VEXFLOW_PANEL;
  staffView.panel = on;
  ui.staffPanel.hidden = !on;
  if (!on) return;
  if (!staffView.VF && !staffView.loading) {
    setText(ui.staffMsg, 'Porte kütüphanesi (VexFlow) yükleniyor…');
    staffView.error = null;
    staffView.loading = loadScriptGlobal(
      CONFIG.LIBS.VEXFLOW,
      () => (window.VexFlow?.Renderer ? window.VexFlow : window.Vex?.Flow?.Renderer ? window.Vex.Flow : null),
      'VexFlow',
    )
      .then((VF) => { staffView.VF = VF; })
      .catch((err) => { staffView.error = err; console.warn('[VexFlow]', err); })
      .finally(() => { staffView.loading = null; staffView.key = ''; drawStaff(); });
  }
  staffView.key = '';
  scheduleStaffDraw();
}
export function scheduleStaffDraw() {
  if (!staffView.panel || staffRaf) return;
  staffRaf = requestAnimationFrame(() => { staffRaf = 0; drawStaff(); });
}
export function staffStates() {
  return exercise.notes.map((_, i) => {
    const s = noteState(i);
    return s === 'done' ? 'done' : s === 'missed' ? 'missed' : s === 'active' || s === 'ready' ? 'active' : 'pending';
  });
}
export function drawStaff() {
  if (!staffView.panel) return;
  const host = ui.staff;
  if (staffView.error) {
    host.replaceChildren();
    setText(ui.staffMsg, 'Porte kütüphanesi (VexFlow) yüklenemedi — internet bağlantısını kontrol edin. Uygulamanın geri kalanı etkilenmez.');
    return;
  }
  if (!staffView.VF) return;
  const states = staffStates();
  const width = Math.max(240, Math.floor(host.clientWidth || 320));
  const key = `${exercise.notes.map((n) => n.fullName).join(',')}|${states.join(',')}|${width}`;
  if (key === staffView.key) return;
  staffView.key = key;
  try {
    renderGrandStaff(staffView.VF, host, exercise.notes, states, width);
    const q = session?.current;
    setText(ui.staffMsg, q ? `Soru ${session.index + 1} · ${q.title}` : exercise.notes.length ? practiceTitle : 'Soru başlayınca sesler burada görünür.');
  } catch (err) {
    console.error('[porte]', err);
    host.replaceChildren();
    staffView.key = '';
    setText(ui.staffMsg, `Porte çizilemedi: ${err.message}`);
  }
}
/** Büyük porte (sol + fa anahtarı) üzerinde armonik (aynı anda) nota yığını */
export function renderGrandStaff(VF, host, notes, states, hostW) {
  const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, GhostNote } = VF;
  host.replaceChildren();
  const sysW = Math.min(hostW - 28, 300);
  const x0 = Math.round((hostW - sysW) / 2) + 14;               // köşeli parantez (brace) için sol pay
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(hostW, 236);
  const ctx = renderer.getContext();
  const treble = new Stave(x0, 14, sysW - 14).addClef('treble');
  const bass = new Stave(x0, 120, sysW - 14).addClef('bass');
  treble.setContext(ctx).draw();
  bass.setContext(ctx).draw();
  const TYPE = StaveConnector.type || {};
  for (const [k, s] of [['BRACE', 'brace'], ['SINGLE_LEFT', 'singleLeft'], ['SINGLE_RIGHT', 'singleRight']]) {
    new StaveConnector(treble, bass).setType(TYPE[k] ?? s).setContext(ctx).draw();
  }
  const cs = getComputedStyle(document.documentElement), cv = (n, fb) => cs.getPropertyValue(n).trim() || fb;
  const COLOR = { done: cv('--vex-done', '#047857'), active: cv('--vex-active', '#4338ca'), missed: cv('--vex-missed', '#b91c1c') };
  const items = notes.map((n, i) => ({ n, i }));
  const build = (list, clef) => {
    if (!list.length) return new GhostNote({ duration: 'w' });
    const sn = new StaveNote({ clef, keys: list.map(({ n }) => vexKey(n)), duration: 'w' });
    list.forEach(({ n, i }, k) => {
      const color = COLOR[states[i]];
      const style = color ? { fillStyle: color, strokeStyle: color } : null;
      if (n.acc) {
        const acc = new Accidental(VEX_ACC[n.acc]);
        if (style && acc.setStyle) acc.setStyle(style);
        if (typeof sn.addAccidental === 'function') sn.addAccidental(k, acc);   // VexFlow 3 imzası
        else sn.addModifier(acc, k);                                           // VexFlow 4/5 imzası
      }
      if (style && sn.setKeyStyle) sn.setKeyStyle(k, style);
    });
    return sn;
  };
  const isTreble = ({ n }) => n.octave * 7 + n.letter >= 28;                    // yazılı C4 ve üstü → sol anahtarı
  const voice = (note) => {
    const v = new Voice({ num_beats: 4, beat_value: 4, numBeats: 4, beatValue: 4 });
    if (Voice.Mode && v.setMode) v.setMode(Voice.Mode.SOFT);
    v.addTickables([note]);
    return v;
  };
  const tv = voice(build(items.filter(isTreble), 'treble'));
  const bv = voice(build(items.filter((x) => !isTreble(x)), 'bass'));
  new Formatter().joinVoices([tv]).joinVoices([bv]).format([tv, bv], Math.max(60, sysW - 100));
  tv.draw(ctx, treble);
  bv.draw(ctx, bass);
  const svg = host.querySelector('svg');
  if (svg) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Porte: ${notes.map((n) => n.fullName).join(', ') || 'boş'}`);
  }
}
