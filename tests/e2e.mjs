// Solfej Lab — gerçek Chromium (headless) uçtan uca testi
//  Çalıştırma: bir kez `npm install` ve `npx playwright install chromium`, sonra `npm run e2e`
//  Tek senaryo: `ONLY=A npm run e2e` (A tam sınav · B Tone/VexFlow taklidi · C sınav provası · D telefon · E zorlanan şarkıcı)
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

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/index.html') || req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML); }
  else { res.writeHead(404); res.end(); }
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

async function openPage(scenario, overrides, { width = 980, height = 1400 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, permissions: ['microphone'] });
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
  await page.goto(`${BASE}?debug&seed=4242`);
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
      rows: document.querySelectorAll('#sumRows tr').length,
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
  assert.ok(R.summaryVisible && R.rows === 3, 'teşhis ekranı 3 satır');
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
  await page.click('#settingsPanel > summary');
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
  await page.fill('#jsonArea', '{"REGISTER":{"minMidi":60,"maxMidi":64}}');
  await page.click('#jsonApply');
  assert.match(await page.textContent('#settingsMsg'), /çok dar|Uygulanmadı/);
  await page.fill('#jsonArea', '{bozuk');
  await page.click('#jsonApply');
  assert.match(await page.textContent('#settingsMsg'), /JSON okunamadı/);
  // Ön ayar "Sıkı" → forma yüklenir → uygula
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
  assert.equal(await page.isChecked('#staffToggle'), true, '"Portede göster" varsayılan açık');
  assert.equal(await page.isHidden('#staffPanel'), true, 'VexFlow paneli varsayılan gizli');
  // ── VexFlow paneli açılır ama yüklenemez → anlaşılır mesaj, uygulama çalışmaya devam eder ──
  await page.evaluate(() => window.solfejLab.setConfig({ UI: { VEXFLOW_PANEL: true } }));
  await page.check('#staffToggle', { force: true });
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
  await page.click('#tabPractice');
  await page.selectOption('#rootSelect', '5');           // E♭
  await page.selectOption('#octaveSelect', '4');
  await page.selectOption('#typeSelect', 'major');
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
  await page.check('#staffToggle', { force: true });
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
  await page.click('#settingsPanel > summary');
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow2 <= 0, `ayarlar açıkken yatay taşma ${overflow2}px`);
  await page.screenshot({ path: `${OUT}/e2e-7-mobile.png`, fullPage: true });
  await context.close();
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
  await page.click('#tabPractice');
  await page.selectOption('#rootSelect', '0');            // Do
  await page.selectOption('#octaveSelect', '4');
  await page.selectOption('#typeSelect', 'single');
  const staffOn = await page.isChecked('#staffToggle');
  assert.ok(staffOn, 'serbest çalışmada porte görünümü açık başlamalı');
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
  assert.match(flat.coach, /altında|pes/);
  assert.equal(flat.state, 'LISTENING', '−60 sentte doğrulanmamalı');
  assert.equal(flat.zone, 'bad');
  assert.ok(flat.zones.length > 50 && flat.zones.every((z) => z === 'bad'), 'çizgi kırmızı olmalı');
  assert.equal(flat.gauge, 'Do♯ / Do / Si');
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-9a-flat-red.png` });
  await page.waitForTimeout(Math.max(0, 6000 - (Date.now() - t0)));
  await page.evaluate(() => { window.__singer.bias = 3; });  // düzeltme
  await waitFor(page, () => window.__dbg.state === 'COMPLETE', null, 10000);
  const fixed = await page.evaluate(() => {
    const z = window.__dbg.contour.pts.filter((p) => Number.isFinite(p.s)).map((p) => p.z);
    return { first: z[0], last: z[z.length - 1], greens: z.filter((x) => x === 'perfect').length, coachKey: document.getElementById('coachLine').dataset.key };
  });
  assert.equal(fixed.coachKey, 'low', 'yönlendirme anlık değişmez; yeni sese geçene kadar kalır');
  log('düzeltme sonrası:', JSON.stringify(fixed));
  assert.equal(fixed.first, 'bad');
  assert.equal(fixed.last, 'perfect');
  assert.ok(fixed.greens >= 5, 'yeşil parça olmalı');
  await (await page.$('#tuner')).screenshot({ path: `${OUT}/e2e-9b-corrected-green.png` });
  assert.equal(consoleMsgs.filter((m) => /PAGEERROR/.test(m)).length, 0);
  await context.close();
}

await browser.close();
server.close();
log('TÜM UÇTAN UCA TESTLER GEÇTİ');
