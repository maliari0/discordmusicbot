import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  TextChannel,
  VoiceBasedChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnection,
  AudioPlayer,
  StreamType,
} from "@discordjs/voice";
import yts from "yt-search";
import YTDlpWrap from "yt-dlp-wrap";
import dotenv from "dotenv";
import axios from "axios";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { spawn } from "child_process";

dotenv.config();

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_BASE_URL = "http://ws.audioscrobbler.com/2.0/";

// yt-dlp binary'sini yükle (Railway için)
const ytDlp = new YTDlpWrap("yt-dlp");

// 🎸 TANER BOT KARAKTERİ - Müzik delisi, rock seven, enerjik DJ
const TANER_PERSONALITY = {
  ready: [
    "🎸 TANER sahneye çıktı! Rock'n'Roll baby!",
    "🔥 Müzik sistemi aktif! Hoparlörleri patlatmaya hazır mısın?",
    "⚡ TANER burada! Hangi şarkıyı duydurmak istersin?",
  ],
  playing: [
    "🎵 İşte bu! Ses sistemini aç!",
    "🔊 Bunu çalarken komşular şikayet etsin!",
    "🎸 Müthiş bir seçim! Devam edelim!",
    "⚡ Bu şarkıyla evler titresin!",
  ],
  autoplay: [
    "🎧 Radyo modu açık! DJ TANER mikrofonda!",
    "📻 Akıllı radyo aktif! Benzer şarkılar yükleniyooor!",
    "🔥 Müzik asla durmayacak! Let's gooo!",
  ],
  searching: [
    "🔍 Arşivlere dalıyorum...",
    "🎵 Müzik koleksiyonuna bakıyorum...",
    "🎸 En iyi şarkıyı buluyorum...",
  ],
};

const getRandomPhrase = (phrases: string[]) =>
  phrases[Math.floor(Math.random() * phrases.length)];

// --- TİP TANIMLAMALARI ---
interface Song {
  title: string;
  url: string;
  id?: string;
  keywords?: string[];
  thumbnail?: string; // YouTube thumbnail
  duration?: string; // Şarkı süresi
  requestedBy?: string; // Kim istedi
}

interface ServerQueue {
  textChannel: TextChannel;
  voiceChannel: VoiceBasedChannel;
  connection: VoiceConnection;
  player: AudioPlayer;
  songs: Song[];
  playing: boolean;
  autoplay: boolean;
  lastPlayedSong?: Song;
  playedHistory: Set<string>;
  nowPlayingMessage?: Message;
  buttonTimeout?: NodeJS.Timeout;
  loopMode: "off" | "single" | "queue";
  idleTimer?: NodeJS.Timeout;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const queue = new Map<string, ServerQueue>();

// 🎵 Slash Commands Tanımları
const commands = [
  {
    name: "play",
    description: "🎵 Şarkı çal veya sıraya ekle",
    options: [
      {
        name: "şarkı",
        description: "Çalmak istediğin şarkı adı veya URL",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "skip",
    description: "⏭️ Şarkıyı geç",
  },
  {
    name: "stop",
    description: "⏹️ Müziği durdur ve kanaldan çık",
  },
  {
    name: "pause",
    description: "⏸️ Müziği duraklat",
  },
  {
    name: "resume",
    description: "▶️ Müziği devam ettir",
  },
  {
    name: "queue",
    description: "📜 Şarkı sırasını göster",
  },
  {
    name: "autoplay",
    description: "📻 Akıllı radyo modunu aç/kapat",
  },
  {
    name: "nowplaying",
    description: "🎧 Şu an çalan şarkıyı göster",
  },
  {
    name: "shuffle",
    description: "🔀 Sıradaki şarkıları karıştır",
  },
  {
    name: "loop",
    description: "🔁 Yinele modunu değiştir (kapalı/tek şarkı/tüm sıra)",
  },
];

// Slash commands'ı kaydet
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN!
    );
    console.log("🔄 Slash commands kaydediliyor...");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), {
      body: commands,
    });

    console.log("✅ Slash commands başarıyla kaydedildi!");
  } catch (error) {
    console.error("❌ Slash commands kayıt hatası:", error);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log("\n" + "═".repeat(50));
  console.log(getRandomPhrase(TANER_PERSONALITY.ready));
  console.log("═".repeat(50));
  console.log("🎵 Akıllı Radyo Sistemi: Last.fm Integration v8.0");
  console.log("📡 Last.fm API + Smart Filters + Auto Artist Variety");
  console.log("🎸 Slash Commands + Embeds + Button Controls");
  console.log("═".repeat(50));

  // yt-dlp kontrolü
  try {
    console.log("🔧 yt-dlp kontrol ediliyor...");
    const ytDlpVersion = await ytDlp.getVersion();
    console.log("✅ yt-dlp version:", ytDlpVersion);
  } catch (error) {
    console.error("❌ yt-dlp bulunamadı veya çalışmıyor:", error);
    console.error("⚠️ Bot müzik çalamayabilir!");
  }

  console.log("═".repeat(50) + "\n");

  await registerCommands();
});

// 🎮 Slash Command Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

// 🎯 Slash Command Handler Fonksiyonu
async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case "play":
        const query = interaction.options.getString("şarkı", true);
        await executePlaySlash(interaction, query);
        break;
      case "skip":
        await skipSlash(interaction);
        break;
      case "stop":
        await stopSlash(interaction);
        break;
      case "pause":
        await pauseSlash(interaction);
        break;
      case "resume":
        await resumeSlash(interaction);
        break;
      case "queue":
        await showQueueSlash(interaction);
        break;
      case "autoplay":
        await toggleAutoplaySlash(interaction);
        break;
      case "nowplaying":
        await showNowPlayingSlash(interaction);
        break;
      case "shuffle":
        await shuffleSlash(interaction);
        break;
      case "loop":
        await loopSlash(interaction);
        break;
      default:
        await interaction.reply({
          content: "❌ Bilinmeyen komut!",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("Slash command hatası:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Bir hata oluştu!",
        ephemeral: true,
      });
    }
  }
}

// 🎨 Embed Builder Fonksiyonları
function createNowPlayingEmbed(song: Song, queueLength: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xff0000) // YouTube kırmızısı
    .setTitle("🎵 Şu An Çalıyor")
    .setDescription(`**${song.title}**`)
    .addFields(
      { name: "⏱️ Süre", value: song.duration || "Bilinmiyor", inline: true },
      { name: "📊 Sıradaki", value: `${queueLength} şarkı`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "TANER DJ | Taner kim amk?! 🎸" });

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  if (song.requestedBy) {
    embed.addFields({
      name: "👤 İsteyen",
      value: song.requestedBy,
      inline: true,
    });
  }

  return embed;
}

function createQueueEmbed(songs: Song[], autoplay: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x00ff00) // Yeşil
    .setTitle("📜 Şarkı Sırası")
    .setTimestamp()
    .setFooter({ text: `Akıllı Radyo: ${autoplay ? "✅ Açık" : "❌ Kapalı"}` });

  if (songs.length === 0) {
    embed.setDescription("🎵 Sıra boş! `/play` ile şarkı ekle!");
  } else {
    const queueList = songs
      .slice(0, 10)
      .map((song, index) => {
        const emoji = index === 0 ? "▶️" : `${index + 1}.`;
        return `${emoji} **${song.title}**`;
      })
      .join("\n");

    embed.setDescription(queueList);

    if (songs.length > 10) {
      embed.addFields({
        name: "➕ Daha fazla",
        value: `... ve ${songs.length - 10} şarkı daha`,
      });
    }
  }

  return embed;
}

function createSearchingEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffff00) // Sarı
    .setTitle("🔍 Aranıyor...")
    .setDescription(getRandomPhrase(TANER_PERSONALITY.searching))
    .setTimestamp();
}

function createErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff0000) // Kırmızı
    .setTitle("❌ Hata")
    .setDescription(message)
    .setTimestamp();
}

// 🎮 Playback Control Buttons
function createPlaybackButtons(
  isPaused: boolean
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("pause_resume")
      .setLabel(isPaused ? "▶️ Devam Et" : "⏸️ Duraklat")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setLabel("⏭️ Geç")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("stop")
      .setLabel("⏹️ Durdur")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("queue")
      .setLabel("📜 Sıra")
      .setStyle(ButtonStyle.Secondary)
  );
}

// 🎯 Button Interaction Handler
async function handleButtonInteraction(interaction: ButtonInteraction) {
  const serverQueue = queue.get(interaction.guildId!);

  if (!serverQueue) {
    return interaction.reply({
      content: "❌ Bot bir ses kanalında değil!",
      ephemeral: true,
    });
  }

  switch (interaction.customId) {
    case "pause_resume":
      if (serverQueue.playing) {
        serverQueue.player.pause();
        serverQueue.playing = false;
        await interaction.reply({
          content: "⏸️ Müzik duraklatıldı!",
          ephemeral: true,
        });
      } else {
        serverQueue.player.unpause();
        serverQueue.playing = true;
        await interaction.reply({
          content: "▶️ Müzik devam ediyor!",
          ephemeral: true,
        });
      }

      // Mesajı güncelle
      if (serverQueue.nowPlayingMessage && serverQueue.songs[0]) {
        await serverQueue.nowPlayingMessage.edit({
          embeds: [
            createNowPlayingEmbed(
              serverQueue.songs[0],
              serverQueue.songs.length - 1
            ),
          ],
          components: [createPlaybackButtons(!serverQueue.playing)],
        });
      }
      break;

    case "skip":
      serverQueue.player.stop();
      await interaction.reply({
        content: "⏭️ Şarkı geçiliyor!",
        ephemeral: true,
      });
      break;

    case "stop":
      serverQueue.songs = [];
      serverQueue.playedHistory.clear();
      serverQueue.player.stop();
      serverQueue.connection.destroy();
      queue.delete(interaction.guildId!);
      await interaction.reply({
        content: "⏹️ Tanereye gitti la",
        ephemeral: true,
      });
      break;

    case "queue":
      const queueEmbed = createQueueEmbed(
        serverQueue.songs,
        serverQueue.autoplay
      );
      await interaction.reply({ embeds: [queueEmbed], ephemeral: true });
      break;
  }
}

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const command = args[0].toLowerCase();

  if (command === "!play") {
    await executePlay(message, args);
    return;
  }
  if (command === "!skip") {
    skip(message);
    return;
  }
  if (command === "!stop") {
    stop(message);
    return;
  }
  if (command === "!pause") {
    pause(message);
    return;
  }
  if (command === "!resume") {
    resume(message);
    return;
  }
  if (command === "!queue") {
    showQueue(message);
    return;
  }
  if (command === "!autoplay") {
    toggleAutoplay(message);
    return;
  }
  if (command === "!shuffle") {
    shuffleQueue(message);
    return;
  }
  if (command === "!loop") {
    toggleLoop(message);
    return;
  }
});

// --- YARDIMCI FONKSİYONLAR ---

/**
 * Şarkı başlığından artist ve song name ayırır
 */
function parseTitle(title: string): {
  artist: string;
  song: string;
  isLive: boolean;
  isRemix: boolean;
  isVersion: boolean;
} {
  const titleLower = title.toLowerCase();

  // Live, remix, cover gibi versionları tespit et
  const isLive = /\b(live|concert|tour|stage|performance)\b/i.test(title);
  const isRemix = /\b(remix|mix|mashup|cover|acoustic|instrumental)\b/i.test(
    title
  );
  const isVersion = /\b(remaster|version|edit|extended|radio|official)\b/i.test(
    title
  );

  // Temizlik: parantez içlerini ve fazladan kelimeleri sil
  let cleanTitle = title
    .replace(/[\(\[\{].*?[\)\]\}]/g, "") // Parantezleri temizle
    .replace(
      /\b(official|video|audio|lyrics|music|hq|hd|4k|music|video|mv|clip)\b/gi,
      ""
    )
    .trim();

  let artist = "";
  let song = "";

  // Format 1: "Artist - Song" veya "Artist – Song" (em dash)
  const dashPattern = / [-–—] /; // hyphen, en dash, em dash
  if (dashPattern.test(cleanTitle)) {
    const parts = cleanTitle.split(dashPattern);
    artist = parts[0].trim();
    song = parts.slice(1).join(" - ").trim();

    // Şarkı adının başındaki dash karakterlerini temizle
    song = song.replace(/^[-–—]+\s*/, "").trim();
  }
  // Format 2: "Artist: Song"
  else if (cleanTitle.includes(": ")) {
    const parts = cleanTitle.split(": ");
    artist = parts[0].trim();
    song = parts.slice(1).join(": ").trim();

    // Şarkı adının başındaki dash karakterlerini temizle
    song = song.replace(/^[-–—]+\s*/, "").trim();
  }
  // Format 3: Sadece başlık var
  else {
    song = cleanTitle;
    // İlk kelimeyi artist olarak tahmin et (çok güvenilir değil)
    const words = cleanTitle.split(" ");
    if (words.length > 2) {
      artist = words[0];
      song = words.slice(1).join(" ");
    }
  }

  return { artist, song, isLive, isRemix, isVersion };
}

/**
 * Video başlığından müzik türü anahtar kelimelerini çıkarır (geliştirilmiş)
 */
function extractKeywords(title: string): string[] {
  const titleLower = title.toLowerCase();
  const keywords: string[] = [];

  // Ana müzik türleri (daha spesifik)
  const genres = [
    // Rock ailesi
    "rock",
    "hard rock",
    "heavy metal",
    "metal",
    "thrash metal",
    "death metal",
    "punk",
    "punk rock",
    "indie rock",
    "alternative rock",
    "grunge",
    // Pop/Electronic
    "pop",
    "electro pop",
    "synth pop",
    "electronic",
    "edm",
    "house",
    "techno",
    "trance",
    "dubstep",
    "drum and bass",
    "dnb",
    // Hip Hop/R&B
    "hip hop",
    "rap",
    "trap",
    "r&b",
    "rnb",
    "soul",
    "funk",
    // Soft/Classic
    "ballad",
    "slow",
    "acoustic",
    "classical",
    "jazz",
    "blues",
    "country",
    "folk",
    // Türkçe
    "türkü",
    "halk müziği",
    "sanat müziği",
    "arabesk",
    "fantezi",
    "pop türkçe",
  ];

  // Önce uzun kelimeleri kontrol et (örn: "heavy metal" önce, "metal" sonra)
  const sortedGenres = genres.sort((a, b) => b.length - a.length);

  for (const genre of sortedGenres) {
    if (titleLower.includes(genre)) {
      keywords.push(genre);
      break; // İlk eşleşen ana türü bul ve dur
    }
  }

  // Hiç tür bulunamadıysa genel ara
  if (keywords.length === 0) {
    keywords.push("music");
  }

  return keywords;
}

/**
 * İki şarkının aynı olup olmadığını kontrol eder (farklı versiyonlar dahil)
 */
function isSameSong(title1: string, title2: string): boolean {
  const parse1 = parseTitle(title1);
  const parse2 = parseTitle(title2);

  // Artist ve song name benzerliğine bak
  const artistSimilarity = calculateSimilarity(
    parse1.artist.toLowerCase(),
    parse2.artist.toLowerCase()
  );
  const songSimilarity = calculateSimilarity(
    parse1.song.toLowerCase(),
    parse2.song.toLowerCase()
  );

  // Eğer artist %70+ ve song %60+ benzer ise aynı şarkı
  return artistSimilarity > 0.7 && songSimilarity > 0.6;
}

