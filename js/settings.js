// Solfej Lab — js/settings.js
// Arayüz adları (CONFIG.TEXTS, sayfada düzenleme), ayarlar paneli (SETTINGS_SCHEMA), kalıcılık (tercihler, özel ayarlar).

import { CONFIG, DEFAULT_CONFIG } from './config.js';
import { INTERVAL_TYPES, MedianFilter, S, clamp, deepClone, deepMerge, diffConfig, getPath, isPlainObject, midiName, sanitizeOverrides, setPath, textLeaves, textMaxLen, validateConfig } from './pure.js';
import { audioCtx, masterGain, piano, preparePiano, resetPiano } from './audio.js';
import { analyser, assignMedianFilter, medianFilter, settings, setupDetector } from './mic.js';
import { applyCoachFont, buildTicks, el, examActive, fsm, mode, paintGaugeBackground, renderAll, renderConfigChip, renderDetectorChip, renderEngineChip, selectionChanged, session, setText, showNotice, tracker, ui, uiReady, updateFoldUi, updateHeaderText, updateThresholdUi } from './ui.js';
import { drawContour, staffView, updateVexPanel } from './staff.js';
import { renderHistory } from './summary.js';
import { practicePlayback } from './app.js';

// ── Ayarlar paneli (şema ile üretilir: yeni ayar eklemek için SETTINGS_SCHEMA'ya bir satır yeter) ──
// ── Arayüz adları (CONFIG.TEXTS) — yazılar textContent ile; [data-text="yol"] taşıyan her öğe düzenlenebilir ──
export const T = (path) => { const v = getPath(CONFIG.TEXTS, path); return typeof v === 'string' ? v : (getPath(DEFAULT_CONFIG.TEXTS, path) ?? ''); };
/** Durum metninde düğme adı: baştaki simge (▶ ↻ …) atılır → “Teste Başla” */
export const btnName = (path) => T(path).replace(/^[^\p{L}\p{N}]+/u, '').trim();
export function setTextKey(node, path) { node.dataset.text = path; setText(node, T(path)); }
export function applyTexts() { for (const n of document.querySelectorAll('[data-text]')) setText(n, T(n.dataset.text)); }

export const COACH_KEY_LABEL = {
  idle: 'bekleme', quiet: 'ses yok', unclear: 'perde net değil', blind: 'sınav provası', octave: 'oktav farkı',
  octaveOff: 'oktav farkı (tolerans kapalı)', good: 'tam yerinde', low: 'biraz pes', high: 'biraz tiz',
  farLow: 'epey pes', farHigh: 'epey tiz', unsteady: 'dalgalı',
};
/** Ayarlar paneli alanları: DEFAULT_CONFIG.TEXTS'teki her yaprak için bir metin kutusu (kendiliğinden) */
export function textFields(filter) {
  return textLeaves(DEFAULT_CONFIG.TEXTS).filter(([p]) => filter(p)).map(([p, def]) => {
    const coach = p.startsWith('COACH.');
    const [, key, variant] = p.split('.');
    return {
      path: `TEXTS.${p}`, type: 'text', max: textMaxLen(p), placeholder: def, wide: coach,
      label: coach ? `${COACH_KEY_LABEL[key] ?? key} · ${variant}` : `«${def}»`,
    };
  });
}

