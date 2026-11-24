<p align="center">
  <img src="icon-feather.png" alt="Light Smart TV" width="128" height="128" />
</p>

<h1 align="center">Light Smart TV</h1>

<p align="center">
  Samsung <strong>Tizen 3.0 (Chromium 47)</strong> için sıfırdan optimize edilmiş, ağır JS framework'leri içermeyen (<strong>saf ES5 + donanım hızlandırmalı AVPlay</strong>), <strong>Nuvio QR/Hesap &amp; Eklenti</strong> destekli ultra-hafif Canlı TV &amp; IPTV uygulaması.
</p>

---

## Öne Çıkan Özellikler

* **Nuvio Backend, QR Kod Giriş & Bulut Senkronizasyonu (`NuvioTVSmart` uyumlu)**
  * ISO/IEC 18004 uyumlu yerel QR kod üreteci (`js/qrcode-generator.js` + `js/qr.js`).
  * `start_device_login_session` → `poll_tv_login_session` → `tv-logins-exchange` akışıyla telefonunuzdan QR okutarak anında giriş.
  * Ana (`api.nuvio.tv`) ve yedek (`api-two.nuvioapp.space`) sunucu desteği + self-host sunucular için `/.well-known/nuvio` keşfi.
  * Nuvio profilleri (`sync_pull_profiles`) ve bulut eklenti senkronizasyonu (`addons` / `tv_addons` / `sync_pull_addons`).
* **Canlı Yayın Kaynak Motorları & EPG**
  * **Nuvio / Stremio Live TV Eklentileri**: `manifest.json` → canlı TV katalogları → çoklu yayın (multi-stream) ve özel HTTP başlığı (`User-Agent` / `Referer`) desteği.
  * **M3U / M3U8 + XMLTV EPG**: 20.000+ kanallık listeleri Tizen 3.0'ı dondurmadan parçalı (chunked) ayrıştırır; aynı kanalları tek satırda gruplar.
  * **Xtream Codes API**: Canlı TV kategorileri, kanallar ve HLS (`.m3u8`) / MPEG-TS (`.ts`) otomatik geçiş desteği.
* **Tizen 3.0 (`AVPlay`) Akıcılık & Modern Arayüz**
  * **DOM geri dönüşümlü sanal liste (`VirtualList`)**: Binlerce kanalda bile 60fps kaydırma.
  * **Hızlı Zapping & 5'er Saniye İleri/Geri Sarma**: 2 sn canlı tampon, 180ms zapping debounce, 5'er sn ileri/geri sarma (`jumpForward` / `jumpBackward`) ve tek tıkla canlı ana dönüş.
  * **Hızlı Erişim Çubuğu (`YUKARI`)**: Favoriler ve Son İzlenenler arasında tek tuşla geçiş.
  * **Türkçe karakter uyumlu anlık arama** (`ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c`) + rakamlarla direkt kanal zapping (`0`–`9`).

## Kumanda ve Masaüstü Test Kısayolları

| Samsung TV Kumanda | Masaüstü PC (Test) | İşlev |
|---|---|---|
| `OK` veya `SOL` | `Enter` / `Sol Ok` | İki panelli Kategori & Kanal çekmecesi |
| `YUKARI` | `Yukarı Ok` | **Hızlı Erişim** (Favoriler & Son İzlenenler) |
| `AŞAĞI` / `INFO` | `Aşağı Ok` / `I` | Canlı Yayın OSD, EPG ve hızlı aksiyon çubuğu |
| `SAĞ` veya `İleri Sar (FF)` | `Sağ Ok` / `]` / `.` | **+5 sn ileri sar** (arka arkaya basışta birikir) |
| `Geri Sar (RW)` | `[` / `,` | **-5 sn geri sar** (OSD'den `« -5sn` ve `● Canlı` ile de ulaşılır) |
| `CH+` / `CH-` | `PageUp` / `PageDown` | Anında kanal geçişi |
| `0` – `9` | `0` – `9` | Numarayla direkt kanala zıpla |
| **Kırmızı Tuş** | `F` | Favoriye ekle / çıkar |
| **Yeşil Tuş** | `S` | Alternatif yayın / kalite seç (Multi-Stream) |
| **Sarı Tuş** | `Q` | Hızlı kanal arama |
| **Mavi Tuş** | `N` | **Nuvio QR Hesap & Kaynak Merkezi** |
| `GERİ (Return)` | `Esc` / `Backspace` | Paneli kapat / Çift basışla uygulamadan çık |

## Paketleme ve Samsung Tizen 3.0 TV'ye Kurulum

### 1. `.wgt` Paketini Oluşturma
PowerShell üzerinden POSIX (`/`) uyumlu Tizen paketini üretin:
```powershell
.\scripts\build-wgt.ps1
```
Paket `dist\LightSmartTV-Tizen3.wgt` konumunda oluşturulur.

### 2. Samsung TV Geliştirici Modu ve Yükleme
1. TV'de **Apps** ekranına girip kumandadan **`1 2 3 4 5`** tuşlayın → **Developer Mode: On** yapın, bilgisayarınızın yerel IP adresini girip TV'yi yeniden başlatın.
2. **Tizen Studio** (veya Tizen Device Manager / `tizen-cli`) ile Samsung Distributor sertifikanızla imzalayıp TV'ye yükleyin:
```powershell
.\scripts\build-wgt.ps1 -TvIp 192.168.1.XX -CertProfile "SamsungCert"
```

## Lisans

MIT © [yusufbeyazit](https://github.com/yusufbeyazit)
