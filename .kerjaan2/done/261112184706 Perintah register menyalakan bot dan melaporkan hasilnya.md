---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: [261112184705, 261112184702, 261112184703]
related: []
touches: [master, scripts/start-bot.sh, CLAUDE.md]
created: 2026-11-12 18:47
---

## Background

Setelah bot terdaftar, master-bot harus menyalakannya sebagai sesi Claude Code di tmux dengan cara yang terbukti di spike. Telegram hanya mengizinkan satu penerima pesan per token, jadi satu bot tidak boleh berjalan dua kali. Sesi juga bisa macet di prompt saat start. Kalau itu terjadi, pemilik harus tahu, bukan menunggu tanpa kabar.

## Request

Registrasi yang berhasil langsung menyalakan bot. Master-bot memastikan bot benar-benar siap, lalu melapor ke pemilik apakah bot sudah aktif atau gagal, beserta alasannya.

## Done when

- [ ] (owner) Setelah registrasi, pemilik menerima pesan "aktif" dari master-bot, dan bot baru langsung membalas saat diajak bicara.
- [x] Kalau sesi tidak siap dalam batas waktu tertentu, pemilik menerima pesan gagal yang menyertakan potongan isi layar sesi tersebut.
- [x] Bot yang sudah berjalan tidak bisa dinyalakan untuk kedua kalinya.
- [x] Bot yang gagal menyala tetap tercatat dengan status gagal, sehingga nanti bisa dicoba lagi.
- [x] Sesi bot berjalan di folder kerjanya sendiri dan memakai folder state miliknya sendiri.
- [x] Logika menentukan bot siap, gagal, atau sudah berjalan dibuktikan dengan tes otomatis.

## Out of scope

- Perintah /restart dan /stop.
- Menghidupkan ulang bot secara otomatis setelah reboot atau crash.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Siapa yang menyalakan bot? Pilihan: (a) logika start ditulis ulang dalam TypeScript di master (cek start ganda, access.json, trust, tmux, jawab dialog, deteksi siap), dengan tmux dan proses yang bisa diganti tiruan saat tes; scripts/start-bot.sh dijadikan pembungkus tipis yang memanggil kode yang sama; (b) master memanggil scripts/start-bot.sh dan membaca exit code serta stderr-nya. Rekomendasi (a): item 6 meminta tes otomatis untuk logika siap, gagal, dan sudah berjalan, dan dengan (a) tidak ada dua implementasi yang lama-lama berbeda.
  → (a) logika start ditulis dalam TypeScript di master, dan start-bot.sh menjadi pembungkus tipis. (owner, 2026-11-12)
- Q2 [answered] Batas waktu sebelum bot dinyatakan gagal? Rekomendasi: 90 detik, sama dengan default start-bot.sh. Di spike, bot siap dalam sekitar 3 detik, tetapi start pertama di server baru ikut menjalankan bun install. Alternatif: 30 detik atau nilai yang bisa diatur lewat .env master.
  → 90 detik. (owner, 2026-11-12)
- Q3 [answered] Potongan layar di pesan gagal: berapa banyak? Rekomendasi: 20 baris terakhir yang tidak kosong dari tmux capture-pane, maksimal sekitar 3000 karakter, dalam blok kode. Tambahkan juga perintah 'tmux attach -t <nama>' untuk melihat langsung.
  → 20 baris terakhir yang tidak kosong, maksimal sekitar 3000 karakter, ditambah 'tmux attach -t <nama>'. (owner, 2026-11-12)
- Q4 [answered] Item 4: bot yang gagal 'nanti bisa dicoba lagi', tetapi /restart di luar cakupan. Pilihan: (a) di tiket ini belum ada cara mencoba lagi; status 'failed' dicatat, dan pesan gagal menyebut bahwa percobaan ulang menunggu perintah berikutnya; (b) mengirim '/register' lagi dengan nama yang berstatus failed akan menyalakan ulang bot tanpa meminta token baru. Rekomendasi (a), supaya /register tetap punya satu arti. Pilih (b) kalau ingin bisa mencoba lagi segera.
  → (a) belum ada percobaan ulang di tiket ini. (owner, 2026-11-12)
- Q5 [answered] Selama menunggu bot siap (bisa sampai batas waktu), apakah master-bot tetap melayani perintah lain? Rekomendasi: master langsung membalas 'menyalakan <nama>...', lalu mengirim pesan 'aktif' atau 'gagal' setelah selesai. Selama itu master tetap melayani perintah lain, dan menyalakan bot yang sama dua kali ditolak. Alternatif: master diam sampai selesai.
  → ya, pesan 'menyalakan...' lalu 'aktif' atau 'gagal'. (owner, 2026-11-12)
- Q6 [answered] Penulisan trust ke ~/.claude.json: dilakukan di setiap start seperti start-bot.sh (dilewati kalau ~/.bot-squad/bots sudah trusted), atau sekali saat master menyala? CLAUDE.md mencatat bahwa file itu ditulis ulang oleh setiap sesi Claude yang berjalan. Rekomendasi: tetap di setiap start, karena dilewati kalau sudah trusted. Setelah M1 dijalankan di Mac ini, langkah itu memang selalu dilewati. Kalau penulisan diperlukan, ini terjadi sebelum tmux dibuka.
  → trust dicek di setiap start. (owner, 2026-11-12)

