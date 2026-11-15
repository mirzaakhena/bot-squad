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

- [ ] `/new <nama>` menampilkan pertanyaan dengan tombol lanjut dan batal; sebelum lanjut ditekan tidak ada yang berubah pada bot; batal membatalkan.
- [ ] Setelah lanjut ditekan, bot dinyalakan ulang dengan percakapan kosong, dengan laporan `Percakapan baru dimulai.` dan status seperti `/restart <nama> new` dulu.
- [ ] Tombol `/new` sekali pakai, kedaluwarsa setelah 5 menit, hanya dilayani dari pemilik, dan tidak mengenai bot lain yang didaftarkan ulang dengan nama yang sama.
- [ ] `/restart <nama>` melanjutkan percakapan terakhir seperti sekarang; `/restart <nama> new` dan argumen kedua lain dijawab cara pakai yang menyebut `/new <nama>`, tanpa menyentuh bot.
- [ ] `/new` untuk nama tidak sah, tidak terdaftar, atau bot yang sedang dinyalakan, dihentikan, atau dihapus ditolak seperti `/restart`.
- [ ] Menu dan `/help` master-bot memuat `/new <nama>`, tidak lagi memuat `/start`, dan `/restart` ditulis tanpa `[new]`.
- [ ] `/start` dari pemilik tidak dibalas dan tidak mengubah apa pun; `/help` tetap dijawab.
- [ ] Ada tes untuk butir-butir di atas, dan seluruh tes tetap lulus.
- [ ] Dokumentasi proyek mencatat perubahan ini dan keputusan pemilik; tidak ada lagi petunjuk yang menyuruh `/restart <nama> new`.
- [ ] (owner) Setelah master-bot dijalankan dari kode baru: `/new <nama>` bertanya dulu, dan setelah dikonfirmasi bot tidak ingat percakapan sebelumnya; `/restart <nama>` masih ingat.

## Out of scope

- Tombol pemilih bot saat nama tidak disebut (tiket 261115202403).
- `/start` di chat bot (tiket 261115202402).
