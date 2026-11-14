---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261114101205, 261114101201]
related: []
touches: [plugin/server.ts, plugin/buttons.ts, plugin/test/buttons.test.ts, CLAUDE.md]
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
- [ ] Setiap keyboard pilihan otomatis punya tombol terakhir untuk menjawab sendiri berlabel persis `✏️ Explain manually` seperti mirza-bots, ditambahkan oleh plugin, bukan bergantung pada Claude, dan tidak muncul dua kali. Saat ditekan, tombolnya dicopot, pesannya ditandai dengan pilihan itu, dan Claude diberi tahu bahwa pemilik akan mengetik jawabannya sendiri.
- [ ] Setelah sebuah tombol ditekan, tombol-tombol pesan itu hilang dan pesannya menunjukkan pilihan yang diambil, sehingga tidak bisa dijawab dua kali.
- [ ] Tombol yang tidak masuk akal ditolak sebelum apa pun terkirim, dengan pesan yang menjelaskan cara memperbaikinya ke Claude: data tombol melebihi batas Telegram, atau tombol bernomor tanpa daftar bernomor yang cocok di badan pesan.
- [ ] Hanya pengirim yang diizinkan yang bisa menekan tombol; tombol izin yang sudah ada tetap bekerja seperti sekarang.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk mengirim tombol, menekan tombol, tombol jawab sendiri, dan penolakan tombol yang salah.
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik meminta Claude memberi pilihan, menekan salah satu tombol, lalu mencoba tombol jawab sendiri.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Tombol jawab-sendiri: label dan akibatnya saat ditekan? A (rekomendasi): label '✏️ Jawab sendiri'; saat ditekan, tombol dicopot dan pesan ditandai '→ ✏️ Jawab sendiri', lalu Claude menerima pemberitahuan bahwa pemilik akan mengetik jawabannya sendiri (Claude menunggu pesan berikutnya, tidak menebak pilihan). B: sama tetapi label Inggris '✏️ Explain manually' persis mirza-bots. C: saat ditekan tidak ada yang diteruskan ke Claude, hanya tombol dicopot; pemilik langsung mengetik.
  → '✏ Explain manually' — opsi B: label persis mirza-bots '✏️ Explain manually', perilaku sama dengan A (tombol dicopot, pesan ditandai, Claude diberi tahu pemilik akan menjawab sendiri). (owner, 2026-11-14)

## Assumptions
- A1 [unseen] Parameter reply.buttons: daftar baris berisi {text, data?} (data bawaan = text), menempel di potongan terakhir (kalau ada files, di pesan teks). callback_data diberi awalan sendiri (mis. 'c:'); batas 64 byte termasuk awalan; data berawalan 'perm:' atau awalan plugin ditolak. Tombol berlabel angka saja wajib punya baris bernomor yang cocok di badan pesan (aturan mirza-bots messages.ts).
  Why: mirza-bots messages.ts (MAX_CALLBACK_DATA_BYTES, numbered_buttons_without_list).
  If wrong: Ubah skema di plugin/buttons.ts.
- A2 [unseen] Saat tombol ditekan: answerCallbackQuery selalu; di luar allowFrom dapat 'Not authorized.' dan tidak diteruskan; pengirim sah: pesan diedit tanpa reply_markup, entities asli dipertahankan, akhiran '→ <label>', lalu Claude menerima notifikasi channel biasa (content = label, meta button_data dan message_id pesan bertombol); typing dan reaksi berlaku seperti pesan masuk. Tekan ulang setelah keyboard dicopot diabaikan.
  Why: README mirza-bots bagian Keyboard dicopot setelah tombol ditap.
  If wrong: Ubah handler callback di plugin/buttons.ts.

## Decisions
- Lane standard: menambah tombol ke reply dan handler callback_query, dengan cek allowFrom. Menunggu 261114101205 (pemotong dan konversi format baru, tombol di potongan terakhir) dan 261114101201 (tekan tombol diteruskan seperti pesan masuk, typing ikut menyala).
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui
