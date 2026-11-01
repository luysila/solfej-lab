# Solfej Lab — proje notu (Claude Code bu dosyayı her oturumun başında okur)

Konservatuvar adayları ve besteciler için web tabanlı işitme eğitimi (solfej) uygulaması.
Kullanıcı sesleri dinler, en alttaki sesten başlayarak "na" hecesiyle sırayla söyler; uygulama mikrofondan
perdeyi ölçer, sesi tolerans içinde yeterince tutunca bir sonrakinin kilidini açar.

## İletişim
- Tüm yanıtlar, açıklamalar, arayüz metinleri ve kod yorumları **Türkçe** olmalı.
  İngilizce bir terim kullanmak gerekirse yanına kısa Türkçe karşılığını yaz.
- Kullanıcı müzisyen (solfej ve armoni bilgisi güçlü); yazılım kavramlarını sade anlat.
- Geliştirme ortamı: kullanıcı iki bilgisayarda çalışır — Windows 11 ve CachyOS (Arch tabanlı Linux).
  Komutlar ve betikler ikisinde de çalışmalı (yol ayırıcı, kabuk sözdizimi farklarına dikkat; mümkünse Node betiği yaz).
  Stüdyoda düşük gecikmeli bir ses kartı var; gerçek mikrofon testini kullanıcı yapar, sonucu sana anlatır.
- Satır sonları `.gitattributes` ile her yerde LF'ye sabitlendi.

## Çalıştırma
- `npm run serve` → http://localhost:8000 (`scripts/serve.mjs`, yalnızca Node; Python gerekmez; `PORT` ile port değişir)
  (mikrofon için https ya da localhost şart; dosyayı file:// ile açmak çalışmaz)
- Hata ayıklama: `http://localhost:8000/?debug` → `window.__dbg`; aynı soru seti için `?seed=123`
- Konsol API'si: `solfejLab.setConfig({...})`, `solfejLab.resetConfig()`, `solfejLab.generateSession(42)`

## Testler
- `npm test` → birim testleri (Node 18+, ek paket gerekmez). Her değişiklikten sonra çalıştır; hepsi geçmeli.
- `npm run e2e` → gerçek Chromium + "sanal şarkıcı" (hedefi +9 sent tiz söyleyen osilatör) ile uçtan uca test.
  Önce bir kez `npm install` ve `npx playwright install chromium`. Ekran görüntüleri `tests/.screenshots/`.
- Birim testleri `js/pure.js` ve `js/config.js`'i doğrudan içe aktarır (ayrı bir çıkarma adımı yok).
  Ayrıca `index.html`'deki sürüm etiketinin ve import map'in (içe aktarma haritası) tutarlı olduğunu denetler.
- Uçtan uca test `?seed=4242` ile sabit bir soru seti kullanır; soru üreticisini bilerek değiştirirsen
  beklenen değerleri (puan, soru tipleri) de güncelle.

## Yayın ve ortak çalışma
- Site GitHub Pages'te: https://luysila.github.io/solfej-lab/ (depo: https://github.com/luysila/solfej-lab,
  `main` dalının kökünden yayın; `.nojekyll` dosyalar olduğu gibi yayınlansın diye var). `main`'e her gönderim siteyi günceller.
- Her oturumda ilk iş `git pull` ile son hâli al. Kaydedilmemiş değişiklik varsa çekmeden önce kullanıcıya sor.
- Bir iş bitince `npm test` çalıştır; geçerse kaydetmeyi (commit) ve göndermeyi (push) öner.
- Önemli kararları bu dosyaya yaz: konuşma geçmişi başka bilgisayara geçmez, ortak bilgi yalnızca depoda kalır.
- Kayıtlarda kişisel e-posta değil GitHub noreply adresi kullanılır:
  `luysila` · `347091712+luysila@users.noreply.github.com`. Yeni bir bilgisayarda depoyu klonlayınca
  `git config user.name` / `git config user.email` ile bunu ayarla (ya da kullanıcıya hatırlat).