/**
 * Videoları müzik içeriğine göre filtreler (ÇOK SIKIYA ALINMIŞ)
 */
function filterMusicVideos(
  videos: any[],
  history: Set<string>,
  lastTitle: string
): any[] {
  const lastParse = parseTitle(lastTitle);

  return videos.filter((video) => {
    const videoId = video.videoId;
    const title = video.title;
    const titleLower = title.toLowerCase();
    const duration = video.seconds || video.duration?.seconds || 0;

    // 1. Geçmişte çalınmış mı?
    if (history.has(videoId)) return false;

    // 2. Aynı şarkının farklı versiyonu mu? (Live, remix dahil)
    if (isSameSong(lastTitle, title)) {
      console.log(`  ⏭️  Atlandı (aynı şarkı): ${title}`);
      return false;
    }

    // 3. Süre kontrolü: MÜZİK VİDEOLARI için 90 saniye - 8 dakika
    if (duration < 90 || duration > 480) {
      console.log(`  ⏭️  Atlandı (süre ${duration}s): ${title}`);
      return false;
    }

    // 4. SPAM/TUTORIAL/PROGRAMLAMA FİLTRESİ (ÇOK ÖNEMLİ!)
    const blacklist = [
      // Tutorial ve eğitim
      "tutorial",
      "how to",
      "guide",
      "lesson",
      "ders",
      "öğren",
      "fonksiyon",
      "function",
      "programming",
      "coding",
      "javascript",
      "python",
      "react",
      "keywords",
      "efficiently",
      "combining",
      // Dizi ve film
      "episode",
      "bölüm",
      "sezon",
      "fragman",
      "trailer",
      "teaser",
      "dizi müziği",
      "film müziği",
      "jenerik",
      "soundtrack",
      // İstenmeyen içerik
      "reaction",
      "reacts",
      "tepki",
      "gameplay",
      "walkthrough",
      "review",
      "inceleme",
      "analysis",
      "breakdown",
      "explained",
      "compilation",
      "full album",
      "playlist",
      "best of",
      // Podcast ve konuşma
      "podcast",
      "interview",
      "röportaj",
      "talk",
      "discussion",
    ];

    for (const spam of blacklist) {
      if (titleLower.includes(spam)) {
        console.log(`  ⏭️  Atlandı (spam: ${spam}): ${title}`);
        return false;
      }
    }

    // 5. Müzik göstergesi ZORUNLU (kısa videolar için)
    const musicIndicators = [
      "official",
      "audio",
      "lyrics",
      "music",
      "song",
      "şarkı",
      "official video",
      "lyric video",
      "music video",
    ];

    if (duration < 180) {
      // 3 dakikadan kısa videolar için zorunlu
      const hasIndicator = musicIndicators.some((indicator) =>
        titleLower.includes(indicator)
      );
      if (!hasIndicator) {
        console.log(`  ⏭️  Atlandı (müzik göstergesi yok): ${title}`);
        return false;
      }
    }

    // 6. Channel adı kontrolü (isteğe bağlı ama yardımcı)
    const channelName = video.author?.name?.toLowerCase() || "";
    const badChannels = ["gaming", "tutorial", "tech", "coding", "programming"];
    if (badChannels.some((bad) => channelName.includes(bad))) {
      console.log(`  ⏭️  Atlandı (kanal: ${video.author?.name})`);
      return false;
    }

    return true;
  });
}

/**
 * Last.fm API - Benzer şarkıları getirir
 */
interface LastFmTrack {
  name: string;
  artist: { name: string };
  url: string;
}

async function getSimilarTracksFromLastFm(
  artist: string,
  track: string
): Promise<LastFmTrack[]> {
  if (!LASTFM_API_KEY) {
    console.log("  ⚠️  Last.fm API key bulunamadı");
    return [];
  }

  // Önce artist + track ile dene
  let results = await tryLastFmSearch(artist, track, "artist + track");

  // Bulamazsa sadece track adı ile dene (Türkçe şarkılar için)
  if (results.length === 0 && track.length > 3) {
    console.log(`  🔄 Sadece şarkı adı ile tekrar deneniyor...`);
    results = await tryLastFmSearchByTrackOnly(track);
  }

  return results;
}

/**
 * Last.fm'den artist + track ile arama yapar
 */
async function tryLastFmSearch(
  artist: string,
  track: string,
  mode: string
): Promise<LastFmTrack[]> {
  try {
    console.log(`  🎸 Last.fm sorgusu (${mode}): "${artist}" - "${track}"`);

    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.getsimilar",
        artist: artist,
        track: track,
        api_key: LASTFM_API_KEY,
        format: "json",
        limit: 3,
        autocorrect: 1, // Türkçe karakterler için otomatik düzeltme
      },
      timeout: 5000,
    });

    console.log(`  📡 Last.fm yanıt durumu: ${response.status}`);

    // Hata durumları kontrol et
    if (response.data?.error) {
      console.log(
        `  ⚠️  Last.fm API hatası: ${response.data.message} (kod: ${response.data.error})`
      );
      return [];
    }

    if (response.data?.similartracks?.track) {
      const tracks = Array.isArray(response.data.similartracks.track)
        ? response.data.similartracks.track
        : [response.data.similartracks.track];

      const validTracks = tracks.filter((t: any) => t.name && t.artist?.name);
      console.log(
        `  ✅ Last.fm'den ${validTracks.length} benzer şarkı bulundu`
      );

      // İlk 3 şarkıyı göster
      if (validTracks.length > 0) {
        validTracks.slice(0, 3).forEach((t: any) => {
          console.log(`     - ${t.artist.name} - ${t.name}`);
        });
        if (validTracks.length > 3) {
          console.log(`     ... ve ${validTracks.length - 3} şarkı daha`);
        }
      }

      return validTracks;
    } else {
      console.log(`  ⚠️  ${mode} ile sonuç bulunamadı`);
    }

    return [];
  } catch (error: any) {
    if (error.code === "ECONNABORTED") {
      console.log("  ⚠️  Last.fm timeout (5s)");
    } else if (error.response) {
      console.log(`  ⚠️  Last.fm HTTP hatası: ${error.response.status}`);
    } else if (error.request) {
      console.log("  ⚠️  Last.fm'e ulaşılamadı");
    } else {
      console.log(`  ⚠️  Last.fm hatası: ${error.message}`);
    }
    return [];
  }
}

/**
 * Last.fm'den SADECE track adı ile arama yapar (track.search metodu)
 * Türkçe şarkılar için daha etkili
 */
async function tryLastFmSearchByTrackOnly(
  track: string
): Promise<LastFmTrack[]> {
  try {
    console.log(`  🎵 Last.fm şarkı araması: "${track}"`);

    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.search",
        track: track,
        api_key: LASTFM_API_KEY,
        format: "json",
        limit: 10,
        autocorrect: 1,
      },
      timeout: 5000,
    });

    if (response.data?.results?.trackmatches?.track) {
      let tracks = response.data.results.trackmatches.track;

      // Tek sonuç array değilse array yap
      if (!Array.isArray(tracks)) {
        tracks = [tracks];
      }

      // İlk sonucu bul ve onun benzerlerini getir
      if (tracks.length > 0) {
        const firstTrack = tracks[0];
        console.log(
          `  🎯 Bulunan şarkı: ${firstTrack.artist} - ${firstTrack.name}`
        );

        // Şimdi bu şarkının benzerlerini al
        return await tryLastFmSearch(
          firstTrack.artist,
          firstTrack.name,
          "bulunan şarkı"
        );
      }
    }

    console.log(`  ⚠️  Şarkı adı ile sonuç bulunamadı`);
    return [];
  } catch (error: any) {
    console.log(`  ⚠️  Şarkı araması başarısız: ${error.message}`);
    return [];
  }
}

