---
type: feature
priority: high
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Bot hanya bisa dimatikan atau dinyalakan ulang lewat terminal server. Bot yang gagal menyala tercatat "failed" dan belum bisa dicoba lagi dari Telegram. Perintah /start tidak dipakai untuk menyalakan bot, karena /start sudah dipakai Telegram sebagai sapaan pertama.

## Request

Pemilik bisa mematikan satu bot dan menyalakannya ulang dari master-bot. Bot yang dimatikan sengaja tercatat berbeda dari bot yang mati karena masalah, supaya nanti tidak dihidupkan otomatis.

## Done when

- [ ] /stop <nama> mematikan sesi bot itu dengan bersih (tanpa server plugin tersisa) dan mencatat statusnya sebagai dihentikan sengaja.
- [ ] /restart <nama> mematikan bot (kalau hidup) lalu menyalakannya lagi, dengan laporan "aktif" atau "gagal" seperti saat registrasi.
- [ ] /restart juga bekerja untuk bot berstatus gagal dan bot yang dihentikan sengaja.
- [ ] Nama yang tidak terdaftar ditolak dengan alasan jelas; bot lain tidak pernah tersentuh.
- [ ] Dua perintah untuk bot yang sama pada saat bersamaan tidak membuat bot berjalan dua kali.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik menghentikan lalu menyalakan ulang satu bot uji dari Telegram, dan bot itu membalas lagi.
