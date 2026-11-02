// Solfej Lab — gerçek Chromium (headless) uçtan uca testi
//  Çalıştırma: bir kez `npm install` ve `npx playwright install chromium`, sonra `npm run e2e`
//  Tek senaryo: `ONLY=A npm run e2e` (A tam sınav · B Tone/VexFlow taklidi · C sınav provası · D telefon · E zorlanan şarkıcı
//               · F 6 sn −60 sent pes, sonra düzeltme · G arayüz adlarını sayfada düzenleme · H bölümler, menü, duraklatma · I görünüm seçici · J kendi sınavın · K alıştırma · L kısayollar · M telefon/tablet)
//  • Sayfa localhost'tan sunulur (güvenli bağlam → getUserMedia).
//  • Mikrofon = "sanal şarkıcı": o anki hedef sesi (+9 sent tiz) söyleyen osilatör → MediaStream.
//  • CDN'ler: senaryo 'offline' → hepsi engellenir (yedek yollar); 'stub' → Tone.js / VexFlow taklitleri.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.screenshots');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(process.argv[2] || path.join(HERE, '..', 'index.html'), 'utf8');
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s]`, ...a);

// index.html + proje dosyaları (css/, js/) — ES modülleri doğru içerik türüyle sunulmalı
const ROOT = path.resolve(HERE, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const served = [];
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  served.push(req.url);
  if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(HTML); return; }
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const SINGER = `(() => {
  const S = window.__singer = { bias: 9, jitter: 3, reactMs: 120, level: 0.3, octave: {}, silent: new Set(), wrongFirst: {}, delay: {}, enabled: true, practiceOctave: 0 };
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch {}
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    const g = ctx.createGain(); g.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(lp).connect(g).connect(dest); osc.start();
    let listenStart = 0, lastKey = '';
    setInterval(() => {
      const d = window.__dbg;
      const mute = () => g.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      if (!d || !S.enabled) return mute();
      const st = d.state, ex = d.exercise, sess = d.session, qi = sess ? sess.index : -1;
      const key = st + '|' + qi + '|' + (ex && ex.index);
      if (key !== lastKey) { lastKey = key; listenStart = performance.now(); }
      if (st !== 'LISTENING' || !ex || !ex.current || S.silent.has(qi)) return mute();
      const since = performance.now() - listenStart;
      if (since < S.reactMs + (S.delay[qi] || 0)) return mute();
      let target = ex.current.freq;
      const wf = S.wrongFirst[qi];
      if (wf && ex.index === wf.note && since < S.reactMs + wf.ms) target = ex.notes[wf.note - 1].freq;
      const oct = qi === -1 ? S.practiceOctave : (S.octave[qi] || 0);
      const cents = S.bias + (Math.random() - 0.5) * 2 * S.jitter;
      osc.frequency.setTargetAtTime(target * Math.pow(2, oct + cents / 1200), ctx.currentTime, 0.006);
      g.gain.setTargetAtTime(S.level, ctx.currentTime, 0.008);
    }, 12);
    return dest.stream;
  };
})();`;

const TONE_STUB = `window.__toneCalls = [];
window.Tone = {
  setContext(c) { window.__toneCalls.push(['setContext', c instanceof AudioContext]); },
  Sampler: class {
    constructor(o) { this.o = o; this.volume = { value: 0 }; window.__toneCalls.push(['Sampler', Object.keys(o.urls), o.baseUrl, o.release]); setTimeout(() => o.onload && o.onload(), 40); }
    toDestination() { window.__toneCalls.push(['toDestination']); return this; }
    triggerAttackRelease(notes, dur, time, vel) { window.__toneCalls.push(['tar', notes, dur, time, vel]); }
    releaseAll() { window.__toneCalls.push(['releaseAll']); }
    dispose() {}
  },
};`;

const VEX_STUB = `(() => {
  const calls = window.__vexCalls = [];
  const NS = 'http://www.w3.org/2000/svg';
  class Renderer { constructor(el, b) { this.svg = document.createElementNS(NS, 'svg'); el.appendChild(this.svg); calls.push(['Renderer', b]); }
    resize(w, h) { this.svg.setAttribute('width', w); this.svg.setAttribute('height', h); this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); return this; }
    getContext() { return { svg: this.svg }; } }
  Renderer.Backends = { CANVAS: 1, SVG: 2 };
  class Stave { constructor(x, y, w) { Object.assign(this, { x, y, w }); } addClef(c) { this.clef = c; return this; } setContext(ctx) { this.ctx = ctx; return this; }
    draw() { for (let i = 0; i < 5; i++) { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', this.x); l.setAttribute('x2', this.x + this.w); l.setAttribute('y1', this.y + 30 + i * 10); l.setAttribute('y2', this.y + 30 + i * 10); l.setAttribute('stroke', '#333'); this.ctx.svg.appendChild(l); } calls.push(['Stave', this.clef]); return this; } }
  class StaveConnector { setType(t) { calls.push(['conn', t]); return this; } setContext() { return this; } draw() { return this; } }
  StaveConnector.type = { SINGLE_RIGHT: 0, SINGLE_LEFT: 1, SINGLE: 1, DOUBLE: 2, BRACE: 3, BRACKET: 4 };
  class Accidental { constructor(t) { if (!['#', '##', 'b', 'bb', 'n'].includes(t)) throw new Error('bad acc ' + t); this.t = t; } setStyle(s) { this.style = s; return this; } }
  class StaveNote { constructor(o) { if (!o.keys?.length || !o.duration) throw new Error('keys/duration'); for (const k of o.keys) if (!/^[a-g](#|##|b|bb)?\\/\\d$/.test(k)) throw new Error('bad key ' + k); this.o = o; this.styles = {}; calls.push(['StaveNote', o.clef, o.keys.join(' ')]); }
    addModifier(m, i) { if (!(m instanceof Accidental) || typeof i !== 'number' || i >= this.o.keys.length) throw new Error('addModifier(mod, index)'); calls.push(['acc', m.t, i]); return this; }
    setKeyStyle(i, s) { this.styles[i] = s.fillStyle; calls.push(['style', i, s.fillStyle]); return this; } }
  class GhostNote { constructor(o) { this.ghost = true; } }
  class Voice { constructor(t) { this.t = t; } setMode(m) { this.mode = m; return this; } addTickables(n) { this.notes = n; return this; }
    draw(ctx, stave) { for (const n of this.notes) { if (n.ghost) continue; n.o.keys.forEach((k, i) => { const e = document.createElementNS(NS, 'ellipse'); e.setAttribute('cx', stave.x + stave.w / 2); e.setAttribute('cy', stave.y + 60 - i * 5); e.setAttribute('rx', 7); e.setAttribute('ry', 5); e.setAttribute('fill', n.styles[i] || '#111'); ctx.svg.appendChild(e); }); } calls.push(['draw', stave.clef]); return this; } }
  Voice.Mode = { STRICT: 1, SOFT: 2, FULL: 3 };
  class Formatter { joinVoices() { return this; } format(v, w) { calls.push(['format', v.length, w]); return this; } }
  window.Vex = { Flow: { Renderer, Stave, StaveConnector, Accidental, StaveNote, GhostNote, Voice, Formatter } };
})();`;

const ONLY = process.env.ONLY || '';
const run = (k) => !ONLY || ONLY.includes(k);
const FAST = { AUDIO: { CHORD_DURATION_S: 0.5, LISTEN_DELAY_MS: 120, VERIFIED_HOLD_MS: 150 }, EXAM: { NEXT_QUESTION_DELAY_MS: 250 } };

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function openPage(scenario, overrides, { width = 980, height = 1400, hash = 'sinav', device = null } = {}) {
  const context = await browser.newContext(device ? { ...device, permissions: ['microphone'] } : { viewport: { width, height }, permissions: ['microphone'] });
  await context.addInitScript(SINGER);
  await context.addInitScript(`(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.clear(); ${overrides ? `localStorage.setItem('solfejlab.config.v1', ${JSON.stringify(JSON.stringify(overrides))});` : ''} } } catch (e) {} })();`);
  const requests = [];
  await context.route(/cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|tonejs\.github\.io/, (route) => {
    const url = route.request().url();
    requests.push(url);
    if (scenario === 'stub' && /tone@/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: TONE_STUB });
    if (scenario === 'stub' && /vexflow@/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: VEX_STUB });
    return route.abort();
  });
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`PAGEERROR: ${e.message}`));
  await page.goto(`${BASE}?debug&seed=4242${hash ? '#' + hash : ''}`);   // varsayılan: doğrudan Sınav bölümü
  await page.waitForFunction(() => window.__dbg && window.solfejLab);
  return { context, page, consoleMsgs, requests };
}
const snap = (page) => page.evaluate(() => {
  const d = window.__dbg, g = (id) => document.getElementById(id);
  return {
    state: d.state, q: d.session ? d.session.index : -1, note: d.exercise.index, nNotes: d.exercise.notes.length,
    status: g('statusLine').textContent, alert: g('alert').hidden ? '' : g('alert').textContent, notice: g('notice').hidden ? '' : g('notice').textContent,
    engine: g('engineChipText').textContent, det: g('detChip').textContent, mic: g('micChipText').textContent,
    names: [...document.querySelectorAll('.note .name')].map((n) => n.textContent).join(' '),
    noteStates: [...document.querySelectorAll('.note')].map((n) => n.dataset.state).join(','),
  };
});
/** Bölüme git (adres çubuğu → menüdeki gibi) */
async function go(page, key) { await page.evaluate((k) => { location.hash = k; }, key); await page.waitForFunction((k) => !document.querySelector(`main > .section[data-sec="${k}"]`)?.hidden || k === 'kendi-sinavim', key); }
async function waitFor(page, fn, arg, timeout = 30000) { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); }

// ═══ SENARYO A: CDN'ler kapalı → yedek ses (sentez) + YIN; tam sınav ═══
if (run('A')) {
  log('A) çevrimdışı CDN senaryosu');
  const { context, page, consoleMsgs, requests } = await openPage('offline', FAST);
  await page.waitForFunction(() => window.__dbg.piano.state === 'failed', null, { timeout: 20000 });
  let s = await snap(page);
  log('başlangıç:', JSON.stringify(s));
  assert.equal(s.state, 'IDLE');
  assert.match(s.engine, /sentez/);
  assert.match(await page.textContent('#examInfo'), /15 soru · 5 tek ses, 5 iki ses, 5 üç ses/);
  assert.match(await page.textContent('#subLine'), /±20 sent içinde 0,25 saniye/);
  await page.screenshot({ path: `${OUT}/e2e-1-idle.png`, fullPage: true });

  // Şarkıcı senaryosu: soru 2 (index 1) oktav aşağı; soru 4 (index 3) sessiz → geç; soru 7 (index 6) ikinci seste
  // önce ilk sesi tutar (kilit testi); soru 9 (index 8) bir kez tekrar çalınır.
  await page.evaluate(() => { const S = window.__singer; S.octave[1] = -1; S.silent.add(3); S.wrongFirst[6] = { note: 1, ms: 700 }; });
  await page.click('#startBtn');
  log('▶ Teste Başla');
  const seen = new Set();
  let midShot = false;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    s = await snap(page);
    if (s.alert) throw new Error('UYARI: ' + s.alert);
    const key = `${s.state}|${s.q}|${s.note}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (s.state === 'PLAYING' && s.note === 0) log(`soru ${s.q + 1}: ${s.nNotes} ses · kutular "${s.names}"`);
    }
    if (s.state === 'LISTENING' && s.q === 3 && !seen.has('skip')) {
      await page.waitForTimeout(1200);
      seen.add('skip');
      assert.equal(await page.isDisabled('#skipBtn'), false);
      await page.click('#skipBtn');
      log('soru 4: sessiz → ⏭ Soruyu Geç');
    }
    if (s.state === 'LISTENING' && s.q === 8 && !seen.has('replay')) {
      seen.add('replay');
      await page.click('#examReplayBtn');
      log('soru 9: ↻ Tekrar Çal');
    }
    if (!midShot && s.state === 'LISTENING' && s.q === 10 && s.note === 1) {
      await page.waitForTimeout(260);
      midShot = true;
      await page.screenshot({ path: `${OUT}/e2e-2-mid-question.png`, fullPage: true });
      const tunerText = await page.evaluate(() => ({ cents: document.getElementById('centsVal').textContent, zone: document.getElementById('tuner').dataset.zone, sustain: document.getElementById('sustainText').textContent, pts: 0 }));
      log('soru 11 ikinci ses sırasında ibre:', JSON.stringify(tunerText));
    }
    if (s.state === 'SUMMARY') break;
    await page.waitForTimeout(40);
  }
  assert.equal(s.state, 'SUMMARY', 'sınav bitmeliydi');
  log('test bitti');

  const R = await page.evaluate(() => {
    const d = window.__dbg, sess = d.session, diag = d.diag;
    return {
      statuses: sess.results.map((r) => r.status),
      replays: sess.results.map((r) => r.replays),
      kinds: sess.questions.map((q) => q.kind),
      types: sess.questions.map((q) => q.type.id),
      titles: sess.questions.map((q) => q.title),
      q7note2: sess.results[6].noteResults[1].timeMs,
      q2: sess.results[1].noteResults.map((n) => ({ v: n.verified, near: n.near.n, bias: n.near.n ? n.near.sum / n.near.n : null })),
      score: diag.score, tendency: diag.overall.tendency, bias: diag.overall.biasCents, hardest: diag.hardest,
      byType: Object.fromEntries(Object.entries(diag.byType).map(([k, t]) => [k, { acc: t.accuracy, time: Math.round(t.meanTimeMs), bias: +t.biasCents.toFixed(1), diff: +t.difficulty.toFixed(2), rep: t.replaysPerQuestion }])),
      messages: diag.messages,
      history: JSON.parse(localStorage.getItem('solfejlab.history.v1') || '[]'),
      summaryVisible: !document.getElementById('summaryPanel').hidden,
      rows: document.querySelectorAll('#sumRows tr:not(.sub-row)').length, subRows: document.querySelectorAll('#sumRows tr.sub-row').length,
      inversions: sess.questions.filter((q) => q.kind === 'triple').map((q) => q.inversion),
      sumScore: document.getElementById('sumScore').textContent, sumTendency: document.getElementById('sumTendency').textContent,
      sumHardest: document.getElementById('sumHardest').textContent, segs: [...document.querySelectorAll('.seg')].map((x) => x.dataset.s).join(','),
      historyItems: document.querySelectorAll('#historyList li').length, chartBars: document.querySelectorAll('#historyChart .hc-bar').length,
    };
  });
  log('sorular:', R.types.join(' '));
  log('durumlar:', R.statuses.join(' '));
  log('teşhis:', JSON.stringify({ score: R.score, tendency: R.tendency, bias: R.bias?.toFixed(2), hardest: R.hardest, byType: R.byType }));
  log('yorumlar:\n   - ' + R.messages.join('\n   - '));
  assert.deepEqual(R.kinds, [...Array(5).fill('single'), ...Array(5).fill('double'), ...Array(5).fill('triple')]);
  assert.equal(R.statuses.filter((x) => x === 'done').length, 14);
  assert.equal(R.statuses[3], 'skipped');
  assert.ok(R.q2.every((n) => n.v), 'oktav aşağıdan söylenen soru doğrulanmalı');
  assert.ok(R.q7note2 >= 700, `kilit: yanlış ses tutulurken doğrulanmamalı (süre ${R.q7note2} ms)`);
  assert.equal(R.replays[8], 1);
  assert.equal(R.tendency, 'sharp');
  assert.ok(R.bias > 5 && R.bias < 13, `eğilim ≈ +9 sent olmalı: ${R.bias}`);
  assert.equal(R.score, 93.3);
  assert.equal(R.history.length, 1);
  assert.equal(R.history[0].score, 93.3);
  assert.equal(R.history[0].seed, 4242);
  assert.ok(R.summaryVisible && R.rows === 3, 'teşhis ekranı 3 ana satır');
  log('üç ses durumları:', R.inversions.join(' '), '· alt satır', R.subRows);
  assert.equal(R.subRows, new Set(R.inversions).size, 'üç ses: her durum için bir alt satır');
  assert.ok(R.titles.filter((t, i) => R.kinds[i] === 'triple').some((t) => /çevrim/.test(t)), 'seed 4242: en az bir çevrim');
  assert.equal(R.historyItems, 1);
  assert.equal(R.chartBars, 1);
  log('teşhis ekranı:', R.sumScore, '|', R.sumTendency, '|', R.sumHardest, '| şerit:', R.segs);
  await page.screenshot({ path: `${OUT}/e2e-3-summary.png`, fullPage: true });
  const sum = await page.$('#summaryPanel');
  await sum.screenshot({ path: `${OUT}/e2e-3b-summary-panel.png` });

  // Aynı tohum (seed) → aynı sorular (öğretmen aynı seti paylaşabilir)
  const same = await page.evaluate(() => JSON.stringify(window.solfejLab.generateSession(4242).map((q) => q.title)));
  assert.equal(same, JSON.stringify(R.titles));

  // ── Ayarlar paneli: tolerans 15, uygula → CONFIG + başlık + çip + localStorage ──
  await go(page, 'ayarlar');
  await page.fill('#set-TOLERANCE_CENTS', '15');
  await page.fill('#set-SUSTAIN_TIME_MS', '400');
  await page.uncheck('#settingsForm [data-path="INTERVAL_RULES.POOL"] input[value="A4"]');
  await page.click('#applySettings');
  const afterApply = await page.evaluate(() => ({
    tol: window.solfejLab.CONFIG.TOLERANCE_CENTS, sus: window.solfejLab.CONFIG.SUSTAIN_TIME_MS, pool: window.solfejLab.CONFIG.INTERVAL_RULES.POOL.join(','),
    msg: document.getElementById('settingsMsg').textContent, chip: !document.getElementById('cfgChip').hidden,
    stored: localStorage.getItem('solfejlab.config.v1'), sub: document.getElementById('subLine').textContent,
    ticks: [...document.querySelectorAll('#ticks .tick')].map((t) => t.textContent).join(' '),
  }));
  log('ayar uygulandı:', JSON.stringify(afterApply));
  assert.equal(afterApply.tol, 15);
  assert.equal(afterApply.sus, 400);
  assert.ok(!afterApply.pool.includes('A4'));
  assert.ok(afterApply.chip);
  assert.match(afterApply.sub, /±15 sent içinde 0,40 saniye/);
  assert.match(afterApply.ticks, /−15/);
  await page.screenshot({ path: `${OUT}/e2e-4-settings.png`, fullPage: true });
  // Geçersiz: tolerans > uyarı bandı → reddedilmeli
  await page.fill('#set-TOLERANCE_CENTS', '60');
  await page.click('#applySettings');
  const rej = await page.evaluate(() => ({ msg: document.getElementById('settingsMsg').textContent, err: document.getElementById('settingsMsg').classList.contains('err'), tol: window.solfejLab.CONFIG.TOLERANCE_CENTS }));
  log('geçersiz ayar:', JSON.stringify(rej));
  assert.ok(rej.err && rej.tol === 15);
  // JSON: dar register → reddedilmeli; bozuk JSON → hata
  await page.click('#settingsPanel [data-tab="adv"].tab');   // JSON: Gelişmiş sekmesi
  await page.fill('#jsonArea', '{"REGISTER":{"minMidi":60,"maxMidi":64}}');
  await page.click('#jsonApply');
  assert.match(await page.textContent('#settingsMsg'), /çok dar|Uygulanmadı/);
  await page.fill('#jsonArea', '{bozuk');
  await page.click('#jsonApply');
  assert.match(await page.textContent('#settingsMsg'), /JSON okunamadı/);
  // Ön ayar "Sıkı" → forma yüklenir → uygula
  await page.click('#settingsPanel [data-tab="std"].tab');
  await page.selectOption('#presetSelect', 'siki');
  await page.click('#applySettings');
  assert.equal(await page.evaluate(() => window.solfejLab.CONFIG.TOLERANCE_CENTS), 10);
  // Varsayılana dön
  await page.click('#resetSettings');
  const reset = await page.evaluate(() => ({ tol: window.solfejLab.CONFIG.TOLERANCE_CENTS, stored: localStorage.getItem('solfejlab.config.v1'), chip: !document.getElementById('cfgChip').hidden, json: document.getElementById('jsonArea').value }));
  log('varsayılana dönüldü:', JSON.stringify(reset));
  assert.equal(reset.tol, 20);
  assert.equal(reset.stored, null);
  assert.equal(reset.chip, false);

  // ── Porte görünümü varsayılan açık; ayrı VexFlow paneli varsayılan gizli ──
  await go(page, 'sinav');
  assert.equal(await page.evaluate(() => window.__dbg.viewMode), 'staff+graph', 'görünüm varsayılanı Porte + grafik');
  assert.equal(await page.isHidden('#staffPanel'), true, 'VexFlow paneli varsayılan gizli');
  // ── VexFlow paneli açılır ama yüklenemez → anlaşılır mesaj, uygulama çalışmaya devam eder ──
  await page.evaluate(() => window.solfejLab.setConfig({ UI: { VEXFLOW_PANEL: true } }));
  await page.waitForFunction(() => /yüklenemedi/.test(document.getElementById('staffMsg').textContent), null, { timeout: 20000 });
  log('porte (CDN kapalı):', await page.textContent('#staffMsg'));

  // ── Yeniden yükleme: geçmiş korunur ──
  await page.reload();
  await page.waitForFunction(() => window.__dbg);
  const hist = await page.evaluate(() => ({ items: document.querySelectorAll('#historyList li').length, text: document.querySelector('#historyList li')?.textContent, bars: document.querySelectorAll('#historyChart .hc-bar').length, staffOn: !document.getElementById('staffPanel').hidden }));
  log('yeniden yükleme sonrası geçmiş:', JSON.stringify(hist));
  assert.equal(hist.items, 1);
  assert.equal(hist.bars, 1);
  assert.ok(hist.staffOn, '"Portede göster" tercihi korunmalı');

  // ── Serbest çalışma: E♭ majör, oktav aşağıdan söyleme ──
  await go(page, 'serbest');
  await page.selectOption('#rootSelect', '5');           // E♭
  await page.selectOption('#octaveSelect', '4');
  await page.selectOption('#typeSelect', 'major');
  // Akor seçilince "Durum" görünür: Mi♭ majör 1. çevrim → Sol–Si♭–Mi♭ (alttan yukarı); sonra temel duruma dön
  assert.equal(await page.isVisible('#inversionField'), true);
  await page.selectOption('#inversionSelect', '1');
  assert.equal((await snap(page)).names, 'G B♭ E♭');
  assert.match(await page.textContent('#exTitle'), /1\. çevrim \(6\)/);
  await page.selectOption('#inversionSelect', '0');
  await page.evaluate(() => { window.__singer.practiceOctave = -1; });
  await page.click('#playBtn');
  await waitFor(page, () => window.__dbg.state === 'COMPLETE', null, 20000);
  const pr = await snap(page);
  log('serbest çalışma:', pr.state, '|', pr.names, '|', pr.noteStates, '|', pr.status);
  assert.equal(pr.names, 'E♭ G B♭');
  assert.equal(pr.noteStates, 'done,done,done');
  await page.screenshot({ path: `${OUT}/e2e-5-practice.png`, fullPage: true });

  const cdn = [...new Set(requests.map((u) => new URL(u).host + new URL(u).pathname.split('/').slice(0, 3).join('/')))];
  log('CDN istekleri (engellendi):', cdn.join(' · '));
  const unexpected = consoleMsgs.filter((m) => !/ERR_FAILED|Failed to load resource|yüklenemedi|piyano|Tone\.js|VexFlow|AudioContext was not allowed|net::/.test(m));
  log(`konsol: ${consoleMsgs.length} uyarı/hata, beklenmeyen ${unexpected.length}`);
  unexpected.forEach((m) => log('   ', m.slice(0, 220)));
  assert.equal(unexpected.length, 0);
  await context.close();
}

