// Solfej Lab — js/app.js (giriş noktası)
// Durum makinesi geçiş eylemleri (onStateChange), ana döngü (frame), başlatma (init), konsol API'si (window.solfejLab).

// ═════════════════════════════════════════════════════════════════════════
//  SOLFEJ LAB — Web tabanlı işitme eğitimi (konservatuvar hazırlık)
//  Tek dosya · Vanilla JS (ES Modules) · Web Audio API
//
//  Dış kütüphaneler CDN'den, gerektiğinde yüklenir. Yüklenemezlerse uygulama yedek yolla çalışır:
//    Tone.js  → piyano örnekleri (Salamander Grand Piano)   · yedek: dahili sentez
//    VexFlow  → "Portede göster" nota çizimi                · yedek: porte paneli mesaj gösterir
//    pitchy   → MPM perde algılama (Ayarlar'dan seçilirse)   · varsayılan: dahili YIN
//
//  Çalıştırma: mikrofon için güvenli bağlam gerekir (https veya localhost).
//      python -m http.server 8000    →   http://localhost:8000
//
//  Geliştirici notları
//    • Tüm ayarlar hemen aşağıdaki CONFIG nesnesindedir. Arayüzdeki "Ayarlar ve standartlar"
//      paneli yalnızca bu tarayıcı için CONFIG'in üzerine yazar (localStorage).
//    • Konsoldan:  solfejLab.setConfig({ TOLERANCE_CENTS: 15 })   solfejLab.resetConfig()
//                  solfejLab.generateSession(42)   (aynı tohum → aynı sorular)
//    • URL:        ?seed=123  → ilk test bu tohumla üretilir (herkese aynı soru seti)
//                  ?debug     → window.__dbg (test / hata ayıklama)
//
//  Dosya haritası
//    0) CONFIG               merkezi yapılandırma (en üstte)
//    1) Saf mantık (PURE)    yardımcılar, nota teorisi, soru üreticisi, YIN, sustain,
//                            durum makinesi, sınav oturumu, analitik, geçmiş kaydı
//    2) Kütüphane yükleyici  CDN adreslerini sırayla dener, zaman aşımı uygular
//    3) Ses motoru           AudioContext · Tone.js piyano · yedek sentez
//    4) Mikrofon & algılama  getUserMedia (işlemsiz) → AnalyserNode → YIN / MPM
//    5) Arayüz               notalar, ilerleme, ibre, perde grafiği, porte, özet, geçmiş, ayarlar
//    6) Durum makinesi eylemleri
//    7) Ana döngü            requestAnimationFrame: ölçüm → puanlama → durum makinesi
//    8) Kalıcılık ve başlatma
// ═════════════════════════════════════════════════════════════════════════

import { CONFIG, DEFAULT_CONFIG } from './config.js';
import { customExamToConfig, drillToConfig, generateDrillChunk } from './pure.js';
import { ExamSession, Exercise, PLAYBACK_MODES, ROOTS, S, TYPE_BY_ID, clamp, coachMessage, compareToTarget, computeDiagnostics, dbToLin, deepClone, deepMerge, freqToMidi, generateSession, isPlainObject, makeHistoryEntry, midiToFreq, mulberry32, nearestNoteName, octaveModeFor, recordPitchFrame, rootMeanSquare, zoneOf } from './pure.js';
import { audioCtx, createAudioContext, ensureAudio, loadPitchy, piano, playMelodic, playReward, preparePiano, sleep, stopAllSound } from './audio.js';
import { analyser, assignRmsLinear, detector, ensureMic, explainError, medianFilter, micStream, refreshDevices, rmsLinear, settings, setupDetector, startMic, timeBuf } from './mic.js';
import { activeCfg, applyCoachFont, canPauseNow, drillActive, paused, setPausedState } from './ui.js';
import { buildCustomUI, examTab } from './custom.js';
import { applyPracticeExercise, bindDrill, buildDrillUI, hideDrillResult, showDrillResult } from './drill.js';
import { after, assignExercise, assignLastDiag, assignLastReadoutTs, assignMode, assignNeedleTarget, assignSession, assignStarting, assignUiReady, buildNoteBoxes, buildTicks, cancelFlow, clearReadouts, coachState, coachWin, easeNeedle, examActive, exercise, fillSelects, fmtCents, fsm, gaugeHalf, gaugeRange, hideAlert, lastDiag, lastReadoutTs, mode, needleTarget, nf1, nf2, observeGauge, paintGaugeBackground, paintLevel, paintSustain, renderAll, renderConfigChip, renderDetectorChip, renderEngineChip, renderTimer, resetCoach, selectionChanged, session, setCoach, setText, setZone, showAlert, showNotice, starting, tracker, ui, uiReady, updateFoldUi, updateHeaderText, updateThresholdUi } from './ui.js';
import { contour, drawContour, examStaffOn, markContour, pushContour, scheduleStaffDraw, setExamStaff, setViewMode, setupContour, staffView, viewMode, viewModeFor } from './staff.js';
import { addHistory, bindHistoryFilter, clearHistory, hideSummary, loadHistory, renderHistory, showSummary } from './summary.js';
import { bindNav, goSection, initNav, loadUiState, saveUiState } from './nav.js';
import { applyShortcutHints, bindKeys, renderShortcuts } from './keys.js';
import { CONFIG_KEY, PREFS_KEY, applyOverrides, bindSettingsTabs, applyTexts, buildSettingsForm, configOverrides, fillPresetSelect, fillSettingsForm, onApplySettings, onCopyAll, onCopyNames, onEditClick, onJsonApply, onJsonExport, onJsonImportFile, onPresetChange, positionEditor, refreshJsonArea, reportApply, savePrefs, setEditNames, setTextKey, storageGet } from './settings.js';

