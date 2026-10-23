# Solfej Lab — proje notu (Claude Code bu dosyayı her oturumun başında okur)

Konservatuvar adayları ve besteciler için web tabanlı işitme eğitimi (solfej) uygulaması.
Kullanıcı sesleri dinler, kökten başlayarak "na" hecesiyle sırayla söyler; uygulama mikrofondan
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
- `tests/extract-pure.mjs`, index.html'deki `PURE:BEGIN … PURE:END` bölümünü çıkarıp Node'da test edilebilir yapar.
  PURE bölümüne yeni bir fonksiyon eklersen ve testte kullanacaksan `EXPORTS` listesine ekle.
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

## Mimari (tek dosya: index.html — derleme adımı yok, vanilla JS / ES modülleri, çerçeve yok)
0. `CONFIG`: tüm ayarlar betiğin en üstünde (TOLERANCE_CENTS, SUSTAIN_TIME_MS, QUESTION_COUNTS, REGISTER,
   CHORD_RULES, EXAM, SCORING, ANALYSIS, PITCH, AUDIO, UI, HISTORY, LIBS, PRESETS). `DEFAULT_CONFIG` dondurulmuş kopyası.
1. PURE bölümü (DOM ve Web Audio yok): yardımcılar, nota teorisi (`buildNotes`, doğru enharmonik yazım),
   soru üreticisi (`generateSession`, `planTriads`, `planIntervals`, `pickVoicing`), `compareToTarget` (oktav modları),
   `YinDetector`, `MedianFilter`, `SustainTracker`, durum makinesi (`S`, `ALLOWED`, `createMachine`),
   `Exercise` (kilitli ilerleme), `ExamSession`, `computeDiagnostics` + `buildAdvice` (teşhis ekranı),
   `makeHistoryEntry`, `validateConfig`, `sanitizeOverrides`.
2. Kütüphane yükleyici: CDN adreslerini sırayla dener (`CONFIG.LIBS`), zaman aşımı uygular.
3. Ses motoru: tek AudioContext; Tone.js + Salamander piyano örnekleri, yüklenemezse dahili sentez.
4. Mikrofon ve algılama: getUserMedia (yankı / gürültü / kazanç işlemleri kapalı) → AnalyserNode →
   YIN (varsayılan) ya da pitchy (MPM).
5. Arayüz: nota kutuları, sınav ilerleme şeridi, yatay ibre, perde grafiği (canvas), porte (VexFlow, isteğe bağlı),
   teşhis ekranı, "Önceki testlerim" (localStorage), ayarlar paneli (`SETTINGS_SCHEMA` ile üretilir).
6. Durum makinesi eylemleri (`onStateChange`) · 7. ana döngü (`frame`, requestAnimationFrame) · 8. kalıcılık ve `init`.

Akış: IDLE → PLAYING → LISTENING → VERIFIED → (LISTENING …) → COMPLETE → sıradaki soru PLAYING … → SUMMARY.
Yalnızca `ALLOWED` tablosundaki geçişler serbesttir.

## Kurallar
- **Dosyayı baştan yazma. Yalnızca gereken yerleri düzenle; iş bitince değiştirdiğin fonksiyonları ve satır aralıklarını listele.**
- Mevcut davranışı bozma; yeni özellikleri var olan yapının üzerine ekle.
  Kullanıcı istemedikçe dosyayı bölme ya da bir çerçeveye (React vb.) taşıma.