/**
 * Last.fm şarkılarını YouTube'da arar (EXACT SEARCH)
 */
async function searchLastFmTracksOnYoutube(
  tracks: LastFmTrack[],
  history: Set<string>
): Promise<any[]> {
  const results: any[] = [];

  // İlk 10 benzer şarkıyı YouTube'da ara
  for (const track of tracks.slice(0, 10)) {
    try {
      // EXACT search: Artist + Track + "official" veya "audio"
      const queries = [
        `${track.artist.name} ${track.name} official`,
        `${track.artist.name} ${track.name} audio`,
        `${track.artist.name} ${track.name} music video`,
      ];

      for (const query of queries) {
        const searchResult = await yts(query);
        if (searchResult.videos.length > 0) {
          // Sadece ilk sonucu al (en alakalı)
          results.push(searchResult.videos[0]);
          break;
        }
      }

      // Rate limit için kısa bekleme
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`  ⚠️  YouTube arama hatası: ${track.name}`);
    }
  }

  console.log(`  🎬 YouTube'da ${results.length} şarkı bulundu`);
  return results;
}

/**
 * İki string arasındaki benzerliği hesaplar (0-1 arası)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const words1 = str1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = str2.split(/\s+/).filter((w) => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return 0;
  const commonWords = words1.filter((word) => words2.includes(word));
  return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Artist bazlı benzer şarkı arar
 */
async function searchSimilarArtist(
  artist: string,
  genre: string,
  history: Set<string>
): Promise<any[]> {
  if (!artist || artist.length < 2) return [];

  try {
    const queries = [
      `${artist} best songs`,
      `similar to ${artist}`,
      `${genre} like ${artist}`,
      `${artist} popular tracks`,
    ];

    const query = queries[Math.floor(Math.random() * queries.length)];
    console.log(`  🔎 Arama: "${query}"`);

    const results = await yts(query);
    return results.videos.slice(0, 20);
  } catch (error) {
    console.error("Artist arama hatası:", error);
    return [];
  }
}

/**
 * Genre bazlı şarkı arar
 */
async function searchByGenre(
  genre: string,
  history: Set<string>
): Promise<any[]> {
  try {
    const queries = [
      `best ${genre} songs`,
      `${genre} music playlist`,
      `top ${genre} tracks`,
      `popular ${genre}`,
    ];

    const query = queries[Math.floor(Math.random() * queries.length)];
    console.log(`  🔎 Arama: "${query}"`);

    const results = await yts(query);
    return results.videos.slice(0, 25);
  } catch (error) {
    console.error("Genre arama hatası:", error);
    return [];
  }
}

// --- ANA AUTOPLAY ALGORİTMASI ---
async function getSmartRelatedSong(
  lastSong: Song,
  history: Set<string>
): Promise<Song | null> {
  try {
    console.log(`\n🎵 Autoplay için analiz: "${lastSong.title}"`);

    // Başlığı parse et
    const parsed = parseTitle(lastSong.title);
    console.log(`  👤 Artist: "${parsed.artist}" | 🎵 Song: "${parsed.song}"`);
    console.log(
      `  🏷️  Versiyon: ${parsed.isLive ? "Live" : ""}${
        parsed.isRemix ? "Remix" : ""
      }${parsed.isVersion ? "Version" : ""}`
    );

    // Genre'leri tespit et
    const keywords = extractKeywords(lastSong.title);
    const genre = keywords[0] || "music";
    console.log(`  🎸 Genre: ${genre}`);

    let candidates: any[] = [];

    // ⭐ Strateji 1: Last.fm Similar Tracks (EN ÖNCELİKLİ)
    if (
      parsed.artist &&
      parsed.song &&
      parsed.artist.length > 2 &&
      parsed.song.length > 2
    ) {
      console.log(`\n📻 Strateji 1: Last.fm Similar Tracks...`);
      const similarTracks = await getSimilarTracksFromLastFm(
        parsed.artist,
        parsed.song
      );

      if (similarTracks.length > 0) {
        // Last.fm şarkılarını YouTube'da ara
        const youtubeResults = await searchLastFmTracksOnYoutube(
          similarTracks,
          history
        );
        if (youtubeResults.length > 0) {
          candidates = [...candidates, ...youtubeResults];
          console.log(
            `  ✨ Last.fm'den ${youtubeResults.length} şarkı bulundu - diğer stratejiler atlanıyor`
          );
          // Last.fm başarılı, diğer stratejileri atlayabiliriz
        } else {
          console.log(
            `  ⚠️  Last.fm şarkıları YouTube'da bulunamadı, diğer stratejilere geçiliyor...`
          );
        }
      }
    }

    // Strateji 2: Artist bazlı arama (SADECE Last.fm başarısız olduysa)
    if (candidates.length === 0 && parsed.artist && parsed.artist.length > 2) {
      console.log(`\n📻 Strateji 2: Artist bazlı arama (${parsed.artist})...`);
      const artistResults = await searchSimilarArtist(
        parsed.artist,
        genre,
        history
      );
      candidates = [...candidates, ...artistResults];
    }

    // Strateji 3: Genre bazlı arama (SADECE öncekiler başarısız olduysa)
    if (candidates.length === 0) {
      console.log(`\n📻 Strateji 3: Genre bazlı arama (${genre})...`);
      const genreResults = await searchByGenre(genre, history);
      candidates = [...candidates, ...genreResults];
    }

    // Strateji 4: Fallback - popüler müzik (SADECE tüm stratejiler başarısız olduysa)
    if (candidates.length === 0) {
      console.log(`\n📻 Strateji 4: Popüler müzik araması...`);
      const fallbackQuery = "popular music songs 2024";
      const results = await yts(fallbackQuery);
      candidates = [...candidates, ...results.videos.slice(0, 20)];
    }

    console.log(`  📦 Toplam aday: ${candidates.length}`);

    // Adayları FİLTRELE (ÇOK SIKI)
    const validCandidates = filterMusicVideos(
      candidates,
      history,
      lastSong.title
    );

    console.log(`  ✅ Geçerli aday: ${validCandidates.length}`);

    if (validCandidates.length === 0) {
      console.log("  ❌ Hiç uygun şarkı bulunamadı.");
      return null;
    }

    // Son şarkının sanatçısını al
    const lastArtist = parseTitle(lastSong.title).artist.toLowerCase();

    // Önce farklı sanatçıdan şarkı bulmaya çalış
    let selected;
    const differentArtistCandidates = validCandidates.filter((candidate) => {
      const candidateArtist = parseTitle(candidate.title).artist.toLowerCase();
      return candidateArtist !== lastArtist && candidateArtist.length > 1;
    });

    if (differentArtistCandidates.length > 0) {
      // Farklı sanatçıdan seç (en iyi 5'ten)
      const topCandidates = differentArtistCandidates.slice(0, 5);
      selected =
        topCandidates[Math.floor(Math.random() * topCandidates.length)];
      console.log(
        `  🎭 Farklı sanatçı tercihi: ${parseTitle(selected.title).artist}`
      );
    } else {
      // Farklı sanatçı bulunamazsa normal seçim yap
      const topCandidates = validCandidates.slice(0, 5);
      selected =
        topCandidates[Math.floor(Math.random() * topCandidates.length)];
      console.log(`  ⚠️  Farklı sanatçı bulunamadı, rastgele seçim yapılıyor`);
    }

    console.log(`  🎯 Seçildi: "${selected.title}"`);
    console.log(`  ⏱️  Süre: ${selected.timestamp}`);

    return {
      title: selected.title,
      url: selected.url,
      id: selected.videoId,
      keywords: extractKeywords(selected.title),
      thumbnail: selected.thumbnail,
      duration: selected.timestamp,
      requestedBy: "🤖 Akıllı Radyo",
    };
  } catch (error) {
    console.error("❌ Autoplay algoritma hatası:", error);
    return null;
  }
}

