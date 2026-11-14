---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261114101205]
touches: []
created: 2026-11-14 17:37
---

## Background

Reviewer tiket 261114101205 (Markdown otomatis dan potongan rapi) menemukan beberapa cacat kecil pada pemotongan balasan panjang, dan pemilik memintanya dijadikan tiket (2026-11-14):
1. Baris kosong di dalam blok kode hilang di titik potong (contoh: blok kode berisi 40 baris kosong dengan batas 200 karakter kehilangan 4 baris).
2. Blok kode yang menjorok di dalam butir daftar tidak dikenali, sehingga tanda penutupnya tampil sebagai backtick mentah.
3. Baris paragraf yang sangat panjang dipotong di spasi dan bisa membelah teks tebal atau kode pendek, sehingga formatnya bergeser.
4. Setiap potongan hanya terisi sekitar setengah batas Telegram (sekitar 33 ribu karakter kode menjadi 17 pesan).

## Request

Balasan panjang dipotong tanpa kehilangan isi atau merusak format, dan memakai jumlah pesan sesedikit mungkin.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal karena paket belum terpasang.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Baris kosong di dalam blok kode tidak pernah hilang di titik potong.
- [ ] Blok kode di dalam butir daftar tetap tampil sebagai blok kode di setiap potongan.
- [ ] Teks tebal, miring, dan kode pendek tidak pernah terbelah di antara dua potongan.
- [ ] Potongan diisi sedekat mungkin dengan batas Telegram (tanpa melewatinya), sehingga jumlah pesan untuk balasan panjang jauh berkurang dibanding sekarang.
- [ ] Tes otomatis mencakup keempat kasus di atas dan gagal pada kode sekarang.
- [ ] CLAUDE.md diperbarui bila perilakunya berubah.
