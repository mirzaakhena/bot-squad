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

Catatan pemilik (2026-11-12): Claude Code sudah punya mekanisme bawaan untuk berkirim pesan antarsesi, asalkan session-id sesi tujuan diketahui. Sesi foreman bot-squad sendiri pernah menerima pesan dari sesi lain lewat mekanisme ini. Jadi kemungkinan besar yang perlu dibangun adalah mencatat session-id setiap bot (misalnya di daftar bot), bukan jalur pesan baru. Session-id yang tercatat juga berguna untuk /branch dan /switch (261112230308).

## Request

Sebuah bot bisa mengirim pesan ke bot lain milik pemilik, dan menerima jawabannya, dengan batas yang jelas tentang siapa boleh mengirim ke siapa.

## Done when

- [ ] CLAUDE.md mencatat rancangan, termasuk batasan keamanannya, dan disetujui pemilik sebelum dibangun.
- [ ] Session-id sesi Claude setiap bot tercatat dan tetap benar setelah bot dinyalakan ulang atau memulai percakapan baru.
- [ ] Bot bisa mengirim pesan ke bot lain (memakai mekanisme bawaan Claude Code bila memungkinkan) dan menerima jawaban.
- [ ] Bot hanya menerima pesan dari bot yang diizinkan.
