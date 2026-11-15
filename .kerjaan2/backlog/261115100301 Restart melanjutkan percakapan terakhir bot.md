---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 10:03
---

## Background

Saat ini setiap kali sebuah bot dinyalakan, sesi Claude-nya mulai dari percakapan kosong: master-bot menjalankan `claude` tanpa opsi sesi apa pun. Ini berlaku untuk `/restart <nama>` dan untuk penyalaan otomatis saat master-bot menyala (misalnya setelah server reboot). Percakapan lama tidak hilang dari disk, tetapi bot tidak lagi mengingatnya, jadi pemilik harus menjelaskan ulang apa yang sedang dikerjakan.

Claude Code punya opsi `--continue`, yang melanjutkan percakapan terakhir di folder kerja itu. Setiap bot punya folder kerja sendiri, jadi opsi ini cukup tanpa perlu mencatat session-id.

Keputusan pemilik (2026-11-15):
- `/restart <nama>` melanjutkan percakapan terakhir bot itu (`--continue`).
- `/restart <nama> new` memulai percakapan kosong seperti sekarang. Katanya `new` (bahasa Inggris), bukan `baru`.
- Penyalaan otomatis saat master-bot menyala juga melanjutkan percakapan terakhir.
- Bot yang baru didaftarkan lewat `/register` tetap mulai dari percakapan kosong.

## Request

Bot yang dinyalakan ulang kembali ke percakapan terakhirnya, kecuali pemilik meminta percakapan baru dengan `/restart <nama> new`.

Yang belum diketahui dan harus dicari tahu worker: apa yang dilakukan `claude --continue` kalau folder kerja itu belum punya percakapan sama sekali (misalnya bot yang gagal menyala sebelum giliran pertama, atau bot yang belum pernah diajak bicara). Bot tidak boleh gagal menyala karena itu; kalau perlu, master-bot memeriksa dulu apakah ada percakapan untuk dilanjutkan dan memulai percakapan kosong kalau tidak ada. Catat juga apakah dialog saat start berubah dengan `--continue` (misalnya muncul pertanyaan tambahan), karena penyalaan bergantung pada teks di layar.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan).
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] `/restart <nama>` menyalakan bot dengan melanjutkan percakapan terakhir di folder kerjanya, dan balasannya menyebut bahwa percakapan dilanjutkan.
- [ ] `/restart <nama> new` menyalakan bot dengan percakapan kosong, dan balasannya menyebut bahwa percakapan baru dimulai. Argumen kedua selain `new` dijawab dengan cara pakai, tanpa menyentuh bot.
- [ ] Penyalaan otomatis saat master-bot menyala melanjutkan percakapan terakhir tiap bot yang dinyalakannya.
- [ ] Bot yang baru didaftarkan lewat `/register` tetap mulai dari percakapan kosong.
- [ ] Bot yang folder kerjanya belum punya percakapan tetap berhasil menyala lewat `/restart <nama>` dan penyalaan otomatis (mulai dari percakapan kosong), tidak dilaporkan gagal.
- [ ] `/help` dan menu master-bot menyebut `/restart <nama> [new]`.
- [ ] Ada tes untuk kelima perilaku di atas, dan seluruh tes tetap lulus. Fitur lain (laporan aktif atau gagal, `/stop`, kunci per bot, `/context`) bekerja seperti sekarang.
- [ ] Dokumentasi proyek mencatat perilaku baru ini dan keputusan pemilik, termasuk apa yang ditemukan soal `--continue` tanpa percakapan sebelumnya.
- [ ] (owner) Setelah master-bot dijalankan dari kode baru: ajak satu bot bicara, kirim `/restart <nama>`, lalu tanyakan ke bot itu apa yang tadi dibicarakan; bot masih ingat. Kirim `/restart <nama> new` dan tanyakan lagi; bot tidak ingat.

## Out of scope

- Memilih percakapan tertentu untuk dilanjutkan (dengan session-id); hanya percakapan terakhir.
- Perintah di chat bot untuk memulai percakapan baru (tiket 261112230302).
