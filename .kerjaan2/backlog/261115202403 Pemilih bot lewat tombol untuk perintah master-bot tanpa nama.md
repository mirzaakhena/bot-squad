---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261115202401]
related: []
touches: []
created: 2026-11-15 20:24
---

## Background

Hampir semua perintah master-bot menuntut nama bot diketik: `/stop <nama>`, `/restart <nama>`, `/new <nama>`, `/logs <nama>`, `/access <nama>`, `/delete <nama>`, `/revoke <nama> <user_id>`. Di HP ini merepotkan, dan pemilik harus ingat nama serta user_id. Tanpa nama, perintah itu sekarang hanya menjawab cara pakai.

Master-bot sudah punya tombol konfirmasi untuk `/delete` dan `/new` (sekali pakai, 5 menit, hanya dari pemilik).

Keputusan pemilik (2026-11-15): perintah tanpa nama menampilkan tombol pilihan bot dengan tombol `cancel`; `/revoke` tanpa argumen bertanya dua kali (bot, lalu user_id); `/allow` tetap diketik lengkap; satu ketukan satu orang; `/delete` dan `/new` tetap bertanya dulu setelah bot dipilih.

## Request

Perintah master-bot yang butuh nama bot bisa dipakai tanpa mengetik nama: master-bot menampilkan bot yang tersedia sebagai tombol.

Rincian:
- Berlaku untuk `/stop`, `/restart`, `/new`, `/logs`, `/access`, `/delete`, dan `/revoke` saat dikirim **tanpa argumen sama sekali**. Dengan argumen, semuanya bekerja persis seperti sekarang.
- Tampilan: satu tombol per bot terdaftar berlabel nama bot, urut nama, tiga per baris, lalu satu baris terakhir berisi tombol `cancel`. Contoh untuk tiga bot: `[bot-01] [bot-02] [bot-03]` lalu `[cancel]`. Pesannya menyebut perintah apa yang sedang dipilihkan.
- Semua bot terdaftar ditampilkan, apa pun statusnya; perintahnya sendiri yang menjawab kalau tidak cocok (misalnya `/logs` untuk bot yang tidak hidup).
- Menekan nama bot menjalankan perintah itu untuk bot tersebut, dengan hasil yang sama persis seperti mengetik `/perintah <nama>`: `/stop`, `/restart`, `/logs` (20 baris), dan `/access` langsung jalan; `/delete` dan `/new` menampilkan pertanyaan konfirmasinya seperti biasa.
- `/revoke` tanpa argumen: setelah bot dipilih, master-bot menampilkan user_id yang punya akses ke bot itu sebagai tombol (pemilik tidak ditampilkan), dengan tombol `cancel` di baris terakhir. Menekan satu user_id mencabut orang itu, dengan balasan yang sama seperti `/revoke <nama> <user_id>`, lalu selesai. Kalau tidak ada user_id selain pemilik, dijawab bahwa tidak ada yang bisa dicabut.
- `cancel` di langkah mana pun membatalkan: tidak ada yang berubah, dan tombol-tombol di pesan itu hilang.
- Setelah satu tombol ditekan, tombol-tombol di pesan itu hilang dan pesannya menyebut apa yang dipilih.
- Aturan tombol sama dengan tombol konfirmasi `/delete`: sekali pakai, berlaku 5 menit, hanya dilayani dari pemilik di chat pribadinya, terikat pada bot yang ditampilkan saat itu (bot yang sudah dihapus atau didaftarkan ulang dengan nama yang sama tidak dikenai), dan tombol kedaluwarsa, sudah dipakai, atau tak dikenal dijawab `kedaluwarsa` tanpa mengubah apa pun.
- Belum ada bot terdaftar: dijawab bahwa belum ada bot, dengan cara mendaftar, tanpa tombol.
- Tidak berubah: `/register <nama> <token>`, `/allow <nama> <user_id>` (tanpa argumen tetap cara pakai), `/keys <nama> <tombol...>`, `/list`, `/quota`, `/help`.
- `/help` menyebut bahwa nama boleh dikosongkan untuk perintah-perintah itu.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] `/stop`, `/restart`, `/new`, `/logs`, `/access`, `/delete`, dan `/revoke` tanpa argumen menampilkan tombol semua bot terdaftar (urut nama, tiga per baris) dan tombol `cancel` di baris terakhir.
- [ ] Menekan nama bot memberi hasil yang sama dengan mengetik perintah itu dengan nama: `/stop`, `/restart`, `/logs`, `/access` langsung jalan; `/delete` dan `/new` menampilkan konfirmasinya dan tidak mengubah apa pun sebelum dikonfirmasi.
- [ ] `/revoke` tanpa argumen: setelah bot dipilih tampil tombol user_id yang punya akses (tanpa pemilik) dan `cancel`; menekan satu user_id mencabut hanya orang itu di bot itu; tanpa user_id selain pemilik dijawab tidak ada yang bisa dicabut.
- [ ] `cancel` di setiap langkah membatalkan tanpa mengubah apa pun, dan tombolnya hilang.
- [ ] Tombol sekali pakai, kedaluwarsa setelah 5 menit, hanya dilayani dari pemilik di chat pribadinya, dan tidak mengenai bot yang dihapus atau didaftarkan ulang dengan nama yang sama; tombol seperti itu dijawab `kedaluwarsa` tanpa mengubah apa pun.
- [ ] Tanpa bot terdaftar, perintah tanpa argumen dijawab bahwa belum ada bot, tanpa tombol.
- [ ] Perintah dengan argumen, serta `/register`, `/allow`, `/keys`, `/list`, `/quota`, bekerja seperti sekarang; `/allow` tanpa argumen tetap dijawab cara pakai.
- [ ] Ada tes untuk butir-butir di atas, termasuk dengan master-bot sungguhan dan Telegram tiruan, dan seluruh tes tetap lulus.
- [ ] `/help` dan dokumentasi proyek mencatat perilaku ini dan keputusan pemilik.
- [ ] (owner) Di HP: `/logs` tanpa nama menampilkan tombol bot dan `cancel`; menekan satu bot menampilkan layarnya; `/revoke` tanpa argumen menanyakan bot lalu user_id; `cancel` menutup pertanyaan.

## Out of scope

- Tombol untuk `/allow` (pemilik memutuskan tetap diketik).
- Memilih beberapa user_id sekaligus.
- Tombol untuk `/keys`.
