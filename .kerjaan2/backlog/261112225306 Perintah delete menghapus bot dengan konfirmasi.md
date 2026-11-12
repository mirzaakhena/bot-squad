---
type: feature
priority: medium
lane: strict
labels: []
blocked_by: [261112225302]
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Bot yang tidak dipakai lagi saat ini hanya bisa dihapus dengan mengedit daftar bot dan menghapus foldernya secara manual di server, seperti yang dilakukan pemilik untuk uji-03.

## Request

Pemilik bisa menghapus sebuah bot dari master-bot. Karena tidak bisa dibatalkan, penghapusan harus dikonfirmasi lebih dulu, dan hasil kerja bot di workspace tidak langsung hilang.

## Done when

- [ ] /delete <nama> meminta konfirmasi lewat tombol sebelum melakukan apa pun; tanpa konfirmasi tidak ada yang berubah.
- [ ] Setelah dikonfirmasi, bot dimatikan, dihapus dari daftar bot, dan foldernya tidak lagi berada di tempat bot aktif.
- [ ] Workspace bot diarsipkan, tidak dihapus permanen; balasan menyebut di mana arsipnya.
- [ ] Token bot tidak ikut tersimpan di arsip.
- [ ] Nama itu bisa didaftarkan lagi setelah dihapus.
- [ ] Dibuktikan dengan tes otomatis.
