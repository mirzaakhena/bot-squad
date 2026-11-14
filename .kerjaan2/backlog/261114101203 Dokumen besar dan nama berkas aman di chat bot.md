---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-14 10:12
---

## Background

Telegram hanya mengizinkan bot mengunduh berkas sampai 20 MB. Belum jelas apa yang terjadi di bot-squad saat pemilik mengirim dokumen yang lebih besar. Nama berkas dari pengirim juga bisa berisi teks yang menyerupai instruksi atau jalur folder (misalnya `../../.zshrc`). mirza-bots menyaring nama berkas dan memberi tahu AI kalau berkas terlalu besar.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Dokumen yang dikirim pemilik selalu sampai ke Claude dengan aman: yang bisa diunduh tersedia, yang terlalu besar dijelaskan, dan nama berkas tidak bisa dipakai untuk menipu Claude atau menulis di luar folder bot.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Dokumen sampai 20 MB bisa diunduh dan dibaca Claude seperti sekarang.
- [ ] Dokumen di atas 20 MB tidak diunduh, dan Claude menerima nama serta ukurannya beserta keterangan bahwa berkas terlalu besar, sehingga bisa memberi tahu pemilik.
- [ ] Nama berkas yang diunduh tidak pernah keluar dari folder unduhan bot dan tidak membawa teks yang bisa terbaca sebagai instruksi.
- [ ] Ada tes otomatis untuk dokumen kecil, dokumen terlalu besar, dan nama berkas berbahaya.
- [ ] CLAUDE.md menjelaskan perilaku ini.