// ═══ SENARYO B: Tone.js ve VexFlow taklitleri → piyano yolu + porte çizim kodu ═══
if (run('B')) {
  log('B) taklit kütüphane senaryosu (Tone.js + VexFlow arayüzü)');
  const { context, page, consoleMsgs } = await openPage('stub', { ...FAST, UI: { VEXFLOW_PANEL: true }, QUESTION_COUNTS: { single: 1, double: 1, triple: 2 }, CHORD_RULES: { ALTERED_CHANCE: 1 } });
  await page.waitForFunction(() => window.__dbg.piano.state === 'ready', null, { timeout: 20000 });
  assert.match(await page.textContent('#engineChipText'), /piyano/);
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 60000);
  const B = await page.evaluate(() => ({
    tone: window.__toneCalls, vex: window.__vexCalls,
    statuses: window.__dbg.session.results.map((r) => r.status),
    types: window.__dbg.session.questions.map((q) => q.type.id + ':' + q.notes.map((n) => n.fullName).join('-')),
    staffMsg: document.getElementById('staffMsg').textContent, staffSvg: !!document.querySelector('#staff svg'),
  }));
  const sampler = B.tone.find((c) => c[0] === 'Sampler');
  const tars = B.tone.filter((c) => c[0] === 'tar');
  log('Tone çağrıları: setContext(native AudioContext)=', B.tone.find((c) => c[0] === 'setContext')?.[1], '· örnekler', sampler[1].join(','), '· çalım', tars.length, 'kez · ses sayıları', tars.map((t) => t[1].length).join(','));
  assert.equal(B.tone.find((c) => c[0] === 'setContext')[1], true);
  assert.deepEqual(sampler[1], ['A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5']);
  assert.equal(sampler[2], 'https://tonejs.github.io/audio/salamander/');
  assert.deepEqual(tars.map((t) => t[1].length), [1, 2, 3, 3]);
  assert.ok(tars.every((t) => t[1].every((f) => f > 120 && f < 540) && t[2] === 0.5 && typeof t[3] === 'number' && t[4] === 0.7));
  log('sorular:', B.types.join(' | '), '· durumlar', B.statuses.join(','));
  assert.ok(B.types.slice(2).some((t) => /^(augmented|diminished)/.test(t)), 'ALTERED_CHANCE=1 → her sette 1 artmış/eksilmiş');
  const accs = B.vex.filter((c) => c[0] === 'acc'), notesV = B.vex.filter((c) => c[0] === 'StaveNote'), styles = B.vex.filter((c) => c[0] === 'style');
  log('VexFlow çağrıları: nota', notesV.length, '· değiştirici', accs.length, '· renk', styles.length, '· son nota', JSON.stringify(notesV.at(-1)), '· bağlayıcı', [...new Set(B.vex.filter((c) => c[0] === 'conn').map((c) => c[1]))].join(','));
  assert.ok(B.staffSvg && notesV.length > 0);
  assert.ok(B.vex.some((c) => c[0] === 'Stave' && c[1] === 'bass') && B.vex.some((c) => c[0] === 'Stave' && c[1] === 'treble'));
  await page.screenshot({ path: `${OUT}/e2e-6-stub-staff.png`, fullPage: true });
  const unexpected = consoleMsgs.filter((m) => !/ERR_FAILED|Failed to load resource|AudioContext was not allowed|net::/.test(m));
  unexpected.forEach((m) => log('   ', m.slice(0, 220)));
  assert.equal(unexpected.length, 0);
  await context.close();
}

