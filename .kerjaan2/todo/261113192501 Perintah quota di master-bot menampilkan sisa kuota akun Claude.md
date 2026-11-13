---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112225308]
touches: [master/src/quota.ts, master/src/bot.ts, master/test/quota.test.ts, master/test/menu.test.ts, master/test/run.test.ts, CLAUDE.md]
created: 2026-11-13 19:25
---

## Background

Semua bot memakai satu akun Claude milik pemilik. Riset tiket 261112225308 menyimpulkan bahwa sisa kuota akun bisa dibaca tanpa kredensial akun Claude. Sumbernya data batas pemakaian (5 jam dan 7 hari) yang sudah ditangkap setiap bot untuk `/context` di chat bot. Data itu berlaku untuk seluruh akun, hanya berubah saat ada panggilan ke Claude, dan bisa selisih sekitar 1 poin dari layar /usage. Detailnya ada di bagian "Membaca kuota akun Claude" di CLAUDE.md.

## Request

Pemilik bisa melihat sisa kuota akun Claude dari master-bot dengan satu perintah, tanpa harus membuka chat bot tertentu.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik), termasuk `status.json` bot yang sedang berjalan.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`; soketnya boleh di `/tmp/k2-<id tiket>-*` dan dihapus sesudahnya. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [ ] Perintah /quota di master-bot menampilkan pemakaian 7 hari (dan 5 jam kalau datanya ada): persen terpakai, sisa, kapan pulih, umur data, dan dari bot mana data itu diambil.
- [ ] Data yang dipakai adalah satu tangkapan status.json dengan captured_at_ms paling baru di antara semua bot terdaftar (apa pun statusnya) yang punya minimal satu jendela rate_limits; 5 jam dan 7 hari diambil dari tangkapan itu saja; jendela yang resets_at-nya sudah lewat ditulis 'sudah pulih, angka baru belum ada' tanpa persen (Q1).
- [ ] Bentuk per jendela: persen terpakai, sisa (100 - terpakai), 'pulih dalam <durasi> (<HH:MM> WIB, ditambah tanggal kalau bukan hari ini)'; lalu nama bot sumber dan @username serta umur data (<HH:MM> WIB); kalau umurnya lebih dari 6 jam ditambah catatan 'mungkin basi; kirim pesan ke bot mana saja untuk memperbarui' (Q2).
- [ ] Kalau belum ada bot yang punya data, balasannya mengatakan itu dengan jelas, tanpa angka.
- [ ] /quota hanya membaca: tidak ada berkas, sesi, atau proses yang diubah, dan tidak memakai kredensial akun Claude.
- [ ] Hanya pemilik yang dilayani, sama seperti perintah master-bot lain; /quota muncul di menu master-bot.
- [ ] Ada tes otomatis untuk ketiga keadaan (data ada, data dari beberapa bot dengan umur berbeda, tidak ada data), dan CLAUDE.md menjelaskan perintahnya.
- [ ] (owner) Pemilik mengetik /quota di master-bot dan angkanya masuk akal dibanding /context di chat bot.

## Out of scope

- Endpoint usage OAuth dan kredensial akun Claude (keputusan pemilik di 261112225308 Q1).
- Rincian per model.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Data mana yang dipakai /quota? (a) status.json semua bot di registry, apa pun statusnya (juga stopped/failed), dipilih yang captured_at_ms-nya paling baru di antara yang punya minimal satu jendela rate_limits; 5 jam dan 7 hari diambil dari tangkapan yang sama; jendela yang resets_at-nya sudah lewat ditulis 'sudah pulih, angka baru belum ada' tanpa persen. (b) Per jendela dipilih tangkapan terbaru masing-masing, jadi 5 jam dan 7 hari bisa dari bot berbeda. (c) Hanya bot berstatus active. Rekomendasi (a): satu sumber membuat umur dan nama bot jelas, dan angka akun sama di bot mana pun; angka yang sudah lewat masa pulihnya menyesatkan.
  → Satu tangkapan terbaru (Recommended) = (a) (owner, 2026-11-13)
- Q2 [answered] Bentuk balasan dan data basi? (a) Per jendela: persen terpakai, sisa (100 - terpakai), 'pulih dalam <durasi> (<HH:MM> WIB, ditambah tanggal kalau bukan hari ini)'; lalu 'data dari <nama> (@username), diperbarui <umur> lalu (<HH:MM> WIB)'; kalau umurnya lebih dari 6 jam ditambah catatan 'mungkin basi; kirim pesan ke bot mana saja untuk memperbarui'. (b) Format persis seperti /context di chat bot (bar kemajuan, reset berupa durasi, Last update) plus baris sumber. (c) Seperti (a) tanpa catatan basi. Rekomendasi (a): menjawab kapan pulih dengan jam nyata dan memberi tahu kalau angka sudah lama tidak bergerak (riset 261112225308: angka hanya berubah saat ada panggilan API).
  → Ringkas + tanda basi (Recommended) = (a) (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Folder di bots/ yang tidak terdaftar dan isi archive/ tidak dibaca; status.json dibaca dengan readCapturedStatus dari plugin/context.ts (master/src/statusline.ts sudah mengimpor berkas itu); status.json yang tidak ada dilewati, yang rusak atau tak terbaca dilewati dan dicatat di log master-bot
  Why: Sama dengan /list dan /logs: hanya bot terdaftar yang dikelola, kesalahan baca dicatat di log, satu pembaca berkas untuk plugin dan master
  If wrong: Tambahkan bot tak terdaftar atau sebutkan berkas rusak di balasan
- A2 [unseen] /quota tidak memakai BotLocks dan tidak memeriksa sesi tmux; hanya membaca registry dan status.json
  Why: Sama dengan /logs dan /list yang hanya membaca
  If wrong: Tambahkan cek keadaan bot ke balasan

## Decisions
- Lane standard: perintah baru yang hanya membaca status.json, mudah dibatalkan, tanpa data yang tak bisa dipulihkan
- Tidak solo dan tidak menunggu: hanya menambah satu perintah; bentrok COMMANDS di menu.test.ts/run.test.ts dengan 261113194401 diselesaikan antrean merge
