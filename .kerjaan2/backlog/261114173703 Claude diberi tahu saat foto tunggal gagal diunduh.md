---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261114101204]
touches: []
created: 2026-11-14 17:37
---

## Background

Reviewer tiket 261114101204 (album) menemukan bahwa foto tunggal yang gagal diunduh (Telegram menolak, atau unduhan tidak berhasil) diteruskan ke Claude hanya dengan kapsinya atau tulisan "(photo)", tanpa gambar dan tanpa keterangan bahwa unduhan gagal. Claude tidak tahu ada foto yang hilang. Untuk album, plugin sudah memberi tahu foto mana yang gagal dan meminta Claude memberi tahu pengirim. Pemilik memintanya dijadikan tiket (2026-11-14).

## Request

Saat foto tunggal gagal diunduh, Claude tahu dan bisa memberi tahu pemilik, sama seperti pada album.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal karena paket belum terpasang.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Foto tunggal yang gagal diunduh tetap diteruskan ke Claude dengan kapsinya, ditambah keterangan yang jelas bahwa fotonya gagal diunduh dan sebaiknya pengirim diberi tahu.
- [ ] Keterangan itu tidak bisa dipalsukan pengirim dengan mengetik teks yang sama.
- [ ] Foto tunggal yang berhasil diunduh dan album tidak berubah perilakunya.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk foto tunggal yang gagal diunduh, dan tes itu gagal pada kode sekarang.
