// Solfej Lab — js/keys.js
// Klavye kısayolları: tuş olayı → işlev (matchShortcut, js/pure.js), işlevlerin çalıştırılması, Ayarlar → Kısayollar
// (Değiştir / Kaldır / Varsayılana dön, çakışma uyarısı, Kısayolları kopyala), "?" kısayol listesi, düğme ipuçları.
// Değişiklikler özel ayar olarak saklanır (solfejlab.config.v1 → SHORTCUTS); "Kısayolları kopyala" değişenleri JSON verir.

import { CONFIG, DEFAULT_CONFIG } from './config.js';
import { SHORTCUT_ACTIONS, deepMerge, diffConfig, keyLabel, keyName, matchShortcut, shortcutConflicts } from './pure.js';
import { el, exercise, mode, onNoteBoxPlay, setText, showNotice, ui } from './ui.js';
import { T, applyOverrides, configOverrides, editNames, editing, showSettingsMsg } from './settings.js';
import { SECTION_ORDER, goSection, toggleMenu } from './nav.js';
import { cycleViewMode } from './staff.js';

const LABEL_KEY = {
  start: 'scStart', pause: 'scPause', replay: 'scReplay', skip: 'scSkip', end: 'scEnd', playNext: 'scPlayNext',
  view: 'scView', staff: 'scStaff', octave: 'scOctave', menu: 'scMenu', help: 'scHelp',
};
const SECTION_TEXT = { 'ana-sayfa': 'navHome', sinav: 'navExam', serbest: 'navPractice', gecmis: 'navHistory', ayarlar: 'navSettings', yardim: 'navHelp' };
// Düğme ipuçları: işlev → düğmeler
const HINT_BUTTONS = {
  start: ['startBtn', 'cxStart', 'playBtn', 'drillStartBtn'], pause: ['examPauseBtn', 'practicePauseBtn'], replay: ['examReplayBtn', 'replayBtn'],
  skip: ['skipBtn', 'drillSkipBtn'], end: ['endBtn', 'drillStopBtn'], menu: ['menuBtn'],
};
export let capturing = null;                        // tuş atanan işlev (Değiştir'e basıldı)
let endArmedAt = 0;

export function shortcutLabel(id) {
  if (id.startsWith('section')) { const k = SECTION_ORDER[+id.slice(7) - 1]; return `${T('scSection')} · ${T(SECTION_TEXT[k])}`; }
  return T(LABEL_KEY[id]);
}
const $btn = (id) => document.getElementById(id);
const usable = (b) => b && !b.disabled && !b.hidden && b.offsetParent !== null;   // görünür ve etkin
function clickFirst(ids) { const b = ids.map($btn).find(usable); if (b) b.click(); return !!b; }

/** Kısayol işlevini çalıştırır (düğmenin kendisine tıklar: aynı kurallar, aynı durum kontrolleri) */
export function runShortcut(id) {
  switch (id) {
    case 'start':   return clickFirst(['startBtn', 'cxStart', 'playBtn', 'drillStartBtn', 'drillAgainBtn']);
    case 'pause':   return clickFirst(['examPauseBtn', 'practicePauseBtn']);
    case 'replay':  return clickFirst(['examReplayBtn', 'replayBtn']);
    case 'skip':    return clickFirst(['skipBtn', 'drillSkipBtn']);
    case 'end': {                                   // yanlışlıkla bitmesin: kısa süre içinde iki kez
      const b = ['endBtn', 'drillStopBtn'].map($btn).find(usable);
      if (!b) return false;
      const now = performance.now();
      if (endArmedAt && now - endArmedAt <= CONFIG.SHORTCUT_END_CONFIRM_MS) { endArmedAt = 0; b.click(); }
      else { endArmedAt = now; showNotice(T('scEndConfirm'), CONFIG.SHORTCUT_END_CONFIRM_MS); }
      return true;
    }
    case 'playNext':                                // serbest çalışmada sıradaki sesi çal (sınavda çalışmaz)
      if (mode !== 'practice' || !exercise.notes.length) return false;
      onNoteBoxPlay(Math.min(exercise.index, exercise.notes.length - 1));
      return true;
    case 'view':    cycleViewMode(); return true;
    case 'staff':   if (mode !== 'exam') return false; ui.examStaffToggle.click(); return true;
    case 'octave':  ui.fold.click(); return true;
    case 'menu':    toggleMenu(); return true;
    case 'help':    openShortcutHelp(); return true;
    default:
      if (id.startsWith('section')) { goSection(SECTION_ORDER[+id.slice(7) - 1]); return true; }
      return false;
  }
}

/** Klavye olayı (yakalama evresinde): tuş atanıyorsa onu kaydeder, değilse kısayolu çalıştırır */
export function onKeyDown(e) {
  if (capturing) { captureKey(e); return; }
  if (e.isComposing) return;
  const t = e.target instanceof Element ? e.target : null;
  const id = matchShortcut({
    key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey,
    tag: t?.tagName, type: t?.getAttribute?.('type') ?? t?.type, editable: !!t?.isContentEditable, role: t?.getAttribute?.('role'),
  }, CONFIG.SHORTCUTS, { editingNames: editNames || !!editing });
  if (!id) return;
  if (ui.shortcutHelp.open && id !== 'help') return;   // liste açıkken yalnız Esc / ? çalışır
  e.preventDefault();                               // Boşluk sayfayı kaydırmasın, Enter iki kez işlem yapmasın
  if (e.repeat) return;                             // basılı tutunca yinelenmesin
  runShortcut(id);
}

