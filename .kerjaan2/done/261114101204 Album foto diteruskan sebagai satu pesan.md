---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261114101201, 261114101202]
related: []
touches: [plugin/server.ts, plugin/album.ts, plugin/test/album.test.ts, CLAUDE.md]
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

- [x] Beberapa foto yang dikirim sebagai satu album diteruskan ke Claude sebagai satu pesan berisi semua foto, sesuai urutan di album. Album campuran (foto dengan video, atau album dokumen) juga digabung jadi satu pesan: foto diunduh, item lain dicantumkan sebagai lampiran bernomor yang bisa diunduh lewat download_attachment.
- [x] Caption yang ada di beberapa foto tetap terbaca dan jelas milik foto yang mana.
- [x] Kalau satu foto gagal diunduh, foto lain tetap sampai dan Claude diberi tahu ada yang gagal.
- [x] Foto tunggal dan pesan teks tidak terlambat karena jeda tunggu album.
- [x] Album dari pengirim yang tidak diizinkan tetap dibuang tanpa diunduh.
- [x] Ada tes otomatis dengan Telegram tiruan untuk album, album dengan foto gagal, dan foto tunggal.
- [x] CLAUDE.md menjelaskan perilaku ini.
- [ ] (owner) Pemilik mengirim album 3 foto dan Claude menanggapinya sebagai satu pesan.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Album campuran (foto bersama video, atau album dokumen): digabung juga? A (rekomendasi): semua item satu album digabung jadi satu pesan; foto diunduh seperti sekarang, item lain (video, dokumen) dicantumkan sebagai lampiran bernomor yang bisa diunduh Claude lewat download_attachment; jadi Claude tidak pernah mulai menjawab sebelum album lengkap. B: persis mirza-bots, hanya foto yang digabung; video dan dokumen di album tetap diteruskan satu per satu seperti sekarang.
  → Semua digabung (Recommended) — opsi A: semua item satu album jadi satu pesan; foto diunduh, item lain jadi lampiran bernomor untuk download_attachment. (owner, 2026-11-14)

## Assumptions
- A1 [unseen] Jeda tunggu album 1,5 detik sejak item terakhir, batas keras 8 detik, maks. 10 item (lebih dari itu jadi pesan kedua), urut message_id menaik, caption diberi label 'Photo <n>:'. Hanya pesan yang punya media_group_id yang ditunda; foto tunggal dan teks langsung diteruskan. Gerbang allowlist dicek per item sebelum masuk buffer, jadi item dari pengirim tak diizinkan dibuang tanpa diunduh. Typing dan reaksi tanda diterima sekali per album (reaksi di item pertama). Meta: image_path untuk foto pertama (kompatibel) plus image_path_<n> per foto, dan daftar nomor foto yang gagal diunduh di meta serta satu kalimat di content. Album yang masih di buffer saat plugin berhenti dibuang.
  Why: Angka dari mirza-bots engine.ts (AlbumBuffer 1500/8000, maks. 10) dan README bagian Album.
  If wrong: Ubah konstanta atau bentuk meta di plugin/album.ts.

## Decisions
- Lane standard. Menunggu 261114101201 (typing harus menyala sekali per album, bukan per foto) dan 261114101202 (album memakai pembentuk meta yang sama, termasuk kutipan). Ini perombakan handleInbound terbesar, jadi sengaja paling akhir di jalur pesan masuk.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui
- Album dengan banyak kapsi selalu diberi label per item (juga kalau hanya satu kapsi), berbeda dari mirza-bots yang memakai kapsi mentah bila hanya satu, supaya selalu jelas milik foto yang mana. Item lain di album campuran memakai label jenisnya (Video 2, Document 1) dan nomor posisi album yang sama dengan kunci meta attachment_<n>_*.

