---
type: bug
priority: high
lane: standard
labels: []
blocked_by: []
related: [261112184706]
touches: [master/src/bot.ts, master/test/register-launch.test.ts, master/test/fake-telegram.ts, CLAUDE.md]
created: 2026-11-12 21:40
---

## Background

Cek manual tiket 261112184706 (2026-11-12, MacBook pemilik): pemilik mendaftarkan uji-03 lewat master-bot. Pesan "Menyalakan 'uji-03'..." sampai, dan bot benar-benar aktif (registry `active`, sesi tmux dan server plugin hidup). Namun laporan "aktif" tidak pernah sampai ke pemilik. Konsol master mencatat:

```
master-bot: penyalaan 'uji-03': active
master-bot: laporan penyalaan 'uji-03' gagal dikirim: Network request for 'sendMessage' failed!
```

Master tidak mencoba mengirim ulang, sehingga pemilik tidak tahu bot sudah aktif.

Pada waktu yang sama, pesan pertama pemilik ke bot baru ("hallo", 21.34) baru diterima sesi Claude sekitar 21.36. Dugaannya, koneksi ke Telegram sedang terganggu dan plugin menunggu jeda percobaan ulang polling. Ini belum terbukti.

## How to reproduce

1. Jalankan master-bot, lalu daftarkan bot baru dengan /register.
2. Buat pengiriman pesan ke Telegram gagal sesaat (jaringan putus) tepat saat bot selesai menyala.
3. Pesan "aktif" atau "gagal" tidak pernah sampai ke pemilik, dan hanya ada satu baris log.

## Request

Laporan hasil penyalaan bot (aktif atau gagal) harus sampai ke pemilik walaupun koneksi ke Telegram sempat terganggu sebentar. Kalau tetap tidak bisa dikirim, kegagalannya harus jelas di log. Selidiki juga keterlambatan sekitar 2 menit pada pesan pertama ke bot baru, dan catat penyebabnya.

## Done when

- [ ] Kalau pengiriman laporan penyalaan gagal karena gangguan sementara (error jaringan, 5xx, atau 429 dengan menunggu retry_after), master mencoba lagi dengan jeda yang bertambah (2, 4, 8, ... paling lama 60 detik per jeda, total sekitar 10 menit), dan laporan tetap sampai setelah koneksi pulih. Ini dibuktikan dengan tes otomatis memakai Telegram tiruan yang gagal beberapa kali.
- [ ] Error 4xx lain (misalnya 400 atau 403) tidak dicoba ulang dan langsung dicatat di log.
- [ ] Kalau percobaan habis, atau master-bot dihentikan saat laporan masih menunggu dikirim ulang (percobaan dihentikan, berhenti tidak ditunda), log master menyebut laporan '<nama>' tidak terkirim beserta alasannya, tanpa mencetak token.
- [ ] Kalimat "Status tercatat 'failed'" hanya muncul kalau pencatatan status berhasil. Kalau pencatatan gagal, laporan (aktif maupun gagal) memuat "Status di registry gagal dicatat; lihat log master-bot." (catatan reviewer 4706).
- [ ] CLAUDE.md mencatat penyebab keterlambatan pesan pertama ke bot baru, atau menyatakan penyebabnya belum diketahui beserta apa yang sudah diperiksa.
- [ ] (owner) Dengan panduan foreman, pemilik mematikan sesi uji-03 kalau masih hidup, menghapus entri uji-03 dari ~/.bot-squad/registry.json dan folder ~/.bot-squad/bots/uji-03, lalu mendaftarkan ulang '/register uji-03 <token mirza_003_bot>' dan menerima pesan "aktif" dari master-bot. Worker tidak menyentuh data asli ini.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Berapa lama master mencoba mengirim ulang laporan penyalaan? Pilihan: (a) singkat, ~5 percobaan dalam ~1 menit; (b) jeda bertambah (2, 4, 8, ... maks 60 detik) sampai total ~10 menit; (c) terus mencoba sampai terkirim. Rekomendasi (b): gangguan kemarin berlangsung sekitar 2 menit, dan 10 menit masih wajar untuk laporan yang ditunggu pemilik tanpa menumpuk percobaan selamanya.
  → (b) jeda bertambah 2, 4, 8 sampai paling lama 60 detik, total sekitar 10 menit. (owner, 2026-11-12)
