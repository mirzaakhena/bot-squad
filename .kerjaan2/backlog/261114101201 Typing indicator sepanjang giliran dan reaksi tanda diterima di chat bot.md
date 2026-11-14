---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-14 10:12
---

## Background

Saat pemilik mengirim pesan ke bot, tanda "typing…" di Telegram hanya muncul sekali dan padam sekitar 5 detik kemudian, padahal Claude biasanya bekerja jauh lebih lama. Akibatnya bot tampak diam seperti mati. Plugin juga punya pengaturan reaksi emoji tanda pesan diterima, tetapi master-bot tidak pernah mengisinya, jadi tidak pernah muncul.

Di mirza-bots, indikator diperbarui setiap 4 detik sampai balasan pertama, dengan batas aman 300 detik supaya tidak nyangkut kalau giliran berakhir tanpa balasan.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Pemilik selalu bisa melihat dari Telegram bahwa pesannya sudah diterima dan bot sedang bekerja, sampai balasan pertama datang.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Setelah pesan dari pengirim yang diizinkan diteruskan ke Claude, tanda "typing…" terus terlihat di chat sampai bot mengirim balasan pertama.
- [ ] Tanda itu berhenti paling lama 300 detik setelah pesan masuk, juga kalau Claude tidak pernah membalas.
- [ ] Pesan dari pengirim yang tidak diizinkan, perintah plugin (/start, /help, /status, /context), dan jawaban izin tidak memunculkan tanda "typing…".
- [ ] Pesan pemilik mendapat reaksi emoji tanda diterima begitu diteruskan ke Claude; bot baru yang didaftarkan lewat master-bot mendapatkannya tanpa pengaturan manual.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk indikator yang diperbarui, berhenti di balasan pertama, dan batas 300 detik (boleh dengan waktu yang dipercepat).
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengirim pesan yang butuh waktu lama dan melihat "typing…" bertahan sampai balasan datang.
