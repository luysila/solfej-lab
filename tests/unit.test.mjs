// Solfej Lab — saf mantık birim testleri. Çalıştırma: npm test
// (önce tests/extract-pure.mjs, index.html'deki PURE bölümünü tests/.generated/pure.mjs olarak çıkarır)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './.generated/pure.mjs';

const cents = (f, ref) => 1200 * Math.log2(f / ref);

// ── Sinyal üreticileri ──
function sine(f, sr, n, amp = 0.5, phase = 0) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin(2 * Math.PI * f * i / sr + phase);
  return b;
}
/** /a/ ünlüsüne benzer harmonik ses: formant ağırlıklı harmonikler (isteğe bağlı zayıf temel) */
function vowel(f, sr, n, { weakFundamental = false, vibratoCents = 0, vibratoHz = 5.5, noise = 0 } = {}) {
  const b = new Float32Array(n);
  const formants = [[730, 90], [1090, 110], [2440, 170]];
  const H = Math.floor(5000 / f);
  const amps = [];
  for (let h = 1; h <= H; h++) {
    const fh = h * f;
    let a = 0;
    for (const [fc, bw] of formants) a += 1 / (1 + ((fh - fc) / bw) ** 2);
    a = a * 0.9 + 0.12 / h;                       // spektral eğim + formant
    if (h === 1 && weakFundamental) a *= 0.15;
    amps.push(a);
  }
  const norm = amps.reduce((s, a) => s + a, 0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const inst = f * Math.pow(2, (vibratoCents * Math.sin(2 * Math.PI * vibratoHz * i / sr)) / 1200);
    phase += 2 * Math.PI * inst / sr;
    let s = 0;
    for (let h = 1; h <= amps.length; h++) s += amps[h - 1] * Math.sin(h * phase + h * 0.3);
    b[i] = 0.6 * s / norm + (noise ? noise * (Math.random() * 2 - 1) : 0);
  }
  return b;
}

/** Gerçekçi şarkı sesi: gırtlak kaynağı −12 dB/oktav (1/h²) × formant rezonansları */
const VOWELS = { a: [[730, 90], [1090, 110], [2440, 170]], i: [[270, 60], [2290, 100], [3010, 120]], u: [[300, 60], [870, 80], [2240, 120]], e: [[530, 70], [1840, 100], [2480, 120]], o: [[570, 70], [840, 80], [2410, 120]], n: [[250, 60], [1000, 300], [2200, 300]] };
function sung(f, sr, n, formants) {
  const H = Math.floor(6000 / f), amps = [];
  for (let h = 1; h <= H; h++) {
    const fh = h * f; let g = 1;
    for (const [fc, bw] of formants) g *= Math.sqrt(1 / (((1 - (fh / fc) ** 2) ** 2) + (fh * bw / fc ** 2) ** 2));
    amps.push(g / (h * h));
  }
  const norm = amps.reduce((s, a) => s + a, 0), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let h = 1; h <= amps.length; h++) s += amps[h - 1] * Math.sin(2 * Math.PI * h * f * i / sr + 0.4 * h); b[i] = 0.6 * s / norm; }
  return b;
}

test('YIN: sinüs ve gerçekçi şarkı sesi (6 ünlü, C2–C6) ±3 sent içinde, netlik yüksek', () => {
  for (const sr of [44100, 48000]) {
    const yin = new M.YinDetector(2048);
    for (let midi = 36; midi <= 84; midi += 2) {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const cases = [['sinüs', sine(f, sr, 2048)], ...Object.entries(VOWELS).map(([v, fm]) => [`/${v}/`, sung(f, sr, 2048, fm)])];
      for (const [label, buf] of cases) {
        const [p, c] = yin.findPitch(buf, sr);
        const e = cents(p, f);
        assert.ok(Math.abs(e) < 3, `${sr} Hz · ${label} · ${M.midiName(midi)} → ${p.toFixed(2)} Hz (${e.toFixed(2)} sent)`);
        assert.ok(c > 0.85, `${label} ${M.midiName(midi)} netlik ${c.toFixed(3)}`);
      }
    }
  }
});

