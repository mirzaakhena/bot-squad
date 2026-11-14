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

- [x] Claude bisa mengirim pesan dengan tombol pilihan, dan pilihan yang ditekan pemilik sampai ke Claude sebagai jawaban.
- [x] Setiap keyboard pilihan otomatis punya tombol terakhir untuk menjawab sendiri berlabel persis `✏️ Explain manually` seperti mirza-bots, ditambahkan oleh plugin, bukan bergantung pada Claude, dan tidak muncul dua kali. Saat ditekan, tombolnya dicopot, pesannya ditandai dengan pilihan itu, dan Claude diberi tahu bahwa pemilik akan mengetik jawabannya sendiri.
- [x] Setelah sebuah tombol ditekan, tombol-tombol pesan itu hilang dan pesannya menunjukkan pilihan yang diambil, sehingga tidak bisa dijawab dua kali.
- [x] Tombol yang tidak masuk akal ditolak sebelum apa pun terkirim, dengan pesan yang menjelaskan cara memperbaikinya ke Claude: data tombol melebihi batas Telegram, atau tombol bernomor tanpa daftar bernomor yang cocok di badan pesan.
- [x] Hanya pengirim yang diizinkan yang bisa menekan tombol; tombol izin yang sudah ada tetap bekerja seperti sekarang.
- [x] Ada tes otomatis dengan Telegram tiruan untuk mengirim tombol, menekan tombol, tombol jawab sendiri, dan penolakan tombol yang salah.
- [x] CLAUDE.md menjelaskan perilaku ini.
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
- A3 [unseen] Isi notifikasi saat tombol ditekan adalah data tombol (bawaan = label), bukan label; label ada di meta button_label. Reaksi 👀 tidak dipasang pada pesan bertombol, hanya typing.
  Why: Data ditulis Claude sebagai penanda pilihan yang bermakna (label sering hanya angka), sama dengan mirza-bots yang meneruskan data; mereaksi pesan bot sendiri tidak berguna.
  If wrong: Ganti choiceContent di plugin/buttons.ts dan tambah setMessageReaction di plugin/choice-tap.ts.
- A4 [unseen] Tombol jawab-sendiri yang ditulis Claude dibuang lalu satu ditempel di baris terakhir (bukan dibiarkan di posisinya seperti mirza-bots); data berawalan perm: tidak ditolak karena semua data tombol Claude diberi awalan c:.
  Why: Done when meminta tombol terakhir dan tidak dua kali; awalan c: sudah mencegah tabrakan dengan tombol izin.
  If wrong: Ubah withManualFallback dan checkButtons di plugin/buttons.ts.
- A5 [unseen] Yang boleh menekan tombol pilihan: pengirim di allowFrom saja (seperti tombol izin), juga di grup.
  Why: Sama dengan tombol izin yang sudah ada; grup jarang dipakai bot-squad.
  If wrong: Ganti fungsi allowed di kait callback_query plugin/server.ts.

## Decisions
- Lane standard: menambah tombol ke reply dan handler callback_query, dengan cek allowFrom. Menunggu 261114101205 (pemotong dan konversi format baru, tombol di potongan terakhir) dan 261114101201 (tekan tombol diteruskan seperti pesan masuk, typing ikut menyala).
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui

## Manual checks
- M1 [waiting] (item 8) 1. Di master-bot kirim /restart <nama-bot> supaya bot memuat plugin baru, tunggu laporan aktif.
  2. Di chat bot itu ketik: 'Beri aku dua pilihan makan siang dengan tombol'.
  3. Pesan Claude memuat daftar bernomor dan tombol 1, 2, lalu baris terakhir '✏️ Explain manually'.
  4. Tekan 2: tombol hilang, pesan berakhir '→ 2', Claude membalas sesuai pilihan
  2.
  5. Minta pilihan lagi, tekan '✏️ Explain manually': tombol hilang, pesan berakhir '→ ✏️ Explain manually', Claude menunggu (atau menyuruhmu mengetik) dan tidak memilih sendiri; ketik jawabanmu dan Claude memakainya.

