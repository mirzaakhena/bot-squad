---
type: task
priority: medium
lane: standard
labels: []
blocked_by: [261112184701]
related: []
touches: [plugin/.claude-plugin/plugin.json, plugin/.mcp.json, plugin/package.json, plugin/server.ts, plugin/skills, plugin/README.md, plugin/ACCESS.md, scripts/start-bot.sh, CLAUDE.md]
created: 2026-11-12 18:47
---

## Background

Plugin di repo ini adalah salinan plugin Telegram resmi dan masih memakai nama "telegram": nama plugin, nama server, perintah skill, dan teks yang ditampilkan semuanya masih bernama telegram. Kalau plugin resmi juga terpasang di mesin yang sama, keduanya akan bentrok dan membingungkan. Commit baseline sudah menyimpan versi aslinya, jadi semua perubahan fork bisa dilihat lewat diff.

## Request

Ganti identitas plugin menjadi "bot-squad" di semua tempat yang terlihat oleh Claude Code dan pengguna, tanpa mengubah perilakunya. Satu pengecualian yang disetujui pemilik: folder state default (kalau TELEGRAM_STATE_DIR tidak diisi) diganti dari ~/.claude/channels/telegram menjadi ~/.claude/channels/bot-squad. Nama variabel lingkungan TELEGRAM_* tetap, dan kata "Telegram" yang menunjuk platform juga tetap.

## Done when

- [x] Claude Code menampilkan plugin ini dengan nama bot-squad, dan perintah skill-nya memakai awalan bot-squad, bukan telegram.
- [x] Pesan yang ditulis plugin, termasuk pesan error dan instruksi untuk Claude, menyebut bot-squad, bukan plugin Telegram resmi.
- [x] Plugin bot-squad bisa terpasang di mesin yang juga punya plugin Telegram resmi tanpa saling bentrok: nama plugin, nama server MCP, skill, dan folder state default berbeda. Ini dibuktikan dengan membaca manifest dan kode, tanpa memasang plugin resmi.
- [x] Setelah rebrand, scripts/start-bot.sh uji-01 sampai ke kondisi siap. Log debug memuat 'Channel notifications registered' untuk plugin:bot-squad@inline, dan plugin polling sebagai @username uji-01.
- [ ] (owner) Pemilik mengirim pesan ke bot uji-01 setelah rebrand dan mendapat balasan dari Claude.
- [x] Cara menyalakan bot yang tercatat di CLAUDE.md diperbarui ke nama baru.
- [x] Concern di CLAUDE.md mencatat peringatan kuning "plugin:<id>@inline · plugin not installed" di layar awal sesi bot, padahal channel berfungsi penuh. Catatan itu juga menyebut apakah peringatan masih muncul setelah rebrand. Peringatan ini tidak harus hilang.
- [x] Tanda atribusi lisensi upstream tetap ada.

## Out of scope

- Mengubah perilaku plugin, misalnya alur pairing atau cara izin dibaca.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Cek manual M1/M2 tiket 4701 (bot uji membalas pemilik, akun lain diabaikan) belum dijalankan. Penulisan trust ke ~/.claude.json juga baru terbukti lewat M1. Pilihan: (a) pemilik menjalankan M1/M2 dulu, dan antrean diberi jeda sebelum tiket pertama; (b) antrean langsung jalan, M1/M2 dikerjakan kapan saja sebelum 4706. Rekomendasi (a): tiket ini (item 4) dan 4702 dibangun di atas cara start dari spike, jadi kalau M1 gagal, masalahnya lebih murah ditemukan sekarang.
  → tidak perlu jeda lagi. M1 sudah dijalankan pemilik dan LULUS (bot uji-01 membalas pesan pemilik di Telegram, dan trust tertulis ke ~/.claude.json). M2 ditunda karena pemilik tidak punya akun Telegram kedua. M2 tidak menahan antrean. (owner, 2026-11-12)
- Q2 [answered] Item 4 ('bot uji tetap bisa menerima dan membalas pesan') tidak bisa dicek worker, karena worker tidak bisa mengirim pesan Telegram sebagai pemilik. Pilihan: (a) beri tanda (owner) saja; (b) pecah jadi dua: worker membuktikan bahwa start-bot.sh uji-01 sampai siap, log debug memuat 'Channel notifications registered' dan plugin polling sebagai @username uji-01; lalu (owner) pemilik mengirim pesan dan mendapat balasan. Rekomendasi (b), supaya ada bukti otomatis sebelum pemilik mencoba.
  → (b) bukti otomatis ditambah satu baris (owner). (owner, 2026-11-12)