test('YIN: zorlayıcı sette (zayıf temel, baskın üst harmonik) uyarlamalı eşik oktav-üstü hatayı azaltır, oktav-altı hata yok', () => {
  const run = (adaptiveK) => {
    let up = 0, down = 0, n = 0;
    for (const sr of [44100, 48000]) for (let midi = 36; midi <= 86; midi++) {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const yin = new M.YinDetector(2048, { adaptiveK });
      for (const weak of [false, true]) {
        const e = cents(yin.findPitch(vowel(f, sr, 2048, { weakFundamental: weak }), sr)[0], f);
        n++;
        if (e > 600) up++;
        if (e < -600) down++;
      }
    }
    return { up, down, n };
  };
  const classic = run(0), adaptive = run(0.95);
  assert.equal(adaptive.down, 0, 'oktav-altı hata olmamalı');
  assert.ok(adaptive.up < classic.up, `uyarlamalı ${adaptive.up} < klasik ${classic.up}`);
  assert.ok(adaptive.up / adaptive.n < 0.03, `zorlayıcı sette hata oranı ${(adaptive.up / adaptive.n * 100).toFixed(1)} %`);
});

test('YIN: gürültülü (SNR ≈ 20 dB) ve vibratolu seste kabul edilebilir doğruluk', () => {
  const sr = 48000, yin = new M.YinDetector(2048);
  for (const f of [130.81, 220, 349.23, 523.25]) {
    const [p1, c1] = yin.findPitch(vowel(f, sr, 2048, { noise: 0.03 }), sr);
    assert.ok(Math.abs(cents(p1, f)) < 6, `gürültülü ${f}: ${cents(p1, f).toFixed(2)} sent`);
    assert.ok(c1 > 0.8, `gürültülü netlik ${c1.toFixed(3)}`);
    const [p2] = yin.findPitch(vowel(f, sr, 2048, { vibratoCents: 30 }), sr);
    assert.ok(Math.abs(cents(p2, f)) < 35, `vibratolu ${f}: ${cents(p2, f).toFixed(2)} sent`);
  }
});

test('YIN: beyaz gürültü ve sessizlik düşük netlik verir', () => {
  const sr = 48000, yin = new M.YinDetector(2048);
  const noise = new Float32Array(2048).map(() => Math.random() * 2 - 1);
  assert.ok(yin.findPitch(noise, sr)[1] < 0.6, 'gürültü netliği düşük olmalı');
  assert.equal(yin.findPitch(new Float32Array(2048), sr)[1], 0, 'sessizlik netliği 0');
});

test('YIN: 96 kHz → 2:1 indirgeme yolu doğru frekansı verir', () => {
  const sr = 96000, size = 4096, factor = 2, n = size / factor;
  const yin = new M.YinDetector(n);
  for (const f of [110, 261.63, 659.25]) {
    const buf = vowel(f, sr, size), tmp = new Float32Array(n);
    for (let i = 0; i < n; i++) tmp[i] = (buf[2 * i] + buf[2 * i + 1]) / 2;
    const [p] = yin.findPitch(tmp, sr / factor);
    assert.ok(Math.abs(cents(p, f)) < 3, `${f}: ${cents(p, f).toFixed(2)}`);
  }
});

test('Medyan filtre tek karelik oktav sıçramasını süzer', () => {
  const mf = new M.MedianFilter(3);
  const out = [60, 60.1, 72.1, 60.05, 60.1].map((v) => mf.push(v));
  assert.ok(out.slice(2).every((v) => Math.abs(v - 60) < 0.2), JSON.stringify(out));
});

