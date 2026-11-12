---
type: bug
priority: high
lane: strict
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, master/src/launch.ts, master/test/launch.test.ts, CLAUDE.md]
created: 2026-11-12 21:10
---

## Background

Setiap bot adalah sesi Claude Code yang menjalankan server plugin bot-squad sebagai proses anak. Spike dua bot membuktikan bahwa kalau proses Claude sebuah bot mati mendadak (crash atau `kill -9`), server plugin-nya tidak ikut keluar. Server itu berhenti polling dan menghapus file pid-nya, tetapi prosesnya tetap hidup tanpa induk dan terus memakan CPU sekitar 99%. Karena file pid sudah hilang, master maupun skrip start tidak bisa menemukannya. Mematikan sesi secara normal (menutup sesi tmux) tidak menimbulkan masalah ini.

Teramati di macOS dengan Claude Code 2.1.322 dan bun 1.3.11. Detail dan cara membersihkannya secara manual ada di CLAUDE.md.

## How to reproduce

1. Nyalakan satu bot uji dengan skrip start.
2. Matikan paksa proses Claude bot itu (`kill -9`).
3. Lihat daftar proses: server plugin bot itu masih hidup tanpa induk dan memakan CPU sekitar 99%, padahal file pid-nya sudah tidak ada.

## Request

Sesi bot yang crash tidak boleh meninggalkan server plugin yang terus hidup dan memakan CPU. Cari penyebab server plugin tidak keluar dan perbaiki kalau bisa. Kalau tidak bisa, menyalakan bot yang sama berikutnya harus menemukan dan mematikan server sisa milik bot itu, dan hanya milik bot itu.

## Done when

- [x] Setelah proses Claude sebuah bot dimatikan paksa, server plugin bot itu keluar sendiri dalam 10 detik (perbaikan di plugin).
- [x] Sebagai jaring pengaman, launch.ts membersihkan server sisa bot itu saat bot dinyalakan lagi, hanya setelah cek start ganda lolos. Server sisa dikenali sebagai proses bun server.ts dari folder plugin repo ini yang TELEGRAM_STATE_DIR-nya sama persis dengan folder state bot itu. Proses yang environment-nya tidak terbaca tidak pernah dimatikan. Caranya SIGTERM, tunggu 2 detik, lalu SIGKILL. Setiap pembersihan menulis satu baris log berisi pid, tanpa mengubah laporan Telegram.
- [x] Server plugin milik bot lain dan plugin lain di mesin (misalnya WhatsApp) tidak pernah ikut dimatikan.
- [x] Penyebab server tidak keluar dicatat di CLAUDE.md, termasuk apakah ini bug di plugin atau di bun.
- [x] Logika mengenali server sisa milik bot tertentu dibuktikan dengan tes otomatis.
- [x] Mematikan sesi secara normal tetap bersih seperti sebelumnya.
- [ ] (owner) Pemilik menyalakan uji-01 dan uji-02, lalu menjalankan kill -9 pada proses claude uji-01. Dalam 10 detik ps tidak lagi menunjukkan server plugin uji-01, sementara uji-02 dan plugin WhatsApp tetap hidup. Setelah itu start uji-01 lagi berhasil.

## Out of scope

- Menghidupkan ulang bot secara otomatis setelah crash.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Perbaikan di plugin saja, pembersihan saat start saja, atau keduanya? Rekomendasi: keduanya. Plugin diperbaiki supaya keluar sendiri setelah induknya mati (kalau penyebabnya ketemu), dan launch.ts tetap membersihkan sisa sebelum menyalakan bot sebagai jaring pengaman, karena perbaikan plugin bisa gagal lagi di versi bun berikutnya.
  → Keduanya: perbaikan di plugin, ditambah pembersihan saat start sebagai jaring pengaman. (owner, 2026-11-12)
- Q2 [answered] Berapa lama 'dalam waktu singkat' untuk server plugin keluar setelah claude dimatikan paksa? Rekomendasi: paling lama 10 detik (watchdog plugin memeriksa tiap 5 detik, ditambah 2 detik paksa keluar).
  → Setuju, 10 detik. (owner, 2026-11-12)
- Q3 [answered] Cara mengenali server sisa milik satu bot. Rekomendasi: proses bun yang perintahnya menjalankan server.ts dari folder plugin repo ini DAN environment-nya berisi TELEGRAM_STATE_DIR yang sama persis dengan folder state bot itu (ps -E di macOS, /proc/<pid>/environ di Linux). Proses yang tidak bisa dibaca environment-nya tidak pernah dimatikan. Cara mematikan: SIGTERM, tunggu ~2 detik, lalu SIGKILL kalau masih hidup. Setuju?
  → Setuju: bun server.ts milik plugin repo ini dengan TELEGRAM_STATE_DIR yang sama persis; proses yang env-nya tak terbaca tidak pernah dimatikan; SIGTERM, tunggu 2 detik, lalu SIGKILL. (owner, 2026-11-12)
