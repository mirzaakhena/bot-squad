---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/markdown.ts, plugin/chunk.ts, plugin/package.json, plugin/bun.lock, plugin/test/markdown.test.ts, plugin/test/reply-format.test.ts, CLAUDE.md]
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

- [x] Claude cukup menulis Markdown biasa (tebal, miring, kode, blok kode, tautan, daftar) dan hasilnya tampil terformat di Telegram.
- [x] Karakter yang biasanya membuat Telegram menolak pesan terformat tidak pernah membuat balasan gagal terkirim; kalau format tetap ditolak, balasan dikirim sebagai teks biasa, bukan hilang.
- [x] Balasan yang lebih panjang dari batas Telegram dikirim sebagai beberapa pesan berurutan, dan blok kode yang terpotong tetap tampil sebagai blok kode di setiap potongan.
- [x] Kutipan balasan tetap menempel di potongan pertama.
- [x] Ada tes otomatis untuk konversi format, karakter khusus, dan pemotongan blok kode.
- [x] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik meminta jawaban panjang berisi kode dan melihat semuanya tampil rapi.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Konversi memakai paket telegramify-markdown seperti mirza-bots (dependency baru di plugin/package.json dan bun.lock). Parameter format reply dan edit_message: bawaan baru 'markdown' (otomatis); 'markdownv2' tetap diteruskan mentah; 'text' tetap polos. Batas 4096 dihitung setelah escape; textChunkLimit dan chunkMode di access.json tetap dihormati. Fence yang terpotong ditutup lalu dibuka lagi (bahasa sama) di potongan berikutnya. Kalau Telegram menolak format (400 parse entities), potongan itu dikirim ulang sebagai teks asli tanpa parse_mode. Instruksi MCP diperbarui.
  Why: mirza-bots markdown.ts dan chunk.ts; README bagian Jalur pesan keluar.
  If wrong: Kembalikan bawaan format ke 'text'.
  Confirmed by owner, 2026-11-14
- A2 [confirmed] Tanpa chunkMode di access.json, format markdown memotong di batas paragraf/baris/spasi (bukan per panjang) supaya baris kode tidak terbelah; chunkMode eksplisit tetap dihormati, format text/markdownv2 tanpa chunkMode tetap per panjang
  Why: access.json tulisan master-bot tidak punya chunkMode, dan potongan per panjang membelah baris kode di tengah, bertentangan dengan 'potongan yang rapi'
  If wrong: Di planReply (plugin/outbound.ts) ubah bawaan mode menjadi 'length' untuk semua format
  Confirmed by owner, 2026-11-14

## Decisions
- Lane standard: alat reply dan edit_message, menambah dependency telegramify-markdown ke plugin/ (package.json dan bun.lock; hanya tiket ini yang menambah dependency, jadi tidak solo). Tidak menunggu apa pun; 261114101206 menunggu tiket ini karena tombol menempel di potongan terakhir dari pemotong baru.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Tanpa pertanyaan tersisa; disetujui lewat foreman untuk langsung diantrekan
- Format yang ditolak dikirim ulang dengan teks ASLI tanpa parse_mode (bukan hasil escape), sama seperti mirza-bots, dan dicatat format-ditolak di plugin.log tanpa isi pesan; hanya 400 bertuliskan can't parse entities / can't find end of / reserved and must be escaped yang memicu kirim ulang, supaya error lain tidak membuat pesan ganda

## Manual checks
- M1 [waiting] (item 7) 1. Di master-bot kirim /restart <nama bot> (bot lama belum memuat paket baru) dan tunggu laporan aktif.
  2. Di chat bot itu minta: 'Tulis penjelasan panjang (lebih dari 5000 karakter) berisi teks tebal, daftar, tautan, dan satu blok kode Python sekitar 200 baris.'
  3. Balasan datang sebagai beberapa pesan berurutan: tidak ada tanda ** atau \ mentah, tebal/tautan/daftar tampil terformat, dan kode tampil sebagai blok monospace di setiap pesan yang memuatnya; teks sesudah kode tidak ikut monospace.

