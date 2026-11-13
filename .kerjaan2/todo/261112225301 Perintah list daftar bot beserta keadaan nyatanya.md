---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: [261112225302]
touches: [master/src/bot.ts, master/src/registry.ts, master/src/list.ts, master/test/list.test.ts, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Saat ini pemilik tidak bisa melihat bot apa saja yang terdaftar tanpa membuka file di server. Status di daftar bot juga bisa berbeda dari kenyataan. Contohnya, bot yang sesinya dimatikan manual tetap tercatat "active".

## Request

Pemilik bisa melihat semua bot terdaftar dari master-bot, lengkap dengan status yang tercatat dan apakah bot itu benar-benar sedang hidup.

## Done when

- [ ] /list menampilkan setiap bot terdaftar: nama, @username Telegram, status tercatat, dan apakah sesinya benar-benar hidup saat itu.
- [ ] Bot yang tercatat aktif tetapi sesinya mati ditandai jelas sebagai tidak cocok.
- [ ] Bot yang stopped tetapi sesinya masih hidup juga ditandai tidak cocok.
- [ ] Folder di bots/ yang tidak ada di registry ditampilkan di bagian terpisah "tidak terdaftar, tidak dikelola master-bot" dengan keadaan hidup atau mati, hanya dibaca; sesi tmux tanpa folder di bots/ tidak pernah ditampilkan.
- [ ] Kalau belum ada bot terdaftar, balasannya menjelaskan itu dan menyebut cara mendaftar.
- [ ] Token tidak pernah muncul di balasan.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik mengirim /list dan melihat bot-botnya sesuai keadaan sebenarnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Bot yang ada di folder bots/ tetapi tidak terdaftar di registry (sekarang uji-01 dan uji-02 dari spike): tampilkan di /list atau tidak? Opsi: (a) diabaikan, /list hanya menampilkan registry; (b) ditampilkan di bagian terpisah 'tidak terdaftar, tidak dikelola master-bot' dengan keadaan hidup/mati, hanya dibaca, tanpa bisa di-/stop atau /restart. Rekomendasi (b): pemilik melihat semua yang memakai token di mesin ini, dan risikonya nol karena hanya membaca. Sesi tmux lain milik pemilik yang tidak punya folder di bots/ tidak pernah ditampilkan. Mendaftarkan bot lama (adopsi) tetap di luar tiket ini.
  → (b) folder yang tidak terdaftar ditampilkan di bagian terpisah "tidak terdaftar, tidak dikelola master-bot", hanya dibaca. Tidak ada tiket adopsi. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Nilai status 'dihentikan sengaja' di registry bernama 'stopped' (ditambahkan ke BotStatus juga oleh 261112225302). /list menampilkannya sebagai 'dihentikan'; nilai status lain yang tak dikenal ditampilkan apa adanya, tidak membuat /list error.
  Why: Supaya 301 dan 302 bisa berjalan berdampingan tanpa saling menunggu
  If wrong: Ganti nama nilai di kedua tiket sebelum dikerjakan
- A2 [unseen] 'Benar-benar hidup' dihitung dengan cek yang sama seperti launch.ts: sesi tmux '<nama>' ada, dan proses di state/bot.pid hidup. Tiga keadaan: hidup (keduanya), sesi ada tapi server plugin mati, mati (tidak ada sesi; bot.pid mati atau tidak ada). Hanya membaca: tidak ada sesi atau berkas yang diubah.
  Why: runningReason/isAlive di launch.ts sudah menjadi definisi 'berjalan' di proyek ini
  If wrong: Ubah daftar keadaan di list.ts
- A3 [unseen] Tidak cocok berarti: active/registered tetapi mati, atau stopped tetapi masih hidup. failed dengan sesi masih ada ditampilkan wajar ('sesi dibiarkan untuk diperiksa'), karena penyalaan gagal memang sengaja membiarkan sesinya.
  Why: CLAUDE.md: sesi yang gagal dibiarkan hidup supaya bisa dilihat
  If wrong: Ubah aturan tanda di list.ts
- A4 [unseen] /list ditambahkan ke COMMANDS (menu dan /help). Balasan teks biasa atau HTML ber-escape, satu baris per bot urut nama; registry.json rusak dijawab dengan pesan jelas dan detailnya di log.
  Why: Pola perintah yang ada di bot.ts dan menu.ts
  If wrong: Ubah format di list.ts

## Decisions
- Lane standard: hanya membaca registry dan keadaan tmux/proses, tidak mengubah apa pun; tetap standard karena menyentuh penjaga token di balasan
- Berjalan berdampingan dengan 261112225302, tidak menunggu: /list hanya perlu nama status 'stopped' yang ditetapkan sekarang (A1), bukan kode 302. Keduanya menambah 'stopped' ke BotStatus dan perintah ke COMMANDS di bot.ts; tabrakan kecil itu diselesaikan merge queue.
