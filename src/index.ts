import { Client, GatewayIntentBits, Events, Message, TextChannel, VoiceBasedChannel } from 'discord.js';
import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    VoiceConnection,
    AudioPlayer
} from '@discordjs/voice';
import yts from 'yt-search';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_BASE_URL = 'http://ws.audioscrobbler.com/2.0/';

// --- TİP TANIMLAMALARI ---
interface Song {
    title: string;
    url: string;
    id?: string;
    keywords?: string[]; // Şarkının anahtar kelimeleri (genre, mood vb.)
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
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates 
    ]
});

const queue = new Map<string, ServerQueue>();

client.once(Events.ClientReady, c => {
    console.log(`✅ ${c.user.tag} göreve hazır!`);
    console.log('🎵 Akıllı Radyo Sistemi: Genre-Aware Autoplay v7.0');
    console.log('📡 YouTube Mix + Multi-Strategy Algorithm aktif');
    console.log('═══════════════════════════════════════════════════');
});

client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    if (command === '!play') {
        await executePlay(message, args);
        return;
    }
    if (command === '!skip') {
        skip(message);
        return;
    }
    if (command === '!stop') {
        stop(message);
        return;
    }
    if (command === '!pause') {
        pause(message);
        return;
    }
    if (command === '!resume') {
        resume(message);
        return;
    }
    if (command === '!queue') {
        showQueue(message);
        return;
    }
    if (command === '!autoplay') {
        toggleAutoplay(message);
        return;
    }
});

// --- YARDIMCI FONKSİYONLAR ---

/**
 * Şarkı başlığından artist ve song name ayırır
 */
