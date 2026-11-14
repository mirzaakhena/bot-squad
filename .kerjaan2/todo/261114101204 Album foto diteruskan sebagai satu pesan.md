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

- [ ] Beberapa foto yang dikirim sebagai satu album diteruskan ke Claude sebagai satu pesan berisi semua foto, sesuai urutan di album. Album campuran (foto dengan video, atau album dokumen) juga digabung jadi satu pesan: foto diunduh, item lain dicantumkan sebagai lampiran bernomor yang bisa diunduh lewat download_attachment.
- [ ] Caption yang ada di beberapa foto tetap terbaca dan jelas milik foto yang mana.
- [ ] Kalau satu foto gagal diunduh, foto lain tetap sampai dan Claude diberi tahu ada yang gagal.
- [ ] Foto tunggal dan pesan teks tidak terlambat karena jeda tunggu album.
- [ ] Album dari pengirim yang tidak diizinkan tetap dibuang tanpa diunduh.
- [ ] Ada tes otomatis dengan Telegram tiruan untuk album, album dengan foto gagal, dan foto tunggal.
- [ ] CLAUDE.md menjelaskan perilaku ini.
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