// --- CORE PLAY FUNCTION ---

// 🔍 Şarkı Arama Helper
async function searchSong(
  query: string,
  requestedBy?: string
): Promise<Song | null> {
  try {
    if (query.startsWith("http")) {
      const videoIdMatch = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
      const id = videoIdMatch ? videoIdMatch[1] : undefined;
      return {
        title: "URL Şarkısı",
        url: query,
        id: id,
        requestedBy,
      };
    } else {
      const r = await yts(query);
      if (r.videos.length === 0) return null;

      const vid = r.videos[0];
      return {
        title: vid.title,
        url: vid.url,
        id: vid.videoId,
        keywords: extractKeywords(vid.title),
        thumbnail: vid.thumbnail,
        duration: vid.timestamp,
        requestedBy,
      };
    }
  } catch (error) {
    console.error("Şarkı arama hatası:", error);
    return null;
  }
}

// 🎵 Slash Command Play Handler
async function executePlaySlash(
  interaction: ChatInputCommandInteraction,
  query: string
) {
  await interaction.deferReply();

  const member = interaction.member as any;
  if (!member || !member.voice?.channel) {
    return interaction.editReply({
      embeds: [createErrorEmbed("❌ Önce bir ses kanalına girmelisin!")],
    });
  }

  const voiceChannel = member.voice.channel;
  const searchEmbed = createSearchingEmbed();
  await interaction.editReply({ embeds: [searchEmbed] });

  if (isPlaylistUrl(query)) {
    try {
      await interaction.editReply({ 
        embeds: [new EmbedBuilder()
          .setColor(0xFFFF00)
          .setTitle("📋 Playlist Yükleniyor...")
          .setDescription("Playlist videoları alınıyor, bu biraz zaman alabilir...")
          .setTimestamp()
        ] 
      });

      const playlistSongs = await getPlaylistVideos(query);
      
      if (playlistSongs.length === 0) {
        return interaction.editReply({
          embeds: [createErrorEmbed("❌ Playlist boş veya yüklenemedi!")],
        });
      }

      playlistSongs.forEach(s => s.requestedBy = interaction.user.username);

      let serverQueue = queue.get(interaction.guildId!);
      
      if (!serverQueue) {
        const queueContruct: ServerQueue = {
          textChannel: interaction.channel as TextChannel,
          voiceChannel: voiceChannel,
          connection: null as any,
          player: createAudioPlayer(),
          songs: [...playlistSongs],
          playing: true,
          autoplay: false,
          lastPlayedSong: undefined,
          playedHistory: new Set(playlistSongs.map(s => s.id).filter(Boolean) as string[]),
          loopMode: 'off',
        };

        queue.set(interaction.guildId!, queueContruct);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId!,
            adapterCreator: interaction.guild!.voiceAdapterCreator as any,
          });

          queueContruct.connection = connection;

          queueContruct.player.on(AudioPlayerStatus.Idle, async () => {
            const currentQueue = queue.get(interaction.guildId!);
            if (currentQueue) {
              if (currentQueue.songs.length > 0) {
                currentQueue.lastPlayedSong = currentQueue.songs[0];
              }

              if (currentQueue.loopMode === 'single' && currentQueue.lastPlayedSong) {
                play(interaction.guildId!, currentQueue.lastPlayedSong);
                return;
              }

              if (currentQueue.loopMode === 'queue' && currentQueue.songs.length > 0) {
                const finishedSong = currentQueue.songs.shift()!;
                currentQueue.songs.push(finishedSong);
                play(interaction.guildId!, currentQueue.songs[0]);
                return;
              }

              currentQueue.songs.shift();

              if (currentQueue.songs.length > 0) {
                play(interaction.guildId!, currentQueue.songs[0]);
              } else {
                resetIdleTimer(currentQueue, interaction.guildId!);
              }
            }
          });

          connection.subscribe(queueContruct.player);
          play(interaction.guildId!, queueContruct.songs[0]);

          const playlistEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle("📋 Playlist Yüklendi!")
            .setDescription(`**${playlistSongs.length}** şarkı sıraya eklendi!`)
            .addFields(
              { name: "▶️ İlk Şarkı", value: playlistSongs[0].title, inline: false }
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [playlistEmbed] });
        } catch (error) {
          console.error(error);
          queue.delete(interaction.guildId!);
          return interaction.editReply({
            embeds: [createErrorEmbed("❌ Ses kanalına bağlanılamadı!")],
          });
        }
      } else {
        serverQueue.songs.push(...playlistSongs);
        playlistSongs.forEach(s => { if (s.id) serverQueue!.playedHistory.add(s.id); });

        const playlistEmbed = new EmbedBuilder()
          .setColor(0xFFFF00)
          .setTitle("📋 Playlist Sıraya Eklendi!")
          .setDescription(`**${playlistSongs.length}** şarkı sıraya eklendi!`)
          .addFields(
            { name: "📊 Toplam Sıra", value: `${serverQueue.songs.length} şarkı`, inline: true }
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [playlistEmbed] });
      }
    } catch (error) {
      console.error("Playlist hatası:", error);
      return interaction.editReply({
        embeds: [createErrorEmbed("❌ Playlist yüklenirken hata oluştu!")],
      });
    }
  }

  const song = await searchSong(query, interaction.user.username);

  if (!song) {
    return interaction.editReply({
      embeds: [createErrorEmbed("❌ Şarkı bulunamadı!")],
    });
  }

  const serverQueue = queue.get(interaction.guildId!);

  if (!serverQueue) {
    const queueContruct: ServerQueue = {
      textChannel: interaction.channel as TextChannel,
      voiceChannel: voiceChannel,
      connection: null as any,
      player: createAudioPlayer(),
      songs: [],
      playing: true,
      autoplay: true,
      lastPlayedSong: undefined,
      playedHistory: new Set(),
      loopMode: 'off',
    };

    queue.set(interaction.guildId!, queueContruct);
    queueContruct.songs.push(song);
    if (song.id) queueContruct.playedHistory.add(song.id);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guildId!,
        adapterCreator: interaction.guild!.voiceAdapterCreator as any,
      });

      queueContruct.connection = connection;

      queueContruct.player.on(AudioPlayerStatus.Idle, async () => {
        const currentQueue = queue.get(interaction.guildId!);
        if (currentQueue) {
          if (currentQueue.songs.length > 0) {
            currentQueue.lastPlayedSong = currentQueue.songs[0];
          }

          if (currentQueue.loopMode === 'single' && currentQueue.lastPlayedSong) {
            play(interaction.guildId!, currentQueue.lastPlayedSong);
            return;
          }

          if (currentQueue.loopMode === 'queue' && currentQueue.songs.length > 0) {
            const finishedSong = currentQueue.songs.shift()!;
            currentQueue.songs.push(finishedSong);
            play(interaction.guildId!, currentQueue.songs[0]);
            return;
          }

          currentQueue.songs.shift();

          if (currentQueue.songs.length > 0) {
            play(interaction.guildId!, currentQueue.songs[0]);
          } else {
            if (currentQueue.autoplay && currentQueue.lastPlayedSong) {
              console.log(
                "\n🎧 " + getRandomPhrase(TANER_PERSONALITY.autoplay)
              );
              currentQueue.textChannel.send(
                "📻 **Radyo Modu:** Benzer şarkı aranıyor..."
              );

              const relatedSong = await getSmartRelatedSong(
                currentQueue.lastPlayedSong,
                currentQueue.playedHistory
              );

              if (relatedSong) {
                currentQueue.songs.push(relatedSong);
                if (relatedSong.id)
                  currentQueue.playedHistory.add(relatedSong.id);
                currentQueue.textChannel.send(
                  `📻 **Radyo:** Otomatik eklendi: **${relatedSong.title}**`
                );
                play(interaction.guildId!, relatedSong);
              } else {
                currentQueue.textChannel.send(
                  "⚠️ Uygun şarkı bulunamadı, radyo durdu."
                );
                resetIdleTimer(currentQueue, interaction.guildId!);
              }
            } else {
              resetIdleTimer(currentQueue, interaction.guildId!);
            }
          }
        }
      });

      connection.subscribe(queueContruct.player);

      play(interaction.guildId!, queueContruct.songs[0]);

      const playEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎵 Çalıyor")
        .setDescription(
          `**${song.title}**\n\n${getRandomPhrase(TANER_PERSONALITY.playing)}`
        )
        .setThumbnail(song.thumbnail || "")
        .addFields(
          {
            name: "⏱️ Süre",
            value: song.duration || "Bilinmiyor",
            inline: true,
          },
          {
            name: "👤 İsteyen",
            value: song.requestedBy || "Bilinmiyor",
            inline: true,
          },
          { name: "📻 Radyo", value: "Otomatik AÇIK 🔥", inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [playEmbed] });
    } catch (error) {
      console.error(error);
      queue.delete(interaction.guildId!);
      return interaction.editReply({
        embeds: [createErrorEmbed("❌ Ses kanalına bağlanılamadı!")],
      });
    }
  } else {
    serverQueue.songs.push(song);
    if (song.id) serverQueue.playedHistory.add(song.id);

    const queueEmbed = new EmbedBuilder()
      .setColor(0xffff00)
      .setTitle("📥 Sıraya Eklendi")
      .setDescription(`**${song.title}**`)
      .setThumbnail(song.thumbnail || "")
      .addFields(
        {
          name: "📊 Sıradaki Pozisyon",
          value: `${serverQueue.songs.length}`,
          inline: true,
        },
        {
          name: "👤 İsteyen",
          value: song.requestedBy || "Bilinmiyor",
          inline: true,
        }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [queueEmbed] });
  }
}

async function executePlay(message: Message, args: string[]) {
  if (!message.member || !message.member.voice.channel) {
    return message.reply("❌ Önce bir ses kanalına girmelisin!");
  }

  const voiceChannel = message.member.voice.channel;
  const query = args.slice(1).join(" ");

  if (!query) return message.reply("❌ Ne çalmamı istersin?");

  if (isPlaylistUrl(query)) {
    const loadingMsg = await message.reply("📋 Playlist yükleniyor...");
    
    try {
      const playlistSongs = await getPlaylistVideos(query);
      
      if (playlistSongs.length === 0) {
        return loadingMsg.edit("❌ Playlist boş veya yüklenemedi!");
      }

      playlistSongs.forEach(s => s.requestedBy = message.author.username);

      let serverQueue = queue.get(message.guild!.id);
      
      if (!serverQueue) {
        const queueContruct: ServerQueue = {
          textChannel: message.channel as TextChannel,
          voiceChannel: voiceChannel,
          connection: null as any,
          player: createAudioPlayer(),
          songs: [...playlistSongs],
          playing: true,
          autoplay: false,
          lastPlayedSong: undefined,
          playedHistory: new Set(playlistSongs.map(s => s.id).filter(Boolean) as string[]),
          loopMode: 'off',
        };

        queue.set(message.guild!.id, queueContruct);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild!.id,
            adapterCreator: message.guild!.voiceAdapterCreator as any,
          });

          queueContruct.connection = connection;

          queueContruct.player.on(AudioPlayerStatus.Idle, async () => {
            const currentQueue = queue.get(message.guild!.id);
            if (currentQueue) {
              if (currentQueue.songs.length > 0) {
                currentQueue.lastPlayedSong = currentQueue.songs[0];
              }

              if (currentQueue.loopMode === 'single' && currentQueue.lastPlayedSong) {
                play(message.guild!.id, currentQueue.lastPlayedSong);
                return;
              }

              if (currentQueue.loopMode === 'queue' && currentQueue.songs.length > 0) {
                const finishedSong = currentQueue.songs.shift()!;
                currentQueue.songs.push(finishedSong);
                play(message.guild!.id, currentQueue.songs[0]);
                return;
              }

              currentQueue.songs.shift();

              if (currentQueue.songs.length > 0) {
                play(message.guild!.id, currentQueue.songs[0]);
              } else {
                resetIdleTimer(currentQueue, message.guild!.id);
              }
            }
          });

          connection.subscribe(queueContruct.player);
          play(message.guild!.id, queueContruct.songs[0]);

          return loadingMsg.edit(`📋 **${playlistSongs.length}** şarkı sıraya eklendi! ▶️ İlk: **${playlistSongs[0].title}**`);
        } catch (error) {
          console.error(error);
          queue.delete(message.guild!.id);
          return loadingMsg.edit("❌ Ses kanalına katılamadım.");
        }
      } else {
        serverQueue.songs.push(...playlistSongs);
        playlistSongs.forEach(s => { if (s.id) serverQueue!.playedHistory.add(s.id); });
        return loadingMsg.edit(`📋 **${playlistSongs.length}** şarkı sıraya eklendi! Toplam: **${serverQueue.songs.length}** şarkı.`);
      }
    } catch (error) {
      console.error("Playlist hatası:", error);
      return loadingMsg.edit("❌ Playlist yüklenirken hata oluştu!");
    }
  }

  const serverQueue = queue.get(message.guild!.id);

  let song: Song;
  try {
    if (query.startsWith("http")) {
      const videoIdMatch = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
      const id = videoIdMatch ? videoIdMatch[1] : undefined;
      song = {
        title: "URL Şarkısı",
        url: query,
        id: id,
        requestedBy: message.author.username,
      };
    } else {
      const r = await yts(query);
      if (r.videos.length === 0) return message.reply("Sonuç bulunamadı.");
      const vid = r.videos[0];
      song = {
        title: vid.title,
        url: vid.url,
        id: vid.videoId,
        keywords: extractKeywords(vid.title),
        thumbnail: vid.thumbnail,
        duration: vid.timestamp,
        requestedBy: message.author.username,
      };
    }
  } catch (error) {
    console.error(error);
    return message.reply("Arama hatası.");
  }

  if (!serverQueue) {
    const queueContruct: ServerQueue = {
      textChannel: message.channel as TextChannel,
      voiceChannel: voiceChannel,
      connection: null as any,
      player: createAudioPlayer(),
      songs: [],
      playing: true,
      autoplay: true,
      lastPlayedSong: undefined,
      playedHistory: new Set(),
      loopMode: 'off',
    };

    queue.set(message.guild!.id, queueContruct);
    queueContruct.songs.push(song);
    if (song.id) queueContruct.playedHistory.add(song.id);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild!.id,
        adapterCreator: message.guild!.voiceAdapterCreator as any,
      });

      queueContruct.connection = connection;

      queueContruct.player.on(AudioPlayerStatus.Idle, async () => {
        const currentQueue = queue.get(message.guild!.id);
        if (currentQueue) {
          if (currentQueue.songs.length > 0) {
            currentQueue.lastPlayedSong = currentQueue.songs[0];
          }

          if (currentQueue.loopMode === 'single' && currentQueue.lastPlayedSong) {
            play(message.guild!.id, currentQueue.lastPlayedSong);
            return;
          }

          if (currentQueue.loopMode === 'queue' && currentQueue.songs.length > 0) {
            const finishedSong = currentQueue.songs.shift()!;
            currentQueue.songs.push(finishedSong);
            play(message.guild!.id, currentQueue.songs[0]);
            return;
          }

          currentQueue.songs.shift();

          if (currentQueue.songs.length > 0) {
            play(message.guild!.id, currentQueue.songs[0]);
          } else {
            if (currentQueue.autoplay && currentQueue.lastPlayedSong) {
              console.log("\n🎧 Radyo modu aktif, benzer şarkı aranıyor...");
              currentQueue.textChannel.send(
                "📻 **Radyo Modu:** Benzer şarkı aranıyor..."
              );

              const relatedSong = await getSmartRelatedSong(
                currentQueue.lastPlayedSong,
                currentQueue.playedHistory
              );

              if (relatedSong) {
                currentQueue.songs.push(relatedSong);
                if (relatedSong.id)
                  currentQueue.playedHistory.add(relatedSong.id);

                currentQueue.textChannel.send(
                  `📻 **Radyo:** Otomatik eklendi: **${relatedSong.title}**`
                );
                play(message.guild!.id, relatedSong);
              } else {
                currentQueue.textChannel.send(
                  "⚠️ Uygun şarkı bulunamadı, radyo durdu."
                );
                resetIdleTimer(currentQueue, message.guild!.id);
              }
            } else {
              resetIdleTimer(currentQueue, message.guild!.id);
            }
          }
        }
      });

      queueContruct.player.on("error", (error: any) => {
        console.error("Player Hatası:", error);
        const currentQueue = queue.get(message.guild!.id);
        if (currentQueue) {
          currentQueue.textChannel.send("⚠️ Hata oluştu, geçiliyor...");
          currentQueue.songs.shift();
          if (currentQueue.songs.length > 0)
            play(message.guild!.id, currentQueue.songs[0]);
        }
      });

      connection.subscribe(queueContruct.player);
      play(message.guild!.id, queueContruct.songs[0]);
    } catch (err) {
      console.error(err);
      queue.delete(message.guild!.id);
      return message.reply("Ses kanalına katılamadım.");
    }
  } else {
    serverQueue.songs.push(song);
    if (song.id) serverQueue.playedHistory.add(song.id);

    if (serverQueue.player.state.status === AudioPlayerStatus.Idle) {
      play(message.guild!.id, serverQueue.songs[0]);
      return message.reply(`▶️ **${song.title}** çalınmaya başlandı!`);
    }
    return message.reply(`✅ **${song.title}** sıraya eklendi!`);
  }
}

