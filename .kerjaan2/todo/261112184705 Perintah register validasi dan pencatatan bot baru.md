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
- [ ] Nama yang tidak sesuai aturan, nama yang sudah terdaftar, dan token yang tidak valid ditolak dengan alasan yang jelas, dan tidak ada folder atau catatan yang tertinggal.
- [ ] Token yang sudah dipakai bot lain yang terdaftar ditolak.
- [ ] Registrasi yang berhasil membuat folder state dan folder kerja untuk bot itu. Token hanya bisa dibaca oleh pemilik akun mesin.
- [ ] Daftar izin bot baru berisi pemilik saja, tanpa pairing.
- [ ] Bot baru tercatat di daftar bot, dan daftar itu tidak rusak walaupun aplikasi mati di tengah penulisan.
- [ ] Balasan ke pemilik menyebut username Telegram bot yang terdaftar dan tidak pernah memuat token.
- [ ] Semua aturan validasi di atas dibuktikan dengan tes otomatis.

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
