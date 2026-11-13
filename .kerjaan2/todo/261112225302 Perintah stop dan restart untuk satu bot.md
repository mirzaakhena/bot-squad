---
type: feature
priority: high
lane: strict
labels: []
blocked_by: []
related: [261112225301, 261112225304]
touches: [master/src/bot.ts, master/src/launch.ts, master/src/registry.ts, master/src/stop.ts, master/src/main.ts, master/test/stop.test.ts, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Bot hanya bisa dimatikan atau dinyalakan ulang lewat terminal server. Bot yang gagal menyala tercatat "failed" dan belum bisa dicoba lagi dari Telegram. Perintah /start tidak dipakai untuk menyalakan bot, karena /start sudah dipakai Telegram sebagai sapaan pertama.

## Request

Pemilik bisa mematikan satu bot dan menyalakannya ulang dari master-bot. Bot yang dimatikan sengaja tercatat berbeda dari bot yang mati karena masalah, supaya nanti tidak dihidupkan otomatis.

## Done when

- [ ] /stop <nama> mematikan sesi bot itu dengan bersih (tanpa server plugin tersisa) dan mencatat statusnya sebagai dihentikan sengaja.
- [ ] /restart <nama> mematikan bot (kalau hidup) lalu menyalakannya lagi, dengan laporan "aktif" atau "gagal" seperti saat registrasi.
- [ ] /restart juga bekerja untuk bot berstatus gagal dan bot yang dihentikan sengaja.
- [ ] Nama yang tidak terdaftar ditolak dengan alasan jelas; bot lain tidak pernah tersentuh.
- [ ] Dua perintah untuk bot yang sama pada saat bersamaan tidak membuat bot berjalan dua kali: /stop atau /restart untuk bot yang sedang dinyalakan atau dihentikan ditolak dengan pesan bahwa bot itu sedang diproses dan perlu dicoba lagi.
- [ ] Kalau /stop tidak bisa membersihkan semuanya (sesi atau server plugin masih hidup), status tetap dicatat dihentikan sengaja dan balasannya memuat peringatan dengan pid yang tersisa.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik menghentikan lalu menyalakan ulang satu bot uji dari Telegram, dan bot itu membalas lagi.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Perintah untuk bot yang sedang diproses (sedang dinyalakan setelah /register atau /restart, atau sedang di-/stop): apa yang terjadi? Opsi: (a) ditolak dengan balasan "'<nama>' sedang dinyalakan/dihentikan, coba lagi setelah selesai"; (b) /stop membatalkan penyalaan yang sedang berjalan lalu mematikan sesinya; (c) diantrekan dan dijalankan setelah yang sebelumnya selesai. Rekomendasi (a): paling sederhana dan pasti tidak membuat bot berjalan dua kali; penyalaan paling lama 90 detik.
  → (a) ditolak dengan pesan "sedang diproses, coba lagi". (owner, 2026-11-13)
- Q2 [answered] Kalau /stop gagal membersihkan (sesi tmux tidak mau mati, atau server plugin masih hidup setelah SIGKILL), status apa yang dicatat? Opsi: (a) status tidak diubah, balasan 'gagal dihentikan' dengan alasan dan pid yang tersisa, dan /restart tidak menyalakan ulang; (b) tetap dicatat 'stopped' supaya tidak dihidupkan otomatis, dengan peringatan proses tersisa. Rekomendasi (b): niat pemilik menghentikan tetap tercatat sehingga master tidak menyalakannya lagi saat restart, dan peringatan menyebut pid yang harus dicek manual.
  → (b) tetap dicatat "stopped", dengan peringatan yang menyebut pid yang tersisa. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Cara mematikan: tmux kill-session '=<nama>', lalu menunggu sampai server plugin bot itu (bot.pid dan proses yang dikenali strays.ts untuk folder state itu) keluar, paling lama sekitar 10 detik; sisanya dimatikan dengan killStrays (SIGTERM, 2 detik, SIGKILL). Hanya proses yang dikenali lewat TELEGRAM_STATE_DIR + CLAUDE_PLUGIN_ROOT yang boleh dimatikan; bukti mati dari ps, bukan dari hilangnya bot.pid.
  Why: CLAUDE.md: kill-session terbukti bersih, killStrays jaring pengaman, dan pelajaran soal bot.pid
  If wrong: Ubah urutan atau batas waktu di stop.ts
- A2 [unseen] /stop untuk bot yang sudah tidak berjalan (failed, atau active yang ternyata mati) tetap mencatat 'stopped' dan membalas bahwa bot memang sudah tidak berjalan. /stop dan /restart tanpa nama atau dengan nama tak sah membalas cara pakai. Tidak ada konfirmasi sebelum /stop.
  Why: Pemilik satu-satunya pengguna dan tindakan ini bisa dibalik dengan /restart
  If wrong: Tambah konfirmasi atau ubah balasan
- A3 [unseen] /restart membalas 'Menyalakan ulang <nama>...' lalu pesan kedua memakai launchReport dan sendWithRetry yang sama dengan /register, status ditulis active/failed lewat setBotStatus. Kalimat 'Percobaan ulang menunggu perintah berikutnya (belum tersedia)' di launchReport diganti petunjuk '/restart <nama>'. /stop dan /restart masuk COMMANDS.
  Why: Done when meminta laporan seperti saat registrasi; kode laporan sudah ada di bot.ts
  If wrong: Ubah teks di bot.ts
- A4 [unseen] Kunci 'sedang diproses' per bot dipegang di master untuk /register-launch, /stop, dan /restart (memperluas set starting di launch.ts atau setara), dan diekspor supaya 261112225304 bisa memakainya. Antar proses (start-bot.sh bersamaan) tetap dijaga cek sesi tmux yang sudah ada.
  Why: Done when 'tidak berjalan dua kali'; 304 bergantung padanya
  If wrong: Pindahkan kunci ke modul lain
- A5 [unseen] Kalau master-bot berhenti saat /restart sedang menyalakan, perilakunya sama dengan /register (tiket 261112223102): penyalaan diputus, status failed. /stop yang sedang berjalan diselesaikan dulu dalam batas tunggu 3 detik master.
  Why: Signal sudah diteruskan ke launchBot
  If wrong: Ubah penanganan signal di stop.ts

## Decisions
- Lane strict: mematikan proses dan sesi tmux; salah sasaran bisa mematikan bot lain atau plugin WhatsApp pemilik, dan status yang salah membuat bot tidak dihidupkan kembali
- Tidak solo: perubahan registry hanya menambah satu nilai status, tanpa migrasi. Berjalan berdampingan dengan 261112225301.
