# Solfej Lab

Konservatuvar adayları için web tabanlı işitme eğitimi uygulaması: sesler piyanoyla çalınır, siz kökten başlayarak
"na" hecesiyle sırayla söylersiniz; uygulama perdenizi ölçer ve sınav sonunda teşhis çıkarır.

## Çalıştırma
1. Terminalde bu klasöre girin.
2. `python3 -m http.server 8000`
3. Tarayıcıda http://localhost:8000 adresini açın.
   Mikrofon yalnızca localhost ya da https üzerinden çalışır; dosyayı çift tıklayarak açmayın.

## Testler
- Birim testleri: `npm test` (yalnızca Node.js gerekir)
- Uçtan uca test (isteğe bağlı): `npm install` → `npx playwright install chromium` → `npm run e2e`

## Claude Code ile çalışmak
Bu klasörde `claude` komutunu çalıştırın. Claude Code, `CLAUDE.md` dosyasını her oturumun başında kendiliğinden
okur; projenin yapısı, kuralları ve verilmiş kararlar orada. İlk özellik isteğinin tam metni `docs/ilk-istek.md` içinde.

## Lisans notu
Piyano örnekleri: Salamander Grand Piano (Alexander Holm, CC BY 3.0). Yayında atıf gerekir.