async function play(guildId: string, song: Song) {
  const serverQueue = queue.get(guildId);
  if (!serverQueue) return;
  if (!song) return;

  if (!song.id) {
    const match = song.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    if (match) {
      song.id = match[1];
      serverQueue.playedHistory.add(song.id);
    }
  }

  // 🎵 Now Playing mesajını gönder
  try {
    const nowPlayingEmbed = createNowPlayingEmbed(
      song,
      serverQueue.songs.length - 1
    );
    const buttons = createPlaybackButtons(false);

    const npMessage = await serverQueue.textChannel.send({
      embeds: [nowPlayingEmbed],
      components: [buttons],
    });

    serverQueue.nowPlayingMessage = npMessage;
  } catch (error) {
    console.error("Now playing mesaj hatası:", error);
  }

  try {
    // yt-dlp ile audio URL al (streaming yerine URL extraction)
    const ytDlpProcess = spawn("yt-dlp", [
      song.url,
      "-f",
      "bestaudio/best",
      "--no-playlist",
      "--geo-bypass",
      "--no-check-certificates",
      "--extractor-args",
      "youtube:player_client=android,ios",
      "--get-url",
      "--quiet",
    ]);

    let audioUrl = "";
    let errorOccurred = false;

    ytDlpProcess.stdout.on("data", (data) => {
      audioUrl += data.toString();
    });

    ytDlpProcess.stderr.on("data", (data) => {
      if (!errorOccurred) {
        console.error("yt-dlp stderr:", data.toString());
      }
    });

    ytDlpProcess.on("close", (code) => {
      if (code !== 0 || !audioUrl.trim()) {
        if (!errorOccurred) {
          errorOccurred = true;
          console.error("yt-dlp hatası, kod:", code);
          console.error("Şarkı URL:", song.url);
          serverQueue.textChannel.send({
            embeds: [
              createErrorEmbed(
                "❌ Şarkı çalınamadı! YouTube erişim sorunu olabilir."
              ),
            ],
          });
          if (serverQueue.songs.length > 0) {
            setTimeout(
              () => play(serverQueue.textChannel.guildId, serverQueue.songs[0]),
              1000
            );
          }
        }
        return;
      }

      // ffmpeg ile audio stream oluştur
      const ffmpegProcess = spawn(
        "ffmpeg",
        [
          "-reconnect",
          "1",
          "-reconnect_streamed",
          "1",
          "-reconnect_delay_max",
          "5",
          "-i",
          audioUrl.trim(),
          "-analyzeduration",
          "0",
          "-loglevel",
          "0",
          "-f",
          "s16le",
          "-ar",
          "48000",
          "-ac",
          "2",
          "pipe:1",
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      ffmpegProcess.on("error", (err) => {
        if (!errorOccurred) {
          errorOccurred = true;
          console.error("ffmpeg hatası:", err);
          serverQueue.textChannel.send({
            embeds: [createErrorEmbed("❌ Ses akışı başlatılamadı!")],
          });
          if (serverQueue.songs.length > 0) {
            setTimeout(
              () => play(serverQueue.textChannel.guildId, serverQueue.songs[0]),
              1000
            );
          }
        }
      });

      const resource = createAudioResource(ffmpegProcess.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });

      serverQueue.player.play(resource);
    });

    ytDlpProcess.on("error", (err) => {
      if (!errorOccurred) {
        errorOccurred = true;
        console.error("yt-dlp process hatası:", err);
        serverQueue.textChannel.send({
          embeds: [createErrorEmbed("❌ Şarkı çalınamadı!")],
        });
        if (serverQueue.songs.length > 0) {
          setTimeout(
            () => play(serverQueue.textChannel.guildId, serverQueue.songs[0]),
            1000
          );
        }
      }
    });
  } catch (error) {
    console.error("Stream oluşturma hatası:", error);
    serverQueue.textChannel.send({
      embeds: [createErrorEmbed("❌ Ses akışı başlatılamadı!")],
    });
    if (serverQueue.songs.length > 0) {
      setTimeout(
        () => play(serverQueue.textChannel.guildId, serverQueue.songs[0]),
        1000
      );
    }
  }
}

function toggleAutoplay(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue) return message.reply("Bot bir ses kanalında değil.");

  serverQueue.autoplay = !serverQueue.autoplay;
  const durum = serverQueue.autoplay ? "AÇIK" : "KAPALI";
  message.reply(`📻 Akıllı Radyo Modu **${durum}**!`);
}

function skip(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue) return message.reply("Sırada şarkı yok.");
  serverQueue.player.stop();
  message.reply("⏭️ Şarkı geçildi.");
}

function stop(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue) return message.reply("Zaten çalan bir şey yok.");
  serverQueue.songs = [];
  serverQueue.playedHistory.clear();
  serverQueue.autoplay = false;
  serverQueue.player.stop();
  serverQueue.connection.destroy();
  queue.delete(message.guild!.id);
  message.reply("🛑 Durduruldu.");
}

// 🎮 Slash Command Handlers
async function skipSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Sırada şarkı yok!")],
      ephemeral: true,
    });
  }

  serverQueue.player.stop();

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("⏭️ Şarkı Geçildi")
    .setDescription("Sıradaki şarkıya geçiliyor...")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function stopSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Zaten çalan bir şey yok!")],
      ephemeral: true,
    });
  }

  serverQueue.songs = [];
  serverQueue.playedHistory.clear();
  serverQueue.autoplay = false;
  serverQueue.player.stop();
  serverQueue.connection.destroy();
  queue.delete(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⏹️ Durduruldu")
    .setDescription("Müzik durduruldu! Görüşürüz rockçı! 🎸")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function pauseSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (
    !serverQueue ||
    serverQueue.player.state.status !== AudioPlayerStatus.Playing
  ) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Duraklatılacak bir şey yok!")],
      ephemeral: true,
    });
  }

  serverQueue.player.pause();
  serverQueue.playing = false;

  const embed = new EmbedBuilder()
    .setColor(0xffff00)
    .setTitle("⏸️ Duraklatıldı")
    .setDescription("Müzik duraklatıldı!")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function resumeSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (
    !serverQueue ||
    serverQueue.player.state.status !== AudioPlayerStatus.Paused
  ) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Devam ettirilecek bir şey yok!")],
      ephemeral: true,
    });
  }

  serverQueue.player.unpause();
  serverQueue.playing = true;

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("▶️ Devam Ediliyor")
    .setDescription("Müzik devam ediyor!")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function showQueueSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Sırada şarkı yok!")],
      ephemeral: true,
    });
  }

  const embed = createQueueEmbed(serverQueue.songs, serverQueue.autoplay);
  await interaction.reply({ embeds: [embed] });
}