// "Adları sayfada düzenle": kesik çizgili yazıya tıkla → üstünde metin kutusu (Enter kaydeder, Esc vazgeçer, dışarı tıklamak kaydeder)
export let editNames = false;
export let editing = null;                     // { el, path, input }
export function setEditNames(on) {
  finishEdit(true);
  editNames = on;
  document.body.classList.toggle('edit-names', on);
  ui.editBar.hidden = !on;
  const t = document.getElementById('editNamesToggle');
  if (t) t.checked = on;
  if (on) unlockForEditing();
  else { renderAll(); renderHistory(); }           // düğmelerin gerçek durumu geri gelir
}
export function unlockForEditing() {
  for (const b of document.querySelectorAll('button[data-text]:disabled')) b.disabled = false;
}
export function onEditClick(e) {
  if (!editNames) return;
  const t = e.target.closest?.('[data-text]');
  if (!t || t.closest('#editBar')) return;
  e.preventDefault();                               // düğme / sekme / anahtar işlemi başlamasın
  e.stopPropagation();
  startEdit(t);
}
export function startEdit(node) {
  finishEdit(true);
  const path = node.dataset.text;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-editor';
  input.value = T(path);
  input.maxLength = textMaxLen(path);
  input.setAttribute('aria-label', `Yeni ad (şu an: ${T(path)})`);
  input.style.font = getComputedStyle(node).font;
  document.body.append(input);
  editing = { el: node, path, input };
  positionEditor();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
  });
  input.addEventListener('blur', () => finishEdit(true));
  input.focus();
  input.select();
}
/** Düzenleme kutusunu yazının üstüne yerleştirir (açılışta, kaydırmada, pencere boyutu değişince) */
export function positionEditor() {
  if (!editing) return;
  const r = editing.el.getBoundingClientRect(), s = editing.input.style;
  const w = Math.min(window.innerWidth - 16, Math.max(r.width + 32, 200));
  s.left = `${clamp(r.left - 6, 8, window.innerWidth - w - 8)}px`;
  s.top = `${clamp(r.top - 4, 8, window.innerHeight - 48)}px`;
  s.width = `${w}px`;
  s.height = `${Math.max(32, r.height + 8)}px`;
}
export function finishEdit(save) {
  if (!editing) return;
  const { path, input } = editing;
  editing = null;
  const value = input.value.trim();
  input.remove();
  if (!save || value === T(path)) return;
  const r = applyOverrides(deepMerge(configOverrides, { TEXTS: setPath({}, path, value) }));
  if (!r.ok) showNotice(`Ad kaydedilmedi: ${r.errors.join(' · ')}`, 6000);
}
/** Değişen adları JSON olarak panoya kopyalar (varsayılan yapmak için geliştiriciye verilir) */
export async function onCopyNames() {
  const changed = diffConfig(DEFAULT_CONFIG.TEXTS, CONFIG.TEXTS);
  const n = textLeaves(changed).length;
  let msg;
  if (!n) msg = 'Değişen ad yok; kopyalanacak bir şey bulunmadı.';
  else {
    const json = JSON.stringify({ TEXTS: changed }, null, 2);
    try { await navigator.clipboard.writeText(json); msg = `Değişen ${n} ad panoya kopyalandı (JSON).`; }
    catch { ui.jsonArea.value = json; msg = 'Pano kullanılamadı; değişen adlar “Gelişmiş · JSON” kutusuna yazıldı.'; }
  }
  showNotice(msg, 6000);
  showSettingsMsg(msg);
}
/** "Arayüz adları" grubunun başı: düzenleme anahtarı + "Adları kopyala" */
export function buildNamesIntro() {
  const box = el('div', 'set-intro');
  const lab = el('label', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  input.id = 'editNamesToggle';
  input.checked = editNames;
  input.addEventListener('change', () => setEditNames(input.checked));
  const txt = el('span', 'switch-text');
  const name = el('span', null, T('toggleEditNames'));
  name.dataset.text = 'toggleEditNames';
  txt.append(name, el('small', null, 'Açıkken değiştirilebilir yazıların çevresinde kesik çizgi çıkar; tıklayıp yazın.'));
  lab.append(input, el('span', 'track'), txt);
  const copy = el('button', 'btn small', T('btnCopyNames'));
  copy.type = 'button';
  copy.dataset.text = 'btnCopyNames';
  copy.addEventListener('click', onCopyNames);
  box.append(lab, copy);
  return box;
}

export const MIDI_OPTIONS = Array.from({ length: 61 }, (_, i) => 36 + i);   // C2 – C7
export const SETTINGS_SCHEMA = [
  { title: 'Sınav standardı', tab: 'std', fields: [
    { path: 'TOLERANCE_CENTS', label: 'Tolerans (± sent)', type: 'number', min: 1, max: 100, step: 1 },
    { path: 'WARNING_CENTS', label: 'Sarı bant sınırı (± sent)', type: 'number', min: 1, max: 200, step: 1 },
    { path: 'SUSTAIN_TIME_MS', label: 'Tutma süresi (ms)', type: 'number', min: 20, max: 5000, step: 10 },
    { path: 'SUSTAIN_DROPOUT_GRACE_MS', label: 'Algılama kopması toleransı (ms)', type: 'number', min: 0, max: 500, step: 5 },
    { path: 'A4_HZ', label: 'Diyapazon A4 (Hz)', type: 'number', min: 400, max: 480, step: 0.5 },
    { path: 'OCTAVE_MODE', label: 'Oktav toleransı türü', type: 'select', options: [['free', 'Serbest (her ses ayrı)'], ['anchored', 'Sabit (ilk ses)'], ['off', 'Yok (yazılı oktav)']] },
  ] },
  { title: 'Sınav yapısı', tab: 'std', fields: [
    { path: 'QUESTION_COUNTS.single', label: 'Tek ses · soru sayısı', type: 'number', min: 0, max: 50, step: 1 },
    { path: 'QUESTION_COUNTS.double', label: 'İki ses · soru sayısı', type: 'number', min: 0, max: 50, step: 1 },
    { path: 'QUESTION_COUNTS.triple', label: 'Üç ses · soru sayısı', type: 'number', min: 0, max: 50, step: 1 },
    { path: 'QUESTION_ORDER', label: 'Soru sırası', type: 'select', options: [['grouped', 'Gruplu: tek → iki → üç'], ['shuffled', 'Karışık']] },
    { path: 'REGISTER.minMidi', label: 'Register alt sınırı', type: 'midi' },
    { path: 'REGISTER.maxMidi', label: 'Register üst sınırı', type: 'midi' },
    { path: 'CHORD_RULES.MAX_ALTERED_PER_SET', label: "5'li sette en fazla artmış/eksilmiş", type: 'number', min: 0, max: 10, step: 1 },
    { path: 'CHORD_RULES.ALTERED_CHANCE', label: 'Artmış/eksilmiş bulunma olasılığı (%)', type: 'percent', min: 0, max: 100, step: 5 },
    { path: 'CHORD_RULES.INVERSIONS.root', label: 'Akor durumu ağırlığı · temel durum', type: 'number', min: 0, max: 10, step: 1 },
    { path: 'CHORD_RULES.INVERSIONS.first', label: 'Akor durumu ağırlığı · 1. çevrim (6)', type: 'number', min: 0, max: 10, step: 1 },
    { path: 'CHORD_RULES.INVERSIONS.second', label: 'Akor durumu ağırlığı · 2. çevrim (6/4)', type: 'number', min: 0, max: 10, step: 1 },
    { path: 'SING_ORDER', label: 'Söyleme sırası', type: 'select', options: [['bass', 'En alttaki sesten başla'], ['root', 'Kökten başla']] },
    { path: 'CHORD_RULES.AUGMENTED_INVERSIONS', label: 'Artmış akorun çevrimleri de gelsin', type: 'bool' },
    { path: 'INTERVAL_RULES.POOL', label: 'Aralık havuzu (iki ses)', type: 'multi', wide: true, options: INTERVAL_TYPES.map((t) => [t.id, t.label]) },
  ] },
  { title: 'Sınav akışı ve puan', tab: 'std', fields: [
    { path: 'EXAM.PLAYBACK', label: 'Sınavda çalım biçimi', type: 'select', options: [['harmonic', 'Birlikte (armonik)'], ['melodic', 'Ayrı ayrı (alttan yukarı)'], ['both', 'Önce ayrı, sonra birlikte']] },
    { path: 'EXAM.REVEAL_NOTE_NAMES', label: 'Nota adlarını göster', type: 'select', options: [['after', 'Ses doğrulanınca'], ['end', 'Soru bitince'], ['always', 'Her zaman'], ['never', 'Hiçbir zaman']] },
    { path: 'EXAM.QUESTION_TIME_LIMIT_S', label: 'Soru süre sınırı (sn · 0 = yok)', type: 'number', min: 0, max: 600, step: 5 },
    { path: 'SCORING.REPLAY_PENALTY', label: 'Tekrar başına kesinti (%)', type: 'percent', min: 0, max: 100, step: 5 },
    { path: 'UI.COACH_INTERVAL_MS', label: 'Yönlendirme aralığı (ms)', type: 'number', min: 1000, max: 30000, step: 500 },
    { path: 'EXAM.LIVE_FEEDBACK', label: 'Canlı geri bildirim (ibre, grafik)', type: 'bool' },
    { path: 'EXAM.ALLOW_REPLAY', label: 'Tekrar çalmaya izin ver', type: 'bool' },
    { path: 'EXAM.ALLOW_SKIP', label: 'Soruyu geçmeye izin ver', type: 'bool' },
    { path: 'SCORING.PARTIAL_CREDIT', label: 'Kısmi puan ver', type: 'bool' },
  ] },
  { title: 'Ses ve algılama', tab: 'audio', fields: [
    { path: 'AUDIO.INSTRUMENT', label: 'Çalgı', type: 'select', options: [['piano', 'Piyano (Tone.js)'], ['synth', 'Sentez (çevrimdışı)']] },
    { path: 'AUDIO.CHORD_DURATION_S', label: 'Çalım süresi (sn)', type: 'number', min: 0.3, max: 8, step: 0.1 },
    { path: 'AUDIO.PRACTICE_PLAYBACK', label: 'Serbest çalışma çalım biçimi (varsayılan)', type: 'select', options: [['harmonic', 'Birlikte (armonik)'], ['melodic', 'Ayrı ayrı (alttan yukarı)'], ['both', 'Önce ayrı, sonra birlikte']] },
    { path: 'AUDIO.MELODIC_NOTE_S', label: 'Ayrı çalımda ses süresi (sn)', type: 'number', min: 0.1, max: 5, step: 0.05 },
    { path: 'AUDIO.MELODIC_GAP_S', label: 'Ayrı çalımda sesler arası boşluk (sn)', type: 'number', min: 0, max: 3, step: 0.05 },
    { path: 'AUDIO.BOTH_PAUSE_S', label: 'Akordan önceki bekleme (sn)', type: 'number', min: 0, max: 5, step: 0.05 },
    { path: 'PITCH.ALGORITHM', label: 'Perde algılama', type: 'select', options: [['YIN', 'YIN (dahili)'], ['MPM', 'MPM (pitchy)']] },
    { path: 'PITCH.YIN_THRESHOLD', label: 'YIN eşiği', type: 'number', min: 0.02, max: 0.5, step: 0.01 },
    { path: 'PITCH.YIN_ADAPTIVE_K', label: 'YIN uyarlamalı eşik (0 = klasik)', type: 'number', min: 0, max: 0.99, step: 0.01 },
    { path: 'PITCH.MIN_CLARITY', label: 'En düşük netlik', type: 'number', min: 0.3, max: 0.99, step: 0.01 },
    { path: 'PITCH.MEDIAN_FRAMES', label: 'Medyan filtre (kare)', type: 'number', min: 1, max: 9, step: 1 },
  ] },
  { title: 'Görünüm', tab: 'view', fields: [
    { path: 'UI.VIEW_MODE', label: 'Görünüm varsayılanı', type: 'select', options: [['staff', 'Porte'], ['staff+graph', 'Porte + grafik'], ['graph', 'Grafik (sent)']] },
    { path: 'UI.COACH_FONT_PX', label: 'Yönlendirme yazı boyutu (px)', type: 'number', min: 12, max: 40, step: 1 },
    { path: 'UI.VEXFLOW_PANEL', label: 'Ayrı VexFlow porte paneli', type: 'bool' },
    { path: 'UI.STAFF_WARN_YELLOW', label: 'Portede sınırdayken sarı', type: 'bool' },
  ] },
  // Arayüz adları: CONFIG.TEXTS'teki her ad kendiliğinden listelenir (yeni ad için TEXTS'e eklemek yeter)
  { title: 'Arayüz adları', tab: 'names', intro: () => buildNamesIntro(), fields: textFields((p) => !p.startsWith('COACH.')) },
  { title: 'Yönlendirme cümleleri', tab: 'names', fields: textFields((p) => p.startsWith('COACH.')) },
];
export const fieldId = (path) => `set-${path.replace(/\./g, '-')}`;

export function buildSettingsForm() {
  ui.settingsForm.replaceChildren();
  for (const group of SETTINGS_SCHEMA) {
    const fs = el('fieldset', 'set-group');
    fs.dataset.tab = group.tab;
    fs.append(el('legend', null, group.title));
    if (group.intro) fs.append(group.intro());
    const grid = el('div', 'settings-grid');
    for (const f of group.fields) grid.append(buildField(f));
    fs.append(grid);
    ui.settingsForm.append(fs);
  }
}
export function buildField(f) {
  if (f.type === 'text') {                          // arayüz adı (CONFIG.TEXTS)
    const wrap = el('label', `field${f.wide ? ' wide' : ''}`);
    wrap.append(el('span', null, f.label));
    const input = el('input');
    input.type = 'text';
    input.maxLength = f.max;
    input.placeholder = f.placeholder ?? '';
    input.id = fieldId(f.path);
    input.dataset.path = f.path;
    input.dataset.kind = 'text';
    wrap.append(input);
    return wrap;
  }
  if (f.type === 'bool') {
    const wrap = el('label', 'check');
    const input = el('input');
    input.type = 'checkbox';
    input.id = fieldId(f.path);
    input.dataset.path = f.path;
    input.dataset.kind = 'bool';
    wrap.append(input, document.createTextNode(f.label));
    return wrap;
  }
  if (f.type === 'multi') {
    const wrap = el('div', `field${f.wide ? ' wide' : ''}`);
    wrap.append(el('span', null, f.label));
    const box = el('div', 'checks');
    box.dataset.path = f.path;
    box.dataset.kind = 'multi';
    for (const [value, text] of f.options) {
      const lab = el('label', 'check'), input = el('input');
      input.type = 'checkbox';
      input.value = value;
      lab.append(input, document.createTextNode(text));
      box.append(lab);
    }
    wrap.append(box);
    return wrap;
  }
  const wrap = el('label', `field${f.wide ? ' wide' : ''}`);
  wrap.append(el('span', null, f.label));
  let input;
  if (f.type === 'select' || f.type === 'midi') {
    input = el('select');
    const opts = f.type === 'midi' ? MIDI_OPTIONS.map((m) => [String(m), `${midiName(m)} (MIDI ${m})`]) : f.options;
    for (const [value, text] of opts) input.add(new Option(text, value));
  } else {
    input = el('input');
    input.type = 'number';
    input.min = String(f.min);
    input.max = String(f.max);
    input.step = String(f.step ?? 'any');
    input.inputMode = 'decimal';
  }
  input.id = fieldId(f.path);
  input.dataset.path = f.path;
  input.dataset.kind = f.type;
  wrap.append(input);
  return wrap;
}
export function fillSettingsForm(cfg) {
  for (const node of ui.settingsForm.querySelectorAll('[data-path]')) {
    const v = getPath(cfg, node.dataset.path);
    switch (node.dataset.kind) {
      case 'bool':    node.checked = !!v; break;
      case 'multi':   for (const cb of node.querySelectorAll('input')) cb.checked = Array.isArray(v) && v.includes(cb.value); break;
      case 'percent': node.value = String(Math.round((v ?? 0) * 100)); break;
      default:        node.value = String(v ?? '');
    }
  }
}
/** Formu draft yapılandırmasına okur; hatalı alanların listesini döner */
export function readSettingsForm(draft) {
  const bad = [];
  const labelOf = (path) => SETTINGS_SCHEMA.flatMap((g) => g.fields).find((f) => f.path === path)?.label ?? path;
  for (const node of ui.settingsForm.querySelectorAll('[data-path]')) {
    const path = node.dataset.path;
    switch (node.dataset.kind) {
      case 'bool':   setPath(draft, path, node.checked); break;
      case 'multi':  setPath(draft, path, [...node.querySelectorAll('input:checked')].map((cb) => cb.value)); break;
      case 'select': setPath(draft, path, node.value); break;
      case 'midi':   setPath(draft, path, parseInt(node.value, 10)); break;
      case 'text':   setPath(draft, path, node.value.trim()); break;
      default: {
        const num = parseFloat(String(node.value).replace(',', '.'));
        if (!Number.isFinite(num)) { bad.push(`${labelOf(path)}: sayı girin`); break; }
        setPath(draft, path, node.dataset.kind === 'percent' ? num / 100 : num);
      }
    }
  }
  return bad;
}
// ── Ayarlar sekmeleri: Standart sınav · Ses ve algılama · Görünüm · Arayüz adları · Gelişmiş (JSON) ──
// Form tek parça kalır ("Kaydet ve uygula" bütün sekmelerdeki alanları okur); sekme yalnızca görünürlüğü değiştirir.
export let settingsTab = 'std';
export function showSettingsTab(tab) {
  settingsTab = tab;
  for (const b of ui.settingsPanel.querySelectorAll('.set-tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const n of ui.settingsPanel.querySelectorAll('[data-tab]:not(.tab)')) n.hidden = n.dataset.tab !== tab;
  ui.settingsActions.hidden = tab === 'adv';
}
export function bindSettingsTabs() {
  for (const b of ui.settingsPanel.querySelectorAll('.set-tabs [data-tab]')) b.addEventListener('click', () => showSettingsTab(b.dataset.tab));
  showSettingsTab(settingsTab);
}

export function showSettingsMsg(text, isError = false) {
  ui.settingsMsg.textContent = text;
  ui.settingsMsg.classList.toggle('err', isError);
}
export function refreshJsonArea() {
  ui.jsonArea.value = JSON.stringify(configOverrides, null, 2);
}
export function fillPresetSelect() {
  ui.presetSelect.replaceChildren(new Option('— hazır standart seçin —', ''));
  for (const [key, p] of Object.entries(CONFIG.PRESETS)) ui.presetSelect.add(new Option(p.label, key));
}

export function onApplySettings() {
  const draft = deepClone(CONFIG);
  const bad = readSettingsForm(draft);
  if (bad.length) { showSettingsMsg(bad.join(' · '), true); return; }
  const r = applyOverrides(diffConfig(DEFAULT_CONFIG, draft));
  reportApply(r);
}
export function reportApply(r) {
  if (!r.ok) { showSettingsMsg(`Uygulanmadı: ${r.errors.join(' · ')}`, true); return; }
  const base = Object.keys(configOverrides).length ? 'Kaydedildi ve uygulandı.' : 'Varsayılan ayarlar kullanılıyor.';
  showSettingsMsg(base + (examActive() ? ' Soru yapısıyla ilgili değişiklikler bir sonraki testte geçerli olur.' : '') + (r.warnings.length ? ` Uyarı: ${r.warnings.join('; ')}` : ''));
}
export function onPresetChange() {
  const p = CONFIG.PRESETS[ui.presetSelect.value];
  if (!p) return;
  fillSettingsForm(deepMerge(DEFAULT_CONFIG, p.values));
  showSettingsMsg(`“${p.label}” forma yüklendi — uygulamak için “Kaydet ve uygula”ya basın.`);
}
export function onJsonApply() {
  let parsed;
  try { parsed = JSON.parse(ui.jsonArea.value || '{}'); }
  catch (err) { showSettingsMsg(`JSON okunamadı: ${err.message}`, true); return; }
  if (isPlainObject(parsed) && isPlainObject(parsed.overrides)) parsed = parsed.overrides;   // dışa aktarılmış dosya biçimi
  reportApply(applyOverrides(parsed));
}
export function onJsonExport() {
  const payload = { app: 'Solfej Lab', type: 'settings', version: 1, exportedAt: new Date().toISOString(), overrides: configOverrides };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'solfejlab-ayarlar.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function onJsonImportFile() {
  const file = ui.jsonImport.files?.[0];
  ui.jsonImport.value = '';
  if (!file) return;
  try {
    ui.jsonArea.value = await file.text();
    onJsonApply();
  } catch (err) { showSettingsMsg(`Dosya okunamadı: ${err.message}`, true); }
}
export async function onCopyAll() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2));
    showSettingsMsg('Etkin CONFIG panoya kopyalandı.');
  } catch {
    ui.jsonArea.value = JSON.stringify(CONFIG, null, 2);
    showSettingsMsg('Pano kullanılamadı; etkin CONFIG kutuya yazıldı (uygulamadan önce yalnızca değiştirmek istediklerinizi bırakın).', true);
  }
}


