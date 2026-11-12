---
type: bug
priority: medium
lane: strict
labels: []
blocked_by: []
related: [261112211002]
touches: []
created: 2026-11-12 22:31
---

## Background

Untuk keperluan tes, master-bot membaca variabel lingkungan yang bisa mengganti alamat server Telegram. Kalau variabel itu ter-set di lingkungan produksi, entah tidak sengaja atau karena disusupi, master-bot akan mengirim tokennya ke server lain. Reviewer tiket 261112211002 menilai ini tidak membuka celah baru, tetapi mengusulkan pembatasan.

## Request

Variabel pengganti alamat Telegram hanya boleh menunjuk ke mesin lokal. Kalau variabel itu aktif, pemilik diberi tahu dengan jelas di terminal.

## Done when

- [ ] Alamat selain mesin lokal (localhost, 127.0.0.1, ::1) ditolak: master-bot berhenti dengan pesan jelas sebelum memanggil Telegram, tanpa mencetak token.
- [ ] Saat variabel itu dipakai dengan alamat lokal, terminal menampilkan peringatan bahwa master-bot tidak terhubung ke Telegram sungguhan.
- [ ] Tanpa variabel itu, perilaku master-bot tidak berubah.
- [ ] Ketiga hal di atas dibuktikan dengan tes otomatis.
