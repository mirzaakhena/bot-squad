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

Saat pemilik mengirim beberapa foto sekaligus (album), Telegram mengirimnya sebagai beberapa pesan terpisah, dan plugin meneruskannya ke Claude satu per satu. Claude bisa mulai menjawab foto pertama sebelum foto berikutnya datang. Di mirza-bots, album digabung jadi satu pesan lewat jeda tunggu singkat, maksimal 10 item, diurutkan sesuai urutan di album, caption diberi label `Photo <n>:`, dan satu foto yang gagal diunduh tidak menggagalkan seluruh pesan.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Album foto dari pemilik sampai ke Claude sebagai satu pesan berisi semua fotonya, dalam urutan yang benar.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Beberapa foto yang dikirim sebagai satu album diteruskan ke Claude sebagai satu pesan berisi semua foto, sesuai urutan di album.
- [ ] Caption yang ada di beberapa foto tetap terbaca dan jelas milik foto yang mana.
- [ ] Kalau satu foto gagal diunduh, foto lain tetap sampai dan Claude diberi tahu ada yang gagal.
- [ ] Foto tunggal dan pesan teks tidak terlambat karena jeda tunggu album.
- [ ] Album dari pengirim yang tidak diizinkan tetap dibuang tanpa diunduh.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk album, album dengan foto gagal, dan foto tunggal.
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengirim album 3 foto dan Claude menanggapinya sebagai satu pesan.
