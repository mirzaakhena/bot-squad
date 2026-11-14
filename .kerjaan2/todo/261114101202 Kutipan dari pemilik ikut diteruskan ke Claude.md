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

- [ ] Pesan yang membalas pesan lain meneruskan ke Claude id pesan yang dikutip dan teksnya (atau keterangan jenisnya kalau bukan teks).
- [ ] Kalau pemilik hanya menyeleksi sebagian teks untuk dikutip, yang diteruskan adalah bagian yang diseleksi, dan Claude bisa membedakannya dari kutipan penuh.
- [ ] Kutipan berlaku untuk pesan teks, foto berkapsi, dan dokumen; pesan tanpa kutipan tidak berubah.
- [ ] Teks kutipan tidak bisa dipakai untuk memalsukan atribut pesan (misalnya menyamar sebagai lampiran gambar).
- [ ] Ada tes otomatis dengan Telegram tiruan untuk kutipan penuh, kutipan sebagian, dan pesan tanpa kutipan.
- [ ] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengutip pesan bot lama dan bertanya tentangnya; Claude menjawab sesuai pesan yang dikutip.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Bentuk meta mengikuti mirza-bots: reply_to_message_id, quote_text, quote_is_manual ("true" untuk seleksi sebagian dari message.quote dengan is_manual, "false" untuk kutipan penuh). Urutan sumber: message.quote.text, lalu reply_to_message.text, lalu caption, lalu keterangan jenis seperti (photo)/(document: <nama aman>). Teks kutipan hanya di meta (tidak di content), karakter < > [ ] ; dan baris baru diganti seperti safeName, dan dipotong 1000 karakter dengan tanda …. Kutipan lintas chat (external_reply) diabaikan. Instruksi MCP plugin menjelaskan atribut baru ini.
  Why: mirza-bots telegram/quote.ts dan README bagian Kutipan; sanitasi meniru safeName yang sudah ada di server.ts untuk mencegah pemalsuan atribut.
  If wrong: Ubah pembentuk meta di plugin/quote.ts.

## Decisions
- Lane standard: mengubah meta notifikasi masuk, ada kriteria anti-pemalsuan atribut. Tidak menunggu apa pun; 261114101204 menunggu tiket ini supaya album dibangun di atas bentuk meta kutipan yang sudah final.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Tanpa pertanyaan tersisa; disetujui lewat foreman untuk langsung diantrekan