// ───────────────────────────────────────────────────────────────────────
// 6) DURUM MAKİNESİ GEÇİŞ EYLEMLERİ
// ───────────────────────────────────────────────────────────────────────
export let invalidMs = 0, lastOctave = 0;
export const octaveVotes = new Map();          // ilk sesin tolerans içi karelerinde oktav kayması oyları → sağlam çapa

export function onStateChange(next, prev, payload) {
  switch (next) {
    case S.IDLE:
      exercise.restart();
      tracker.reset();
      medianFilter.reset();
      clearReadouts();
      resetCoach();
      break;

    case S.PLAYING: {                               // sesler çalınır; bu sırada mikrofon yok sayılır
      if (payload?.fresh) exercise.restart();
      if (payload?.replay && session?.result) session.result.replays++;
      tracker.reset();
      medianFilter.reset();
      clearReadouts();
      resetCoach();
      stopAllSound();
      // Ne çalınacak: tek ses (kutuya tıklandı) · sınavda EXAM.PLAYBACK · serbest çalışmada "Çalım biçimi"
      const single = Number.isInteger(payload?.single) ? payload.single : null;
      const how = single !== null ? 'melodic' : session ? activeCfg().EXAM.PLAYBACK : (payload?.playback ?? 'harmonic');
      const total = playMelodic(single !== null ? [exercise.notes[single]] : exercise.notes, how, audioCtx.currentTime + 0.06);
      markContour(performance.now(), single !== null ? `♪${single + 1}` : session ? `▶${session.index + 1}` : '▶');
      // Dinleme çalım bitince başlar (ilerleme korunur: yalnızca fresh çalımda baştan)
      after(total * 1000 + 60 + CONFIG.AUDIO.LISTEN_DELAY_MS, () => fsm.go(S.LISTENING));
      break;
    }

    case S.LISTENING:                               // sıradaki nota için dinleme
      tracker.reset();
      medianFilter.reset();
      octaveVotes.clear();
      invalidMs = 0;
      clearReadouts();
      resetCoach();                                 // yeni ses → yönlendirme özeti sıfırdan
      break;

    case S.VERIFIED: {                              // nota doğrulandı → kısa bekleme → kilit açılır
      exercise.markVerified();
      const stats = session?.result?.noteResults[exercise.index];
      if (stats) stats.verified = true;
      ui.sustainFill.classList.add('full');
      paintSustain(1);
      setText(ui.sustainText, `${nf2.format(activeCfg().SUSTAIN_TIME_MS / 1000)} / ${nf2.format(activeCfg().SUSTAIN_TIME_MS / 1000)} s`);
      setZone('perfect');
      markContour(performance.now(), `✓${exercise.index + 1}`);
      after(CONFIG.AUDIO.VERIFIED_HOLD_MS, advanceVerified);
      break;
    }

    case S.COMPLETE:                                // soru bitti (tamam / geçildi / süre doldu)
      clearReadouts();
      if (session) {
        const reason = payload?.reason ?? 'done';
        if (reason !== 'done') exercise.abandon();
        session.finishQuestion(reason);
        after(activeCfg().EXAM.NEXT_QUESTION_DELAY_MS, nextQuestion);
      } else {
        playReward(exercise.notes);
      }
      break;

    case S.SUMMARY:
      clearReadouts();
      stopAllSound();
      if (session?.drill) showDrillResult(session);  // alıştırma: soru listesi · sınav: teşhis ekranı
      else showSummary();
      break;
  }
  renderAll();
}

