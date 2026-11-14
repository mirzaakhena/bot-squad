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

- [x] Setelah pesan dari pengirim yang diizinkan diteruskan ke Claude, tanda "typing…" terus terlihat di chat sampai bot mengirim balasan pertama.
- [x] Tanda itu berhenti paling lama 300 detik setelah pesan masuk, juga kalau Claude tidak pernah membalas.
- [x] Pesan dari pengirim yang tidak diizinkan, perintah plugin (/start, /help, /status, /context), dan jawaban izin tidak memunculkan tanda "typing…".
- [x] Pesan pemilik mendapat reaksi emoji tanda diterima begitu diteruskan ke Claude; emojinya 👀 sebagai bawaan plugin kalau `ackReaction` di access.json tidak diisi, jadi semua bot (bot baru maupun bot-01..03 setelah dinyalakan ulang) mendapatkannya tanpa pengaturan manual, dan `ackReaction: ""` tetap mematikannya.
- [x] Ada tes otomatis dengan Telegram tiruan untuk indikator yang diperbarui, berhenti di balasan pertama, dan batas 300 detik (boleh dengan waktu yang dipercepat).
- [x] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengirim pesan yang butuh waktu lama dan melihat "typing…" bertahan sampai balasan datang.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Reaksi tanda diterima: emoji apa, dan berlaku untuk bot mana? A (rekomendasi): plugin memakai 👀 sebagai bawaan kalau ackReaction di access.json tidak diisi, jadi semua bot (termasuk bot-01..03 yang sudah ada) mendapatkannya setelah dinyalakan ulang, dan ackReaction "" tetap mematikannya; paling sederhana dan tidak perlu menulis ulang access.json. B: master-bot menulis ackReaction 👀 ke access.json hanya saat /register, sehingga bot lama tidak berubah. C: emoji lain (sebutkan; harus ada di daftar reaksi Telegram, mis. 👍 👌 ⚡).
  → 👀 untuk semua bot (Recommended) — opsi A: plugin memakai 👀 bawaan kalau ackReaction tidak diisi, berlaku juga untuk bot-01..03 setelah dinyalakan ulang; ackReaction "" tetap mematikan. (owner, 2026-11-14)

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
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui
- Batas 300 detik bisa dipercepat lewat BOT_SQUAD_TYPING_MAX_MS hanya kalau BOT_SQUAD_TELEGRAM_API_ROOT diisi, supaya tes server sungguhan membuktikan batas tanpa menunggu 5 menit dan bot produksi tidak bisa terpengaruh variabel itu.
- Batas 300 detik bisa dipercepat lewat BOT_SQUAD_TYPING_MAX_MS hanya kalau BOT_SQUAD_TELEGRAM_API_ROOT diisi, supaya tes server sungguhan membuktikan batas tanpa menunggu 5 menit dan bot produksi tidak terpengaruh variabel itu.

## Manual checks
- M1 [waiting] (item 7) 1. Di master-bot kirim /restart bot-01 (bot yang sudah berjalan baru mendapat fitur ini setelah dinyalakan ulang) dan tunggu laporan aktif.
  2. Di chat bot-01 kirim pesan yang butuh kerja lama, misalnya 'periksa semua berkas di workspace lalu ringkas, tunggu 1 menit sebelum menjawab'.
  3. Pesan itu langsung mendapat reaksi 👀, dan di atas chat tampil 'typing…' terus-menerus tanpa padam sampai balasan datang, lalu padam.

## Handoff
Keepalive 'typing…' baru di plugin/typing.ts (createTypingKeepalive, 4 detik, batas 300 detik, ackEmoji bawaan 👀). server.ts hanya punya kait kecil: objek 'typing' dibuat setelah 'bot', typing.start(chat_id) di handleInbound menggantikan sendChatAction sekali, typing.stop(chat_id) setelah tiap kirim sukses di alat reply (teks dan berkas), typing.stopAll() di shutdown, dan ackReaction memakai ackEmoji(). Jangan pindahkan typing.start sebelum cek drop/pairing/izin: orang asing, perintah plugin, dan jawaban izin tidak boleh memicu typing. Tiket album (261114101204) dan tombol (261114101206) harus memakai objek 'typing' yang sama. BOT_SQUAD_TYPING_MAX_MS khusus tes, hanya aktif dengan BOT_SQUAD_TELEGRAM_API_ROOT.

## Review
- 2026-11-14 standard, round 1, at 61a7ea6: passed.
  1: typing-server.test 'pesan pemilik...' lulus di salinan (HOME/TMPDIR sementara, node_modules terpasang, 12 pass 0 skip): ping segera, jarak 3-5 detik, nol ping 9 detik setelah reply. Mutasi: hapus typing.stop di jalur teks reply membuat tes gagal (Expected 3, Received 5).
  2: typing.test (jam palsu) ping terakhir tepat di 296 detik dan timer dilepas, juga saat pesan baru memperpanjang batas; typing-server.test dengan BOT_SQUAD_TYPING_MAX_MS=6000 hanya 2 ping. Variabel itu hanya dibaca bila API_ROOT diisi.
  3: typing-server.test 'tanpa typing' lulus: orang asing, /start /help /status /context, dan 'yes abcde' nol sendChatAction; typing.start ada sesudah cek drop/pair/izin di handleInbound.
  4: typing-server.test: tanpa ackReaction reaksi 👀 tepat sekali, ackReaction '' tanpa reaksi, '👍' dipakai; loadAccess meneruskan undefined apa adanya, master tidak menulis ackReaction.
  5: plugin/test/typing.test.ts (8) dan typing-server.test.ts (4) lulus lewat k2 test di salinan, tidak ada yang dilewati.
  6: CLAUDE.md punya bagian 'typing… dan reaksi tanda diterima di chat bot' yang cocok dengan kode; ACCESS.md dan SKILL access menyebut bawaan 👀.
  7: (owner) M1 berisi langkah dari awal (/restart bot-01, pesan lama, lihat 👀 dan typing bertahan lalu padam); bisa diikuti.
  note: berhenti di reply berkas saja hanya dinilai dengan membaca, tanpa tes server. Kalau notifikasi ke Claude gagal, typing tetap sampai 300 detik (di luar Done when). Repo tidak punya skrip lint/typecheck selain tes.
- 2026-11-14 conflict resolution, at 951beee: passed.
  Merge 951beee hanya menyelesaikan konflik import server.ts (typing.ts dan quote.ts ada) dan CLAUDE.md (bagian typing dan Kutipan 261114101202 utuh). git diff 296e549 HEAD sama dengan diff tiket semula (7 berkas, 469+/9-); typing.start dan quoteMeta ada di handleInbound. Tidak ada yang hilang atau ditambah.
