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

Saat ini Claude harus ingat memakai parameter format khusus agar teks tebal, kode, dan tautan tampil rapi di Telegram. Kalau lupa, tanda seperti `**tebal**` tampil mentah di HP. Balasan panjang dipotong polos per panjang, sehingga blok kode yang terpotong bisa membuat sisa pesan berantakan. Di mirza-bots, Markdown biasa diubah otomatis ke format Telegram (termasuk meng-escape karakter yang membuat Telegram menolak pesan), dan blok kode yang terpotong ditutup lalu dibuka lagi di potongan berikutnya.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Balasan bot selalu tampil rapi di Telegram tanpa Claude harus ingat aturan format, juga saat balasannya panjang.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Claude cukup menulis Markdown biasa (tebal, miring, kode, blok kode, tautan, daftar) dan hasilnya tampil terformat di Telegram.
- [ ] Karakter yang biasanya membuat Telegram menolak pesan terformat tidak pernah membuat balasan gagal terkirim; kalau format tetap ditolak, balasan dikirim sebagai teks biasa, bukan hilang.
- [ ] Balasan yang lebih panjang dari batas Telegram dikirim sebagai beberapa pesan berurutan, dan blok kode yang terpotong tetap tampil sebagai blok kode di setiap potongan.
- [ ] Kutipan balasan tetap menempel di potongan pertama.
- [ ] Ada tes otomatis untuk konversi format, karakter khusus, dan pemotongan blok kode.
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik meminta jawaban panjang berisi kode dan melihat semuanya tampil rapi.
