---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: [261113230601, 261112230302]
touches: [CLAUDE.md]
created: 2026-11-12 23:03
---

## Background

mirza-bots punya fitur bot berbicara dengan bot lain (bagian "Bicara ke bot lain" di README-nya). Di bot-squad belum ada, dan ini fitur besar tersendiri. Lane strict karena setiap bot berjalan dengan izin bebas, sehingga pesan antarbot bisa menjadi jalan menyuruh bot lain menjalankan apa saja.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

Catatan pemilik (2026-11-12): Claude Code sudah punya mekanisme bawaan untuk berkirim pesan antarsesi, asalkan session-id sesi tujuan diketahui. Sesi foreman bot-squad sendiri pernah menerima pesan dari sesi lain lewat mekanisme ini. Jadi kemungkinan besar yang perlu dibangun adalah mencatat session-id setiap bot (misalnya di daftar bot), bukan jalur pesan baru. Session-id yang tercatat juga berguna untuk /branch dan /switch (261112230308).

Keputusan pemilik (2026-11-13, diskusi dengan foreman):
- Bot menyebut tujuan hanya dengan **nama bot** (misalnya bot-02), tidak pernah dengan session-id. Session-id bisa berubah (restart, percakapan baru), jadi tidak boleh menjadi alamat yang dipegang bot.
- Pemilik **tidak setuju** menamai sesi Claude sama dengan nama bot sebagai cara pengalamatan.
- Yang diinginkan: mekanisme yang **mencari session-id terkini dari nama bot setiap kali** sebuah bot mau menghubungi bot itu. Dasarnya: satu bot selalu hidup di tepat satu sesi pada satu waktu. Lalu pesan dikirim lewat mekanisme bawaan Claude Code ke session-id itu.
- Izin awal: **semua bot terdaftar boleh mengirim ke semua bot terdaftar** (pemilik memilih ini walau semua bot berjalan bebas izin).
- Alternatif yang disebut foreman dan belum dipilih: kotak surat berkas per bot (pola mirza-bots, tanpa session-id). Kalau mekanisme bawaan Claude Code ternyata tidak bisa mengirim ke session-id (atau tidak aktif di sesi bot), hasil itu dibawa ke pemilik bersama alternatif ini, bukan diputuskan sendiri.

## Request

Tiket ini adalah **tahap 1 dari 2** (dipecah planner 2026-11-13): spike dan rancangan saja, berakhir di diskusi dengan pemilik. Implementasinya ada di 261113230601, yang menunggu tiket ini selesai dan rancangannya disetujui pemilik.

Buktikan dengan sesi uji sungguhan apakah mekanisme bawaan Claude Code untuk berkirim pesan antarsesi bisa mengirim pesan ke sesi bot lain berdasarkan session-id, di sesi yang dinyalakan persis seperti bot bot-squad (`claudeArgv` di `master/src/launch.ts`: `--setting-sources project,local`, `--dangerously-skip-permissions`, `--plugin-dir`, `--dangerously-load-development-channels`). Cari juga cara memetakan nama bot ke session-id terkininya. Lalu tulis rancangan fitur di CLAUDE.md untuk didiskusikan dengan pemilik. Yang masuk repo hanya CLAUDE.md; skrip spike tinggal di scratchpad.