## Manual checks
- M1 [waiting] (item 8) 1. Setelah tiket ini masuk main, nyalakan ulang satu bot lewat master-bot: /restart bot-01.
  2. Tunggu laporan 'aktif'.
  3. Di chat bot-01, pilih 3 foto sekaligus dan kirim sebagai album; beri kapsi di foto pertama dan ketiga.
  4. Lihat: hanya foto pertama yang mendapat reaksi 👀, 'typing…' muncul, dan Claude membalas sekali dengan menyebut ketiga foto (dan kapsi untuk foto 1 dan 3), bukan tiga balasan terpisah.
  5. Opsional: di state/plugin.log bot itu ada 3 baris 'pesan hasil=diteruskan ... album=<id>' dengan waktu diteruskan yang sama.

## Handoff
Album (media_group_id) kini ditahan di plugin/album.ts (1,5 s debounce, 8 s batas, 10 item) lalu diteruskan sebagai satu notifikasi oleh forwardAlbum di server.ts. handleInbound dipecah: gerbang + cabang album + intercept izin, lalu forwardMessage (jalur pesan tunggal lama: typing, reaksi, unduh foto, meta, quoteMeta). Tiket lain yang menambah meta (mis. pengingat konteks 261114101207) harus menambahkannya di forwardMessage DAN forwardAlbum. Unduhan foto dipindah ke downloadPhoto() dan kini menganggap HTTP bukan 2xx sebagai gagal. Jangan ubah: gerbang dicek sebelum buffer (pengirim tak diizinkan tidak diunduh), foto tunggal/teks tidak pernah ditunda, kunci meta album hanya [a-z0-9_].

## Review
- 2026-11-14 standard, round 1, at 29e13b6: passed.
  1: album-server.test 'album 3 foto tiba acak' (3 getUpdates acak -> 1 notifikasi urut 501,502,503, isi image_path_1..3 benar) dan 'album campuran/dokumen' (attachment_<n>_file_id, too_large tanpa file_id, download_attachment menolak) lulus via k2 test
  2: konten 'Photo 1: pertama / Photo 2 / Photo 3: ketiga' diasersi persis di tes server; tes unit kapsi tunggal di foto ke-2 tetap berlabel
  3: tes 'album dengan foto gagal' (404 dan getFile 400) -> album_failed=2,3, foto 1 dan 4 terbaca, kalimat 'could not be downloaded' ada
  4: tes foto tunggal/teks diteruskan <1 s tanpa album_size; probe saya: foto tunggal dengan berkas 404 tetap diteruskan (kapsi, tanpa image_path), tidak macet
  5: tes pengirim tak diizinkan: 2 baris dibuang, 0 getFile/reaksi/typing, inbox tidak dibuat
  6: album.test.ts (13) + album-server.test.ts (7) jalan sungguhan (bun install di salinan, 0 skip), asersi tidak trivial
  7: CLAUDE.md bagian 'Album di chat bot' dan kolom album= di tabel plugin.log, sesuai kode
  8: (owner) Manual check M1 bisa diikuti dari awal dan menyebut yang harus terlihat
  note: probe di salinan: quoteMeta dari item album ke-2 ikut di meta album; reaksi hanya di item pertama; 11 item -> album 10 + 1 pesan tunggal. typing/reaksi/too_large/safeName/contextReminderMeta ada di forwardMessage dan forwardAlbum
  note: foto tunggal gagal diunduh tidak diberi tahu ke Claude (followup F1); tidak ada CI/skrip cek lain di repo selain bun test

## Follow-ups
- F1 [open] Foto tunggal yang gagal diunduh (getFile ditolak, atau sejak 261114101204 unduhan bukan 2xx) diteruskan ke Claude hanya dengan kapsi/'(photo)' tanpa image_path dan tanpa pemberitahuan gagal, jadi Claude tidak tahu ada foto yang hilang. Album sudah memberi album_failed dan kalimat 'could not be downloaded — tell the sender'; foto tunggal di forwardMessage (plugin/server.ts) sebaiknya diberi tanda serupa (mis. meta image_failed dan satu kalimat di content). Terbukti: foto tunggal dengan berkas 404 di Telegram tiruan menghasilkan meta tanpa image_path dan content 'tunggal gagal' saja.