## Mimari (derleme adımı yok, çerçeve yok: tarayıcı ES modüllerini doğrudan yükler)
**Eski istemlerde ve docs/ içindeki belgelerde "tek dosya (index.html)" ya da "PURE bölümü" geçiyorsa bunu bu dosya
düzeni olarak anla (PURE = `js/pure.js`); "Yer:" satırlarındaki fonksiyon ve bölüm adlarını ilgili dosyalarda ara.**

| Dosya | İçerik |
|---|---|
| `index.html` | Yalnızca sayfa iskeleti (HTML, bütün `id`'ler): üst çubuk + menü, bölümler (`main > .section`), çalışma alanı (`#workspace`), lisans satırı; `css/style.css`, import map, `js/app.js`; file:// uyarısı |
| `css/style.css` | Bütün tasarım; renkler en üstte `:root` değişkenlerinde; bölümler `/* ── … ── */` başlıklarıyla |
| `js/config.js` | **0)** `CONFIG` (TOLERANCE_CENTS, SUSTAIN_TIME_MS, QUESTION_COUNTS, REGISTER, CHORD_RULES, EXAM, SCORING, ANALYSIS, PITCH, AUDIO, UI, HISTORY, LIBS, TEXTS, PRESETS) ve dondurulmuş `DEFAULT_CONFIG`. En sık değişecek dosya |
| `js/pure.js` | **1)** Saf mantık (DOM ve Web Audio yok): yardımcılar, nota teorisi (`buildNotes`, çevrim: `invertTones`, `INVERSIONS`), soru üreticisi (`generateSession`, `planTriads`, `planIntervals`, `pickVoicing`, `pickInversion`, `orderForSinging`), çalım planı (`playbackPlan`), porte konumu (`makeStaffMap`, `semitoneNeighbors`), `compareToTarget`, `YinDetector`, `MedianFilter`, `SustainTracker`, yönlendirme (`CoachWindow`, `coachMessage`), durum makinesi (`S`, `ALLOWED`, `createMachine`), `Exercise`, `ExamSession`, `computeDiagnostics` + `buildAdvice`, `makeHistoryEntry`, özel sınav (`defaultCustomExam`, `normalizeCustomExam`, `validateCustomExam`, `customExamToConfig`, `estimateExamMinutes`), `validateConfig`, `sanitizeOverrides`, `textLeaves` |
| `js/audio.js` | **2)** Kütüphane yükleyici (`loadScriptGlobal`, `loadPitchy`) · **3)** ses motoru: tek AudioContext, Tone.js piyano (`preparePiano`), yedek sentez, `playHarmonic`, `playMelodic` |
| `js/mic.js` | **4)** Mikrofon (`startMic`, getUserMedia işlemsiz) ve algılayıcı kurulumu (`setupDetector`: YIN / pitchy-MPM); `settings` (oktav toleransı, gürültü eşiği, giriş) |
| `js/ui.js` | **5)** Arayüz: `ui` (DOM bağlantıları), paylaşılan durum (`mode`, `session`, `exercise`, `fsm`, `tracker`…), nota kutuları (`buildNoteBoxes`, `onNoteBoxPlay`), `renderAll` / `renderStatus`, ilerleme şeridi, çipler, dikey akort aleti, yönlendirme satırı (`setCoach`) |
| `js/staff.js` | Perde grafiği (`setupContour`, `pushContour`, `drawContour`), porte görünümü (`drawStaffContour`, anahtar/nota başı çizimi), VexFlow paneli (`setStaffEnabled`, `drawStaff`) |
| `js/summary.js` | Teşhis ekranı (`renderSummary`) ve "Önceki testlerim" (`renderHistory`, localStorage) |
| `js/settings.js` | Arayüz adları (`T`, `applyTexts`, sayfada düzenleme), ayarlar paneli (`SETTINGS_SCHEMA`, `buildField`), kalıcılık (`savePrefs`, `applyOverrides`, `onConfigChanged`) |
| `js/custom.js` | "Kendi sınavını hazırla" (Sınav bölümünün ikinci alt sekmesi, `#kendi-sinavim`): kompakt pencere (`buildCustomUI`, `renderCustom`), "Sınavlarım" (`solfejlab.exams.v1`, en fazla 30), alt sekme (`setExamTab`, `renderExamPanel`) |
| `js/drill.js` | Serbest çalışma "Alıştırma" alt sekmesi: kurulum çipleri (`buildDrillUI`, `renderDrill`), sekme (`setPracticeTab`, `renderPracticePanel`), sonuç listesi (`showDrillResult`); başlatma `app.js` → `onStartDrill` |
| `js/nav.js` | Bölümler ve menü: `showSection`, `goSection`, adres çubuğu (`SECTIONS`), geri tuşu, son bölüm (`solfejlab.ui.v1`), menü aç/kapa; bölüm değişince `pauseFlow` |
| `js/app.js` | Giriş noktası: **6)** `onStateChange` · **7)** ana döngü `frame` · **8)** `bindEvents`, `init`, `window.solfejLab`, `?debug` → `window.__dbg` |

