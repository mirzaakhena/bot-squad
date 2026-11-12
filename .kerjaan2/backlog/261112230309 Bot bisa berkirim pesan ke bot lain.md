---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

mirza-bots punya fitur bot berbicara dengan bot lain (bagian "Bicara ke bot lain" di README-nya). Di bot-squad belum ada, dan ini fitur besar tersendiri. Lane strict karena setiap bot berjalan dengan izin bebas, sehingga pesan antarbot bisa menjadi jalan menyuruh bot lain menjalankan apa saja.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Sebuah bot bisa mengirim pesan ke bot lain milik pemilik, dan menerima jawabannya, dengan batas yang jelas tentang siapa boleh mengirim ke siapa.

## Done when

- [ ] CLAUDE.md mencatat rancangan, termasuk batasan keamanannya, dan disetujui pemilik sebelum dibangun.
- [ ] Bot bisa mengirim pesan ke bot lain dan menerima jawaban.
- [ ] Bot hanya menerima pesan dari bot yang diizinkan.
