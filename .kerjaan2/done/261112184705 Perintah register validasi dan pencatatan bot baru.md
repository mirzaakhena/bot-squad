---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: [261112184704]
related: []
touches: [master]
created: 2026-11-12 18:47
---

## Background

Pemilik ingin mendaftarkan bot baru dari Telegram dengan mengirim nama bot dan token BotFather ke master-bot. Rancangan yang dibahas bersama pemilik:

- Nama hanya boleh berisi huruf kecil, angka, dan tanda minus, karena nama ini dipakai sebagai nama folder dan nama sesi tmux.
- Token dicek ke Telegram tanpa polling, karena polling dengan token bot akan mengganggu bot itu sendiri.
- Daftar izin bot diisi lebih dulu dengan ID pemilik, sehingga tidak perlu pairing.
- Daftar bot terdaftar menjadi sumber kebenaran master-bot.

Format perintah sudah diputuskan pemilik: satu pesan `/register <nama> <token>`. Nama harus cocok dengan ^[a-z0-9][a-z0-9-]{0,31}$, dan `master` dicadangkan.

## Request

Pemilik bisa mendaftarkan bot baru lewat master-bot. Nama dan token divalidasi, pesan berisi token dihapus dari chat, lalu folder state, folder kerja, dan catatan pendaftaran bot dibuat dengan aman. Menyalakan bot dikerjakan di tiket lain.

## Done when

- [ ] (owner) Setelah pemilik mengirim perintah registrasi, pesan yang berisi token langsung hilang dari chat, baik registrasinya berhasil maupun gagal.
- [x] Nama yang tidak sesuai aturan, nama yang sudah terdaftar, dan token yang tidak valid ditolak dengan alasan yang jelas, dan tidak ada folder atau catatan yang tertinggal.
- [x] Token yang sudah dipakai bot lain yang terdaftar ditolak.
- [x] Registrasi yang berhasil membuat folder state dan folder kerja untuk bot itu. Token hanya bisa dibaca oleh pemilik akun mesin.
- [x] Daftar izin bot baru berisi pemilik saja, tanpa pairing.
- [x] Bot baru tercatat di daftar bot, dan daftar itu tidak rusak walaupun aplikasi mati di tengah penulisan.
- [x] Balasan ke pemilik menyebut username Telegram bot yang terdaftar dan tidak pernah memuat token.
- [x] Semua aturan validasi di atas dibuktikan dengan tes otomatis.

## Out of scope

- Menyalakan sesi tmux.
- Perintah list, stop, delete, dan lainnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Format perintah registrasi belum diputuskan. Pilihan: (a) satu pesan '/register <nama> <token>'; (b) dua langkah: '/register <nama>', lalu master meminta token di pesan berikutnya. Rekomendasi (a): hanya satu pesan yang perlu dihapus, master tidak perlu mengingat percakapan yang menggantung, dan tidak ada pertanyaan soal batas waktu menunggu token. Kalau memilih (b), tolong sebut berapa lama master menunggu token dan apa yang terjadi kalau pemilik mengirim perintah lain di tengahnya.
  → (a) satu pesan '/register <nama> <token>'. (owner, 2026-11-12)
- Q2 [answered] Aturan nama selain huruf kecil, angka, dan '-': berapa panjang maksimumnya, dan apakah boleh diawali '-'? Nama yang diawali '-' akan terbaca sebagai flag oleh tmux dan perintah shell. Rekomendasi: ^[a-z0-9][a-z0-9-]{0,31}$ (1-32 karakter, tidak diawali '-'), dan nama 'master' dicadangkan. Alternatif: tanpa batas panjang dan tanpa nama cadangan.
  → ^[a-z0-9][a-z0-9-]{0,31}$, 'master' dicadangkan. (owner, 2026-11-12)
- Q3 [answered] Folder ~/.bot-squad/bots/<nama> sudah ada di disk tetapi nama itu tidak ada di registry, misalnya uji-01 dari spike. Pilihan: (a) tolak dengan alasan 'folder sudah ada', tanpa mengubah apa pun; (b) ambil alih folder itu dan timpa .env serta access.json-nya. Rekomendasi (a): data yang tidak bisa dipulihkan tidak boleh tertimpa diam-diam. Pemilik bisa menghapus folder itu sendiri kalau memang mau.
  → (a) tolak tanpa mengubah apa pun. (owner, 2026-11-12)