test('Yazım: akorlar doğru harf ve yarım ses ile yazılır', () => {
  const T = M.TYPE_BY_ID;
  const name = (notes) => notes.map((n) => n.name).join('-');
  const root = (l, a) => M.ROOTS.find((r) => r.letter === l && r.acc === a);
  assert.equal(name(M.buildNotes(root(1, -1), 4, T.major)), 'D♭-F-A♭');
  assert.equal(name(M.buildNotes(root(2, -1), 4, T.diminished)), 'E♭-G♭-B♭♭');
  assert.equal(name(M.buildNotes(root(0, 0), 4, T.augmented)), 'C-E-G♯');
  assert.equal(name(M.buildNotes(root(6, 0), 3, T.major)), 'B-D♯-F♯');
  assert.equal(name(M.buildNotes(root(5, 0), 3, T.A4)), 'A-D♯');
  assert.equal(name(M.buildNotes(root(5, 0), 3, T.d5)), 'A-E♭');
  for (const t of M.CHORD_TYPES) {
    for (const r of M.ROOTS) {
      const notes = M.buildNotes(r, 4, t);
      notes.forEach((n, i) => {
        assert.equal(n.midi - notes[0].midi, t.tones[i].semis, `${t.id} yarım ses`);
        assert.equal((n.letter - notes[0].letter + 7) % 7, t.tones[i].steps % 7, `${t.id} harf adımı`);
      });
    }
  }
});

test('Porte konumu: hedef perde nota başının ortasında, ara perdeler orantılı, yazıma göre', () => {
  const T = M.TYPE_BY_ID;
  const root = (l, a) => M.ROOTS.find((r) => r.letter === l && r.acc === a);
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
  // Bağlamsız: doğal notalar kendi yerinde, siyah tuşlar ortada; Mi–Fa ve Si–Do yarım sesi tam bir basamak
  near(M.staffPosition(60), 28, 'Do4');
  near(M.staffPosition(64), 30, 'Mi4 (sol anahtarının alt çizgisi)');
  near(M.staffPosition(57), 26, 'La3 (fa anahtarının üst çizgisi)');
  near(M.staffPosition(61), 28.5, 'Do♯4 bağlamsız');
  near(M.staffPosition(64.5), 30.5, 'Mi4 + 50 sent');
  // Re majör: Fa♯ Fa'nın yerinde; Fa doğal, Mi ile Fa♯ arasında ortada; Fa♯ + 50 sent, Fa♯ ile Sol arasında ortada
  const D = M.buildNotes(root(1, 0), 4, T.major);
  assert.equal(D.map((n) => n.name).join('-'), 'D-F♯-A');
  const mapD = M.makeStaffMap(D);
  near(mapD(66), 31, 'Re majörde Fa♯4');
  near(mapD(65), 30.5, 'Re majörde Fa doğal');
  near(mapD(66.5), 31.5, 'Fa♯4 + 50 sent');
  near(mapD(62), 29, 'Re4');
  near(mapD(69), 33, 'La4');
  // Mi♭ majör: Mi♭ Mi'nin yerinde, Mi doğal Mi♭ ile Fa arasında
  const Eb = M.buildNotes(root(2, -1), 4, T.major);
  near(M.staffPosition(63, Eb), 30, 'Mi♭4');
  near(M.staffPosition(64, Eb), 30.5, 'Mi♭ majörde Mi doğal');
  // Si♯ ve Do♭: harf yerinde, oktav sınırını doğru geçer
  const Gs = M.buildNotes(root(4, 1), 3, T.major);              // Sol♯ Si♯ Re♯
  assert.equal(Gs.map((n) => n.fullName).join('-'), 'G♯3-B♯3-D♯4');
  near(M.staffPosition(60, Gs), 27, 'Si♯3 (perdesi Do4)');
  const Ab = M.buildNotes(root(5, -1), 3, T.minor);             // La♭ Do♭ Mi♭
  assert.equal(Ab.map((n) => n.fullName).join('-'), 'A♭3-C♭4-E♭4');
  near(M.staffPosition(59, Ab), 28, 'Do♭4 (perdesi Si3)');
  assert.ok(Number.isNaN(M.staffPosition(NaN)), 'NaN → NaN');
  // Tüm sorularda: her nota kendi harfinin yerinde, dönüşüm kesin artan (perde ↑ → konum ↑)
  for (let seed = 1; seed <= 60; seed++) {
    for (const q of M.generateSession(M.CONFIG, M.mulberry32(seed))) {
      const map = M.makeStaffMap(q.notes);
      for (const n of q.notes) near(map(n.midi), n.octave * 7 + n.letter, `${q.title} · ${n.fullName}`);
      let prev = -Infinity;
      for (let m = 30; m <= 90; m += 0.25) {
        const p = map(m);
        assert.ok(p > prev, `${q.title}: ${m} konumu artmıyor`);
        prev = p;
      }
    }
  }
});

