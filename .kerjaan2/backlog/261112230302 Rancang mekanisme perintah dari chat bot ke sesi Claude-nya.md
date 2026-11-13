---
type: task
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: [CLAUDE.md]
created: 2026-11-12 23:03
---

## Background

Pemilik ingin beberapa perintah diketik langsung di chat bot (mirza_00X), bukan di master-bot, dan berlaku untuk sesi Claude bot itu: /new, /rename, /context, /interrupt, dan meneruskan slash Claude Code lainnya. Saat ini semua yang diketik di chat bot diteruskan ke Claude sebagai pesan biasa, kecuali /start, /help, dan /status bawaan plugin. Plugin berjalan di dalam pane tmux bot itu sendiri, jadi secara prinsip ia bisa mengetik ke sesi Claude-nya, tetapi belum ada yang mencobanya.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin. Pemilik menekankan bahwa mekanisme wrapper di sana belum ada padanannya di bot-squad dan butuh penyesuaian.

## Request

Putuskan dan buktikan satu cara yang aman agar **daftar perintah terpilih** dari chat bot bisa sampai ke sesi Claude bot itu sebagai slash command (bukan sebagai pesan biasa), sebagai dasar untuk tiket-tiket perintah chat bot.

Cakupan (keputusan pemilik 2026-11-13): bot-squad hanya menjalankan beberapa perintah yang penting dan sering dipakai, bukan meneruskan slash Claude Code apa pun. Daftar awal: `/new` (= `/clear` lalu `/rename <nama>`, urutannya bagian dari kontrak, seperti mirza-bots), `/rename`, `/interrupt`, dan `/branch`/`/switch`. Perintah di luar daftar tidak diketik ke sesi. Penerusan slash umum dengan konfirmasi (261112230305) dibatalkan. Tiket ini **ditunda**: perintah chat bot yang tidak mengetik ke sesi Claude (seperti `/context`) didahulukan.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] CLAUDE.md mencatat mekanisme yang dipilih, alasannya, dan perbandingannya dengan mekanisme mirza-bots.
- [ ] Ada bukti nyata dengan bot uji bahwa satu perintah sederhana dari chat bot dijalankan oleh sesi Claude-nya sebagai slash command.
- [ ] CLAUDE.md mencatat risiko yang harus dijaga tiap perintah dalam daftar terpilih: perintah yang datang saat Claude sedang bekerja, perintah yang membuka dialog/picker (mis. pindah sesi) dan bisa membuat sesi menggantung, dan perintah basi yang tertunda.
- [ ] CLAUDE.md mencatat bahwa hanya perintah dalam daftar terpilih yang diketik ke sesi, dan apa yang terjadi pada slash lain dari chat bot.
- [ ] Hanya pengirim yang diizinkan di bot itu yang bisa memicu perintah.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [blocking] Bukti nyata 'perintah dari chat bot dijalankan sebagai slash command' harus tanpa token asli dan tanpa menyentuh uji-01/uji-03. Opsi A (rekomendasi): sesi claude sungguhan dengan plugin bot-squad sungguhan di server tmux terpisah, HOME/BOT_SQUAD_HOME sementara, pesan chat disuntik lewat Telegram tiruan (BOT_SQUAD_TELEGRAM_API_ROOT); memakai akun Claude pemilik (slash tanpa giliran AI, kuota hampir nol), dengan langkah ulang tercatat di CLAUDE.md. Opsi B: seperti A, ditambah cek (owner) dengan bot uji sungguhan dari HP setelah fitur pertama dibuat. Opsi C: pemilik menyiapkan token bot uji khusus untuk spike ini (melanggar aturan 'tanpa token asli', jadi tidak disarankan).
- Q2 [blocking] Seberapa dalam risiko diuji dalam spike? Opsi A (rekomendasi): tiga risiko diamati langsung di sesi uji dan hasilnya dicatat (slash dikirim saat Claude sedang mengerjakan giliran; satu perintah terpilih yang membuka picker (mis. untuk /switch) untuk melihat apakah sesi menggantung dan cara keluarnya, mis. Escape; perintah yang tertunda saat sesi belum siap), plus usulan pagar tiap risiko. Opsi B: hanya risiko 'saat Claude sedang bekerja' yang diamati, dua lainnya dicatat sebagai analisis tanpa uji. Opsi C: semuanya analisis saja dari kode dan pengalaman mirza-bots.
- Q3 [blocking] Bentuk hasil dan perlu dipecah? Opsi A (rekomendasi): satu tiket; kode spike hanya di scratchpad (subfolder 261112230302), tidak masuk repo; yang masuk hanya CLAUDE.md: mekanisme usulan, perbandingan dengan cc-wrapper/slash/ mirza-bots, risiko, aturan izin, bukti spike. Rancangan lalu didiskusikan sebelum tiket fitur dibuka. Alasan: Done when hanya 4 baris, dan kode yang masuk sebelum diskusi bisa membelokkan rancangan. Opsi B: pecah jadi dua tiket berurutan (spike dulu, lalu rancangan). Opsi C: satu tiket, tetapi modul dasar 'ketik ke sesi sendiri' ikut masuk plugin/ beserta tes.

## Assumptions
- A1 [unseen] Spike utama: plugin mengetik ke pane tmux-nya sendiri (TMUX/TMUX_PANE yang diwarisi dari sesi) dengan tmux send-keys; mengetik dari master-bot (luar sesi) dan wrapper PTY ala cc-wrapper dicatat sebagai alternatif dalam perbandingan
  Why: Pemilik menyebut send-keys sebagai kandidat pengganti wrapper; bot sudah berjalan di tmux
  If wrong: Spike ulang dengan master-bot sebagai pengetik
- A2 [unseen] Perintah bukti adalah slash bawaan Claude Code yang tidak membuka dialog dan tidak memakai giliran AI (mis. /rename <nama>), dipicu dari perintah chat uji; terbukti kalau transkrip atau layar sesi menunjukkan slash itu dijalankan, bukan diterima sebagai pesan biasa
  Why: Done when meminta 'perintah sederhana'; slash tanpa giliran AI tidak memakai kuota
  If wrong: Ganti perintah bukti
- A3 [unseen] Baris izin dibuktikan di spike: pengirim di luar allowFrom (dan chat grup) mengirim perintah yang sama, dan tidak ada yang diketik ke sesi; aturannya sama dengan contextAllowed di plugin/context.ts
  Why: Konvensi /context (261112230304): hanya allowFrom di DM
  If wrong: Pakai aturan izin lain

## Decisions
- Lane standard: hasilnya catatan rancangan dan spike di luar repo, mudah dibatalkan, tetapi spike menyentuh sesi Claude sungguhan di tmux
- Tidak solo dan tidak menunggu: tidak membaca hasil tiket lain; 261112235501 hanya berbagi CLAUDE.md (bagian lain), diselesaikan merge queue. Tiket fitur chat bot (261112225305, 261112230303, 261112230306, 261112230308; 261112230305 dibatalkan) nanti harus menunggu tiket ini dan diskusi rancangannya.