- Modüller birbirini adla içe aktarır (`import { … } from './ui.js'`); okunan değişken her zaman günceldir.
  Başka modülün `let` değişkenine doğrudan atama yapılamaz: sahibi modül bir atayıcı açar
  (ör. `assignSession(x)`, `assignExercise(x)`; dosyaların sonunda "Başka modüllerin değiştirdiği paylaşılan değişkenler").
- Yükleme sırası: `config.js` ve `pure.js` en önce değerlendirilir; diğer modüllerin üst düzeyinde (fonksiyon dışında)
  yalnızca bu ikisinden gelen değerler kullanılır, başlatma `app.js`'teki `init()` ile yapılır.
- Sürüm etiketi: `index.html`'deki `?v=…` etiketleri ve import map tek yerden `npm run stamp` ile yenilenir
  (`scripts/stamp.mjs`). `css/` ya da `js/` değiştiyse göndermeden önce çalıştır; yeni modül eklersen de çalıştır.

Akış: IDLE → PLAYING → LISTENING → VERIFIED → (LISTENING …) → COMPLETE → sıradaki soru PLAYING … → SUMMARY.
Yalnızca `ALLOWED` tablosundaki geçişler serbesttir.

## Kurallar
- **Dosyayı baştan yazma. Yalnızca gereken yerleri düzenle; iş bitince değiştirdiğin fonksiyonları ve satır aralıklarını listele.**
- Mevcut davranışı bozma; yeni özellikleri var olan yapının üzerine ekle.
  Kod yukarıdaki dosya düzeninde durur: yeni kodu ilgili dosyaya koy, yalnızca o dosyayı oku ve değiştir.
  Kullanıcı istemedikçe dosyaları yeniden düzenleme, derleme adımı ekleme ya da bir çerçeveye (React vb.) taşıma.
- Yeni her ayar: `CONFIG`'e (açıklayıcı yorumla), gerekiyorsa `SETTINGS_SCHEMA`'ya (panel) ve `validateConfig`'e (sınırlar).
- `js/pure.js` (ve `js/config.js`) DOM'a ve Web Audio'ya dokunmaz; Node'da test edilebilir kalır.
- Puanlama ham (yumuşatılmamış) perdeyle yapılır; ibre yumuşatması yalnızca görseldir.
- Dış kütüphaneler sürümü sabitlenmiş CDN adresleriyle ve yedek adresle yüklenir; yüklenemezse uygulama çalışmaya devam etmeli.
- Kullanıcı verisi yalnızca tarayıcıda: `solfejlab.history.v1`, `solfejlab.config.v1`, `solfejlab.prefs.v1`,
  `solfejlab.ui.v1` (arayüz durumu: son bölüm, görünüm seçimleri), `solfejlab.exams.v1` (kayıtlı özel sınavlar).
  Kayıt biçimini değiştirirsen anahtarın sürüm numarasını artır.
- Nota yazımı harf adımı + yarım sesle yapılır (D♭ majör = D♭–F–A♭); çift diyez/bemolden kaçınılır.
- Dışarıdan gelen metinler (içe aktarılan JSON vb.) DOM'a `textContent` ile yazılır, `innerHTML` ile değil.