async function toggleAutoplaySlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Bot bir ses kanalında değil!")],
      ephemeral: true,
    });
  }

  serverQueue.autoplay = !serverQueue.autoplay;

  const embed = new EmbedBuilder()
    .setColor(serverQueue.autoplay ? 0x00ff00 : 0xff0000)
    .setTitle(
      `📻 Akıllı Radyo: ${serverQueue.autoplay ? "AÇIK ✅" : "KAPALI ❌"}`
    )
    .setDescription(
      serverQueue.autoplay
        ? "🔥 Müzik asla durmayacak! Benzer şarkılar otomatik eklenecek!"
        : "⏸️ Akıllı radyo kapatıldı. Sadece sıradaki şarkılar çalacak."
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function showNowPlayingSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue || serverQueue.songs.length === 0) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Şu an çalan bir şarkı yok!")],
      ephemeral: true,
    });
  }

  const currentSong = serverQueue.songs[0];
  const embed = createNowPlayingEmbed(
    currentSong,
    serverQueue.songs.length - 1
  );
  const buttons = createPlaybackButtons(!serverQueue.playing);

  await interaction.reply({ embeds: [embed], components: [buttons] });
}

function pause(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (
    serverQueue &&
    serverQueue.player.state.status === AudioPlayerStatus.Playing
  ) {
    serverQueue.player.pause();
    message.reply("⏸️ Duraklatıldı.");
  }
}

function resume(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (
    serverQueue &&
    serverQueue.player.state.status === AudioPlayerStatus.Paused
  ) {
    serverQueue.player.unpause();
    message.reply("▶️ Devam ediliyor.");
  }
}

function showQueue(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue || serverQueue.songs.length === 0) {
    return message.reply("📭 Liste boş.");
  }
  let list = `📜 **Müzik Listesi (Radyo: ${
    serverQueue.autoplay ? "AÇIK" : "KAPALI"
  }):**\n`;
  serverQueue.songs.forEach((song, index) => {
    if (index < 10)
      list += `${index + 1}. ${song.title} ${index === 0 ? "(Çalıyor)" : ""}\n`;
  });
  message.reply(list);
}

client.login(process.env.DISCORD_TOKEN);

async function shuffleSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue || serverQueue.songs.length <= 2) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Karıştırılacak yeterli şarkı yok!")],
      ephemeral: true,
    });
  }

  const currentSong = serverQueue.songs.shift()!;
  for (let i = serverQueue.songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
  }
  serverQueue.songs.unshift(currentSong);

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle("🔀 Sıra Karıştırıldı!")
    .setDescription(`${serverQueue.songs.length - 1} şarkı karıştırıldı!`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function loopSlash(interaction: ChatInputCommandInteraction) {
  const serverQueue = queue.get(interaction.guildId!);
  if (!serverQueue) {
    return interaction.reply({
      embeds: [createErrorEmbed("❌ Bot bir ses kanalında değil!")],
      ephemeral: true,
    });
  }

  const modes: Array<'off' | 'single' | 'queue'> = ['off', 'single', 'queue'];
  const currentIndex = modes.indexOf(serverQueue.loopMode);
  serverQueue.loopMode = modes[(currentIndex + 1) % modes.length];

  const modeLabels = {
    'off': '❌ Kapalı',
    'single': '🔂 Tek Şarkı',
    'queue': '🔁 Tüm Sıra'
  };

  const embed = new EmbedBuilder()
    .setColor(serverQueue.loopMode === 'off' ? 0xFF0000 : 0x00FF00)
    .setTitle(`🔁 Yinele Modu: ${modeLabels[serverQueue.loopMode]}`)
    .setDescription(
      serverQueue.loopMode === 'off' 
        ? "Şarkılar normal sırayla çalacak."
        : serverQueue.loopMode === 'single'
        ? "Şu anki şarkı sürekli tekrarlanacak."
        : "Tüm sıra bitince baştan başlayacak."
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

function shuffleQueue(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue || serverQueue.songs.length <= 2) {
    return message.reply("❌ Karıştırılacak yeterli şarkı yok!");
  }

  const currentSong = serverQueue.songs.shift()!;
  for (let i = serverQueue.songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
  }
  serverQueue.songs.unshift(currentSong);
  message.reply(`🔀 ${serverQueue.songs.length - 1} şarkı karıştırıldı!`);
}

function toggleLoop(message: Message) {
  const serverQueue = queue.get(message.guild!.id);
  if (!serverQueue) {
    return message.reply("❌ Bot bir ses kanalında değil!");
  }

  const modes: Array<'off' | 'single' | 'queue'> = ['off', 'single', 'queue'];
  const currentIndex = modes.indexOf(serverQueue.loopMode);
  serverQueue.loopMode = modes[(currentIndex + 1) % modes.length];

  const modeLabels = {
    'off': '❌ Kapalı',
    'single': '🔂 Tek Şarkı',
    'queue': '🔁 Tüm Sıra'
  };
  message.reply(`🔁 Yinele Modu: **${modeLabels[serverQueue.loopMode]}**`);
}

function resetIdleTimer(serverQueue: ServerQueue, guildId: string) {
  if (serverQueue.idleTimer) {
    clearTimeout(serverQueue.idleTimer);
  }
  serverQueue.idleTimer = setTimeout(() => {
    const currentQueue = queue.get(guildId);
    if (currentQueue && currentQueue.player.state.status === AudioPlayerStatus.Idle) {
      console.log("⏰ 10 dakika idle - disconnect ediliyor...");
      currentQueue.textChannel.send("👋 10 dakika boyunca müzik çalınmadı, kanaldı terk ediyorum!");
      currentQueue.connection.destroy();
      queue.delete(guildId);
    }
  }, 10 * 60 * 1000);
}

async function getPlaylistVideos(playlistUrl: string): Promise<Song[]> {
  return new Promise((resolve, reject) => {
    const songs: Song[] = [];
    
    const ytDlpProcess = spawn("yt-dlp", [
      playlistUrl,
      "--flat-playlist",
      "--print", "%(id)s|||%(title)s|||%(duration)s",
      "--no-warnings",
      "--quiet"
    ]);

    let output = "";
    
    ytDlpProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    ytDlpProcess.stderr.on("data", (data) => {
      console.error("yt-dlp playlist stderr:", data.toString());
    });

    ytDlpProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      const lines = output.trim().split("\n").filter(line => line.includes("|||"));
      
      for (const line of lines) {
        const parts = line.split("|||");
        if (parts.length >= 2) {
          const [id, title, duration] = parts;
          songs.push({
            title: title || "Bilinmeyen Şarkı",
            url: `https://www.youtube.com/watch?v=${id}`,
            id: id,
            duration: duration ? formatDuration(parseInt(duration)) : undefined
          });
        }
      }
      
      resolve(songs);
    });

    ytDlpProcess.on("error", (err) => {
      reject(err);
    });
  });
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "Bilinmiyor";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isPlaylistUrl(url: string): boolean {
  return url.includes("list=") && url.includes("youtube.com");
}