- Q3 [answered] Nama persis yang dipakai? Rekomendasi: nama plugin 'bot-squad' (id channel jadi plugin:bot-squad@inline), nama server MCP 'bot-squad', skill /bot-squad:access dan /bot-squad:configure, nama paket npm 'bot-squad-channel', versi tetap 0.0.7. Pilihan lain: nama server MCP tetap 'telegram' supaya tag channel tetap source="telegram". Rekomendasi tetap 'bot-squad' di semua tempat supaya tidak ada yang tertukar dengan plugin resmi.
  → bot-squad di semua tempat (plugin, server MCP, skill /bot-squad:*, plugin:bot-squad@inline, paket bot-squad-channel, versi 0.0.7). (owner, 2026-11-12)
- Q4 [answered] Nama variabel lingkungan TELEGRAM_STATE_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_ACCESS_MODE: tetap atau diganti BOT_SQUAD_*? Rekomendasi: tetap. Nama ini dipakai start-bot.sh, CLAUDE.md, dan nanti master, dan 'Telegram' di sini adalah nama platform, bukan identitas plugin. Konsekuensinya: kalau plugin resmi dan bot-squad dimuat di sesi yang sama, keduanya membaca token yang sama. Itu tidak terjadi di bot, karena --setting-sources project,local tidak memuat plugin user.
  → TELEGRAM_* tetap. (owner, 2026-11-12)
- Q5 [answered] Item 3 'tanpa saling bentrok': artinya apa dan cara mengeceknya? Rekomendasi: kedua plugin terpasang di mesin yang sama dan dipakai di sesi yang berbeda. Nama plugin, nama server MCP, skill, dan folder state default harus berbeda. Worker membuktikannya dengan membaca manifest dan kode, tanpa memasang plugin resmi ke konfigurasi pemilik. Alternatif: keduanya dimuat di satu sesi uji. Ini butuh nama variabel lingkungan yang berbeda (lihat pertanyaan sebelumnya) dan berisiko menyentuh token asli pemilik.
  → dibuktikan dengan membaca manifest dan kode, tanpa memasang plugin resmi. (owner, 2026-11-12)
- Q6 [answered] Folder state default plugin adalah ~/.claude/channels/telegram, sama dengan plugin resmi. Kalau TELEGRAM_STATE_DIR tidak diisi, keduanya memakai token dan bot.pid yang sama, dan plugin bisa mematikan server plugin yang lain lewat bot.pid. Pilihan: (a) ganti default menjadi ~/.claude/channels/bot-squad; (b) biarkan, karena bot selalu memakai TELEGRAM_STATE_DIR. Rekomendasi (a): ini satu-satunya bentrok nyata, perubahannya satu baris, dan mudah dibatalkan, walaupun secara teknis mengubah perilaku.
  → (a) default diganti ke ~/.claude/channels/bot-squad. (owner, 2026-11-12)
- Q7 [answered] Kata 'Telegram' yang menunjuk platform, misalnya 'Messages from Telegram arrive...' atau teks bantuan pairing: tetap atau diganti? Rekomendasi: tetap. Yang diganti hanya rujukan ke identitas plugin: nama plugin, server, skill /telegram:*, awalan log 'telegram channel:', serta README dan ACCESS.md di plugin/.
  → kata 'Telegram' sebagai platform tetap. (owner, 2026-11-12)
- Q8 [answered] Atribusi lisensi (Apache-2.0): cukup LICENSE dibiarkan apa adanya, atau ditambah catatan fork? Rekomendasi: LICENSE tidak diubah, lalu README plugin diberi catatan bahwa plugin ini fork dari anthropics/claude-plugins-official external_plugins/telegram v0.0.7 (e0ab6e5) dan sudah diubah. Pasal 4(b) Apache meminta perubahan dinyatakan.
  → LICENSE tidak diubah, ditambah catatan fork di README. (owner, 2026-11-12)
- Q9 [answered] Token di ~/.bot-squad/bots/uji-01/state/.env ternyata milik @mirza_master_bot (dari pesan 'polling as' plugin). Kalau nanti master-bot memakai token yang sama, keduanya akan berebut getUpdates (409). Apakah ini disengaja untuk uji, dan apakah uji-01 perlu token bot sendiri sebelum 4704/4706? Rekomendasi: buat bot uji terpisah di BotFather untuk uji-01.
  → Pemilik: token lama (@mirza_master_bot) dipindah ke master-bot sebagai MASTER_BOT_TOKEN; uji-01 diganti token bot uji baru (@mirza_001_bot). Sudah dijalankan foreman. (owner, 2026-11-12)

## Assumptions
- A1 [unseen] Instruksi MCP untuk Claude menyebut tag pesan masuk sebagai <channel source="bot-squad" ...>, mengikuti nama server MCP baru
  Why: Upstream menulis source sama dengan nama servernya (telegram); setelah server bernama bot-squad, tag mengikuti nama server. Belum dilihat langsung karena butuh pesan masuk
  If wrong: Kalau tag yang tampil tetap source="telegram" atau bentuk lain, ganti teks itu di instruksi server.ts (satu baris)
