// Solfej Lab — js/ui.js
// Arayüz: DOM bağlantıları (ui), paylaşılan durum (mode, session, exercise, fsm…), nota kutuları, durum metni,
// sınav ilerleme şeridi, çipler, dikey akort aleti, yönlendirme satırı.

import { CONFIG } from './config.js';
import { INVERSION_LABEL, orderForSinging } from './pure.js';
import { ALLOWED, CHORD_TYPES, CoachWindow, Exercise, KINDS, KIND_LABEL, MINUS, ROOTS, S, SustainTracker, TYPE_BY_ID, buildNotes, clamp, createMachine, getPath, midiName, semitoneNeighbors, solfege, spell } from './pure.js';
import { audioCtx, ensureAudio, piano, playMelodic, stopAllSound } from './audio.js';
import { detector, explainError, micStream, settings } from './mic.js';
import { drawContour, scheduleStaffDraw } from './staff.js';
import { T, btnName, configOverrides, editNames, savePrefs, setTextKey, unlockForEditing } from './settings.js';
import { hardReset, onStateChange, rafId } from './app.js';
import { renderExamPanel } from './custom.js';
import { practiceTab, renderPracticePanel } from './drill.js';

// ───────────────────────────────────────────────────────────────────────
// 5) ARAYÜZ
// ───────────────────────────────────────────────────────────────────────
export const $ = (id) => document.getElementById(id);
export const ui = {
  sub: $('subLine'), micChip: $('micChip'), micChipText: $('micChipText'), engineChip: $('engineChip'), engineChipText: $('engineChipText'),
  detChip: $('detChip'), latChip: $('latChip'), cfgChip: $('cfgChip'), alert: $('alert'), notice: $('notice'),
  resumeBanner: $('resumeBanner'), resumeText: $('resumeText'), resumeBtn: $('resumeBtn'),
  examControls: $('examControls'), practiceControls: $('practiceControls'), practiceBusy: $('practiceBusy'),
  singleFields: $('singleFields'), drillSetup: $('drillSetup'), drillStart: $('drillStartBtn'), drillSkip: $('drillSkipBtn'), drillStop: $('drillStopBtn'),
  drillResult: $('drillResult'), drillMeta: $('drillMeta'), drillList: $('drillList'), drillAgain: $('drillAgainBtn'), drillClose: $('drillCloseBtn'),
  historyFilter: $('historyFilter'), shortcutsPanel: $('shortcutsPanel'), shortcutHelp: $('shortcutHelp'), scHelpList: $('scHelpList'), scHelpClose: $('scHelpClose'),
  customExam: $('customExam'), sumAnswersWrap: $('sumAnswersWrap'), sumAnswers: $('sumAnswers'),
  menuBtn: $('menuBtn'), menuList: $('menuList'), workspace: $('workspace'), examSlot: $('examSlot'), practiceSlot: $('practiceSlot'),
  examPause: $('examPauseBtn'), practicePause: $('practicePauseBtn'), settingsActions: $('settingsActions'),
  examInfo: $('examInfo'), startBtn: $('startBtn'), examReplay: $('examReplayBtn'), skipBtn: $('skipBtn'), endBtn: $('endBtn'),
  root: $('rootSelect'), octave: $('octaveSelect'), type: $('typeSelect'), inversion: $('inversionSelect'), inversionField: $('inversionField'), play: $('playBtn'), replay: $('replayBtn'), reset: $('resetBtn'),
  device: $('deviceSelect'), fold: $('foldToggle'), foldHint: $('foldHint'),
  examStaffToggle: $('examStaffToggle'), examStaffSwitch: $('examStaffSwitch'), viewSeg: $('viewSeg'),
  summaryPanel: $('summaryPanel'), sumMeta: $('sumMeta'), sumScore: $('sumScore'), sumScoreSub: $('sumScoreSub'), sumTendency: $('sumTendency'),
  sumBiasMark: $('sumBiasMark'), sumBiasMin: $('sumBiasMin'), sumBiasMax: $('sumBiasMax'), sumHardest: $('sumHardest'), sumHardestWhy: $('sumHardestWhy'),
  sumRows: $('sumRows'), sumRoles: $('sumRoles'), sumAdvice: $('sumAdvice'), sumNew: $('sumNewBtn'), sumClose: $('sumCloseBtn'),
  exTitle: $('exTitle'), stateLabel: $('stateLabel'), progress: $('examProgress'), progressText: $('progressText'), progressTimer: $('progressTimer'),
  segments: $('segments'), notes: $('notes'), status: $('statusLine'), coach: $('coachLine'),
  staffPanel: $('staffPanel'), staff: $('staff'), staffMsg: $('staffMsg'),
  tuner: $('tuner'), targetName: $('targetName'), targetFreq: $('targetFreq'), centsVal: $('centsVal'),
  heardFreq: $('heardFreq'), heardNote: $('heardNote'), gauge: $('gauge'), ticks: $('ticks'), needle: $('needle'),
  vgAbove: $('vgAbove'), vgTarget: $('vgTarget'), vgBelow: $('vgBelow'),
  sustainFill: $('sustainFill'), sustainText: $('sustainText'), contour: $('contour'), contourSpan: $('contourSpan'), contourTol: $('contourTol'),
  staffSpan: $('staffSpan'),
  levelFill: $('levelFill'), levelThr: $('levelThr'), thr: $('thrRange'), thrText: $('thrText'), clarityText: $('clarityText'),
  historyEmpty: $('historyEmpty'), historyChart: $('historyChart'), historyList: $('historyList'), historyClear: $('historyClear'),
  settingsPanel: $('settingsPanel'), presetSelect: $('presetSelect'), settingsForm: $('settingsForm'), applySettings: $('applySettings'),
  resetSettings: $('resetSettings'), settingsMsg: $('settingsMsg'), jsonArea: $('jsonArea'), jsonApply: $('jsonApply'),
  jsonExport: $('jsonExport'), jsonImportBtn: $('jsonImportBtn'), jsonImport: $('jsonImport'), jsonCopyAll: $('jsonCopyAll'),
  editBar: $('editBar'), editCopyBtn: $('editCopyBtn'), editDoneBtn: $('editDoneBtn'),
};