/** Doğrulanan sesten sonra kilidi açar: sıradaki ses ya da soru sonu (duraklatmadan dönüşte de çağrılır) */
export function advanceVerified() {
  const finished = exercise.advance();            // doğrulanmamış notada hata fırlatır (kilit)
  fsm.go(finished ? S.COMPLETE : S.LISTENING, finished ? { reason: 'done' } : undefined);
}
/** Sınavda soru bitince: sıradaki soru ya da teşhis ekranı */
export function nextQuestion() {
  if (!session) return;
  // "Ben durdurana kadar" alıştırması: sona yaklaşınca sıradaki soru parçası üretilir
  if (session.drill && !session.drill.count && session.index >= session.questions.length - 2) {
    session.appendQuestions(generateDrillChunk(session.drill, CONFIG.PRACTICE.DRILL_CHUNK, CONFIG, session.drillRng));
  }
  if (session.isLast) { finishSession(); return; }
  session.index++;
  loadQuestion(session.current);
  fsm.go(S.PLAYING, { fresh: true });
}

// ── Duraklat / Devam ──
// Duraklatınca bekleyen zamanlayıcılar iptal edilir, ses susar, ölçüm ve soru süresi durur (durum makinesi olduğu yerde kalır).
// Devam edince durum yerinden sürer: çalım yarıda kaldıysa sesler yeniden çalınır (tekrar sayılmaz).
export function pauseFlow() {
  if (!canPauseNow()) return false;
  cancelFlow();
  stopAllSound();
  setPausedState(true);
  tracker.reset();
  medianFilter.reset();
  clearReadouts();
  resetCoach();
  renderAll();
  return true;
}
export function resumeFlow() {
  if (!paused) return;
  setPausedState(false);
  const st = fsm.state;
  if (st === S.PLAYING) { fsm.go(S.LISTENING); fsm.go(S.PLAYING, { fresh: false, playback: practicePlayback() }); }
  else if (st === S.VERIFIED) advanceVerified();
  else if (st === S.COMPLETE && session) nextQuestion();
  renderAll();
}
export function togglePause() { if (paused) resumeFlow(); else pauseFlow(); }

export function loadQuestion(q) {
  assignExercise(new Exercise(q.notes));
  buildNoteBoxes();
  updateFoldUi();
}

/** Sınavı kapatır: teşhisi hesaplar, kaydeder, teşhis ekranına geçer */
export function finishSession() {
  if (!session) return;
  setPausedState(false);
  session.finishedAt = Date.now();
  const attempted = session.attempted;
  const cfg = activeCfg();                          // özel sınavda oturumun kendi ayarı
  assignLastDiag(attempted.length ? computeDiagnostics(attempted, cfg) : null);
  const save = session.drill ? CONFIG.PRACTICE.SAVE_HISTORY : true;   // alıştırma kaydı ayarla kapatılabilir
  if (lastDiag && save && CONFIG.HISTORY.ENABLED && (!session.aborted || CONFIG.HISTORY.SAVE_UNFINISHED || (session.drill && !session.drill.count))) {
    addHistory(makeHistoryEntry(session, lastDiag, cfg));
  }
  cancelFlow();
  fsm.go(S.SUMMARY);
}

export function hardReset() {
  cancelFlow();
  hideDrillResult();
  setPausedState(false);
  stopAllSound();
  assignSession(null);
  applySessionCfg();                                // sayaç ve gösterge bantları genel ayara döner
  if (fsm.state !== S.IDLE) fsm.go(S.IDLE);
  else { exercise.restart(); tracker.reset(); clearReadouts(); renderAll(); }
}

/** Ses + mikrofon + algılayıcıyı hazırlar (kullanıcı jesti içinde çağrılır). Hata olursa false. */
export async function prepareInput() {
  try {
    await ensureAudio();                            // AudioContext kullanıcı jestiyle başlatılır
    await ensureMic();
    await setupDetector();
    return true;
  } catch (err) {
    console.error(err);
    showAlert(explainError(err));
    return false;
  }
}