- Q4 [answered] Bagaimana 'token yang sudah dipakai bot lain' dikenali? Rekomendasi: bandingkan ID bot Telegram dari getMe dengan ID yang tersimpan di registry. Dengan begitu, token baru hasil revoke untuk bot yang sama juga dianggap duplikat, dan token tidak perlu disimpan di registry. Token master-bot sendiri juga ditolak. Alternatif: bandingkan string token. Ini mengharuskan semua .env dibaca dan tidak mengenali token hasil revoke.
  → bandingkan ID bot dari getMe, dan token master-bot juga ditolak. (owner, 2026-11-12)
- Q5 [answered] getMe bisa gagal karena token salah, tetapi juga karena jaringan putus, timeout, atau 429/5xx. Rekomendasi: 401/404 dijawab 'token tidak valid'. Jaringan, timeout 10 detik, atau 5xx/429 dijawab 'tidak bisa menghubungi Telegram, coba lagi'. Pada keduanya tidak ada folder atau catatan yang dibuat, dan pesan berisi token tetap dihapus. Alternatif: semua kegagalan dijawab 'token tidak valid'.
  → bedakan penyebab sesuai rekomendasi. (owner, 2026-11-12)
- Q6 [answered] Bagaimana kalau penghapusan pesan berisi token gagal, misalnya karena error jaringan? Pilihan: (a) registrasi tetap diproses, dan pemilik diberi peringatan untuk menghapus pesan itu sendiri; (b) registrasi dibatalkan. Rekomendasi (a): hasil registrasi tidak bergantung pada berhasil-tidaknya penghapusan, dan pemilik tetap tahu bahwa token masih terlihat di chat.
  → (a) lanjut dan beri peringatan. (owner, 2026-11-12)
- Q7 [answered] Bentuk registry.json, yang juga akan dipakai 4706 dan perintah-perintah berikutnya. Rekomendasi: { "bots": { "<nama>": { "telegramId": <angka>, "username": "...", "status": "registered", "createdAt": "<ISO>" } } }. Token tidak pernah masuk registry, hanya ada di state/.env (0600, folder 0700). Penulisan memakai file sementara lalu rename, dan dua /register yang datang bersamaan diproses satu per satu. 4706 menambah status 'active' dan 'failed'. Ada field lain yang ingin dicatat?
  → bentuk registry disetujui tanpa field tambahan. (owner, 2026-11-12)
- Q8 [answered] Perintah registrasi yang salah bentuk (argumen kurang, lebih, atau hanya '/register'). Rekomendasi: balas dengan contoh pemakaian. Pesannya dihapus kalau memuat apa pun selain '/register', karena bisa saja berisi token. Alternatif: pesan salah bentuk tidak dihapus.
  → balas dengan contoh pemakaian, dan hapus pesan kalau memuat argumen. (owner, 2026-11-12)

## Decisions
- Lane strict: menangani token BotFather, izin file, dan registry yang tidak boleh rusak
- Menunggu 4704 (butuh kerangka master-bot). Skema registry.json yang dibuat di sini dipakai 4706
- 2026-11-12 moved to todo: Disetujui pemilik, semua pertanyaan terjawab; menunggu 4704
- Red-proof: aturan nama (pola, panjang 32, awalan '-'), nama cadangan master, nama sudah terdaftar, folder sudah ada, bentuk token, string token master-bot, ID master-bot, ID bot duplikat, 401/404 tidak valid, 5xx/429/jaringan/timeout coba lagi, mode folder 0700 dan .env 0600, access.json allowlist pemilik, pembersihan folder saat gagal, registry rusak ditolak, tulis atomik, hapus file sementara, antrean serial, hapus pesan, hapus hanya bila ada argumen, peringatan hapus gagal, jumlah argumen, penjaga pemilik: semuanya dirusak satu per satu, all red
- getMe untuk token bot baru memakai fetch langsung, bukan grammY: hasilnya hanya jenis kegagalan tanpa pesan error, karena error grammY memuat URL berisi token
- Folder bot dibuat dulu, baru registry ditulis: kalau proses mati di antaranya, yang tertinggal folder tanpa catatan (ditolak dengan alasan 'folder sudah ada', pemilik bisa menghapusnya), bukan catatan tanpa folder yang akan dinyalakan 4706
- Token yang bentuknya bukan token bot ditolak tanpa menghubungi Telegram, supaya teks sembarang tidak pernah masuk ke URL API

