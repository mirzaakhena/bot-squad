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

- [x] CLAUDE.md mencatat temuan tentang mekanisme bawaan Claude Code untuk berkirim pesan antarsesi (cara pengalamatan, apakah session-id bisa menjadi alamat, apakah penerima bisa membalas), dari pemeriksaan statis tanpa uji kirim (keputusan pemilik Q5), setiap klaim diberi tanda belum dibuktikan dan sumbernya (berkas, string program, dokumentasi), serta versi Claude Code yang diperiksa.
- [x] CLAUDE.md mencatat apa yang dibutuhkan agar mekanisme itu aktif di sesi bot (flag, pengaturan, env), atau bukti bahwa ia tidak aktif atau tidak bisa memakai session-id sebagai alamat.
- [x] CLAUDE.md mencatat cara mendapatkan alamat sesi terkini (session-id dan/atau alamat kirimnya) sebuah bot dari namanya, beserta alasan mengapa hasilnya tetap benar setelah bot dinyalakan ulang dan setelah percakapan baru (`/clear`), ditandai belum dibuktikan.
- [x] CLAUDE.md memuat rancangan fitur untuk tahap 2 (261113230601): alamat hanya nama bot, pencarian session-id setiap kali, jawaban ke pengirim untuk nama tak terdaftar dan bot mati (tanpa pesan hilang diam-diam), aturan izin (semua bot terdaftar saling boleh, pengirim di luar bot terdaftar ditolak dan bagaimana itu ditegakkan), dan pencegah pesan berputar.
- [x] CLAUDE.md mencatat batasan keamanan rancangan itu, termasuk bahwa semua bot berjalan bebas izin dan apakah sesi Claude yang bukan bot (sesi pemilik) bisa mengirim ke atau menerima dari bot lewat mekanisme yang sama.
- [x] Kalau mekanisme bawaan tidak bisa dipakai, CLAUDE.md mencatat sebabnya beserta perbandingan dengan alternatif kotak surat berkas per bot (pola mirza-bots), tanpa memilih sendiri.
- [x] Hanya CLAUDE.md yang berubah di repo; langkah uji yang belum dijalankan (termasuk kendala login dengan HOME sementara) tercatat cukup rinci supaya bisa dibuktikan di tahap 2.
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
- Q5 [answered] Spike terhenti (aturan Q4): dengan HOME sementara Claude 2.1.323 tampil 'Not logged in', karena Keychain login tidak terlihat dari HOME uji. Terpakai 1 start, 0 giliran; semua sesi uji sudah dibersihkan. Pilihan: A (rekomendasi) pemilik membuat token sekali dengan 'claude setup-token', disimpan 0600 di luar repo, diberikan sebagai env CLAUDE_CODE_OAUTH_TOKEN hanya ke sesi uji; HOME sementara tetap, tanpa perubahan global. B: sesi uji memakai HOME asli; launch.ts lalu menulis trust ke ~/.claude.json asli (dilarang Q3) dan sesi uji terlihat oleh sesi pemilik dan bot-01..03. C: rancangan dari temuan statis saja, tanpa uji kirim.
  → Rancangan tanpa uji: rancangan ditulis dari temuan statis saja, tanpa membuktikan kirim pesan. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Kalau mekanisme bawaan tidak bisa dipakai, worker tidak membuat prototipe kotak surat berkas; cukup perbandingan tertulis di CLAUDE.md lalu dibawa ke pemilik
  Why: Background: hasil itu dibawa ke pemilik bersama alternatif ini, bukan diputuskan sendiri
  If wrong: Tambah spike kotak surat di tiket terpisah

## Decisions
- Lane strict: walau hasilnya hanya CLAUDE.md, spike menjalankan sesi Claude bebas izin yang bisa menjangkau sesi pemilik lewat mekanisme lintas sesi, dan rancangan keamanannya menjadi dasar tahap 2
- Tidak solo dan tidak menunggu: hanya mengubah CLAUDE.md (bagian baru) dan tidak membaca hasil tiket lain; papan kosong
- Dipecah: tiket ini spike + rancangan (berakhir di diskusi pemilik); implementasi di 261113230601
- 2026-11-13 the owner changed what this ticket asks for: Pemilik Q5: Rancangan tanpa uji: rancangan ditulis dari temuan statis saja, tanpa membuktikan kirim pesan.
- Red-proof: tidak ada guard kode yang ditambahkan (hanya dokumentasi CLAUDE.md, keputusan Q5 tanpa uji), jadi tidak ada yang bisa dipatahkan, all red tidak berlaku