test('pickVoicing: register ve çift değiştirici kuralı, en az değiştiricili yazım', () => {
  const cfg = M.CONFIG, rng = M.mulberry32(7);
  for (const t of M.CHORD_TYPES) {
    for (let k = 0; k < 200; k++) {
      const v = M.pickVoicing(t, cfg, rng);
      assert.ok(v, `${t.id} için aday yok`);
      assert.ok(v.notes[0].midi >= 48 && v.notes.at(-1).midi <= 72, `${t.id} register dışı`);
      assert.ok(v.notes.every((n) => Math.abs(n.acc) <= 1), `${t.id} çift değiştirici: ${v.notes.map((n) => n.name)}`);
    }
  }
  // D♭ majör C♯ majörden (3 diyez) az değiştiricili → hep D♭
  const seen = new Set();
  for (let s = 0; s < 400; s++) {
    const v = M.pickVoicing(M.TYPE_BY_ID.major, cfg, M.mulberry32(s));
    if (v.notes[0].midi % 12 === 1) seen.add(v.notes[0].name);
  }
  assert.deepEqual([...seen], ['D♭']);
});

test('Oturum üreticisi: 5/5/5, gruplu sıra, register, tekrarsızlık, tohum belirlenimi', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const qs = M.generateSession(M.CONFIG, M.mulberry32(seed));
    assert.equal(qs.length, 15);
    assert.deepEqual(qs.map((q) => q.kind), [...Array(5).fill('single'), ...Array(5).fill('double'), ...Array(5).fill('triple')]);
    assert.equal(new Set(qs.map((q) => q.key)).size, 15, 'aynı soru tekrar etmemeli');
    for (const q of qs) {
      assert.ok(q.notes.every((n) => n.midi >= 48 && n.midi <= 72), 'register');
      assert.equal(q.notes.length, q.kind === 'single' ? 1 : q.kind === 'double' ? 2 : 3);
    }
    const doubles = qs.filter((q) => q.kind === 'double').map((q) => q.type.id);
    assert.equal(new Set(doubles).size, 5, 'havuz 12 aralık → 5 soruda tekrar yok');
  }
  const a = JSON.stringify(M.generateSession(M.CONFIG, M.mulberry32(99)).map((q) => q.key));
  const b = JSON.stringify(M.generateSession(M.CONFIG, M.mulberry32(99)).map((q) => q.key));
  assert.equal(a, b, 'aynı tohum aynı soruları üretmeli');
});

