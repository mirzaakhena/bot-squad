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

- [x] CLAUDE.md mencatat apakah pengaturan folder state per bot benar-benar sampai ke plugin, dan cara yang dipakai kalau ternyata tidak sampai. Buktinya diambil dari dua bot: uji-01 polling sebagai @mirza_001_bot dan uji-02 sebagai @mirza_002_bot, masing-masing dengan bot.pid di folder state-nya sendiri.
- [x] CLAUDE.md mencatat cara menangani pemasangan paket plugin supaya beberapa bot bisa dinyalakan bersamaan dengan aman. Sesuai jawaban Q3: scripts/start-bot.sh menjalankan bun install sekali dengan kunci sebelum tmux dibuka, dan kalau terbukti perlu, script start di plugin/package.json diubah menjadi 'bun server.ts'.
- [x] `scripts/start-bot.sh uji-01` dan `scripts/start-bot.sh uji-02` dinyalakan pada saat yang hampir bersamaan, dan keduanya sampai ke kondisi siap.
- [x] (owner) Pemilik mengirim pesan ke @mirza_001_bot dan @mirza_002_bot, dan masing-masing membalas dari sesinya sendiri tanpa pesan nyasar ke bot lain.
- [x] Mematikan satu bot, dengan tmux kill-session lalu satu kali dengan kill -9 pada proses claude-nya, tidak mengganggu bot yang lain: sesi tmux, bot.pid, dan polling bot yang masih menyala tetap hidup.

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
- Kunci install memakai mkdir atomik, bukan flock, karena flock tidak ada bawaan di macOS; kunci basi dideteksi lewat pid pemilik.

## Manual checks
- M1 [ok] (item 4) 1. Pastikan tidak ada sesi tmux uji-01 atau uji-02 (tmux ls).
  2. Dari root repo jalankan scripts/start-bot.sh uji-01 & scripts/start-bot.sh uji-02 & wait; keduanya mencetak 'siap'.
  3. Di Telegram kirim 'halo 1' ke @mirza_001_bot dan 'halo 2' ke @mirza_002_bot.
  4. Masing-masing bot membalas pesannya sendiri; tmux attach -t uji-01 hanya menampilkan 'halo 1', uji-02 hanya 'halo 2'.
  5. Matikan: tmux kill-session -t uji-01; tmux kill-session -t uji-02.
  Checked by owner, 2026-11-12

## Handoff
Plugin tidak lagi memasang paket sendiri: script start di plugin/package.json hanya 'bun server.ts'. scripts/start-bot.sh (langkah 3b) menjalankan bun install di plugin/ dengan kunci folder ~/.bot-squad/locks/plugin-install.lock sebelum tmux dibuka, karena bun install paralel di folder bersama terbukti gagal (EEXIST). Jangan kembalikan bun install ke script start; setiap jalur yang menyalakan plugin harus menjalankan install berkunci lebih dulu. TELEGRAM_STATE_DIR lewat tmux -e terbukti sampai ke server plugin. Perhatian: kill -9 pada claude meninggalkan bun server.ts yatim (~99% CPU, bot.pid sudah hilang); CLAUDE.md mencatat cara membersihkannya, penyebabnya di F1.

## Review
- 2026-11-12 standard, round 1, at ab60261: sent back.
  1: terbukti. ps eww tiap server.ts berisi TELEGRAM_STATE_DIR miliknya, bot.pid di folder state masing-masing, log shim 'polling as @mirza_001_bot'. uji-02 dibuktikan dengan getMe (@mirza_002_bot) dan probe getUpdates timeout=3: dapat 409 saat hidup, ok:true setelah dimatikan.
  2: terbukti. 6 bun install paralel x5 di salinan plugin gagal 4 2 0 2 2 (node_modules kosong) dan 1 0 0 1 1 (lengkap), dengan EEXIST. Kunci di start-bot.sh 3b dan catatannya ada. Jalur kunci basi dan batas 120s hanya dinilai dengan membaca.
  3: terbukti. Tanpa node_modules, start-bot.sh uji-01 dan uji-02 dijalankan paralel lewat k2 test: keduanya keluar 0 dengan pesan 'siap', tanpa 409.
  4: (owner) tidak memblokir. M1 bisa diikuti dari awal sampai hasil yang terlihat.
  5 GAGAL, buktinya salah. CLAUDE.md ('Mematikan satu bot...') dan klaim worker menyatakan kill -9 claude membuat server plugin bot itu ikut berhenti, dan Q4 menjadikan hal itu sebagai bukti. Diulang dua kali, sekali dengan shim dan sekali di server tmux terpisah tanpa shim: kill -9 <pid claude uji-02>, lalu ps -o pid,ppid,stat,%cpu,etime menunjukkan '36089 1 R 98.2 04:14' dan '37455 1 R 98.9 00:38'. Server menjadi yatim dengan CPU ~99%, padahal bot.pid sudah hilang dan polling sudah berhenti (probe ok:true). Sisi bot lain terbukti: setelah kill-session dan kill -9, tmux, bot.pid, dan polling uji-01 tetap hidup (probe 409, 'polling as' muncul lagi). Perbaikan: catat perilaku sebenarnya di CLAUDE.md (server yatim, ~100% CPU, tidak tertangkap cek langkah 1) beserta cara membersihkannya. Penyebabnya ada di follow-up F1.
  note: dengan shim CLAUDE.md, bun terbungkus dua kali, jadi tiap baris tercatat ganda dan baris uji-02 tidak tertangkap. Ada baiknya disebut di catatan shim. Tidak ada skrip cek lain selain bun test, yang sudah lulus.
- 2026-11-12 standard, round 2, at a407c9f: passed.
  1: dibawa dari ronde 1. scripts/ dan plugin/ tidak berubah sejak ab60261; hanya CLAUDE.md bagian kill -9 dan shim yang berubah.
  2: dibawa dari ronde 1, kodenya tidak berubah. Jalur kunci basi dan batas 120s hanya dinilai dengan membaca.
  3: dijalankan ulang. start-bot.sh uji-01 dan uji-02 paralel dari salinan HEAD lewat k2 test: keduanya keluar 0 dengan pesan 'siap'.
  4: (owner) tidak memblokir. M1 bisa diikuti dari awal sampai hasilnya.
  5: diulang. Setelah kill -9 claude uji-02, ps menunjukkan '41353 1 R 99.4' dan bot.pid hilang, sesuai CLAUDE.md baru. uji-01 tetap hidup (bot.pid ada, probe 409). SIGTERM tidak cukup, kill -9 mematikan, sesuai saran. Setelah kill-session uji-01, server 41341 keluar.
  note: catatan shim kini menjelaskan pencatatan ganda. Yatim 39360 dibiarkan atas permintaan foreman. Tidak ada skrip cek selain bun test.

## Follow-ups
- F1 [ticketed] Setelah kill -9 pada proses claude sebuah bot, server plugin 'bun server.ts' bot itu tidak keluar: shutdown() jalan (bot.pid dihapus, polling berhenti) tetapi process.exit tidak selesai, dan proses yatim (ppid 1, status R) memakan ~99% CPU terus. Teramati di macOS, Claude Code 2.1.322, bun 1.3.11, dengan dan tanpa shim bun; kill-session tidak memicunya. Karena bot.pid sudah hilang, cek stale pid di server.ts dan langkah 1 start-bot.sh tidak menemukannya. Perlu: cari penyebab hang exit (shutdown di plugin/server.ts, mungkin bug bun) dan/atau master/start-bot mematikan server.ts yatim yang ber-TELEGRAM_STATE_DIR bot itu.
  → 261112211001