export let urlSeedUsed = false;
export function nextSeed() {
  const p = new URLSearchParams(location.search).get('seed');
  if (p && !urlSeedUsed && /^\d+$/.test(p)) { urlSeedUsed = true; return Number(p) >>> 0; }
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

/** Oturumun etkin ayarını sustain sayacına ve gösterge bantlarına uygular */
export function applySessionCfg() {
  tracker.cfg = activeCfg();
  paintGaugeBackground();
  buildTicks();
}

/**
 * Sınavı başlatır. opts.custom: özel sınav tanımı (yalnız bu oturuma uygulanır).
 * opts.repeat: teşhis ekranındaki "Yeni Test" — biten sınav özel sınavsa aynısını yeniden başlatır.
 * Standart sekmedeki başlat düğmesi her zaman standart sınavı başlatır.
 */
export async function onStartExam(opts) {
  if (starting || examActive()) return;
  const custom = opts?.custom ?? (opts?.repeat && fsm.state === S.SUMMARY ? session?.custom ?? null : null);
  const examCfg = custom ? customExamToConfig(custom, CONFIG) : CONFIG;
  assignStarting(true);
  hideAlert();
  renderAll();
  const ok = await prepareInput();
  if (!ok) { assignStarting(false); renderAll(); return; }
  const seed = nextSeed();
  let questions;
  try { questions = generateSession(examCfg, mulberry32(seed)); }
  catch (err) { assignStarting(false); showAlert(`Sınav oluşturulamadı: ${err.message}`); renderAll(); return; }
  if (CONFIG.AUDIO.INSTRUMENT === 'piano') {
    const p = preparePiano();
    if (piano.state === 'loading') {
      setText(ui.status, 'Piyano sesleri yükleniyor…');
      await Promise.race([p, sleep(CONFIG.AUDIO.PIANO.WAIT_ON_START_MS)]);
    }
  }
  assignStarting(false);
  hardReset();
  hideSummary();
  assignLastDiag(null);
  assignSession(new ExamSession(questions, { seed, startedAt: Date.now(), cfg: examCfg, name: custom?.name ?? null, custom }));
  applySessionCfg();
  loadQuestion(session.current);
  fsm.go(S.PLAYING, { fresh: true });
}

/** Serbest çalışma "Alıştırma": rastgele soru dizisi (sınav altyapısıyla; ayar yalnız bu oturuma) */
export async function onStartDrill(def) {
  if (starting || drillActive() || examActive()) return;
  assignStarting(true);
  hideAlert();
  renderAll();
  const ok = await prepareInput();
  if (!ok) { assignStarting(false); renderAll(); return; }
  const seed = nextSeed(), rng = mulberry32(seed);
  let questions;
  try { questions = generateDrillChunk(def, def.count || CONFIG.PRACTICE.DRILL_CHUNK, CONFIG, rng); }
  catch (err) { assignStarting(false); showAlert(`Alıştırma oluşturulamadı: ${err.message}`); renderAll(); return; }
  assignStarting(false);
  hardReset();
  assignLastDiag(null);
  assignSession(new ExamSession(questions, { seed, startedAt: Date.now(), cfg: drillToConfig(def, CONFIG), drill: def }));
  session.drillRng = rng;                           // "durdurana kadar": sonraki parçalar aynı rastgele diziden
  applySessionCfg();
  loadQuestion(session.current);
  fsm.go(S.PLAYING, { fresh: true });
}

export function onExamReplay() {
  if (session && fsm.state === S.LISTENING && activeCfg().EXAM.ALLOW_REPLAY) fsm.go(S.PLAYING, { replay: true });
}
export function onSkip() {
  if (!session || fsm.state !== S.LISTENING || !activeCfg().EXAM.ALLOW_SKIP) return;
  fsm.go(S.COMPLETE, { reason: 'skipped' });
}
export function onEndExam() {                      // sınavda "Testi Bitir", alıştırmada "Durdur"
  if (!examActive() && !drillActive()) return;
  cancelFlow();
  stopAllSound();
  const r = session.result;
  if (r && r.status === 'pending' && (r.listenMs > 0 || r.noteResults.some((n) => n.verified))) session.finishQuestion('skipped');
  session.abort();
  finishSession();
}

export async function onPlayClick() {                      // serbest çalışma
  if (starting) return;
  assignStarting(true);
  hideAlert();
  renderAll();
  const ok = await prepareInput();
  assignStarting(false);
  if (!ok) { renderAll(); return; }
  fsm.go(S.PLAYING, { fresh: true, playback: practicePlayback() });
}
export function onReplayClick() {
  if (fsm.state !== S.LISTENING) return;
  if (!session) fsm.go(S.PLAYING, { fresh: false, playback: practicePlayback() });   // tek soru: ilerleme korunur
  else if (session.drill) fsm.go(S.PLAYING, { replay: true });                         // alıştırma: tekrar sayılır
}
/** Serbest çalışmadaki "Çalım biçimi" seçimi */
export function practicePlayback() {
  const v = document.getElementById('playbackSelect')?.value;
  return PLAYBACK_MODES.includes(v) ? v : CONFIG.AUDIO.PRACTICE_PLAYBACK;
}

export async function onDeviceChange() {
  settings.deviceId = ui.device.value || null;
  hardReset();
  try { await startMic(settings.deviceId); }
  catch (err) { showAlert(explainError(err)); }
}

export function setMode(next, { persist = true } = {}) {
  if (examActive()) return;
  if (drillActive() && next !== mode) onEndExam();   // başka bölüme geçerken alıştırma biter (sonuç kaydedilir)
  assignMode(next);
  (next === 'exam' ? ui.examSlot : ui.practiceSlot).append(ui.workspace);   // çalışma alanı bölüme taşınır
  hideSummary();
  if (next === 'practice') applyPracticeExercise(); // tek soru: seçili soru kurulur · alıştırma: boş kutular
  else { assignExercise(new Exercise([])); buildNoteBoxes(); hardReset(); }
  setViewMode(viewModeFor(next), { persist: false });   // görünüm Sınav ve Serbest çalışma için ayrı hatırlanır
  setExamStaff(examStaffOn(), { persist: false });
  if (persist) savePrefs();
}


// ───────────────────────────────────────────────────────────────────────
// 7) ANA DÖNGÜ — requestAnimationFrame (≈ 60 kare/sn)
// ───────────────────────────────────────────────────────────────────────
export let rafId = 0, lastTs = 0, lastTimerTs = 0;

export function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  let dt = ts - lastTs;
  lastTs = ts;
  if (!(dt > 0)) dt = 0;

  drawContour(ts);
  if (!analyser || !detector) { easeNeedle(Math.min(dt, 100)); return; }

  analyser.getFloatTimeDomainData(timeBuf);         // en güncel pencere (fftSize örnek)
  const rms = rootMeanSquare(timeBuf);
  paintLevel(rms);
  if (session && ts - lastTimerTs > 250) { lastTimerTs = ts; renderTimer(); }

  if (paused || fsm.state !== S.LISTENING) {        // çalma / bekleme / duraklatma: ölçüm yok, yalnızca ibre süzülür
    easeNeedle(Math.min(dt, 100));
    return;
  }
  if (dt > CONFIG.PITCH.MAX_FRAME_GAP_MS) { tracker.reset(); medianFilter.reset(); dt = 0; }
  const xc = activeCfg();                           // sınav akışı ayarı (özel sınavda oturumun; tolerans, süre, geri bildirim)

  const target = exercise.current;
  if (!target) return;
  const res = session?.result ?? null;
  const stats = res ? res.noteResults[exercise.index] : null;
  if (res) res.listenMs += dt;                      // süre yalnızca dinlerken işler (çalım hariç)
  if (stats) stats.timeMs += dt;

  const P = CONFIG.PITCH;
  const loud = rms >= rmsLinear;                    // RMS gürültü kapısı
  let valid = false, freq = 0, clarity = 0, cents = 0;
  if (loud) {                                       // sessizlikte pahalı hesabı atla
    const [pitch, c] = detector.findPitch(timeBuf, audioCtx.sampleRate);
    clarity = c;
    if (c >= P.MIN_CLARITY && pitch >= P.MIN_FREQ && pitch <= P.MAX_FREQ) {
      freq = midiToFreq(medianFilter.push(freqToMidi(pitch)));
      const cmp = compareToTarget(freq, target.freq, octaveModeFor(exercise, settings.fold), exercise.anchorK);
      cents = cmp.cents;
      lastOctave = cmp.octave;
      valid = true;
    }
  }
  if (valid) invalidMs = 0;
  else if ((invalidMs += dt) > CONFIG.SUSTAIN_DROPOUT_GRACE_MS) medianFilter.reset();

  const absCents = Math.abs(cents);
  const zone = valid ? zoneOf(absCents, xc) : 'none';
  const passed = tracker.update(dt, valid, absCents);   // puanlama HAM (yumuşatılmamış) değerle
  if (valid && stats) recordPitchFrame(stats, cents, xc);
  if (valid && exercise.anchorK === null && absCents <= xc.TOLERANCE_CENTS) {
    octaveVotes.set(lastOctave, (octaveVotes.get(lastOctave) || 0) + 1);
  }

  const feedback = !session || xc.EXAM.LIVE_FEEDBACK;
  if (feedback) {
    pushContour(ts, valid ? cents : NaN, valid && absCents <= xc.TOLERANCE_CENTS, valid ? target.midi + cents / 100 : NaN, zone);
    if (valid) assignNeedleTarget((clamp(cents, -gaugeRange(), gaugeRange()) / gaugeRange()) * gaugeHalf);
    setZone(zone);
    paintSustain(tracker.progress);
  }
  easeNeedle(Math.min(dt, 100));

  if (ts - lastReadoutTs >= CONFIG.UI.READOUT_INTERVAL_MS) {    // metinler ≈ 12 Hz'de güncellenir
    assignLastReadoutTs(ts);
    if (feedback) {                                 // sayılar ve renk anlık; sözlü yönlendirme aşağıda, aralıklı
      setText(ui.centsVal, valid ? fmtCents(cents) : '—');
      setText(ui.heardFreq, valid ? `${nf1.format(freq)} Hz` : '— Hz');
      setText(ui.heardNote, valid ? `≈ ${nearestNoteName(freq)}` : ' ');
      setText(ui.sustainText, `${nf2.format(tracker.ms / 1000)} / ${nf2.format(xc.SUSTAIN_TIME_MS / 1000)} s`);
    }
    setText(ui.clarityText, loud ? `netlik ${nf2.format(clarity)}` : 'netlik —');
  }

  // Yönlendirme: her COACH_INTERVAL_MS'de bir, son aralığın özetinden tek cümle
  coachWin.push(dt, { loud, valid, cents, held: valid && absCents <= xc.TOLERANCE_CENTS });
  if (coachWin.ms >= CONFIG.UI.COACH_INTERVAL_MS) {
    const m = coachMessage(coachWin.summary(), coachState, { live: feedback, fold: settings.fold }, { ...CONFIG, TOLERANCE_CENTS: xc.TOLERANCE_CENTS });
    if (m) setCoach(m);
    coachWin.reset();
  }

  const limit = session ? xc.EXAM.QUESTION_TIME_LIMIT_S : 0;
  if (passed) {
    if (exercise.index === 0 && exercise.anchorK === null) {     // oktav çapası: tutma sırasındaki çoğunluk oyu
      let best = lastOctave, bestN = -1;
      for (const [k, n] of octaveVotes) if (n > bestN) { best = k; bestN = n; }
      exercise.anchorK = best;
    }
    fsm.go(S.VERIFIED);
  } else if (limit > 0 && res && res.listenMs >= limit * 1000) {
    fsm.go(S.COMPLETE, { reason: 'timeout' });
  }
}


