---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 20:24
---

## Background

Plugin bot-squad menjawab `/start` di chat bot dengan teks penjelasan (tiket 261112225309) dan menampilkannya di menu bot. Pemilik menganggap `/start` tidak berguna; `/help` sudah menjelaskan hal yang sama.

Telegram tetap mengirim `/start` sendiri saat seseorang pertama kali membuka chat sebuah bot dan menekan tombol Start. Kalau penanganannya dibuang total, `/start` dari orang yang diizinkan akan diteruskan ke Claude sebagai pesan biasa dan memakai satu giliran, pada setiap orang baru yang diberi akses.

Keputusan pemilik (2026-11-15): `/start` dibuang dari menu dan `/help` bot; kalau tetap datang, ditelan diam-diam dan tidak diteruskan ke Claude.

## Request

`/start` tidak lagi menjadi perintah di chat bot: tidak tampil di menu maupun `/help`, tidak dibalas, dan tidak pernah sampai ke Claude.

Rincian:
- Pengirim yang diizinkan, di chat pribadi: `/start` (juga `/start <teks>` dan `/start@<username bot>`) tidak dibalas, tidak diteruskan ke Claude, tanpa "typing…" dan tanpa reaksi tanda diterima. Tetap tercatat di `plugin.log` sebagai tidak diteruskan.
- Pengirim yang tidak diizinkan: dibuang seperti sekarang.
- `/help`, `/status`, dan `/context` bekerja seperti sekarang; `/help` tidak lagi menyebut `/start`.
- Menu bot di Telegram tidak lagi memuat `/start`, juga untuk bot yang menunya pernah ditulis versi lama.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] `/start` dari pengirim yang diizinkan tidak dibalas apa pun dan tidak diteruskan ke Claude (termasuk `/start <teks>` dan `/start@<username bot>`), tanpa "typing…" dan reaksi.
- [x] `/start` itu tercatat di `plugin.log` sebagai tidak diteruskan; `/start` dari pengirim di luar daftar akses dibuang seperti sekarang.
- [x] Menu bot dan teks `/help` tidak lagi memuat `/start`; menu yang ditulis saat bot menyala menggantikan menu lama yang masih memuatnya.
- [x] `/help`, `/status`, `/context`, dan pesan biasa bekerja seperti sekarang.
- [x] Instruksi plugin ke Claude dan dokumen plugin tidak lagi menyebut `/start` sebagai perintah yang tersedia.
- [x] Ada tes dengan Telegram tiruan untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [x] Dokumentasi proyek mencatat perubahan ini dan keputusan pemilik.

## Out of scope

- `/start` di master-bot (tiket 261115202401).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] /start ditelan untuk siapa pun dan di chat apa pun (juga grup dan /start dari orang tak diizinkan), tercatat tidak-diteruskan
  Why: Perilaku ini sudah berlaku sebelum tiket untuk pengirim tak diizinkan dan grup (penangan perintah menelannya); tiket meminta 'seperti sekarang'
  If wrong: Batasi penangan start di plugin/server.ts ke chat pribadi dan teruskan sisanya ke next()
  Confirmed by owner, 2026-11-15

## Handoff
Di plugin/server.ts penangan /start kini kosong (bot.command('start', () => {})): /start, /start <teks>, /start@<bot> ditelan tanpa balasan, tanpa typing dan reaksi, tidak diteruskan ke Claude, dan tercatat tidak-diteruskan di plugin.log lewat middleware pencatat. Baris start dibuang dari setMyCommands (all_private_chats: help, status, context) dan dari teks /help. Jangan hapus penangan kosong itu: tanpa dia /start dari tombol Start Telegram menjadi pesan biasa dan memakai giliran Claude. Tes: plugin/test/commands.test.ts. Dokumen: docs/fitur-chat-bot.md, docs/log-bot.md, CLAUDE.md. master/ tidak disentuh.

## Review
- 2026-11-15 standard, round 1, at b6021cf: passed.
  1: Probe sendiri (server plugin sungguhan, Telegram tiruan, salinan HEAD): /start, /start abc, /start@bot dari pemilik = 0 panggilan Telegram dan 0 notifikasi channel (main: dibalas). /started, start, '/start' di tengah teks tetap diteruskan dengan typing dan reaksi.
  2: Probe: /start pemilik tercatat hasil=tidak-diteruskan. /start orang tak diizinkan: tanpa balasan, tanpa notifikasi, hasil=tidak-diteruskan, persis sama dengan main (probe sama di salinan main); pesan biasanya tetap hasil=dibuang. A1 tidak mengubah log.
  3: Probe: menu lama berisi start di Telegram tiruan menjadi help,status,context setelah menyala (main: masih start); balasan /help tanpa /start.
  4: Probe: /help dibalas, pesan biasa diteruskan dengan typing dan reaksi; commands, no-pairing, context-command, typing-server 21 lulus lewat k2 test di salinan.
  5: Probe: instruksi di jawaban initialize MCP tanpa '/start'; grep di plugin/*.ts, *.md, .claude-plugin hanya menyisakan dua komentar kode tentang /start yang ditelan.
  6: commands.test.ts dibaca: asersinya bisa gagal (panggilan Telegram kosong, menu persis, 4 baris log, tanpa notifikasi), untuk allowlist dan pairing; lulus. Kumpulan penuh lulus pada isi ini menurut brief, tidak diulang.
  7: Dengan membaca: docs/fitur-chat-bot.md memuat keputusan pemilik 2026-11-15 dan perilaku ditelan; docs/log-bot.md dan dua baris CLAUDE.md diperbarui. Sisa '/start' di docs hanya milik master-bot (di luar cakupan).
  note: /START (huruf besar) dan /start@<bot lain> dari pemilik diteruskan ke Claude sebagai pesan biasa, sama dengan main; tombol Start Telegram mengirim huruf kecil, jadi tidak memblokir.
  note: commands.test.ts tidak menguji teks mirip (/started, start, /start di tengah); terbukti lewat probe reviewer saja. Tidak ada cek lain di repo selain bun test.
