// Solfej Lab — js/drill.js
// Serbest çalışma "Alıştırma": rastgele soru dizisi (sınav altyapısıyla). Kurulum kompakt çiplerle (soru tipleri,
// aralıklar, akorlar, akor durumu, soru sayısı ya da "Ben durdurana kadar", çalım biçimi, cevabın gösterilmesi);
// dizi bitince ya da "Durdur"da sonuç listesi. Tanım ve doğrulama js/pure.js'te (defaultDrill, validateDrill, generateDrillChunk).
// Son kurulum ve alt sekme solfejlab.ui.v1'de (drill, practiceTab) hatırlanır.

import { CONFIG } from './config.js';
import { Exercise, INVERSIONS, KINDS, KIND_LABEL, S, TYPE_BY_ID, deepClone, normalizeDrill, validateDrill } from './pure.js';
import { assignExercise, buildNoteBoxes, drillActive, el, fsm, fmtDuration, nf1, selectionChanged, session, setText, ui } from './ui.js';
import { T } from './settings.js';
import { INTERVAL_CHIPS, INTERVAL_QUICK, chip } from './custom.js';
import { loadUiState, saveUiState } from './nav.js';
import { hardReset, onStartDrill } from './app.js';

export let drillDraft = null;
export let practiceTab = 'single';                  // 'single' (Tek soru) | 'drill' (Alıştırma)
let built = false;
const R = {};

const persist = () => saveUiState({ drill: drillDraft });

/** Alt sekme: Tek soru · Alıştırma. Tek soruya dönünce biten alıştırmanın sonucu kapanır. */
export function setPracticeTab(tab, { save = true } = {}) {
  if (drillActive()) return;                        // alıştırma sürerken sekme değişmez
  practiceTab = tab === 'drill' ? 'drill' : 'single';
  if (save) saveUiState({ practiceTab });
  if (practiceTab === 'single' && session?.drill) { hideDrillResult(); hardReset(); }
  if (!session) applyPracticeExercise();          // tek soru: seçili soru · alıştırma: boş kutular
  renderPracticePanel();
}
/** Sekmeye göre alanları ve düğmeleri gösterir (renderAll her durum değişiminde çağırır) */
/** Sekmeye göre nota kutuları: Tek soru → seçili ses/aralık/akor; Alıştırma → boş (sorular başlayınca gelir) */
export function applyPracticeExercise() {
  if (practiceTab === 'drill') { assignExercise(new Exercise([])); buildNoteBoxes(); hardReset(); }
  else selectionChanged();
}
export function renderPracticePanel() {
  if (!ui.drillSetup) return;
  const active = drillActive();
  for (const b of document.querySelectorAll('#practiceTabs [data-ptab]')) {
    b.setAttribute('aria-selected', String(b.dataset.ptab === practiceTab));
    b.disabled = active;
  }
  ui.singleFields.hidden = practiceTab !== 'single';
  ui.drillSetup.hidden = practiceTab !== 'drill' || active;
  for (const b of document.querySelectorAll('#practiceControls [data-ponly]')) b.hidden = b.dataset.ponly !== practiceTab;
  if (practiceTab === 'drill' && !active) renderDrill();
  if (active) ui.drillStart.disabled = true;
}

// ── Kurulum (kompakt çipler) ──
function row(labelKey, ...content) {
  const r = el('div', 'cx-row');
  const lab = el('span', 'cx-label', T(labelKey));
  lab.dataset.text = labelKey;
  r.append(lab, ...content);
  return r;
}
function multi(list, items) {                       // çoklu seçim çipleri: [değer, yazı, başlık]
  const box = el('div', 'chips-row');
  const refs = items.map(([value, text, title]) => {
    const b = chip(text, title, () => { const i = drillDraft[list].indexOf(value); if (i >= 0) drillDraft[list].splice(i, 1); else drillDraft[list].push(value); changed(); });
    b.dataset.value = value;
    box.append(b);
    return b;
  });
  return { box, refs };
}
function single(field, items) {                     // tek seçim çipleri: [değer, yazı anahtarı]
  const box = el('div', 'chips-row');
  const refs = items.map(([value, key]) => {
    const b = chip(T(key), null, () => { drillDraft[field] = value; changed(); });
    b.dataset.text = key;
    b.dataset.value = String(value);
    box.append(b);
    return { b, value };
  });
  return { box, refs };
}
function changed() { persist(); renderDrill(); }