Kandidat sumber session-id (catatan, bukan keputusan): `session_id` di payload statusline yang sudah ditangkap ke `<state>/status.json` oleh bridge /context; hook `SessionStart` lewat `--settings` per sesi; transkrip `~/.claude/projects/<workspace>/`. Mekanisme lintas sesi di mesin ini tampak berbasis socket unix (`/tmp/cc-socks/<pid>.sock`) dan daftar agen; apakah session-id bisa dipakai sebagai alamat, dan apakah fitur itu aktif di sesi bot, belum terbukti.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad`: pemilik sedang menguji bot-01, bot-02, bot-03 asli yang terdaftar di sana.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`, dengan socket di `/tmp/k2-261112230309-*` (path scratchpad terlalu panjang untuk socket); hapus sesudahnya. Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- **Jangan mengirim pesan antarsesi ke sesi pemilik mana pun**, termasuk sesi foreman dan sesi Claude lain yang terlihat di daftar agen atau `/tmp/cc-socks`. Spike hanya antar sesi uji milik tiket ini sendiri; setiap perintah ke sesi uji menyebut tujuan uji secara persis, jangan biarkan sesi uji memilih tujuan sendiri.
- Tanpa token asli (pakai Telegram tiruan lewat `BOT_SQUAD_TELEGRAM_API_ROOT` kalau plugin perlu jalan).
- Sesi Claude uji memakai akun pemilik (Q2): paling banyak 2 sesi uji hidup bersamaan, paling banyak 8 kali menyalakan sesi sepanjang spike, paling banyak 10 giliran AI total, model default (tanpa --model).
- Syarat tambahan (Q3): flag, `--settings`, atau env hanya boleh ditambahkan per sesi uji. Dilarang menulis `~/.claude/settings.json`, `~/.claude.json` asli, atau managed settings; kalau mekanismenya butuh perubahan global, berhenti dan bawa ke pemilik.
- HOME uji (Q4): HOME sementara berisi SALINAN `~/.claude.json` dan `~/.claude/settings.json` (disalin, tanpa symlink); login dari Keychain macOS; trust ditulis launch.ts ke salinan. Kalau Claude meminta login atau onboarding, berhenti dan laporkan; jangan pakai HOME asli.
- Berkas sementara di scratchpad sesi, di subfolder `261112230309`, bukan di repo.
- Kalau pengaman izin menolak sesuatu, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Spike dijalankan di sesi uji yang dinyalakan seperti bot bot-squad (argumen dari `claudeArgv`), antar sesi uji sendiri saja, dan CLAUDE.md mencatat hasilnya: apakah mekanisme bawaan Claude Code bisa mengirim pesan ke sesi lain berdasarkan session-id dan apakah penerima bisa membalas ke pengirim, dengan bukti (kutipan layar atau transkrip) dan versi Claude Code yang diuji.
- [ ] CLAUDE.md mencatat apa yang dibutuhkan agar mekanisme itu aktif di sesi bot (flag, pengaturan, env), atau bukti bahwa ia tidak aktif atau tidak bisa memakai session-id sebagai alamat.
- [ ] CLAUDE.md mencatat cara mendapatkan session-id terkini sebuah bot dari namanya, dengan bukti bahwa hasilnya berubah dengan benar setelah sesi uji dinyalakan ulang dan setelah memulai percakapan baru (`/clear`).
- [ ] CLAUDE.md memuat rancangan fitur untuk tahap 2 (261113230601): alamat hanya nama bot, pencarian session-id setiap kali, jawaban ke pengirim untuk nama tak terdaftar dan bot mati (tanpa pesan hilang diam-diam), aturan izin (semua bot terdaftar saling boleh, pengirim di luar bot terdaftar ditolak dan bagaimana itu ditegakkan), dan pencegah pesan berputar.
- [ ] CLAUDE.md mencatat batasan keamanan rancangan itu, termasuk bahwa semua bot berjalan bebas izin dan apakah sesi Claude yang bukan bot (sesi pemilik) bisa mengirim ke atau menerima dari bot lewat mekanisme yang sama.
- [ ] Kalau mekanisme bawaan tidak bisa dipakai, CLAUDE.md mencatat sebabnya beserta perbandingan dengan alternatif kotak surat berkas per bot (pola mirza-bots), tanpa memilih sendiri.
- [ ] Hanya CLAUDE.md yang berubah di repo; langkah spike tercatat cukup rinci untuk diulang.
- [ ] (owner) Pemilik menyetujui rancangan (atau memilih alternatif) sebelum 261113230601 dikerjakan.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Setuju tiket ini dipecah? Opsi A (rekomendasi): 261112230309 = spike + rancangan di CLAUDE.md saja (skrip spike di scratchpad, tidak masuk repo), berakhir di diskusi dengan pemilik; implementasi di tiket baru 261113230601 yang menunggu 261112230309 dan tetap di backlog sampai rancangan disetujui. Alasan: kode yang masuk sebelum mekanismenya terbukti bisa membelokkan rancangan, dan hasil spike bisa memaksa pilihan alternatif kotak surat. Opsi B: satu tiket tetap, worker berhenti di tengah setelah spike untuk menunggu persetujuan. Opsi C: tiga tiket (spike, rancangan, implementasi).
  → A: spike+rancangan di tiket ini, implementasi di 261113230601 menunggu di backlog. Pemecahan dan lane strict disetujui. (owner, 2026-11-13)
