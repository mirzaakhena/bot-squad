---
type: feature
priority: high
lane: standard
labels: []
blocked_by: [261112225302]
related: [261112235501]
touches: [master/src/main.ts, master/src/revive.ts, master/src/bot.ts, master/test/revive.test.ts, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Setelah server reboot atau crash, semua sesi bot mati. Daftar bot tetap mencatatnya aktif, tetapi tidak ada yang menyalakannya lagi. Ini concern "ketahanan" di CLAUDE.md.

## Request

Saat master-bot menyala, ia mencocokkan daftar bot dengan sesi yang benar-benar hidup, lalu menyalakan ulang bot yang seharusnya hidup. Bot yang sengaja dihentikan pemilik tidak ikut dinyalakan.

## Done when

- [x] Saat master-bot menyala, setiap bot berstatus active atau registered yang tidak berjalan dinyalakan ulang.
- [x] Bot berstatus failed tidak dinyalakan otomatis; ringkasan menyebutnya dengan petunjuk /restart <nama>.
- [x] Bot yang sengaja dihentikan pemilik dan bot yang sudah berjalan tidak disentuh.
- [x] Setiap kali master-bot menyala dan registry berisi minimal satu bot, pemilik menerima satu pesan ringkasan: bot mana yang dinyalakan ulang, mana yang gagal, dan mana yang dibiarkan. Registry kosong tidak mengirim pesan.
- [x] Bot yang gagal dinyalakan ulang tidak menghalangi bot lain.
- [x] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik mematikan semua sesi bot, menyalakan ulang master-bot, dan bot-bot itu hidup kembali.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Status mana yang termasuk 'seharusnya hidup' saat master-bot menyala? Opsi: (a) hanya 'active'; (b) 'active' dan 'registered' (registered berarti master mati sebelum hasil penyalaan tercatat); (c) semua kecuali 'stopped', termasuk 'failed'. Rekomendasi (b): bot yang 'failed' bisa gagal lagi setiap master menyala; bot itu dibiarkan dan disebut di ringkasan dengan petunjuk /restart <nama>. Catatan: bot yang penyalaannya terputus karena master dihentikan juga tercatat 'failed', jadi dengan (b) bot itu tidak ikut dinyalakan otomatis.
  → (b) active dan registered; bot failed dibiarkan dan disebut di ringkasan dengan petunjuk /restart. (owner, 2026-11-13)
- Q2 [answered] Kapan pesan ringkasan dikirim? Opsi: (a) setiap master-bot menyala selama registry berisi minimal satu bot, termasuk kalau semuanya sudah berjalan atau dihentikan; (b) hanya kalau ada bot yang dinyalakan ulang atau gagal. Rekomendasi (a): pemilik selalu tahu master baru menyala dan keadaan semua bot; registry kosong tidak mengirim apa-apa.
  → (a) ringkasan dikirim setiap kali master menyala selama registry berisi minimal satu bot. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Penyalaan otomatis dimulai di latar belakang setelah bot.init dan menu tersinkron, jadi master-bot langsung melayani perintah. Semua bot yang perlu dinyalakan diproses bersamaan lewat launchBot (pemasangan plugin sudah berkunci), dan kegagalan satu bot hanya masuk ringkasan.
  Why: Spike 261112184702 membuktikan banyak bot bisa dinyalakan bersamaan; pola launchInBackground di bot.ts
  If wrong: Ganti menjadi satu per satu di revive.ts
- A2 [unseen] Berjalan = runningReason di launch.ts (sesi tmux ada atau server plugin bot.pid hidup). Bot yang sudah berjalan, termasuk yang statusnya 'stopped' tetapi dinyalakan manual, tidak disentuh dan statusnya tidak diubah. Bot yang dinyalakan dicatat active/failed seperti /register. Folder bots/ yang tidak terdaftar tidak pernah disentuh.
  Why: Done when 'yang sudah berjalan tidak disentuh'; registry sumber kebenaran
  If wrong: Ubah aturan pilih di revive.ts
- A3 [unseen] Ringkasan satu pesan, dikirim lewat sendWithRetry setelah semua penyalaan selesai: satu baris per bot (dinyalakan ulang / gagal + alasan singkat + petunjuk /restart atau tmux attach / dibiarkan + sebabnya), tanpa potongan layar dan tanpa token. Bot yang sedang diproses /restart atau /stop memakai kunci per bot dari 261112225302 dan dilewati dengan keterangan. Kalau master-bot berhenti di tengah, penyalaan diputus seperti /register dan ringkasan tidak dipaksakan.
  Why: Done when 'satu pesan ringkasan'; pola laporan dan signal yang sudah ada
  If wrong: Ubah format di revive.ts

## Decisions
- Lane standard: menyalakan bot lewat launchBot yang sudah teruji; tidak membuat cara mematikan baru
- Menunggu 261112225302: memakai status 'stopped' dan kunci per bot (sibuk) yang dibuat di sana, supaya penyalaan otomatis tidak bertabrakan dengan /stop atau /restart.
- Registry rusak saat menyala tetap mengirim satu pesan berisi sebabnya tanpa menyalakan bot: pemilik perlu tahu kenapa tidak ada yang hidup kembali; Done when hanya melarang pesan untuk registry kosong.

## Manual checks
- M1 [waiting] (item 7) 1. Pastikan master-bot berjalan dan minimal satu bot terdaftar berstatus aktif (cek dengan /list).
  2. Hentikan master-bot (Ctrl+C).
  3. Matikan semua sesi bot: tmux kill-session -t '=<nama>' untuk tiap bot (atau reboot server).
  4. Jalankan lagi: bun run --cwd master start.
  5. Dalam beberapa detik pemilik menerima satu pesan 'master-bot menyala. Keadaan N bot terdaftar:' dengan bot-bot itu di bagian 'Dinyalakan ulang'.
  6. tmux ls menampilkan sesinya lagi, /list menunjukkan 'aktif · nyata: hidup', dan bot membalas chat. Bot yang dihentikan dengan /stop tetap mati dan disebut 'dihentikan pemilik'.

## Handoff
Baru: master/src/revive.ts (reviveBots, reviveReport, reviveAndReport), dipanggil di serve() main.ts setelah syncCommandMenu dan sebelum bot.start, di latar belakang dan didaftarkan ke set launches supaya ikut ditunggu saat berhenti. main.ts kini membuat satu BotLocks dan satu probe yang dipakai bersama createMasterBot dan penyalaan otomatis; jangan membuat kunci kedua. Aturan: active/registered dinyalakan lewat launchBot (yang sudah berjalan menjadi already-running, status tidak diubah); failed/stopped/status lain hanya diperiksa dengan runningReason dan dibiarkan. Registry dibaca sekali secara sinkron di awal; tes yang butuh registry tanpa penyalaan otomatis harus menulisnya setelah master polling (lihat list-process.test.ts). Ringkasan satu pesan lewat sendWithRetry, tidak dikirim kalau registry kosong atau master berhenti.

## Review
- 2026-11-13 standard, round 1, at 818c086: passed.
  1: revive-process (k2 test, salinan, HOME/tmux terpisah): a-aktif/b-terdaftar dapat sesi baru, tercatat active; setelah kill-server dua bot active hidup lagi. Mutasi failed/stopped ke SHOULD_RUN menggagalkan 6 tes.
  2: revive-process: d-gagal tidak dinyalakan, tetap failed, ringkasan 'Coba lagi dengan /restart d-gagal'; tertangkap mutasi di atas.
  3: revive-process: e-stop tidak dinyalakan; pid pane f-hidup/g-stop-hidup/sesi-pribadi tetap; x-liar tak disentuh. Tes tambahan reviewer: selama penyalaan otomatis /restart dan /stop dijawab 'sedang dinyalakan', satu sesi, status active (kunci bersama).
  4: revive-process: satu ringkasan per start (dua start, dua pesan) dengan tiga bagian; registry kosong tanpa sendMessage (proses dan unit).
  5: revive-process: c-rusak tercatat failed, a/b tetap hidup; tes unit bot yang melempar error tidak menghalangi bot lain.
  6: revive.test.ts (20) dan revive-process.test.ts (3) lulus. Suite penuh tidak diulang sesuai brief; repo tak punya skrip/CI lain.
  7: (owner) M1 bisa diikuti dari awal dan diakhiri dengan hasil yang terlihat.
  note: who() di revive.ts tidak meng-escape e.name; nama tulisan tangan di registry yang berisi < atau & bisa membuat ringkasan HTML ditolak 400. Lewat /register tidak mungkin.
  note: kalau bot.start gagal (409) setelah penyalaan otomatis dimulai, proses keluar tanpa memutus penyalaan; polanya sama dengan /register.
