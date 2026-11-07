// Solfej Lab — js/mic.js
// Mikrofon (getUserMedia, işlemsiz giriş) ve perde algılama kurulumu (YIN / pitchy-MPM).

import { CONFIG } from './config.js';
import { MedianFilter, YinDetector, dbToLin } from './pure.js';
import { audioCtx, loadPitchy, setAudioSession } from './audio.js';
import { bgPaused, examActive, renderDetectorChip, setMicChip, showAlert, showNotice, ui, updateLatencyChip } from './ui.js';
import { assignRafId, frame, hardReset, rafId } from './app.js';

// ───────────────────────────────────────────────────────────────────────
// 4) MİKROFON & PERDE ALGILAMA
// ───────────────────────────────────────────────────────────────────────
export const settings = { fold: true, rmsDb: CONFIG.PITCH.NOISE_GATE_DB, deviceId: null };
export let rmsLinear = dbToLin(settings.rmsDb);

export let micStream = null, micSource = null, analyser = null;
export let detector = null, detectorKey = '';
export let timeBuf = new Float32Array(2048);
export let medianFilter = new MedianFilter(CONFIG.PITCH.MEDIAN_FRAMES);

/** Analiz penceresi: 'auto' → 48 kHz'de 2048 örnek (≈ 43 ms); 96 kHz'de 4096 (aynı süre) */
export function analysisSize(sampleRate) {
  const c = CONFIG.PITCH.FFT_SIZE;
  return c === 'auto' ? 2048 * Math.max(1, Math.round(sampleRate / 48000)) : c;
}

/** Algılayıcıyı gerçek çıktısıyla sınar: 220 Hz temiz sinüs → ≈ 220 Hz ve yüksek netlik beklenir */
export function probeDetector(det, sampleRate) {
  const probe = new Float32Array(det.size);
  for (let i = 0; i < probe.length; i++) probe[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
  const [pitch, clarity] = det.findPitch(probe, sampleRate);
  if (!(Math.abs(pitch - 220) < 2.2 && clarity > 0.9)) throw new Error(`beklenmeyen çıktı: ${pitch} Hz / netlik ${clarity}`);
  return det;
}

/** YIN; 88,2/96 kHz gibi yüksek örnekleme hızlarında 48 kHz eşdeğerine indirgenir (CPU yükü sabit kalır) */
export function createYinDetector(size, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / 48000));
  const n = Math.floor(size / factor);
  const P = CONFIG.PITCH;
  const yin = new YinDetector(n, { threshold: P.YIN_THRESHOLD, adaptiveK: P.YIN_ADAPTIVE_K, minFreq: P.MIN_FREQ, maxFreq: P.MAX_FREQ });
  const tmp = factor > 1 ? new Float32Array(n) : null;
  return probeDetector({
    name: 'YIN',
    size,
    findPitch(buf, sr) {
      if (!tmp) return yin.findPitch(buf, sr);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k < factor; k++) s += buf[i * factor + k];
        tmp[i] = s / factor;
      }
      return yin.findPitch(tmp, sr / factor);
    },
  }, sampleRate);
}

export function createMpmDetector(pitchy, size, sampleRate) {
  try {
    const det = pitchy.PitchDetector.forFloat32Array(size);
    return probeDetector({ name: 'MPM', size, findPitch: (buf, sr) => det.findPitch(buf, sr) }, sampleRate);
  } catch (err) {
    throw Object.assign(new Error(`pitchy uyumsuz: ${err?.message || err}`), { code: 'PITCHY_API' });
  }
}

/** CONFIG.PITCH'e göre algılayıcıyı (yeniden) kurar. MPM yüklenemezse YIN'e düşer. */
export async function setupDetector() {
  const sr = audioCtx.sampleRate, size = analysisSize(sr), P = CONFIG.PITCH;
  const key = [P.ALGORITHM, size, P.YIN_THRESHOLD, P.YIN_ADAPTIVE_K, P.MIN_FREQ, P.MAX_FREQ].join('|');
  if (detector && key === detectorKey) return detector;
  let det = null;
  if (P.ALGORITHM === 'MPM') {
    try { det = createMpmDetector(await loadPitchy(), size, sr); }
    catch (err) {
      console.warn('[MPM] kullanılamıyor, YIN ile devam ediliyor:', err);
      showNotice('pitchy (MPM) yüklenemedi; dahili YIN algılayıcı kullanılıyor.');
    }
  }
  if (!det) det = createYinDetector(size, sr);
  detector = det;
  detectorKey = key;
  if (timeBuf.length !== size) timeBuf = new Float32Array(size);
  if (analyser && analyser.fftSize !== size) analyser.fftSize = size;
  medianFilter = new MedianFilter(P.MEDIAN_FRAMES);
  renderDetectorChip();
  return det;
}

export async function startMic(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('getUserMedia yok'), { code: 'INSECURE' });
  }
  stopMic();

  const audio = {
    echoCancellation: false,    // tarayıcının "ses iyileştirmeleri" perdeyi bozar ve gecikme ekler
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    latency: { ideal: 0 },      // mümkün olan en küçük giriş tamponu (ipucu)
  };
  if (deviceId) audio.deviceId = { exact: deviceId };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch (err) {
    if (err.name === 'OverconstrainedError' && deviceId) {          // seçili cihaz artık yok → varsayılana dön
      settings.deviceId = null;
      return startMic(null);
    }
    throw err;
  }

  const track = stream.getAudioTracks()[0];
  track?.addEventListener('ended', onMicLost);
  micStream = stream;
  setAudioSession('play-and-record');               // iOS: mikrofon + çalım aynı oturumda (destek varsa)
  micSource = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = analysisSize(audioCtx.sampleRate);
  analyser.smoothingTimeConstant = 0;
  micSource.connect(analyser);                                       // hoparlöre BAĞLANMAZ → geri besleme yok

  setMicChip(true, 'Mikrofon açık');
  if (track) updateLatencyChip(track);
  refreshDevices();
  if (!rafId) assignRafId(requestAnimationFrame(frame));
}