- Q2 [answered] Batas pemakaian akun Claude pemilik untuk spike? Opsi A (rekomendasi): paling banyak 2 sesi uji hidup bersamaan (pengirim dan penerima), paling banyak 8 kali menyalakan sesi sepanjang spike (termasuk uji restart dan /clear), dan paling banyak 10 giliran AI total; /clear, /rename dan restart tidak memakai giliran. Model default sesi bot (tanpa --model). Opsi B: lebih ketat, 2 sesi, 4 kali menyala, 4 giliran (risiko: tidak cukup kalau perlu mencoba beberapa cara). Opsi C: lebih longgar, 3 sesi, 15 kali menyala, 25 giliran.
  → A: maks 2 sesi hidup bersamaan, 8 start total, 10 giliran AI total, model default. (owner, 2026-11-13)
- Q3 [answered] Kalau mekanisme bawaan hanya aktif dengan tambahan flag, pengaturan, atau env, apa yang boleh dicoba worker? Opsi A (rekomendasi): boleh menambah flag/--settings/env per sesi uji saja (seperti statusline di claudeArgv) dan mencatatnya sebagai syarat; dilarang menulis ~/.claude/settings.json, ~/.claude.json asli, atau managed settings; kalau syaratnya butuh perubahan global, berhenti dan bawa ke pemilik. Opsi B: hanya konfigurasi persis bot saat ini; kalau tidak aktif, catat dan bawa ke pemilik. Opsi C: boleh mengubah pengaturan user dengan cadangan (tidak disarankan: menyentuh sesi pemilik).
  → A: flag/setting/env hanya per sesi uji; dilarang menulis ~/.claude/settings.json, ~/.claude.json asli, managed settings; kalau butuh perubahan global, berhenti dan bawa ke pemilik. (owner, 2026-11-13)
- Q4 [answered] HOME mana untuk sesi Claude uji (butuh login dan trust)? Opsi A (rekomendasi): HOME sementara berisi SALINAN ~/.claude.json dan ~/.claude/settings.json (tanpa symlink, cek find -type l); login dari Keychain macOS; trust ditulis launch.ts ke salinan. Kalau Claude meminta login/onboarding di HOME sementara, berhenti dan laporkan, jangan pakai HOME asli. Opsi B: HOME asli untuk claude, hanya BOT_SQUAD_HOME sementara (lebih mudah, tetapi launch.ts menulis trust folder uji ke ~/.claude.json asli yang dipakai sesi pemilik). Opsi C: CLAUDE_CONFIG_DIR sementara dengan HOME asli (belum pernah diuji di proyek ini).
  → A: HOME sementara berisi salinan ~/.claude.json dan ~/.claude/settings.json tanpa symlink; login dari Keychain; kalau diminta login/onboarding, berhenti dan lapor. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Kalau mekanisme bawaan tidak bisa dipakai, worker tidak membuat prototipe kotak surat berkas; cukup perbandingan tertulis di CLAUDE.md lalu dibawa ke pemilik
  Why: Background: hasil itu dibawa ke pemilik bersama alternatif ini, bukan diputuskan sendiri
  If wrong: Tambah spike kotak surat di tiket terpisah

## Decisions
- Lane strict: walau hasilnya hanya CLAUDE.md, spike menjalankan sesi Claude bebas izin yang bisa menjangkau sesi pemilik lewat mekanisme lintas sesi, dan rancangan keamanannya menjadi dasar tahap 2
- Tidak solo dan tidak menunggu: hanya mengubah CLAUDE.md (bagian baru) dan tidak membaca hasil tiket lain; papan kosong
- Dipecah: tiket ini spike + rancangan (berakhir di diskusi pemilik); implementasi di 261113230601
