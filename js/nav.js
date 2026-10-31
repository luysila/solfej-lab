// Solfej Lab — js/nav.js
// Bölümler ve menü: üst çubuktaki "Menü" (yukarıdan açılan dikey liste), aynı anda tek bölüm, adres çubuğunda bölüm
// (#ana-sayfa, #sinav, #kendi-sinavim, #serbest, #gecmis, #ayarlar, #yardim), tarayıcının geri tuşu, son kullanılan bölüm.
// Sınav ve Serbest çalışma aynı çalışma alanını (#workspace) kullanır; alan bölümler arasında taşınır (setMode).

import { examActive, mode, ui } from './ui.js';
import { pauseFlow, setMode } from './app.js';
import { setExamTab } from './custom.js';
import { storageGet, storageSet } from './settings.js';

/** Adres → bölüm. "kendi-sinavim" Sınav bölümünü "Kendi sınavını hazırla" sekmesiyle açar. */
export const SECTIONS = {
  'ana-sayfa': 'sec-home', sinav: 'sec-exam', 'kendi-sinavim': 'sec-exam', serbest: 'sec-practice',
  gecmis: 'sec-history', ayarlar: 'sec-settings', yardim: 'sec-help',
};
export const SECTION_ORDER = ['ana-sayfa', 'sinav', 'serbest', 'gecmis', 'ayarlar', 'yardim'];
export const UI_STATE_KEY = 'solfejlab.ui.v1';     // arayüz durumu (son bölüm …); kayıt biçimi değişirse sürümü artır
export let currentSection = null;

export function loadUiState() { const v = storageGet(UI_STATE_KEY, {}); return v && typeof v === 'object' ? v : {}; }
export function saveUiState(patch) { storageSet(UI_STATE_KEY, { ...loadUiState(), ...patch }); }

const hashKey = () => decodeURIComponent(location.hash.replace(/^#/, ''));

/** Bölüme git (adres çubuğu değişir → geri tuşu çalışır) */
export function goSection(key) {
  if (!SECTIONS[key]) key = 'ana-sayfa';
  if (hashKey() === key) showSection(key);
  else location.hash = key;
}

/** Bölümü gösterir. Çalışma sürerken başka bölüme geçilirse kendiliğinden duraklar. */
export function showSection(key) {
  if (!SECTIONS[key]) key = 'ana-sayfa';
  const id = SECTIONS[key];
  const work = id === 'sec-exam' ? 'exam' : id === 'sec-practice' ? 'practice' : null;
  const examBusy = examActive();                    // sınav sürüyor (duraklatılmış da olabilir)
  // Çalışma alanından ayrılırken duraklat (sınav sürerken serbest çalışmaya geçmek de ayrılmaktır)
  if (work !== mode || (work === 'practice' && examBusy)) pauseFlow();
  if (work === 'exam' && mode !== 'exam') setMode('exam');
  if (work === 'practice' && !examBusy && mode !== 'practice') setMode('practice');
  // Sınav sürerken Serbest çalışma bölümü yalnızca uyarı gösterir; çalışma alanı sınavda kalır
  ui.practiceBusy.hidden = !(work === 'practice' && examBusy);
  ui.practiceControls.hidden = work === 'practice' && examBusy;
  if (work === 'exam' || (work === 'practice' && !examBusy)) (work === 'exam' ? ui.examSlot : ui.practiceSlot).append(ui.workspace);
  if (work === 'exam') setExamTab(key === 'kendi-sinavim' ? 'custom' : 'std');   // #kendi-sinavim → "Kendi sınavını hazırla" sekmesi

  for (const sec of document.querySelectorAll('main > .section')) sec.hidden = sec.id !== id;
  for (const a of ui.menuList.querySelectorAll('a[data-sec]')) {
    if (a.dataset.sec === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  currentSection = key;
  saveUiState({ section: key });
  closeMenu();
  window.scrollTo(0, 0);
}

// ── Menü ──
export function openMenu() {
  ui.menuList.hidden = false;
  ui.menuBtn.setAttribute('aria-expanded', 'true');
  (ui.menuList.querySelector('[aria-current]') || ui.menuList.querySelector('a'))?.focus({ preventScroll: true });
}
export function closeMenu() {
  if (ui.menuList.hidden) return;
  ui.menuList.hidden = true;
  ui.menuBtn.setAttribute('aria-expanded', 'false');
}
export function toggleMenu() { if (ui.menuList.hidden) openMenu(); else closeMenu(); }

export function bindNav() {
  ui.menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  ui.menuList.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('click', (e) => {          // dışarı tıklayınca kapanır
    if (!ui.menuList.hidden && !e.target.closest('#menuList') && !e.target.closest('#menuBtn')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.menuList.hidden) { closeMenu(); ui.menuBtn.focus(); }
  });
  window.addEventListener('hashchange', () => showSection(hashKey()));
}

/** İlk açılış: adresteki bölüm; yoksa son kullanılan; o da yoksa Ana sayfa */
export function initNav() {
  let key = hashKey();
  if (!SECTIONS[key]) key = SECTIONS[loadUiState().section] ? loadUiState().section : 'ana-sayfa';
  history.replaceState(null, '', `${location.pathname}${location.search}#${key}`);   // yeni geçmiş girişi açmadan
  showSection(key);
}