## Manual checks
- M1 [waiting] (item 1) 1. Isi ~/.bot-squad/master/.env dengan MASTER_BOT_TOKEN dan OWNER_TELEGRAM_ID, lalu jalankan 'bun run --cwd master start' dari root repo.
  2. Buat bot uji baru di @BotFather dan salin tokennya.
  3. Di chat pribadi dengan master-bot, kirim '/register Salah <token>': pesan itu hilang dari chat dan master-bot membalas 'Nama tidak sesuai aturan'.
  4. Kirim '/register uji-03 <token>': pesan itu hilang dan master-bot membalas 'Bot @<username> terdaftar sebagai uji-03'.
  5. Kirim lagi '/register uji-03 <token>': pesan hilang, balasan 'sudah terdaftar'. Di ketiga kasus tidak ada pesan berisi token yang tersisa di chat.

## Handoff
Menambah /register <nama> <token> di master-bot. master/src/register.ts memvalidasi nama, token (bentuk, getMe lewat fetch tanpa polling, ID master-bot, ID bot duplikat), lalu membuat bots/<nama>/{state,workspace} 0700, state/.env 0600, access.json allowlist pemilik. master/src/registry.ts memegang bentuk registry.json { bots: { nama: { telegramId, username, status, createdAt } } }, menulisnya atomik, dan serialized() mengantrekan semua perubahan; 4706 harus memakai readRegistry/writeRegistry di dalam serialized(), jangan menulis file itu sendiri. Pesan /register yang berargumen selalu dihapus lebih dulu. createMasterBot kini wajib diberi dataDir. Token tidak boleh masuk registry, balasan, atau log.

## Review
- 2026-11-12 strict, round 1, at 162287c: passed.
  1: (owner) tidak memblokir; M1 berisi langkah dari awal (isi .env, jalankan master, buat bot uji, tiga kiriman) dan hasil yang harus terlihat. Penghapusan sendiri terbukti tes: membuang ctx.deleteMessage() membuat 26 tes merah
  2: tes register.test.ts membandingkan isi folder data sebelum/sesudah untuk 8 nama salah, master, nama terdaftar, folder sudah ada, 401/404/bentuk salah, 5xx/429/timeout; mutasi {0,32}, awalan '-', hapus 'master', hapus cek folder, 404 bukan invalid, 5xx jadi invalid, hapus cek bentuk token: semuanya merah
  3: mutasi cek telegramId duplikat, cek ID master-bot, dan cek string token master-bot masing-masing merah
  4: tes stat mode 0700 folder dan 0600 .env; mutasi .env 0644 merah, hapus pembersihan folder saat gagal merah
  5: access.json dicek tepat {allowlist, [pemilik]}; mutasi tambah ID lain dan dmPolicy pairing masing-masing merah
  6: tulis langsung ke registry.json (tanpa tmp+rename) merah, hapus pembersihan tmp merah, hilangkan serialized() merah; tes SIGKILL sebelum rename meninggalkan registry lama
  7: menyisipkan token ke balasan sukses membuat 14 tes merah (pemeriksaan semua panggilan API dan log)
  8: bun test di salinan: 94 pass; 21 mutasi di register.ts, registry.ts, bot.ts semuanya merah
  note: writeRegistry tidak fsync folder setelah rename, jadi saat listrik mati rename bisa hilang (registry tetap utuh, bukan rusak); folder bots/ yang sudah ada tidak di-chmod 0700. Tidak ada skrip/CI lain di repo selain bun test