- A2 [unseen] Versi paket di package.json tetap 0.0.1 seperti upstream; versi 0.0.7 hanya di plugin.json
  Why: Q3 menyebut versi tetap 0.0.7, yaitu versi plugin; versi paket npm upstream memang 0.0.1 dan tidak dipakai di mana pun
  If wrong: Ubah version di plugin/package.json menjadi 0.0.7

## Decisions
- Lane standard: ganti nama di plugin, bisa dibatalkan lewat git, tetapi menyentuh server.ts dan cara start bot
- Tidak solo: rename terbatas di plugin/ plus start-bot.sh dan CLAUDE.md; 4704 hanya menyentuh master/ dan CLAUDE.md, 4702 hanya bersinggungan file (merge queue). Tidak menunggu apa pun; 4706 menunggu tiket ini
- 2026-11-12 moved to todo: Disetujui pemilik, semua pertanyaan terjawab

## Manual checks
- M1 [waiting] (item 5) 1. Setelah tiket ini masuk main, di repo jalankan scripts/start-bot.sh uji-01 (pastikan belum ada sesi uji-01 yang hidup).
  2. Tunggu sampai muncul start-bot: 'uji-01' siap.
  3. Dari akun Telegram pemilik, kirim pesan ke bot yang tokennya ada di state uji-01 (saat ini @mirza_master_bot).
  4. Harus muncul balasan dari Claude di chat itu.
  5. Matikan dengan tmux kill-session -t uji-01.

## Handoff
Plugin di plugin/ sekarang beridentitas bot-squad: nama plugin dan server MCP bot-squad (id channel plugin:bot-squad@inline, server plugin:bot-squad:bot-squad), skill /bot-squad:access dan /bot-squad:configure, paket bot-squad-channel, awalan log 'bot-squad channel:', dan default state ~/.claude/channels/bot-squad. Variabel TELEGRAM_* dan kata Telegram sebagai platform sengaja tetap. scripts/start-bot.sh dan CLAUDE.md memakai plugin:bot-squad@inline. Yang tidak boleh rusak: master (4704/4706) harus menyalakan bot dengan plugin:bot-squad@inline, bukan telegram; LICENSE tetap dan catatan fork di README plugin harus dipertahankan. Perilaku plugin tidak diubah selain folder state default.

## Review
- 2026-11-12 standard, round 1, at ec3b679: passed.
  1: sesi uji-01 (start-bot.sh + --debug-file): log 'Loaded inline plugin from path: bot-squad'; mengetik /bot-squad di tmux menampilkan /bot-squad:access dan /bot-squad:configure berlabel (bot-squad); /telegram: tidak menampilkan perintah berawalan telegram.
  2: bun server.ts tanpa token (HOME palsu): 'bot-squad channel: TELEGRAM_BOT_TOKEN required ... channels/bot-squad/.env'; stderr sesi nyata 'bot-squad channel: polling as'; grep tanpa sisa 'telegram channel' atau '/telegram:' di plugin/. Telegram sebagai platform tetap (Q7).
  3: dibandingkan dengan upstream ../claude-official-telegram-channel: plugin.json, .mcp.json, nama Server MCP (log serverVersion bot-squad), skill /bot-squad:*, paket bot-squad-channel, default channels/bot-squad (dibuktikan lewat HOME palsu) semuanya berbeda.
  4: k2 test start-bot.sh uji-01: siap; debug log 'MCP server "plugin:bot-squad:bot-squad": Channel notifications registered'; stderr via shim bun: 'bot-squad channel: polling as @mirza_001_bot' (token uji-01 kini, sesuai foreman), tanpa 409. Sesi dimatikan.
  5: (owner) tidak memblokir; M1 bisa diikuti dari awal. Langkah 3 M1 masih menulis '(saat ini @mirza_master_bot)', padahal token uji-01 kini milik @mirza_001_bot.
  6: CLAUDE.md (Menyalakan satu bot, fakta --channels, alternatif server:/marketplace) memakai plugin:bot-squad@inline dan plugin:bot-squad:bot-squad; start-bot.sh sama dan terbukti jalan di butir 4.
  7: concern 7 mencatat peringatan dan bahwa ia masih muncul; start-bot.sh di worktree tanpa debug menampilkan 'plugin:bot-squad@inline · plugin not installed'.
  8: cmp plugin/LICENSE dengan LICENSE upstream: identik; README plugin memuat catatan fork (v0.0.7, e0ab6e5, Apache-2.0, daftar perubahan).
  note: tidak ada AGENTS.md dan tidak ada skrip cek selain bun test (tanpa tes). Q9 masih open walau token sudah ditukar pemilik.
