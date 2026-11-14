---
type: feature
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-14 10:12
---

## Background

Sesi Claude sebuah bot bisa berjalan lama sampai konteksnya hampir penuh, dan pemilik baru tahu kalau mengetik /context. Di mirza-bots, saat konteks terpakai melewati ambang (400 ribu token di sana), pesan berikutnya ke AI membawa pengingat. Pengingat itu hanya menempel pada pesan yang memang datang (tidak membangunkan AI sendiri) dan hilang sendiri begitu kondisinya tidak lagi terpenuhi. Keputusan memulai percakapan baru tetap milik pemilik. Data konteks sudah tersedia di bot-squad lewat statusline yang dipakai /context.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Saat konteks sesi bot menipis, Claude diingatkan supaya bisa memberi tahu pemilik, tanpa pemilik harus memeriksa sendiri.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Saat pemakaian konteks sesi bot melewati ambang, pesan pemilik berikutnya yang diteruskan ke Claude membawa pengingat bahwa konteks menipis beserta angkanya.
- [ ] Pengingat tidak pernah dikirim sendirian (tidak membangunkan Claude tanpa pesan pemilik) dan berhenti sendiri setelah konteks kembali di bawah ambang (misalnya setelah percakapan baru).
- [ ] Kalau data konteks tidak tersedia atau basi, tidak ada pengingat yang salah.
- [ ] Ada tes otomatis untuk di atas ambang, di bawah ambang, dan data tidak ada.
- [ ] CLAUDE.md menjelaskan perilaku dan ambangnya.
