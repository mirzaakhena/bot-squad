---
type: task
priority: high
lane: standard
labels: []
blocked_by: [261112184701]
related: []
touches: [CLAUDE.md, scripts/start-bot.sh, plugin/package.json]
created: 2026-11-12 18:47
---

## Background

Banyak bot akan berjalan di satu mesin. Masing-masing bot harus membaca token dan daftar izinnya sendiri dari folder state miliknya. Plugin sebenarnya bisa diarahkan ke folder state yang berbeda lewat variabel lingkungan, tetapi ada catatan di kode plugin yang menyiratkan bahwa variabel lingkungan mungkin tidak diteruskan ke proses plugin. Kalau memang tidak diteruskan, semua bot akan membaca state bawaan yang sama.

Ada satu masalah lagi. Setiap kali plugin dinyalakan, ia memasang paket di folder plugin yang dipakai bersama semua bot. Kalau beberapa bot dinyalakan bersamaan, pemasangan paket itu bisa saling bertabrakan.

Dua token bot uji dari pemilik sudah tersedia. Token tidak boleh ditulis ke repo, tiket, log, atau commit.

- `uji-01`: token @mirza_001_bot ada di `~/.bot-squad/bots/uji-01/state/.env`. Token ini baru. Token lama di folder ini ternyata milik @mirza_master_bot dan sudah dipindah ke `~/.bot-squad/master/.env` sebagai `MASTER_BOT_TOKEN`. Jadi, sebelum mulai, pastikan tidak ada sesi tmux `uji-01` lama yang masih berjalan dengan token itu. Sesi seperti itu akan berebut poller dengan master-bot. `access.json` uji-01 dari spike 4701 sudah ada dan berisi pemilik saja.
- `uji-02`: token @mirza_002_bot ada di `~/.bot-squad/bots/uji-02/state/.env`. Workspace-nya sudah ada, tetapi `access.json` belum ada, dan `scripts/start-bot.sh` yang akan menulisnya.

Plugin sudah di-rebrand (tiket 4703). Namanya sekarang bot-squad dan channel-nya `plugin:bot-squad@inline`. `scripts/start-bot.sh` dan CLAUDE.md sudah memakai nama ini. Pesan stderr plugin, misalnya `bot-squad channel: polling as @<username>`, tidak masuk `--debug-file`. Untuk merekamnya, pakai shim bun di PATH (lihat lessons).

## Request

Buktikan bahwa dua bot bisa berjalan bersamaan di satu mesin dan benar-benar terpisah: masing-masing memakai token dan daftar izinnya sendiri, dan menyalakan keduanya sekaligus tidak membuat salah satunya gagal. Catat caranya.

## Done when

- [ ] CLAUDE.md mencatat apakah pengaturan folder state per bot benar-benar sampai ke plugin, dan cara yang dipakai kalau ternyata tidak sampai. Buktinya diambil dari dua bot: uji-01 polling sebagai @mirza_001_bot dan uji-02 sebagai @mirza_002_bot, masing-masing dengan bot.pid di folder state-nya sendiri.
- [ ] CLAUDE.md mencatat cara menangani pemasangan paket plugin supaya beberapa bot bisa dinyalakan bersamaan dengan aman. Sesuai jawaban Q3: scripts/start-bot.sh menjalankan bun install sekali dengan kunci sebelum tmux dibuka, dan kalau terbukti perlu, script start di plugin/package.json diubah menjadi 'bun server.ts'.
- [ ] `scripts/start-bot.sh uji-01` dan `scripts/start-bot.sh uji-02` dinyalakan pada saat yang hampir bersamaan, dan keduanya sampai ke kondisi siap.
- [ ] (owner) Pemilik mengirim pesan ke @mirza_001_bot dan @mirza_002_bot, dan masing-masing membalas dari sesinya sendiri tanpa pesan nyasar ke bot lain.
- [ ] Mematikan satu bot, dengan tmux kill-session lalu satu kali dengan kill -9 pada proses claude-nya, tidak mengganggu bot yang lain: sesi tmux, bot.pid, dan polling bot yang masih menyala tetap hidup.