- Yeni her ayar: `CONFIG`'e (açıklayıcı yorumla), gerekiyorsa `SETTINGS_SCHEMA`'ya (panel) ve `validateConfig`'e (sınırlar).
- PURE bölümü DOM'a ve Web Audio'ya dokunmaz.
- Puanlama ham (yumuşatılmamış) perdeyle yapılır; ibre yumuşatması yalnızca görseldir.
- Dış kütüphaneler sürümü sabitlenmiş CDN adresleriyle ve yedek adresle yüklenir; yüklenemezse uygulama çalışmaya devam etmeli.
- Kullanıcı verisi yalnızca tarayıcıda: `solfejlab.history.v1`, `solfejlab.config.v1`, `solfejlab.prefs.v1`.
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
- **Porte + perde grafiği tek görünüm** (canvas, VexFlow'a bağlı değil): sol ve fa anahtarlı çift porte, ortada Do4.
  Perde konumu nota yazımına göre: hedef sesin tam perdesi o notanın nota başının ortasından geçer
  (Re majörde Fa♯ → Fa'nın yeri, ♯ ile); ara perdeler komşu nota konumları arasında orantılı. Dönüşüm PURE bölümünde.
  Oktav toleransı açıkken çizgi, puanlamadaki gibi hedefin oktavına katlanmış perdeyle çizilir.
  "Portede göster" açık → porte görünümü (varsayılan), kapalı → eski sent grafiği. Ayrı VexFlow paneli varsayılan gizli (`CONFIG.UI`).
  Sınavda nota başları ve hedef kılavuz çizgisi `EXAM.REVEAL_NOTE_NAMES`'e uyar; `EXAM.LIVE_FEEDBACK` kapalıysa canlı çizgi yok.
- **Dikey akort aleti**: aşağı pes, yukarı tiz; ölçek ±100 sent (uçlar tam komşu yarım seslere denk gelir).
  Ortada hedefin adı, uçlarda bir yarım ses aşağı/yukarı notanın adı; sınavda hedef açılmadıysa yalnızca "pes"/"tiz".
  Yerleşim: porte solda ve geniş, gösterge sağda, aynı yükseklikte (telefonda da yan yana).
- **Canlı nota başı**: okunan ses portede dolu nota başı; tolerans içinde yeşil, dışında kırmızı (çizgi de aynı renk).
  "Sınırdayken sarı" seçeneği var, varsayılan kapalı. Serbest çalışmada porte görünümü her zaman açık başlar.
- **Yönlendirme panik yaratmaz**: anlık değişen uyarı yazısı yok (renk ve gösterge anlık kalır). Sözlü yönlendirme
  `UI.COACH_INTERVAL_MS` (5000) aralıkla, son aralığın özetinden tek sakin cümle; aynı cümle üst üste gelmez;
  yeni seste özet sıfırlanır. `LIVE_FEEDBACK` kapalıysa pes/tiz yönü söylenmez, yalnızca teknik uyarılar.
- **Arayüz adları `CONFIG.TEXTS`'te**: panel başlıkları, sekmeler, düğmeler, gösterge etiketleri, yönlendirme cümleleri.
  Ayarlarda "Arayüz adları" grubu kendiliğinden üretilir; "Adları sayfada düzenle" ile yerinde düzenlenir;
  "Adları kopyala" değişenleri JSON olarak verir. Ad boş olamaz, en fazla 80 karakter.

## Doğrulanmamış / bilinen sınırlar
- Tone.js (14.8.49) ve VexFlow (4.2.5) gerçek kütüphaneleriyle henüz denenmedi (önceki geliştirme ortamında CDN'ler
  kapalıydı; aynı arayüzü taklit eden sürümlerle test edildi). İlk iş: gerçek tarayıcıda piyano sesini ve porteyi kontrol et.
- Salamander piyano örnekleri CC BY 3.0 lisanslı: yayında atıf gerekli (sayfanın altında yazılı).
- iPhone/Safari ve gerçek ses kartıyla gecikme ölçümü henüz yapılmadı.

## İlgili belgeler
- `docs/ilk-istek.md`: kullanıcının özellik isteğinin tam metni (gereksinimler).
- 10 haftalık yol haritası, kullanıcının Claude hesabındaki "İşitme Eğitimi Platformu Yol Haritası" belgesinde
  (Claude Code oradan okuyamaz; gerekirse kullanıcıdan ilgili bölümü iste).
