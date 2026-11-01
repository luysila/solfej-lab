// Solfej Lab — js/custom.js
// "Kendi sınavını hazırla": Sınav bölümündeki ikinci alt sekme. Kompakt pencere (artı/eksi sayılar, seçim çipleri),
// canlı özet ("15 soru · yaklaşık 8 dk"), hata nedeni, "Sınavlarım" listesi (solfejlab.exams.v1, en fazla 30).
// Doğrulama ve CONFIG'e çevirme js/pure.js'te (validateCustomExam, customExamToConfig); ayar yalnız o oturuma uygulanır.

import { CONFIG } from './config.js';
import { INTERVAL_TYPES, INVERSIONS, KINDS, KIND_LABEL, S, TYPE_BY_ID, deepClone, defaultCustomExam, estimateExamMinutes, midiName, normalizeCustomExam, normalizeCustomExams, validateCustomExam } from './pure.js';
import { el, examActive, fsm, mode, session, setText, showNotice, ui, updateHeaderText } from './ui.js';
import { MIDI_OPTIONS, T, storageGet, storageSet } from './settings.js';
import { onStartExam } from './app.js';

export const EXAMS_KEY = 'solfejlab.exams.v1';     // kayıtlı özel sınavlar; biçim değişirse sürümü artır
export const MAX_EXAMS = 30;
// Aralık çipleri: kısa ad (üzerine gelince tam adı)
export const INTERVAL_CHIPS = [['m2', 'k2'], ['M2', 'B2'], ['m3', 'k3'], ['M3', 'B3'], ['P4', 'T4'], ['A4', 'A4'], ['d5', 'E5'], ['P5', 'T5'], ['m6', 'k6'], ['M6', 'B6'], ['m7', 'k7'], ['M7', 'B7'], ['P8', 'T8']];
export const INTERVAL_QUICK = [
  ['cxQuickAll', INTERVAL_TYPES.map((t) => t.id)], ['cxQuickNone', []], ['cxQuickPerfect', ['P4', 'P5', 'P8']],
  ['cxQuick36', ['m3', 'M3', 'm6', 'M6']], ['cxQuick27', ['m2', 'M2', 'm7', 'M7']], ['cxQuickTritone', ['A4', 'd5']],
];
export let draft = defaultCustomExam(CONFIG);
export let examTab = 'std';                         // 'std' | 'custom'
let built = false;
let deleteArmed = null;
const refs = {};

export function loadExams() { return normalizeCustomExams(storageGet(EXAMS_KEY, []), MAX_EXAMS, CONFIG); }

/** Alt sekme: Standart sınav · Kendi sınavını hazırla (adres #sinav / #kendi-sinavim) */
export function setExamTab(tab) {
  examTab = tab === 'custom' ? 'custom' : 'std';
  renderExamPanel();
}
/** Sınav sürerken (ya da teşhis ekranında) çalıştırma düğmeleri görünür; pencere gizlenir */
export function renderExamPanel() {
  if (!ui.customExam) return;
  const running = examActive() || (!!session && fsm.state === S.SUMMARY);
  for (const b of document.querySelectorAll('#examTabs [data-etab]')) {
    b.setAttribute('aria-selected', String(b.dataset.etab === examTab));
    b.disabled = examActive();
  }
  ui.examControls.hidden = examTab === 'custom' && !running;
  ui.customExam.hidden = examTab !== 'custom' || running;
  // Pencere tek ekranda bitsin: sınav başlayana kadar çalışma alanı gizli (yalnız Sınav bölümünde)
  ui.workspace.hidden = mode === 'exam' && examTab === 'custom' && !running;
  if (examTab === 'custom' && !running) renderCustom();
  // Bilgi satırı: özel sınav sürüyorsa onun adı ve yapısı
  if (session?.custom && running) {
    const c = session.cfg.QUESTION_COUNTS;
    const parts = KINDS.filter((k) => c[k] > 0).map((k) => `${c[k]} ${KIND_LABEL[k].toLocaleLowerCase('tr')}`);
    ui.examInfo.replaceChildren(el('b', null, session.name), document.createTextNode(` · ${parts.join(', ')} · ±${session.cfg.TOLERANCE_CENTS} sent`));
    ui.examInfo.dataset.custom = '1';
  } else if (ui.examInfo.dataset.custom) {
    delete ui.examInfo.dataset.custom;
    updateHeaderText();                             // standart bilgi satırını geri yaz
  }
}