// ═══ SENARYO C: sınav provası (canlı geri bildirim kapalı) + soru süre sınırı ═══
if (run('C')) {
  log('C) sınav provası + süre sınırı');
  const { context, page, consoleMsgs } = await openPage('offline', {
    ...FAST, QUESTION_COUNTS: { single: 1, double: 1, triple: 1 },
    EXAM: { ...FAST.EXAM, LIVE_FEEDBACK: false, REVEAL_NOTE_NAMES: 'end', QUESTION_TIME_LIMIT_S: 2 },
  });
  await page.evaluate(() => { window.__singer.silent.add(1); });
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING' && window.__dbg.session.index === 0, null, 15000);
  await page.waitForTimeout(150);
  const blind = await page.evaluate(() => ({ names: [...document.querySelectorAll('.note .name')].map((n) => n.textContent).join(' '), target: document.getElementById('targetName').textContent, cents: document.getElementById('centsVal').textContent, timer: document.getElementById('progressTimer').textContent }));
  log('körlemesine:', JSON.stringify(blind));
  assert.equal(blind.names, '?');
  assert.equal(blind.cents, '—');
  assert.match(blind.timer, /kalan \d sn/);
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 30000);
  const C = await page.evaluate(() => ({ statuses: window.__dbg.session.results.map((r) => r.status), reasons: window.__dbg.session.results.map((r) => r.endReason), score: window.__dbg.diag.score }));
  log('durumlar:', C.statuses.join(','), 'nedenler:', C.reasons.join(','), 'puan:', C.score);
  assert.deepEqual(C.statuses, ['done', 'timeout', 'done']);
  assert.equal(C.score, 66.7);
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO D: dar ekran (390 px) — yatay taşma yok ═══
if (run('D')) {
  log('D) telefon genişliği');
  const { context, page } = await openPage('offline', FAST, { width: 390, height: 1600 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log('yatay taşma (px):', overflow);
  assert.ok(overflow <= 0, `yatay taşma ${overflow}px`);
  await go(page, 'ayarlar');
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow2 <= 0, `ayarlar açıkken yatay taşma ${overflow2}px`);
  await page.screenshot({ path: `${OUT}/e2e-7-mobile.png`, fullPage: true });
  // Modüller: her dosya bir kez yüklenir (giriş betiği ile import map adresi aynı → app.js iki kez çalışmaz)
  const mods = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname + new URL(r.name).search).filter((u) => /\/(js|css)\//.test(u)));
  const names = mods.map((u) => u.split('/').pop());
  log('yüklenen modüller:', names.join(' '));
  assert.equal(new Set(names).size, names.length, 'her dosya bir kez yüklenmeli');
  const jsCount = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).length;
  assert.equal(names.length, jsCount + 1, 'her modül + style.css');
  assert.ok(names.every((n) => /\?v=[\w.-]+$/.test(n)), 'her adreste sürüm etiketi olmalı');
  await context.close();
  // file:// ile açılırsa modüller yüklenemez → "npm run serve" uyarısı
  const fctx = await browser.newContext();
  const fpage = await fctx.newPage();
  await fpage.goto(new URL('../index.html', import.meta.url).href);
  await fpage.waitForTimeout(300);
  const warn = await fpage.evaluate(() => ({ hidden: document.getElementById('alert').hidden, text: document.getElementById('alert').textContent }));
  log('file:// uyarısı:', warn.text.slice(0, 70) + '…');
  assert.ok(!warn.hidden && /npm run serve/.test(warn.text));
  await fctx.close();
}


