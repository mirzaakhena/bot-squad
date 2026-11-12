---
type: bug
priority: medium
lane: strict
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-12 21:10
---

## Background

master-bot dijalankan dengan satu token. Telegram hanya mengizinkan satu penerima pesan per token. Saat review terbukti bahwa kalau master-bot dijalankan untuk kedua kalinya, Telegram menolak instance yang lama, bukan yang baru. Akibatnya master-bot yang sedang berjalan berhenti dengan pesan "sudah berjalan di tempat lain", sementara instance baru diam-diam mengambil alih. Pesan itu menyesatkan, dan pemilik bisa kehilangan master-bot yang selama ini berjalan tanpa sadar.

## Request

Menjalankan master-bot kedua kalinya di mesin yang sama harus langsung ditolak oleh instance yang baru, sementara yang lama tetap berjalan. Kalau Telegram tetap melaporkan bentrok, misalnya karena master-bot dijalankan di mesin lain, pesannya harus menjelaskan apa yang sebenarnya terjadi.

## Done when

- [ ] Menjalankan master-bot kedua di mesin yang sama langsung berhenti dengan pesan jelas bahwa master-bot sudah berjalan. Instance pertama tetap berjalan.
- [ ] Kalau master-bot sebelumnya mati mendadak, master-bot bisa dijalankan lagi tanpa langkah manual.
- [ ] Pesan untuk bentrok dari Telegram menjelaskan bahwa proses ini digantikan oleh master-bot lain, bukan sekadar "sudah berjalan di tempat lain".
- [ ] Token tidak pernah muncul di pesan mana pun.
- [ ] Perilaku di atas dibuktikan dengan tes otomatis.
