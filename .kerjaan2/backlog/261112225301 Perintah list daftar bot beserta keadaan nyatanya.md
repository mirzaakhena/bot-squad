---
type: feature
priority: high
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Saat ini pemilik tidak bisa melihat bot apa saja yang terdaftar tanpa membuka file di server. Status di daftar bot juga bisa berbeda dari kenyataan. Contohnya, bot yang sesinya dimatikan manual tetap tercatat "active".

## Request

Pemilik bisa melihat semua bot terdaftar dari master-bot, lengkap dengan status yang tercatat dan apakah bot itu benar-benar sedang hidup.

## Done when

- [ ] /list menampilkan setiap bot terdaftar: nama, @username Telegram, status tercatat, dan apakah sesinya benar-benar hidup saat itu.
- [ ] Bot yang tercatat aktif tetapi sesinya mati ditandai jelas sebagai tidak cocok.
- [ ] Kalau belum ada bot terdaftar, balasannya menjelaskan itu dan menyebut cara mendaftar.
- [ ] Token tidak pernah muncul di balasan.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik mengirim /list dan melihat bot-botnya sesuai keadaan sebenarnya.