// ── Pencere öğeleri ──
function row(labelKey, ...content) {
  const r = el('div', 'cx-row');
  const lab = el('span', 'cx-label', T(labelKey));
  lab.dataset.text = labelKey;
  r.append(lab, ...content);
  return r;
}
export function chip(text, title, onClick) {
  const b = el('button', 'cx-chip', text);
  b.type = 'button';
  if (title) b.title = title;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', onClick);
  return b;
}
function textChip(key, onClick) { const b = chip(T(key), null, onClick); b.dataset.text = key; return b; }
/** Tek seçimli çip grubu (değerler + yazı anahtarları) */
function choice(name, options, get, set) {
  const box = el('div', 'chips-row');
  refs[name] = options.map(([value, key]) => {
    const fn = () => { set(value); renderCustom(); };
    const b = key ? textChip(key, fn) : chip(`${value} sn`, null, fn);
    b.dataset.value = String(value);
    box.append(b);
    return { b, value, get };
  });
  return box;
}
function stepper(id, get, set, { min, max, step = 1, fmt = String }) {
  const box = el('div', 'stepper');
  const minus = el('button', null, '−'), plus = el('button', null, '+'), val = el('span', 'mono');
  minus.type = plus.type = 'button';
  minus.setAttribute('aria-label', 'azalt'); plus.setAttribute('aria-label', 'artır');
  minus.addEventListener('click', () => { set(Math.max(min, get() - step)); renderCustom(); });
  plus.addEventListener('click', () => { set(Math.min(max, get() + step)); renderCustom(); });
  val.id = id;
  box.append(minus, val, plus);
  refs[id] = { val, get, fmt, minus, plus, min, max };
  return box;
}
function midiSelect(id, get, set) {
  const s = el('select');
  s.id = id;
  for (const m of MIDI_OPTIONS) s.add(new Option(midiName(m), String(m)));
  s.addEventListener('change', () => { set(+s.value); renderCustom(); });
  refs[id] = { s, get };
  return s;
}