// ── "?" kısayol listesi ──
export function openShortcutHelp() {
  const d = ui.shortcutHelp;
  if (d.open) { d.close(); return; }
  ui.scHelpList.replaceChildren(...SHORTCUT_ACTIONS.filter((id) => CONFIG.SHORTCUTS[id]).flatMap((id) => {
    const dt = el('dt'), kb = el('kbd', null, keyLabel(CONFIG.SHORTCUTS[id]));
    dt.append(kb);
    return [dt, el('dd', null, shortcutLabel(id))];
  }));
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

// ── Ayarlar → Kısayollar ──
function captureKey(e) {
  e.preventDefault();
  e.stopPropagation();
  const name = keyName(e);
  if (!name) return;                                // yalnız değiştirici tuş: beklemeye devam
  const id = capturing;
  capturing = null;
  if (name !== 'Escape') saveShortcut(id, name);
  else renderShortcuts();
}
export function saveShortcut(id, key) {
  const r = applyOverrides(deepMerge(configOverrides, { SHORTCUTS: { [id]: key } }));
  if (!r.ok) showSettingsMsg(`Kısayol kaydedilmedi: ${r.errors.join(' · ')}`, true);
  renderShortcuts();
}
export function renderShortcuts() {
  const box = ui.shortcutsPanel;
  if (!box) return;
  const map = CONFIG.SHORTCUTS, conflicts = shortcutConflicts(map);
  const bad = new Set(Object.values(conflicts).flat());
  const intro = el('p', 'small-note', T('scIntro'));
  intro.dataset.text = 'scIntro';
  const rows = el('div', 'sc-rows');
  for (const id of SHORTCUT_ACTIONS) {
    const row = el('div', `sc-row${bad.has(id) ? ' conflict' : ''}`);
    row.dataset.sc = id;
    const kb = el('kbd', capturing === id ? 'capturing' : null, capturing === id ? T('scPressKey') : keyLabel(map[id] ?? ''));
    const btns = el('div', 'sc-btns');
    const mk = (key, fn) => { const b = el('button', 'btn small ghost', T(key)); b.type = 'button'; b.dataset.text = key; b.addEventListener('click', fn); btns.append(b); return b; };
    mk('btnScChange', () => { capturing = id; renderShortcuts(); });
    mk('btnScRemove', () => saveShortcut(id, '')).disabled = !map[id];
    mk('btnScDefault', () => saveShortcut(id, DEFAULT_CONFIG.SHORTCUTS[id])).disabled = map[id] === DEFAULT_CONFIG.SHORTCUTS[id];
    row.append(el('span', null, shortcutLabel(id)), kb, btns);
    rows.append(row);
  }
  const msg = el('p', 'sc-msg', Object.keys(conflicts).length
    ? `${T('scConflict')}: ${Object.entries(conflicts).map(([k, ids]) => `${keyLabel(k)} → ${ids.map(shortcutLabel).join(', ')}`).join(' · ')}` : '');
  msg.id = 'scConflictMsg';
  const acts = el('div', 'actions');
  const copy = el('button', 'btn', T('btnScCopy')); copy.type = 'button'; copy.dataset.text = 'btnScCopy'; copy.id = 'scCopy';
  copy.addEventListener('click', copyShortcuts);
  const reset = el('button', 'btn ghost', T('btnScResetAll')); reset.type = 'button'; reset.dataset.text = 'btnScResetAll';
  reset.addEventListener('click', () => { const o = deepMerge(configOverrides, {}); delete o.SHORTCUTS; applyOverrides(o); renderShortcuts(); });
  acts.append(copy, reset);
  box.replaceChildren(intro, rows, msg, acts);
}
/** Değişen kısayolları JSON olarak panoya kopyalar (varsayılan yapmak için geliştiriciye verilir) */
export async function copyShortcuts() {
  const changed = diffConfig(DEFAULT_CONFIG.SHORTCUTS, CONFIG.SHORTCUTS);
  const n = Object.keys(changed).length;
  let msg;
  if (!n) msg = 'Değişen kısayol yok.';
  else {
    const json = JSON.stringify({ SHORTCUTS: changed }, null, 2);
    try { await navigator.clipboard.writeText(json); msg = `Değişen ${n} kısayol panoya kopyalandı (JSON).`; }
    catch { ui.jsonArea.value = json; msg = 'Pano kullanılamadı; değişen kısayollar “Gelişmiş · JSON” kutusuna yazıldı.'; }
  }
  showNotice(msg, 6000);
  showSettingsMsg(msg);
}

/** Düğmelerin üzerine gelince kısayol küçük bir ipucu olarak görünür (data-sc + aria-keyshortcuts) */
export function applyShortcutHints() {
  for (const [id, btns] of Object.entries(HINT_BUTTONS)) {
    const k = CONFIG.SHORTCUTS[id];
    for (const bid of btns) {
      const b = $btn(bid);
      if (!b) continue;
      if (k) { b.dataset.sc = `${T('scHint')}: ${keyLabel(k)}${id === 'end' ? ' ×2' : ''}`; b.setAttribute('aria-keyshortcuts', k === 'Space' ? 'Space' : k); }
      else { delete b.dataset.sc; b.removeAttribute('aria-keyshortcuts'); }
    }
  }
}

export function bindKeys() {
  document.addEventListener('keydown', onKeyDown, true);   // yakalama evresi: tuş atarken başka işlem çalışmasın
  ui.scHelpClose.addEventListener('click', () => ui.shortcutHelp.close());
  ui.shortcutHelp.addEventListener('click', (e) => { if (e.target === ui.shortcutHelp) ui.shortcutHelp.close(); });   // dışarı tıklayınca
}