## Out of scope

- Menulis kode master-bot.
- Mengganti nama plugin.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Token bot uji kedua belum ada (baru uji-01). Pilihan: (a) pemilik membuat bot uji kedua di BotFather dan menyimpan tokennya di ~/.bot-squad/bots/uji-02/state/.env (TELEGRAM_BOT_TOKEN=...), lalu tiket ini masuk antrean; (b) tiket tetap di backlog sampai token ada, dan 4706 ikut menunggu; (c) persempit tiket: tanpa token kedua, hanya uji tabrakan bun install. Rekomendasi (a), karena (c) tidak bisa membuktikan item 3-5 dan 4706 tetap butuh hasilnya.
  → (a) pemilik akan membuat bot uji kedua dan memberikan tokennya, disimpan di ~/.bot-squad/bots/uji-02/state/.env. Token BELUM diberikan, jadi 4702 tetap di backlog sampai token ada. (owner, 2026-11-12)
- Q2 [answered] Item 1 (folder state sampai ke plugin) praktis sudah terjawab spike 4701: start-bot.sh meneruskan TELEGRAM_STATE_DIR lewat tmux -e dan plugin membaca token uji-01 dari folder state-nya. Pilihan: (a) item 1 tetap, worker cukup membuktikannya ulang dengan dua bot dan mencatat buktinya; (b) hapus item 1. Rekomendasi (a): dengan dua bot, buktinya jauh lebih kuat (tiap bot polling sebagai @username-nya sendiri).
  → (a) item 1 tetap, dibuktikan ulang dengan dua bot. (owner, 2026-11-12)
- Q3 [answered] Seberapa jauh worker boleh memperbaiki tabrakan bun install di folder plugin bersama? Pilihan: (a) hanya mencatat di CLAUDE.md; (b) mengubah scripts/start-bot.sh supaya bun install dijalankan sekali dengan kunci sebelum tmux dibuka, dan kalau terbukti perlu, mengubah script start di plugin/package.json menjadi hanya 'bun server.ts'; (c) salinan plugin per bot. Rekomendasi (b): perbaikannya kecil dan langsung dipakai 4706. (c) memboroskan disk dan membuat rebrand/upgrade harus disalin ke setiap bot.
  → (b) install sekali dengan kunci, dan kalau terbukti perlu, script start diubah menjadi 'bun server.ts'. (owner, 2026-11-12)
- Q4 [answered] Item 5 'mematikan satu bot': caranya apa dan apa buktinya? Rekomendasi: tmux kill-session -t <nama>. Bukti: proses server plugin bot itu (bot.pid) ikut mati, sedangkan sesi tmux, bot.pid, dan polling bot yang lain tetap hidup (worker bisa mengeceknya lewat proses dan log debug, tanpa harus mengirim pesan). Alternatif: juga uji crash dengan kill -9 pada proses claude. Rekomendasi: cukup kill-session ditambah satu kill -9, karena di dunia nyata crash juga terjadi.
  → kill-session ditambah satu kill -9. (owner, 2026-11-12)

## Decisions
- Lane standard: spike, hanya catatan dan skrip start yang mudah dibatalkan
- Tidak blocked oleh tiket lain di board (4701 sudah done), tetapi tidak bisa jalan sebelum pemilik menyerahkan token bot uji kedua; tetap di backlog sampai token ada
- Token kedua tersedia (uji-02 @mirza_002_bot); tiket disesuaikan dengan nama plugin bot-squad dan token baru uji-01. Berjalan berdampingan dengan 4704 (review) dan 4705: tidak ada yang bergantung, hanya bersinggungan di CLAUDE.md
- 2026-11-12 moved to todo: Token bot uji kedua sudah diberikan pemilik; semua pertanyaan terjawab