test("CHORD_RULES: 5'li sette en fazla 1 artmış/eksilmiş, en az 1 majör + 1 minör, olasılık ≈ %50", () => {
  let setsWithAltered = 0;
  const N = 4000;
  for (let seed = 1; seed <= N; seed++) {
    const types = M.planTriads(5, M.CONFIG.CHORD_RULES, M.mulberry32(seed)).map((t) => t.id);
    const alt = types.filter((id) => id === 'augmented' || id === 'diminished').length;
    assert.ok(alt <= 1, `sette ${alt} artmış/eksilmiş`);
    assert.ok(types.includes('major') && types.includes('minor'), `majör+minör yok: ${types}`);
    if (alt) setsWithAltered++;
  }
  const rate = setsWithAltered / N;
  assert.ok(rate > 0.46 && rate < 0.54, `oran ${rate}`);
  // 10 üç ses sorusu → iki set, her biri ayrı kurala tabi
  for (let seed = 1; seed <= 500; seed++) {
    const ids = M.planTriads(10, M.CONFIG.CHORD_RULES, M.mulberry32(seed)).map((t) => t.id);
    for (const set of [ids.slice(0, 5), ids.slice(5)]) {
      assert.ok(set.filter((id) => id === 'augmented' || id === 'diminished').length <= 1);
    }
  }
  // ALTERED_CHANCE = 1 → her sette tam 1
  const always = { ...M.CONFIG.CHORD_RULES, ALTERED_CHANCE: 1 };
  for (let seed = 1; seed <= 200; seed++) {
    const ids = M.planTriads(5, always, M.mulberry32(seed)).map((t) => t.id);
    assert.equal(ids.filter((id) => id === 'augmented' || id === 'diminished').length, 1);
  }
});

test('compareToTarget: oktav modları ve çapa', () => {
  const C4 = 261.6256, C3 = C4 / 2;
  assert.ok(Math.abs(M.compareToTarget(C3, C4, 'free').cents) < 1e-6);
  assert.equal(M.compareToTarget(C3, C4, 'free').octave, -1);
  assert.ok(Math.abs(M.compareToTarget(C3, C4, 'off').cents + 1200) < 1e-6);
  // sabit oktav: ilk ses (çapa yok) serbest katlanır, çapa k = −1 ise üst sesin bir oktav altı beklenir
  assert.ok(Math.abs(M.compareToTarget(C3, C4, 'anchored', null).cents) < 1e-6);
  assert.ok(Math.abs(M.compareToTarget(C4, C4 * 2, 'anchored', -1).cents) < 1e-6, 'C4–C5 oktavında C3 → C4 doğru');
  assert.ok(Math.abs(M.compareToTarget(C3, C4 * 2, 'anchored', -1).cents + 1200) < 1e-6, 'aynı sesi tekrar etmek kabul edilmez');
  const ex = new M.Exercise([{ midi: 60 }, { midi: 72 }]);
  assert.equal(ex.foldable, false);
  assert.equal(M.octaveModeFor(ex, true, { OCTAVE_MODE: 'free' }), 'anchored');
  assert.equal(M.octaveModeFor(ex, false, { OCTAVE_MODE: 'anchored' }), 'off');
});

test('SustainTracker: 250 ms kesintisiz, bant dışında sıfırlanır, 60 ms algılama kopması toleransı', () => {
  const cfg = { TOLERANCE_CENTS: 20, SUSTAIN_TIME_MS: 250, SUSTAIN_DROPOUT_GRACE_MS: 60 };
  const t = new M.SustainTracker(cfg);
  let frames = 0, passed = false;
  while (!passed && frames < 100) { passed = t.update(1000 / 60, true, 12); frames++; }
  assert.equal(frames, 16, `16 kare (ilk kare yalnızca kurar) bekleniyordu, ${frames}`);
  t.reset();
  for (let i = 0; i < 10; i++) t.update(16.67, true, 5);
  t.update(16.67, true, 25);                                   // bant dışı → sıfır
  assert.equal(t.ms, 0);
  for (let i = 0; i < 10; i++) t.update(16.67, true, 5);
  const before = t.ms;
  for (let i = 0; i < 3; i++) t.update(16.67, false, 0);      // 50 ms kopma → dondur
  assert.equal(t.ms, before);
  t.update(16.67, false, 0);                                   // 66,7 ms → sıfırla
  assert.equal(t.ms, 0);
  cfg.SUSTAIN_TIME_MS = 500;                                   // canlı yapılandırma
  t.reset();
  frames = 0; passed = false;
  while (!passed && frames < 100) { passed = t.update(1000 / 60, true, 0); frames++; }
  assert.equal(frames, 31);
});

