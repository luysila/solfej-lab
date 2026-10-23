# Solfej Lab

**Site:** https://luysila.github.io/solfej-lab/ · **Depo:** https://github.com/luysila/solfej-lab

**Güncelleme:** Site GitHub Pages ile `main` dalının kökünden yayınlanır. `main`'e her gönderim (`git push`)
siteyi bir iki dakika içinde kendiliğinden günceller; ayrı bir derleme adımı yok.
Çalışmaya başlamadan `git pull` ile son hâli alın; bitince `npm test` → `git commit` → `git push`.

Konservatuvar adayları için web tabanlı işitme eğitimi uygulaması: sesler piyanoyla çalınır, siz kökten başlayarak
"na" hecesiyle sırayla söylersiniz; uygulama perdenizi ölçer ve sınav sonunda teşhis çıkarır.

## Çalıştırma
Windows'ta ve Linux'ta aynı şekilde çalışır; yalnızca Node.js 18+ gerekir (Python gerekmez).
1. Terminalde bu klasöre girin.
2. `npm run serve`
3. Tarayıcıda http://localhost:8000 adresini açın. Durdurmak için terminalde Ctrl+C.
   Port 8000 doluysa başka port seçin: Linux'ta `PORT=9000 npm run serve`,
   PowerShell'de `$env:PORT=9000; npm run serve`.
   Mikrofon yalnızca localhost ya da https üzerinden çalışır; dosyayı çift tıklayarak açmayın.

## Testler
- Birim testleri: `npm test` (yalnızca Node.js gerekir)
- Uçtan uca test (isteğe bağlı): `npm install` → `npx playwright install chromium` → `npm run e2e`

## Claude Code ile çalışmak
Bu klasörde `claude` komutunu çalıştırın. Claude Code, `CLAUDE.md` dosyasını her oturumun başında kendiliğinden
okur; projenin yapısı, kuralları ve verilmiş kararlar orada. İlk özellik isteğinin tam metni `docs/ilk-istek.md` içinde.

## Lisans notu
Piyano örnekleri: Salamander Grand Piano (Alexander Holm, CC BY 3.0). Yayında atıf gerekir.