## Manual checks
- M1 [waiting] (item 8) 1. Buka CLAUDE.md bagian 'Bot berkirim pesan ke bot lain'.
  2. Baca rancangan tahap 2, batasan keamanan, dan tabel alternatif.
  3. Pilih: rancangan soket (cari_bot + SendMessage), varian B (plugin menulis ke soket), atau kotak surat berkas; juga cara membuktikan (token setup-token atau HOME asli).
  4. Jawaban dicatat di tiket 261113230601 sebelum dikerjakan.

## Handoff
Hanya CLAUDE.md: bagian baru 'Bot berkirim pesan ke bot lain' sebelum 'Concern'. Isinya temuan statis Claude Code 2.1.323 (SendMessage/ListAgents, soket /tmp/cc-socks/<pid>.sock, registri ~/.claude/sessions/<pid>.json, session-id bukan alamat lokal), cara nama bot ke alamat uds lewat pane tmux dan registri, rancangan tahap 2 (cari_bot, error eksplisit, izin semua bot, kepala hop), batasan keamanan, tabel alternatif kotak surat, dan langkah uji yang belum dijalankan termasuk kendala login HOME sementara. Semua klaim bertanda BD (belum dibuktikan) sesuai Q5; jangan hapus tanda itu sebelum ada uji sungguhan. 261113230601 bergantung pada persetujuan pemilik atas bagian ini.

## Review
- 2026-11-13 strict, round 1, at 5118e70: passed.
  1: strings biner 2.1.323 dicek ulang: ListAgents, cc-socks, to = nama sesi atau uds:/bridge:, sid: di balik tengu_session_stable_address (default false), amplop from/from-session/hop-chain, verifiedPeerPid, notice held beda mode izin; semua bertanda BD dengan sumber
  2: biner memuat '[uds-messaging] Skipped: gate off / restricted session / remote thin client'; registri sesi bot-01..03 (field tmux bot-0N) punya messagingSocketPath
  3: tmux list-sessions pane_pid bot-01 41638, bot-02 16186, bot-03 21326 = pid berkas registri; kode Qn({sessionId:U,...}) saat session switch ada di biner; alasan restart dan /clear tertulis, bertanda BD
  4: 'Rancangan tahap 2': alamat nama saja, cari_bot setiap kirim tanpa cache, tiga error eksplisit dilapor ke pemilik, izin semua bot + cek_pengirim (diakui bisa dipalsukan, opsi hook), kepala hop/balasan, varian B
  5: 'Batasan keamanan': bypass, satu user Unix dan kunci .key terbaca, sesi pemilik dan bot saling terlihat dua arah (dibenarkan registri: bot-0N bersama sesi kerjaan2/bot-squad/mirbot)
  6: mekanisme belum terbukti tak bisa dipakai; tabel banding kotak surat ada, pilihan diserahkan ke pemilik
  7: diff main...HEAD --name-only hanya CLAUDE.md (commit 5118e70); langkah uji, kendala login, pembersihan rinci. Tanpa kode, uji patah-kode tidak berlaku; repo tak punya skrip/CI selain bun test
  8: (owner) M1 bisa diikuti dari awal dan berakhir pada pilihan yang dicatat di 261113230601
  note: biner memotong putaran sendiri (hop-loop/hop-runaway, duplicate, rate-limited, queue-full) dan bisa 'hold every message'; rancangan hanya menyebut hop-chain, pertimbangkan di tahap 2
  note: BD 'tmux menyisipkan shell' bisa ditutup statis (pane_pid = pid registri); template inject memakai env CLAUDE_CODE_MESSAGING_TOKEN, relevan untuk varian B dan batasan keamanan
