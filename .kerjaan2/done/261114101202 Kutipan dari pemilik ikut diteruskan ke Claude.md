---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/quote.ts, plugin/test/quote.test.ts, CLAUDE.md]
created: 2026-11-14 10:12
---

## Background

Di Telegram, pemilik bisa mengutip pesan lama (seluruhnya atau sebagian teks yang diseleksi) lalu menulis balasan. Saat ini plugin hanya meneruskan teks balasan pemilik ke Claude; isi yang dikutip tidak ikut, jadi Claude tidak tahu pesan mana yang dimaksud. Di mirza-bots, teks kutipan dan id pesan yang dikutip ikut diteruskan.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Saat pemilik membalas dengan mengutip sebuah pesan, Claude tahu pesan mana yang dikutip dan teks apa yang dikutip.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Pesan yang membalas pesan lain meneruskan ke Claude id pesan yang dikutip dan teksnya (atau keterangan jenisnya kalau bukan teks).
- [x] Kalau pemilik hanya menyeleksi sebagian teks untuk dikutip, yang diteruskan adalah bagian yang diseleksi, dan Claude bisa membedakannya dari kutipan penuh.
- [x] Kutipan berlaku untuk pesan teks, foto berkapsi, dan dokumen; pesan tanpa kutipan tidak berubah.
- [x] Teks kutipan tidak bisa dipakai untuk memalsukan atribut pesan (misalnya menyamar sebagai lampiran gambar).
- [x] Ada tes otomatis dengan Telegram tiruan untuk kutipan penuh, kutipan sebagian, dan pesan tanpa kutipan.
- [x] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengutip pesan bot lama dan bertanya tentangnya; Claude menjawab sesuai pesan yang dikutip.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Bentuk meta mengikuti mirza-bots: reply_to_message_id, quote_text, quote_is_manual ("true" untuk seleksi sebagian dari message.quote dengan is_manual, "false" untuk kutipan penuh). Urutan sumber: message.quote.text, lalu reply_to_message.text, lalu caption, lalu keterangan jenis seperti (photo)/(document: <nama aman>). Teks kutipan hanya di meta (tidak di content), karakter < > [ ] ; dan baris baru diganti seperti safeName, dan dipotong 1000 karakter dengan tanda …. Kutipan lintas chat (external_reply) diabaikan. Instruksi MCP plugin menjelaskan atribut baru ini.
  Why: mirza-bots telegram/quote.ts dan README bagian Kutipan; sanitasi meniru safeName yang sudah ada di server.ts untuk mencegah pemalsuan atribut.
  If wrong: Ubah pembentuk meta di plugin/quote.ts.
  Confirmed by owner, 2026-11-14

## Decisions
- Lane standard: mengubah meta notifikasi masuk, ada kriteria anti-pemalsuan atribut. Tidak menunggu apa pun; 261114101204 menunggu tiket ini supaya album dibangun di atas bentuk meta kutipan yang sudah final.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Tanpa pertanyaan tersisa; disetujui lewat foreman untuk langsung diantrekan
- Ditambah quote_kind (text|media) di luar A1 supaya Claude bisa membedakan teks kutipan asli dari keterangan jenis seperti (photo) yang ditulis plugin; tanda kutip ganda ikut dibersihkan karena meta menjadi atribut tag; baris baru menjadi ⏎ agar susunan baris tetap terbaca.

## Manual checks
- M1 [waiting] (item 7) 1. Nyalakan ulang salah satu bot lewat /restart <nama> di master-bot supaya plugin baru termuat.
  2. Di chat bot itu, kirim pesan dan tunggu balasan bot.
  3. Tekan lama balasan bot itu, pilih Reply, tulis 'maksudnya apa?'.
  4. Ulangi dengan menyeleksi sebagian kalimat balasan bot lalu Quote, tulis 'jelaskan bagian ini'. Yang terlihat: Claude menjawab tentang pesan yang dikutip, dan di percobaan kedua tentang bagian yang diseleksi saja.

## Handoff
Kutipan masuk: plugin/quote.ts (nol-import) membentuk meta reply_to_message_id, quote_text, quote_is_manual, quote_kind dari message.quote / reply_to_message; dipanggil satu baris di meta notifikasi handleInbound (server.ts), jadi berlaku untuk semua jenis pesan, dan instruksi MCP mendapat satu paragraf tentang atribut ini. Yang tidak boleh rusak: quote_text hanya di meta, dibersihkan dari < > [ ] ; " karakter kontrol dan baris baru (jadi ⏎), dipotong 1000 karakter; pesan tanpa reply_to_message tidak mendapat atribut apa pun. Tiket album 261114101204 sebaiknya memakai quoteMeta yang sama untuk pesan pertama album. Tes: plugin/test/quote.test.ts, quote-server.test.ts.

## Review
- 2026-11-14 standard, round 1, at 5fd954d: passed.
  1: quote-server.test (server sungguhan + Telegram tiruan) lulus, tidak di-skip (node_modules terpasang); n[1] reply_to_message_id=501 + quote_text, n[4] (photo) quote_kind=media. Mutasi: menghapus ...quoteMeta(ctx.message) membuat tes gagal.
  2: quote-server.test n[2] quote.is_manual -> quote_text 'jam 3', quote_is_manual=true vs n[1] penuh =false; quote.test kasus quote tanpa is_manual tetap false.
  3: quote-server.test n[3] foto berkapsi dan n[4] dokumen membawa atribut kutipan; n[0], n[6], n[7] (teks, foto, dokumen tanpa kutipan) tanpa kunci kutipan, content/attachment_* tetap.
  4: quote.test dan quote-server.test n[5]: kunci meta persis yang diharapkan, tanpa image_path/attachment_*, quote_text tanpa " < > [ ] ; baris baru; quoteMeta hanya empat kunci tetap, tidak menimpa kunci lain (dibaca).
  5: k2 test -- bun test quote.test.ts quote-server.test.ts commands.test.ts: 13 pass 0 fail 127 expect, di salinan HEAD dengan HOME/BOT_SQUAD_HOME sementara.
  6: CLAUDE.md bagian 'Kutipan pesan di chat bot (tiket 261114101202)' menjelaskan atribut, urutan sumber, pembersihan, dan yang diabaikan; cocok dengan plugin/quote.ts (dibaca).
  7: (owner) M1 berisi langkah dari awal (/restart, kirim, Reply, Quote) dan hasil yang terlihat; tidak memblokir.
  note: repo tidak punya skrip typecheck/CI selain bun test. Simbol ⏎ asli di teks kutipan tidak bisa dibedakan dari baris baru (kecil).
