// Solfej Lab — js/audio.js
// Kütüphane yükleyici (CDN adreslerini sırayla dener) ve ses motoru: tek AudioContext, Tone.js piyano, yedek sentez.

import { CONFIG } from './config.js';
import { pianoSampleMap, playbackPlan } from './pure.js';
import { renderEngineChip, showNotice } from './ui.js';

// ───────────────────────────────────────────────────────────────────────
// 2) KÜTÜPHANE YÜKLEYİCİ — klasik <script> (UMD global) ve ES modülü (CDN, sırayla)
// ───────────────────────────────────────────────────────────────────────
export const libCache = new Map();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function injectScript(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const done = (fn, arg) => { clearTimeout(t); s.onload = s.onerror = null; fn(arg); };
    const t = setTimeout(() => { s.remove(); done(reject, new Error(`zaman aşımı: ${url}`)); }, timeoutMs);
    s.src = url;
    s.async = true;
    s.onload = () => done(resolve);
    s.onerror = () => { s.remove(); done(reject, new Error(`yüklenemedi: ${url}`)); };
    document.head.append(s);
  });
}

/** UMD betiğini (Tone.js, VexFlow) yükler; getGlobal() hazır nesneyi döndürene kadar adresleri sırayla dener */
export function loadScriptGlobal(urls, getGlobal, name) {
  const ready = getGlobal();
  if (ready) return Promise.resolve(ready);
  if (!libCache.has(name)) {
    const p = (async () => {
      let lastErr = null;
      for (const url of urls) {
        try {
          await injectScript(url, CONFIG.LIBS.TIMEOUT_MS);
          const g = getGlobal();
          if (g) return g;
          lastErr = new Error(`${name} yüklendi ama beklenen nesne bulunamadı (${url})`);
        } catch (err) {
          lastErr = err;
          console.warn(`[${name}]`, err.message);
        }
      }
      throw Object.assign(new Error(`${name} yüklenemedi`), { code: 'LIB_LOAD', lib: name, cause: lastErr });
    })();
    libCache.set(name, p);
    p.catch(() => libCache.delete(name));            // başarısızlıkta yeniden denemeye izin ver
  }
  return libCache.get(name);
}

// pitchy (yalnızca PITCH.ALGORITHM = 'MPM' iken). Not: pitchy McLeod Pitch Method (MPM) uygular, YIN değil.
export let pitchyPromise = null;
export function loadPitchy() {
  if (!pitchyPromise) {
    pitchyPromise = (async () => {
      for (const url of CONFIG.LIBS.PITCHY) {
        try {
          const mod = await Promise.race([import(url), sleep(CONFIG.LIBS.TIMEOUT_MS).then(() => { throw new Error('zaman aşımı'); })]);
          if (mod.PitchDetector) return mod;
        } catch (err) {
          console.warn('[pitchy] yüklenemedi:', url, err);
        }
      }
      throw Object.assign(new Error('pitchy yüklenemedi'), { code: 'PITCHY_LOAD' });
    })().catch((err) => { pitchyPromise = null; throw err; });
  }
  return pitchyPromise;
}


// ───────────────────────────────────────────────────────────────────────
// 3) SES MOTORU — tek AudioContext · Tone.js piyano · yedek sentez
// ───────────────────────────────────────────────────────────────────────
export let audioCtx = null;                    // tek AudioContext: piyano, sentez ve mikrofon analizi aynı saatte
export let masterGain = null;
export let voiceWave = null;
export const activeVoices = new Set();         // susturma için çalan sentez sesleri
export const piano = { state: 'off', sampler: null, promise: null, error: null };   // off · loading · ready · failed
export let toneContextSet = false;

export function createVoiceWave(ctx) {
  // Yedek tını: sinüs temel + hızla sönen birkaç harmonik (yumuşak, net bir referans)
  const amps = [1, 0.30, 0.10, 0.04, 0.015];
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => { imag[i + 1] = a; });
  return ctx.createPeriodicWave(real, imag);
}

/**
 * AudioContext'i oluşturur. Sayfa açılışında çağrılır (tarayıcı "askıda" başlatır, piyano örnekleri
 * bu sırada çözülür); ilk tıklamada ensureAudio() ile başlatılır.
 */
export function createAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw Object.assign(new Error('Web Audio API yok'), { code: 'NO_WEBAUDIO' });
  audioCtx = new Ctx({ latencyHint: 'interactive' });
  masterGain = audioCtx.createGain();
  masterGain.gain.value = CONFIG.AUDIO.MASTER_GAIN;
  masterGain.connect(audioCtx.destination);
  voiceWave = createVoiceWave(audioCtx);
  return audioCtx;
}

export async function ensureAudio() {
  createAudioContext();
  if (audioCtx.state !== 'running') await audioCtx.resume();   // kullanıcı jesti içinde çağrılır
}

