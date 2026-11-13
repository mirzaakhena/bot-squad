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

- [x] /list menampilkan setiap bot terdaftar: nama, @username Telegram, status tercatat, dan apakah sesinya benar-benar hidup saat itu.
- [x] Bot yang tercatat aktif tetapi sesinya mati ditandai jelas sebagai tidak cocok.
- [x] Bot yang stopped tetapi sesinya masih hidup juga ditandai tidak cocok.
- [x] Folder di bots/ yang tidak ada di registry ditampilkan di bagian terpisah "tidak terdaftar, tidak dikelola master-bot" dengan keadaan hidup atau mati, hanya dibaca; sesi tmux tanpa folder di bots/ tidak pernah ditampilkan.
- [x] Kalau belum ada bot terdaftar, balasannya menjelaskan itu dan menyebut cara mendaftar.
- [x] Token tidak pernah muncul di balasan.
- [x] Dibuktikan dengan tes otomatis.
- [x] (owner) Pemilik mengirim /list dan melihat bot-botnya sesuai keadaan sebenarnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Bot yang ada di folder bots/ tetapi tidak terdaftar di registry (sekarang uji-01 dan uji-02 dari spike): tampilkan di /list atau tidak? Opsi: (a) diabaikan, /list hanya menampilkan registry; (b) ditampilkan di bagian terpisah 'tidak terdaftar, tidak dikelola master-bot' dengan keadaan hidup/mati, hanya dibaca, tanpa bisa di-/stop atau /restart. Rekomendasi (b): pemilik melihat semua yang memakai token di mesin ini, dan risikonya nol karena hanya membaca. Sesi tmux lain milik pemilik yang tidak punya folder di bots/ tidak pernah ditampilkan. Mendaftarkan bot lama (adopsi) tetap di luar tiket ini.
  → (b) folder yang tidak terdaftar ditampilkan di bagian terpisah "tidak terdaftar, tidak dikelola master-bot", hanya dibaca. Tidak ada tiket adopsi. (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Nilai status 'dihentikan sengaja' di registry bernama 'stopped' (ditambahkan ke BotStatus juga oleh 261112225302). /list menampilkannya sebagai 'dihentikan'; nilai status lain yang tak dikenal ditampilkan apa adanya, tidak membuat /list error.
  Why: Supaya 301 dan 302 bisa berjalan berdampingan tanpa saling menunggu
  If wrong: Ganti nama nilai di kedua tiket sebelum dikerjakan
  Confirmed by owner, 2026-11-13
- A2 [confirmed] 'Benar-benar hidup' dihitung dengan cek yang sama seperti launch.ts: sesi tmux '<nama>' ada, dan proses di state/bot.pid hidup. Tiga keadaan: hidup (keduanya), sesi ada tapi server plugin mati, mati (tidak ada sesi; bot.pid mati atau tidak ada). Hanya membaca: tidak ada sesi atau berkas yang diubah.
  Why: runningReason/isAlive di launch.ts sudah menjadi definisi 'berjalan' di proyek ini
  If wrong: Ubah daftar keadaan di list.ts
  Confirmed by owner, 2026-11-13
- A3 [confirmed] Tidak cocok berarti: active/registered tetapi mati, atau stopped tetapi masih hidup. failed dengan sesi masih ada ditampilkan wajar ('sesi dibiarkan untuk diperiksa'), karena penyalaan gagal memang sengaja membiarkan sesinya.
  Why: CLAUDE.md: sesi yang gagal dibiarkan hidup supaya bisa dilihat
  If wrong: Ubah aturan tanda di list.ts
  Confirmed by owner, 2026-11-13
- A4 [confirmed] /list ditambahkan ke COMMANDS (menu dan /help). Balasan teks biasa atau HTML ber-escape, satu baris per bot urut nama; registry.json rusak dijawab dengan pesan jelas dan detailnya di log.
  Why: Pola perintah yang ada di bot.ts dan menu.ts
  If wrong: Ubah format di list.ts
  Confirmed by owner, 2026-11-13
- A5 [confirmed] Folder di bots/ yang namanya tidak lolos aturan nama bot (mis. huruf besar) dan berkas biasa tidak ditampilkan di bagian tidak terdaftar
  Why: Nama seperti itu tidak bisa menjadi sesi tmux yang dikelola bot-squad, jadi bukan bot
  If wrong: Hapus syarat NAME_RULE di unregisteredFolders (list.ts)
  Confirmed by owner, 2026-11-13
- A6 [confirmed] Keadaan keempat ditambahkan: sesi tmux tidak ada tetapi server plugin masih hidup (server yatim). Dianggap tidak cocok untuk active dan stopped
  Why: Server yatim tetap memakai token; menyebutnya mati akan menyesatkan
  If wrong: Gabungkan plugin-only ke dead di probeBot (list.ts)
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: hanya membaca registry dan keadaan tmux/proses, tidak mengubah apa pun; tetap standard karena menyentuh penjaga token di balasan
- Berjalan berdampingan dengan 261112225302, tidak menunggu: /list hanya perlu nama status 'stopped' yang ditetapkan sekarang (A1), bukan kode 302. Keduanya menambah 'stopped' ke BotStatus dan perintah ke COMMANDS di bot.ts; tabrakan kecil itu diselesaikan merge queue.

## Manual checks
- M1 [ok] (item 8) 1. Jalankan master-bot: bun run --cwd master start di root repo.
  2. Di chat master-bot kirim /list.
  3. Lihat setiap bot terdaftar dengan @username, status tercatat, dan keadaan nyata; uji-01 dan uji-02 tampil di bagian 'Tidak terdaftar, tidak dikelola master-bot' dengan hidup/mati sesuai tmux ls.
  4. Matikan sesi satu bot aktif (tmux kill-session -t <nama>), kirim /list lagi: bot itu bertanda TIDAK COCOK.
  Checked by owner, 2026-11-13

## Handoff
Menambah /list (master/src/list.ts, disambung di bot.ts dan COMMANDS). Hanya membaca registry, folder bots/, tmux has-session, dan bot.pid; tidak boleh ada kill, start, atau tulis berkas di jalur ini (tes memotret folder data dan sesi tmux sebelum/sesudah). Keadaan nyata: hidup, sesi tanpa server plugin, server tanpa sesi, mati, tidak bisa diperiksa. Tanda TIDAK COCOK: active tidak hidup, registered mati, stopped masih berjalan; failed tidak pernah. Folder tidak terdaftar tampil di bagian terpisah; sesi tmux tanpa folder tidak pernah. createMasterBot menerima opsi probe (tmux, isAlive) untuk tes; main.ts memberi milik launchDeps. Balasan HTML, token apa pun (angka:20+ karakter) disensor. 302 menambah 'stopped' ke BotStatus; list.ts sudah mengenalnya tanpa bergantung pada tipe itu.

## Review
- 2026-11-13 standard, round 1, at f23b73e: passed.
  1: list.test.ts + list-process.test.ts lulus lewat k2 test (45 pass, tes proses tidak di-skip); salinan + tmux terpisah (TMUX_TMPDIR) + pid sleep sungguhan: tiap bot tampil nama, @username, tercatat, nyata, urut nama
  2: uji salinan: active dengan bot.pid mati dan tanpa sesi -> ⚠️ TIDAK COCOK; tes matriks mismatch status x keadaan
  3: uji salinan: stopped dengan sesi tmux hidup dan stopped dengan server yatim (plugin-only) -> TIDAK COCOK; stopped mati wajar
  4: uji salinan: uji-01 (sesi) dan uji-02 tampil di bagian 'Tidak terdaftar, tidak dikelola master-bot'; sesi 'pribadi' dan folder 'Besar' tidak tampil; potret stat folder data sebelum/sesudah identik, tmux ls tidak berubah, has-session tanpa server tidak menyalakan server
  5: tes registry kosong/tidak ada: 'Belum ada bot terdaftar' + /register <nama> <token> + @BotFather (juga lewat createMasterBot)
  6: uji salinan: token disunting ke username registry tersensor jadi '&lt;token disembunyikan&gt;'; list.ts tidak pernah membaca .env; tes memeriksa semua panggilan Telegram
  7: master/test/list.test.ts dan master/test/list-process.test.ts (main.ts sungguhan, tmux terpisah); asersinya pada keluaran listReport, bukan literal
  8: (owner) Manual checks M1 bisa diikuti dari awal dan berakhir pada yang harus terlihat
  note: balasan satu pesan tanpa pemecahan; sekitar 30+ bot akan melewati batas 4096 karakter Telegram dan kegagalan reply hanya tercatat di log (bot.catch). Belum relevan untuk jumlah bot sekarang.
  note: registered dengan server yatim (plugin-only) atau plugin-dead tidak ditandai; tiket tidak memintanya. Tidak ada skrip cek lain di repo selain bun test.