test('Durum makinesi: yasak geçişler reddedilir', () => {
  const log = [];
  const fsm = M.createMachine(M.ALLOWED, 'IDLE', (n, p) => log.push(`${p}>${n}`));
  assert.equal(fsm.go('LISTENING'), false);
  assert.equal(fsm.go('PLAYING'), true);
  assert.equal(fsm.go('VERIFIED'), false);
  assert.equal(fsm.go('LISTENING'), true);
  assert.equal(fsm.go('COMPLETE'), true);
  assert.equal(fsm.go('SUMMARY'), true);
  assert.equal(fsm.go('VERIFIED'), false);
  assert.deepEqual(log, ['IDLE>PLAYING', 'PLAYING>LISTENING', 'LISTENING>COMPLETE', 'COMPLETE>SUMMARY']);
});

test('Kilitli ilerleme: doğrulanmamış nota atlanamaz', () => {
  const ex = new M.Exercise([{ midi: 60 }, { midi: 64 }, { midi: 67 }]);
  assert.throws(() => ex.advance(), /Kilit/);
  ex.markVerified();
  assert.equal(ex.advance(), false);
  assert.equal(ex.index, 1);
});

// ── Sentetik sınav sonuçlarıyla teşhis ──
function fakeSession(spec) {
  const qs = M.generateSession(M.CONFIG, M.mulberry32(5));
  const s = new M.ExamSession(qs, { seed: 5, startedAt: 1_000_000 });
  qs.forEach((q, i) => {
    s.index = i;
    const r = s.result, sp = spec(q, i);
    r.replays = sp.replays ?? 0;
    r.noteResults.forEach((n, j) => {
      const ok = sp.verified ? sp.verified(j) : true;
      n.verified = ok;
      n.timeMs = ok ? sp.timeMs : 0;
      for (let k = 0; k < 40; k++) M.recordPitchFrame(n, sp.bias(j) + (k % 5) - 2);
    });
    s.finishQuestion(r.noteResults.every((n) => n.verified) ? 'done' : 'skipped');
  });
  s.finishedAt = 1_000_000 + 300_000;
  return s;
}

test('computeDiagnostics: puan, en zor tip, tiz eğilimi, ses konumu', () => {
  const s = fakeSession((q) => q.kind === 'single' ? { timeMs: 1200, bias: () => 4 }
    : q.kind === 'double' ? { timeMs: 2500, bias: () => 8, replays: 1 }
    : { timeMs: 6000, bias: (j) => (j === 1 ? 22 : 9), replays: 2, verified: (j) => j < 2 });
  const d = M.computeDiagnostics(s.attempted, M.CONFIG);
  // puan: 5 + 5 + 5 × (2/3) = 13,33 / 15 → %88,9
  assert.equal(d.score, 88.9);
  assert.equal(d.hardest, 'triple');
  assert.equal(d.overall.tendency, 'sharp');
  assert.ok(d.overall.biasCents > 5);
  assert.equal(d.byType.single.accuracy, 1);
  assert.ok(Math.abs(d.byType.triple.accuracy - 2 / 3) < 1e-9);
  assert.ok(d.byRole["3'lü"].biasCents > 15, 'üçlüler daha tiz');
  assert.equal(d.totals.full, 10);
  assert.equal(d.totals.partial, 5);
  assert.ok(d.messages.some((m) => m.includes('Üç ses')), d.messages.join('\n'));
  assert.ok(d.messages.some((m) => m.startsWith('Genel eğilim tiz')));
  assert.ok(d.messages.some((m) => m.startsWith(`"3'lü" konumundaki sesler genel ortalamadan ayrışıyor`)), d.messages.join('\n'));
  const e = M.makeHistoryEntry(s, d, M.CONFIG);
  assert.equal(e.score, 88.9);
  assert.equal(e.total, 15);
  assert.equal(e.settings.tol, 20);
  assert.deepEqual(M.normalizeHistory([e, { junk: 1 }, null]), [e]);
});

