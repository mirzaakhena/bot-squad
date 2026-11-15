---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 20:24
---

## Background

Sejak tiket 261115100301, `/restart <nama>` di master-bot melanjutkan percakapan terakhir bot, dan `/restart <nama> new` memulai percakapan kosong. Pemilik ingin percakapan baru menjadi perintah sendiri, bukan kata tambahan di `/restart`.

Master-bot juga masih menjawab `/start` dengan teks bantuan dan menampilkannya di menu. Pemilik menganggap `/start` tidak berguna. Telegram tetap mengirim `/start` sendiri saat seseorang pertama kali membuka chat dan menekan tombol Start, jadi perintah itu tidak bisa benar-benar hilang.

Keputusan pemilik (2026-11-15):
- `/restart <nama> new` dibuang, diganti perintah baru `/new <nama>`.
- `/new` bertanya dulu sebelum dijalankan, karena bot akan memulai percakapan kosong.
- `/start` dibuang dari menu dan `/help` master-bot; kalau tetap datang, ditelan diam-diam.

## Request

Master-bot punya `/new <nama>` untuk memulai percakapan kosong, `/restart` tidak lagi menerima kata `new`, dan `/start` tidak lagi menjadi perintah master-bot.

Rincian:
- `/new <nama>`: nama dicek seperti `/restart`. Lalu master-bot bertanya dengan dua tombol (lanjut dan batal), dengan aturan yang sama seperti tombol konfirmasi `/delete`: sekali pakai, berlaku 5 menit, hanya dari pemilik di chat pribadinya, terikat pada bot yang ditanyakan (bukan hanya namanya), dan tombol kedaluwarsa atau tak dikenal dijawab `kedaluwarsa` tanpa mengubah apa pun. Belum ada yang diubah sampai pemilik menekan lanjut.
- Setelah dikonfirmasi, yang terjadi sama persis dengan `/restart <nama> new` sekarang: bot dihentikan, dinyalakan dengan percakapan kosong, laporan dan status yang sama, kunci per bot yang sama.
- `/restart <nama>` tetap melanjutkan percakapan terakhir. `/restart <nama> <apa pun>` (termasuk `new`) dijawab cara pakai tanpa menyentuh bot; cara pakai itu menyebut `/new <nama>` untuk percakapan baru.
- Teks lain yang dulu menyarankan `/restart <nama> new` diarahkan ke `/new <nama>`.
- `/start`: tidak ada di menu dan `/help`. Kalau pemilik mengirimnya, master-bot tidak membalas dan tidak mengubah apa pun. `/help` tetap bekerja.

Asumsi foreman yang perlu dicatat worker sebagai asumsi untuk pemilik: `/new <nama>` yang diketik lengkap juga bertanya dulu (pemilik menjawab soal konfirmasi dalam konteks tombol pemilih bot; disamakan dengan `/delete <nama>` supaya satu perilaku).

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] `/new <nama>` menampilkan pertanyaan dengan tombol lanjut dan batal; sebelum lanjut ditekan tidak ada yang berubah pada bot; batal membatalkan.
- [x] Setelah lanjut ditekan, bot dinyalakan ulang dengan percakapan kosong, dengan laporan `Percakapan baru dimulai.` dan status seperti `/restart <nama> new` dulu.
- [x] Tombol `/new` sekali pakai, kedaluwarsa setelah 5 menit, hanya dilayani dari pemilik, dan tidak mengenai bot lain yang didaftarkan ulang dengan nama yang sama.
- [x] `/restart <nama>` melanjutkan percakapan terakhir seperti sekarang; `/restart <nama> new` dan argumen kedua lain dijawab cara pakai yang menyebut `/new <nama>`, tanpa menyentuh bot.
- [x] `/new` untuk nama tidak sah, tidak terdaftar, atau bot yang sedang dinyalakan, dihentikan, atau dihapus ditolak seperti `/restart`.
- [x] Menu dan `/help` master-bot memuat `/new <nama>`, tidak lagi memuat `/start`, dan `/restart` ditulis tanpa `[new]`.
- [x] `/start` dari pemilik tidak dibalas dan tidak mengubah apa pun; `/help` tetap dijawab.
- [x] Ada tes untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [x] Dokumentasi proyek mencatat perubahan ini dan keputusan pemilik; tidak ada lagi petunjuk yang menyuruh `/restart <nama> new`.
- [ ] (owner) Setelah master-bot dijalankan dari kode baru: `/new <nama>` bertanya dulu, dan setelah dikonfirmasi bot tidak ingat percakapan sebelumnya; `/restart <nama>` masih ingat.

## Out of scope