## Verilmiş kararlar (değiştirmeden önce kullanıcıya sor)
- pitchy kütüphanesinde YIN yok (MPM kullanıyor). YIN dosyaya yazıldı ve varsayılan; uyarlamalı eşik
  (`PITCH.YIN_ADAPTIVE_K = 0.95`) baskın üst harmonikli ünlülerde oktav yukarı hatasını azaltır.
- Oktav toleransı varsayılanı `'free'` (her ses kendi oktavına katlanır). Oktav aralığı sorularında otomatik
  `'anchored'`: ilk sesin oktavı, tutma sırasındaki karelerin çoğunluk oyuyla belirlenir.
- Tutma (sustain) bant dışına çıkınca sıfırlanır; yalnızca algılama kopmalarına 60 ms pay var (`SUSTAIN_DROPOUT_GRACE_MS`).
- Sınavda nota adları ses doğrulanınca açılır (`EXAM.REVEAL_NOTE_NAMES = 'after'`).
- 5'li akor kuralı: her 5 soruluk sette en fazla 1 artmış/eksilmiş, en az 1 majör + 1 minör.
- **Çevrim akorları** (Aşama 3): üç ses soruları temel durum, 1. çevrim (6; basta 3'lü), 2. çevrim (6/4; basta 5'li).
  Çevrim, alttaki sesler bir oktav yukarı taşınarak üretilir (`invertTones`); yazım harf adımı + yarım sesle (Do majör 1. çevrim = Mi–Sol–Do).
  Ağırlık `CHORD_RULES.INVERSIONS` (varsayılan temel 2 · 1. çevrim 1 · 2. çevrim 1). Artmış akor simetrik olduğu için varsayılan
  olarak yalnız temel durumda (`AUGMENTED_INVERSIONS`). Akor çevrilmiş hâliyle register'a sığar; tekrar etmeme anahtarı çevrimi içerir.
  Başlık: "C Majör · 1. çevrim (6) · E4–G4–C5". Teşhiste üç ses duruma göre de ayrılır (`byInversion`).
- **Söyleme sırası en alttaki (bas) sesten yukarı** (eski "kökten başlayarak" kararının yerine; temel durumda yine kök).
  `SING_ORDER: 'root'` ile kökten başlanır. Nota kutularında roller (Kök, 3'lü, 5'li) görünmeye devam eder.
