---
type: feature
priority: low
lane: standard
labels: []
blocked_by: [261112230302]
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

Di mirza-bots, /branch menampilkan pohon silsilah sesi beserta tombol pindah, /branch <nama> membuat cabang, dan /switch menampilkan daftar semua sesi beserta tombol pindah. Ini baru bernilai setelah /new dan /rename dipakai rutin.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Pemilik bisa melihat sesi-sesi lama sebuah bot dan pindah ke salah satunya dari chat bot.

## Done when

- [ ] Ada perintah di chat bot yang menampilkan sesi-sesi bot itu (dengan nama) beserta tombol untuk pindah.
- [ ] Menekan tombol membuat bot melanjutkan sesi yang dipilih, dengan konteksnya.
- [ ] Ada cara membuat cabang dari sesi yang sedang berjalan.
- [ ] (owner) Pemilik pindah ke sesi lama dan bot mengingat percakapan di sesi itu.