// ───────────────────────────────────────────────────────────────────────
// 8) BAŞLATMA
// ───────────────────────────────────────────────────────────────────────
export let historyClearArmed = 0;
export function bindEvents() {
  ui.startBtn.addEventListener('click', () => onStartExam({ repeat: examTab === 'custom' }));   // özel sekmedeki teşhis ekranında aynı özel sınav
  ui.examPause.addEventListener('click', togglePause);
  ui.drillSkip.addEventListener('click', onSkip);
  ui.drillStop.addEventListener('click', onEndExam);
  bindDrill();
  bindKeys();
  bindHistoryFilter();
  ui.practicePause.addEventListener('click', togglePause);
  ui.examReplay.addEventListener('click', onExamReplay);
  ui.skipBtn.addEventListener('click', onSkip);
  ui.endBtn.addEventListener('click', onEndExam);
  ui.play.addEventListener('click', onPlayClick);
  ui.replay.addEventListener('click', onReplayClick);
  ui.reset.addEventListener('click', hardReset);
  for (const select of [ui.root, ui.octave, ui.type, ui.inversion]) select.addEventListener('change', selectionChanged);
  document.getElementById('playbackSelect').addEventListener('change', savePrefs);
  ui.device.addEventListener('change', onDeviceChange);
  ui.sumNew.addEventListener('click', () => onStartExam({ repeat: true }));   // biten sınavın aynısı (özel sınavda aynı özel sınav)
  for (const b of document.querySelectorAll('#examTabs [data-etab]')) b.addEventListener('click', () => goSection(b.dataset.etab === 'custom' ? 'kendi-sinavim' : 'sinav'));
  ui.sumClose.addEventListener('click', hideSummary);

  ui.fold.addEventListener('change', () => {
    settings.fold = ui.fold.checked;
    updateFoldUi();
    tracker.reset();
    savePrefs();
  });
  for (const b of ui.viewSeg.querySelectorAll('[data-view]')) b.addEventListener('click', () => setViewMode(b.dataset.view));
  ui.examStaffToggle.addEventListener('change', () => setExamStaff(ui.examStaffToggle.checked));
  ui.thr.addEventListener('input', () => {
    settings.rmsDb = +ui.thr.value;
    assignRmsLinear(dbToLin(settings.rmsDb));
    updateThresholdUi();
  });
  ui.thr.addEventListener('change', savePrefs);

  ui.historyClear.addEventListener('click', () => {
    if (!historyClearArmed) {                       // iki adımlı onay (engelleyici diyalog yok)
      setTextKey(ui.historyClear, 'btnHistoryConfirm');
      historyClearArmed = setTimeout(() => { historyClearArmed = 0; setTextKey(ui.historyClear, 'btnHistoryClear'); }, 4000);
      return;
    }
    clearTimeout(historyClearArmed);
    historyClearArmed = 0;
    setTextKey(ui.historyClear, 'btnHistoryClear');
    clearHistory();
  });

  ui.cfgChip.addEventListener('click', () => goSection('ayarlar'));
  bindNav();
  bindSettingsTabs();
  ui.applySettings.addEventListener('click', onApplySettings);
  ui.resetSettings.addEventListener('click', () => { ui.presetSelect.value = ''; reportApply(applyOverrides({})); });
  ui.presetSelect.addEventListener('change', onPresetChange);
  ui.jsonApply.addEventListener('click', onJsonApply);
  ui.jsonExport.addEventListener('click', onJsonExport);
  ui.jsonImportBtn.addEventListener('click', () => ui.jsonImport.click());
  ui.jsonImport.addEventListener('change', onJsonImportFile);
  ui.jsonCopyAll.addEventListener('click', onCopyAll);
  ui.editCopyBtn.addEventListener('click', onCopyNames);
  ui.editDoneBtn.addEventListener('click', () => setEditNames(false));
  document.addEventListener('click', onEditClick, true);   // yakalama evresi: düzenleme modunda düğme işlemi başlamaz
  window.addEventListener('scroll', positionEditor, { passive: true });   // düzenleme kutusu yazının üstünde kalır
  window.addEventListener('resize', positionEditor);

  document.addEventListener('visibilitychange', () => { if (document.hidden) { tracker.reset(); medianFilter.reset(); } });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (micStream) refreshDevices(); });
  if ('ResizeObserver' in window) {
    let raf = 0;
    new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderHistory(); }); }).observe(ui.historyChart);
    new ResizeObserver(() => scheduleStaffDraw()).observe(ui.staff);
  }
}

