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

- [x] `/stop`, `/restart`, `/new`, `/logs`, `/access`, `/delete`, dan `/revoke` tanpa argumen menampilkan tombol semua bot terdaftar (urut nama, tiga per baris) dan tombol `cancel` di baris terakhir.
- [x] Menekan nama bot memberi hasil yang sama dengan mengetik perintah itu dengan nama: `/stop`, `/restart`, `/logs`, `/access` langsung jalan; `/delete` dan `/new` menampilkan konfirmasinya dan tidak mengubah apa pun sebelum dikonfirmasi.
- [x] `/revoke` tanpa argumen: setelah bot dipilih tampil tombol user_id yang punya akses (tanpa pemilik) dan `cancel`; menekan satu user_id mencabut hanya orang itu di bot itu; tanpa user_id selain pemilik dijawab tidak ada yang bisa dicabut.
- [x] `cancel` di setiap langkah membatalkan tanpa mengubah apa pun, dan tombolnya hilang.
- [x] Tombol sekali pakai, kedaluwarsa setelah 5 menit, hanya dilayani dari pemilik di chat pribadinya, dan tidak mengenai bot yang dihapus atau didaftarkan ulang dengan nama yang sama; tombol seperti itu dijawab `kedaluwarsa` tanpa mengubah apa pun.
- [x] Tanpa bot terdaftar, perintah tanpa argumen dijawab bahwa belum ada bot, tanpa tombol.
- [x] Perintah dengan argumen, serta `/register`, `/allow`, `/keys`, `/list`, `/quota`, bekerja seperti sekarang; `/allow` tanpa argumen tetap dijawab cara pakai.
- [x] Ada tes untuk butir-butir di atas, termasuk dengan master-bot sungguhan dan Telegram tiruan, dan seluruh tes tetap lulus.
- [x] `/help` dan dokumentasi proyek mencatat perilaku ini dan keputusan pemilik.
- [ ] (owner) Di HP: `/logs` tanpa nama menampilkan tombol bot dan `cancel`; menekan satu bot menampilkan layarnya; `/revoke` tanpa argumen menanyakan bot lalu user_id; `cancel` menutup pertanyaan.

## Out of scope

- Tombol untuk `/allow` (pemilik memutuskan tetap diketik).
- Memilih beberapa user_id sekaligus.
- Tombol untuk `/keys`.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Setelah tombol ditekan, pesan pertanyaan diganti seluruhnya dengan apa yang dipilih ('/logs: dipilih bot-01.' atau '/logs dibatalkan. Tidak ada yang diubah.'), bukan ditambahi di bawah teks lama
  Why: Tiket meminta tombol hilang dan pesannya menyebut pilihan; satu editMessageText melakukan keduanya dan chat jadi ringkas
  If wrong: Ubah teks di pickedBotText/pickedUserText/pickCancelledText di master/src/picker.ts
  Confirmed by owner, 2026-11-15
- A2 [confirmed] Kalau bot terdaftar (atau user_id) lebih dari 99, hanya 99 pertama yang jadi tombol dan pesannya menyuruh mengetik nama untuk sisanya
  Why: Telegram membatasi 100 tombol per pesan, satu dipakai cancel
  If wrong: Ganti PICK_MAX di master/src/picker.ts atau tambahkan halaman
  Confirmed by owner, 2026-11-15
- A3 [confirmed] Tombol pemilih hilang kalau master-bot dinyalakan ulang (dijawab kedaluwarsa), sama seperti tombol konfirmasi /delete
  Why: Catatan tombol disimpan di memori, mengikuti mekanisme konfirmasi yang ada
  If wrong: Simpan catatan pemilih ke berkas di folder data
  Confirmed by owner, 2026-11-15

## Manual checks
- M1 [waiting] (item 10) 1. Nyalakan ulang master-bot (bun run --cwd master start) supaya kode baru dipakai.
  2. Di HP, kirim /logs ke master-bot: muncul 'Pilih bot untuk /logs:' dengan tombol bot (tiga per baris) dan cancel di baris terakhir.
  3. Tekan satu bot: pesan berubah menjadi '/logs: dipilih <nama>' tanpa tombol, lalu layar bot itu tampil.
  4. Kirim /revoke: pilih bot, lalu muncul tombol user_id (tanpa ID pemilik) dan cancel; kalau bot itu hanya berisi pemilik, jawabannya 'Tidak ada yang bisa dicabut'.
  5. Kirim /stop lalu tekan cancel: pesan menjadi '/stop dibatalkan. Tidak ada yang diubah.' dan tombolnya hilang.

