---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Untuk tahu bot sedang mengerjakan apa atau macet di mana, pemilik harus masuk ke server dan membuka sesi tmux. Isi layar bisa memuat hal sensitif, tetapi master-bot hanya melayani pemilik, jadi menurut pemilik itu dapat diterima.

## Request

Pemilik bisa melihat bagian terakhir layar sesi sebuah bot langsung dari master-bot.

## Done when

- [ ] /logs <nama> menampilkan baris-baris terakhir layar sesi bot itu (tanpa baris kosong) dalam blok kode yang muat di satu pesan Telegram.
- [ ] Pemilik bisa meminta jumlah baris tertentu, dengan batas wajar.
- [ ] Kalau bot tidak hidup, balasannya menjelaskan itu.
- [ ] Token dan isi file .env bot tidak pernah ikut terkirim, walaupun tampil di layar.
- [ ] Dibuktikan dengan tes otomatis.