export const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nfMax1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
export const dateFmt  = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const shortDay = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit' });
export const fmtCents = (c) => `${c < 0 ? MINUS : '+'}${nf0.format(Math.abs(c))} sent`;
export const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const fmtDuration = (ms) => { const s = Math.round(ms / 1000), m = Math.floor(s / 60); return m ? `${m} dk ${s % 60} sn` : `${s} sn`; };
export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const STATE_TEXT  = { IDLE: 'Hazır', PLAYING: 'Çalıyor', LISTENING: 'Dinliyor', VERIFIED: 'Doğrulandı', COMPLETE: 'Soru bitti', SUMMARY: 'Test bitti' };
export const STATUS_TEXT = { pending: 'sırada', current: 'şu an', done: 'tam', partial: 'kısmi', skipped: 'geçildi', timeout: 'süre doldu', unanswered: 'cevaplanmadı' };
// Anlık değişen uyarı yazıları (HINTS / ZONE_TEXT) kaldırıldı: yönlendirme artık aralıklı → CONFIG.TEXTS.COACH, setCoach()

export const ICON_ATTR = 'viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const BADGE = {
  locked: `<svg ${ICON_ATTR}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  ready:  '',
  active: `<svg ${ICON_ATTR}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  done:   `<svg ${ICON_ATTR}><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  missed: `<svg ${ICON_ATTR}><path d="M7 7l10 10M17 7L7 17"/></svg>`,
};

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
/** DOM yazımını azaltmak için: yalnızca metin değiştiyse yazar */
export function setText(node, text) {
  if (node.__t !== text) { node.textContent = text; node.__t = text; }
}

// ── Durum ──
export let mode = 'exam';                      // 'exam' | 'practice'
export let session = null;                     // ExamSession (sınav modunda)
export let lastDiag = null;                    // son teşhis
export let exercise = new Exercise([]);
export let practiceTitle = '';
export const tracker = new SustainTracker(CONFIG);
export const fsm = createMachine(ALLOWED, S.IDLE, onStateChange);
export let noteEls = [];
export let starting = false;                   // başlat'a basıldı, mikrofon izni / yükleme bekleniyor
export let uiReady = false;
export let paused = false;                     // "Duraklat": dinleme ve soru süresi durur (durum makinesi olduğu yerde bekler)
export let pausedSince = 0;                    // duraklatmanın başladığı an (Date.now) → sınav saatinden düşülür
export let bgPaused = false;                   // duraklatmanın sebebi: sekme / uygulama arka plana geçti (telefon)
export function assignBgPaused(v) { bgPaused = v; }

/** Duraklatma durumunu değiştirir; sınav oturumunda duraklı geçen süreyi biriktirir (renderTimer bunu düşer) */
export function setPausedState(on) {
  if (!on) bgPaused = false;
  if (on === paused) return;
  if (!on && session && pausedSince) session.pausedMs = (session.pausedMs || 0) + (Date.now() - pausedSince);
  paused = on;
  pausedSince = on ? Date.now() : 0;
}

// Akış jetonu: sıfırlama / yeni test sonrası eski zamanlayıcılar etkisiz kalır
export let flowToken = 0, flowTimer = 0;
export function after(ms, fn) {
  clearTimeout(flowTimer);
  const token = flowToken;
  flowTimer = setTimeout(() => { if (token === flowToken) fn(); }, ms);
}
export function cancelFlow() { flowToken++; clearTimeout(flowTimer); }

// Sınav ile alıştırma (serbest çalışma "Alıştırma") aynı oturum altyapısını kullanır; session.drill alıştırmayı ayırt eder
export const isExam  = () => !!session && !session.drill;
export const isDrill = () => !!session?.drill;
export const examActive  = () => isExam() && fsm.state !== S.IDLE && fsm.state !== S.SUMMARY;
export const drillActive = () => isDrill() && fsm.state !== S.IDLE && fsm.state !== S.SUMMARY;
/** Sınav akışının etkin ayarı: oturum varsa oturumun (özel sınavda kendi ayarı), yoksa genel CONFIG */
export const activeCfg = () => session?.cfg ?? CONFIG;
/** Şu an duraklatılabilir mi? Sınav sürerken ya da serbest çalışmada çalım / dinleme / doğrulama sırasında */
export const canPauseNow = () => !paused && (examActive() || drillActive() || (mode === 'practice' && !session && [S.PLAYING, S.LISTENING, S.VERIFIED].includes(fsm.state)));
export const gaugeRange = () => Math.max(CONFIG.UI.GAUGE_RANGE_CENTS, activeCfg().WARNING_CENTS + 5);
export const biasRange  = () => Math.max(30, Math.round(activeCfg().TOLERANCE_CENTS * 1.5));

/** Nota adı görünür mü? (serbest çalışmada her zaman; sınavda REVEAL_NOTE_NAMES'e göre) */
export function isNoteRevealed(i) {
  if (!session) return true;
  const rv = activeCfg().EXAM.REVEAL_NOTE_NAMES;
  if (rv === 'always') return true;
  if (rv === 'never' || rv === 'session') return false;          // 'session': cevaplar teşhis ekranında açılır
  const ended = session.result && session.result.status !== 'pending';
  if (rv === 'end') return !!ended;
  return !!exercise.verified[i] || !!ended;                           // 'after'
}
export function answerVisible() {
  if (!session) return true;
  const rv = activeCfg().EXAM.REVEAL_NOTE_NAMES;
  if (rv === 'never' || rv === 'session') return false;
  if (rv === 'always') return true;
  return !!(session.result && session.result.status !== 'pending');
}

// ── Seçim kutuları (serbest çalışma) ──
export function fillSelects() {
  ROOTS.forEach((r, i) => ui.root.add(new Option(`${spell(r.letter, r.acc)} · ${solfege(r.letter, r.acc)}`, String(i))));
  ui.root.value = '0';
  [2, 3, 4, 5].forEach((o) => ui.octave.add(new Option(`Oktav ${o}`, String(o))));
  ui.octave.value = '4';
  let group = null, lastGroup = '';
  for (const t of CHORD_TYPES) {
    if (t.group !== lastGroup) {
      group = document.createElement('optgroup');
      group.label = t.group;
      ui.type.append(group);
      lastGroup = t.group;
    }
    group.append(new Option(t.label, t.id));
  }
  ui.type.value = 'major';
}

/** Söyleme talimatı: "en alttaki sesten başlayarak" (varsayılan) ya da "kökten başlayarak" (CONFIG.SING_ORDER) */
export const singFrom = () => T(CONFIG.SING_ORDER === 'root' ? 'singFromRoot' : 'singFromBass');

/** Kök / oktav / tip / durum değişince: yeni egzersiz kur, her şeyi sıfırla */
export function selectionChanged() {
  const root = ROOTS[+ui.root.value] ?? ROOTS[0];
  const octave = +ui.octave.value || 4;
  const type = TYPE_BY_ID[ui.type.value] ?? TYPE_BY_ID.major;
  ui.inversionField.hidden = type.kind !== 'chord';             // "Durum" yalnız akorlarda
  const inv = type.kind === 'chord' ? (+ui.inversion.value || 0) : 0;
  exercise = new Exercise(orderForSinging(buildNotes(root, octave, type, CONFIG.A4_HZ, inv), CONFIG.SING_ORDER));
  const rootName = spell(root.letter, root.acc);
  practiceTitle = type.kind === 'chord' ? `${rootName} ${type.label}${inv ? ` · ${INVERSION_LABEL(inv)}` : ''}`
    : type.kind === 'single' ? `${rootName}${octave}` : `${rootName} · ${type.label}`;
  buildNoteBoxes();
  hardReset();
  savePrefs();
}

export function updateFoldUi() {
  ui.fold.checked = settings.fold;
  ui.foldHint.textContent = !settings.fold
    ? 'Kapalı: sesleri yazıldıkları oktavda söyleyin.'
    : CONFIG.OCTAVE_MODE === 'anchored'
      ? 'Açık: sesinize uygun oktavda söyleyin; ilk sesin oktavı soru boyunca korunur.'
      : CONFIG.OCTAVE_MODE === 'free'
        ? 'Açık: sesinize uygun oktavda söyleyin (oktav aralığında ilk sesin oktavı korunur).'
        : 'Ayarlarda oktav modu "yok": mutlak oktav.';
}

export function buildNoteBoxes() {
  ui.notes.replaceChildren();
  if (!exercise.notes.length) {
    const msg = el('p', 'empty-notes', mode === 'exam' || practiceTab === 'drill' ? 'Soru başlayınca okunacak sesler burada görünür.' : 'Bir ses, aralık ya da akor seçin.');
    ui.notes.append(msg);
    noteEls = [];
    return;
  }
  const playable = mode === 'practice' && !isExam();  // sınavda nota kutuları hiçbir şey çalmaz; alıştırmada ipucu
  noteEls = exercise.notes.map((n, i) => {
    const box = el('div', 'note');
    box.setAttribute('role', playable ? 'button' : 'listitem');
    const name = el('span', 'name', n.name), sub = el('span', 'sub', ''), badge = el('span', 'badge');
    box.append(el('span', 'step', `${i + 1} · ${n.role}`), name, sub, badge);
    if (playable) {                                   // tıkla / Enter / Boşluk → yalnızca bu ses çalar
      box.tabIndex = 0;
      box.title = T('notePlayHint');
      box.setAttribute('aria-label', `${T('notePlayHint')}: ${n.name} (${n.solfege})`);
      box.style.cursor = 'pointer';
      box.addEventListener('click', () => onNoteBoxPlay(i));
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNoteBoxPlay(i); }
      });
    }
    ui.notes.append(box);
    return { box, name, sub, badge };
  });
}
/**
 * Serbest çalışmada tek sesi çalar.
 *  Dinlerken → PLAYING'den geçilir (ölçüm durur), çalım bitince aynı seste dinleme sürer; doğrulananlar korunur.
 *  Hazır / bitmiş → yalnızca ses çalar, dinleme başlamaz. Çalarken ve doğrulama anında yok sayılır.
 */
export async function onNoteBoxPlay(i) {
  if (isExam() || mode !== 'practice' || starting || paused || !exercise.notes[i]) return;
  const st = fsm.state;
  if (st === S.LISTENING) { fsm.go(S.PLAYING, { single: i }); return; }
  if (st !== S.IDLE && st !== S.COMPLETE) return;
  if (isDrill() && st === S.COMPLETE) return;       // alıştırmada sıradaki soru çalınmak üzere
  try { await ensureAudio(); } catch (err) { showAlert(explainError(err)); return; }
  stopAllSound();
  playMelodic([exercise.notes[i]], 'melodic');
}

export function noteState(i) {
  if (exercise.verified[i]) return 'done';
  const r = session?.result;
  if (exercise.abandoned || (r && ['partial', 'skipped', 'timeout'].includes(r.status))) return 'missed';
  if (i === exercise.index) return fsm.state === S.LISTENING ? 'active' : 'ready';
  return 'locked';
}

// ── Durum değişiminde çizim (yalnızca geçişlerde; kare başına değil) ──
export function renderNotes() {
  const st = fsm.state;
  noteEls.forEach((ref, i) => {
    const s = noteState(i), n = exercise.notes[i], rev = isNoteRevealed(i);
    if (ref.box.dataset.state !== s) {
      ref.box.dataset.state = s;
      ref.badge.innerHTML = BADGE[s] ?? '';                                    // sabit, güvenli SVG dizeleri
    }
    setText(ref.name, rev ? n.name : '?');
    ref.name.classList.toggle('hidden-name', !rev);
    setText(ref.sub, rev ? `${n.solfege} · ${n.fullName} · ${nf1.format(n.freq)} Hz` : s === 'active' ? 'şimdi söyleyin' : 'dinleyip söyleyin');
    ref.box.classList.toggle('flash', st === S.VERIFIED && i === exercise.index);
  });
}

export function renderExTitle() {
  if (session && session.current) {
    const q = session.current;
    const head = session.drill ? `Alıştırma · soru ${session.index + 1}${session.drill.count ? `/${session.questions.length}` : ''}` : `Soru ${session.index + 1}/${session.questions.length}`;
    setText(ui.exTitle, `${head} · ${KIND_LABEL[q.kind]}${answerVisible() ? ` · ${q.title}` : ''}`);
  } else setText(ui.exTitle, mode === 'practice' && practiceTab === 'single' ? practiceTitle : '');
}

export function renderStatus() {
  const st = fsm.state, cur = exercise.current;
  const sec = nf2.format(activeCfg().SUSTAIN_TIME_MS / 1000);
  let msg = '';
  if (session && session.current) {
    const q = session.current, N = session.questions.length, n = session.index + 1, res = session.result;
    const drill = !!session.drill;
    const head = drill ? `Alıştırma · soru ${n}${session.drill.count ? `/${N}` : ''}` : `Soru ${n}/${N}`;
    switch (st) {
      case S.PLAYING:
        msg = `${head} · ${KIND_LABEL[q.kind]}: ${q.notes.length > 1 ? 'sesler aynı anda çalınıyor' : 'ses çalınıyor'} — dikkatle dinleyin…`;
        break;
      case S.LISTENING: {
        const rev = isNoteRevealed(exercise.index);
        const who = q.notes.length === 1
          ? (rev ? `${cur.name} (${cur.solfege})` : 'Sesi')
          : rev ? `${cur.role}: ${cur.name} (${cur.solfege})` : `${exercise.index + 1}. ses (${cur.role.toLocaleLowerCase('tr')})`;
        msg = q.notes.length > 1
          ? `${who} — ${singFrom()} sırayla, “na” hecesiyle söyleyin ve ${sec} sn sabit tutun.`
          : `${who} “na” hecesiyle söyleyin ve ${sec} sn sabit tutun.`;
        break;
      }
      case S.VERIFIED:
        msg = exercise.index + 1 < exercise.notes.length ? 'Doğrulandı ✓ — sıradaki sesin kilidi açılıyor…' : 'Doğrulandı ✓';
        break;
      case S.COMPLETE: {
        const answer = answerVisible() ? q.title : '';
        if (drill) {                                // alıştırma: "Bu soru: C Majör · 1. çevrim (6) ✓"
          const what = res.status === 'done' ? '✓' : res.status === 'partial' ? '· kısmen' : '· geçildi';
          msg = answer ? `${T('drThisQuestion')}: ${answer} ${what}` : res.status === 'done' ? 'Soru tamamlandı ✓' : `Soru ${what.replace('· ', '')}`;
          if (!session.isLast) msg += ' — sıradaki soruya geçiliyor…';
          break;
        }
        if (res.status === 'done') msg = `Soru tamamlandı ✓${answer ? ` · ${answer}` : ''}`;
        else {
          const what = res.endReason === 'timeout' ? 'Süre doldu' : res.status === 'partial' ? 'Soru kısmen tamamlandı' : 'Soru geçildi';
          msg = `${what}${answer ? ` · doğru cevap: ${answer}` : ''}`;
        }
        if (!session.isLast) msg += ' — sıradaki soruya geçiliyor…';
        break;
      }
      case S.SUMMARY: msg = drill ? 'Alıştırma bitti.' : 'Test bitti — teşhis ekranı yukarıda.'; break;
      default: msg = '';
    }
  } else if (mode === 'exam') {
    msg = starting ? 'Hazırlanıyor… (ilk kullanımda mikrofon izni istenir)'
      : `“${btnName('btnStart')}” düğmesine basın. Her soruda sesler aynı anda çalınır; ardından ${singFrom()} “na” hecesiyle sırayla söylersiniz.`;
  } else {
    switch (st) {
      case S.IDLE:      msg = practiceTab === 'drill'
        ? `Soru tiplerini ve seçenekleri belirleyip “${btnName('btnDrillStart')}” düğmesine basın. Sorular rastgele gelir; cevap seçtiğiniz zamanda açılır.`
        : `Bir ses, aralık ya da akor seçip “${btnName('btnPlay')}” düğmesine basın. İlk kullanımda mikrofon izni istenir.`; break;
      case S.PLAYING:   msg = `Çalıyor — ${singFrom()} sesleri ayırt etmeye çalışın…`; break;
      case S.LISTENING: msg = `${cur.role}: ${cur.name} (${cur.solfege}) sesini “na” ile söyleyin ve yeşil bölgede ${sec} sn sabit tutun.`; break;
      case S.VERIFIED:  msg = 'Doğrulandı ✓ — sıradaki sese geçiliyor…'; break;
      default:          msg = 'Tebrikler! Tüm sesleri sırayla ve sabit biçimde okudunuz.';
    }
  }
  if (paused) msg = `${T('statePaused')} — sürdürmek için “${btnName('btnResume')}” düğmesine basın.`;
  setText(ui.status, msg);
  setText(ui.stateLabel, paused ? T('statePaused') : STATE_TEXT[st]);
  ui.stateLabel.dataset.s = paused ? 'PAUSED' : st;
}

// ── Sınav ilerleme şeridi ──
export let segEls = [], segSession = null;
export function renderProgress() {
  ui.progress.hidden = !session || (!!session.drill && !session.drill.count);   // "durdurana kadar" alıştırmasında şerit yok
  if (ui.progress.hidden) { segSession = null; return; }
  if (segSession !== session) {
    segSession = session;
    ui.segments.replaceChildren();
    segEls = session.questions.map((q, i) => {
      const s = el('span', 'seg');
      if (i > 0 && session.questions[i - 1].kind !== q.kind) s.classList.add('gap');
      s.setAttribute('role', 'listitem');
      ui.segments.append(s);
      return s;
    });
  }
  const st = fsm.state;
  session.results.forEach((r, i) => {
    let s = r.status;
    if (s === 'pending') s = i === session.index && st !== S.SUMMARY ? 'current' : 'pending';
    if (segEls[i].dataset.s !== s) {
      segEls[i].dataset.s = s;
      const label = `Soru ${i + 1} · ${KIND_LABEL[session.questions[i].kind]} · ${STATUS_TEXT[s] ?? s}`;
      segEls[i].title = label;
      segEls[i].setAttribute('aria-label', label);
    }
  });
  setText(ui.progressText, st === S.SUMMARY
    ? `Test bitti · ${session.attempted.length}/${session.questions.length} soru cevaplandı`
    : `Soru ${session.index + 1} / ${session.questions.length} · ${KIND_LABEL[session.current.kind]}`);
  renderTimer();
}
export function renderTimer() {
  if (!session) return;
  const limit = activeCfg().EXAM.QUESTION_TIME_LIMIT_S;
  if (limit > 0 && fsm.state !== S.SUMMARY) {
    const left = Math.max(0, limit - (session.result?.listenMs ?? 0) / 1000);
    setText(ui.progressTimer, `kalan ${nf0.format(Math.ceil(left))} sn`);
  } else {
    const pausedMs = (session.pausedMs || 0) + (paused && pausedSince ? Date.now() - pausedSince : 0);
    setText(ui.progressTimer, fmtClock((session.finishedAt ?? Date.now()) - session.startedAt - pausedMs));
  }
}

export function renderAll() {
  const st = fsm.state, active = examActive(), dActive = drillActive();
  ui.device.disabled = !micStream || !ui.device.options.length || active || dActive || starting;
  // Duraklat / Devam (sınav ve serbest çalışma kontrollerinde)
  const pausable = paused || canPauseNow();
  for (const b of [ui.examPause, ui.practicePause]) { b.disabled = !pausable; setTextKey(b, paused ? 'btnResume' : 'btnPause'); }
  // Sınav düğmeleri
  ui.startBtn.disabled = starting || active;
  setTextKey(ui.startBtn, st === S.SUMMARY ? 'btnNewTest' : 'btnStart');
  ui.examReplay.disabled = paused || !(active && st === S.LISTENING && activeCfg().EXAM.ALLOW_REPLAY);
  ui.skipBtn.disabled = paused || !(active && st === S.LISTENING && activeCfg().EXAM.ALLOW_SKIP);
  ui.endBtn.disabled = !active;
  // Serbest çalışma düğmeleri
  ui.play.disabled = starting || !!session || !(st === S.IDLE || st === S.COMPLETE) || !exercise.notes.length;
  ui.replay.disabled = paused || st !== S.LISTENING || isExam();
  ui.drillSkip.disabled = paused || !(dActive && st === S.LISTENING);
  ui.drillStop.disabled = !dActive;
  ui.reset.disabled = !!session || st === S.IDLE;
  setTextKey(ui.play, st === S.COMPLETE ? 'btnRestart' : 'btnPlay');
  // Hedef göstergesi
  const cur = exercise.current;
  const showTarget = cur && (st === S.LISTENING || st === S.VERIFIED);
  const rev = cur && isNoteRevealed(exercise.index);
  setText(ui.targetName, showTarget ? (rev ? cur.name : `${exercise.index + 1}. ses`) : '—');
  setText(ui.targetFreq, showTarget ? (rev ? `${cur.fullName} · ${nf1.format(cur.freq)} Hz` : `${cur.role} · gizli`) : '— Hz');
  renderGaugeNames(showTarget && rev ? cur : null);

  renderNotes();
  renderExTitle();
  renderStatus();
  renderProgress();
  renderExamPanel();
  renderPracticePanel();
  scheduleStaffDraw();
  if (!rafId) drawContour(performance.now());      // mikrofon kapalıyken ana döngü çizmez: porte durum değişiminde güncellenir
  if (editNames) unlockForEditing();                // ad düzenleme modunda devre dışı düğmelere de tıklanabilsin
}

export function showAlert(msg) { ui.alert.textContent = msg; ui.alert.hidden = false; }
export function hideAlert()    { ui.alert.hidden = true; }
export let noticeTimer = 0;
export function showNotice(msg, ms = 12000) {
  ui.notice.textContent = msg;
  ui.notice.hidden = false;
  clearTimeout(noticeTimer);
  if (ms) noticeTimer = setTimeout(() => { ui.notice.hidden = true; }, ms);
}
/** Telefon/tablet durum mesajı + tek düğme (arka planda durakladı → "Devam et"; ses askıda → "Sesi aç"). Mantık app.js → refreshResumeBanner */
export function showResumeBanner(textKey, btnKey) {
  if (!ui.resumeBanner) return;
  setTextKey(ui.resumeText, textKey);
  setTextKey(ui.resumeBtn, btnKey);
  ui.resumeBanner.dataset.kind = textKey;
  ui.resumeBanner.hidden = false;
}
export function hideResumeBanner() { if (ui.resumeBanner) { ui.resumeBanner.hidden = true; delete ui.resumeBanner.dataset.kind; } }

export function setMicChip(on, label) {
  ui.micChip.classList.toggle('on', on);
  setText(ui.micChipText, label);
  ui.micChip.title = label;
  if (!on) ui.latChip.hidden = true;
}
export function updateLatencyChip(track) {
  const parts = [`${+(audioCtx.sampleRate / 1000).toFixed(1)} kHz`];
  const outMs = ((audioCtx.baseLatency || 0) + (audioCtx.outputLatency || 0)) * 1000;
  if (outMs > 0) parts.push(`çıkış ≈${nf0.format(outMs)} ms`);
  const inLat = track.getSettings?.().latency;
  if (inLat > 0) parts.push(`giriş ≈${nf0.format(inLat * 1000)} ms`);
  ui.latChip.textContent = parts.join(' · ');
  ui.latChip.title = 'Tarayıcının bildirdiği gecikmeler (gerçek uçtan uca gecikme sürücüye/karta göre değişir)';
  ui.latChip.hidden = false;
}
export function renderEngineChip() {
  if (!uiReady) return;
  let txt, on = false, warn = false;
  if (CONFIG.AUDIO.INSTRUMENT !== 'piano') { txt = 'Ses: sentez'; on = true; }
  else if (piano.state === 'ready') { txt = 'Ses: piyano'; on = true; }
  else if (piano.state === 'loading') txt = 'Piyano yükleniyor…';
  else if (piano.state === 'failed') { txt = 'Piyano yok · sentez'; warn = true; }
  else txt = 'Ses: piyano';
  setText(ui.engineChipText, txt);
  ui.engineChip.classList.toggle('on', on);
  ui.engineChip.classList.toggle('warn', warn);
  ui.engineChip.title = warn ? `${txt} — piyano örnekleri yüklenemedi: ${piano.error?.message || ''}` : `${txt} (soruların çalındığı ses)`;
}
export function renderDetectorChip() {
  const name = detector?.name ?? CONFIG.PITCH.ALGORITHM;
  setText(ui.detChip, `Algılama: ${name}`);
  ui.detChip.title = name === 'YIN' ? 'YIN (de Cheveigné & Kawahara, 2002) — dahili' : 'MPM (McLeod Pitch Method) — pitchy';
}
export function renderConfigChip() {
  ui.cfgChip.hidden = !Object.keys(configOverrides).length;
}

/** Başlık ve sınav bilgi satırı (CONFIG'ten) */
export function updateHeaderText() {
  const sec = nf2.format(CONFIG.SUSTAIN_TIME_MS / 1000);
  setText(ui.sub, `Sesleri dinleyin; ${singFrom()} “na” hecesiyle sırayla söyleyin. Her ses ±${CONFIG.TOLERANCE_CENTS} sent içinde ${sec} saniye kesintisiz tutulmadan bir sonrakine geçilmez.`);
  const c = CONFIG.QUESTION_COUNTS, total = KINDS.reduce((s, k) => s + (c[k] || 0), 0);
  const parts = KINDS.filter((k) => c[k] > 0).map((k) => `${c[k]} ${KIND_LABEL[k].toLocaleLowerCase('tr')}`);
  const lim = CONFIG.EXAM.QUESTION_TIME_LIMIT_S;
  ui.examInfo.replaceChildren(
    el('b', null, `${total} soru`),
    document.createTextNode(` · ${parts.join(', ')} · ${CONFIG.QUESTION_ORDER === 'grouped' ? 'sıra: tek → iki → üç' : 'karışık sıra'}`
      + ` · ±${CONFIG.TOLERANCE_CENTS} sent · ${sec} sn tutma · register ${midiName(CONFIG.REGISTER.minMidi)}–${midiName(CONFIG.REGISTER.maxMidi)}`
      + (lim > 0 ? ` · soru başına ${lim} sn` : '')),
  );
  setText(ui.contourSpan, nf0.format(CONFIG.UI.CONTOUR_SECONDS));
  setText(ui.staffSpan, nf0.format(CONFIG.UI.CONTOUR_SECONDS));
  setText(ui.contourTol, String(CONFIG.TOLERANCE_CENTS));
}

// ── İbre / göstergeler (dikey: yukarı tiz, aşağı pes) ──
export let gaugeHalf = 0;                       // göstergenin yarı yüksekliği (px)
export let needlePos = 0, needleTarget = 0;     // ibrenin merkezden yukarı uzaklığı (px; + tiz, − pes)
export let curZone = 'none';
export const coachWin = new CoachWindow();      // son yönlendirme aralığının özeti
export const coachState = { last: '', turns: {} };
export let coachMsg = null;                     // ekrandaki yönlendirme (null → bekleme metni)
export let lastSustainFrac = -1;
export let lastReadoutTs = 0;

export function paintGaugeBackground() {
  const R = gaugeRange(), g = activeCfg().TOLERANCE_CENTS, y = activeCfg().WARNING_CENTS;
  const p = (c) => `${(50 + (clamp(c, -R, R) / R) * 50).toFixed(2)}%`;   // alttan yüzde (0deg = aşağıdan yukarı)
  const cs = getComputedStyle(document.documentElement), v = (n, fb) => cs.getPropertyValue(n).trim() || fb;   // renkler :root'tan
  const RED = v('--gauge-red', 'rgba(248,113,113,.30)'), YEL = v('--gauge-yellow', 'rgba(251,191,36,.30)'), GRN = v('--gauge-green', 'rgba(52,211,153,.36)');
  ui.gauge.style.background =
    `linear-gradient(0deg, ${RED} 0 ${p(-y)}, ${YEL} ${p(-y)} ${p(-g)}, ${GRN} ${p(-g)} ${p(g)}, ${YEL} ${p(g)} ${p(y)}, ${RED} ${p(y)} 100%)`;
}
export function buildTicks() {
  const R = gaugeRange();
  ui.ticks.replaceChildren();
  const { WARNING_CENTS: W, TOLERANCE_CENTS: TOL } = activeCfg();
  const values = [...new Set([-R, -W, -TOL, 0, TOL, W, R])];
  for (const c of values) {
    const tick = el('span', 'tick', `${c > 0 ? '+' : c < 0 ? MINUS : ''}${Math.abs(c)}`);
    tick.style.top = `${50 - (c / R) * 50}%`;
    ui.ticks.append(tick);
  }
}
/** Ortada hedefin adı, uçlarda bir yarım ses aşağı/yukarı; hedef açık değilse yalnızca "tiz" / "pes" */
export function renderGaugeNames(note) {
  const nb = note ? semitoneNeighbors(note) : null;
  const end = (node, name, key) => { if (name) { delete node.dataset.text; setText(node, name); } else setTextKey(node, key); };
  end(ui.vgAbove, nb?.above.solfege, 'gaugeSharp');
  setText(ui.vgTarget, note ? note.solfege : '');
  end(ui.vgBelow, nb?.below.solfege, 'gaugeFlat');
}
export function observeGauge() {
  const measure = () => { gaugeHalf = ui.gauge.clientHeight / 2; };
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(ui.gauge);
  window.addEventListener('resize', measure);                 // gösterge DOM tabanlı (CSS ölçekli); yalnız yarı yükseklik gerekir
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));
}
export function setZone(zone) {
  if (zone !== curZone) { curZone = zone; ui.tuner.dataset.zone = zone; }
}
/** İbreyi hedefe doğru yumuşakça kaydırır (yalnızca transform → GPU bileşimi) */
export function easeNeedle(dtMs) {
  const k = 1 - Math.exp(-dtMs / CONFIG.UI.NEEDLE_SMOOTHING_MS);
  const delta = needleTarget - needlePos;
  const next = Math.abs(delta) < 0.02 ? needleTarget : needlePos + delta * k;
  if (next !== needlePos) {
    needlePos = next;
    ui.needle.style.transform = `translate3d(0,${(-needlePos).toFixed(2)}px,0)`;   // ekranda y aşağı doğru artar
  }
}
export function paintSustain(frac) {
  if (frac !== lastSustainFrac) {
    lastSustainFrac = frac;
    ui.sustainFill.style.transform = `scaleX(${frac.toFixed(4)})`;
  }
}
/** Yönlendirme satırı (grafiğin altında). m = coachMessage() sonucu; null → bekleme metni (COACH.idle) */
export function setCoach(m) {
  coachMsg = m;
  const path = m ? m.path : 'COACH.idle.a';
  const text = m ? m.text : (getPath(CONFIG.TEXTS, path) ?? '');
  ui.coach.dataset.text = path;                     // "Adları sayfada düzenle" için: hangi cümle görünüyor
  ui.coach.dataset.key = m ? m.key : 'idle';
  ui.coach.classList.toggle('idle', !m);
  setText(ui.coach, text);
}
/** Yönlendirme yazı boyutu (CONFIG.UI.COACH_FONT_PX; telefonda CSS 2 px küçültür) */
export function applyCoachFont() {
  document.documentElement.style.setProperty('--coach-fs', `${CONFIG.UI.COACH_FONT_PX}px`);
}
/** Yeni ses / yeni çalım: özet sıfırlanır, satır bekleme metnine döner */
export function resetCoach() {
  coachWin.reset();
  setCoach(null);
}
export function clearReadouts() {
  setText(ui.centsVal, '—');
  setText(ui.heardFreq, '— Hz');
  setText(ui.heardNote, ' ');
  setText(ui.clarityText, 'netlik —');
  setText(ui.sustainText, `${nf2.format(0)} / ${nf2.format(activeCfg().SUSTAIN_TIME_MS / 1000)} s`);
  ui.sustainFill.classList.remove('full');
  paintSustain(0);
  setZone('none');
  needleTarget = 0;
}

// Mikrofon seviye göstergesi (hızlı atak, yavaş bırakma)
export const METER_MIN_DB = -80;
export let level = 0, lastLevelWritten = -1;
export function paintLevel(rms) {
  const db = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
  const frac = clamp((db - METER_MIN_DB) / Math.abs(METER_MIN_DB), 0, 1);
  level = frac > level ? frac : level + (frac - level) * 0.12;
  if (Math.abs(level - lastLevelWritten) > 0.003) {
    lastLevelWritten = level;
    ui.levelFill.style.transform = `scaleX(${level.toFixed(3)})`;
  }
}
export function updateThresholdUi() {
  ui.thr.min = String(CONFIG.PITCH.NOISE_GATE_MIN_DB);
  ui.thr.max = String(CONFIG.PITCH.NOISE_GATE_MAX_DB);
  ui.thr.value = String(settings.rmsDb);
  ui.thrText.textContent = `${settings.rmsDb < 0 ? MINUS : ''}${Math.abs(settings.rmsDb)} dBFS`;
  ui.levelThr.style.left = `${clamp((settings.rmsDb - METER_MIN_DB) / Math.abs(METER_MIN_DB), 0, 1) * 100}%`;
}

// ── Başka modüllerin değiştirdiği paylaşılan değişkenler ──
// ES modüllerinde içe aktarılan bir değişkene atama yapılamaz (okuma her zaman güncel değeri verir).
// Bu yüzden değişkenin sahibi olan modül küçük atayıcılar (setter) dışa açar.
export function assignMode(v) { mode = v; }
export function assignSession(v) { session = v; }
export function assignLastDiag(v) { lastDiag = v; }
export function assignExercise(v) { exercise = v; }
export function assignStarting(v) { starting = v; }
export function assignUiReady(v) { uiReady = v; }
export function assignNeedleTarget(v) { needleTarget = v; }
export function assignLastReadoutTs(v) { lastReadoutTs = v; }