## Handoff
Alat reply menerima buttons (baris {text,data?}); aturan di plugin/buttons.ts, ketukan di plugin/choice-tap.ts, kait kecil di server.ts: validasi sebelum lampiran dicek dan sebelum apa pun terkirim, reply_markup hanya di potongan terakhir planReply, dan handler callback_query memanggil handleChoiceTap lebih dulu (data berawalan c:) sebelum jalur perm: yang tidak berubah. Plugin selalu menempel '✏️ Explain manually' (data 'let me explain manually instead') sebagai baris terakhir. Ketukan sah diteruskan sebagai notifications/claude/channel (content=data, meta button_*), typing menyala, lalu pesan diedit '→ label' tanpa keyboard. Jangan rusak: awalan c: (pemisah dari perm:), urutan validasi-dulu, dan instruksi MCP BUTTONS_INSTRUCTIONS.

## Review
- 2026-11-14 standard, round 1, at 7a4e7de: passed.
  1: buttons-server.test 'kirim tombol, tekan satu' lulus di salinan (k2 test, 18 pass, tidak dilewati): reply dengan buttons mengirim inline_keyboard c:lanjut/c:2, ketukan pemilik sampai sebagai notifications/claude/channel content=lanjut dengan meta button_*
  2: tes server 'tombol jawab sendiri' + tes unit withManualFallback: baris terakhir selalu persis '✏️ Explain manually' dari plugin, tulisan Claude dibuang (label atau data), ditekan -> button_manual=true, isi 'type their own answer', edit '→ ✏️ Explain manually'
  3: tes server memeriksa editMessageText tanpa reply_markup dengan akhiran '→ 1' dan entity asli; ketukan kedua dan ketukan pada pesan tanpa keyboard dijawab tanpa notifikasi (log ganda=2)
  4: tes server 'tombol salah ditolak': 6 kasus (bernomor tanpa daftar, data 63 byte, emoji 80 byte, bentuk salah, balasan panjang, dengan files) isError dengan cara memperbaiki, nol sendMessage/sendDocument/sendPhoto; validasi di server.ts berjalan sebelum assertSendable dan pengiriman
  5: tes server 'orang asing': tiga ketukan (c:, jawab sendiri, perm:allow) -> 'Not authorized.', tanpa notifikasi/izin/edit; pemilik perm:allow -> izin diteruskan, '✅ Allowed'. Uji tambahan: data Claude 'perm:allow:abcde' menjadi 'c:perm:allow:abcde', tidak cocok regex perm:, jadi tombol izin tidak bisa dipalsukan
  6: plugin/test/buttons.test.ts (13) dan buttons-server.test.ts (5, Telegram tiruan) lulus lewat k2 test di salinan dengan node_modules terpasang, asersi pada keluaran server sungguhan
  7: dibaca: CLAUDE.md bagian 'Tombol pilihan di chat bot' dan baris 'tombol' di tabel plugin.log sesuai kode
  8: (owner) M1 berisi langkah dari /restart sampai hasil yang terlihat
  note: label tanpa U+FE0F ('✏ Explain manually') tidak dikenali sebagai duplikat -> followup. Kalau deliver ke Claude gagal, pesan tetap ditandai pilihan (hanya log gagal). Tidak ada AGENTS.md, CI, atau skrip cek lain di repo selain bun test.
- 2026-11-14 conflict resolution, at d6629c5: passed.
  Merge d6629c5: konflik impor server.ts diselesaikan dengan menyimpan buttons/choice-tap dan context-reminder/attachment; instruksi MCP keduanya ada; kait tombol, perm:, lampiran, contextReminderMeta utuh, tanpa tambahan. 55 tes buttons/attachment/context-reminder lulus via k2 test di salinan baru.

## Follow-ups
- F1 [open] Tombol jawab-sendiri bisa tampil dua kali kalau Claude menulis label tanpa variation selector, mis. '✏ Explain manually' (U+270F tanpa U+FE0F, persis cara pemilik menulisnya di jawaban Q1). withManualFallback di plugin/buttons.ts hanya mengenali label persis '✏️ Explain manually' atau data 'let me explain manually instead'; varian itu lolos sebagai tombol biasa (data 'c:✏ Explain manually', tanpa button_manual) dan plugin menempel tombol resmi lagi di baris terakhir. Usul: normalisasi label (buang U+FE0F, trim, case-insensitive) sebelum dibandingkan.
