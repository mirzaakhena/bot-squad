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

- [ ] `/start` dari pengirim yang diizinkan tidak dibalas apa pun dan tidak diteruskan ke Claude (termasuk `/start <teks>` dan `/start@<username bot>`), tanpa "typing…" dan reaksi.
- [ ] `/start` itu tercatat di `plugin.log` sebagai tidak diteruskan; `/start` dari pengirim di luar daftar akses dibuang seperti sekarang.
- [ ] Menu bot dan teks `/help` tidak lagi memuat `/start`; menu yang ditulis saat bot menyala menggantikan menu lama yang masih memuatnya.
- [ ] `/help`, `/status`, `/context`, dan pesan biasa bekerja seperti sekarang.
- [ ] Instruksi plugin ke Claude dan dokumen plugin tidak lagi menyebut `/start` sebagai perintah yang tersedia.
- [ ] Ada tes dengan Telegram tiruan untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [ ] Dokumentasi proyek mencatat perubahan ini dan keputusan pemilik.

## Out of scope

- `/start` di master-bot (tiket 261115202401).