## Handoff
Perintah /stop, /restart, /new, /logs, /access, /delete, /revoke tanpa argumen kini menampilkan pemilih bot (master/src/picker.ts). Di master/src/bot.ts, perintah satu-nama didaftarkan lewat named(command, usage, run): run yang sama masuk tabel actions dan dipanggil dari tombol, jadi jangan kembali ke bot.command langsung atau menyalin penangan. /revoke memakai changeAndReply, /logs memakai showLogs. Data tombol hanya pick:<id>:<nomor>; pilihan dicek ulang ke registry (telegramId+createdAt) saat ditekan. Penangan pick: harus didaftarkan sebelum penangan callback umum. /allow, /keys, /register tanpa argumen tetap cara pakai. /delete dan /new dari tombol tetap lewat askConfirm.

## Review
- 2026-11-15 standard, round 1, at 9629060: passed.
  1: picker.test.ts lulus untuk ketujuh perintah (4 bot: [pk-a pk-b pk-c] [nama 32 karakter] [cancel]); mutasi 4 per baris di salinan membuat 9 tes gagal.
  2: tes 'menekan = mengetik' lulus; mutasi 'delete lewat tombol langsung menghapus' membuat 3 tes gagal. Skrip saya: menekan bot di /delete hanya menampilkan Hapus/Batal, folder data tidak berubah.
  3: tes /revoke dua langkah lulus (juga di main.ts sungguhan); mutasi 'pemilik ikut tampil' membuat 3 tes gagal. Skrip saya: access.json diganti di antara dua langkah dijawab 'memang tidak punya akses' tanpa menulis; hanya pemilik: tidak ada yang bisa dicabut.
  4: tes cancel untuk ketujuh perintah dan langkah user_id lulus; editMessageText tanpa reply_markup, folder data sama, tombol lama kedaluwarsa.
  5: mutasi tanpa cek identitas (8 gagal), tanpa kedaluwarsa (2), tidak sekali pakai (10). Skrip saya: tiga ketukan bersamaan hanya satu stop; bukan pemilik, grup, tanpa message: 0 panggilan API, tidak ada perubahan.
  6: tes registry kosong lulus untuk ketujuh perintah (PICK_NO_BOTS, tanpa reply_markup).
  7: 53 perintah (nama tak sah, tak terdaftar, bot terkunci, /allow, /keys, /register, /list, /quota) di salinan main dan worktree: balasan, keyboard, stop/launch, dan folder data identik. Tujuh kasus tes yang dibuang hanya 'tanpa argumen'; /allow kosong tetap diuji dan gagal saat dimutasi.
  8: picker.test.ts, picker-process.test.ts dan lima berkas tes lama yang diubah: 274 lulus, 0 gagal lewat k2 test; suite penuh tidak diulang (lulus pada a5bffacc7f menurut brief).
  9: dibaca: helpText memuat HELP_PICKER_NOTE (dites), docs/master-bot.md butir 'Pemilih bot lewat tombol' dengan keputusan pemilik 2026-11-15, daftar perintah CLAUDE.md (137 baris).
  10: (owner) M1 berisi langkah dari awal sampai yang harus terlihat.
  note: registry berisi nama tak sah (mis. '../luar') tampil sebagai tombol dan pekerjaannya jalan lewat tombol, padahal diketik ditolak; hanya pada registry yang diedit tangan, dicatat sebagai F1.

## Follow-ups
- F1 [ticketed] Pemilih bot (master/src/picker.ts) menampilkan semua kunci registry.json sebagai tombol, juga nama yang tidak lolos NAME_RULE (mis. '../luar' di registry yang diedit tangan). Perintah yang diketik menolaknya dengan cara pakai, tetapi lewat tombol pekerjaannya jalan: /stop mencatat 'stopped', /restart dan /new memanggil penyalaan, /access dan /revoke membaca atau menulis access.json di luar bots/. stop.ts, launch.ts, delete.ts sungguhan menolak nama tak sah sendiri, jadi dampaknya terbatas. Usul: pemilih tidak menampilkan atau menolak nama yang tidak lolos NAME_RULE, dengan tes registry berisi kunci '../x'.
  → 261115210901
