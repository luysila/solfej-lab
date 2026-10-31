# İkinci büyük istek: bölüm bölüm sayfa yapısı ve yeni özellikler (1 Kasım 2026)

Aşağıdaki metin kullanıcının isteğidir (olduğu gibi). Uygulama sırasında bağlam dolarsa buradan yeniden okunur.

Not: İstek, kod `css/` ve `js/` dosyalarına bölünmeden önce yazılmıştır. "Tek dosya (index.html)" ve "PURE bölümü"
ifadeleri `CLAUDE.md`'deki kurala göre bugünkü dosya düzeni olarak anlaşılır (PURE = `js/pure.js`);
"Yer:" satırlarındaki adlar ilgili dosyalarda aranır. İstekten farklı yapılanlar ve gerekçeleri `CLAUDE.md`'de.

---

Önce GitHub'dan son hâli al. Bu büyük bir yeniden düzenleme; şu kurallarla çalış:
- Önce bu istemin tamamını docs/istek-2.md olarak kaydet (docs/ilk-istek.md gibi). İş uzar da bağlam dolarsa oradan yeniden oku.
- Dosyayı baştan yazma. Tek dosya (index.html), çerçevesiz yapı ve PURE bölümü korunsun; mevcut özellikler bozulmasın. Bu istem CLAUDE.md'deki bazı kararları (ör. "Portede göster" anahtarı, "kökten başlayarak söyleme") bilerek değiştiriyor.
- Aşamaları sırayla yap. Her aşamadan sonra npm test ve npm run e2e çalıştır (e2e'yi yeni sayfa yapısına göre güncelle; A–G senaryolarının amacı korunsun). Geçerse o aşamayı ayrı kaydet (commit). Çözemediğin bir sorun çıkarsa dur ve bana sor. GitHub'a gönderme.
- Yeni her ayar CONFIG'e (açıklamalı), ayarlar paneline ve validateConfig'e; yeni her yazı CONFIG.TEXTS'e eklensin (adları değiştirilebilir kalsın). Kaydedilen yeni veriler için sürüm numaralı yeni anahtar kullan.
- Kararları CLAUDE.md'deki "Mimari" ve "Verilmiş kararlar" bölümlerine işle.

Tasarım ölçüsü: https://www.konservatuvarahazirlik.net/ sitesindeki sadelik ve kompaktlık. Orada üstte bir "Menü" düğmesi var; tıklanınca bölümler yukarıdan açılan dikey bir liste olarak çıkıyor. Ana sayfada kısa bir giriş ve kısa açıklamalı, büyük hızlı erişim kutucukları var. Paneller daha sıkı olsun: daha az boşluk, küçük başlıklar, kart düzeni. Renk paletini sonra değiştireceğiz; şimdilik mevcut renkler kalsın ama bütün renkleri :root'taki CSS değişkenlerinde topla, palet tek yerden değişsin.

AŞAMA 1 — Bölüm bölüm sayfa yapısı ve duraklatma
Yer: <header class="top">, "Çalışma modu" paneli (#examControls, #practiceControls, .common), #summaryPanel, "Okunacak sesler" paneli, #tuner, #historyPanel, #settingsPanel, .tips; CSS'teki "Üst başlık", "Paneller", "Mod sekmeleri"; setMode, savePrefs, init, bindEvents, frame.
- Üst çubuk: solda uygulama adı ve "Menü" düğmesi; sağda mikrofon ve ses durumu için küçük simgeler (şimdiki çipler sadeleşsin).
- "Menü"ye basınca bölümler dikey bir liste olarak yukarıdan açılsın; seçince, dışarı tıklayınca ya da Esc ile kapansın. Bölümler: Ana sayfa · Sınav · Serbest çalışma · Önceki testlerim · Ayarlar · Yardım. Aynı anda tek bölüm görünsün.
- Bölüm adres çubuğunda görünsün (#ana-sayfa, #sinav, #kendi-sinavim, #serbest, #gecmis, #ayarlar, #yardim); tarayıcının geri tuşu çalışsın. İlk açılışta Ana sayfa, sonraki açılışlarda son kullanılan bölüm açılsın.
- Ana sayfa: kısa bir karşılama ve büyük kutucuklar (Sınav, Kendi sınavını hazırla, Serbest çalışma, Önceki testlerim).
- Sınav ve Serbest çalışma aynı çalışma alanını kullansın: okunacak sesler, porte/grafik ve dikey gösterge, yönlendirme, süreklilik çubuğu, mikrofon seviyesi ve gürültü eşiği. Bu alan iki bölüm arasında taşınsın, kopyalanmasın. Mikrofon girişi ve oktav toleransı bu alanda küçük bir "ses ayarları" satırında dursun.
- Teşhis ekranı sınav bitince Sınav bölümünde açılsın.
- Ayarlar: sayfanın altındaki gelişmiş panel kaldırılmasın, "Ayarlar" bölümüne taşınsın ve kendi içinde sekmelere ayrılsın: Standart sınav · Ses ve algılama · Görünüm · Arayüz adları · Kısayollar (Aşama 6) · Gelişmiş (JSON). "Özel ayarlar etkin" çipi bu bölümü açsın.
- Yardım: sayfa sonundaki ipuçları buraya taşınsın ve kısa bir "nasıl kullanılır" eklensin. Salamander piyano atfı (CC BY 3.0) lisans gereği her bölümün altında küçük bir satırda görünür kalsın.
- Yeni işlev "Duraklat / Devam": dinlemeyi ve soru süresini durdurur, durum satırında "Duraklatıldı" yazar. Düğmesi sınav ve alıştırma kontrollerinde olsun. Sınav sürerken menüden başka bölüme geçilirse sınav kendiliğinden duraklasın, geri dönünce "Devam" ile sürsün.

AŞAMA 2 — Porte görünümü ve yönlendirme
Yer: .contour ve .view-row, #staffToggle, setStaffEnabled, drawContour, drawStaffContour, CONFIG.UI, CONFIG.TEXTS.COACH, setCoach, CSS'teki .coach.
- "Portede göster" anahtarının yerine üç seçenekli, kompakt bir seçici: "Porte" (yalnızca porte: hedef nota başları ve hareket eden canlı nota başı, akan çizgi yok) · "Porte + grafik" (şimdiki görünüm) · "Grafik" (sent grafiği). Sınav ve serbest çalışma için ayrı ayrı hatırlansın. Yeni ayar CONFIG.UI.VIEW_MODE, varsayılan 'staff+graph'; eski "staffView" tercihi yeni seçime çevrilsin.
- Sınav bölümünde ayrıca bir "Porte" aç/kapa anahtarı olsun: kapalıyken porte/grafik alanı gizlenir, dikey gösterge ve yönlendirme kalır.
- Yönlendirme yazısını büyüt: şu an 14 px; masaüstünde yaklaşık 20 px, telefonda 18 px, kalın; yön için ↑/↓ işareti. Yazı boyutu Ayarlar → Görünüm'den değiştirilebilsin.
- Yönlendirme cümlelerini çok kısa ve net yap (2–4 kelime, her durum için 2 söyleyiş). Örnekler: "Biraz yükseltin ↑" · "Biraz alçaltın ↓" · "Daha yukarı ↑↑" · "Daha aşağı ↓↓" · "Sesi sabit tutun" · "Tam yerinde, tutun" · "Mikrofona yaklaşın" · "Düz ve net bir “na”" · "Oktav farklı". 5 saniyelik aralık ve aynı cümlenin üst üste gelmemesi kuralı kalsın.

AŞAMA 3 — Çevrim akorları (sınavda ve serbest çalışmanın her yerinde)
Yer: CHORD_TYPES ve third/fifth yardımcıları, buildNotes, pickVoicing, planTriads, questionTitle, generateSession, CONFIG.CHORD_RULES, SETTINGS_SCHEMA, validateConfig; fillSelects ve selectionChanged (serbest çalışma); renderStatus ve CONFIG.TEXTS'teki söyleme talimatları; computeDiagnostics.
- Üç ses (5'li akor) sorularına çevrimler eklensin: temel durum, 1. çevrim (6; basta 3'lü) ve 2. çevrim (6/4; basta 5'li). Çevrimi, akor seslerini döndürüp alttaki sesleri bir oktav yukarı taşıyarak üret; yazım mevcut kuralla (harf adımı + yarım ses) doğru kalsın: Do majör 1. çevrim = Mi–Sol–Do, 2. çevrim = Sol–Do–Mi.
- Söyleme sırası en alttaki (bas) sesten yukarı doğru olsun; temel durumda bu zaten kök. Talimat yazıları buna göre güncellensin ("kökten başlayarak" yerine "en alttaki sesten başlayarak"). CONFIG'te "kökten başla" seçeneği de olsun. Nota kutularında ses rolleri (Kök, 3'lü, 5'li) görünmeye devam etsin.
- Soru başlığı çevrimi göstersin, ör. "C majör · 1. çevrim (6) · E4–G4–C5".
- Standart sınav: yeni ayar CONFIG.CHORD_RULES.INVERSIONS, hangi durumların hangi ağırlıkla çıkacağını belirlesin (varsayılan: temel durum 2, 1. çevrim 1, 2. çevrim 1). "5 soruda en fazla 1 artmış/eksilmiş" kuralı aynen kalsın. Ayar, Ayarlar'daki Standart sınav sekmesinde dursun.
- Artmış akor simetrik olduğu için çevrimleri kulakta temel durumdan ayırt edilemez; artmış akor varsayılan olarak yalnızca temel durumda gelsin, ayarla açılabilsin.
- Akor, çevrilmiş hâliyle register sınırlarına sığsın (çevrimde akorun genişliği 6'lıya çıkar). "Aynı soru tekrar etmesin" kuralı çevrimi de hesaba katsın.
- Serbest çalışma "Tek soru": akor seçilince yanında "Durum" seçimi çıksın (Temel durum / 1. çevrim / 2. çevrim).
- Teşhis ekranında üç ses soruları duruma göre de (temel / 1. çevrim / 2. çevrim) ayrılsın; hangisinde zorlanıldığı görünsün.
- Çevrim üreten ve ağırlıklı seçen fonksiyonlar PURE bölümünde olsun; birim testi yaz (yazım, ses sırası, register). Varsayılan sınav değiştiği için e2e'deki ?seed=4242 beklenen değerlerini güncelle.

AŞAMA 4 — Kendi sınavını hazırla
Yer: Sınav bölümü; generateSession, planIntervals, planTriads, ExamSession, onStartExam, makeHistoryEntry, validateConfig; yeni PURE fonksiyonları.
- Sınav bölümünde iki alt sekme: "Standart sınav" ve "Kendi sınavını hazırla". İkincisi, Ayarlar'daki uzun formun yerine kompakt ve hızlı bir pencere olsun: artı/eksi düğmeli sayılar, dokunulabilir seçim çipleri, tek ekranda biten bir düzen. Menüdeki ve ana sayfadaki "Kendi sınavını hazırla" doğrudan buraya açılsın.
- Seçenekler:
  • Sınavın adı
  • Soru sayıları: tek ses, iki ses, üç ses (her biri 0–50)
  • Aralıklar: çipler (k2 B2 k3 B3 T4 A4 E5 T5 k6 B6 k7 B7 T8; üzerine gelince tam adı) ve hızlı seçimler: Hepsi · Hiçbiri · Tam aralıklar · 3'lü ve 6'lılar · 2'li ve 7'liler · Triton
  • Akorlar: Majör · Minör · Artmış · Eksilmiş. Standart sınavdaki "5 soruda en fazla 1 artmış/eksilmiş" kuralı açılıp kapatılabilsin (yalnızca artmış seçilince de çalışmalı)
  • Akor durumu: Temel · 1. çevrim · 2. çevrim (çipler)
  • Sıra: gruplu / karışık
  • Ses aralığı (register): alt ve üst sınır
  • Çalım biçimi: birlikte / ayrı ayrı / önce ayrı, sonra birlikte
  • Soru süresi: yok / 15 / 30 / 60 sn
  • Tekrar çalma ve soru geçme: izin var / yok
  • Nota adlarının açılması: ses doğrulanınca / soru bitince / sınav sonunda / hiç
  • Canlı geri bildirim: açık / kapalı (sınav provası)
  • Tolerans: esnek ±30 / varsayılan ±20 / sıkı ±10, bir de tutma süresi
- Üstte canlı bir özet satırı: "15 soru · yaklaşık 8 dk". Seçim hatalıysa (ör. iki ses sorusu var ama aralık seçilmemiş, register çok dar) başlat düğmesi kapansın ve nedeni yanında yazsın.
- Düğmeler: "▶ Bu sınavı başlat", "Kaydet", "Sıfırla". Kaydedilenler "Sınavlarım" listesinde dursun (başlat, düzenle, kopyala, sil). Yeni anahtar: solfejlab.exams.v1, en fazla 30 sınav.
- Özel sınav ayarı yalnızca o oturuma uygulansın; genel CONFIG ve standart sınav değişmesin. Oturum kendi etkin ayarını taşısın; sınav akışında CONFIG.EXAM'ın ve soru yapısının okunduğu yerler oturumun ayarını kullansın.
- Teşhis ekranı ve "Önceki testlerim" aynen çalışsın; geçmiş kaydına sınavın adı eklensin, eski kayıtlar bozulmasın.
- Özel sınav ayarını doğrulayan ve CONFIG'e çeviren fonksiyonlar PURE bölümünde olsun; birim testi yaz.

AŞAMA 5 — Serbest çalışma: alıştırma dizileri
Yer: #practiceControls, selectionChanged, onPlayClick, onReplayClick, practicePlayback, onNoteBoxPlay, isNoteRevealed, answerVisible, renderStatus, frame; generateSession ve ExamSession.
- Serbest çalışmada iki seçenek: "Tek soru" (kök, oktav, tip ve akor durumunu kendin seçersin) ve "Alıştırma" (rastgele soru dizisi).
- Alıştırma kurulumu Aşama 4'teki kompakt çiplerle yapılsın: soru tipleri, hangi aralık/akorlar ve akor durumları (temel / 1. çevrim / 2. çevrim); soru sayısı (ör. 7) ya da "Ben durdurana kadar"; çalım biçimi; cevabın gösterilmesi: her sorudan sonra / hepsi bitince / gösterme.
- Şu örnekler çalışmalı: "rastgele 7 tane iki ses (aralık)", "ben durdurana kadar yalnızca şu aralık ve akorlardan sor" ve "yalnızca çevrim akorlarından sor".
- Soru sırasında nota adları ve portedeki hedefler sınavdaki gibi gizli olsun; cevap seçilen zamanda açılsın: "Bu soru: C majör · 1. çevrim (6) ✓". Nota kutusuna tıklayınca tek sesin çalınması alıştırmada ipucu olarak çalışsın, sınavda çalışmasın.
- Dizi bitince ya da "Durdur"a basınca bir liste çıksın: sorulan aralık/akorlar (durumlarıyla), sonuç (tam / kısmi / geçildi) ve süre. Bu liste ayarla kapatılabilsin. Alıştırmalar "Önceki testlerim"e "Alıştırma" etiketiyle kaydedilsin (ayarla kapatılabilsin); orada Sınav/Alıştırma süzgeci olsun.
- Alıştırma sınav altyapısını yeniden kullansın; "durdurana kadar" için soruları parça parça üret. session'ın varlığına bakarak sınavı anlayan yerleri (isNoteRevealed, answerVisible, renderStatus, onReplayClick, onNoteBoxPlay, frame) sınavla alıştırmayı ayırt edecek şekilde güncelle.

AŞAMA 6 — Klavye kısayolları
Yer: bindEvents; yeni CONFIG.SHORTCUTS; Ayarlar'da "Kısayollar" sekmesi; onStartExam, onEndExam, onSkip, onExamReplay, onPlayClick, onReplayClick.
- Kısayol atanabilen işlevler: Başlat (Teste Başla / Çal & Başla) · Duraklat/Devam · Tekrar çal · Soruyu geç · Testi bitir · Sıradaki sesi çal · Görünüm değiştir · Porte aç/kapa · Oktav toleransı · Menü · Bölümlere git · Kısayol listesi.
- "Kısayollar" sekmesi: her işlevin yanında atanmış tuş, "Değiştir" (tıkla, sonra tuşa bas), "Kaldır" ve "Varsayılana dön". Aynı tuş iki işleve atanırsa uyarsın. Değişiklikler bu tarayıcıda saklansın; "Kısayolları kopyala" ile sana verip varsayılan yaptırabileyim.
- Geçici varsayılanlar (sonra değiştireceğiz): Enter başlat · Boşluk duraklat/devam · R tekrar çal · N soruyu geç · B testi bitir (yanlışlıkla bitmesin diye 2 saniye içinde iki kez basılınca) · S sıradaki sesi çal · V görünüm · P porte · O oktav toleransı · M menü · 1–6 bölümler · ? kısayol listesi.
- Yazı yazılan kutularda, ad düzenleme modunda ve tuş atarken kısayollar çalışmasın. Odak bir düğmedeyken Enter/Boşluk iki kez işlem yapmasın, sayfa kaymasın. Türkçe Q ve F klavyede doğru çalışsın. Düğmelerin üzerine gelince kısayol küçük bir ipucu olarak görünsün.
- Tuş olayını işleve çeviren fonksiyon PURE bölümünde olsun; birim testi yaz.

AŞAMA 7 — Telefon ve tablette kararlı çalışma
Yer: <meta name="viewport">, tüm @media kuralları, .view-row ve .vgauge, setupContour, ensureAudio, startMic, bindEvents (visibilitychange), frame.
- Yerleşim: telefonda tek sütun; ana düğmeler (Başlat, Tekrar, Geç, Duraklat, Bitir) ekranın altında, başparmakla erişilen sabit ve kompakt bir çubukta. Tablette iki sütun (solda kontroller, sağda porte ve gösterge). Ekran yatay/dikey döndüğünde bozulmasın; çentikli ekranlarda güvenli alan payları olsun.
- Dokunma: en az 44 px dokunma alanı; çift dokunuşta yakınlaşma olmasın; üzerine gelme (hover) gerektiren bir şey kalmasın; iPhone'da kutuya odaklanınca sayfa büyümesin (giriş kutularında en az 16 px yazı).
- Ses: iPhone/iPad'de ses ancak dokunuşla başlar; AudioContext ve Tone.js ilk dokunuşta güvenle açılsın. Mikrofon açıkken sesin ahizeye düşmesi ve sessiz modda sesin kesilmesi bilinen iOS sorunları: telefonda kulaklık uyarısı göster, tarayıcı destekliyorsa navigator.audioSession ile uygun ses oturumunu seç.
- Sınav ve alıştırma sırasında ekran kararmasın (Screen Wake Lock; destek yoksa sessizce geç). Uygulama arka plana geçince (arama, başka uygulama) kendiliğinden duraklasın, dönünce "Devam" ile sürsün.
- Performans: telefonda canvas çizimini hafiflet (piksel oranı en fazla 2, görünmeyen bölüm çizilmesin).
- Testler: Playwright ile iPhone 13, Pixel 7 ve iPad görünümlerinde her bölümün ekran görüntüsünü al; sanal şarkıcı senaryosunu telefon görünümünde de çalıştır. Kurulabiliyorsa WebKit (Safari motoru) ile yerleşim testi de yap.

Bitince bana Türkçe bir özet ver: her aşamada ne değişti, hangi fonksiyonlar ve satır aralıkları, gerçek telefonda ve tablette neleri denememiz gerektiğinin kısa listesi.