- Q2 [answered] Error apa yang dicoba ulang? Rekomendasi: hanya gangguan sementara, yaitu error jaringan (tidak ada jawaban dari Telegram), 5xx, dan 429 (menunggu retry_after dari Telegram). Error 4xx lain (misalnya 400 karena format pesan, 403 karena pemilik memblokir master-bot) langsung dicatat di log tanpa coba ulang, karena mengulang tidak akan berhasil. Setuju?
  → Setuju. (owner, 2026-11-12)
- Q3 [answered] Kalau master-bot dihentikan (Ctrl+C/SIGTERM) saat masih ada laporan yang menunggu dikirim ulang, apa yang terjadi? Pilihan: (a) percobaan dihentikan dan log mencatat laporan '<nama>' tidak terkirim karena master berhenti; (b) master menunda berhenti sampai laporan terkirim atau habis percobaan. Rekomendasi (a): berhenti harus cepat, dan log tetap jelas.
  → (a) hentikan dan catat di log. (owner, 2026-11-12)
- Q4 [answered] Teks pengganti saat status di registry gagal dicatat. Rekomendasi: kalimat 'Status tercatat failed' hanya muncul kalau pencatatan berhasil; kalau gagal, diganti 'Status di registry gagal dicatat; lihat log master-bot.' Ini berlaku juga untuk laporan aktif (ditambah kalimat yang sama). Setuju, atau ada teks lain?
  → Setuju. (owner, 2026-11-12)
- Q5 [answered] Cek (owner) butuh mendaftarkan bot baru, sedangkan uji-03 sudah terdaftar dan belum ada perintah hapus. Artinya pemilik perlu token BotFather baru (misalnya uji-04). Pilihan: (a) tetap begitu; (b) ganti cek menjadi menghapus uji-03 dari registry.json secara manual lalu mendaftarkannya lagi. Rekomendasi (a), karena tidak menyentuh data asli secara manual.
  → (b) uji-03 dihapus manual, BUKAN token baru. Dikerjakan saat cek (owner): foreman memandu pemilik mematikan sesi uji-03 kalau masih hidup, menghapus entri uji-03 dari ~/.bot-squad/registry.json dan folder ~/.bot-squad/bots/uji-03, lalu mendaftarkan ulang '/register uji-03 <token mirza_003_bot>'. Worker tidak menyentuh data asli ini. (owner, 2026-11-12)
- Q6 [answered] Penyelidikan jeda 2 menit pesan pertama ke bot baru: bolehkah worker menyalakan bot uji asli (token uji-02, BOT_SQUAD_HOME sementara) dan mengirim pesan uji, atau cukup dari baca kode plugin/grammY dan log yang ada? Rekomendasi: boleh memakai uji-02, tetapi tanpa sengaja memutus jaringan mesin; kalau penyebab tidak bisa dibuktikan, CLAUDE.md mencatat 'belum diketahui' beserta yang sudah diperiksa, sesuai Done when.
  → Boleh, dengan token uji-02 dan BOT_SQUAD_HOME sementara. (owner, 2026-11-12)

## Assumptions
- A1 [unseen] Pengiriman ulang tetap berjalan di latar belakang dan tidak menghalangi perintah lain master-bot
  Why: launchInBackground sudah dirancang begitu di 4706
  If wrong: Kirim ulang secara berurutan di handler
- A2 [unseen] Tes memakai master/test/fake-telegram.ts dengan handler sendMessage yang gagal N kali; tidak ada token asli di tes
  Why: Aturan pelajaran: tes master-bot memakai fake-telegram, jangan token asli
  If wrong: -

## Decisions
- Lane standard: logika kirim ulang di master-bot, mudah dibatalkan, tidak menyentuh data
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