/** Tone.js + Salamander piyano örneklerini hazırlar. Başarısızlıkta false döner (yedek sentez kullanılır). */
export function preparePiano() {
  if (CONFIG.AUDIO.INSTRUMENT !== 'piano') return Promise.resolve(false);
  if (piano.promise) return piano.promise;
  const P = CONFIG.AUDIO.PIANO;
  piano.state = 'loading';
  piano.error = null;
  renderEngineChip();
  piano.promise = (async () => {
    window.TONE_SILENCE_LOGGING = true;
    const Tone = await loadScriptGlobal(CONFIG.LIBS.TONE, () => (window.Tone?.Sampler ? window.Tone : null), 'Tone.js');
    createAudioContext();
    if (!toneContextSet) { Tone.setContext(audioCtx); toneContextSet = true; }   // Tone aynı AudioContext'i kullanır
    const urls = pianoSampleMap(CONFIG.REGISTER, P.SAMPLE_EVERY, P.FILE_PATTERN);
    const sampler = await new Promise((resolve, reject) => {
      let s = null;
      const timer = setTimeout(() => reject(new Error('piyano örnekleri zaman aşımına uğradı')), P.LOAD_TIMEOUT_MS);
      s = new Tone.Sampler({
        urls,
        baseUrl: P.BASE_URL,
        release: P.RELEASE_S,
        onload: () => { clearTimeout(timer); setTimeout(() => resolve(s), 0); },
        onerror: (e) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
      });
      s.toDestination();
      s.volume.value = P.VOLUME_DB;
    });
    piano.sampler = sampler;
    piano.state = 'ready';
    renderEngineChip();
    return true;
  })().catch((err) => {
    console.warn('[piyano] kullanılamıyor, dahili sentez kullanılacak:', err);
    piano.state = 'failed';
    piano.error = err;
    renderEngineChip();
    showNotice('Piyano örnekleri yüklenemedi (internet / CDN); dahili sentez sesi kullanılıyor.');
    return false;
  });
  return piano.promise;
}

export function resetPiano() {
  try { piano.sampler?.dispose?.(); } catch { /* yoksay */ }
  Object.assign(piano, { state: 'off', sampler: null, promise: null, error: null });
}

/** Yedek sentez: tek ses, ADSR benzeri zarf (AudioParam zamanlaması, örnek-hassasiyetinde) */
export function playVoice(freq, when, holdSec, peak) {
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.setPeriodicWave(voiceWave);
  osc.frequency.value = freq;

  const attack = 0.03, decayTau = 0.35, sustain = 0.72, tau = CONFIG.AUDIO.SYNTH_RELEASE_TAU;
  const releaseAt = when + holdSec;
  env.gain.value = 0;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(peak, when + attack);             // atak (tıkırtısız)
  env.gain.setTargetAtTime(peak * sustain, when + attack, decayTau);   // yumuşak sönüm
  env.gain.setTargetAtTime(0, releaseAt, tau);                         // bırakma

  osc.connect(env).connect(masterGain);
  osc.start(when);
  osc.stop(releaseAt + tau * 8);

  const voice = { osc, env };
  activeVoices.add(voice);
  osc.onended = () => { osc.disconnect(); env.disconnect(); activeVoices.delete(voice); };
}

/** Sesleri AYNI ANDA (armonik) çalar: piyano hazırsa piyano, değilse yedek sentez */
export function playHarmonic(notes, durationSec, when) {
  if (!notes.length) return 'none';
  if (CONFIG.AUDIO.INSTRUMENT === 'piano' && piano.state === 'ready') {
    try {
      piano.sampler.triggerAttackRelease(notes.map((n) => n.freq), durationSec, when, CONFIG.AUDIO.PIANO.VELOCITY);
      return 'piano';
    } catch (err) {
      console.warn('[piyano] çalınamadı → sentez', err);
    }
  }
  const peak = 0.6 / Math.sqrt(notes.length);                        // ses sayısına göre seviye → kırpılma yok
  for (const n of notes) playVoice(n.freq, when, durationSec, peak);
  return 'synth';
}

/**
 * Çalım planına göre çalar: 'melodic' ayrı ayrı (söyleme sırasıyla; varsayılan alttan yukarı) · 'both' önce ayrı, sonra birlikte · 'harmonic' birlikte.
 * Planı ve süreyi playbackPlan() (PURE) verir. @returns {number} toplam süre (sn)
 */
export function playMelodic(notes, mode = 'melodic', when = audioCtx.currentTime + 0.06) {
  const plan = playbackPlan(mode, notes.length, CONFIG.AUDIO);
  for (const st of plan.steps) playHarmonic(st.indices.map((i) => notes[i]), st.dur, when + st.start);
  return plan.total;
}

/** Serbest çalışmada tamamlanma ödülü: kısa arpej + son akor */
export function playReward(notes) {
  const t0 = audioCtx.currentTime + 0.1, step = 0.16;
  notes.forEach((n, i) => playHarmonic([n], 0.28, t0 + i * step));
  playHarmonic(notes, 1.4, t0 + notes.length * step + 0.05);
}

export function stopAllVoices() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const { osc, env } of activeVoices) {
    try {
      env.gain.cancelScheduledValues(now);
      env.gain.setTargetAtTime(0, now, 0.015);
      osc.stop(now + 0.12);
    } catch { /* zaten durmuş olabilir */ }
  }
}
export function stopAllSound() {
  stopAllVoices();
  try { piano.sampler?.releaseAll?.(); } catch { /* yoksay */ }
}
