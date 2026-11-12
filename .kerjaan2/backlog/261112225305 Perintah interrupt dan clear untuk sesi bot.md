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

Kalau bot mengerjakan sesuatu terlalu lama atau ke arah yang salah, pemilik tidak punya cara menghentikannya selain mematikan bot. Begitu juga kalau pemilik ingin memulai percakapan baru dengan konteks kosong.

## Request

Pemilik bisa membatalkan pekerjaan yang sedang berjalan di sebuah bot, dan bisa mengosongkan konteks percakapannya, tanpa mematikan bot.

## Done when

- [ ] /interrupt <nama> membatalkan pekerjaan yang sedang berjalan di sesi bot itu; bot tetap hidup dan bisa diajak bicara lagi.
- [ ] /clear <nama> mengosongkan konteks percakapan bot itu; bot tetap hidup.
- [ ] Kalau bot tidak hidup, balasannya menjelaskan itu.
- [ ] Dibuktikan dengan tes otomatis.
- [ ] (owner) Pemilik meminta bot uji mengerjakan tugas panjang, mengirim /interrupt, dan bot berhenti lalu tetap menjawab pesan berikutnya.