export function buildDrillUI() {
  if (built || !ui.drillSetup) return;
  built = true;
  drillDraft = normalizeDrill(loadUiState().drill, CONFIG);
  practiceTab = loadUiState().practiceTab === 'drill' ? 'drill' : 'single';

  R.kinds = multi('kinds', KINDS.map((k) => [k, KIND_LABEL[k]]));
  R.intervals = multi('intervals', INTERVAL_CHIPS.map(([id, short]) => [id, short, TYPE_BY_ID[id].label]));
  const quick = el('div', 'chips-row cx-quick');
  for (const [key, ids] of INTERVAL_QUICK) {
    const b = chip(T(key), null, () => { drillDraft.intervals = [...ids]; changed(); });
    b.dataset.text = key;
    quick.append(b);
  }
  R.chords = multi('chords', ['major', 'minor', 'augmented', 'diminished'].map((id) => [id, TYPE_BY_ID[id].label.replace(/ \(.\)$/, ''), TYPE_BY_ID[id].label]));
  R.inversions = multi('inversions', INVERSIONS.map((v) => [v.key, v.id ? `${v.label} (${v.fig})` : 'Temel', v.label]));
  // Soru sayısı: artı/eksi ya da "Ben durdurana kadar"
  const count = el('div', 'cx-reg');
  const st = el('div', 'stepper');
  const minus = el('button', null, '−'), plus = el('button', null, '+'), val = el('span', 'mono');
  minus.type = plus.type = 'button';
  minus.setAttribute('aria-label', 'azalt'); plus.setAttribute('aria-label', 'artır');
  val.id = 'drCount';
  minus.addEventListener('click', () => { drillDraft.count = Math.max(1, (drillDraft.count || 7) - 1); changed(); });
  plus.addEventListener('click', () => { drillDraft.count = Math.min(50, (drillDraft.count || 7) + 1); changed(); });
  st.append(minus, val, plus);
  const until = chip(T('drUntilStop'), null, () => { drillDraft.count = drillDraft.count ? 0 : 7; changed(); });
  until.dataset.text = 'drUntilStop';
  until.id = 'drUntil';
  count.append(st, until);
  Object.assign(R, { minus, plus, val, until });
  R.playback = single('playback', [['harmonic', 'cxPlayHarmonic'], ['melodic', 'cxPlayMelodic'], ['both', 'cxPlayBoth']]);
  R.reveal = single('reveal', [['question', 'drRevealQuestion'], ['end', 'drRevealEnd'], ['never', 'drRevealNever']]);
  R.error = el('p', 'cx-err');
  R.rowIntervals = row('cxIntervals', R.intervals.box, quick);
  R.rowChords = row('cxChords', R.chords.box);
  R.rowInv = row('cxInversions', R.inversions.box);
  const grid = el('div', 'cx-grid');
  grid.append(row('drKinds', R.kinds.box), R.rowIntervals, R.rowChords, R.rowInv, row('drCount', count),
    row('cxPlayback', R.playback.box), row('drReveal', R.reveal.box));
  ui.drillSetup.append(grid, R.error);
  renderPracticePanel();
}

/** Kurulumu güncel tanıma göre gösterir; hatalıysa başlat kapalı ve neden yazılı */
export function renderDrill() {
  if (!built) return;
  const d = drillDraft;
  for (const [list, refs] of [['kinds', R.kinds.refs], ['intervals', R.intervals.refs], ['chords', R.chords.refs], ['inversions', R.inversions.refs]]) {
    for (const b of refs) b.setAttribute('aria-pressed', String(d[list].includes(b.dataset.value)));
  }
  for (const r of R.playback.refs) r.b.setAttribute('aria-pressed', String(d.playback === r.value));
  for (const r of R.reveal.refs) r.b.setAttribute('aria-pressed', String(d.reveal === r.value));
  R.rowIntervals.hidden = !d.kinds.includes('double');
  R.rowChords.hidden = R.rowInv.hidden = !d.kinds.includes('triple');
  setText(R.val, d.count ? String(d.count) : '∞');
  R.until.setAttribute('aria-pressed', String(!d.count));
  R.minus.disabled = !d.count || d.count <= 1;
  R.plus.disabled = !d.count || d.count >= 50;
  const errs = validateDrill(d, CONFIG);
  setText(R.error, errs.join(' · '));
  ui.drillStart.disabled = errs.length > 0 || drillActive();
  ui.drillStart.title = errs.join(' · ');
}
export function currentDrill() { return deepClone(drillDraft); }

// ── Sonuç listesi (dizi bitince ya da "Durdur"da) ──
const RESULT_TEXT = { done: '✓ tam', partial: '◐ kısmi', skipped: '✗ geçildi', timeout: '✗ süre doldu' };
export function showDrillResult(sess) {
  if (!CONFIG.PRACTICE.SHOW_RESULTS) return;
  const rs = sess.attempted;
  const n = (s) => rs.filter((r) => r.status === s).length;
  setText(ui.drillMeta, `${rs.length} soru · tam ${n('done')} · kısmi ${n('partial')} · geçilen ${n('skipped') + n('timeout')} · ${fmtDuration((sess.finishedAt ?? Date.now()) - sess.startedAt - (sess.pausedMs || 0))}`);
  ui.drillList.replaceChildren(...rs.map((r) => {
    const li = el('li', `ans-${r.status}`);
    li.append(el('span', null, r.title), el('small', null, `${RESULT_TEXT[r.status] ?? r.status} · ${nf1.format(r.listenMs / 1000)} sn`));
    return li;
  }));
  ui.drillResult.hidden = false;
  ui.drillResult.scrollIntoView({ block: 'nearest' });
}
export function hideDrillResult() { if (ui.drillResult) ui.drillResult.hidden = true; }

export function bindDrill() {
  for (const b of document.querySelectorAll('#practiceTabs [data-ptab]')) b.addEventListener('click', () => setPracticeTab(b.dataset.ptab));
  ui.drillStart.addEventListener('click', () => { if (!validateDrill(drillDraft, CONFIG).length) onStartDrill(currentDrill()); });
  ui.drillAgain.addEventListener('click', () => { hideDrillResult(); onStartDrill(currentDrill()); });
  ui.drillClose.addEventListener('click', () => { hideDrillResult(); if (session?.drill && fsm.state === S.SUMMARY) hardReset(); });
}
