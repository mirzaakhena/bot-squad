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

Saat ini tombol di chat bot hanya dipakai untuk permintaan izin. Claude tidak bisa menawarkan pilihan berupa tombol, jadi pemilik harus mengetik jawabannya. Di mirza-bots, AI bisa mengirim tombol; pilihan yang ditekan diteruskan ke AI; tombol dicopot setelah ditekan dan pesannya ditandai dengan pilihan itu supaya tidak bisa dijawab dua kali; tombol bernomor wajib punya daftar bernomor di badan pesan; dan data tombol dijaga di bawah batas 64 byte Telegram.

Permintaan pemilik (2026-11-14): tombol pilihan **selalu** punya pilihan terakhir untuk menjawab sendiri, seperti di mirza-bots. Di sana tombolnya `✏️ Explain manually`, ditempelkan otomatis oleh mesin sebagai baris terakhir di setiap keyboard pilihan (bukan oleh AI), dengan penghapusan duplikat kalau AI menulisnya sendiri (cc-plugin/src/engine/messages.ts, `MANUAL_FALLBACK_BUTTON` dan `withManualFallback`).

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Claude bisa menawarkan pilihan berupa tombol di chat bot, pemilik cukup menekan satu tombol untuk menjawab, dan selalu ada tombol terakhir untuk menjawab dengan kata-kata sendiri.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Claude bisa mengirim pesan dengan tombol pilihan, dan pilihan yang ditekan pemilik sampai ke Claude sebagai jawaban.
- [ ] Setiap keyboard pilihan otomatis punya tombol terakhir untuk menjawab sendiri (setara `✏️ Explain manually` di mirza-bots), ditambahkan oleh plugin, bukan bergantung pada Claude, dan tidak muncul dua kali.
- [ ] Setelah sebuah tombol ditekan, tombol-tombol pesan itu hilang dan pesannya menunjukkan pilihan yang diambil, sehingga tidak bisa dijawab dua kali.
- [ ] Tombol yang tidak masuk akal ditolak sebelum apa pun terkirim, dengan pesan yang menjelaskan cara memperbaikinya ke Claude: data tombol melebihi batas Telegram, atau tombol bernomor tanpa daftar bernomor yang cocok di badan pesan.
- [ ] Hanya pengirim yang diizinkan yang bisa menekan tombol; tombol izin yang sudah ada tetap bekerja seperti sekarang.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk mengirim tombol, menekan tombol, tombol jawab sendiri, dan penolakan tombol yang salah.
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik meminta Claude memberi pilihan, menekan salah satu tombol, lalu mencoba tombol jawab sendiri.
