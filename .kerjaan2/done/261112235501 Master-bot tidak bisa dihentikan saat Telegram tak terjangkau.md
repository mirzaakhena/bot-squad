---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [master/src/main.ts, master/src/menu.ts, master/test/, CLAUDE.md]
created: 2026-11-12 23:55
---

## Background

Ditemukan worker tiket 261112223101 (2026-11-12): kalau Telegram tidak terjangkau saat master-bot menyala, pustaka Telegram terus mencoba terhubung, dan selama itu master-bot tidak bereaksi pada Ctrl+C maupun SIGTERM. Hanya kill -9 yang bisa menghentikannya. Di server, master-bot jadi sulit dimatikan atau di-restart justru saat jaringan bermasalah. Kunci "master-bot sudah berjalan" (261112211002) juga tidak dilepas kalau dihentikan dengan kill -9, walaupun kunci basi seharusnya bisa diambil alih.

## How to reproduce

1. Buat Telegram tidak terjangkau (mis. jaringan diputus, atau diarahkan ke alamat yang tidak menjawab).
2. Jalankan master-bot.
3. Tekan Ctrl+C: master-bot tidak berhenti.

## Request

Master-bot selalu bisa dihentikan dengan Ctrl+C atau SIGTERM dalam waktu singkat, termasuk saat Telegram tidak terjangkau ketika master baru menyala maupun saat Telegram putus di tengah jalan (jawaban pemilik Q1).

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Saat Telegram tidak terjangkau sejak master-bot menyala, Ctrl+C atau SIGTERM menghentikan master-bot paling lama 5 detik, dengan pesan yang menjelaskan bahwa Telegram belum terjangkau.
- [x] Saat Telegram putus setelah master-bot sempat berjalan (polling sudah jalan), Ctrl+C atau SIGTERM juga menghentikan master-bot paling lama 5 detik; panggilan Telegram terakhir saat berhenti tidak boleh menahannya.
- [x] Kunci "master-bot sudah berjalan" dilepas saat berhenti dengan kedua cara ini.
- [x] Token tidak muncul di keluaran mana pun.
- [x] Dibuktikan dengan tes otomatis memakai proses master sungguhan, tanpa token asli dan tanpa menghubungi Telegram sungguhan.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Cakupan: Done when hanya menyebut 'Telegram tidak terjangkau sejak menyala' (bot.init dan sinkron menu). Saat Telegram putus di tengah jalan, bot.stop() juga memanggil getUpdates sekali lagi yang bisa menggantung. Opsi A (rekomendasi): ikut ditangani; tambah baris Done when 'Saat Telegram putus setelah master-bot sempat berjalan, Ctrl+C/SIGTERM juga menghentikannya paling lama 5 detik', karena mekanismenya sama dan masalahnya sama sulitnya di server. Opsi B: hanya saat menyala, putus di tengah jadi tiket terpisah. Opsi C: hanya saat menyala, tanpa tiket lanjutan.
  → Termasuk putus di tengah (Recommended): juga tangani Telegram yang putus setelah master-bot berjalan, batas sama keluar dalam 5 detik. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Berhenti karena Ctrl+C/SIGTERM saat Telegram belum terjangkau keluar dengan kode 0, sama dengan jalur 'signal aborted' yang sudah ada di main.ts
  Why: Berhenti diminta pemilik, bukan kegagalan; konsisten dengan kode sekarang
  If wrong: Ubah ke kode 1
- A2 [unseen] Tes mencakup dua bentuk 'tak terjangkau': koneksi ditolak (port tertutup) dan koneksi yang diterima tetapi tidak pernah dijawab; Telegram tiruan lewat MASTER_BOT_API_ROOT plus HTTPS_PROXY=http://127.0.0.1:9
  Why: Pelajaran: proxy harus memutus koneksi, dan koneksi menggantung adalah kasus terburuk (batas client 500 detik)
  If wrong: Uji satu bentuk saja
- A3 [unseen] Kunci setelah kill -9 tidak diubah: pengambilalihan kunci basi (pid mati) sudah ada sejak 261112211002; tiket ini hanya memastikan kunci dilepas saat berhenti normal di jalur ini
  Why: Done when hanya meminta pelepasan saat berhenti dengan Ctrl+C/SIGTERM
  If wrong: Tambah tes pengambilalihan setelah kill -9

## Decisions
- Lane standard: alur berhenti master-bot, tidak menyentuh data atau token, mudah dibatalkan
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berjalan berdampingan dengan 261112230302
- 2026-11-13 moved to todo: Pemilik menjawab Q1 (termasuk putus di tengah); tidak ada pertanyaan tersisa
- Pemutus dipasang sebagai transformer API, bukan signal per panggilan, karena getUpdates terakhir di bot.stop() grammY tidak menerima signal; satu mekanisme menutup semua panggilan.

## Handoff
master/src/cutoff.ts memasang transformer di bot.api yang menambahkan signal pemutus ke setiap panggilan Telegram dan mencatat kegagalan jaringan terakhir serta panggilan yang masih menunggu. main.ts: bot.init dan syncCommandMenu menerima signal; saat berhenti sebelum polling, pemutus langsung aktif dan master keluar kode 0 dengan pesan 'dihentikan sebelum Telegram terjangkau (tahap: ...)'. Setelah polling, getUpdates konfirmasi bot.stop() diberi STOP_GRACE_MS (2 detik) lalu diputus, bot.start tidak ditunggu lebih lama, penyalaan ditunggu bersamaan (3 detik). Jangan menambah panggilan Telegram yang tidak lewat bot.api atau yang menunggu tanpa batas di jalur berhenti; total harus tetap di bawah 5 detik.

## Review
- 2026-11-13 standard, round 1, at 67e814e: passed.
  1: k2 test -- bun test master/test/unreachable.test.ts lulus 9/9; tes SIGINT/SIGTERM dengan port ditolak dan port diam (getMe) serta menu menggantung memeriksa kode 0, < 5 detik, pesan 'dihentikan sebelum Telegram terjangkau (tahap: ...)'. Tes yang sama terhadap kode main gagal (SIGTERM ditolak/diam/menu).
  2: tes 'Telegram putus setelah polling berjalan' (semua panggilan menggantung, server hilang) lulus; varian menggantung gagal di kode main (8,6 detik), dan tes memastikan getUpdates limit=1 dari bot.stop() memang dikirim lalu diputus.
  3: expectCleanExit di kesembilan tes memeriksa master.pid tidak ada setelah keluar, di jalur sebelum dan sesudah polling; lulus.
  4: setiap tes memeriksa stdout+stderr tidak memuat bagian rahasia token palsu; pesan notReached melewati redact dengan config.token; lulus.
  5: unreachable.test.ts menjalankan main.ts sungguhan dengan HOME/BOT_SQUAD_HOME mkdtemp tanpa symlink, token palsu, API root lokal, HTTPS_PROXY mati; dijalankan lewat k2 test, juga di salinan kode lama di scratchpad (sudah dihapus).
  note: Tidak ada AGENTS.md; tidak ada skrip cek lain di repo selain bun test. Ctrl+C kedua (process.once) tetap mematikan proses dengan default handler; kunci basi diambil alih seperti sebelumnya (A3).
