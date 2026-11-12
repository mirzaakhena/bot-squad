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

- [x] Kalau pengiriman laporan penyalaan gagal karena gangguan sementara (error jaringan, 5xx, atau 429 dengan menunggu retry_after), master mencoba lagi dengan jeda yang bertambah (2, 4, 8, ... paling lama 60 detik per jeda, total sekitar 10 menit), dan laporan tetap sampai setelah koneksi pulih. Ini dibuktikan dengan tes otomatis memakai Telegram tiruan yang gagal beberapa kali.
- [x] Error 4xx lain (misalnya 400 atau 403) tidak dicoba ulang dan langsung dicatat di log.
- [x] Kalau percobaan habis, atau master-bot dihentikan saat laporan masih menunggu dikirim ulang (percobaan dihentikan, berhenti tidak ditunda), log master menyebut laporan '<nama>' tidak terkirim beserta alasannya, tanpa mencetak token.
- [x] Kalimat "Status tercatat 'failed'" hanya muncul kalau pencatatan status berhasil. Kalau pencatatan gagal, laporan (aktif maupun gagal) memuat "Status di registry gagal dicatat; lihat log master-bot." (catatan reviewer 4706).
- [x] CLAUDE.md mencatat penyebab keterlambatan pesan pertama ke bot baru, atau menyatakan penyebabnya belum diketahui beserta apa yang sudah diperiksa.
- [x] (owner) Dengan panduan foreman, pemilik mematikan sesi uji-03 kalau masih hidup, menghapus entri uji-03 dari ~/.bot-squad/registry.json dan folder ~/.bot-squad/bots/uji-03, lalu mendaftarkan ulang '/register uji-03 <token mirza_003_bot>' dan menerima pesan "aktif" dari master-bot. Worker tidak menyentuh data asli ini.

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
- A1 [confirmed] Pengiriman ulang tetap berjalan di latar belakang dan tidak menghalangi perintah lain master-bot
  Why: launchInBackground sudah dirancang begitu di 4706
  If wrong: Kirim ulang secara berurutan di handler
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Tes memakai master/test/fake-telegram.ts dengan handler sendMessage yang gagal N kali; tidak ada token asli di tes
  Why: Aturan pelajaran: tes master-bot memakai fake-telegram, jangan token asli
  If wrong: -
  Confirmed by owner, 2026-11-12
- A3 [confirmed] Uji asli dengan uji-02 tidak dijalankan untuk menyelidiki jeda 2 menit
  Why: Pesan uji harus dikirim dari akun pemilik dan gangguan jaringan tidak boleh dibuat sengaja, jadi uji-02 tidak bisa mengulang kejadiannya; bukti diambil dari transkrip sesi uji-03 dan kode plugin/grammY
  If wrong: Nyalakan uji-02 dengan BOT_SQUAD_HOME sementara dan DEBUG=grammy:error, minta pemilik mengirim pesan saat jaringan terganggu
  Confirmed by owner, 2026-11-12

## Decisions
- Lane standard: logika kirim ulang di master-bot, mudah dibatalkan, tidak menyentuh data
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
- Jeda terakhir boleh melewati batas 10 menit paling banyak satu jeda maksimum (urutan 2..32 lalu 60 x9 = 602 detik), dan 429 dengan retry_after yang melewati sisa waktu langsung menyerah; supaya total sekitar 10 menit tanpa menunggu retry_after yang sangat panjang.

## Manual checks
- M1 [ok] (item 6) 1. Matikan master-bot kalau sedang berjalan (Ctrl+C).
  2. Cek sesi uji-03: 'tmux ls'; kalau ada, 'tmux kill-session -t uji-03', lalu pastikan tidak ada proses 'bun server.ts' milik uji-03 (ps).
  3. Hapus entri "uji-03" dari ~/.bot-squad/registry.json (biarkan bot lain) dan hapus folder ~/.bot-squad/bots/uji-03.
  4. Jalankan master-bot dari root repo: bun run --cwd master start.
  5. Di chat master-bot kirim '/register uji-03 <token mirza_003_bot>'.
  6. Harus muncul 'Menyalakan uji-03...' lalu pesan 'Bot @mirza_003_bot (uji-03) aktif. Silakan ajak bicara.' Kalau jaringan sempat terganggu, log master menulis 'dicoba lagi dalam N detik' dan pesan aktif tetap datang setelah koneksi pulih.
  Checked by owner, 2026-11-12

## Handoff
Laporan hasil penyalaan (pesan kedua setelah /register) kini dikirim lewat sendWithRetry di master/src/retry.ts: HttpError dan 5xx dicoba ulang dengan jeda 2..60 detik (total sekitar 10 menit), 429 menunggu retry_after, 4xx lain tidak. createMasterBot menerima signal (dari run() di main.ts) yang menghentikan percobaan seketika saat master-bot berhenti, dan reportRetry untuk sleep tiruan di tes. launchReport punya argumen statusRecorded; kalimat 'Status tercatat failed' hanya kalau setBotStatus berhasil (mengembalikan true). Jangan sampai: pengiriman ulang memblokir handler, berhenti ditunda, atau error grammY yang memuat token dicetak tanpa logger tersensor. Perintah lain yang mengirim pesan latar belakang sebaiknya memakai sendWithRetry yang sama.

## Review
- 2026-11-12 standard, round 1, at d8ab920: passed.
  1: bun test master/test/report-retry.test.ts (20 lulus): Telegram tiruan dengan fetch gagal 3x lalu pulih (jeda 2,4,8 dan laporan aktif sampai), 502 2x lalu pulih, 429 menunggu retry_after 5 detik; urutan 2..32 lalu 60 total 570-660 detik. Mutasi di salinan (4xx dianggap sementara) membuat tes terkait gagal.
  2: tes 400/403 lewat Telegram tiruan dan 400/401/403/404 di tingkat fungsi: satu percobaan, tanpa jeda, log 'tidak terkirim' memuat kode; gagal saat dimutasi.
  3: tes percobaan habis dan tes berhenti saat menunggu jeda (<2 detik, 1 percobaan) serta sebelum laporan siap lulus, noToken diperiksa. Penerusan signal di main.ts (satu baris) dinilai dengan membaca, karena run() memakai launchBot asli (tmux/claude).
  4: tes registry gagal ditulis (beforeRename melempar): laporan gagal dan aktif memuat kalimat pengganti, tanpa 'Status tercatat'; mutasi yang menghapus kalimat di laporan aktif membuat tes gagal.
  5: CLAUDE.md di worktree mencatat jeda ~114 detik, penyebab belum diketahui, apa yang sudah diperiksa, dan cara merekam bukti lain kali (dibaca).
  6: (owner) Manual checks M1 bisa diikuti dari awal; catatan kecil: teks yang diharapkan di langkah 6 sebenarnya berbentuk "Bot @mirza_003_bot ('uji-03') aktif. Silakan ajak bicara."
  note: selain bun test, repo tidak punya skrip atau CI pemeriksaan lain. Follow-up ditulis untuk master-bot yang dihentikan saat penyalaan masih berjalan.

## Follow-ups
- F1 [ticketed] Kalau master-bot dihentikan (Ctrl+C/SIGTERM) saat penyalaan bot masih berjalan (launchBot, sampai 90 detik), main.ts memanggil process.exit setelah run() selesai tanpa menunggu proses latar belakang, sehingga log tidak pernah mencatat laporan '<nama>' tidak terkirim dan status registry tetap 'registered'. Tes 'sudah berhenti sebelum laporan siap' hanya menguji createMasterBot dalam satu proses, bukan jalur process.exit di master/src/main.ts.
  → 261112223102
