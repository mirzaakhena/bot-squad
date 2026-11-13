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

- [x] /stop <nama> mematikan sesi bot itu dengan bersih (tanpa server plugin tersisa) dan mencatat statusnya sebagai dihentikan sengaja.
- [x] /restart <nama> mematikan bot (kalau hidup) lalu menyalakannya lagi, dengan laporan "aktif" atau "gagal" seperti saat registrasi.
- [x] /restart juga bekerja untuk bot berstatus gagal dan bot yang dihentikan sengaja.
- [x] Nama yang tidak terdaftar ditolak dengan alasan jelas; bot lain tidak pernah tersentuh.
- [x] Dua perintah untuk bot yang sama pada saat bersamaan tidak membuat bot berjalan dua kali: /stop atau /restart untuk bot yang sedang dinyalakan atau dihentikan ditolak dengan pesan bahwa bot itu sedang diproses dan perlu dicoba lagi.
- [x] Kalau /stop tidak bisa membersihkan semuanya (sesi atau server plugin masih hidup), status tetap dicatat dihentikan sengaja dan balasannya memuat peringatan dengan pid yang tersisa.
- [x] Dibuktikan dengan tes otomatis.
- [x] (owner) Pemilik menghentikan lalu menyalakan ulang satu bot uji dari Telegram, dan bot itu membalas lagi.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Perintah untuk bot yang sedang diproses (sedang dinyalakan setelah /register atau /restart, atau sedang di-/stop): apa yang terjadi? Opsi: (a) ditolak dengan balasan "'<nama>' sedang dinyalakan/dihentikan, coba lagi setelah selesai"; (b) /stop membatalkan penyalaan yang sedang berjalan lalu mematikan sesinya; (c) diantrekan dan dijalankan setelah yang sebelumnya selesai. Rekomendasi (a): paling sederhana dan pasti tidak membuat bot berjalan dua kali; penyalaan paling lama 90 detik.
  → (a) ditolak dengan pesan "sedang diproses, coba lagi". (owner, 2026-11-13)