function parseTitle(title: string): { artist: string; song: string; isLive: boolean; isRemix: boolean; isVersion: boolean } {
    const titleLower = title.toLowerCase();
    
    // Live, remix, cover gibi versionları tespit et
    const isLive = /\b(live|concert|tour|stage|performance)\b/i.test(title);
    const isRemix = /\b(remix|mix|mashup|cover|acoustic|instrumental)\b/i.test(title);
    const isVersion = /\b(remaster|version|edit|extended|radio|official)\b/i.test(title);
    
    // Temizlik: parantez içlerini ve fazladan kelimeleri sil
    let cleanTitle = title
        .replace(/[\(\[\{].*?[\)\]\}]/g, '') // Parantezleri temizle
        .replace(/\b(official|video|audio|lyrics|music|hq|hd|4k|music|video|mv|clip)\b/gi, '')
        .trim();
    
    let artist = '';
    let song = '';
    
    // Format 1: "Artist - Song" veya "Artist – Song" (em dash)
    const dashPattern = / [-–—] /; // hyphen, en dash, em dash
    if (dashPattern.test(cleanTitle)) {
        const parts = cleanTitle.split(dashPattern);
        artist = parts[0].trim();
        song = parts.slice(1).join(' - ').trim();
        
        // Şarkı adının başındaki dash karakterlerini temizle
        song = song.replace(/^[-–—]+\s*/, '').trim();
    }
    // Format 2: "Artist: Song"
    else if (cleanTitle.includes(': ')) {
        const parts = cleanTitle.split(': ');
        artist = parts[0].trim();
        song = parts.slice(1).join(': ').trim();
        
        // Şarkı adının başındaki dash karakterlerini temizle
        song = song.replace(/^[-–—]+\s*/, '').trim();
    }
    // Format 3: Sadece başlık var
    else {
        song = cleanTitle;
        // İlk kelimeyi artist olarak tahmin et (çok güvenilir değil)
        const words = cleanTitle.split(' ');
        if (words.length > 2) {
            artist = words[0];
            song = words.slice(1).join(' ');
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
        'rock', 'hard rock', 'heavy metal', 'metal', 'thrash metal', 'death metal',
        'punk', 'punk rock', 'indie rock', 'alternative rock', 'grunge',
        // Pop/Electronic
        'pop', 'electro pop', 'synth pop', 'electronic', 'edm', 'house', 'techno', 
        'trance', 'dubstep', 'drum and bass', 'dnb',
        // Hip Hop/R&B
        'hip hop', 'rap', 'trap', 'r&b', 'rnb', 'soul', 'funk',
        // Soft/Classic
        'ballad', 'slow', 'acoustic', 'classical', 'jazz', 'blues', 'country', 'folk',
        // Türkçe
        'türkü', 'halk müziği', 'sanat müziği', 'arabesk', 'fantezi', 'pop türkçe'
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
        keywords.push('music');
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
function filterMusicVideos(videos: any[], history: Set<string>, lastTitle: string): any[] {
    const lastParse = parseTitle(lastTitle);
    
    return videos.filter(video => {
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
            'tutorial', 'how to', 'guide', 'lesson', 'ders', 'öğren',
            'fonksiyon', 'function', 'programming', 'coding', 'javascript',
            'python', 'react', 'keywords', 'efficiently', 'combining',
            // Dizi ve film
            'episode', 'bölüm', 'sezon', 'fragman', 'trailer', 'teaser',
            'dizi müziği', 'film müziği', 'jenerik', 'soundtrack',
            // İstenmeyen içerik
            'reaction', 'reacts', 'tepki', 'gameplay', 'walkthrough',
            'review', 'inceleme', 'analysis', 'breakdown', 'explained',
            'compilation', 'full album', 'playlist', 'best of',
            // Podcast ve konuşma
            'podcast', 'interview', 'röportaj', 'talk', 'discussion'
        ];
        
        for (const spam of blacklist) {
            if (titleLower.includes(spam)) {
                console.log(`  ⏭️  Atlandı (spam: ${spam}): ${title}`);
                return false;
            }
        }
        
        // 5. Müzik göstergesi ZORUNLU (kısa videolar için)
        const musicIndicators = [
            'official', 'audio', 'lyrics', 'music', 'song', 'şarkı',
            'official video', 'lyric video', 'music video'
        ];
        
        if (duration < 180) { // 3 dakikadan kısa videolar için zorunlu
            const hasIndicator = musicIndicators.some(indicator => titleLower.includes(indicator));
            if (!hasIndicator) {
                console.log(`  ⏭️  Atlandı (müzik göstergesi yok): ${title}`);
                return false;
            }
        }
        
        // 6. Channel adı kontrolü (isteğe bağlı ama yardımcı)
        const channelName = video.author?.name?.toLowerCase() || '';
        const badChannels = ['gaming', 'tutorial', 'tech', 'coding', 'programming'];
        if (badChannels.some(bad => channelName.includes(bad))) {
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

async function getSimilarTracksFromLastFm(artist: string, track: string): Promise<LastFmTrack[]> {
    if (!LASTFM_API_KEY) {
        console.log('  ⚠️  Last.fm API key bulunamadı');
        return [];
    }
    
    try {
        console.log(`  🎸 Last.fm sorgusu: "${artist}" - "${track}"`);
        
        const response = await axios.get(LASTFM_BASE_URL, {
            params: {
                method: 'track.getsimilar',
                artist: artist,
                track: track,
                api_key: LASTFM_API_KEY,
                format: 'json',
                limit: 3
            },
            timeout: 5000
        });
        
        console.log(`  📡 Last.fm yanıt durumu: ${response.status}`);
        
        // Hata durumları kontrol et
        if (response.data?.error) {
            console.log(`  ❌ Last.fm API hatası: ${response.data.message} (kod: ${response.data.error})`);
            return [];
        }
        
        if (response.data?.similartracks?.track) {
            const tracks = Array.isArray(response.data.similartracks.track) 
                ? response.data.similartracks.track 
                : [response.data.similartracks.track];
            
            const validTracks = tracks.filter((t: any) => t.name && t.artist?.name);
            console.log(`  ✅ Last.fm'den ${validTracks.length} benzer şarkı bulundu`);
            
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
            console.log('  ⚠️  Last.fm\'den sonuç gelmedi (track bilgisi yok)');
            console.log(`  📄 Response: ${JSON.stringify(response.data).substring(0, 200)}`);
        }
        
        return [];
    } catch (error: any) {
        if (error.code === 'ECONNABORTED') {
            console.log('  ⚠️  Last.fm timeout (5s)');
        } else if (error.response) {
            console.log(`  ❌ Last.fm HTTP hatası: ${error.response.status} - ${error.response.statusText}`);
            console.log(`  📄 Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        } else if (error.request) {
            console.log('  ❌ Last.fm\'e ulaşılamadı (network hatası)');
        } else {
            console.log(`  ❌ Last.fm hatası: ${error.message}`);
        }
        return [];
    }
}

/**
 * Last.fm şarkılarını YouTube'da arar (EXACT SEARCH)
 */
async function searchLastFmTracksOnYoutube(tracks: LastFmTrack[], history: Set<string>): Promise<any[]> {
    const results: any[] = [];
    
    // İlk 10 benzer şarkıyı YouTube'da ara
    for (const track of tracks.slice(0, 10)) {
        try {
            // EXACT search: Artist + Track + "official" veya "audio"
            const queries = [
                `${track.artist.name} ${track.name} official`,
                `${track.artist.name} ${track.name} audio`,
                `${track.artist.name} ${track.name} music video`
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
            await new Promise(resolve => setTimeout(resolve, 100));
            
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
    const words1 = str1.split(/\s+/).filter(w => w.length > 2);
    const words2 = str2.split(/\s+/).filter(w => w.length > 2);
    if (words1.length === 0 || words2.length === 0) return 0;
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Artist bazlı benzer şarkı arar
 */
async function searchSimilarArtist(artist: string, genre: string, history: Set<string>): Promise<any[]> {
    if (!artist || artist.length < 2) return [];
    
    try {
        const queries = [
            `${artist} best songs`,
            `similar to ${artist}`,
            `${genre} like ${artist}`,
            `${artist} popular tracks`
        ];
        
        const query = queries[Math.floor(Math.random() * queries.length)];
        console.log(`  🔎 Arama: "${query}"`);
        
        const results = await yts(query);
        return results.videos.slice(0, 20);
    } catch (error) {
        console.error('Artist arama hatası:', error);
        return [];
    }
}

/**
 * Genre bazlı şarkı arar
 */
async function searchByGenre(genre: string, history: Set<string>): Promise<any[]> {
    try {
        const queries = [
            `best ${genre} songs`,
            `${genre} music playlist`,
            `top ${genre} tracks`,
            `popular ${genre}`
        ];
        
        const query = queries[Math.floor(Math.random() * queries.length)];
        console.log(`  🔎 Arama: "${query}"`);
        
        const results = await yts(query);
        return results.videos.slice(0, 25);
    } catch (error) {
        console.error('Genre arama hatası:', error);
        return [];
    }
}

// --- ANA AUTOPLAY ALGORİTMASI ---
async function getSmartRelatedSong(lastSong: Song, history: Set<string>): Promise<Song | null> {
    try {
        console.log(`\n🎵 Autoplay için analiz: "${lastSong.title}"`);
        
        // Başlığı parse et
        const parsed = parseTitle(lastSong.title);
        console.log(`  👤 Artist: "${parsed.artist}" | 🎵 Song: "${parsed.song}"`);
        console.log(`  🏷️  Versiyon: ${parsed.isLive ? 'Live' : ''}${parsed.isRemix ? 'Remix' : ''}${parsed.isVersion ? 'Version' : ''}`);
        
        // Genre'leri tespit et
        const keywords = extractKeywords(lastSong.title);
        const genre = keywords[0] || 'music';
        console.log(`  🎸 Genre: ${genre}`);
        
        let candidates: any[] = [];
        
        // ⭐ Strateji 1: Last.fm Similar Tracks (EN ÖNCELİKLİ)
        if (parsed.artist && parsed.song && parsed.artist.length > 2 && parsed.song.length > 2) {
            console.log(`\n📻 Strateji 1: Last.fm Similar Tracks...`);
            const similarTracks = await getSimilarTracksFromLastFm(parsed.artist, parsed.song);
            
            if (similarTracks.length > 0) {
                // Last.fm şarkılarını YouTube'da ara
                const youtubeResults = await searchLastFmTracksOnYoutube(similarTracks, history);
                if (youtubeResults.length > 0) {
                    candidates = [...candidates, ...youtubeResults];
                    console.log(`  ✨ Last.fm'den ${youtubeResults.length} şarkı bulundu - diğer stratejiler atlanıyor`);
                    // Last.fm başarılı, diğer stratejileri atlayabiliriz
                } else {
                    console.log(`  ⚠️  Last.fm şarkıları YouTube'da bulunamadı, diğer stratejilere geçiliyor...`);
                }
            }
        }
        
        // Strateji 2: Artist bazlı arama (SADECE Last.fm başarısız olduysa)
        if (candidates.length === 0 && parsed.artist && parsed.artist.length > 2) {
            console.log(`\n📻 Strateji 2: Artist bazlı arama (${parsed.artist})...`);
            const artistResults = await searchSimilarArtist(parsed.artist, genre, history);
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
            const fallbackQuery = 'popular music songs 2024';
            const results = await yts(fallbackQuery);
            candidates = [...candidates, ...results.videos.slice(0, 20)];
        }
        
        console.log(`  📦 Toplam aday: ${candidates.length}`);
        
        // Adayları FİLTRELE (ÇOK SIKI)
        const validCandidates = filterMusicVideos(candidates, history, lastSong.title);
        
        console.log(`  ✅ Geçerli aday: ${validCandidates.length}`);
        
        if (validCandidates.length === 0) {
            console.log('  ❌ Hiç uygun şarkı bulunamadı.');
            return null;
        }
        
        // Son şarkının sanatçısını al
        const lastArtist = parseTitle(lastSong.title).artist.toLowerCase();
        
        // Önce farklı sanatçıdan şarkı bulmaya çalış
        let selected;
        const differentArtistCandidates = validCandidates.filter(candidate => {
            const candidateArtist = parseTitle(candidate.title).artist.toLowerCase();
            return candidateArtist !== lastArtist && candidateArtist.length > 1;
        });
        
        if (differentArtistCandidates.length > 0) {
            // Farklı sanatçıdan seç (en iyi 5'ten)
            const topCandidates = differentArtistCandidates.slice(0, 5);
            selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
            console.log(`  🎭 Farklı sanatçı tercihi: ${parseTitle(selected.title).artist}`);
        } else {
            // Farklı sanatçı bulunamazsa normal seçim yap
            const topCandidates = validCandidates.slice(0, 5);
            selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
            console.log(`  ⚠️  Farklı sanatçı bulunamadı, rastgele seçim yapılıyor`);
        }
        
        console.log(`  🎯 Seçildi: "${selected.title}"`);
        console.log(`  ⏱️  Süre: ${selected.timestamp}`);
        
        return {
            title: selected.title,
            url: selected.url,
            id: selected.videoId,
            keywords: extractKeywords(selected.title)
        };
        
    } catch (error) {
        console.error('❌ Autoplay algoritma hatası:', error);
        return null;
    }
}

// --- CORE PLAY FUNCTION ---

async function executePlay(message: Message, args: string[]) {
    if (!message.member || !message.member.voice.channel) {
        return message.reply('❌ Önce bir ses kanalına girmelisin!');
    }

    const voiceChannel = message.member.voice.channel;
    const query = args.slice(1).join(' ');

    if (!query) return message.reply('❌ Ne çalmamı istersin?');

    const serverQueue = queue.get(message.guild!.id);

    let song: Song;
    try {
        if (query.startsWith('http')) {
            const videoIdMatch = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
            const id = videoIdMatch ? videoIdMatch[1] : undefined;
            song = { title: 'URL Şarkısı', url: query, id: id };
        } else {
            const r = await yts(query);
            if (r.videos.length === 0) return message.reply('Sonuç bulunamadı.');
            const vid = r.videos[0];
            song = { 
                title: vid.title, 
                url: vid.url, 
                id: vid.videoId,
                keywords: extractKeywords(vid.title)
            };
        }
    } catch (error) {
        console.error(error);
        return message.reply('Arama hatası.');
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
            playedHistory: new Set()
        };

        queue.set(message.guild!.id, queueContruct);
        queueContruct.songs.push(song);
        if (song.id) queueContruct.playedHistory.add(song.id);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild!.id,
                adapterCreator: message.guild!.voiceAdapterCreator,
            });

            queueContruct.connection = connection;

            queueContruct.player.on(AudioPlayerStatus.Idle, async () => {
                const currentQueue = queue.get(message.guild!.id);
                if (currentQueue) {
                    if (currentQueue.songs.length > 0) {
                        currentQueue.lastPlayedSong = currentQueue.songs[0];
                    }
                    
                    currentQueue.songs.shift();

                    if (currentQueue.songs.length > 0) {
                        play(message.guild!.id, currentQueue.songs[0]);
                    } else {
                        if (currentQueue.autoplay && currentQueue.lastPlayedSong) {
                            
                            const relatedSong = await getSmartRelatedSong(
                                currentQueue.lastPlayedSong, 
                                currentQueue.playedHistory
                            );
                            
                            if (relatedSong) {
                                currentQueue.songs.push(relatedSong);
                                if (relatedSong.id) currentQueue.playedHistory.add(relatedSong.id);
                                
                                currentQueue.textChannel.send(`📻 **Radyo:** Otomatik eklendi: **${relatedSong.title}**`);
                                play(message.guild!.id, relatedSong);
                            } else {
                                currentQueue.textChannel.send('⚠️ Uygun şarkı bulunamadı, radyo durdu.');
                            }
                        }
                    }
                }
            });

            queueContruct.player.on('error', (error: any) => {
                console.error('Player Hatası:', error);
                const currentQueue = queue.get(message.guild!.id);
                if (currentQueue) {
                    currentQueue.textChannel.send('⚠️ Hata oluştu, geçiliyor...');
                    currentQueue.songs.shift();
                    if (currentQueue.songs.length > 0) play(message.guild!.id, currentQueue.songs[0]);
                }
            });

            connection.subscribe(queueContruct.player);
            play(message.guild!.id, queueContruct.songs[0]);

        } catch (err) {
            console.error(err);
            queue.delete(message.guild!.id);
            return message.reply('Ses kanalına katılamadım.');
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

function play(guildId: string, song: Song) {
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

    const ytDlpProcess = spawn('./yt-dlp.exe', [
        song.url,
        '-o', '-',
        '-q',
        '-f', 'bestaudio',
        '--no-playlist',
        '--buffer-size', '16K'
    ]);

    ytDlpProcess.on('error', err => {
        console.error('yt-dlp hatası:', err);
        serverQueue.textChannel.send('Şarkı çalınamadı (Process Hatası).');
    });

    const resource = createAudioResource(ytDlpProcess.stdout);
    serverQueue.player.play(resource);
}

function toggleAutoplay(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (!serverQueue) return message.reply('Bot bir ses kanalında değil.');
    
    serverQueue.autoplay = !serverQueue.autoplay;
    const durum = serverQueue.autoplay ? 'AÇIK' : 'KAPALI';
    message.reply(`📻 Akıllı Radyo Modu **${durum}**!`);
}

function skip(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (!serverQueue) return message.reply('Sırada şarkı yok.');
    serverQueue.player.stop();
    message.reply('⏭️ Şarkı geçildi.');
}

function stop(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (!serverQueue) return message.reply('Zaten çalan bir şey yok.');
    serverQueue.songs = [];
    serverQueue.playedHistory.clear();
    serverQueue.autoplay = false;
    serverQueue.player.stop();
    serverQueue.connection.destroy();
    queue.delete(message.guild!.id);
    message.reply('🛑 Durduruldu.');
}

function pause(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (serverQueue && serverQueue.player.state.status === AudioPlayerStatus.Playing) {
        serverQueue.player.pause();
        message.reply('⏸️ Duraklatıldı.');
    }
}

function resume(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (serverQueue && serverQueue.player.state.status === AudioPlayerStatus.Paused) {
        serverQueue.player.unpause();
        message.reply('▶️ Devam ediliyor.');
    }
}

function showQueue(message: Message) {
    const serverQueue = queue.get(message.guild!.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return message.reply('📭 Liste boş.');
    }
    let list = `📜 **Müzik Listesi (Radyo: ${serverQueue.autoplay ? 'AÇIK' : 'KAPALI'}):**\n`;
    serverQueue.songs.forEach((song, index) => {
        if (index < 10) list += `${index + 1}. ${song.title} ${index === 0 ? '(Çalıyor)' : ''}\n`;
    });
    message.reply(list);
}

client.login(process.env.DISCORD_TOKEN);