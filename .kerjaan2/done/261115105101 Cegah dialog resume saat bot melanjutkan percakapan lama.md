---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 10:51
---

## Background

Sejak tiket 261115100301, `/restart <nama>` dan penyalaan otomatis melanjutkan percakapan terakhir bot. Claude Code bisa menampilkan dialog saat membuka percakapan lama, dan penyalaan bot bergantung pada teks di layar: kalau dialog tak dikenal muncul, master-bot tidak menjawabnya dan menyalakan bot sekali lagi dengan percakapan kosong (jaring pengaman, disetujui pemilik). Akibatnya bot dengan percakapan lama dan besar, persis keadaan setelah server reboot, bisa kehilangan percakapannya.

Temuan foreman dari membaca kode di biner Claude Code 2.1.325 (`~/.local/share/claude/versions/2.1.325`), **belum dibuktikan dengan dijalankan**:

- Dialog "This session is ... old and ... tokens" (pilihan "Resume from summary", "Resume full session as-is", "Don't ask me again") muncul kalau: flag server `tengu_gleaming_fair` atau `tengu_gleaming_fair_reuse` hidup (bawaan mati), `resumeReturnDismissed` di konfigurasi global belum diset, pesan terakhir lebih tua dari `CLAUDE_CODE_RESUME_THRESHOLD_MINUTES` (bawaan 70), dan perkiraan token di atas `CLAUDE_CODE_RESUME_TOKEN_THRESHOLD` (bawaan 100 ribu). Syaratnya dihitung dari isi percakapan, jadi berlaku sama untuk `--continue` dan `--resume <uuid>`.
- "Don't ask me again" menulis `resumeReturnDismissed: true` ke konfigurasi global Claude (berlaku untuk semua sesi di mesin, termasuk sesi pemilik).
- Ada dua dialog atau tawaran lain saat membuka sesi lama yang juga dimatikan `resumeReturnDismissed` tetapi tidak oleh variabel ambang: peringatan kuota saat membuka sesi lama (kata kunci `tengu_cold_resume_quota_shown`) dan tawaran pindah ke model lebih baru (kata kunci `resume_on_newer_model`, `tengu_hidden_volcano`).

Keputusan pemilik (2026-11-15): tetap `--continue`; jaring pengaman tetap; tambah pencegahan supaya dialognya tidak muncul di bot, tanpa menyentuh sesi pemilik.

## Request

Bot yang melanjutkan percakapan lama dan besar tidak terhalang dialog resume Claude Code, dengan cara yang hanya berlaku untuk sesi bot.

Arahan:
- Cara utama: master-bot memberi variabel lingkungan ambang (`CLAUDE_CODE_RESUME_THRESHOLD_MINUTES`, `CLAUDE_CODE_RESUME_TOKEN_THRESHOLD`) dengan nilai sangat besar ke setiap sesi bot yang dibukanya. Worker memeriksa dulu di biner bahwa kedua nama itu memang dibaca dari lingkungan proses dan bagaimana nilainya ditafsirkan.
- Dua dialog lain di atas diperiksa: kapan muncul, apakah bisa dicegah hanya untuk sesi bot (variabel lingkungan atau `--settings` sesi), dan kalau tidak bisa, apa pilihan yang tersisa. **Konfigurasi global Claude milik pemilik (`~/.claude.json`, `~/.claude/settings.json`) tidak boleh ditulis di tiket ini**; kalau satu-satunya jalan adalah `resumeReturnDismissed` di konfigurasi global, itu dicatat sebagai pilihan untuk pemilik, bukan dikerjakan.
- Jaring pengaman (dialog tak dikenal berarti bot dinyalakan dengan percakapan kosong dan melapor) tetap ada dan tidak diubah.
- Yang terbukti dengan dijalankan dan yang hanya dari membaca biner harus dibedakan jelas di dokumentasi.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Setiap sesi bot yang dibuka master-bot (lewat `/register`, `/restart`, penyalaan otomatis) dan lewat `scripts/start-bot.sh` membawa kedua variabel ambang dengan nilai yang membuat dialog "session is ... old" tidak muncul menurut kode Claude Code; ada tes untuk itu.
- [x] Sesi Claude lain di mesin (sesi pemilik) tidak terpengaruh: tidak ada berkas konfigurasi Claude yang ditulis.
- [x] Jaring pengaman tetap bekerja seperti sekarang, dan tesnya tetap lulus.
- [x] Dokumentasi proyek mencatat: syarat dialog itu, cara pencegahannya, hasil pemeriksaan dua dialog lain (bisa dicegah per sesi atau tidak, dan pilihan untuk pemilik kalau tidak), serta mana yang terbukti dijalankan dan mana yang hanya dari membaca biner dan versi Claude Code-nya.
- [x] Seluruh tes tetap lulus.
- [ ] (owner) Pada bot yang percakapannya lebih tua dari 70 menit dan besar, `/restart <nama>` melapor `Percakapan terakhir dilanjutkan.` dan bot masih ingat percakapannya.