- **Porte + perde grafiği tek görünüm** (canvas, VexFlow'a bağlı değil): sol ve fa anahtarlı çift porte, ortada Do4.
  Perde konumu nota yazımına göre: hedef sesin tam perdesi o notanın nota başının ortasından geçer
  (Re majörde Fa♯ → Fa'nın yeri, ♯ ile); ara perdeler komşu nota konumları arasında orantılı. Dönüşüm `js/pure.js`'te (`makeStaffMap`).
  Oktav toleransı açıkken çizgi, puanlamadaki gibi hedefin oktavına katlanmış perdeyle çizilir.
  Görünüm seçici (Aşama 2; eski "Portede göster" anahtarının yerine): "Porte" (yalnız porte: hedef ve canlı nota başı,
  akan çizgi yok) · "Porte + grafik" (varsayılan, `UI.VIEW_MODE`) · "Grafik" (sent grafiği). Sınav ve Serbest çalışma için
  ayrı hatırlanır (`solfejlab.ui.v1` → `viewMode`); eski `prefs.staffView` bir kez çevrilir. Sınavda ayrıca "Porte" anahtarı:
  kapalıyken porte/grafik gizli, dikey gösterge ve yönlendirme kalır. Ayrı VexFlow paneli varsayılan gizli (`CONFIG.UI`).
  Sınavda nota başları ve hedef kılavuz çizgisi `EXAM.REVEAL_NOTE_NAMES`'e uyar; `EXAM.LIVE_FEEDBACK` kapalıysa canlı çizgi yok.
- **Dikey akort aleti**: aşağı pes, yukarı tiz; ölçek ±100 sent (uçlar tam komşu yarım seslere denk gelir).
  Ortada hedefin adı, uçlarda bir yarım ses aşağı/yukarı notanın adı; sınavda hedef açılmadıysa yalnızca "pes"/"tiz".
  Yerleşim: porte solda ve geniş, gösterge sağda, aynı yükseklikte (telefonda da yan yana).
- **Canlı nota başı**: okunan ses portede dolu nota başı; tolerans içinde yeşil, dışında kırmızı (çizgi de aynı renk).
  "Sınırdayken sarı" seçeneği var, varsayılan kapalı.
- **Yönlendirme panik yaratmaz**: anlık değişen uyarı yazısı yok (renk ve gösterge anlık kalır). Sözlü yönlendirme
  `UI.COACH_INTERVAL_MS` (5000) aralıkla, son aralığın özetinden tek sakin cümle; aynı cümle üst üste gelmez;
  yeni seste özet sıfırlanır. `LIVE_FEEDBACK` kapalıysa pes/tiz yönü söylenmez, yalnızca teknik uyarılar.
  Aşama 2: cümleler çok kısa (2–4 kelime, her durumda 2 söyleyiş; yön için ↑ / ↓, uzaksa ↑↑ / ↓↓); yazı büyük ve kalın
  (`UI.COACH_FONT_PX`, varsayılan 20 px, telefonda 2 px küçük; Ayarlar → Görünüm).
- **Arayüz adları `CONFIG.TEXTS`'te**: panel başlıkları, sekmeler, düğmeler, gösterge etiketleri, yönlendirme cümleleri.
  Ayarlarda "Arayüz adları" grubu kendiliğinden üretilir; "Adları sayfada düzenle" ile yerinde düzenlenir;
  "Adları kopyala" değişenleri JSON olarak verir. Ad boş olamaz, en fazla 80 karakter.
- **Bölüm bölüm sayfa** (docs/istek-2.md, Aşama 1): üst çubukta uygulama adı + "Menü" (yukarıdan açılan dikey liste;
  seçince / dışarı tıklayınca / Esc ile kapanır), sağda mikrofon ve ses simgeleri. Aynı anda tek bölüm: Ana sayfa · Sınav ·
  Serbest çalışma · Önceki testlerim · Ayarlar · Yardım. Adres: #ana-sayfa, #sinav, #kendi-sinavim, #serbest, #gecmis, #ayarlar,
  #yardim (geri tuşu çalışır); ilk açılışta Ana sayfa, sonra son kullanılan bölüm. Sınav ve Serbest çalışma tek çalışma alanını
  (`#workspace`) paylaşır, alan `setMode` ile bölüme taşınır. Sınav sürerken Serbest çalışma bölümü yalnızca uyarı gösterir.
  Ayarlar sekmeli (Standart sınav · Ses ve algılama · Görünüm · Arayüz adları · Gelişmiş); form tek parça kalır.
  Salamander atfı her bölümün altındaki `.attrib` satırında. Bütün renkler `css/style.css` `:root`'ta (canvas renkleri de oradan okunur).
- **Duraklat / Devam**: bekleyen zamanlayıcılar iptal, ses susar, ölçüm ve soru süresi durur; durum makinesi yerinde bekler.
  Devam: çalım yarıda kaldıysa yeniden çalınır (tekrar sayılmaz), doğrulama / soru sonu bekliyorsa sürer.
  Çalışma alanından başka bölüme geçince kendiliğinden duraklar; geri dönünce kendiliğinden sürmez ("Devam" gerekir).
- **Kendi sınavını hazırla** (Aşama 4): Sınav bölümünde "Standart sınav" · "Kendi sınavını hazırla" alt sekmeleri; menü ve
  ana sayfadaki kutucuk doğrudan #kendi-sinavim'i açar. Kompakt pencere: artı/eksi sayılar, seçim çipleri, canlı özet
  ("15 soru · yaklaşık 8 dk"), hatalıysa başlat kapalı ve neden yazılı. Özel sınav ayarı **yalnız o oturuma** uygulanır:
  `ExamSession.cfg` (`customExamToConfig`), sınav akışı `activeCfg()` ile okur; genel CONFIG değişmez. "5 soruda en fazla 1
  artmış/eksilmiş" kuralı açılıp kapanır; yalnız artmış/eksilmiş seçilince hepsi bu tiplerden gelir. Nota adları için yeni seçenek
  `REVEAL_NOTE_NAMES: 'session'` (sınav sonunda): soru sırasında gizli, teşhis ekranındaki "Sorular ve cevaplar" listesinde açık.
  Teşhis ekranındaki "Yeni Test" biten sınavın aynısını başlatır; standart sekmedeki başlat düğmesi hep standart sınavı.
  Geçmiş kaydına sınavın adı (`name`) eklenir; eski kayıtlar olduğu gibi okunur.
- **Alıştırma dizileri** (Aşama 5): Serbest çalışmada "Tek soru" (kök, oktav, tip, durum) · "Alıştırma" (rastgele dizi).
  Alıştırma sınav altyapısını kullanır: `ExamSession` + `session.drill` (tanım); `isExam()` / `isDrill()` / `drillActive()`
  sınavla alıştırmayı ayırır (`examActive()` artık yalnız sınav). Soru sayısı ya da "Ben durdurana kadar" (sorular
  `PRACTICE.DRILL_CHUNK` kadarlık parçalarla üretilir, `appendQuestions`). Cevap: her sorudan sonra (`REVEAL 'end'`) ·
  hepsi bitince (`'session'`) · gösterme (`'never'`); soru sonunda "Bu soru: C Majör · 1. çevrim (6) ✓". Tolerans, tutma
  süresi, register genel ayardan; canlı geri bildirim açık, tekrar/geçme serbest. Nota kutusuna tıklamak alıştırmada ipucu.
  Bitince ya da "Durdur"da sonuç listesi (`PRACTICE.SHOW_RESULTS`); geçmişe `mode: 'drill'` ve "Alıştırma" etiketiyle kayıt
  (`PRACTICE.SAVE_HISTORY`); "Önceki testlerim"de Hepsi · Sınav · Alıştırma süzgeci. Son kurulum `solfejlab.ui.v1` → `drill`.

- **Klavye kısayolları** (Aşama 6, `js/keys.js`; eşleme `matchShortcut` `js/pure.js`'te): tuş, ürettiği karakterle eşlenir
  (`e.key`; Türkçe Q/F klavyede etiket). `CONFIG.SHORTCUTS` geçici varsayılanlar: Enter başlat · Boşluk duraklat/devam · R tekrar ·
  N geç · B bitir (`SHORTCUT_END_CONFIRM_MS` içinde iki kez) · S sıradaki ses · V görünüm · P porte · O oktav · M menü · 1–6 bölümler · ? liste.
  Yazı kutularında, ad düzenlerken ve tuş atarken çalışmaz; odak düğmedeyken Enter/Boşluk düğmenin kendisi. Kısayol işlevi
  ilgili düğmeye tıklar (aynı kurallar). Ayarlar → Kısayollar: Değiştir / Kaldır / Varsayılana dön, çakışma uyarısı, kopyala
  (özel ayar olarak `solfejlab.config.v1`).
- **Aşama 7 (telefon/tablet) henüz yapılmadı** — `docs/istek-2.md`'deki AŞAMA 7 bölümüne bakın.

## Doğrulanmamış / bilinen sınırlar
- Tone.js (14.8.49) ve VexFlow (4.2.5) gerçek kütüphaneleriyle henüz denenmedi (önceki geliştirme ortamında CDN'ler
  kapalıydı; aynı arayüzü taklit eden sürümlerle test edildi). İlk iş: gerçek tarayıcıda piyano sesini ve porteyi kontrol et.
- Salamander piyano örnekleri CC BY 3.0 lisanslı: yayında atıf gerekli (sayfanın altında yazılı).
- iPhone/Safari ve gerçek ses kartıyla gecikme ölçümü henüz yapılmadı.

## İlgili belgeler
- `docs/ilk-istek.md`: kullanıcının özellik isteğinin tam metni (gereksinimler).
- 10 haftalık yol haritası, kullanıcının Claude hesabındaki "İşitme Eğitimi Platformu Yol Haritası" belgesinde
  (Claude Code oradan okuyamaz; gerekirse kullanıcıdan ilgili bölümü iste).
