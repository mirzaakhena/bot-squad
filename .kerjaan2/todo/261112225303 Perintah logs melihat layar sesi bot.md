---
type: feature
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: [master/src/bot.ts, master/src/logs.ts, master/src/launch.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Untuk tahu bot sedang mengerjakan apa atau macet di mana, pemilik harus masuk ke server dan membuka sesi tmux. Isi layar bisa memuat hal sensitif, tetapi master-bot hanya melayani pemilik, jadi menurut pemilik itu dapat diterima.

## Request

Pemilik bisa melihat bagian terakhir layar sesi sebuah bot langsung dari master-bot.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] /logs <nama> menampilkan baris-baris terakhir layar sesi bot itu (tanpa baris kosong) dalam blok kode yang muat di satu pesan Telegram.
- [ ] Pemilik bisa meminta jumlah baris tertentu: `/logs <nama> [n]`, default 20, maksimum 50 (Q1). Angka di luar 1-50 atau bukan angka dijawab dengan cara pakai; hasilnya selalu muat dalam satu pesan tanpa dibagi.
- [ ] Kalau bot tidak hidup, balasannya menjelaskan itu.
- [ ] Token dan isi file .env bot tidak pernah ikut terkirim, walaupun tampil di layar.
- [ ] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Batas jumlah baris /logs <nama> [n]? Opsi A (rekomendasi): default 20 (sama dengan laporan penyalaan), maks. 100; kalau tidak muat di satu pesan (4096 karakter), yang dibuang baris paling atas dan balasan menyebut berapa baris yang tampil. Opsi B: default 20, maks. 50, selalu muat tanpa pemotongan. Opsi C: default 40, maks. 200, dibagi beberapa pesan bila perlu (bertentangan dengan 'satu pesan').
  → Default 20, maks 50 (opsi B): selalu muat dalam satu pesan. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Hanya bot di registry yang dilayani (nama lolos aturan nama); tanpa sesi tmux balasannya menjelaskan keadaan nyata dengan kata yang sama seperti /list; kalau sesi ada tetapi server plugin mati, layar tetap ditampilkan plus keterangan itu
  Why: Konsisten dengan /list dan /stop (tiket 261112225301, 261112225302)
  If wrong: Tolak juga sesi tanpa server plugin
- A2 [unseen] Sensor: token bot itu (dari state/.env), token master-bot, dan apa pun berbentuk <angka>:<20+ karakter> diganti, juga seluruh nilai setelah TELEGRAM_BOT_TOKEN= atau MASTER_BOT_TOKEN= di baris mana pun; teks layar di-escape HTML dalam <pre>
  Why: Sama dengan sensor /list dan laporan penyalaan; Done when melarang token dan isi .env
  If wrong: Perluas pola sensor
- A3 [unseen] /logs hanya membaca (tmux capture-pane), tanpa BotLocks dan tanpa mengubah sesi; boleh dipakai saat bot sedang dinyalakan atau dihentikan
  Why: Membaca tidak bentrok dengan penyalaan; /list juga tanpa kunci
  If wrong: Tolak saat bot sedang diproses

## Decisions
- Lane standard: hanya membaca layar tmux, tidak mengubah sesi atau berkas; risikonya kebocoran token, dijaga Done when sensor
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok
- 2026-11-13 moved to todo: Disetujui pemilik setelah jawaban tercatat