export function init() {
  // 1) Bu tarayıcıda kaydedilmiş özel ayarlar (Ayarlar paneli) → CONFIG'e işlenir
  const storedCfg = storageGet(CONFIG_KEY, null);
  let cfgProblem = '';
  if (storedCfg) {
    const r = applyOverrides(storedCfg, { persist: false });
    if (!r.ok) cfgProblem = r.errors[0];
  }
  // 2) Tercihler
  const prefs = storageGet(PREFS_KEY, {}) || {};
  settings.fold = typeof prefs.fold === 'boolean' ? prefs.fold : true;
  const gate = Number(prefs.gateDb);
  settings.rmsDb = Number.isFinite(gate) ? clamp(gate, CONFIG.PITCH.NOISE_GATE_MIN_DB, CONFIG.PITCH.NOISE_GATE_MAX_DB) : CONFIG.PITCH.NOISE_GATE_DB;
  assignRmsLinear(dbToLin(settings.rmsDb));

  fillSelects();
  if (isPlainObject(prefs.practice)) {
    const { root, octave, type, inv } = prefs.practice;
    if (ROOTS[+root]) ui.root.value = String(root);
    if (['2', '3', '4', '5'].includes(String(octave))) ui.octave.value = String(octave);
    if (TYPE_BY_ID[type]) ui.type.value = type;
    if (['0', '1', '2'].includes(String(inv))) ui.inversion.value = String(inv);
  }
  document.getElementById('playbackSelect').value = PLAYBACK_MODES.includes(prefs.playback) ? prefs.playback : CONFIG.AUDIO.PRACTICE_PLAYBACK;
  buildSettingsForm();
  fillPresetSelect();
  paintGaugeBackground();
  buildTicks();
  observeGauge();
  setupContour();
  updateThresholdUi();
  bindEvents();
  buildCustomUI();
  buildDrillUI();

  assignUiReady(true);
  applyTexts();
  fillSettingsForm(CONFIG);
  refreshJsonArea();
  updateHeaderText();
  updateFoldUi();
  renderConfigChip();
  renderDetectorChip();
  renderEngineChip();
  renderHistory();
  // Eski "Portede göster" tercihi (prefs.staffView) bir kez yeni görünüm seçimine çevrilir
  if (!loadUiState().viewMode && typeof prefs.staffView === 'boolean') {
    const v = prefs.staffView ? 'staff+graph' : 'graph';
    saveUiState({ viewMode: { exam: v, practice: v } });
  }
  applyCoachFont();
  applyShortcutHints();
  renderShortcuts();
  setMode(prefs.mode === 'practice' ? 'practice' : 'exam', { persist: false });   // serbest çalışma porteyi açar
  initNav();                                        // adres çubuğundaki bölüm ya da son kullanılan bölüm (ilk açılışta Ana sayfa)
  if (cfgProblem) showNotice(`Kayıtlı özel ayarlar geçersiz olduğu için varsayılanlar kullanılıyor (${cfgProblem}).`);

  // 3) Ses: AudioContext şimdi "askıda" oluşturulur, piyano örnekleri arka planda yüklenir.
  //    Tarayıcı sesi ilk tıklamaya kadar başlatmaz (ensureAudio → resume).
  try { createAudioContext(); } catch (err) { console.warn(err); }
  if (CONFIG.AUDIO.INSTRUMENT === 'piano') preparePiano();
  if (CONFIG.PITCH.ALGORITHM === 'MPM') loadPitchy().catch(() => {});   // önceden ısıt; hata başlatınca ele alınır

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showAlert('Mikrofon için sayfa https veya http://localhost üzerinden açılmalıdır (file:// bazı tarayıcılarda çalışmaz).');
  }
  setCoach(null);
  drawContour(performance.now());
}
init();

