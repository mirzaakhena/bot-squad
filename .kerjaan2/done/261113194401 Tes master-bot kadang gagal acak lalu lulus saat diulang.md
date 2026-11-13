---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225307, 261112225306, 261112225308]
touches: [master/test/fake-telegram.ts, master/test/menu.test.ts, master/test/run.test.ts, master/test/delete.test.ts, master/test/updates.ts, CLAUDE.md]
created: 2026-11-13 19:44
---

## Background

Pada 2026-11-13, kumpulan tes proyek beberapa kali gagal lalu lulus saat diulang, tanpa perubahan kode:

- Saat tiket 261112225307 pertama kali akan digabung ke main, tes gagal (exit 1) dengan isi yang sama persis dengan yang kemudian lulus. Penyebabnya tidak terlihat karena keluaran tes tidak tersimpan.
- Worker 261112225306 melihat kegagalan acak di tes hapus bot (balasan kosong dari Telegram tiruan, dugaan koneksi yang dipakai ulang) dan di tes menu dan tes jalankan master-bot.
- Worker 261112225308 melihat tes menu master-bot gagal sekali dengan "500 pada all_group_chats", padahal perubahannya hanya di CLAUDE.md.

Tes yang tidak stabil memperlambat penggabungan dan bisa menyembunyikan bug sungguhan.

## How to reproduce

1. Jalankan seluruh tes proyek beberapa kali berturut-turut, terutama saat ada tes lain yang berjalan bersamaan.
2. Sesekali satu tes gagal (paling sering tes menu master-bot), lalu lulus pada percobaan berikutnya.

## Request

Seluruh tes proyek memberi hasil yang sama setiap kali dijalankan pada kode yang sama.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik), termasuk `status.json` bot yang sedang berjalan.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`; soketnya boleh di `/tmp/k2-<id tiket>-*` dan dihapus sesudahnya. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Penyebab setiap kegagalan acak yang bisa direproduksi ditemukan dan dicatat di tiket.
- [x] Seluruh tes proyek lulus 10 kali berturut-turut, dan 5 kali saat dua kumpulan tes berjalan bersamaan dari dua salinan repo; keluaran setiap putaran disimpan dan ringkasannya dicatat di tiket (Q1).
- [x] Perbaikannya tidak melemahkan apa yang diuji: tidak ada tes yang dihapus, dilewati, atau batas waktunya dilonggarkan tanpa alasan tercatat.
- [x] Kalau ada penyebab yang tidak bisa direproduksi, langkah untuk menangkapnya lain kali tercatat di CLAUDE.md.

## Out of scope

- Mengubah perilaku master-bot atau plugin, kecuali bug sungguhan yang ditemukan lewat tes ini (dicatat terpisah).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Urutan dan bukti stabil? (a) Tiket ini pertama di antrean tetapi berjalan bersamaan dengan 261113192501 dan 261113190701; bukti 'berkali-kali' = seluruh tes lulus 10 kali berturut-turut, ditambah 5 kali dua kumpulan tes bersamaan dari dua salinan repo, semua lulus, keluaran setiap putaran disimpan. (b) Tiket ini sendirian lebih dulu (solo), dua tiket lain menunggu sampai tiket ini masuk main. (c) Seperti (a) dengan jumlah ulang lain (sebutkan). Rekomendasi (a): dua tiket lain kecil dan penggabungan mengulang tes kalau ada kegagalan acak; menunggu tiket investigasi yang lamanya tak pasti menunda semuanya.
  → Paralel, 10 + 5 kali (Recommended) = (a) (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Bug sungguhan di master-bot atau plugin yang ternyata menjadi penyebab kegagalan acak boleh diperbaiki di tiket ini kalau kecil, dicatat dengan k2 decide; selain itu dicatat sebagai followup, tidak diperbaiki di sini
  Why: Out of scope tiket mengizinkan bug sungguhan yang ditemukan lewat tes, dicatat terpisah
  If wrong: Pindahkan perbaikannya ke tiket sendiri
- A2 [unseen] Setiap putaran tes keluarannya disimpan ke scratchpad (subfolder 261113194401), supaya kegagalan bisa dibaca; bila perlu waktu tunggu dilonggarkan, alasannya dicatat di tiket
  Why: Kegagalan 261112225307 tidak bisa dijelaskan karena keluarannya tidak tersimpan; Done when melarang pelonggaran tanpa alasan tercatat
  If wrong: -

## Decisions
- Lane standard: hanya tes dan bantuan tes; tidak mengubah perilaku master-bot atau plugin
- Semua server tiruan di tes diikat ke hostname 127.0.0.1, bukan memperpanjang waktu tunggu atau mengulang tes; tes penjaga master/test/test-servers.test.ts menolak Bun.serve/Bun.listen tanpa hostname.

## Handoff
Kegagalan acak tes berasal dari Telegram tiruan yang mendengar semua alamat (Bun.serve tanpa hostname). macOS membagi port berurutan untuk seluruh mesin dan mau memberi port yang sudah didengar proses lain di 127.0.0.1 (sesi Claude Code, Chrome); permintaan tes ke 127.0.0.1 lalu sampai ke proses itu. Perbaikan: hostname 127.0.0.1 di fake-telegram.ts, allow.test.ts, dan tiga tes plugin; penjaga test-servers.test.ts gagal kalau ada Bun.serve/Bun.listen di master/test atau plugin/test tanpa hostname. Jangan arahkan tes ke [::1] pada server tiruan ini; api-root.test.ts punya server ::1 sendiri. Perilaku master-bot dan plugin tidak diubah.

## Review
- 2026-11-13 standard, round 1, at 5245abd: passed.
  1: Skrip dua proses: Bun.serve tanpa hostname bisa bind port yang sudah didengar proses lain di 127.0.0.1 dan fetch dijawab proses lain; dengan hostname 127.0.0.1 bind gagal EADDRINUSE. Penyebab tercatat di tiket; log basepair-01 worker gagal 2+1 sebelum perbaikan.
  2: runs/ worker: seq-01..10 dan pair-01..05 a/b exit 0, 644 lulus, 0 gagal. Saya ulang satu putaran berpasangan dari dua salinan HEAD (HOME/BOT_SQUAD_HOME/TMUX_TMPDIR sementara): keduanya 673 lulus, 0 gagal, 0 dilewati.
  3: diff main...HEAD hanya menambah hostname di 5 server tiruan + tes penjaga; tidak ada tes dihapus/skip/batas waktu diubah. Penjaga dirusak di salinan (hostname dihapus di fake-telegram.ts dan up() plugin-log): gagal menyebut kedua lokasi.
  4: CLAUDE.md (Menjalankan master-bot) memuat aturan hostname, gejala, dan langkah menangkap kegagalan berikutnya (simpan keluaran, dua salinan bersamaan, lsof). Dinilai dengan membaca.
  note: penjaga hanya mengenali pola literal Bun.serve({ / Bun.listen({; opsi dalam variabel atau node:http tidak terdeteksi. Saat ini tidak ada yang seperti itu di tes.
