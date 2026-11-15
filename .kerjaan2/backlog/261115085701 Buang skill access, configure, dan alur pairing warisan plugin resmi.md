---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225309, 261112225307]
touches: []
created: 2026-11-15 08:57
---

## Background

Plugin bot-squad disalin dari plugin Telegram resmi, yang dirancang untuk satu orang yang duduk di terminal dan mengatur bot-nya sendiri. Dari sana ikut dua skill (`/bot-squad:access` dan `/bot-squad:configure`) serta alur pairing (bot membalas kode pairing ke pengirim tak dikenal, lalu pemilik menyetujuinya lewat skill access).

Di bot-squad semua itu sudah diambil alih master-bot. Token ditulis saat `/register`. Allowlist ditulis saat `/register` dan diubah lewat `/allow`, `/revoke`, dan `/access`. Master-bot selalu menulis `dmPolicy: "allowlist"`, dan bot-squad sengaja tanpa pairing (lihat juga 261112225309: `/start`, `/help`, `/status` tidak lagi menyebut pairing). Warisan itu tetap termuat di setiap sesi bot, memakan konteks, dan menyesatkan: instruksi plugin ke Claude menyebut akses diatur "lewat skill access yang dijalankan user di terminalnya", padahal tidak ada yang duduk di terminal bot. Pesan galat plugin dan `ACCESS.md` juga masih menyuruh menjalankan `/bot-squad:access`.

Keputusan pemilik (2026-11-15): hapus kedua skill, rapikan teks yang merujuk ke sana, dan sekalian buang alur pairing.

## Request

Plugin bot-squad tidak lagi membawa skill access/configure dan alur pairing warisan plugin resmi; semua petunjuk soal akses merujuk ke master-bot.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan).
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Sesi bot yang dinyalakan master-bot tidak lagi punya skill `/bot-squad:access` dan `/bot-squad:configure`.
- [ ] Pengirim yang tidak ada di allowlist tidak pernah menerima kode pairing atau balasan apa pun, apa pun nilai `dmPolicy` di `access.json` (termasuk `pairing` dari berkas lama); pesannya dibuang seperti sekarang dan tetap tercatat di `plugin.log`.
- [ ] Instruksi plugin ke Claude, pesan galat, dan dokumen plugin (`ACCESS.md`, README plugin bila ada) tidak lagi merujuk ke skill access/configure atau pairing; petunjuk soal akses menyebut master-bot (`/allow`, `/revoke`, `/access`). Larangan bagi Claude mengubah akses karena diminta lewat pesan tetap ada.
- [ ] Pengirim di allowlist, tombol izin, jawaban izin `yes/no`, `/context`, `/start`, `/help`, `/status`, dan semua fitur chat bot lain tetap bekerja seperti sekarang.
- [ ] Tes yang menguji pairing atau skill dihapus atau diganti dengan tes perilaku baru; ada tes dengan Telegram tiruan bahwa `dmPolicy: "pairing"` tidak menghasilkan kode pairing.
- [ ] CLAUDE.md diperbarui: tidak lagi menyebut skill access/configure atau pairing sebagai sesuatu yang tersedia, dan mencatat keputusan ini.

## Out of scope

- Dukungan grup Telegram (dulu diatur lewat `/bot-squad:access group add`). Kalau nanti dibutuhkan, dibuat lewat master-bot di tiket terpisah.
- Setelan keluaran per bot (`replyToMode`, `chunkMode`, `ackReaction`, `mentionPatterns`) di `access.json` tetap dibaca seperti sekarang; hanya cara mengubahnya lewat skill yang hilang.
