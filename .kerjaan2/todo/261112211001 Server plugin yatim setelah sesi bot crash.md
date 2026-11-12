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

- [ ] Setelah proses Claude sebuah bot dimatikan paksa, server plugin bot itu keluar sendiri dalam 10 detik (perbaikan di plugin).
- [ ] Sebagai jaring pengaman, launch.ts membersihkan server sisa bot itu saat bot dinyalakan lagi, hanya setelah cek start ganda lolos. Server sisa dikenali sebagai proses bun server.ts dari folder plugin repo ini yang TELEGRAM_STATE_DIR-nya sama persis dengan folder state bot itu. Proses yang environment-nya tidak terbaca tidak pernah dimatikan. Caranya SIGTERM, tunggu 2 detik, lalu SIGKILL. Setiap pembersihan menulis satu baris log berisi pid, tanpa mengubah laporan Telegram.
- [ ] Server plugin milik bot lain dan plugin lain di mesin (misalnya WhatsApp) tidak pernah ikut dimatikan.
- [ ] Penyebab server tidak keluar dicatat di CLAUDE.md, termasuk apakah ini bug di plugin atau di bun.
- [ ] Logika mengenali server sisa milik bot tertentu dibuktikan dengan tes otomatis.
- [ ] Mematikan sesi secara normal tetap bersih seperti sebelumnya.
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

## Assumptions
- A1 [unseen] Pembersihan diletakkan di launch.ts sehingga berlaku untuk master-bot dan scripts/start-bot.sh sekaligus
  Why: launch.ts adalah satu-satunya implementasi penyalaan (4706)
  If wrong: Pindahkan ke start-cli.ts atau bot.ts
- A2 [unseen] Uji dengan bot asli memakai token uji-01 dan BOT_SQUAD_HOME sementara; data di ~/.bot-squad tidak diubah
  Why: Arahan foreman: uji-01/uji-02 boleh polling asal tidak dua agen sekaligus; 261112214001 memakai uji-02
  If wrong: -
- A3 [unseen] Pencarian proses tidak memakai perintah khusus satu OS saja: macOS lewat ps -E, Linux lewat /proc
  Why: CLAUDE.md: jangan hardcode hal khusus macOS
  If wrong: -

## Decisions
- Lane strict: mematikan proses di mesin pemilik; salah kenali bisa mematikan bot lain atau plugin WhatsApp pemilik
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