## Out of scope

- Mengganti `--continue` dengan `--resume <uuid>`.
- Menjawab dialog secara otomatis dengan mengetik ke layar.
- Menulis `resumeReturnDismissed` ke konfigurasi global Claude.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Dua dialog lain (peringatan kuota dan tawaran model baru) dibiarkan ke jaring pengaman; tidak ada pencegahan yang dipasang
  Why: Tidak ada variabel ambang untuk keduanya; cara per sesi yang ada (mematikan semua flag server atau prompt caching) berefek luas dan belum diuji, dan konfigurasi global dilarang di tiket ini
  If wrong: Pilih salah satu pilihan B-E di docs/menyalakan-bot.md lalu buat tiket baru

## Manual checks
- M1 [waiting] (item 6) 1. Hentikan lalu jalankan lagi master-bot dari kode terbaru (bun run --cwd master start).
  2. Pilih bot yang percakapannya besar (/context di chat bot: di atas 100 ribu token) dan pesan terakhirnya lebih dari 70 menit lalu.
  3. Kirim /restart <nama> ke master-bot.
  4. Laporan kedua memuat 'aktif' dan 'Percakapan terakhir dilanjutkan.'
  5. Tanyakan sesuatu dari percakapan lama di chat bot; bot masih ingat. Kalau laporan menyebut 'dialog tak terduga', kirim /logs <nama> untuk melihat dialognya.

## Handoff
launch.ts kini memberi setiap sesi bot dua variabel lingkungan (RESUME_THRESHOLD_ENV lewat sessionEnv, diteruskan tmux -e): CLAUDE_CODE_RESUME_THRESHOLD_MINUTES dan CLAUDE_CODE_RESUME_TOKEN_THRESHOLD bernilai 999999999, supaya dialog 'This session is ... old' Claude Code tidak muncul saat --continue. Berlaku untuk /register, /restart, penyalaan otomatis, dan start-bot.sh. Jangan diganti nilai bukan angka polos: Claude membuangnya dan memakai bawaan. Tidak boleh menulis ~/.claude.json. Jaring pengaman dialog tak terduga tidak diubah. Dua dialog lain (kuota, model baru) tidak dicegah; syarat dan pilihan pemilik di docs/menyalakan-bot.md. claude tiruan di tes proses mencatat env.log.

## Review
- 2026-11-15 standard, round 1, at d55302d: passed.
  1: newSession satu-satunya pembuka sesi dan memakai sessionEnv. 4 berkas tes lulus 115/115; mutasi (ambang dibuang) di salinan menggagalkan 9 tes di semua jalur. Biner 2.1.325: _qe baca process.env lewat H.int() (parseInt, tanpa batas); umur<ambang atau token<ambang = tanpa dialog.
  2: Diff hanya menambah env tmux -e. Saya ulangi claude 2.1.325 sungguhan (HOME sementara, tmux -S) dengan --continue pada transkrip 5 jam/2 MB: tanpa dialog, ps -E memuat kedua variabel, .claude.json uji tanpa resumeReturnDismissed.
  3: Kode jaring pengaman tidak ada di diff; tes 'dialog tak terduga' (launch.test.ts) dan r-03 (revive-process.test.ts) lulus.
  4: docs/menyalakan-bot.md memuat syarat 3 dialog, pencegahan, pilihan A-E, dan daftar terpisah terbukti vs dari biner 2.1.325. Cek acak ke biner cocok (amber_tally, hidden_volcano, maxAsks 2/168 jam, minPercent 5). Rincian lain dialog 2 dan 3 dinilai dengan membaca saja.
  5: Lulus menurut catatan papan pada isi yang sama (02deb970b3), tidak diulang; 4 berkas terkait saya jalankan ulang: 115 lulus.
  6: (owner) M1 bisa diikuti dari awal sampai hasil yang diharapkan.
  note: Bahwa variabel menahan dialog 1 di akun dengan flag server hidup belum terbukti dijalankan (tanpa login flag mati); dokumen menyatakannya jujur. Tidak ada skrip/CI lain selain bun test. Berkas dan tmux uji saya sudah dibersihkan.
