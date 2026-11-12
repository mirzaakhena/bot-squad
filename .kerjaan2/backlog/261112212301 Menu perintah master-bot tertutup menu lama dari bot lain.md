---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 21:23
---

## Background

Saat master-bot menyala, ia mendaftarkan menu perintahnya ke Telegram. Token master-bot sebelumnya sempat dipakai sebagai bot uji oleh plugin bot-squad. Plugin itu mendaftarkan menunya sendiri (start, help, status) khusus untuk chat pribadi. Di Telegram, menu khusus chat pribadi mengalahkan menu umum yang didaftarkan master-bot. Akibatnya, di chat pribadi pemilik muncul menu plugin, bukan menu master-bot. /register tidak ada di menu dan ada /status yang tidak dikenal master-bot. Hal yang sama akan terjadi pada setiap token yang pernah dipakai bot lain.

Ditemukan pemilik saat cek manual tiket 261112184704 (2026-11-12).

## How to reproduce

1. Pakai token master-bot sebagai bot uji dengan skrip start bot, lalu matikan bot uji itu.
2. Jalankan master-bot dengan token yang sama.
3. Di chat pribadi dengan master-bot, ketik "/". Menu menampilkan start, help, dan status dengan deskripsi berbahasa Inggris, bukan start, help, dan register milik master-bot.

## Request

Setiap kali master-bot menyala, menu perintah yang dilihat pemilik di chat pribadi harus selalu persis daftar perintah master-bot, apa pun riwayat token itu sebelumnya.

## Done when

- [ ] Setelah master-bot menyala, menu di chat pribadi berisi tepat perintah master-bot (start, help, register) dengan deskripsi master-bot, walaupun token itu sebelumnya pernah dipakai bot lain.
- [ ] Hal ini dibuktikan dengan tes otomatis yang mensimulasikan menu sisa dari bot lain.
- [ ] (owner) Pemilik menyalakan ulang master-bot, mengetik "/" di chat pribadi, dan melihat start, help, dan register.
- [ ] Gagal mendaftarkan menu tetap hanya berupa peringatan dan tidak menghentikan master-bot (kecuali 401/409 seperti sekarang).