test('computeDiagnostics: pes ve dengeli eğilim, kısmi puan kapalı, tekrar cezası', () => {
  const flat = fakeSession(() => ({ timeMs: 2000, bias: () => -11 }));
  assert.equal(M.computeDiagnostics(flat.attempted).overall.tendency, 'flat');
  const bal = fakeSession(() => ({ timeMs: 2000, bias: () => 1 }));
  assert.equal(M.computeDiagnostics(bal.attempted).overall.tendency, 'balanced');
  const part = fakeSession((q) => ({ timeMs: 2000, bias: () => 0, verified: (j) => j === 0, replays: 1 }));
  const cfg = M.deepMerge(M.CONFIG, { SCORING: { PARTIAL_CREDIT: false, REPLAY_PENALTY: 0.1 } });
  const d = M.computeDiagnostics(part.attempted, cfg);
  // yalnızca tek ses soruları tam (1 − 0,1) → 5 × 0,9 / 15 = %30
  assert.equal(d.score, 30);
});

test('Yapılandırma: doğrulama, ayıklama, fark/birleştirme', () => {
  assert.deepEqual(M.validateConfig(M.CONFIG), []);
  const bad1 = M.deepMerge(M.CONFIG, { TOLERANCE_CENTS: 40, WARNING_CENTS: 30 });
  assert.ok(M.validateConfig(bad1).some((e) => e.includes('WARNING_CENTS')));
  const narrow = M.deepMerge(M.CONFIG, { REGISTER: { minMidi: 60, maxMidi: 66 } });
  assert.ok(M.validateConfig(narrow).some((e) => e.includes('çok dar')), M.validateConfig(narrow).join());
  const pool = M.deepMerge(M.CONFIG, { INTERVAL_RULES: { POOL: ['M3', 'X9'] } });
  assert.ok(M.validateConfig(pool).some((e) => e.includes('X9')));
  const { clean, warnings } = M.sanitizeOverrides({ TOLERANCE_CENTS: '15', FOO: 1, PITCH: { MIN_CLARITY: 0.7, BAR: 2 }, INTERVAL_RULES: { WEIGHTS: { A4: 0.5 } }, PRESETS: {} });
  assert.deepEqual(clean, { PITCH: { MIN_CLARITY: 0.7 }, INTERVAL_RULES: { WEIGHTS: { A4: 0.5 } } });
  assert.equal(warnings.length, 4, warnings.join(' | '));
  const merged = M.deepMerge(M.DEFAULT_CONFIG, { EXAM: { LIVE_FEEDBACK: false }, QUESTION_COUNTS: { triple: 10 } });
  assert.deepEqual(M.diffConfig(M.DEFAULT_CONFIG, merged), { QUESTION_COUNTS: { triple: 10 }, EXAM: { LIVE_FEEDBACK: false } });
  assert.equal(merged.QUESTION_COUNTS.single, 5);
  assert.ok(Object.isFrozen(M.DEFAULT_CONFIG.PITCH));
  // ön ayarlar geçerli olmalı
  for (const [key, p] of Object.entries(M.CONFIG.PRESETS)) {
    assert.deepEqual(M.validateConfig(M.deepMerge(M.DEFAULT_CONFIG, p.values)), [], `ön ayar ${key}`);
  }
});

test('Piyano örnek haritası: C3–C5 için Salamander dosya adları', () => {
  const map = M.pianoSampleMap({ minMidi: 48, maxMidi: 72 }, 3, '{name}.mp3');
  assert.deepEqual(map, {
    A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3',
    'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3',
  });
});

test('Biçim: işaretli sayı ve nota adı', () => {
  assert.equal(M.fmtSigned(9.24, 1), '+9,2');
  assert.equal(M.fmtSigned(-11, 0), '−11');
  assert.equal(M.fmtSigned(0.02, 1), '0,0');
  assert.equal(M.midiName(48), 'C3');
  assert.equal(M.nearestNoteName(440), 'A4');
});