export function stopMic() {
  if (micStream) micStream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  if (micSource) micSource.disconnect();
  micStream = null; micSource = null; analyser = null;
  setMicChip(false, 'Mikrofon kapalı');
}

export async function ensureMic() {
  if (analyser && micStream?.active && micStream.getAudioTracks()[0]?.readyState !== 'ended') return;
  await startMic(settings.deviceId);
}

export function onMicLost() {
  stopMic();
  // Telefon arka plana geçince tarayıcı mikrofonu kapatabilir: oturum silinmez, dönünce "Devam et" mikrofonu yeniden açar
  if (document.hidden || bgPaused) { setMicChip(false, 'Mikrofon durdu'); return; }
  setMicChip(false, 'Giriş koptu');
  hardReset();
  showAlert('Ses girişi kesildi (cihaz çıkarılmış olabilir). Girişi kontrol edip yeniden başlayın.');
}

export async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  ui.device.replaceChildren();
  list.forEach((d, i) => ui.device.add(new Option(d.label || `Giriş ${i + 1}`, d.deviceId)));
  const current = micStream?.getAudioTracks()[0]?.getSettings().deviceId;
  if (current && [...ui.device.options].some((o) => o.value === current)) ui.device.value = current;
  ui.device.disabled = list.length === 0 || examActive();      // sınav sürerken giriş değiştirilemez
}

export function explainError(err) {
  if (err?.code === 'PITCHY_LOAD') return 'Perde algılama kütüphanesi (pitchy) yüklenemedi. İnternet bağlantınızı kontrol edin ya da Ayarlar\'dan YIN\'i seçin.';
  if (err?.code === 'PITCHY_API')  return 'pitchy beklenen biçimde çalışmadı (sürüm / API uyumsuzluğu olabilir). Ayrıntı için tarayıcı konsoluna bakın.';
  if (err?.code === 'NO_WEBAUDIO') return 'Bu tarayıcı Web Audio API desteklemiyor.';
  if (err?.code === 'INSECURE' || err?.name === 'SecurityError') return 'Mikrofon için sayfa https veya http://localhost üzerinden açılmalıdır.';
  switch (err?.name) {
    case 'NotAllowedError':  return micDeniedText();
    case 'NotFoundError':    return 'Ses girişi bulunamadı. Ses kartınızın bağlı ve işletim sisteminde etkin olduğundan emin olun.';
    case 'NotReadableError': return mobileDevice()
      ? 'Mikrofon açılamadı: başka bir uygulama (telefon görüşmesi, ses kaydı, görüntülü arama) kullanıyor olabilir. O uygulamayı kapatıp "Başlat"a yeniden dokunun.'
      : 'Ses girişi açılamadı; başka bir uygulama (ör. ASIO/özel mod) kullanıyor olabilir.';
    case 'AbortError':       return 'Mikrofon açılırken kesildi (ör. arama geldi ya da uygulama arka plana geçti). "Başlat"a yeniden dokunun.';
    case 'OverconstrainedError': return 'Seçili ses girişi bu ayarlarla açılamadı. Ayarlar → Ses ve algılama bölümünden başka bir giriş seçin.';
    default:                 return `Beklenmeyen hata: ${err?.message || err}`;
  }
}
/** Dokunmatik ana işaretçi (telefon / tablet) */
const mobileDevice = () => !!window.matchMedia?.('(pointer: coarse)').matches;
/** Mikrofon izni reddedildi: cihaza göre nereden açılacağını söyler */
function micDeniedText() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const head = 'Mikrofon izni verilmedi; uygulama sesinizi duyamıyor.';
  if (ios) return `${head} iPhone/iPad: adres çubuğundaki "aA" (ya da ⓘ) simgesine dokunun → Web Sitesi Ayarları → Mikrofon → İzin Ver. İzin sorulmuyorsa Ayarlar → Safari → Mikrofon bölümüne bakın. Sonra "Başlat"a yeniden dokunun.`;
  if (/Android/.test(ua)) return `${head} Android: adres çubuğundaki kilit simgesine dokunun → İzinler → Mikrofon → İzin ver. Hâlâ olmuyorsa telefonun Ayarlar → Uygulamalar → tarayıcı → İzinler bölümünde mikrofonu açın. Sonra "Başlat"a yeniden dokunun.`;
  return `${head} Adres çubuğundaki izin simgesinden mikrofona izin verip tekrar deneyin.`;
}

// ── Başka modüllerin değiştirdiği paylaşılan değişkenler ──
// ES modüllerinde içe aktarılan bir değişkene atama yapılamaz (okuma her zaman güncel değeri verir).
// Bu yüzden değişkenin sahibi olan modül küçük atayıcılar (setter) dışa açar.
export function assignRmsLinear(v) { rmsLinear = v; }
export function assignMedianFilter(v) { medianFilter = v; }
