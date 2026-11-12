---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261112230302]
related: []
touches: []
created: 2026-11-12 22:53
---

## Background

Kalau bot mengerjakan sesuatu terlalu lama atau ke arah yang salah, pemilik tidak punya cara menghentikannya selain mematikan bot. Pemilik memutuskan (2026-11-12) bahwa perintah yang mengurus percakapan diketik di chat bot itu sendiri, bukan di master-bot. Mengosongkan konteks (/clear) kini menjadi bagian dari /new (261112230303), jadi tidak lagi masuk tiket ini.

Di mirza-bots (/Users/mirza/Workspace/mirza-bots), menekan tombol di TUI Claude Code butuh wrapper terpisah. Mekanisme untuk bot-squad dirancang di 261112230302.

## Request

Pemilik bisa membatalkan pekerjaan yang sedang berjalan di sebuah bot dengan mengetik /interrupt di chat bot itu, tanpa mematikan bot.

## Done when

- [ ] /interrupt di chat bot membatalkan pekerjaan yang sedang berjalan di sesi Claude bot itu; bot tetap hidup dan menjawab pesan berikutnya.
- [ ] Kalau bot sedang tidak mengerjakan apa pun, balasannya menjelaskan itu dan tidak ada yang rusak.
- [ ] Hanya pengirim yang diizinkan di bot itu yang bisa memakainya.
- [ ] (owner) Pemilik meminta bot uji mengerjakan tugas panjang, mengirim /interrupt, dan bot berhenti lalu tetap menjawab pesan berikutnya.
