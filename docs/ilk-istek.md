# İlk özellik isteği (17 Ekim 2026)

Aşağıdaki metin, kullanıcının bu sürümün dayandığı isteğidir (olduğu gibi).
İsteğin tamamı uygulandı. İstekten farklı yapılanlar ve gerekçeleri `CLAUDE.md` dosyasındaki
"Verilmiş kararlar" bölümündedir (örneğin pitchy kütüphanesinde YIN bulunmadığı için YIN dosyaya yazıldı).

---

Rol ve Kapsam:
Sen uzman bir Web Audio API geliştiricisi, müzik teknolojileri mühendisi ve solfej eğitmenisin. Konservatuvara hazırlanan adaylar için web tabanlı, etkileşimli bir işitme eğitimi platformu geliştiriyoruz.
Çalışma Yöntemi:
Sana mevcut bir index.html dosyası (ve temel kod iskeletini) sağlıyorum. Sıfırdan bir dosya yazmak yerine, aşağıda listelediğim tüm özellikleri ve müzikal mantığı mevcut dosyamın üzerine, yapıyı bozmadan entegre etmeni istiyorum. Aynı kodların üzerinde yazarak değiştirebilirsin. Gerekli dış kütüphaneleri (Pitchy, VexFlow vb.) CDN üzerinden dosyaya dahil et ve eklenecek HTML, CSS ve JavaScript kodlarını bu mevcut yapıya yedir.
Geliştirici Konfigürasyonu (Merkezi Kontrol):
JS kodunun en üstünde, dışarıdan kolayca değiştirebileceğimiz merkezi bir CONFIG objesi oluştur. Şu ayarları içermeli:

* TOLERANCE_CENTS: 20 (Hedef notadan sapma payı, -20 ve +20 sent aralığı)
* SUSTAIN_TIME_MS: 250 (Kullanıcının "na" hecesiyle sesi tutması gereken süre, 0.25 saniye)
* QUESTION_COUNTS: { single: 5, double: 5, triple: 5 } (Sınav yapısı)
* REGISTER: { minMidi: 48, maxMidi: 72 } (C3 - C5 aralığı. Seslerin çok absürt pes veya tiz frekanslara çıkmasını engellemek için)
* CHORD_RULES: Üç sesli (5'li) akor testlerinde sistemin 5 soruluk sette rastgele olarak maksimum 1 adet Artmış (Aug) veya Eksilmiş (Dim) akor sorması, geri kalanların ağırlıklı olarak Majör ve Minör olması.

Sınav Akışı ve Kilitli İlerleme (State Machine):

* Sistem, "Teste Başla" dendiğinde rastgele 15 soruluk bir oturum oluşturacak (5 tek, 5 çift, 5 üç ses).
* Her soruda ses(ler) aynı anda (armonik) çalınacak. Ardından kullanıcıdan bu sesleri kökten (root) başlayarak "na" hecesiyle sırayla mikrofona okuması istenecek.

1. nota başarıyla doğrulanmadan 2. notaya geçiş yapılmayacak.

* Sesler CONFIG.REGISTER aralığında, insan sesine uygun frekanslardan seçilecek.

Perde Algılama (Pitch Detection) ve UI Grafikleri:

* İnsan sesini analiz etmek için pitchy kütüphanesinin YIN algoritmasını kullan.
* Arayüzde anlık sent sapmasını gösteren yatay bir akort aleti (tuner) ve sesin zaman içindeki dalgalanmasını çizen gerçek zamanlı bir ses grafiği (pitch contour/history) oluştur.
* Gürültü Eşiği (Noise Gate): Kullanıcının mikrofon hassasiyetini manuel olarak ayarlayabileceği bir "Gürültü Eşiği" (RMS Threshold) slider'ı arayüze ekle.

Görsel Nota Portesi (Opsiyonel):

* Arayüzde bir "Portede Göster" (Show Staff) toggle/checkbox butonu ekle.
* Bu buton aktifse, VexFlow kütüphanesi kullanılarak o an dinlenilen veya çözülen aralık/akorlar standart nota portesi üzerinde anlık olarak çizilsin. Kapalıysa porte gizlensin.

Puanlama, Sustain ve Oturum Sonu Analitiği:

* Kullanıcı, ±20 sent tolerans içinde sesi aralıksız 0.25 saniye (UI'da dolum barı ile gösterilecek) sabit tuttuğunda nota doğru kabul edilsin.
* Analitik Ekranı: 15 soru bittiğinde sistem bir teşhis ekranı çıkarsın. Hangi soru tiplerinde (tek, çift, üç) zorlanıldığı, kullanıcının genelde hedefin üstüne mi (tiz/sharp) altına mı (pes/flat) sarktığı analiz edilsin. Bu hesaplama mantığını da kod içinde düzenlenebilir bir fonksiyonda topla.

Ses ayarları
Verilen aralıklar ve akorlar sinüs dalgası yerine piyano sesi olmalı. Saf sinüs dalgası yerine tone.js ve hafif bir akustik piyano sample kütüphanesi (Soundfont) kullan. Sesler gerçeğe en yakın piyanoda tınlasın.
Yerel Veri Kaydı (Local Storage): Sınav bitimindeki teşhis ve skor verilerini sayfa yenilendiğinde kaybolmaması için tarayıcının localStorage birimine kaydet. Arayüzde "Önceki Testlerim" isimli küçük bir grafik veya liste alanı olsun. Bu kısmı da geliştiriciler olarak ayarlayabilelim.
MÜMKÜNSE BÜTÜN AYARLARA GELİŞTİRİCİNİN DE AYARLAYABİLECEĞİ BİR ŞEKİLDE AYARLA. BU DURUM İNSAN BİR PROFESYONELİN DE BELLİ STANDARTLARA UYUM SAĞLAMASI İÇİN GEÇERLİ.

bu yazdığım promptta benim için oluşturduğun index.html adlı web tabanlı sitede düzenleme yapacaksın. sil baştan yapmak yerine bunun üzerine eklemeler yapabilirsin.