- Q2 [answered] Kalau /stop gagal membersihkan (sesi tmux tidak mau mati, atau server plugin masih hidup setelah SIGKILL), status apa yang dicatat? Opsi: (a) status tidak diubah, balasan 'gagal dihentikan' dengan alasan dan pid yang tersisa, dan /restart tidak menyalakan ulang; (b) tetap dicatat 'stopped' supaya tidak dihidupkan otomatis, dengan peringatan proses tersisa. Rekomendasi (b): niat pemilik menghentikan tetap tercatat sehingga master tidak menyalakannya lagi saat restart, dan peringatan menyebut pid yang harus dicek manual.
  → (b) tetap dicatat "stopped", dengan peringatan yang menyebut pid yang tersisa. (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Cara mematikan: tmux kill-session '=<nama>', lalu menunggu sampai server plugin bot itu (bot.pid dan proses yang dikenali strays.ts untuk folder state itu) keluar, paling lama sekitar 10 detik; sisanya dimatikan dengan killStrays (SIGTERM, 2 detik, SIGKILL). Hanya proses yang dikenali lewat TELEGRAM_STATE_DIR + CLAUDE_PLUGIN_ROOT yang boleh dimatikan; bukti mati dari ps, bukan dari hilangnya bot.pid.
  Why: CLAUDE.md: kill-session terbukti bersih, killStrays jaring pengaman, dan pelajaran soal bot.pid
  If wrong: Ubah urutan atau batas waktu di stop.ts
  Confirmed by owner, 2026-11-13
- A2 [confirmed] /stop untuk bot yang sudah tidak berjalan (failed, atau active yang ternyata mati) tetap mencatat 'stopped' dan membalas bahwa bot memang sudah tidak berjalan. /stop dan /restart tanpa nama atau dengan nama tak sah membalas cara pakai. Tidak ada konfirmasi sebelum /stop.
  Why: Pemilik satu-satunya pengguna dan tindakan ini bisa dibalik dengan /restart
  If wrong: Tambah konfirmasi atau ubah balasan
  Confirmed by owner, 2026-11-13
- A3 [confirmed] /restart membalas 'Menyalakan ulang <nama>...' lalu pesan kedua memakai launchReport dan sendWithRetry yang sama dengan /register, status ditulis active/failed lewat setBotStatus. Kalimat 'Percobaan ulang menunggu perintah berikutnya (belum tersedia)' di launchReport diganti petunjuk '/restart <nama>'. /stop dan /restart masuk COMMANDS.
  Why: Done when meminta laporan seperti saat registrasi; kode laporan sudah ada di bot.ts
  If wrong: Ubah teks di bot.ts
  Confirmed by owner, 2026-11-13
- A4 [confirmed] Kunci 'sedang diproses' per bot dipegang di master untuk /register-launch, /stop, dan /restart (memperluas set starting di launch.ts atau setara), dan diekspor supaya 261112225304 bisa memakainya. Antar proses (start-bot.sh bersamaan) tetap dijaga cek sesi tmux yang sudah ada.
  Why: Done when 'tidak berjalan dua kali'; 304 bergantung padanya
  If wrong: Pindahkan kunci ke modul lain
  Confirmed by owner, 2026-11-13
- A5 [confirmed] Kalau master-bot berhenti saat /restart sedang menyalakan, perilakunya sama dengan /register (tiket 261112223102): penyalaan diputus, status failed. /stop yang sedang berjalan diselesaikan dulu dalam batas tunggu 3 detik master.
  Why: Signal sudah diteruskan ke launchBot
  If wrong: Ubah penanganan signal di stop.ts
  Confirmed by owner, 2026-11-13
- A6 [confirmed] /stop membalas dua pesan: 'Menghentikan <nama>...' lalu laporan hasil, karena penghentian bisa makan sampai sekitar 13 detik dan berjalan di latar belakang
  Why: Sama dengan pola /register dan /restart; master-bot tetap melayani perintah lain
  If wrong: Hapus balasan pertama di perintah stop di master/src/bot.ts
  Confirmed by owner, 2026-11-13
- A7 [confirmed] /restart yang tidak bisa mematikan bot lama dengan bersih (sesi atau server plugin masih hidup) tidak menyalakan bot baru dan tidak mengubah status; balasannya menyebut pid yang tersisa
  Why: Menyalakan saat server lama masih polling berarti dua poller untuk satu token (409); status lama masih paling dekat dengan kenyataan
  If wrong: Ubah cabang isClean di perintah restart di master/src/bot.ts (mis. catat failed)
  Confirmed by owner, 2026-11-13
- A8 [confirmed] Kunci sedang diproses dipegang per master-bot (BotLocks dari createBotLocks di main.ts, diteruskan lewat opsi locks), bukan variabel modul; 261112225304 perlu memakai objek yang sama
  Why: Variabel modul bocor antar tes dalam satu proses bun test; satu master-bot per proses tetap mendapat satu kunci
  If wrong: Jadikan createBotLocks() satu instance modul di busy.ts
  Confirmed by owner, 2026-11-13
- A9 [confirmed] Kalau bot.pid masih menunjuk proses hidup yang tidak dikenali sebagai server plugin bot itu, /stop hanya menyebutnya di laporan dan tidak pernah mematikannya
  Why: Pid bisa dipakai ulang proses lain; hanya pengenalan strays yang boleh menentukan sasaran sinyal
  If wrong: Hapus catatan unrecognizedPid di stop.ts dan bot.ts
  Confirmed by owner, 2026-11-13

## Decisions
- Lane strict: mematikan proses dan sesi tmux; salah sasaran bisa mematikan bot lain atau plugin WhatsApp pemilik, dan status yang salah membuat bot tidak dihidupkan kembali
- Tidak solo: perubahan registry hanya menambah satu nilai status, tanpa migrasi. Berjalan berdampingan dengan 261112225301.
- Red-proof: aturan nama dan satu kata di /stop+/restart, cek terdaftar, kunci di /stop, /restart, /register, pelepasan kunci, restart batal bila tidak bersih, restart mematikan dulu, stopped dicatat walau tidak bersih, peringatan pid, isClean (pid dan sesi), aturan nama di stopBot, tunggu keluar sendiri sebelum sinyal, kill-session hanya bila sesi ada, pengenalan strays (state dir sama persis, CLAUDE_PLUGIN_ROOT, env tak terbaca, bun server.ts; juga lewat stop.test saja), unrecognizedPid; all red
- Status stopped ditulis sebelum sesi dimatikan, supaya niat pemilik tetap tercatat kalau master-bot berhenti di tengah /stop; /restart tidak menulis stopped di tengah jalan

## Manual checks
- M1 [ok] (item 8) 1. Di server, jalankan ulang master-bot dari main yang sudah memuat tiket ini (bun run master/src/main.ts) supaya menu memuat /stop dan /restart.
  2. Di chat master-bot kirim /stop uji-01: muncul 'Menghentikan uji-01...' lalu 'Bot @... (uji-01) dihentikan.' dan 'Status tercatat stopped'.
  3. Di terminal: tmux ls tidak lagi memuat uji-01.
  4. Kirim pesan ke bot uji-01: tidak ada balasan.
  5. Di master-bot kirim /restart uji-01: muncul 'Menyalakan ulang uji-01...' lalu 'Bot @... (uji-01) aktif.'
  6. Kirim pesan ke bot uji-01: bot membalas lagi.
  Checked by owner, 2026-11-13

## Handoff
Menambah /stop dan /restart (master/src/bot.ts) dengan master/src/stop.ts (kill-session, tunggu server plugin keluar sendiri 10 detik, lalu killStrayServers) dan master/src/busy.ts (BotLocks per master-bot, dibuat di main.ts, diteruskan lewat opsi locks). Status baru 'stopped' di registry.ts, ditulis sebelum bot dimatikan. /register juga mengambil kunci saat menyalakan. Yang tidak boleh rusak: hanya proses yang dikenali strays.ts untuk folder state bot itu yang dikirimi sinyal, tmux selalu dengan '=<nama>', dan /restart tidak menyalakan kalau bot lama belum bersih. Pekerjaan lain yang menyalakan bot (mis. 261112225304) harus memakai BotLocks yang sama. createMasterBot sekarang wajib diberi stop.

## Review
- 2026-11-13 strict, round 1, at 3ba5d2f: passed.
  1: stop-process.test.ts (main.ts sungguhan, tmux terpisah) lulus di salinan: sesi hilang, server plugin tiruan tidak ada di ps, status stopped; mutasi tanpa tunggu-keluar-sendiri (stop.ts) dan tmux tanpa '=' (launch.ts) merah
  2: stop-process.test.ts: restart memberi 'aktif', pid baru, satu server saja; stop-restart.test.ts laporan gagal sama dengan registrasi; mutasi abaikan isClean di /restart merah
  3: stop-restart.test.ts /restart untuk active, failed, stopped, registered -> stop lalu launch, status active; lulus
  4: tak terdaftar ditolak tanpa stop/launch (mutasi hapus cek hasOwn merah); WhatsApp tiruan, bot lain, sesi srp-01-lain tetap hidup; mutasi hapus cek CLAUDE_PLUGIN_ROOT di strays.ts merah (9 gagal); kill-session tanpa cek sesi merah
  5: mutasi tanpa kunci di /stop, /restart, /register masing-masing merah; launch hanya sekali
  6: mutasi 'stopped hanya kalau bersih' merah (5 tes), mutasi peringatan tanpa pid merah; isClean tanpa sessionLeft merah
  7: 48 tes di 3 berkas baru lulus lewat k2 test di salinan; suite penuh sudah lulus pada e766a47465, tidak diulang
  8: (owner) M1 berisi langkah dari awal sampai bot membalas lagi; tidak memblokir
  note: tidak ada skrip lint/CI di repo selain bun test. CLAUDE.md masih menulis '[ ] Perintah master-bot berikutnya (list, dst.)' padahal /list sudah ada di main; kosmetik. wasRunning ikut true bila bot.pid menunjuk pid hidup yang tak dikenali, hanya memengaruhi kalimat laporan.
