# 🎸 TANER - Discord Müzik Botu

> **"Taner kim amk?!"** - Rock seven, akıllı, enerjik Discord DJ botunuz!

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

## ✨ Özellikler

### 🎵 Akıllı Müzik Sistemi
- **Last.fm Entegrasyonu**: Gerçek müzik veritabanından benzer şarkılar
- **Otomatik Radyo Modu**: Şarkı bitince benzer şarkılar otomatik çalar
- **Akıllı Sanatçı Çeşitliliği**: Arka arkaya aynı sanatçı çalmaz
- **Gelişmiş Filtreleme**: Tutorial, programming, spam videoları otomatik engeller
- **60+ Müzik Türü Desteği**: Rock, Metal, Pop, Jazz, Blues ve daha fazlası

### 🎨 Modern Arayüz
- **Zengin Embed Mesajları**: Thumbnail, süre, isim bilgileri
- **Slash Commands**: Modern Discord komutları (`/play`, `/skip`, vb.)
- **Interaktif Butonlar**: ⏸️ Duraklat, ⏭️ Geç, ⏹️ Durdur, 📜 Sıra
- **Gerçek Zamanlı Bilgi**: "Şu An Çalıyor" kartı
- **Renkli Durum Mesajları**: Her işlem için görsel geri bildirim

### 🎭 Bot Karakteri
TANER müzik delisi, rock seven, enerjik bir DJ! Her mesajında farklı espritüel yanıtlar verir:
- 🎸 "Rock'n'Roll baby!"
- 🔥 "Hoparlörleri patlatmaya hazır mısın?"
- ⚡ "Bunu çalarken komşular şikayet etsin!"

## 🚀 Kurulum

### Gereksinimler
- Node.js v16+
- Discord Bot Token
- Last.fm API Key
- yt-dlp.exe

### Adım 1: Projeyi İndirin
```bash
git clone <repo-url>
cd discordmusicbot
npm install
```

### Adım 2: .env Dosyası Oluşturun
```env
DISCORD_TOKEN=your_discord_bot_token
LASTFM_API_KEY=your_lastfm_api_key
CLIENT_ID=your_discord_client_id
```

