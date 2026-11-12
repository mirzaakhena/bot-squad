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
- [ ] Kalau sesi tidak siap dalam batas waktu tertentu, pemilik menerima pesan gagal yang menyertakan potongan isi layar sesi tersebut.
- [ ] Bot yang sudah berjalan tidak bisa dinyalakan untuk kedua kalinya.
- [ ] Bot yang gagal menyala tetap tercatat dengan status gagal, sehingga nanti bisa dicoba lagi.
- [ ] Sesi bot berjalan di folder kerjanya sendiri dan memakai folder state miliknya sendiri.
- [ ] Logika menentukan bot siap, gagal, atau sudah berjalan dibuktikan dengan tes otomatis.

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
- A1 [unseen] Bot dianggap sudah berjalan bila sesi tmux bernama <nama> ada atau proses di state/bot.pid hidup, seperti langkah 1 start-bot.sh
  Why: Aturan ini sudah terbukti di spike 4701 dan tercatat di CLAUDE.md
  If wrong: Ganti pengecekan start ganda di master dengan aturan baru dan perbarui tesnya

## Decisions
- Lane strict: menyalakan sesi Claude bebas izin dan menjaga satu poller per token
- Menunggu 4705 (registry dan folder bot), 4702 (cara aman menyalakan beberapa bot) dan 4703 (id channel plugin:bot-squad@inline)