## Handoff
Pesan keluar reply dan edit_message kini lewat plugin/outbound.ts: planReply (konversi telegramify-markdown mode escape, potong teks mentah dengan jendela setengah batas, jahit fence, cek panjang setelah escape), planEdit, dan sendWithFallback (kirim ulang teks biasa saat 400 parse entities). Bawaan format menjadi 'markdown'; 'text' dan 'markdownv2' seperti dulu. Kait di server.ts kecil: import, deskripsi format, dua pemanggilan sendWithFallback dengan plog format-ditolak; fungsi chunk lama dihapus. Yang tidak boleh rusak: kutipan di potongan indeks 0, urutan potongan, setiap potongan <= textChunkLimit, fallback tidak terpicu error non-format. Tiket 261114101206 menempelkan tombol di potongan terakhir planReply.

## Review
- 2026-11-14 standard, round 1, at 1824c8d: passed.
  1: reply-format.test 'Markdown biasa tampil terformat' (server sungguhan, Telegram tiruan) lulus; tambahan 31 kasus Markdown (tebal, miring, kode, fence, tautan, daftar, kutipan, tabel) lolos pemeriksa MarkdownV2 ketat sesuai aturan resmi Bot API
  2: outbound.test 'setiap karakter khusus' (per karakter) dan reply-format.test 'format ditolak' (reply+edit_message dikirim ulang teks biasa, kutipan tetap, format-ditolak di plugin.log tanpa isi) lulus
  3: reply-format.test 'reply panjang berisi kode' dan outbound.test 'balasan panjang' lulus; tambahan 3x300 baris kode berkarakter khusus pada limit 4096/1000/300 semua <= limit dan lolos pemeriksa ketat
  4: reply-format.test: reply_to hanya di potongan pertama, replyToMode all di semua potongan, kiriman ulang teks biasa tetap membawa kutipan
  5: k2 test di salinan dengan plugin/node_modules terpasang: outbound.test + reply-format.test 13 pass 0 fail, tidak ada yang dilewati
  6: CLAUDE.md bagian 'Balasan bot: Markdown otomatis dan potongan rapi' dan baris format-ditolak di tabel plugin.log, cocok dengan kode (dibaca)
  7: (owner) M1 bisa diikuti dari awal dan menyebut hasil yang terlihat
  note: pemeriksa MarkdownV2 tiruan longgar (tidak cek escape backtick/backslash di kode, label tautan, __ dan ||); pemeriksa ketat saya untuk kriteria 1-3: 0 masalah. Kasus tepi pemotongan ditulis sebagai F1
- 2026-11-14 conflict resolution, at c11bcca: passed.
  Merge c11bcca: import outbound/typing/quote, instruksi Markdown dan kutipan ada; typing.stop tetap sesudah tiap sendWithFallback sukses (juga fallback teks biasa) dan kirim berkas; quoteMeta, start, stopAll utuh; diff ke main sama dengan perubahan tiket; tes typing/quote/outbound/reply-format 36 pass

## Follow-ups
- F1 [ticketed] Pemotongan Markdown di plugin/outbound.ts: (1) chunkText membuang baris baru di awal sisa teks, jadi baris kosong dalam blok kode di batas potongan hilang (fence 40 baris kosong, limit 200: 4 hilang). (2) Fence berindentasi >3 spasi (kode di item daftar) tidak dikenali balanceFences; fence penutupnya tampil sebagai backtick ter-escape. (3) Baris paragraf lebih panjang dari setengah batas dipotong di spasi dan bisa membelah tebal/kode inline, pasangan penanda bergeser. (4) Jendela setengah batas membuat pesan hanya ~separuh terisi (~33 ribu karakter kode: 17 pesan).
  → 261114173701