- Q4 [answered] Pembersihan hanya menyasar proses sisa (sesi tmux bot itu tidak ada dan bot.pid tidak hidup), atau juga server yang bot.pid-nya masih hidup tanpa sesi tmux? Rekomendasi: hanya saat cek start ganda sudah lolos (perilaku 'sudah berjalan' sekarang tidak diubah), supaya bot yang sedang berjalan tidak pernah dimatikan oleh start ulang.
  → Setuju: hanya setelah cek start ganda lolos. (owner, 2026-11-12)
- Q5 [answered] Apakah pembersihan dilaporkan? Rekomendasi: satu baris log (master-bot dan start-bot.sh) berisi pid yang dimatikan; laporan Telegram ke pemilik tidak diubah. Atau pemilik ingin laporan 'aktif' menyebut bahwa server sisa dibersihkan?
  → Log saja. (owner, 2026-11-12)
- Q6 [answered] Pengaman izin agen bisa menolak kill -9, bahkan pada proses yang dibuat agen sendiri, sehingga worker mungkin tidak bisa membuktikan 'tidak ada server tersisa setelah kill -9' dan 'server bot lain/WhatsApp tidak ikut mati' di mesin asli. Usul: tambah baris Done when '(owner) Pemilik menyalakan uji-01 dan uji-02, kill -9 proses claude uji-01, dan dalam 10 detik ps tidak menunjukkan server plugin uji-01, sementara uji-02 dan plugin WhatsApp tetap hidup; lalu start uji-01 lagi berhasil.' Worker tetap mencoba sendiri dulu dengan proses buatannya, dan logika pengenalan dibuktikan dengan tes otomatis memakai daftar proses tiruan. Setuju?
  → Setuju, tambahkan baris (owner) kill -9 seperti usulan. (owner, 2026-11-12)
- Q7 [answered] INSIDEN: saat menyiapkan rumah uji, worker tidak sengaja mengosongkan ~/.bot-squad/master/.env asli (sekarang 0 byte). Penyebabnya folder uji lama di scratchpad (ws-probe1/home) berisi symlink ke master/.env dan state uji-01 asli, dan worker menulis ke path itu tanpa memeriksanya. Tidak ada cadangan isi lama; token master-bot tidak pernah terbaca oleh worker. Pemilik perlu mengisi ulang MASTER_BOT_TOKEN (ambil lagi dari @BotFather) dan OWNER_TELEGRAM_ID di file itu sebelum menjalankan master-bot. Worker tidak menulis apa pun lagi ke file itu. State uji-01 asli tidak berubah.
  → Foreman: penyebab dipastikan (symlink ws-probe1/home dari sesi agen sebelumnya menunjuk ke data asli). File sudah dipulihkan, symlink dihapus. Ditutup. (owner, 2026-11-12)

## Assumptions
- A1 [confirmed] Pembersihan diletakkan di launch.ts sehingga berlaku untuk master-bot dan scripts/start-bot.sh sekaligus
  Why: launch.ts adalah satu-satunya implementasi penyalaan (4706)
  If wrong: Pindahkan ke start-cli.ts atau bot.ts
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Uji dengan bot asli memakai token uji-01 dan BOT_SQUAD_HOME sementara; data di ~/.bot-squad tidak diubah
  Why: Arahan foreman: uji-01/uji-02 boleh polling asal tidak dua agen sekaligus; 261112214001 memakai uji-02
  If wrong: -
  Confirmed by owner, 2026-11-12
- A3 [confirmed] Pencarian proses tidak memakai perintah khusus satu OS saja: macOS lewat ps -E, Linux lewat /proc
  Why: CLAUDE.md: jangan hardcode hal khusus macOS
  If wrong: -
  Confirmed by owner, 2026-11-12
- A4 [confirmed] Satu baris log ditulis per proses yang dimatikan, bukan satu baris per penyalaan
  Why: Done when menyebut setiap pembersihan menulis satu baris berisi pid; satu baris per pid memuat sinyal yang dipakai
  If wrong: Gabungkan baris di launch.ts menjadi satu daftar pid
  Confirmed by owner, 2026-11-12

