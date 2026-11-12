---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: [261112184704]
related: []
touches: []
created: 2026-11-12 18:47
---

## Background

Pemilik ingin mendaftarkan bot baru dari Telegram dengan mengirim nama bot dan token BotFather ke master-bot. Rancangan yang dibahas bersama pemilik:

- Nama hanya boleh berisi huruf kecil, angka, dan tanda minus, karena nama ini dipakai sebagai nama folder dan nama sesi tmux.
- Token dicek ke Telegram tanpa polling, karena polling dengan token bot akan mengganggu bot itu sendiri.
- Daftar izin bot diisi lebih dulu dengan ID pemilik, sehingga tidak perlu pairing.
- Daftar bot terdaftar menjadi sumber kebenaran master-bot.

Format perintahnya masih rancangan: `/register <nama> <token>` dalam satu pesan. Pemilik belum memutuskan apakah formatnya tetap satu pesan atau dibuat dua langkah.

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
