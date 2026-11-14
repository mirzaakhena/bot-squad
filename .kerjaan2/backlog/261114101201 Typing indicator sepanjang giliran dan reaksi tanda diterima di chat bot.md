---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/typing.ts, plugin/test/typing.test.ts, CLAUDE.md]
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

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [blocking] Reaksi tanda diterima: emoji apa, dan berlaku untuk bot mana? A (rekomendasi): plugin memakai 👀 sebagai bawaan kalau ackReaction di access.json tidak diisi, jadi semua bot (termasuk bot-01..03 yang sudah ada) mendapatkannya setelah dinyalakan ulang, dan ackReaction "" tetap mematikannya; paling sederhana dan tidak perlu menulis ulang access.json. B: master-bot menulis ackReaction 👀 ke access.json hanya saat /register, sehingga bot lama tidak berubah. C: emoji lain (sebutkan; harus ada di daftar reaksi Telegram, mis. 👍 👌 ⚡).

## Assumptions
- A1 [unseen] Typing diperbarui setiap 4 detik di chat asal pesan dan berhenti pada panggilan reply pertama yang berhasil ke chat itu (termasuk reply yang hanya berisi files); react dan edit_message tidak menghentikannya. Pesan baru saat typing masih hidup memulai ulang hitungan 300 detik dari pesan terbaru. Gagal sendChatAction (429, jaringan) ditelan dan dicatat paling banyak sebagai baris plugin.log, tidak pernah menggagalkan penerusan.
  Why: Sama dengan mirza-bots (typing.ts: TYPING_PING_INTERVAL_MS 4000, TYPING_MAX_MS 300000, stop di balasan pertama).
  If wrong: Ubah konstanta atau titik berhenti di plugin/typing.ts.
- A2 [unseen] Reaksi tanda diterima dipasang sekali saat pesan diteruskan dan tidak dicopot setelah Claude membalas; jawaban izin tetap memakai reaksi ✅/❌ yang sudah ada.
  Why: Perilaku plugin upstream sekarang; Done when hanya meminta reaksi muncul.
  If wrong: Tambah penghapusan reaksi di jalur reply.

## Decisions
- Lane standard: perilaku UX plugin, tanpa data yang tak bisa dipulihkan. Tidak menunggu apa pun; 261114101204 dan 261114101206 menunggu tiket ini karena album dan tekan tombol harus memakai keepalive typing yang sama.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