## Decisions
- Lane strict: mematikan proses di mesin pemilik; salah kenali bisa mematikan bot lain atau plugin WhatsApp pemilik
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
- Red-proof: listener stderr di plugin; env tak terbaca; cek perintah bun server.ts (dua titik); TELEGRAM_STATE_DIR sama persis (hapus dan ganti awalan); CLAUDE_PLUGIN_ROOT; pid sendiri/pid 1; cek ulang sebelum SIGKILL; jeda 2 detik; pembersihan hanya setelah cek start ganda; argumen folder state; try/catch kegagalan; baris log; kabel asli realLaunchDeps (killStrays dan log), all red
- Server plugin dikenali lewat CLAUDE_PLUGIN_ROOT, bukan baris perintah atau cwd: plugin WhatsApp juga berjalan sebagai 'bun server.ts' dengan baris perintah yang sama persis, dan Claude Code memberi CLAUDE_PLUGIN_ROOT ke server plugin --plugin-dir (terlihat di proses uji-01)
- Perbaikan plugin hanya satu listener di process.stderr: listener stdout terpisah tidak bisa dibuktikan merah karena EPIPE stdout sudah berakhir di listener stderr lewat uncaughtException
- plugin/test/orphan.test.ts dilewati (dengan peringatan) kalau plugin/node_modules belum dipasang, supaya worktree lain yang hanya menjalankan bun install di root tidak ikut gagal

## Manual checks
- M1 [waiting] (item 7) 1. Pastikan ~/.bot-squad/master/.env terisi (lihat Q7).
  2. Jalankan scripts/start-bot.sh uji-01 lalu scripts/start-bot.sh uji-02.
  3. Cari pid claude uji-01: ps -axo pid,args | grep 'claude --setting-sources' lalu cocokkan dengan tmux list-panes -t '=uji-01' -F '#{pane_pid}'.
  4. kill -9 <pid claude uji-01>.
  5. Tunggu 10 detik, jalankan ps -axo pid,ppid,%cpu,args | grep 'bun server.ts': pid dari bots/uji-01/state/bot.pid tadi tidak ada, server uji-02 dan WhatsApp masih ada.
  6. scripts/start-bot.sh uji-01 lagi: keluar dengan 'siap'.

## Handoff
Server plugin yatim setelah kill -9 claude disebabkan loop EPIPE: handler uncaughtException plugin menulis ke stderr yang sudah putus, dan di bun 1.3.11 loop itu menghambat timer paksa keluar. plugin/server.ts kini memasang listener error di process.stderr yang memanggil shutdown(); variabel shuttingDown dipindah ke atas karena listener bisa jalan sebelum MCP tersambung. Jaring pengaman: master/src/strays.ts mengenali server sisa (bun server.ts, CLAUDE_PLUGIN_ROOT = plugin repo, TELEGRAM_STATE_DIR sama persis) dan launch.ts memanggil deps.killStrays setelah cek start ganda, lalu menulis log per pid. LaunchDeps kini wajib punya killStrays; log opsional lewat realLaunchDeps(dir, owner, log). Jangan longgarkan pengenalan: WhatsApp punya baris perintah yang sama.

## Review
- 2026-11-12 strict, round 1, at 3d27378: passed.
  1: orphan.test.ts (induk tiruan di-SIGKILL) hijau; listener stderr dilepas di salinan -> merah, server masih hidup setelah 10 detik. Uji dengan claude asli tidak diulang (baris owner 7).
  2: mutasi di salinan, semua merah: env null dianggap sisa, cek CLAUDE_PLUGIN_ROOT dihapus, state jadi startsWith, cek ulang sebelum SIGKILL dihapus, pembersihan sebelum cek start ganda. Folder state sama dengan env tmux (launch.ts:117/246).
  3: cek kering di mesin: lima proses WhatsApp tidak terpilih untuk uji-01/02/03; tes tiruan bot lain/awalan/WhatsApp merah saat cek dirusak. Tidak ada proses yang saya matikan.
  4: CLAUDE.md mencatat loop EPIPE dari handler uncaughtException (bug plugin), diperparah bun 1.3.11 yang menghambat timer.
  5: strays.test.ts (34 tes) dan tes sisa di launch.test.ts hijau, dan merah untuk mutasi di baris 2.
  6: skrip scratchpad: stdin server ditutup induk -> keluar kode 0 dalam 16 ms, bot.pid terhapus. Jalur SIGHUP tidak diubah.
  7: (owner) M1 bisa diikuti dari awal sampai hasil yang harus terlihat.
  note: jalur Linux (/proc) hanya dibaca. parseEnvTail bisa salah urai nilai berisi ' KEY=', tetapi arahnya tetap ke tidak mematikan. uji-03 asli (pid 9605) muncul selama review dan tidak disentuh. Tidak ada CI atau lint di repo.
- 2026-11-12 conflict resolution, at 9163bcb: passed.
  Konflik main.ts: kunci master-bot dari 261112211002 (acquireMasterLock sebelum panggilan Telegram, isi run() pindah ke serve()) tetap utuh, dan di serve() realLaunchDeps tetap menerima log dari tiket ini (log adalah parameter serve). Diff --cc tidak menunjukkan perubahan lain.
