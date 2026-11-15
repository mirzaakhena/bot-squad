---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 21:09
---

## Background

Sejak tiket 261115202403, perintah master-bot tanpa nama (`/stop`, `/restart`, `/new`, `/logs`, `/access`, `/delete`, `/revoke`) menampilkan bot terdaftar sebagai tombol. Reviewer tiket itu menemukan bahwa pemilih menampilkan **semua** nama di `registry.json`, juga nama yang tidak lolos aturan nama bot (huruf kecil, angka, dan `-`), misalnya `../luar` di registry yang diedit tangan.

Kalau diketik, nama seperti itu ditolak dengan cara pakai sebelum apa pun disentuh. Lewat tombol, pekerjaannya jalan: `/stop`, `/restart`, dan `/delete` menolak nama itu sendiri di lapisan bawah, tetapi `/access` dan `/revoke` bisa membaca atau menulis `access.json` di luar folder `bots/`.

Master-bot sendiri tidak pernah menulis nama tidak sah ke registry, jadi ini hanya terjadi kalau registry diedit tangan atau rusak. Nama bot dipakai sebagai nama folder dan nama sesi tmux, jadi aturan nama harus berlaku di semua jalur.

## How to reproduce

1. Siapkan folder data uji dengan `registry.json` berisi satu bot sah dan satu entri bernama `../luar`.
2. Jalankan master-bot terhadap folder data itu, lalu kirim `/access` tanpa argumen.
3. Tombol `../luar` tampil. Menekannya membuat master-bot membaca `access.json` di luar folder `bots/`, padahal `/access ../luar` yang diketik dijawab cara pakai.

## Request

Jalur tombol memperlakukan nama bot persis seperti jalur yang diketik: nama yang tidak lolos aturan nama tidak pernah menjadi tombol dan tidak pernah dijalankan.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.


## Done when

- [ ] Pemilih bot hanya menampilkan nama yang lolos aturan nama bot; nama tidak sah di registry tidak tampil sebagai tombol untuk perintah mana pun.
- [ ] Ketukan tombol yang entah bagaimana merujuk nama tidak sah ditolak sebelum berkas, sesi, atau proses apa pun dibaca atau diubah.
- [ ] `/access` dan `/revoke` lewat tombol tidak pernah membaca atau menulis berkas di luar folder `bots/` di folder data, dibuktikan dengan registry uji yang memuat nama seperti `../luar`.
- [ ] Kalau registry hanya berisi nama tidak sah, perintah tanpa argumen dijawab seperti belum ada bot, tanpa tombol.
- [ ] Bot bernama sah di registry yang sama tetap tampil dan bekerja seperti sekarang; perintah yang diketik tidak berubah.
- [ ] Ada tes untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [ ] Dokumentasi proyek mencatat bahwa pemilih mengabaikan nama tidak sah.

## Out of scope

- Memperbaiki atau melaporkan registry yang berisi nama tidak sah (misalnya di `/list`).