/** Pencereyi bir kez kurar (init); değerler renderCustom ile güncellenir */
export function buildCustomUI() {
  if (built || !ui.customExam) return;
  built = true;
  const box = ui.customExam;
  // Üstte canlı özet + hata nedeni + düğmeler
  const bar = el('div', 'cx-bar');
  refs.summary = el('b', 'cx-sum');
  refs.error = el('span', 'cx-err');
  const start = el('button', 'btn primary', T('btnCxStart')); start.type = 'button'; start.dataset.text = 'btnCxStart'; start.id = 'cxStart';
  const save = el('button', 'btn', T('btnCxSave')); save.type = 'button'; save.dataset.text = 'btnCxSave'; save.id = 'cxSave';
  const reset = el('button', 'btn ghost', T('btnCxReset')); reset.type = 'button'; reset.dataset.text = 'btnCxReset'; reset.id = 'cxReset';
  start.addEventListener('click', () => { if (!validateCustomExam(draft, CONFIG).length) onStartExam({ custom: deepClone(draft) }); });
  save.addEventListener('click', saveDraft);
  reset.addEventListener('click', () => { draft = defaultCustomExam(CONFIG); renderCustom(); });
  refs.start = start;
  const btns = el('div', 'actions cx-actions');
  btns.append(start, save, reset);
  const sumLine = el('div', 'cx-sumline');
  sumLine.append(refs.summary, refs.error);
  bar.append(sumLine, btns);

  const name = el('input');
  name.type = 'text'; name.id = 'cxName'; name.maxLength = 60;
  name.addEventListener('input', () => { draft.name = name.value; renderCustom(); });
  refs.name = name;

  const counts = el('div', 'cx-counts');
  for (const k of KINDS) {
    const c = el('label', 'cx-count');
    c.append(el('span', null, KIND_LABEL[k]), stepper(`cxCount-${k}`, () => draft.counts[k], (v) => { draft.counts[k] = v; }, { min: 0, max: 50 }));
    counts.append(c);
  }

  const ivs = el('div', 'chips-row');
  refs.intervals = INTERVAL_CHIPS.map(([id, short]) => {
    const b = chip(short, TYPE_BY_ID[id].label, () => { toggle(draft.intervals, id); renderCustom(); });
    b.dataset.value = id;
    ivs.append(b);
    return b;
  });
  const quick = el('div', 'chips-row cx-quick');
  for (const [key, ids] of INTERVAL_QUICK) quick.append(textChip(key, () => { draft.intervals = [...ids]; renderCustom(); }));

  const chords = el('div', 'chips-row');
  refs.chords = ['major', 'minor', 'augmented', 'diminished'].map((id) => {
    const b = chip(TYPE_BY_ID[id].label.replace(/ \(.\)$/, ''), TYPE_BY_ID[id].label, () => { toggle(draft.chords, id); renderCustom(); });
    b.dataset.value = id;
    chords.append(b);
    return b;
  });
  const alt = el('label', 'check cx-check');
  const altIn = el('input'); altIn.type = 'checkbox'; altIn.id = 'cxAltered';
  altIn.addEventListener('change', () => { draft.alteredRule = altIn.checked; renderCustom(); });
  const altTxt = el('span', null, T('cxAlteredRule')); altTxt.dataset.text = 'cxAlteredRule';
  alt.append(altIn, altTxt);
  refs.altered = altIn;
  const chordWrap = el('div', 'cx-stack'); chordWrap.append(chords, alt);

  const invs = el('div', 'chips-row');
  refs.inversions = INVERSIONS.map((v) => {
    const b = chip(v.id ? `${v.label} (${v.fig})` : 'Temel', v.label, () => { toggle(draft.inversions, v.key); renderCustom(); });
    b.dataset.value = v.key;
    invs.append(b);
    return b;
  });

  const reg = el('div', 'cx-reg');
  reg.append(midiSelect('cxRegMin', () => draft.register.minMidi, (v) => { draft.register.minMidi = v; }), el('span', 'muted', '–'),
    midiSelect('cxRegMax', () => draft.register.maxMidi, (v) => { draft.register.maxMidi = v; }));

  const grid = el('div', 'cx-grid');
  grid.append(
    row('cxName', name),
    row('cxCounts', counts),
    row('cxIntervals', ivs, quick),
    row('cxChords', chordWrap),
    row('cxInversions', invs),
    row('cxOrder', choice('order', [['grouped', 'cxOrderGrouped'], ['shuffled', 'cxOrderShuffled']], () => draft.order, (v) => { draft.order = v; })),
    row('cxRegister', reg),
    row('cxPlayback', choice('playback', [['harmonic', 'cxPlayHarmonic'], ['melodic', 'cxPlayMelodic'], ['both', 'cxPlayBoth']], () => draft.playback, (v) => { draft.playback = v; })),
    row('cxTime', choice('time', [[0, 'cxTimeNone'], [15, null], [30, null], [60, null]], () => draft.timeLimit, (v) => { draft.timeLimit = v; })),
    row('cxReplay', choice('replay', [[true, 'cxAllow'], [false, 'cxDeny']], () => draft.allowReplay, (v) => { draft.allowReplay = v; })),
    row('cxSkip', choice('skip', [[true, 'cxAllow'], [false, 'cxDeny']], () => draft.allowSkip, (v) => { draft.allowSkip = v; })),
    row('cxReveal', choice('reveal', [['after', 'cxRevealAfter'], ['end', 'cxRevealEnd'], ['session', 'cxRevealSession'], ['never', 'cxRevealNever']], () => draft.reveal, (v) => { draft.reveal = v; })),
    row('cxFeedback', choice('feedback', [[true, 'cxFeedbackOn'], [false, 'cxFeedbackOff']], () => draft.liveFeedback, (v) => { draft.liveFeedback = v; })),
    row('cxTolerance', choice('tolerance', [[30, 'cxTolLoose'], [20, 'cxTolDefault'], [10, 'cxTolStrict']], () => draft.tolerance, (v) => { draft.tolerance = v; })),
    row('cxSustain', stepper('cxSustain', () => draft.sustainMs, (v) => { draft.sustainMs = v; }, { min: 100, max: 2000, step: 50, fmt: (v) => `${(v / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} sn` })),
  );

  // Sınavlarım
  const listHead = el('h3', 'set-h3', T('cxMyExams')); listHead.dataset.text = 'cxMyExams';
  refs.empty = el('p', 'small-note', T('cxEmptyList')); refs.empty.dataset.text = 'cxEmptyList';
  refs.list = el('ul', 'cx-list'); refs.list.id = 'cxList';
  box.append(bar, grid, listHead, refs.empty, refs.list);
  renderCustom();
}
function toggle(list, id) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); }

