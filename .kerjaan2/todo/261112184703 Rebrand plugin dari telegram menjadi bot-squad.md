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

- [ ] Claude Code menampilkan plugin ini dengan nama bot-squad, dan perintah skill-nya memakai awalan bot-squad, bukan telegram.
- [ ] Pesan yang ditulis plugin, termasuk pesan error dan instruksi untuk Claude, menyebut bot-squad, bukan plugin Telegram resmi.
- [ ] Plugin bot-squad bisa terpasang di mesin yang juga punya plugin Telegram resmi tanpa saling bentrok: nama plugin, nama server MCP, skill, dan folder state default berbeda. Ini dibuktikan dengan membaca manifest dan kode, tanpa memasang plugin resmi.
- [ ] Setelah rebrand, scripts/start-bot.sh uji-01 sampai ke kondisi siap. Log debug memuat 'Channel notifications registered' untuk plugin:bot-squad@inline, dan plugin polling sebagai @username uji-01.
- [ ] (owner) Pemilik mengirim pesan ke bot uji-01 setelah rebrand dan mendapat balasan dari Claude.
- [ ] Cara menyalakan bot yang tercatat di CLAUDE.md diperbarui ke nama baru.
- [ ] Concern di CLAUDE.md mencatat peringatan kuning "plugin:<id>@inline · plugin not installed" di layar awal sesi bot, padahal channel berfungsi penuh. Catatan itu juga menyebut apakah peringatan masih muncul setelah rebrand. Peringatan ini tidak harus hilang.
- [ ] Tanda atribusi lisensi upstream tetap ada.

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

## Decisions
- Lane standard: ganti nama di plugin, bisa dibatalkan lewat git, tetapi menyentuh server.ts dan cara start bot
- Tidak solo: rename terbatas di plugin/ plus start-bot.sh dan CLAUDE.md; 4704 hanya menyentuh master/ dan CLAUDE.md, 4702 hanya bersinggungan file (merge queue). Tidak menunggu apa pun; 4706 menunggu tiket ini
- 2026-11-12 moved to todo: Disetujui pemilik, semua pertanyaan terjawab