- Tombol pemilih bot saat nama tidak disebut (tiket 261115202403).
- `/start` di chat bot (tiket 261115202402).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] /new <nama> yang diketik lengkap juga bertanya dulu dengan tombol konfirmasi, sama seperti lewat tombol pemilih bot nanti
  Why: Pemilik menjawab soal konfirmasi dalam konteks tombol pemilih bot; disamakan dengan /delete <nama> supaya satu perilaku
  If wrong: Di perintah /new (master/src/bot.ts) panggil restartBot(..., "new") langsung alih-alih askConfirm, dan sesuaikan master/test/new.test.ts
  Confirmed by owner, 2026-11-15

## Manual checks
- M1 [waiting] (item 10) 1. Hentikan master-bot yang berjalan (Ctrl+C), lalu dari root repo jalankan: bun run --cwd master start.
  2. Di chat master-bot buka menu perintah: /new ada, /start tidak ada.
  3. Kirim pesan ke salah satu bot, misalnya 'ingat angka 4721'.
  4. Di master-bot kirim /restart <nama>; setelah laporan aktif ('Percakapan terakhir dilanjutkan.'), tanya bot 'angka berapa tadi?': bot menjawab 4721.
  5. Kirim /new <nama>: muncul pertanyaan dengan tombol 'Mulai baru' dan 'Batal', bot belum disentuh.
  6. Tekan 'Mulai baru': muncul 'Menyalakan ulang ... dengan percakapan baru...' lalu laporan aktif berisi 'Percakapan baru dimulai.'
  7. Tanya bot 'angka berapa tadi?': bot tidak tahu.
  8. Kirim /start ke master-bot: tidak ada balasan; /help tetap dibalas.

## Handoff
Master-bot: /new <nama> menggantikan /restart <nama> new; /restart hanya menerima nama dan selalu melanjutkan percakapan; /start dibuang dari COMMANDS dan ditelan tanpa balasan. Konfirmasi /delete dijadikan mekanisme umum di master/src/bot.ts: tabel confirmations (del, new), askConfirm(reply, jenis, nama, username), dan satu penangan tombol <jenis>:yes|no:<id> yang menjaga sekali pakai, 5 menit, ikatan telegramId+createdAt, dan cek ulang registry. Henti-lalu-nyala ada di restartBot(reply, nama, username, mode). Jangan dirusak: format callback del:..., teks DELETE_EXPIRED, urutan status /delete, dan label kunci 'dinyalakan ulang'. Tiket 261115202403 cukup memanggil askConfirm.

## Review
- 2026-11-15 standard, round 1, at 08bc6d6: passed.
  1: new.test.ts (pertanyaan dua tombol, Batal; potret folder data sama, stop/launch tidak dipanggil) dan stop-process.test.ts (main.ts sungguhan: pid server plugin tetap sebelum tombol ditekan) lulus.
  2: new.test.ts empat status dan stop-process.test.ts (claude tiruan tanpa --continue) lulus; uji mandiri di salinan: launch mode new, status active. Mutasi mode jadi continue menggagalkan 7 tes.
  3: new.test.ts sekali pakai, tepat 5 menit, akun lain/grup, daftar ulang nama lulus. Mutasi membuang pending.delete menggagalkan 3 tes; membuang cek jenis menggagalkan tes silang /new-/delete.
  4: stop-restart.test.ts (9 bentuk argumen kedua: RESTART_USAGE memuat '/new <nama>', registry sama; /restart <nama> mode continue) dan stop-process.test.ts (/restart <nama> new: cara pakai, pid tetap) lulus.
  5: new.test.ts 'ditolak seperti /restart' lulus: cara pakai, tidak terdaftar, registry rusak, lima label kunci (juga tombol lama saat bot sibuk), dan /restart, /stop, /new ditolak selama /new berjalan.
  6: run.test.ts dan menu.test.ts (menu di Telegram tiruan tanpa start, dengan new) serta tes helpText di stop-restart.test.ts lulus.
  7: access.test.ts: /start dan '/start apa-saja' nol panggilan Telegram dan nol log, /help dibalas; mutasi yang membuat /start membalas menggagalkan 2 tes.
  8: Tes ada per butir; 8 berkas tes master terkait dijalankan per nama lewat k2 test: 222 lulus, 0 gagal. Suite penuh sudah lulus pada isi yang sama menurut brief, tidak diulang.
  9: Dibaca: docs/master-bot.md, docs/menyalakan-bot.md, CLAUDE.md (137 baris, 13 KB). grep 'restart <nama> new' di master/src, docs, CLAUDE.md, scripts, plugin hanya menyisakan dua kalimat riwayat.
  10: (owner) Manual checks M1 bisa diikuti dari awal dan tiap langkah menyebut yang harus terlihat.
  note: /delete tidak berubah: delete.test.ts dan delete-process.test.ts (tak disentuh diff) lulus. Uji mandiri: tombol del: di master-bot yang baru menyala hanya kedaluwarsa; id /delete di tombol new: tidak memicu atau membatalkan; setelah hapus berhasil tombol lain nama itu kedaluwarsa.
  note: Repo tidak punya lint, typecheck, atau CI selain bun test, jadi tidak ada cek lain yang dijalankan.