/** Pencereyi taslağa göre günceller: seçili çipler, sayılar, canlı özet, hata nedeni, başlat düğmesi */
export function renderCustom() {
  if (!built) return;
  if (document.activeElement !== refs.name) refs.name.value = draft.name;
  for (const k of KINDS) { const r = refs[`cxCount-${k}`]; setText(r.val, r.fmt(r.get())); r.minus.disabled = r.get() <= r.min; r.plus.disabled = r.get() >= r.max; }
  const rs = refs.cxSustain; setText(rs.val, rs.fmt(rs.get())); rs.minus.disabled = rs.get() <= rs.min; rs.plus.disabled = rs.get() >= rs.max;
  for (const b of refs.intervals) b.setAttribute('aria-pressed', String(draft.intervals.includes(b.dataset.value)));
  for (const b of refs.chords) b.setAttribute('aria-pressed', String(draft.chords.includes(b.dataset.value)));
  for (const b of refs.inversions) b.setAttribute('aria-pressed', String(draft.inversions.includes(b.dataset.value)));
  refs.altered.checked = draft.alteredRule;
  for (const name of ['order', 'playback', 'time', 'replay', 'skip', 'reveal', 'feedback', 'tolerance']) {
    for (const r of refs[name]) r.b.setAttribute('aria-pressed', String(r.get() === r.value));
  }
  refs.cxRegMin.s.value = String(draft.register.minMidi);
  refs.cxRegMax.s.value = String(draft.register.maxMidi);
  const total = KINDS.reduce((s, k) => s + draft.counts[k], 0);
  setText(refs.summary, `${total} soru · yaklaşık ${estimateExamMinutes(draft, CONFIG.AUDIO)} dk`);
  const errs = validateCustomExam(draft, CONFIG);
  setText(refs.error, errs.join(' · '));
  refs.start.disabled = errs.length > 0;
  refs.start.title = errs.join(' · ');
  renderExamList();
}

// ── Sınavlarım (kaydet · başlat · düzenle · kopyala · sil) ──
export function saveDraft() {
  const list = loadExams();
  const ex = normalizeCustomExam(draft, CONFIG);
  const i = draft.id ? list.findIndex((x) => x.id === draft.id) : -1;
  if (i < 0 && list.length >= MAX_EXAMS) { showNotice(`En fazla ${MAX_EXAMS} sınav kaydedilebilir; önce birini silin.`, 6000); return; }
  ex.id = i >= 0 ? draft.id : `x${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  ex.savedAt = Date.now();
  if (i >= 0) list[i] = ex; else list.push(ex);
  if (!storageSet(EXAMS_KEY, list)) { showNotice('Sınav kaydedilemedi (tarayıcı depolaması kapalı ya da dolu).'); return; }
  draft = deepClone(ex);
  showNotice(`“${ex.name}” kaydedildi.`, 4000);
  renderCustom();
}
function examSummary(ex) {
  const parts = KINDS.filter((k) => ex.counts[k] > 0).map((k) => `${ex.counts[k]} ${KIND_LABEL[k].toLocaleLowerCase('tr')}`);
  return `${parts.join(', ') || '—'} · ±${ex.tolerance} sent · ~${estimateExamMinutes(ex, CONFIG.AUDIO)} dk`;
}
export function renderExamList() {
  const list = loadExams();
  refs.empty.hidden = list.length > 0;
  refs.list.replaceChildren(...list.map((ex) => {
    const li = el('li', `cx-item${ex.id === draft.id ? ' editing' : ''}`);
    const info = el('div', 'cx-info');
    info.append(el('b', null, ex.name), el('small', null, examSummary(ex)));
    const acts = el('div', 'cx-item-acts');
    const btn = (key, cls, fn) => { const b = el('button', `btn small ${cls}`, T(key)); b.type = 'button'; b.dataset.text = key; b.addEventListener('click', fn); acts.append(b); return b; };
    btn('btnCxRun', 'primary', () => { if (!validateCustomExam(ex, CONFIG).length) onStartExam({ custom: deepClone(ex) }); else showNotice(validateCustomExam(ex, CONFIG).join(' · '), 6000); });
    btn('btnCxEdit', '', () => { draft = deepClone(ex); renderCustom(); ui.customExam.scrollIntoView({ block: 'start' }); });
    btn('btnCxCopy', '', () => {
      const all = loadExams();
      if (all.length >= MAX_EXAMS) { showNotice(`En fazla ${MAX_EXAMS} sınav kaydedilebilir.`, 6000); return; }
      all.push({ ...deepClone(ex), id: `x${Date.now().toString(36)}c`, name: `${ex.name} (kopya)`.slice(0, 60), savedAt: Date.now() });
      storageSet(EXAMS_KEY, all);
      renderExamList();
    });
    const del = btn('btnCxDelete', 'ghost', () => {
      if (deleteArmed !== ex.id) { deleteArmed = ex.id; del.textContent = T('btnCxConfirmDelete'); setTimeout(() => { if (deleteArmed === ex.id) { deleteArmed = null; renderExamList(); } }, 4000); return; }
      deleteArmed = null;
      storageSet(EXAMS_KEY, loadExams().filter((x) => x.id !== ex.id));
      if (draft.id === ex.id) delete draft.id;
      renderExamList();
    });
    li.append(info, acts);
    return li;
  }));
}
