---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261112230302]
related: []
touches: []
created: 2026-11-12 23:03
---

## Background

Selain perintah yang dibuat khusus, pemilik kadang ingin menjalankan slash Claude Code lain di sesi bot (mis. /compact, /model). Di mirza-bots, slash yang tidak dikenal mendapat tombol Kirim/Batal lebih dulu, karena sebagian slash interaktif dan bisa membuat sesi menggantung.

Rujukan: aplikasi bot lama pemilik di /Users/mirza/Workspace/mirza-bots (README.md, bagian "Slash command dari Telegram"). Mekanisme di sana (wrapper yang mengetik ke TUI lewat folder slash/) tidak ada di bot-squad, jadi perlu disesuaikan, bukan disalin.

## Request

Slash yang tidak dikenal di chat bot tidak dikirim sebagai pesan biasa, melainkan ditawarkan untuk dijalankan di sesi Claude dengan konfirmasi.

## Done when

- [ ] Slash yang tidak dikenal mendapat tombol Kirim/Batal; tanpa menekan Kirim tidak ada yang dijalankan.
- [ ] Setelah Kirim, slash itu dijalankan di sesi Claude bot itu, dan pengirim diberi tahu.
- [ ] Konfirmasi yang terlalu lama tidak ditekan tidak bisa lagi menjalankan perintah basi.
- [ ] Hanya pengirim yang diizinkan yang bisa memicu dan mengonfirmasi.
- [ ] Dibuktikan dengan tes otomatis.