// Geliştirici API'si (konsol): ayarları değiştirme, oturum üretme, teşhis hesaplama
window.solfejLab = Object.freeze({
  CONFIG,
  defaults: DEFAULT_CONFIG,
  get overrides() { return deepClone(configOverrides); },
  setConfig: (partial, opts) => applyOverrides(deepMerge(configOverrides, partial || {}), opts),
  resetConfig: () => applyOverrides({}),
  generateSession: (seed = Date.now()) => generateSession(CONFIG, mulberry32(seed >>> 0)),
  computeDiagnostics,
  history: { load: loadHistory, clear: clearHistory },
});
if (new URLSearchParams(location.search).has('debug')) {
  window.__dbg = {
    get state() { return fsm.state; }, get exercise() { return exercise; }, get session() { return session; },
    get tracker() { return tracker; }, get detector() { return detector; }, get audioCtx() { return audioCtx; },
    get piano() { return piano; }, get diag() { return lastDiag; }, get staff() { return staffView; },
    get overrides() { return configOverrides; }, get contour() { return contour; }, get paused() { return paused; }, get viewMode() { return viewMode; }, fsm, CONFIG,
  };
}

// ── Başka modüllerin değiştirdiği paylaşılan değişkenler ──
// ES modüllerinde içe aktarılan bir değişkene atama yapılamaz (okuma her zaman güncel değeri verir).
// Bu yüzden değişkenin sahibi olan modül küçük atayıcılar (setter) dışa açar.
export function assignRafId(v) { rafId = v; }