// ── Kalıcılık: tercihler ve özel ayarlar ──
export const PREFS_KEY = 'solfejlab.prefs.v1';
export const CONFIG_KEY = 'solfejlab.config.v1';
export let configOverrides = {};

export function storageGet(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
}
export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function storageRemove(key) { try { localStorage.removeItem(key); } catch { /* yoksay */ } }

export function savePrefs() {
  if (!uiReady) return;
  storageSet(PREFS_KEY, {
    mode, gateDb: settings.rmsDb, fold: settings.fold,   // görünüm seçimi artık solfejlab.ui.v1'de (eski staffView bir kez çevrilir)
    practice: { root: ui.root.value, octave: ui.octave.value, type: ui.type.value, inv: ui.inversion.value },
    playback: practicePlayback(),                   // serbest çalışma "Çalım biçimi"
  });
}

/** CONFIG nesnesinin içeriğini yerinde değiştirir (referansı tutan her yer güncel değeri görür) */
export function replaceConfig(next) {
  for (const k of Object.keys(CONFIG)) delete CONFIG[k];
  Object.assign(CONFIG, deepClone(next));
}

/**
 * Özel ayarları ayıklar, varsayılanlarla birleştirir, doğrular ve uygular.
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
export function applyOverrides(over, { persist = true } = {}) {
  const { clean, warnings } = sanitizeOverrides(over, DEFAULT_CONFIG);
  const merged = deepMerge(DEFAULT_CONFIG, clean);
  const errors = validateConfig(merged);
  if (errors.length) return { ok: false, errors, warnings };
  const prev = deepClone(CONFIG);
  replaceConfig(merged);
  configOverrides = diffConfig(DEFAULT_CONFIG, merged);
  if (persist) {
    if (Object.keys(configOverrides).length) storageSet(CONFIG_KEY, configOverrides);
    else storageRemove(CONFIG_KEY);
  }
  onConfigChanged(prev);
  return { ok: true, errors: [], warnings };
}

/** Yapılandırma değişince arayüz ve alt sistemleri günceller */
export function onConfigChanged(prev) {
  if (!uiReady) return;
  paintGaugeBackground();
  buildTicks();
  updateHeaderText();
  updateFoldUi();
  updateThresholdUi();
  renderConfigChip();
  tracker.reset();
  assignMedianFilter(new MedianFilter(CONFIG.PITCH.MEDIAN_FRAMES));
  if (masterGain) masterGain.gain.value = CONFIG.AUDIO.MASTER_GAIN;
  if (audioCtx && analyser) setupDetector().catch((err) => console.warn('[algılama]', err));
  else renderDetectorChip();

  // Piyano yalnızca ilgili ayar değişince yeniden kurulur (başarısız yükleme her kayıtta tekrar denenmez)
  const pianoChanged = !!prev && (JSON.stringify(prev.REGISTER) !== JSON.stringify(CONFIG.REGISTER)
    || JSON.stringify(prev.AUDIO.PIANO) !== JSON.stringify(CONFIG.AUDIO.PIANO));
  const instrumentChanged = !!prev && prev.AUDIO.INSTRUMENT !== CONFIG.AUDIO.INSTRUMENT;
  if (pianoChanged || (instrumentChanged && piano.state === 'failed')) resetPiano();
  if (CONFIG.AUDIO.INSTRUMENT === 'piano' && (pianoChanged || instrumentChanged || piano.state === 'off')) preparePiano();
  if (piano.sampler) piano.sampler.volume.value = CONFIG.AUDIO.PIANO.VOLUME_DB;
  renderEngineChip();

  if (!session && mode === 'practice' && prev && prev.A4_HZ !== CONFIG.A4_HZ && (fsm.state === S.IDLE || fsm.state === S.COMPLETE)) {
    selectionChanged();
  }
  updateVexPanel();
  applyCoachFont();
  applyTexts();
  fillSettingsForm(CONFIG);
  refreshJsonArea();
  renderHistory();
  renderAll();
  drawContour(performance.now());
}
