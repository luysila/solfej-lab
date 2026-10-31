// Solfej Lab — js/config.js
// Merkezi yapılandırma: CONFIG (ayarlar, arayüz metinleri TEXTS, hazır standartlar PRESETS) ve DEFAULT_CONFIG.
// Geliştiricinin en sık değiştireceği dosya. Arayüzdeki "Ayarlar ve standartlar" paneli bunun üzerine yazar (localStorage).

import { deepClone, deepFreeze } from './pure.js';

// ───────────────────────────────────────────────────────────────────────
// 0) MERKEZİ YAPILANDIRMA — tüm ayarlar burada
// ───────────────────────────────────────────────────────────────────────
export const CONFIG = {
  // ══ 1. SINAV STANDARDI ══════════════════════════════════════════════
  TOLERANCE_CENTS: 20,            // Hedeften sapma payı: −20 … +20 sent içi "doğru" (yeşil)
  WARNING_CENTS: 35,              // Göstergede sarı ("sınırda") bandın sınırı; ötesi kırmızı
  SUSTAIN_TIME_MS: 250,           // "na" hecesiyle yeşil bantta KESİNTİSİZ tutma süresi (0,25 sn)
  SUSTAIN_DROPOUT_GRACE_MS: 60,   // Yalnızca ALGILAMA kopmalarına (tek kare sessizlik / düşük netlik) tolerans.
                                  // Bant dışına çıkmaya tolerans yoktur. 0 = tamamen katı.
  QUESTION_COUNTS: { single: 5, double: 5, triple: 5 },   // Sınav yapısı: tek, iki, üç ses
  QUESTION_ORDER: 'grouped',      // 'grouped' → tek → iki → üç ses (sınavdaki sıra) · 'shuffled' → karışık
  REGISTER: { minMidi: 48, maxMidi: 72 },                  // C3 – C5: tüm sesler bu aralıktan seçilir
  A4_HZ: 440,                     // Diyapazon (orkestra çalışması için 442)
  OCTAVE_MODE: 'free',            // Oktav toleransı açıkken:
                                  //   'free'     → her ses kendi en yakın oktavına katlanır (algılama oktav hatalarına en dayanıklı)
                                  //   'anchored' → ilk ses hangi oktavda söylendiyse sorunun geri kalanı da o oktavda (daha katı)
                                  //   'off'      → mutlak oktav (yazıldığı gibi)
                                  //   Not: oktav aralığı sorularında (aynı perde sınıfı iki kez) 'free' otomatik olarak 'anchored' olur.

  CHORD_RULES: {                  // Üç ses soruları: kök durumunda 5'li akorlar
    SET_SIZE: 5,                  // kurallar her 5 soruluk sete ayrı uygulanır
    MAX_ALTERED_PER_SET: 1,       // sette EN FAZLA 1 artmış (aug) / eksilmiş (dim) akor
    ALTERED_CHANCE: 0.5,          // bir sette artmış/eksilmiş akor bulunma olasılığı (0 = hiç, 1 = her sette)
    ALTERED_TYPES: ['augmented', 'diminished'],
    MAIN_WEIGHTS: { major: 1, minor: 1 },                  // geri kalanlar: majör / minör (ağırlıklı seçim)
    MIN_EACH_MAIN: 1,             // her sette en az 1 majör ve 1 minör (yer varsa)
    INVERSIONS: { root: 2, first: 1, second: 1 },   // akor durumlarının ağırlığı: temel durum · 1. çevrim (6) · 2. çevrim (6/4)
    AUGMENTED_INVERSIONS: false,  // artmış akor çevrimleri (simetrik olduğu için kulakta temel durumdan ayırt edilemez) → kapalı: yalnız temel durum
  },
  INTERVAL_RULES: {               // İki ses soruları: aralıklar (alttaki ses kök)
    POOL: ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'],   // 'd5' de eklenebilir
    WEIGHTS: {},                  // ör. { A4: 0.5 } → triton yarı sıklıkta; boş = hepsi eşit
  },
  SPELLING: {
    ALLOW_DOUBLE_ACCIDENTALS: false,   // çift diyez / çift bemol gerektiren köklerden kaçın
    SINGLE_NOTE_ACCIDENTALS: 'mixed',  // tek seste siyah tuş yazımı: 'mixed' | 'sharp' | 'flat'
  },
  NO_REPEAT: true,                // aynı oturumda aynı soru (aynı tip + aynı durum + aynı kök) tekrar etmez
  SING_ORDER: 'bass',             // söyleme sırası: 'bass' → en alttaki sesten yukarı (çevrimde basta 3'lü / 5'li) · 'root' → kökten başla

  // ══ 2. SINAV AKIŞI ══════════════════════════════════════════════════
  EXAM: {
    REVEAL_NOTE_NAMES: 'after',   // 'after' → ses doğrulanınca adı açılır · 'end' → soru bitince · 'always' · 'never'
    LIVE_FEEDBACK: true,          // ibre, perde grafiği ve sustain dolumu (false = sınav provası: körlemesine)
    NEXT_QUESTION_DELAY_MS: 1400, // soru bitince sıradakine geçmeden önce
    QUESTION_TIME_LIMIT_S: 0,     // soru başına dinleme süresi sınırı (sn); 0 = sınırsız
    ALLOW_REPLAY: true,
    ALLOW_SKIP: true,
    PLAYBACK: 'harmonic',         // sınavda çalım biçimi: 'harmonic' → birlikte · 'melodic' → ayrı ayrı (kökten yukarı) · 'both' → önce ayrı, sonra birlikte
  },

  // ══ 3. PUANLAMA ═════════════════════════════════════════════════════
  SCORING: {
    PARTIAL_CREDIT: true,         // 3 sesin 2'si doğrulandıysa sorunun 2/3'ü; false → hepsi ya da hiç
    TYPE_WEIGHTS: { single: 1, double: 1, triple: 1 },
    REPLAY_PENALTY: 0,            // her "tekrar çal" için soru kredisinden düşülen oran (ör. 0.1 = %10)
  },

  // ══ 4. ANALİTİK (teşhis ekranı) — hesap computeDiagnostics() içinde ═══
  ANALYSIS: {
    BIAS_WINDOW_CENTS: 50,        // eğilim hesabına giren kareler: hedefe ±50 sent yakın olanlar
    BIAS_NEUTRAL_CENTS: 5,        // |ortalama sapma| bunun altındaysa "dengeli"
    MIN_FRAMES: 15,               // eğilimi yorumlamak için gereken en az kare
    NOTABLE_DIFFICULTY: 0.3,      // "en çok zorlanılan" yorumu için en düşük zorlanma puanı (0–1)
    DIFFICULTY_WEIGHTS: { failure: 0.45, time: 0.25, replays: 0.15, deviation: 0.15 },
    TIME_REF_MS: 8000,            // ses başına bu süre → süre bileşeni %100
    REPLAY_REF: 2,                // soru başına bu kadar tekrar → %100
    DEVIATION_REF_CENTS: 25,      // ortalama mutlak sapma bu değerde → %100
  },

  // ══ 5. PERDE ALGILAMA ═══════════════════════════════════════════════
  PITCH: {
    ALGORITHM: 'YIN',             // 'YIN' → dahili, kütüphanesiz · 'MPM' → pitchy (McLeod Pitch Method)
    FFT_SIZE: 'auto',             // analiz penceresi (örnek): 'auto' → 48 kHz'de 2048 (≈ 43 ms), 96 kHz'de 4096
    YIN_THRESHOLD: 0.15,          // YIN mutlak eşiği (makalede 0,10–0,15)
    YIN_ADAPTIVE_K: 0.95,         // uyarlamalı eşik: belirgin periyot varken sığ alt-periyot çukurlarını reddeder
                                  // (baskın üst harmonikte oktav-üstü hatasını azaltır). 0 = klasik YIN
    MIN_CLARITY: 0.80,            // netlik (YIN: 1 − d′, MPM: NSDF tepesi) bunun altındaysa kare geçersiz
    MIN_FREQ: 55,                 // Hz — oktav katlamayla bas sesler (≈ A1) de okunabilsin
    MAX_FREQ: 1400,               // Hz
    MEDIAN_FRAMES: 3,             // tek karelik oktav sıçramalarını süzen medyan filtre (1 = kapalı)
    NOISE_GATE_DB: -40,           // gürültü eşiği varsayılanı (dBFS); arayüzdeki kaydırıcıyla değişir
    NOISE_GATE_MIN_DB: -70,
    NOISE_GATE_MAX_DB: -15,
    MAX_FRAME_GAP_MS: 150,        // iki kare arası bundan uzunsa (sekme gizlendi vb.) süreklilik sıfırlanır
  },

  // ══ 6. SES (ÇALIM) ══════════════════════════════════════════════════
  AUDIO: {
    INSTRUMENT: 'piano',          // 'piano' → Tone.js + gerçek piyano örnekleri · 'synth' → dahili sentez (çevrimdışı)
    CHORD_DURATION_S: 1.8,        // seslerin aynı anda (armonik) çalınma süresi
    MELODIC_NOTE_S: 0.9,          // ayrı ayrı çalımda her sesin süresi (sn)
    MELODIC_GAP_S: 0.15,          // ayrı ayrı çalımda sesler arası boşluk (sn)
    BOTH_PAUSE_S: 0.4,            // "önce ayrı, sonra birlikte"de ayrı seslerden sonra, akordan önceki bekleme (sn)
    PRACTICE_PLAYBACK: 'harmonic',// serbest çalışmada "Çalım biçimi" varsayılanı (seçim tercihlerde saklanır)
    LISTEN_DELAY_MS: 450,         // çalım bitince dinlemeye başlamadan önce (kuyruk sönsün)
    VERIFIED_HOLD_MS: 650,        // doğrulamadan sonra sıradaki sese geçmeden önce
    MASTER_GAIN: 0.6,             // yedek sentez seviyesi
    SYNTH_RELEASE_TAU: 0.12,      // yedek sentez bırakma zaman sabiti (sn)
    PIANO: {
      // Salamander Grand Piano V3 — Alexander Holm, CC BY 3.0 (Tone.js örnek deposu).
      // Başka bir örnek seti (ör. MIDI.js soundfont mp3'leri) için BASE_URL / FILE_PATTERN değiştirilir.
      BASE_URL: 'https://tonejs.github.io/audio/salamander/',
      FILE_PATTERN: '{name}.mp3', // {name} → C4, Ds4, Fs4, A4 ("#" yerine "s")
      SAMPLE_EVERY: 3,            // her 3 yarım seste bir örnek (C, D♯, F♯, A); Tone.Sampler aradakileri kaydırır
      RELEASE_S: 0.8,
      VOLUME_DB: -6,
      VELOCITY: 0.7,
      LOAD_TIMEOUT_MS: 15000,
      WAIT_ON_START_MS: 6000,     // "Teste Başla"da piyano hâlâ yükleniyorsa en fazla bu kadar beklenir
    },
  },

  // ══ 7. ARAYÜZ ═══════════════════════════════════════════════════════
  UI: {
    VIEW_MODE: 'staff+graph',     // görünüm varsayılanı: 'staff' (yalnız porte: hedef ve canlı nota başı) · 'staff+graph' (porte + akan çizgi) · 'graph' (sent grafiği)
                                  // Sınav ve Serbest çalışma için seçim ayrı ayrı hatırlanır (solfejlab.ui.v1)
    VEXFLOW_PANEL: false,         // ayrı VexFlow porte paneli (yalnızca "Portede göster" açıkken; kütüphane CDN'den yüklenir)
    STAFF_WARN_YELLOW: false,     // portede canlı nota başı ve çizgi: true → sınırdayken (WARNING_CENTS içinde) sarı; false → yalnızca yeşil/kırmızı
    GAUGE_RANGE_CENTS: 100,       // dikey göstergenin yarı ölçeği (± sent); 100 → uçlar tam bir yarım ses aşağı/yukarı
    CONTOUR_SECONDS: 6,           // perde grafiğinin zaman penceresi
    CONTOUR_RANGE_CENTS: 100,     // perde grafiğinin dikey aralığı (± sent)
    NEEDLE_SMOOTHING_MS: 55,      // ibre yumuşatma (yalnızca görsel; puanlama ham değerle yapılır)
    READOUT_INTERVAL_MS: 80,      // sayısal göstergelerin yenileme aralığı
    COACH_INTERVAL_MS: 5000,      // sözlü yönlendirme aralığı: bu sürenin özetinden tek cümle (anlık uyarı yok)
    COACH_FONT_PX: 20,            // yönlendirme yazısının boyutu (px, masaüstü); telefonda 2 px küçük
    COACH_FAR_CENTS: 70,          // ortalama sapma bunu aşarsa "epey pes/tiz" söyleyişi (yoksa "biraz pes/tiz")
  },

  // ══ 8. KAYIT — "Önceki Testlerim" ═══════════════════════════════════
  HISTORY: {
    ENABLED: true,
    STORAGE_KEY: 'solfejlab.history.v1',
    MAX_ENTRIES: 50,
    CHART_LAST_N: 12,             // grafikte gösterilecek son test sayısı
    LIST_LAST_N: 8,               // listede gösterilecek son test sayısı
    SAVE_UNFINISHED: true,        // yarıda bitirilen testler de kaydedilsin
  },

  // ══ 9. DIŞ KÜTÜPHANELER (CDN; sırayla denenir) ══════════════════════
  LIBS: {
    TONE:    ['https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js', 'https://unpkg.com/tone@14.7.77/build/Tone.js'],
    VEXFLOW: ['https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/cjs/vexflow.js', 'https://unpkg.com/vexflow@4.2.5/build/cjs/vexflow.js'],
    PITCHY:  ['https://esm.sh/pitchy@4', 'https://cdn.jsdelivr.net/npm/pitchy@4/+esm'],
    TIMEOUT_MS: 15000,
  },

  // ══ 10. ARAYÜZ METİNLERİ ════════════════════════════════════════════
  TEXTS: {
    // Arayüz adları: panel başlıkları, sekmeler, düğmeler, gösterge etiketleri. Arayüz bunları textContent ile yazar.
    // Ayarlar → "Arayüz adları" grubunda kendiliğinden listelenir; "Adları sayfada düzenle" ile yerinde değiştirilir.
    // Kural (validateConfig): ad boş olamaz, en fazla 80 karakter (yönlendirme cümleleri en fazla 160).
    panelMode: 'Çalışma modu',
    panelSummary: 'Sınav sonucu · teşhis',
    panelNotes: 'Okunacak sesler',
    panelStaff: 'Porte',
    panelTuner: 'Akort',
    panelHistory: 'Önceki testlerim',
    panelSettings: 'Ayarlar ve standartlar',
    tabExam: 'Sınav',
    tabPractice: 'Serbest çalışma',
    btnStart: '▶ Teste Başla',
    btnNewTest: '▶ Yeni Test',
    btnExamReplay: '↻ Tekrar Çal',
    btnSkip: '⏭ Soruyu Geç',
    btnEnd: '■ Testi Bitir',
    btnPlay: '▶ Çal & Başla',
    btnRestart: '▶ Baştan Başla',
    btnReplay: '↻ Tekrar Çal',
    btnReset: '⟲ Sıfırla',
    btnClose: 'Kapat',
    btnHistoryClear: 'Geçmişi temizle',
    btnHistoryConfirm: 'Silmek için tekrar tıklayın',
    btnApply: 'Kaydet ve uygula',
    btnDefaults: 'Varsayılana dön',
    btnJsonApply: "JSON'u uygula",
    btnJsonExport: 'Dışa aktar (.json)',
    btnJsonImport: 'İçe aktar…',
    btnJsonCopyAll: "Tüm CONFIG'i kopyala",
    btnCopyNames: 'Adları kopyala',
    toggleFold: 'Oktav toleransı',
    toggleEditNames: 'Adları sayfada düzenle',
    labelTarget: 'Hedef',
    labelHeard: 'Okunan',
    labelDeviation: 'hedefe göre',
    labelSustain: 'Süreklilik (sustain)',
    gaugeSharp: 'tiz',
    gaugeFlat: 'pes',
    legendPitch: 'Okunan perde',
    legendHeld: 'Tolerans içinde',
    legendOut: 'Dışında',
    legendGuide: 'Hedef',
    labelPlayback: 'Çalım biçimi',
    playbackHarmonic: 'Birlikte (armonik)',
    playbackMelodic: 'Ayrı ayrı (alttan yukarı)',
    playbackBoth: 'Önce ayrı, sonra birlikte',
    notePlayHint: 'Bu sesi çal',
    // Söyleme talimatı ve akor durumu (Aşama 3)
    singFromBass: 'en alttaki sesten başlayarak',
    singFromRoot: 'kökten başlayarak',
    labelInversion: 'Durum',
    invRoot: 'Temel durum',
    invFirst: '1. çevrim (6)',
    invSecond: '2. çevrim (6/4)',
    // Bölümler ve menü (Aşama 1)
    btnMenu: 'Menü',
    chipCustomConfig: 'Özel ayarlar etkin',
    navHome: 'Ana sayfa',
    navExam: 'Sınav',
    navPractice: 'Serbest çalışma',
    navHistory: 'Önceki testlerim',
    navSettings: 'Ayarlar',
    navHelp: 'Yardım',
    homeTitle: 'Bugün ne çalışalım?',
    tileExam: 'Sınav',
    tileExamDesc: 'Konservatuvar sınavı biçiminde: tek, iki ve üç ses',
    tileCustom: 'Kendi sınavını hazırla',
    tileCustomDesc: 'Soru tiplerini, aralıkları ve kuralları sen seç',
    tilePractice: 'Serbest çalışma',
    tilePracticeDesc: 'Ses, aralık ya da akor seç; kendi hızında çalış',
    tileHistory: 'Önceki testlerim',
    tileHistoryDesc: 'Puanların, eğilimin ve teşhislerin',
    panelExam: 'Sınav',
    panelPractice: 'Serbest çalışma',
    panelHelp: 'Yardım',
    practiceBusyMsg: 'Sürmekte olan bir sınav var; serbest çalışma için önce sınavı bitirin.',
    btnBackToExam: 'Sınava dön',
    btnPause: '⏸ Duraklat',
    btnResume: '▶ Devam',
    statePaused: 'Duraklatıldı',
    labelDevice: 'Mikrofon girişi',
    setTabStd: 'Standart sınav',
    setTabAudio: 'Ses ve algılama',
    setTabView: 'Görünüm',
    setTabNames: 'Arayüz adları',
    setTabAdv: 'Gelişmiş (JSON)',
    helpHowTo: 'Nasıl kullanılır?',
    helpTips: 'İpuçları',
    // Kendi sınavını hazırla (Aşama 4)
    navCustom: 'Kendi sınavını hazırla',
    examTabStd: 'Standart sınav',
    examTabCustom: 'Kendi sınavını hazırla',
    cxName: 'Sınavın adı',
    cxCounts: 'Soru sayıları',
    cxIntervals: 'Aralıklar',
    cxQuickAll: 'Hepsi',
    cxQuickNone: 'Hiçbiri',
    cxQuickPerfect: 'Tam aralıklar',
    cxQuick36: "3'lü ve 6'lılar",
    cxQuick27: "2'li ve 7'liler",
    cxQuickTritone: 'Triton',
    cxChords: 'Akorlar',
    cxAlteredRule: '5 soruda en fazla 1 artmış/eksilmiş',
    cxInversions: 'Akor durumu',
    cxOrder: 'Sıra',
    cxOrderGrouped: 'Gruplu',
    cxOrderShuffled: 'Karışık',
    cxRegister: 'Ses aralığı',
    cxPlayback: 'Çalım biçimi',
    cxPlayHarmonic: 'Birlikte',
    cxPlayMelodic: 'Ayrı ayrı',
    cxPlayBoth: 'Önce ayrı, sonra birlikte',
    cxTime: 'Soru süresi',
    cxTimeNone: 'Yok',
    cxReplay: 'Tekrar çalma',
    cxSkip: 'Soru geçme',
    cxAllow: 'İzin var',
    cxDeny: 'Yok',
    cxReveal: 'Nota adlarının açılması',
    cxRevealAfter: 'Ses doğrulanınca',
    cxRevealEnd: 'Soru bitince',
    cxRevealSession: 'Sınav sonunda',
    cxRevealNever: 'Hiç',
    cxFeedback: 'Canlı geri bildirim',
    cxFeedbackOn: 'Açık',
    cxFeedbackOff: 'Kapalı (prova)',
    cxTolerance: 'Tolerans',
    cxTolLoose: 'Esnek ±30',
    cxTolDefault: 'Varsayılan ±20',
    cxTolStrict: 'Sıkı ±10',
    cxSustain: 'Tutma süresi',
    btnCxStart: '▶ Bu sınavı başlat',
    btnCxSave: 'Kaydet',
    btnCxReset: 'Sıfırla',
    cxMyExams: 'Sınavlarım',
    cxEmptyList: 'Henüz kayıtlı sınav yok. Ayarları seçip “Kaydet”e basın.',
    btnCxRun: '▶ Başlat',
    btnCxEdit: 'Düzenle',
    btnCxCopy: 'Kopyala',
    btnCxDelete: 'Sil',
    btnCxConfirmDelete: 'Silinsin mi?',
    sumAnswersTitle: 'Sorular ve cevaplar',
    // Görünüm seçici ve sınavdaki porte anahtarı (Aşama 2)
    labelView: 'Görünüm',
    viewStaff: 'Porte',
    viewBoth: 'Porte + grafik',
    viewGraph: 'Grafik',
    toggleExamStaff: 'Porte',
    toggleExamStaffHint: 'Kapalı: yalnızca gösterge ve yönlendirme',
    // Yönlendirme cümleleri: çok kısa ve net (2–4 kelime), her durum için 2 söyleyiş; yön için ↑ / ↓.
    // Sırayla kullanılır, aynı cümle üst üste gelmez.
    COACH: {
      idle:      { a: 'Öneriler burada görünür' },
      quiet:     { a: 'Mikrofona yaklaşın', b: 'Biraz daha güçlü söyleyin' },
      unclear:   { a: 'Düz ve net bir “na”', b: 'Vibratosuz, sade söyleyin' },
      blind:     { a: 'Rahat ve düz tutun', b: 'Sabit bir “na” ile sürün' },
      octave:    { a: 'Oktav farklı', b: 'İlk sesin oktavında kalın' },
      octaveOff: { a: 'Oktav farklı', b: 'Yazılı oktavda söyleyin' },
      good:      { a: 'Tam yerinde, tutun', b: 'Çok iyi, böyle kalın' },
      low:       { a: 'Biraz yükseltin ↑', b: 'Hafifçe yukarı ↑' },
      high:      { a: 'Biraz alçaltın ↓', b: 'Hafifçe aşağı ↓' },
      farLow:    { a: 'Daha yukarı ↑↑', b: 'Epey pes, yükseltin ↑↑' },
      farHigh:   { a: 'Daha aşağı ↓↓', b: 'Epey tiz, alçaltın ↓↓' },
      unsteady:  { a: 'Sesi sabit tutun', b: 'Kaydırmadan tutun' },
    },
  },

  // ══ 11. HAZIR STANDARTLAR (Ayarlar panelinden seçilir) ══════════════
  PRESETS: {
    varsayilan: { label: 'Varsayılan · ±20 sent · 0,25 sn', values: {} },
    siki:       { label: 'Sıkı · ±10 sent · 0,5 sn',       values: { TOLERANCE_CENTS: 10, WARNING_CENTS: 25, SUSTAIN_TIME_MS: 500, SUSTAIN_DROPOUT_GRACE_MS: 0 } },
    esnek:      { label: 'Esnek (başlangıç) · ±30 sent · 0,2 sn', values: { TOLERANCE_CENTS: 30, WARNING_CENTS: 50, SUSTAIN_TIME_MS: 200 } },
    prova:      { label: 'Sınav provası · geri bildirim kapalı', values: { EXAM: { LIVE_FEEDBACK: false, REVEAL_NOTE_NAMES: 'end' } } },
  },
};

/** Koddaki varsayılanların dondurulmuş kopyası ("Varsayılana dön" ve özel ayar farkı için) */
export const DEFAULT_CONFIG = deepFreeze(deepClone(CONFIG));