### Adım 3: yt-dlp İndirin
[yt-dlp.exe](https://github.com/yt-dlp/yt-dlp/releases) dosyasını proje klasörüne koyun.

### Adım 4: Botu Çalıştırın
```bash
npx ts-node src/index.ts
```

## 📖 Komutlar

### Slash Commands (Önerilen)
| Komut | Açıklama |
|-------|----------|
| `/play <şarkı>` | Şarkı çal veya sıraya ekle |
| `/skip` | Şarkıyı geç |
| `/stop` | Müziği durdur ve kanaldan çık |
| `/pause` | Müziği duraklat |
| `/resume` | Müziği devam ettir |
| `/queue` | Şarkı sırasını göster |
| `/autoplay` | Akıllı radyo modunu aç/kapat |
| `/nowplaying` | Şu an çalan şarkıyı göster |

### Eski Stil Komutlar (Destekleniyor)
`!play`, `!skip`, `!stop`, `!pause`, `!resume`, `!queue`, `!autoplay`

## 🎮 Kullanım

### 1. Ses Kanalına Gir
Önce bir ses kanalına gir.

### 2. Şarkı Çal
```
/play Metallica Master of Puppets
```

### 3. Akıllı Radyo Aktif! 🔥
Bot otomatik olarak:
- ✅ Last.fm'den benzer şarkılar bulur
- ✅ Farklı sanatçılardan seçim yapar
- ✅ Spam içerikleri filtreler
- ✅ Hiç durmadan çalar!

### 4. Kontrol Et
Mesajdaki butonları kullan:
- ⏸️ Duraklat / ▶️ Devam
- ⏭️ Geç
- ⏹️ Durdur
- 📜 Sıra Göster

## 🧠 Akıllı Radyo Algoritması

### Strateji 1: Last.fm Similar Tracks (Öncelikli)
- Last.fm API'den 3 benzer şarkı çeker
- Müzik veritabanından gerçek veriler
- En yüksek doğruluk oranı

### Strateji 2: Artist Araması
- Aynı sanatçıdan popüler şarkılar
- Last.fm başarısız olursa devreye girer

### Strateji 3: Genre Araması
- Aynı türden şarkılar (Rock, Metal, Pop vb.)
- Genre detection sistemi

### Strateji 4: Popüler Müzik (Fallback)
- Tüm stratejiler başarısız olursa
- Popüler şarkılardan seçim

### Akıllı Filtreler
- ❌ Tutorial/Programming videoları engellenir
- ❌ Çok kısa (< 60s) veya çok uzun (> 10min) şarkılar atlanır
- ❌ Spam, compilation, playlist videoları engellenir
- ❌ Aynı şarkının farklı versiyonları engellenir
- ✅ Sadece gerçek müzik videoları çalınır

## 📊 Teknolojiler

- **Discord.js v14**: Modern Discord API
- **@discordjs/voice**: Ses kanalı kontrolü
- **@discordjs/rest**: Slash commands
- **yt-search**: YouTube arama
- **yt-dlp**: Yüksek kalite ses stream
- **Last.fm API**: Müzik önerileri
- **TypeScript**: Tip güvenli kod

## 🎨 Bot Karakteri - TANER

TANER sadece bir bot değil, bir DJ! Her etkileşimde farklı, eğlenceli yanıtlar verir:

**Başlarken:**
- 🎸 "TANER sahneye çıktı! Rock'n'Roll baby!"
- 🔥 "Müzik sistemi aktif! Hoparlörleri patlatmaya hazır mısın?"
- ⚡ "TANER burada! Hangi şarkıyı duydurmak istersin?"

**Şarkı Çalarken:**
- 🎵 "İşte bu! Ses sistemini aç!"
- 🔊 "Bunu çalarken komşular şikayet etsin!"
- 🎸 "Müthiş bir seçim! Devam edelim!"

**Radyo Aktif:**
- 🎧 "Radyo modu açık! DJ TANER mikrofonda!"
- 📻 "Akıllı radyo aktif! Benzer şarkılar yükleniyooor!"
- 🔥 "Müzik asla durmayacak! Let's gooo!"

## 🌐 Hosting (Railway.app)

### Adım 1: GitHub'a Push
```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### Adım 2: Railway'e Deploy
1. [Railway.app](https://railway.app) hesabı oluştur
2. "New Project" → "Deploy from GitHub"
3. Repository'yi seç
4. Environment Variables ekle:
   - `DISCORD_TOKEN`
   - `LASTFM_API_KEY`
   - `CLIENT_ID`
5. Deploy! 🚀

Bot 24/7 çalışacak ve otomatik güncellenecek!

## 📝 Version History

### v8.0 - Modernization Update 🎨
- ✨ Slash Commands sistemi
- 🎨 Embed mesajları
- 🎮 Button controls
- 🎭 Bot karakteri (TANER)
- 📺 Now Playing kartı

### v7.0 - Last.fm Integration
- 🎵 Last.fm API entegrasyonu
- 🎯 Akıllı sanatçı çeşitliliği
- 🔍 Gelişmiş filtreleme sistemi
- ⚡ Hız optimizasyonu (3 şarkı limiti)

## 🤝 Katkıda Bulunma

Pull request'ler kabul edilir! Büyük değişiklikler için önce bir issue açın.

## 📜 Lisans

MIT License - Özgürce kullanabilirsiniz!

## 🎸 Geliştirici

**TANER Bot** ile yaratıcı bir Discord müzik deneyimi!

---

💖 **Bot'u beğendin mi?** GitHub'da ⭐ vermeyi unutma!

🎵 **Müzik asla durmaz!** 🎸
