---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261114101206]
touches: []
created: 2026-11-14 17:37
---

## Background

Reviewer tiket 261114101206 (tombol pilihan) menemukan bahwa tombol jawab-sendiri bisa tampil dua kali. Plugin hanya mengenali label persis `✏️ Explain manually` (dengan karakter variasi emoji tersembunyi) sebagai tombol jawab-sendiri. Kalau Claude menulis `✏ Explain manually` tanpa karakter itu (persis cara pemilik menulisnya), tombol itu dianggap tombol biasa, lalu plugin menempelkan tombol resmi lagi di baris terakhir. Pemilik memintanya dijadikan tiket (2026-11-14).

## Request

Setiap keyboard pilihan selalu punya tepat satu tombol jawab-sendiri, apa pun variasi cara Claude menulis labelnya.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal karena paket belum terpasang.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Label jawab-sendiri yang ditulis Claude dengan variasi kecil (tanpa karakter variasi emoji, spasi berlebih, huruf besar/kecil berbeda) dikenali sebagai tombol jawab-sendiri dan tidak menghasilkan tombol kedua.
- [ ] Tombol jawab-sendiri yang tampil tetap berlabel persis `✏️ Explain manually` dan tetap di baris terakhir.
- [ ] Tombol lain yang labelnya hanya mirip tetapi bukan jawab-sendiri tidak ikut dibuang.
- [ ] Ada tes otomatis yang gagal pada kode sekarang untuk varian tanpa karakter variasi emoji.