// ═══ SENARYO E: zorlanan şarkıcı (−12 sent pes, oktav aşağı, üç seste geç tepki) + oktav aralığı + yarıda bitirme ═══
if (run('E')) {
  log('E) zorlanan şarkıcı + oktav aralığı + yarıda bitirme');
  const { context, page, consoleMsgs } = await openPage('offline', { ...FAST, QUESTION_COUNTS: { single: 2, double: 2, triple: 2 }, INTERVAL_RULES: { POOL: ['P8', 'M3'] } });
  await page.evaluate(() => { const S = window.__singer; S.bias = -12; for (let q = 0; q < 6; q++) S.octave[q] = -1; S.delay[4] = 1800; S.silent.add(5); });
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING' && window.__dbg.session.index === 5, null, 40000);
  await page.waitForTimeout(800);
  await page.click('#endBtn');
  log('soru 6: ■ Testi Bitir');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 10000);
  const E = await page.evaluate(() => {
    const d = window.__dbg, g = (id) => document.getElementById(id).textContent;
    return {
      types: d.session.questions.map((q) => q.type.id + ':' + q.notes.map((n) => n.fullName).join('-')),
      statuses: d.session.results.map((r) => r.status), aborted: d.session.aborted,
      score: d.diag.score, tendency: d.diag.overall.tendency, bias: d.diag.overall.biasCents, hardest: d.diag.hardest,
      diffs: Object.fromEntries(Object.entries(d.diag.byType).map(([k, t]) => [k, +t.difficulty.toFixed(2)])),
      meta: g('sumMeta'), hard: g('sumHardest'), why: g('sumHardestWhy'), tend: g('sumTendency'),
      advice: [...document.querySelectorAll('#sumAdvice li')].map((li) => li.textContent),
      hist: JSON.parse(localStorage.getItem('solfejlab.history.v1') || '[]').map((h) => ({ complete: h.complete, answered: h.answered, total: h.total, score: h.score })),
      histText: document.querySelector('#historyList li')?.textContent,
    };
  });
  log('sorular:', E.types.join(' | '));
  log('durumlar:', E.statuses.join(','), '· yarıda:', E.aborted, '· puan', E.score, '· eğilim', E.tendency, E.bias?.toFixed(1), '· zorlanma', JSON.stringify(E.diffs));
  log('teşhis kutuları:', E.meta, '|', E.hard, '|', E.why, '|', E.tend);
  log('yorumlar:\n   - ' + E.advice.join('\n   - '));
  log('geçmiş:', JSON.stringify(E.hist), '|', E.histText);
  assert.ok(E.types.some((t) => t.startsWith('P8:')), 'oktav aralığı sorusu olmalı');
  assert.deepEqual(E.statuses, ['done', 'done', 'done', 'done', 'done', 'skipped']);
  assert.equal(E.aborted, false === true ? false : true);
  assert.equal(E.tendency, 'flat');
  assert.ok(E.bias < -8 && E.bias > -16);
  assert.equal(E.hardest, 'triple');
  assert.ok(E.diffs.triple >= 0.3, 'üç ses belirgin zorlanma');
  assert.match(E.hard, /Üç ses/);
  assert.match(E.meta, /yarıda bitirildi/);
  assert.deepEqual(E.hist, [{ complete: false, answered: 6, total: 6, score: 83.3 }]);
  await (await page.$('#summaryPanel')).screenshot({ path: `${OUT}/e2e-8-struggling-summary.png` });
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO F: serbest çalışma · 6 sn boyunca 60 sent pes, sonra düzeltme → kırmızıdan yeşile ═══
if (run('F')) {
  log('F) serbest çalışma: 6 sn −60 sent, sonra düzeltme');
  const { context, page, consoleMsgs } = await openPage('offline', FAST);
  await go(page, 'serbest');
  await page.selectOption('#rootSelect', '0');            // Do
  await page.selectOption('#octaveSelect', '4');
  await page.selectOption('#typeSelect', 'single');
  const staffOn = (await page.evaluate(() => window.__dbg.viewMode)) !== 'graph';
  assert.ok(staffOn, 'serbest çalışmada porte görünümü açık (varsayılan Porte + grafik)');
  await page.evaluate(() => { const S = window.__singer; S.bias = -60; S.jitter = 2; });
  await page.click('#playBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  const t0 = Date.now();
  await page.waitForTimeout(5600);                         // 5 sn'lik yönlendirme aralığı dolsun
  const flat = await page.evaluate(() => ({
    state: window.__dbg.state, zone: document.getElementById('tuner').dataset.zone,
    zones: window.__dbg.contour.pts.filter((p) => Number.isFinite(p.s)).map((p) => p.z),
    gauge: ['vgAbove', 'vgTarget', 'vgBelow'].map((id) => document.getElementById(id).textContent).join(' / '),
    coachKey: document.getElementById('coachLine').dataset.key, coach: document.getElementById('coachLine').textContent,
  }));
  log('pes evre:', flat.state, '· bölge', flat.zone, '· gösterge', flat.gauge, '· kare', flat.zones.length);
  log('yönlendirme:', flat.coachKey, '·', flat.coach);
  assert.equal(flat.coachKey, 'low', '5 sn sonunda "pes" yönlendirmesi');
  assert.match(flat.coach, /↑/, 'pes → yukarı oku');
  assert.equal(flat.state, 'LISTENING', '−60 sentte doğrulanmamalı');
  assert.equal(flat.zone, 'bad');
  // Sanal şarkıcının osilatörü başta 440 Hz'den hedefe kayarken birkaç kare yeşilden geçebilir → %95 yeterli
  const badShare = flat.zones.filter((z) => z === 'bad').length / flat.zones.length;
  assert.ok(flat.zones.length > 50 && badShare >= 0.95, `çizgi kırmızı olmalı (kırmızı oranı ${badShare.toFixed(2)})`);
  assert.equal(flat.gauge, 'Do♯ / Do / Si');
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-9a-flat-red.png` });
  await page.waitForTimeout(Math.max(0, 6000 - (Date.now() - t0)));
  await page.evaluate(() => { window.__singer.bias = 3; });  // düzeltme
  await waitFor(page, () => window.__dbg.state === 'COMPLETE', null, 10000);
  const fixed = await page.evaluate(() => {
    const z = window.__dbg.contour.pts.filter((p) => Number.isFinite(p.s)).map((p) => p.z);
    const firstGreenAfterRed = z.findIndex((x, i) => x === 'perfect' && z.slice(0, i).filter((y) => y === 'bad').length > 50);
    return { redsBefore: z.slice(0, firstGreenAfterRed).filter((x) => x === 'bad').length, firstGreenAfterRed, last: z[z.length - 1], greens: z.filter((x) => x === 'perfect').length, coachKey: document.getElementById('coachLine').dataset.key };
  });
  assert.equal(fixed.coachKey, 'low', 'yönlendirme anlık değişmez; yeni sese geçene kadar kalır');
  log('düzeltme sonrası:', JSON.stringify(fixed));
  assert.ok(fixed.firstGreenAfterRed > 0 && fixed.redsBefore > 50, 'önce uzun bir kırmızı parça, sonra yeşil');
  assert.equal(fixed.last, 'perfect');
  assert.ok(fixed.greens >= 5, 'yeşil parça olmalı');
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-9b-corrected-green.png` });
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO G: arayüz adları — ayarlar grubu, sayfada düzenleme, kopyalama, kalıcılık ═══
if (run('G')) {
  log('G) arayüz adları: sayfada düzenleme');
  const { context, page, consoleMsgs } = await openPage('offline', FAST);
  await go(page, 'ayarlar');
  await page.click('#settingsPanel [data-tab="names"].tab');
  const fields = await page.evaluate(() => ({
    n: document.querySelectorAll('#settingsForm [data-kind="text"]').length,
    leaves: (function walk(o) { return Object.values(o).reduce((s, v) => s + (v && typeof v === 'object' ? walk(v) : 1), 0); })(window.solfejLab.defaults.TEXTS),
    start: document.getElementById('set-TEXTS-btnStart')?.value,
  }));
  log('ayarlardaki ad alanları:', fields.n, '/', fields.leaves);
  assert.equal(fields.n, fields.leaves, 'TEXTS\'teki her ad ayarlarda kendiliğinden çıkmalı');
  assert.equal(fields.start, '▶ Teste Başla');

  await page.check('#editNamesToggle', { force: true });
  assert.ok(await page.evaluate(() => document.body.classList.contains('edit-names')));
  assert.ok(await page.isVisible('#editBar'));
  await go(page, 'sinav');
  // Düğmeye tıklamak işlemi başlatmaz, düzenleyici açılır; Enter kaydeder
  await page.click('#startBtn');
  await page.waitForSelector('.name-editor');
  assert.equal(await page.evaluate(() => window.__dbg.state), 'IDLE', 'düzenleme modunda test başlamamalı');
  await page.fill('.name-editor', 'Başlat');
  await page.screenshot({ path: `${OUT}/e2e-10-edit-names.png` });
  await page.press('.name-editor', 'Enter');
  // Devre dışı düğme de düzenlenebilir; Esc vazgeçer
  await page.click('#skipBtn');
  await page.fill('.name-editor', 'Bunu kaydetme');
  await page.press('.name-editor', 'Escape');
  // Yeni panel başlığı
  await page.click('#tuner .panel-head h2');
  await page.fill('.name-editor', 'Akort aleti');
  await page.press('.name-editor', 'Enter');
  // Boş ad reddedilir, menü açılmaz
  await page.click('#menuBtn [data-text]');
  await page.fill('.name-editor', '   ');
  await page.press('.name-editor', 'Enter');
  const G1 = await page.evaluate(() => ({
    texts: window.solfejLab.CONFIG.TEXTS, start: document.getElementById('startBtn').textContent,
    skip: document.getElementById('skipBtn').textContent, tuner: document.querySelector('#tuner .panel-head h2').textContent,
    status: document.getElementById('statusLine').textContent, notice: document.getElementById('notice').textContent,
    hash: location.hash, menuOpen: !document.getElementById('menuList').hidden, state: window.__dbg.state,
    stored: JSON.parse(localStorage.getItem('solfejlab.config.v1') || '{}'),
  }));
  log('düzenleme sonrası:', G1.start, '|', G1.skip, '|', G1.tuner, '|', G1.status.slice(0, 40), '| uyarı:', G1.notice);
  assert.equal(G1.start, 'Başlat');
  assert.equal(G1.skip, '⏭ Soruyu Geç', 'Esc vazgeçmeli');
  assert.equal(G1.tuner, 'Akort aleti');
  assert.match(G1.status, /^“Başlat” düğmesine basın/, 'durum metnindeki düğme adı da değişmeli');
  assert.match(G1.notice, /boş olamaz/);
  assert.equal(G1.texts.btnMenu, 'Menü');
  assert.equal(G1.hash, '#sinav', 'bölüm değişmemeli');
  assert.equal(G1.menuOpen, false, 'düzenleme modunda menü açılmamalı');
  assert.equal(G1.state, 'IDLE');
  assert.deepEqual(G1.stored.TEXTS, { btnStart: 'Başlat', panelTuner: 'Akort aleti' });
  // Adları kopyala → JSON (pano yoksa JSON kutusuna)
  await page.click('#editCopyBtn');
  await page.waitForFunction(() => /ad panoya|kutusuna/.test(document.getElementById('notice').textContent));
  const copied = await page.evaluate(async () => {
    const n = document.getElementById('notice').textContent;
    if (/kutusuna/.test(n)) return JSON.parse(document.getElementById('jsonArea').value);
    try { return JSON.parse(await navigator.clipboard.readText()); } catch { return { note: n }; }
  });
  log('kopyalanan:', JSON.stringify(copied));
  if (copied.TEXTS) assert.deepEqual(copied, { TEXTS: { btnStart: 'Başlat', panelTuner: 'Akort aleti' } });
  // Bitir → düğmelerin gerçek durumu geri gelir; yeniden yüklemede adlar korunur
  await page.click('#editDoneBtn');
  assert.equal(await page.isDisabled('#skipBtn'), true);
  assert.equal(await page.isHidden('#editBar'), true);
  await page.reload();
  await page.waitForFunction(() => window.__dbg);
  assert.equal(await page.textContent('#startBtn'), 'Başlat');
  assert.equal(await page.textContent('#tuner .panel-head h2'), 'Akort aleti');
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO H: bölümler ve menü · adres çubuğu / geri tuşu · son bölüm · Duraklat / Devam ═══
if (run('H')) {
  log('H) bölümler, menü, duraklatma');
  const { context, page, consoleMsgs } = await openPage('offline', FAST, { hash: '' });
  const visible = () => page.evaluate(() => [...document.querySelectorAll('main > .section')].filter((s) => !s.hidden).map((s) => s.dataset.sec));
  const shown = (k) => page.waitForFunction((x) => !document.querySelector('main > .section[data-sec="' + x + '"]').hidden, k);
  // İlk açılış: Ana sayfa, adres #ana-sayfa; büyük kutucuklar
  assert.deepEqual(await visible(), ['ana-sayfa']);
  assert.equal(await page.evaluate(() => location.hash), '#ana-sayfa');
  assert.equal(await page.locator('.tile').count(), 4);
  await page.screenshot({ path: `${OUT}/e2e-11-home.png` });
  // Menü: aç → liste görünür; Esc kapatır; dışarı tıklama kapatır; seçince bölüm açılır ve menü kapanır
  await page.click('#menuBtn');
  assert.equal(await page.isVisible('#menuList'), true);
  assert.equal(await page.getAttribute('#menuBtn', 'aria-expanded'), 'true');
  await page.screenshot({ path: `${OUT}/e2e-12-menu.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#menuList'), true);
  await page.click('#menuBtn');
  await page.mouse.click(600, 700);
  assert.equal(await page.isHidden('#menuList'), true, 'dışarı tıklayınca kapanmalı');
  await page.click('#menuBtn');
  await page.click('#menuList a[data-sec="yardim"]');
  await shown('yardim');
  assert.deepEqual(await visible(), ['yardim']);
  assert.equal(await page.isHidden('#menuList'), true);
  // Kutucuk → Serbest çalışma; tarayıcının geri tuşu → Yardım
  await go(page, 'ana-sayfa');
  await page.click('.tile[href="#serbest"]');
  await shown('serbest');
  assert.deepEqual(await visible(), ['serbest']);
  assert.equal(await page.evaluate(() => !!document.querySelector('#practiceSlot #workspace')), true, 'çalışma alanı Serbest çalışmaya taşınmalı');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#ana-sayfa');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#yardim');
  await shown('yardim');
  assert.deepEqual(await visible(), ['yardim']);
  // "Özel ayarlar etkin" çipi Ayarlar bölümünü açar
  await page.evaluate(() => window.solfejLab.setConfig({ TOLERANCE_CENTS: 18 }));
  await page.click('#cfgChip');
  await shown('ayarlar');
  assert.deepEqual(await visible(), ['ayarlar']);
  await page.evaluate(() => window.solfejLab.resetConfig());
  // Sınav: başlat → dinlerken Duraklat → soru süresi durur, durum "Duraklatıldı" → Devam
  await go(page, 'sinav');
  assert.equal(await page.evaluate(() => !!document.querySelector('#examSlot #workspace')), true);
  await page.evaluate(() => { window.__singer.enabled = false; });
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  await page.waitForTimeout(300);
  await page.click('#examPauseBtn');
  const p1 = await page.evaluate(() => ({ paused: window.__dbg.paused, ms: window.__dbg.session.result.listenMs, status: document.getElementById('statusLine').textContent, label: document.getElementById('stateLabel').textContent, btn: document.getElementById('examPauseBtn').textContent }));
  await page.waitForTimeout(700);
  const ms2 = await page.evaluate(() => window.__dbg.session.result.listenMs);
  log('duraklatıldı:', JSON.stringify(p1), '→ 0,7 sn sonra listenMs', Math.round(ms2));
  assert.equal(p1.paused, true);
  assert.match(p1.status, /^Duraklatıldı/);
  assert.equal(p1.label, 'Duraklatıldı');
  assert.equal(p1.btn, '▶ Devam');
  assert.equal(ms2, p1.ms, 'duraklatılınca soru süresi durmalı');
  assert.equal(await page.isDisabled('#skipBtn'), true, 'duraklatılmışken geçme kapalı');
  await page.screenshot({ path: `${OUT}/e2e-13-paused.png` });
  await page.click('#examPauseBtn');
  await page.evaluate(() => { window.__singer.enabled = true; });
  await waitFor(page, () => !window.__dbg.paused && window.__dbg.session.index >= 1, null, 15000);
  log('devam: sıradaki soruya geçildi');
  // Sınav sürerken başka bölüme geçmek → kendiliğinden duraklar; Serbest çalışma uyarı gösterir; dönünce Devam ile sürer
  await page.evaluate(() => { window.__singer.enabled = false; });
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  await go(page, 'gecmis');
  assert.equal(await page.evaluate(() => window.__dbg.paused), true, 'bölüm değişince sınav duraklamalı');
  await go(page, 'serbest');
  assert.equal(await page.isVisible('#practiceBusy'), true);
  assert.equal(await page.isHidden('#practiceControls'), true);
  await go(page, 'sinav');
  assert.equal(await page.evaluate(() => window.__dbg.paused), true, 'geri dönünce kendiliğinden sürmemeli');
  await page.click('#examPauseBtn');
  assert.equal(await page.evaluate(() => window.__dbg.paused), false);
  await page.click('#endBtn');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 10000);
  assert.equal(await page.isVisible('#summaryPanel'), true, 'teşhis ekranı Sınav bölümünde');
  // Yeniden açılış: adreste bölüm yoksa son kullanılan bölüm açılır
  await go(page, 'gecmis');
  await page.goto(`${BASE}?debug`);
  await page.waitForFunction(() => window.__dbg);
  assert.deepEqual(await visible(), ['gecmis'], 'son kullanılan bölüm');
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO I: görünüm seçici (Porte · Porte + grafik · Grafik), bölüme göre hatırlama, sınavda "Porte" anahtarı, yönlendirme yazısı ═══
if (run('I')) {
  log('I) görünüm seçici ve yönlendirme yazısı');
  const { context, page, consoleMsgs } = await openPage('offline', FAST);
  const vm = () => page.evaluate(() => ({ mode: window.__dbg.viewMode, staff: window.__dbg.contour.staffMode, line: window.__dbg.contour.lineMode }));
  assert.deepEqual(await vm(), { mode: 'staff+graph', staff: true, line: true });
  // Sınavda "Porte": yalnız porte (akan çizgi yok); serbest çalışmada "Grafik"
  await page.click('#viewSeg [data-view="staff"]');
  assert.deepEqual(await vm(), { mode: 'staff', staff: true, line: false });
  assert.equal(await page.getAttribute('#viewSeg [data-view="staff"]', 'aria-pressed'), 'true');
  await go(page, 'serbest');
  assert.equal((await vm()).mode, 'staff+graph', 'serbest çalışmanın kendi seçimi');
  await page.click('#viewSeg [data-view="graph"]');
  assert.deepEqual(await vm(), { mode: 'graph', staff: false, line: true });
  assert.equal(await page.isVisible('.contour .ch-cents >> nth=0'), true, 'sent grafiği başlığı');
  await go(page, 'sinav');
  assert.equal((await vm()).mode, 'staff', 'sınav seçimi hatırlanmalı');
  // Yeniden yükleme: seçimler korunur (solfejlab.ui.v1)
  await page.reload();
  await page.waitForFunction(() => window.__dbg);
  assert.equal((await vm()).mode, 'staff');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('solfejlab.ui.v1')).viewMode);
  assert.deepEqual(stored, { exam: 'staff', practice: 'graph' });
  // Yalnız porte görünümünde dinlerken: canlı nota başı var, akan çizgi çizilmez
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  await page.waitForTimeout(500);
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-14-view-staff-only.png` });
  // Sınavda "Porte" kapalı: porte/grafik gizli, gösterge ve yönlendirme görünür
  assert.equal(await page.isVisible('#examStaffSwitch'), true);
  await page.uncheck('#examStaffToggle', { force: true });
  const off = await page.evaluate(() => ({ canvas: getComputedStyle(document.getElementById('contour')).display, gauge: !!document.querySelector('.vgauge').offsetParent, coach: !!document.getElementById('coachLine').offsetParent }));
  log('porte kapalı:', JSON.stringify(off));
  assert.deepEqual(off, { canvas: 'none', gauge: true, coach: true });
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-15-exam-staff-off.png` });
  await page.check('#examStaffToggle', { force: true });
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById('contour')).display), 'none');
  await page.click('#endBtn');
  // Serbest çalışmada "Porte" anahtarı görünmez
  await go(page, 'serbest');
  assert.equal(await page.isHidden('#examStaffSwitch'), true);
  // Yönlendirme yazısı: masaüstünde 20 px kalın; ayardan değişir; telefonda 2 px küçük
  const fs1 = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('coachLine')); document.getElementById('coachLine').classList.remove('idle'); const d = getComputedStyle(document.getElementById('coachLine')); return { size: d.fontSize, weight: d.fontWeight }; });
  assert.deepEqual(fs1, { size: '20px', weight: '700' });
  await page.evaluate(() => window.solfejLab.setConfig({ UI: { COACH_FONT_PX: 24 } }));
  assert.equal(await page.evaluate(() => { document.getElementById('coachLine').classList.remove('idle'); return getComputedStyle(document.getElementById('coachLine')).fontSize; }), '24px');
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => { document.getElementById('coachLine').classList.remove('idle'); return getComputedStyle(document.getElementById('coachLine')).fontSize; }), '22px');
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO J: Kendi sınavını hazırla — kompakt pencere, doğrulama, Sınavlarım, oturuma özel ayar, cevaplar, geçmişte ad ═══
if (run('J')) {
  log('J) kendi sınavını hazırla');
  const { context, page, consoleMsgs } = await openPage('offline', FAST, { hash: 'ana-sayfa' });
  await page.click('.tile[href="#kendi-sinavim"]');
  await page.waitForFunction(() => !document.getElementById('customExam').hidden);
  assert.equal(await page.getAttribute('#examTabs [data-etab="custom"]', 'aria-selected'), 'true');
  assert.equal(await page.isHidden('#workspace'), true, 'pencere tek ekranda: çalışma alanı gizli');
  assert.match(await page.textContent('.cx-sum'), /^15 soru · yaklaşık 8 dk$/);
  // Ad, sayılar (artı/eksi), aralık hızlı seçimi, akor ve durum çipleri, süre, nota adları, tolerans
  await page.fill('#cxName', 'Triton ve çevrimler');
  const minus = async (k, n) => { for (let i = 0; i < n; i++) await page.click(`.cx-count:has(#cxCount-${k}) .stepper button:first-child`); };
  await minus('single', 5);                                                           // 5 → 0 (sonra − düğmesi kapanır)
  assert.equal(await page.isDisabled('.cx-count:has(#cxCount-single) .stepper button:first-child'), true, '0 sınırında eksi kapalı');
  await page.click('.cx-count:has(#cxCount-single) .stepper button:last-child');     // 1
  await minus('double', 4);                                                           // 1
  await minus('triple', 3);                                                           // 2
  const quick = (txt) => page.click(`.cx-quick .cx-chip:text-is("${txt}")`);
  await quick('Hiçbiri');
  const blocked = await page.evaluate(() => ({ dis: document.getElementById('cxStart').disabled, err: document.querySelector('.cx-err').textContent }));
  log('aralık yokken:', JSON.stringify(blocked));
  assert.equal(blocked.dis, true);
  assert.match(blocked.err, /aralık seçilmemiş/);
  await quick('Triton');
  await page.click('.cx-chip[data-value="major"]');                                    // majörü kaldır → minör, artmış, eksilmiş
  await page.click('.cx-chip[data-value="augmented"]');
  await page.click('.cx-chip[data-value="root"]');                                     // yalnız çevrimler
  await page.click('.cx-chip:text-is("Sınav sonunda")');
  await page.click('.cx-chip:text-is("Sıkı ±10")');
  await page.click('.cx-chip:text-is("Ayrı ayrı")');
  const state = await page.evaluate(() => ({ sum: document.querySelector('.cx-sum').textContent, dis: document.getElementById('cxStart').disabled, err: document.querySelector('.cx-err').textContent }));
  log('özet:', JSON.stringify(state));
  assert.match(state.sum, /^4 soru · yaklaşık \d+ dk$/);
  assert.equal(state.dis, false);
  await page.screenshot({ path: `${OUT}/e2e-16-custom-builder.png`, fullPage: true });
  // Kaydet → Sınavlarım; yenile → durur; kopyala → 2; sil (iki tıklamayla) → 1
  await page.click('#cxSave');
  assert.equal(await page.locator('#cxList .cx-item').count(), 1);
  await page.reload();
  await page.waitForFunction(() => window.__dbg && !document.getElementById('customExam').hidden);
  assert.equal(await page.locator('#cxList .cx-item').count(), 1, 'solfejlab.exams.v1 korunmalı');
  await page.click('#cxList .cx-item >> nth=0 >> button:text-is("Kopyala")');
  assert.equal(await page.locator('#cxList .cx-item').count(), 2);
  const del = page.locator('#cxList .cx-item >> nth=1 >> button:text-is("Sil")');
  await del.click();
  await page.click('#cxList .cx-item >> nth=1 >> button:text-is("Silinsin mi?")');
  assert.equal(await page.locator('#cxList .cx-item').count(), 1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('solfejlab.exams.v1')));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Triton ve çevrimler');
  // Kayıtlı sınavı başlat → oturuma özel ayar (genel CONFIG değişmez); pencere gizlenir, sekmeler kilitlenir
  await page.evaluate(() => { const S = window.__singer; S.bias = 2; S.jitter = 2; });
  await page.click('#cxList .cx-item >> nth=0 >> button:text-is("▶ Başlat")');
  await waitFor(page, () => window.__dbg.session && window.__dbg.state === 'LISTENING', null, 15000);
  const run1 = await page.evaluate(() => {
    const s = window.__dbg.session;
    return { name: s.name, tol: s.cfg.TOLERANCE_CENTS, global: window.solfejLab.CONFIG.TOLERANCE_CENTS, reveal: s.cfg.EXAM.REVEAL_NOTE_NAMES, playback: s.cfg.EXAM.PLAYBACK,
      kinds: s.questions.map((q) => q.kind).join(','), triInv: s.questions.filter((q) => q.kind === 'triple').map((q) => q.inversion), types: s.questions.map((q) => q.type.id).join(','),
      tabsDisabled: document.querySelector('#examTabs [data-etab="std"]').disabled, builderHidden: document.getElementById('customExam').hidden, info: document.getElementById('examInfo').textContent,
      names: [...document.querySelectorAll('.note .name')].map((n) => n.textContent).join(' ') };
  });
  log('özel sınav:', JSON.stringify(run1));
  assert.equal(run1.name, 'Triton ve çevrimler');
  assert.equal(run1.tol, 10);
  assert.equal(run1.global, 20, 'genel CONFIG değişmemeli');
  assert.equal(run1.reveal, 'session');
  assert.equal(run1.playback, 'melodic');
  assert.equal(run1.kinds, 'single,double,triple,triple');
  assert.ok(run1.triInv.every((v) => v > 0), 'yalnız çevrimler');
  assert.ok(run1.types.split(',').slice(1, 2).every((t) => ['A4', 'd5'].includes(t)));
  assert.ok(run1.tabsDisabled && run1.builderHidden);
  assert.match(run1.info, /Triton ve çevrimler/);
  assert.equal(run1.names, '?', '"sınav sonunda": soru sırasında ad gizli');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 60000);
  const end = await page.evaluate(() => ({
    answersOpen: document.getElementById('sumAnswersWrap').open, answers: [...document.querySelectorAll('#sumAnswers li')].map((li) => li.textContent),
    hist: JSON.parse(localStorage.getItem('solfejlab.history.v1') || '[]').map((h) => h.name), histText: document.querySelector('#historyList li')?.textContent,
    gaugeTol: [...document.querySelectorAll('#ticks .tick')].map((t) => t.textContent).join(' '),
  }));
  log('teşhis:', JSON.stringify(end).slice(0, 300));
  assert.equal(end.answersOpen, true);
  assert.equal(end.answers.length, 4);
  assert.ok(end.answers.some((a) => /çevrim/.test(a)), 'cevaplarda çevrim');
  assert.deepEqual(end.hist, ['Triton ve çevrimler']);
  assert.match(end.gaugeTol, /−10/, 'gösterge bantları oturumun toleransıyla');
  await page.screenshot({ path: `${OUT}/e2e-17-custom-summary.png`, fullPage: true });
  // "Yeni Test" aynı özel sınavı yeniden başlatır
  await page.click('#sumNewBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  assert.equal(await page.evaluate(() => window.__dbg.session.name), 'Triton ve çevrimler');
  await page.click('#endBtn');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 10000);
  // Standart sınav sekmesine dönünce genel ayar geçerli (gösterge ±20)
  await go(page, 'sinav');
  await page.click('#startBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  const std = await page.evaluate(() => ({ name: window.__dbg.session.name, tol: window.__dbg.session.cfg.TOLERANCE_CENTS, n: window.__dbg.session.questions.length }));
  assert.deepEqual(std, { name: null, tol: 20, n: 15 });
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO K: serbest çalışma alıştırma dizileri — 7 iki ses (her sorudan sonra cevap), durdurana kadar yalnız çevrimler ═══
if (run('K')) {
  log('K) alıştırma dizileri');
  const { context, page, consoleMsgs } = await openPage('offline', FAST, { hash: 'serbest' });
  await page.click('#practiceTabs [data-ptab="drill"]');
  assert.equal(await page.isVisible('#drillSetup'), true);
  assert.equal(await page.isHidden('#singleFields'), true);
  // Rastgele 7 tane iki ses (varsayılan kurulum: iki ses, 7 soru, cevap her sorudan sonra)
  assert.equal(await page.textContent('#drCount'), '7');
  assert.equal(await page.getAttribute('#drillSetup .cx-chip[data-value="double"]', 'aria-pressed'), 'true');
  await page.evaluate(() => { const S = window.__singer; S.bias = 3; S.jitter = 2; S.enabled = false; });
  await page.click('#drillStartBtn');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  const during = await page.evaluate(() => ({ names: [...document.querySelectorAll('.note .name')].map((n) => n.textContent).join(' '), title: document.getElementById('exTitle').textContent, drill: !!window.__dbg.session.drill, n: window.__dbg.session.questions.length, kinds: [...new Set(window.__dbg.session.questions.map((q) => q.kind))].join() }));
  log('alıştırma soru 1:', JSON.stringify(during));
  assert.deepEqual(during, { names: '? ?', title: 'Alıştırma · soru 1/7 · İki ses', drill: true, n: 7, kinds: 'double' });
  // Nota kutusu ipucu: dinlerken tek sesi çalar (PLAYING), sonra aynı sesten dinleme sürer
  await page.click('.note >> nth=1', { force: true });
  assert.equal(await page.evaluate(() => window.__dbg.state), 'PLAYING');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 5000);
  await page.evaluate(() => { window.__singer.enabled = true; });
  await waitFor(page, () => window.__dbg.state === 'COMPLETE', null, 15000);
  const st1 = await page.textContent('#statusLine');
  log('soru 1 sonu:', st1);
  assert.match(st1, /^Bu soru: .+ ✓/);
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 60000);
  const r1 = await page.evaluate(() => ({ visible: !document.getElementById('drillResult').hidden, items: [...document.querySelectorAll('#drillList li')].map((li) => li.textContent), meta: document.getElementById('drillMeta').textContent, summaryHidden: document.getElementById('summaryPanel').hidden,
    hist: JSON.parse(localStorage.getItem('solfejlab.history.v1') || '[]').map((h) => ({ mode: h.mode, answered: h.answered, complete: h.complete })) }));
  log('sonuç:', r1.meta, '|', r1.items[0]);
  assert.equal(r1.visible, true);
  assert.equal(r1.items.length, 7);
  assert.ok(r1.items.every((t) => /✓ tam|kısmi|geçildi/.test(t) && /sn$/.test(t)));
  assert.match(r1.meta, /^7 soru · tam \d/);
  assert.equal(r1.summaryHidden, true, 'alıştırmada sınav teşhis ekranı açılmaz');
  assert.deepEqual(r1.hist, [{ mode: 'drill', answered: 7, complete: true }]);
  await page.screenshot({ path: `${OUT}/e2e-18-drill-result.png`, fullPage: true });
  // Ben durdurana kadar, yalnız çevrim akorları (major/minor), cevap gösterme
  await page.click('#drillSetup .cx-chip[data-value="double"]');
  await page.click('#drillSetup .cx-chip[data-value="triple"]');
  await page.click('#drillSetup .cx-chip[data-value="root"]');
  await page.click('#drUntil');
  await page.click('#drillSetup .cx-chip:text-is("Gösterme")');
  assert.equal(await page.textContent('#drCount'), '∞');
  await page.click('#drillStartBtn');
  await waitFor(page, () => window.__dbg.session && window.__dbg.session.index >= 9, null, 90000);
  const mid = await page.evaluate(() => ({ n: window.__dbg.session.questions.length, invs: [...new Set(window.__dbg.session.questions.map((q) => q.inversion))].sort().join(), kinds: [...new Set(window.__dbg.session.questions.map((q) => q.kind))].join(), names: [...document.querySelectorAll('.note .name')].map((n) => n.textContent).join(' '), progressHidden: document.getElementById('examProgress').hidden }));
  log('durdurana kadar:', JSON.stringify(mid));
  assert.ok(mid.n > 10, 'yeni parça eklenmeli');
  assert.equal(mid.invs, '1,2', 'yalnız çevrimler');
  assert.equal(mid.kinds, 'triple');
  assert.equal(mid.progressHidden, true);
  await page.click('#drillStopBtn');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 10000);
  const r2 = await page.evaluate(() => ({ items: [...document.querySelectorAll('#drillList li')].map((li) => li.textContent), hist: JSON.parse(localStorage.getItem('solfejlab.history.v1')).map((h) => ({ mode: h.mode, complete: h.complete, total: h.total, answered: h.answered })) }));
  log('durduruldu:', r2.items.length, 'soru ·', r2.items[0]);
  assert.ok(r2.items.length >= 9 && r2.items.every((t) => /çevrim/.test(t)));
  assert.deepEqual(r2.hist[1], { mode: 'drill', complete: true, total: r2.items.length, answered: r2.items.length });
  // Önceki testlerim: "Alıştırma" etiketi ve süzgeç
  await go(page, 'gecmis');
  assert.equal(await page.locator('#historyList li').count(), 2);
  assert.match(await page.textContent('#historyList li >> nth=0'), /Alıştırma/);
  await page.click('#historyFilter [data-hf="exam"]');
  assert.equal(await page.locator('#historyList li').count(), 0);
  await page.click('#historyFilter [data-hf="drill"]');
  assert.equal(await page.locator('#historyList li').count(), 2);
  // Tek soruya dönünce alıştırma kapanır; tek soru çalışır
  await go(page, 'serbest');
  await page.click('#practiceTabs [data-ptab="single"]');
  assert.equal(await page.evaluate(() => window.__dbg.session), null);
  assert.equal(await page.isHidden('#drillResult'), true);
  assert.equal(await page.isDisabled('#playBtn'), false);
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO L: klavye kısayolları ═══
if (run('L')) {
  log('L) klavye kısayolları');
  const { context, page, consoleMsgs } = await openPage('offline', FAST);
  const st = () => page.evaluate(() => ({ state: window.__dbg.state, q: window.__dbg.session?.index ?? -1, paused: window.__dbg.paused, replays: window.__dbg.session?.result?.replays ?? 0 }));
  await page.evaluate(() => { window.__singer.enabled = false; document.activeElement?.blur(); });
  // İpucu: düğmelerin üzerinde kısayol
  assert.equal(await page.getAttribute('#startBtn', 'data-sc'), 'Kısayol: Enter');
  assert.equal(await page.getAttribute('#examPauseBtn', 'data-sc'), 'Kısayol: Boşluk');
  // Enter → başlat; Boşluk → duraklat / devam (sayfa kaymaz); R → tekrar çal; N → geç
  await page.keyboard.press('Enter');
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(' ');
  assert.equal((await st()).paused, true);
  assert.equal(await page.evaluate(() => window.scrollY), y0, 'Boşluk sayfayı kaydırmamalı');
  await page.keyboard.press(' ');
  assert.equal((await st()).paused, false);
  await page.keyboard.press('r');
  await waitFor(page, () => window.__dbg.state === 'PLAYING', null, 3000);
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 5000);
  assert.equal((await st()).replays, 1);
  await page.keyboard.press('n');
  await waitFor(page, () => (window.__dbg.session?.index ?? 0) >= 1 && window.__dbg.state === 'LISTENING', null, 8000);
  log('kısayollarla:', JSON.stringify(await st()));
  // Odak bir düğmedeyken Enter düğmenin kendisini bir kez çalıştırır (kısayol ikinci kez çalışmaz)
  await page.focus('#examReplayBtn');
  await page.keyboard.press('Enter');
  await waitFor(page, () => window.__dbg.state === 'PLAYING', null, 3000);
  await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 5000);
  assert.equal((await st()).replays, 1, 'düğmede Enter tek işlem');
  await page.evaluate(() => document.activeElement.blur());
  // B: bir kez → uyarı; iki kez (2 sn içinde) → test biter
  await page.keyboard.press('b');
  assert.match(await page.textContent('#notice'), /tekrar basın/);
  assert.notEqual((await st()).state, 'SUMMARY');
  await page.keyboard.press('b');
  await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 5000);
  // V → görünüm değişir; O → oktav toleransı; P → sınav portesi
  const vm0 = await page.evaluate(() => window.__dbg.viewMode);
  await page.keyboard.press('v');
  assert.notEqual(await page.evaluate(() => window.__dbg.viewMode), vm0);
  const fold0 = await page.isChecked('#foldToggle');
  await page.keyboard.press('o');
  assert.equal(await page.isChecked('#foldToggle'), !fold0);
  await page.keyboard.press('o');
  await page.keyboard.press('p');
  assert.equal(await page.isChecked('#examStaffToggle'), false);
  await page.keyboard.press('p');
  // M → menü; Esc kapatır; 1–6 → bölümler (Türkçe Q/F'de rakamlar aynı)
  await page.keyboard.press('m');
  assert.equal(await page.isVisible('#menuList'), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#menuList'), true);
  await page.keyboard.press('4');
  await page.waitForFunction(() => location.hash === '#gecmis');
  await page.keyboard.press('3');
  await page.waitForFunction(() => location.hash === '#serbest');
  // ? → kısayol listesi (Esc kapatır)
  await page.keyboard.press('Shift+Slash');
  if (!(await page.evaluate(() => document.getElementById('shortcutHelp').open))) await page.keyboard.type('?');
  assert.equal(await page.evaluate(() => document.getElementById('shortcutHelp').open), true);
  const helpRows = await page.locator('#scHelpList dt').count();
  await page.screenshot({ path: `${OUT}/e2e-19-shortcut-help.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('shortcutHelp').open), false);
  assert.equal(helpRows, 17);
  // Yazı kutusunda kısayol çalışmaz
  await page.keyboard.press('2');
  await page.waitForFunction(() => location.hash === '#sinav');
  await page.click('#examTabs [data-etab="custom"]');
  await page.waitForFunction(() => !document.getElementById('customExam').hidden);
  await page.fill('#cxName', '');
  await page.type('#cxName', 'B1m');
  assert.equal(await page.inputValue('#cxName'), 'B1m');
  assert.equal(await page.evaluate(() => location.hash), '#kendi-sinavim', '"1" bölüm değiştirmemeli');
  // Ayarlar → Kısayollar: Tekrar çal'ı T yap (Değiştir → tuşa bas); N'ye atayınca çakışma uyarısı; varsayılana dön; kopyala
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('5');
  await page.waitForFunction(() => location.hash === '#ayarlar');
  await page.click('#settingsPanel [data-tab="keys"].tab');
  assert.equal(await page.isHidden('#settingsActions'), true);
  const row = (id) => `#shortcutsPanel .sc-row[data-sc="${id}"]`;
  await page.click(`${row('replay')} button:text-is("Değiştir")`);
  assert.match(await page.textContent(`${row('replay')} kbd`), /Bir tuşa basın/);
  await page.keyboard.press('t');
  assert.equal(await page.textContent(`${row('replay')} kbd`), 'T');
  assert.equal(await page.evaluate(() => window.solfejLab.CONFIG.SHORTCUTS.replay), 'T');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solfejlab.config.v1')).SHORTCUTS.replay), 'T');
  await page.click(`${row('replay')} button:text-is("Değiştir")`);
  await page.keyboard.press('n');
  assert.match(await page.textContent('#scConflictMsg'), /Aynı tuş/);
  assert.equal(await page.evaluate((s) => document.querySelector(s).classList.contains('conflict'), row('skip')), true);
  await page.screenshot({ path: `${OUT}/e2e-20-shortcuts-settings.png`, fullPage: true });
  await page.click(`${row('replay')} button:text-is("Değiştir")`);
  await page.keyboard.press('Escape');
  assert.equal(await page.textContent(`${row('replay')} kbd`), 'N', 'Esc vazgeçer');
  await page.click('#scCopy');
  await page.waitForFunction(() => /kısayol/.test(document.getElementById('notice').textContent));
  await page.click(`${row('replay')} button:text-is("Varsayılana dön")`);
  assert.equal(await page.textContent(`${row('replay')} kbd`), 'R');
  assert.equal(await page.textContent('#scConflictMsg'), '');
  // Ad düzenleme modunda kısayol çalışmaz
  await page.click('#settingsPanel [data-tab="names"].tab');
  await page.check('#editNamesToggle', { force: true });
  await page.keyboard.press('2');
  assert.equal(await page.evaluate(() => location.hash), '#ayarlar', 'ad düzenlerken bölüm değişmemeli');
  await page.click('#editDoneBtn');
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

// ═══ SENARYO M: telefon ve tablet — iPhone 13, Pixel 7, iPad (Chromium) + WebKit (Safari motoru) yerleşim ═══
if (run('M')) {
  log('M) telefon ve tablet');
  const { devices, webkit } = await import('playwright');
  const SECS = ['ana-sayfa', 'sinav', 'kendi-sinavim', 'serbest', 'gecmis', 'ayarlar', 'yardim'];
  /** Bir cihazda: her bölümün ekran görüntüsü, yatay taşma, dokunma alanı, giriş yazısı */
  async function layoutCheck(page, name, isPhone, isTablet) {
    for (const sec of SECS) {
      await go(page, sec);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        bar: (() => { const b = [...document.querySelectorAll('.mainbar')].find((x) => x.offsetParent || getComputedStyle(x).position === 'fixed' && x.getClientRects().length); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { pos: getComputedStyle(b).position, bottom: Math.round(innerHeight - r.bottom), minBtn: Math.min(...[...b.querySelectorAll('.btn')].filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect().height)) }; })(),
        inputFont: Math.min(...[...document.querySelectorAll('input, select, textarea')].filter((x) => x.offsetParent && x.type !== 'checkbox' && x.type !== 'range' && x.type !== 'file').map((x) => parseFloat(getComputedStyle(x).fontSize)), 99),
        smallTargets: [...document.querySelectorAll('main .btn, main .tab, main .cx-chip, main .seg-ctl button')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 40).length,
      }));
      if (m.overflow > 0) throw new Error(`${name} ${sec}: yatay taşma ${m.overflow}px`);
      assert.ok(m.inputFont >= 16, `${name} ${sec}: giriş yazısı ${m.inputFont}px (iPhone büyütmesin diye ≥16)`);
      assert.equal(m.smallTargets, 0, `${name} ${sec}: 40 px'ten küçük dokunma alanı`);
      if (isPhone && (sec === 'sinav' || sec === 'serbest')) {
        assert.ok(m.bar && m.bar.pos === 'fixed' && m.bar.bottom === 0, `${name} ${sec}: ana düğmeler altta sabit çubukta ${JSON.stringify(m.bar)}`);
        assert.ok(m.bar.minBtn >= 44, `${name} ${sec}: çubuk düğmesi ${m.bar.minBtn}px`);
        const off = await page.evaluate(() => [...document.querySelectorAll('.mainbar .btn')].filter((b) => b.offsetParent && (b.getBoundingClientRect().right > innerWidth + 1 || b.getBoundingClientRect().left < -1)).length);
        assert.equal(off, 0, `${name} ${sec}: alt çubuktaki düğmelerin hepsi ekranda`);
      }
      await page.screenshot({ path: `${OUT}/m-${name}-${sec}.png` });
    }
    if (isTablet) {                                 // iki sütun: solda kontroller, sağda porte ve gösterge
      await go(page, 'sinav');
      const two = await page.evaluate(() => { const a = document.getElementById('examPanel').getBoundingClientRect(), t = document.getElementById('tuner').getBoundingClientRect(); return { left: Math.round(a.left), tunerLeft: Math.round(t.left), aRight: Math.round(a.right) }; });
      log(`${name} iki sütun:`, JSON.stringify(two));
      assert.ok(two.tunerLeft >= two.aRight, 'tablette porte ve gösterge sağ sütunda');
    }
  }
  for (const [name, dev, phone, tablet] of [['iphone13', devices['iPhone 13'], true, false], ['pixel7', devices['Pixel 7'], true, false], ['ipad', devices['iPad (gen 7)'], false, true]]) {
    const { context, page, consoleMsgs } = await openPage('offline', { ...FAST, QUESTION_COUNTS: { single: 1, double: 1, triple: 1 } }, { device: dev });
    await layoutCheck(page, name, phone, tablet);
    if (name === 'iphone13') {
      // Sanal şarkıcı telefonda: alttaki çubuktan dokunarak başlat → kısa sınav biter
      await go(page, 'sinav');
      await page.tap('#startBtn');
      await waitFor(page, () => window.__dbg.state === 'LISTENING', null, 15000);
      assert.match(await page.textContent('#notice'), /Kulaklık/, 'telefonda kulaklık uyarısı');
      // Arka plana geçince kendiliğinden duraklar; dönünce "Devam"
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      assert.equal(await page.evaluate(() => window.__dbg.paused), true, 'arka planda duraklamalı');
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
      assert.equal(await page.evaluate(() => window.__dbg.paused), true, 'dönünce kendiliğinden sürmemeli');
      await page.tap('#examPauseBtn');
      await waitFor(page, () => window.__dbg.state === 'SUMMARY', null, 40000);
      const sc = await page.evaluate(() => ({ score: window.__dbg.diag.score, statuses: window.__dbg.session.results.map((r) => r.status).join(',') }));
      log('iPhone 13 sınav:', JSON.stringify(sc));
      assert.equal(sc.statuses, 'done,done,done');
      await page.screenshot({ path: `${OUT}/m-iphone13-summary.png`, fullPage: true });
    }
    assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0, `${name}: sayfa hatası`);
    await context.close();
  }
  // WebKit (Safari motoru): yerleşim ve sayfa hataları
  let wk = null;
  try { wk = await webkit.launch(); } catch (e) { log('WebKit kurulu değil, atlandı:', e.message.split('\n')[0]); }
  if (wk) {
    for (const [name, dev, phone, tablet] of [['webkit-iphone13', devices['iPhone 13'], true, false], ['webkit-ipad', devices['iPad (gen 7)'], false, true]]) {
      const context = await wk.newContext({ ...dev });
      await context.addInitScript(`try { localStorage.clear(); } catch (e) {}`);
      await context.route(/cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|tonejs\.github\.io/, (r) => r.abort());
      const page = await context.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${BASE}?debug#ana-sayfa`);
      await page.waitForFunction(() => window.__dbg && window.solfejLab);
      await layoutCheck(page, name, phone, tablet);
      assert.deepEqual(errs, [], `${name}: sayfa hatası`);
      log(`${name}: yerleşim tamam`);
      await context.close();
    }
    await wk.close();
  }
}

await browser.close();
server.close();
log('TÜM UÇTAN UCA TESTLER GEÇTİ');