## Assumptions
- A1 [confirmed] Bot dianggap sudah berjalan bila sesi tmux bernama <nama> ada atau proses di state/bot.pid hidup, seperti langkah 1 start-bot.sh
  Why: Aturan ini sudah terbukti di spike 4701 dan tercatat di CLAUDE.md
  If wrong: Ganti pengecekan start ganda di master dengan aturan baru dan perbarui tesnya
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Sesi tmux yang gagal (batas waktu atau dialog tak terduga) dibiarkan hidup, tidak dimatikan master
  Why: Jawaban Q3 meminta 'tmux attach -t <nama>' di pesan gagal, jadi sesinya harus masih ada untuk dilihat
  If wrong: Tambahkan tmux kill-session di jalur gagal launch.ts dan hapus petunjuk attach dari pesan
  Confirmed by owner, 2026-11-12
- A3 [confirmed] Kalau bot ternyata sudah berjalan saat dinyalakan, status registry tidak diubah (bukan failed)
  Why: Bot yang sedang berjalan bukan bot yang gagal; menandainya failed akan menyesatkan /restart nanti
  If wrong: Di bot.ts, catat already-running sebagai failed juga
  Confirmed by owner, 2026-11-12
- A4 [confirmed] Server plugin yatim setelah kill -9 tidak dibersihkan di tiket ini; cek start ganda tetap tmux dan bot.pid (A1)
  Why: Pembersihan proses yatim butuh mematikan proses, dan CLAUDE.md menaruhnya di urusan restart, yang di luar cakupan
  If wrong: Tambahkan pencarian bun server.ts berdasarkan TELEGRAM_STATE_DIR sebelum start di launch.ts
  Confirmed by owner, 2026-11-12

## Decisions
- Lane strict: menyalakan sesi Claude bebas izin dan menjaga satu poller per token
- Menunggu 4705 (registry dan folder bot), 4702 (cara aman menyalakan beberapa bot) dan 4703 (id channel plugin:bot-squad@inline)
- Semua pertanyaan terjawab; 4703 sudah landed. Masuk todo menunggu 4705 dan 4702 landed
- 2026-11-12 moved to todo: Disetujui pemilik; menunggu 4705 dan 4702
- Red-proof: cek sesi tmux, cek bot.pid hidup, kunci in-process, cek ulang setelah new-session gagal, siap butuh plugin hidup, dialog tak terduga, batas waktu, jawab dialog sekali, hapus bot.pid basi, cwd workspace, TELEGRAM_STATE_DIR, kunci install, status failed dan active dicatat, layar di pesan gagal, potongan 20 baris dan 3000 karakter; all red
- Penyalaan berjalan di latar belakang setelah balasan 'Menyalakan...' terkirim, karena grammY memproses update satu per satu; dengan begitu urutan pesan tetap dan master-bot melayani perintah lain (Q5)

## Manual checks
- M1 [waiting] (item 1) 1. Di server, jalankan master-bot: bun run --cwd master start dari root repo.
  2. Buat bot baru di @BotFather dan salin tokennya.
  3. Kirim /register <nama> <token> ke master-bot.
  4. Pesan berisi token hilang dari chat, lalu master-bot membalas 'terdaftar ... Menyalakan <nama>...'.
  5. Dalam beberapa detik datang pesan kedua: 'Bot @<username> ('<nama>') aktif'.
  6. Buka chat bot baru itu dan kirim 'halo'. Bot membalas.

## Handoff
Logika menyalakan bot kini ada di master/src/launch.ts (launchBot), dipakai master-bot setelah /register dan oleh scripts/start-bot.sh lewat master/src/start-cli.ts. Urutan: cek start ganda (tmux, bot.pid, set in-process), token, access.json, trust ~/.claude.json, bun install plugin berkunci, hapus bot.pid lama, tmux new-session, lalu baca layar tiap detik sampai siap, gagal, atau 90 detik. Semua efek samping (tmux, proses, jam, install) disuntikkan, jadi tes memakai tiruan. bot.ts mencatat status active/failed lewat setBotStatus di registry.ts. Jangan sampai: dua poller per token, Enter buta ke dialog selain development channel, atau token di pesan/log. /restart nanti sebaiknya memakai launchBot dan membersihkan server yatim lebih dulu.

## Review
- 2026-11-12 strict, round 1, at 0b17f46: passed.
  1: (owner) tidak memblokir; M1 berisi langkah dari awal (jalankan master, buat token, /register) sampai hasil yang terlihat (pesan 'aktif', bot membalas 'halo')
  2: nyata di salinan dengan claude tiruan yang macet, READY_TIMEOUT=3: start-bot.sh keluar 1 dengan 'belum siap setelah 3 detik', layar terakhir dan 'tmux attach -t rv-stuck'; tes register-launch memeriksa <pre> dan attach di pesan; layar timeout dihapus -> tes batas waktu merah
  3: nyata: start-bot.sh rv-ok kedua kali keluar 1 'sesi tmux sudah hidup'; cek bot.pid dibuang -> 2 tes merah; kunci in-process dibuang -> tes install bersamaan merah
  4: status failed tidak dicatat (hanya active) -> 2 tes register-launch merah; setBotStatus lewat serialized
  5: nyata: pane rv-ok di bots/rv-ok/workspace, TELEGRAM_STATE_DIR=bots/rv-ok/state, trust ditulis ke CLAUDE_CONFIG_DIR uji; cwd diganti state -> tes merah
  6: 49 tes launch/register-launch lulus; 7 mutasi (bot.pid, siap tanpa plugin, failed, layar, cwd, kunci, batas waktu) semuanya merah. Tidak ada skrip cek lain di repo selain bun test
  note: pesan gagal selalu menulis 'Status tercatat failed' walau setBotStatus gagal (hanya dicatat di log)
